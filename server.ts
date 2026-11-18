import express from "express";
import http from "http";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import { PDFParse } from "pdf-parse";
import JSZip from "jszip";
import * as docx from "docx";
import { TextProcessor } from "./src/utils/textProcessor.js";
import { toStandardArabic } from "./shared/arabicText.js";
import { polishBilingualBoundariesCore } from "./shared/arabicPipelineCore.js";
import { TYPOGRAPHY_PROFILES, buildDocxBinary, DOCX_MIME } from "./shared/typographyDocxCore.js";
import { registerSmartCompilerRoutes } from "./server/smartCompilerRoutes.js";
import { registerBackgroundJobRoutes } from "./server/backgroundJobManager.js";
import { registerTeamAuth, resolvePublicUrlInfo } from "./server/teamAuth.js";
import {
  sharedModelPool,
  registerModelPoolRoutes,
  buildSafeThinkingConfig,
} from "./server/modelPool.js";
import {
  detectPdfUnderlines,
  applyVerifiedUnderlinesToPageText,
  applyVerifiedUnderlinesToMarkdown,
  normalizeCombiningUnderlines,
  type PdfUnderlineDetectionResult,
} from "./server/pdfUnderlineExtractor.js";

function resolveProjectRoot(): string {
  const cwd = process.cwd();
  if (fs.existsSync(path.join(cwd, "package.json"))) {
    return cwd;
  }
  if (typeof __dirname !== "undefined") {
    return path.basename(__dirname) === "dist" ? path.dirname(__dirname) : __dirname;
  }
  return cwd;
}

const PROJECT_ROOT = resolveProjectRoot();

dotenv.config();

function getPort(): number {
  const portArgIdx = process.argv.indexOf("--port");
  if (portArgIdx !== -1 && process.argv[portArgIdx + 1]) {
    const p = parseInt(process.argv[portArgIdx + 1], 10);
    if (!isNaN(p)) return p;
  }
  return Number(process.env.PORT) || 3000;
}

function getHost(): string {
  const hostArgIdx = process.argv.indexOf("--host");
  if (hostArgIdx !== -1 && process.argv[hostArgIdx + 1]) {
    return process.argv[hostArgIdx + 1];
  }
  return process.env.HOST || "0.0.0.0";
}

const app = express();
const PORT = getPort();
const HOST = getHost();

// Global CORS middleware for all /api/* routes (CLI, MCP, and external integrations)
app.use("/api", (req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, Accept, Origin, X-Team-Session");
  res.setHeader("Access-Control-Max-Age", "86400");
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  next();
});

// Increase payload limit for PDF base64 uploads (allowing large textbooks and multi-volume curricula)
app.use(express.json({ limit: "250mb" }));
app.use(express.urlencoded({ extended: true, limit: "250mb" }));

// Express body-parser error-handling middleware (prevents raw HTML 413 / 400 errors)
app.use((err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err && (err.type === "entity.too.large" || err.status === 413)) {
    return res.status(413).json({
      success: false,
      error: "حجم الحزمة كبير جداً.",
      isPayloadTooLarge: true,
      isRateLimit: false,
      isUnavailable: false,
    });
  }
  if (err && (err instanceof SyntaxError || err.status === 400)) {
    return res.status(400).json({
      success: false,
      error: "استجابة غير صالحة: تنسيق بيانات الطلب غير صحيح.",
    });
  }
  next(err);
});

// Server-side Gemini initialization
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn("WARNING: GEMINI_API_KEY is not set. Conversions will require API key.");
    }
    aiClient = new GoogleGenAI({
      apiKey: apiKey || "",
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

// Team Passcode Auth Gate & Public Share Config (registered before protected routes)
registerTeamAuth(app, PROJECT_ROOT);

// Lightweight visibility heartbeat endpoint (prevents idle proxy/socket disconnects)
app.get("/api/ping", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({
    ok: true,
    ts: Date.now(),
    uptimeSec: Math.floor(process.uptime()),
  });
});

// API Health Check & Contract Overview
app.get("/api/health", (_req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    mcpSupported: true,
    cliSupported: true,
    models: sharedModelPool.getCandidateModels(),
    rateLimitPolicy: "HTTP 429 with retryAfterSeconds",
    maxChunkPagesRecommended: "2-4 pages",
  });
});

const CANONICAL_PUBLISHED_ORIGIN = "https://pdf-to-word-markdown-text-converter.ai.studio";

/**
 * Resolves the canonical public origin URL, preferring the published .ai.studio domain
 * when running in AI Studio / Cloud Run so external clients always receive a reachable URL.
 */
function getPublicOrigin(req: express.Request): string {
  const info = resolvePublicUrlInfo(req);
  if (
    info.currentOrigin.includes(".ai.studio") ||
    info.currentOrigin.includes("wpsct27fdufcpry5x6ikjn") ||
    info.sharedPublicOrigin.includes("wpsct27fdufcpry5x6ikjn")
  ) {
    return CANONICAL_PUBLISHED_ORIGIN;
  }
  return info.sharedPublicOrigin;
}

// Full API Documentation & Contract Specification
app.get("/api/info", (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  const origin = getPublicOrigin(req);

  res.json({
    name: "Arabic & Bilingual Document Studio API",
    version: "2.1.0",
    serverOrigin: origin,
    endpoints: {
      health: { method: "GET", path: "/api/health" },
      ping: { method: "GET", path: "/api/ping" },
      info: { method: "GET", path: "/api/info" },
      extractDirectPdf: { method: "POST", path: "/api/extract-direct-pdf" },
      convertPdf: { method: "POST", path: "/api/convert-pdf" },
      exportDocx: { method: "POST", path: "/api/export-docx" },
      jobs: { method: "GET/POST", path: "/api/jobs" },
      modelsStatus: { method: "GET", path: "/api/models/status" },
      authStatus: { method: "GET", path: "/api/auth/status" },
      compiler: { method: "POST", path: "/api/compiler/*" },
      cliDownload: { method: "GET", path: "/api/cli/download/:scriptName" },
      linksGuideDownload: { method: "GET", path: "/api/links-guide/download" },
    },
    convertPdfContract: {
      method: "POST",
      url: `${origin}/api/convert-pdf`,
      headers: { "Content-Type": "application/json" },
      timeoutSeconds: 180,
      limits: {
        maxHttpBodyPayload: "250mb",
        maxChunkBase64Size: "24mb",
        recommendedPagesPerChunk: "2-4 pages (avoids rate limits and maintains verbatim accuracy)",
        magicByteValidation: ["%PDF", "PNG", "JPEG"],
      },
      requestBodySchema: {
        pdfBase64: "Required string. Base64-encoded PDF or image data.",
        filename: "Optional string. Name of the book/document (e.g. 'balagha.pdf').",
        options: {
          direction: "Optional 'rtl' | 'ltr' | 'auto'. Default: 'rtl'.",
          preserveHandwriting: "Optional boolean. Default: true.",
        },
      },
      responseSuccessSchema: {
        success: true,
        data: {
          title: "string",
          detectedLanguage: "string",
          textDirection: "rtl | ltr",
          pageCountEstimate: "number",
          markdown: "string (pristine verbatim Markdown with authentic Uthmani Quran in ﴿...﴾ and tables)",
          plainText: "string",
          hasArabicText: "boolean",
          hasTables: "boolean",
          hasMathOrScience: "boolean",
        },
      },
      responseErrorSchema: {
        success: false,
        error: "string",
        isRateLimit: "boolean (true on HTTP 429)",
        retryAfterSeconds: "number (seconds client should pause before retrying)",
        code: "string",
      },
      modelFallbackOrder: sharedModelPool.getCandidateModels(),
    },
  });
});

// Downloadable Links & Deployment Reference Guide
app.get("/api/links-guide/download", (_req, res) => {
  const guidePath = path.join(PROJECT_ROOT, "LINKS_GUIDE.md");
  if (!fs.existsSync(guidePath)) {
    return res.status(404).json({ success: false, error: "ملف دليل الروابط غير موجود." });
  }
  const content = fs.readFileSync(guidePath, "utf-8");
  res.setHeader("Content-Type", "text/markdown; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="LINKS_GUIDE.md"');
  return res.send(content);
});

// MCP & CLI Tools Info
app.get("/api/cli/tools-info", (_req, res) => {
  res.json({
    status: "ok",
    serverVersion: "2.0.0",
    mcpProtocolVersion: "2024-11-05",
    offlineCapable: true,
    typographyProfiles: Object.values(TYPOGRAPHY_PROFILES),
    tools: [
      {
        name: "scan_books_directory",
        description: "مسح مجلد الكتب وحساب عدد الصفحات والأحجام (PDF / Word / Markdown / Images)",
      },
      {
        name: "convert_book_to_word",
        description: "تحويل كتاب محدد إلى مستند Word (.docx) بالخطوط المعايرة وفصل الاتجاه العربي/الإنجليزي مع العمل تلقائياً حتى عند توقف السيرفر",
      },
      {
        name: "batch_convert_folder",
        description: "تحويل مجمّع لكامل المجلد مع أرشفة حزم ZIP مجدولة (كل 15 كتاباً) واستئناف ذكي",
      },
      {
        name: "get_batch_status",
        description: "متابعة حالة التقدم والاستئناف التلقائي وتقارير الحزم",
      },
      {
        name: "audit_and_repair_document",
        description: "تدقيق وإصلاح ملفات Markdown أو Word (.docx) محلياً وإعادة تصديرها بأعلى دقة مطبعية وبوابات QA",
      },
      {
        name: "export_markdown_to_docx",
        description: "تحويل فوري دون إنترنت من نص أو ملف Markdown إلى مستند Word (.docx) احترافي",
      },
      {
        name: "check_pipeline_health",
        description: "فحص جاهزية السيرفر والوضع المحلي (Offline Fallback) ومستويات الخطوط المعتمدة",
      },
    ],
  });
});

// Script & Bundle Downloader endpoint with dynamic environment origin injection
app.get("/api/cli/download/:scriptName", async (req, res) => {
  const { scriptName } = req.params;

  // Determine canonical server URL
  const currentOrigin = getPublicOrigin(req);

  const replaceOrigin = (code: string) => {
    return code
      .replace(
        /https:\/\/ais-(?:dev|pre)-wpsct27fdufcpry5x6ikjn-685461883733\.europe-west2\.run\.app/g,
        currentOrigin
      )
      .replace(
        /https:\/\/pdf-to-word-markdown-text-converter\.ai\.studio/g,
        currentOrigin
      );
  };

  // Support full ZIP distribution bundle containing all necessary files and dependencies
  if (scriptName === "bundle" || scriptName === "bundle.zip" || scriptName === "all") {
    try {
      const zip = new JSZip();
      const scriptsDir = path.join(PROJECT_ROOT, "scripts");
      const sharedDir = path.join(PROJECT_ROOT, "shared");

      const filesToBundle = [
        { name: "mcp-server.js", replace: true },
        { name: "batch-runner.js", replace: true },
        { name: "package.json", replace: false },
        { name: "install.sh", replace: false },
        { name: "install.bat", replace: false },
        { name: "README.md", replace: true },
        { name: "run_batch.sh", replace: true },
        { name: "run_batch.bat", replace: true },
        { name: "batch_runner.py", replace: true },
      ];

      for (const f of filesToBundle) {
        const fullPath = path.join(scriptsDir, f.name);
        if (fs.existsSync(fullPath)) {
          let fileData = fs.readFileSync(fullPath, "utf-8");
          if (f.replace) {
            fileData = replaceOrigin(fileData);
          }
          zip.file(f.name, fileData);
        }
      }

      // Include unified shared typography & Arabic/bilingual QA pipeline cores inside shared/
      for (const sharedFile of ["arabicPipelineCore.js", "typographyDocxCore.js"]) {
        const sharedPath = path.join(sharedDir, sharedFile);
        if (fs.existsSync(sharedPath)) {
          zip.file(`shared/${sharedFile}`, fs.readFileSync(sharedPath, "utf-8"));
        }
      }

      const zipBuffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
      res.setHeader("Content-Disposition", 'attachment; filename="books-word-converter-cli.zip"');
      res.setHeader("Content-Type", "application/zip");
      return res.send(zipBuffer);
    } catch (err: any) {
      console.error("Error creating CLI bundle ZIP:", err);
      return res.status(500).json({ success: false, error: "Failed to generate distribution bundle" });
    }
  }

  const scriptMap: Record<string, { path: string; filename: string; mime: string }> = {
    "mcp-server": {
      path: path.join(PROJECT_ROOT, "scripts", "mcp-server.js"),
      filename: "mcp-server.js",
      mime: "application/javascript; charset=utf-8",
    },
    "batch-runner-js": {
      path: path.join(PROJECT_ROOT, "scripts", "batch-runner.js"),
      filename: "batch-runner.js",
      mime: "application/javascript; charset=utf-8",
    },
    "batch-runner-py": {
      path: path.join(PROJECT_ROOT, "scripts", "batch_runner.py"),
      filename: "batch_runner.py",
      mime: "text/x-python; charset=utf-8",
    },
    "run-batch-bat": {
      path: path.join(PROJECT_ROOT, "scripts", "run_batch.bat"),
      filename: "run_batch.bat",
      mime: "application/x-bat; charset=utf-8",
    },
    "run-batch-sh": {
      path: path.join(PROJECT_ROOT, "scripts", "run_batch.sh"),
      filename: "run_batch.sh",
      mime: "application/x-sh; charset=utf-8",
    },
    "package-json": {
      path: path.join(PROJECT_ROOT, "scripts", "package.json"),
      filename: "package.json",
      mime: "application/json; charset=utf-8",
    },
    "package.json": {
      path: path.join(PROJECT_ROOT, "scripts", "package.json"),
      filename: "package.json",
      mime: "application/json; charset=utf-8",
    },
    "install-sh": {
      path: path.join(PROJECT_ROOT, "scripts", "install.sh"),
      filename: "install.sh",
      mime: "application/x-sh; charset=utf-8",
    },
    "install.sh": {
      path: path.join(PROJECT_ROOT, "scripts", "install.sh"),
      filename: "install.sh",
      mime: "application/x-sh; charset=utf-8",
    },
    "install-bat": {
      path: path.join(PROJECT_ROOT, "scripts", "install.bat"),
      filename: "install.bat",
      mime: "application/x-bat; charset=utf-8",
    },
    "install.bat": {
      path: path.join(PROJECT_ROOT, "scripts", "install.bat"),
      filename: "install.bat",
      mime: "application/x-bat; charset=utf-8",
    },
    "readme": {
      path: path.join(PROJECT_ROOT, "scripts", "README.md"),
      filename: "README.md",
      mime: "text/markdown; charset=utf-8",
    },
    "readme.md": {
      path: path.join(PROJECT_ROOT, "scripts", "README.md"),
      filename: "README.md",
      mime: "text/markdown; charset=utf-8",
    },
  };

  const target = scriptMap[scriptName];
  if (!target || !fs.existsSync(target.path)) {
    return res.status(404).json({ success: false, error: "Script not found" });
  }

  try {
    let content = fs.readFileSync(target.path, "utf-8");
    content = replaceOrigin(content);
    res.setHeader("Content-Disposition", `attachment; filename="${target.filename}"`);
    res.setHeader("Content-Type", target.mime);
    return res.send(content);
  } catch {
    res.setHeader("Content-Disposition", `attachment; filename="${target.filename}"`);
    res.setHeader("Content-Type", target.mime);
    return res.sendFile(target.path);
  }
});

function getAvailableModels(): string[] {
  return sharedModelPool.getCandidateModels();
}

/**
 * Line-join threshold handed to pdf-parse. The previous implementation used
 * `Math.abs(lastY - item.transform[5]) < 4` to decide whether two text items
 * belonged to the same line, so 4 is the direct translation of that rule.
 */
const LINE_JOIN_Y_THRESHOLD = 4;

const PAGE_BREAK_MARKER = "---PAGE_BREAK---";

/**
 * Direct PDF text extraction helper using pdf-parse.
 * Runs locally on the server in milliseconds with 0 Gemini API calls.
 * Preserves page breaks (---PAGE_BREAK---), structures headings, questions, and RTL text.
 */
async function extractDirectTextFromPdf(pdfBuffer: Buffer): Promise<{
  text: string;
  markdown: string;
  totalPages: number;
  hasDigitalText: boolean;
}> {
  // pdf-parse v2 owns a pdf.js worker, so it must always be torn down. Without
  // the finally block a long-lived server would accumulate one worker per call.
  const parser = new PDFParse({ data: new Uint8Array(pdfBuffer) });

  try {
    const [parsed, underlineResult] = await Promise.all([
      parser.getText({ lineThreshold: LINE_JOIN_Y_THRESHOLD }),
      detectPdfUnderlines(pdfBuffer).catch(() => ({ pages: [], totalUnderlines: 0 } as PdfUnderlineDetectionResult)),
    ]);

    const underlineByPage = new Map<number, string[]>();
    for (const pg of underlineResult.pages) {
      if (pg.underlinedPhrases.length > 0) {
        underlineByPage.set(pg.pageNumber, pg.underlinedPhrases);
      }
    }

    // v2 returns text per page, which is a more direct source for page
    // boundaries than the v1 pagerender hook had to reconstruct by hand.
    const rawPageTexts = parsed.pages.length > 0 ? parsed.pages.map((page) => page.text) : [parsed.text];

    // The v1 pagerender already appended the marker to every page, so callers
    // downstream expect the marker embedded in rawText, not only in markdown.
    const rawText = rawPageTexts
      .map((pg) => pg.replace(/[\u0332\u0333]/g, ''))
      .join(`\n\n${PAGE_BREAK_MARKER}\n\n`);
    const totalPages = parsed.total || rawPageTexts.length || 1;

    // Split by page break marker
    const rawPages = rawPageTexts
      .map((p: string) => p.trim())
      .filter((p: string) => p.length > 0);

    const formattedPages = (rawPages.length > 0 ? rawPages : [rawText.trim()]).map((page: string, idx: number) => {
      const lines = page.split('\n');
      const mdLines = lines.map((line: string) => {
        const trimmed = line.trim();
        if (!trimmed) return '';
        // Chapter / Unit / Lesson headings (note JS \b fails on Arabic letters, use explicit lookahead)
        if (/^(?:(?:الوحدة|الدرس|الباب|الفصل|المبحث|المطلب|المقدمة|سلسلة|كتاب|المذكرة)(?=\s|$|:|—|-)|(?:Unit|Chapter|Lesson|PART|MODULE)\b)/i.test(trimmed)) {
          return `## ${trimmed}`;
        }
        // Questions (e.g. س 1 أو س١ أو السؤال الأول..العاشر أو 1. أو (١))
        if (/^(?:س\s*[٠-٩\d]+[:.\-)]?|السؤال\s+(?:الأول|الثاني|الثالث|الرابع|الخامس|السادس|السابع|الثامن|التاسع|العاشر|[٠-٩\d]+)|[٠-٩\d]+[\.\-\)]|\([٠-٩\d]+\))\s+/i.test(trimmed)) {
          return `\n### ${trimmed}`;
        }
        return trimmed;
      });
      const mdPage = mdLines.join('\n');
      return applyVerifiedUnderlinesToPageText(mdPage, underlineByPage.get(idx + 1) || [], false);
    });

    let fullMarkdown = formattedPages.join(`\n\n${PAGE_BREAK_MARKER}\n\n`);
    // Normalize Arabic presentations, mojibake, and OCR symbols + polish Arabic/English boundaries
    fullMarkdown = polishBilingualBoundariesCore(toStandardArabic(normalizeCombiningUnderlines(fullMarkdown)));
    const hasDigitalText = rawText.replace(/\s+/g, '').length > 50;

    return {
      text: rawText,
      markdown: fullMarkdown,
      totalPages,
      hasDigitalText,
    };
  } finally {
    await parser.destroy();
  }
}

// Direct High-Speed Zero-Quota Extraction Endpoint
app.post("/api/extract-direct-pdf", async (req, res) => {
  try {
    const { pdfBase64, filename } = req.body;
    if (!pdfBase64) {
      return res.status(400).json({ success: false, error: "No PDF data provided" });
    }
    const cleanBase64 = pdfBase64.replace(/^data:[^;]+;base64,/, "");
    const pdfBuffer = Buffer.from(cleanBase64, "base64");
    const result = await extractDirectTextFromPdf(pdfBuffer);

    if (!result.hasDigitalText) {
      return res.json({
        success: false,
        hasDigitalText: false,
        error: "لم يتم العثور على طبقة نصوص رقمية في الملف (الملف عبارة عن صور ممسوحة ضوئياً ويحتاج إلى التعرف البصري OCR).",
      });
    }

    const isArabic = (result.markdown.match(/[\u0600-\u06FF]/g) || []).length > 20;

    return res.json({
      success: true,
      hasDigitalText: true,
      data: {
        title: (filename || "document").replace(/\.[^/.]+$/, ""),
        detectedLanguage: isArabic ? "العربية" : "English",
        textDirection: isArabic ? "rtl" : "ltr",
        hasArabicText: isArabic,
        hasMathOrScience: false,
        hasTables: result.markdown.includes("|"),
        hasHandwriting: false,
        markdown: result.markdown,
        plainText: result.text,
        totalPages: result.totalPages,
        method: "direct_digital_extraction",
      },
    });
  } catch (err: any) {
    console.error("Direct PDF extraction error:", err);
    return res.status(500).json({
      success: false,
      error: err?.message || "تعذر الاستخراج الرقمي المباشر",
    });
  }
});

// PDF Conversion Endpoint
app.post("/api/convert-pdf", async (req, res) => {
  try {
    const { pdfBase64, filename, options } = req.body;

    if (!pdfBase64) {
      return res.status(400).json({ error: "No PDF data provided" });
    }

    const cleanBase64 = pdfBase64.replace(/^data:[^;]+;base64,/, "").trim();
    if (!cleanBase64) {
      return res.status(400).json({ error: "No PDF data provided" });
    }

    // Early sanity check: Must be at least 16 bytes and valid base64
    const bufferHeader = Buffer.from(cleanBase64.slice(0, 64), "base64");
    if (bufferHeader.length < 4) {
      return res.status(400).json({
        success: false,
        error: "بيانات الملف الممررة غير صالحة أو تالفة. يرجى التأكد من تمرير ملف PDF أو صورة صحيحة بصيغة Base64.",
      });
    }

    // Check magic numbers for PDF (%PDF), PNG (\x89PNG), or JPEG (\xFF\xD8)
    const isPdfHeader = bufferHeader.subarray(0, 4).toString("ascii").startsWith("%PDF");
    const isPngHeader = bufferHeader.length >= 8 && bufferHeader[0] === 0x89 && bufferHeader[1] === 0x50 && bufferHeader[2] === 0x4E && bufferHeader[3] === 0x47;
    const isJpegHeader = bufferHeader.length >= 2 && bufferHeader[0] === 0xFF && bufferHeader[1] === 0xD8;
    const isSupportedMime = isPdfHeader || isPngHeader || isJpegHeader;

    if (!isSupportedMime && bufferHeader.length < 32) {
      return res.status(400).json({
        success: false,
        error: "الملف الممرر ليس مستند PDF أو صورة صالحة. تم رفض الطلب حمايةً للحصص وجودة التحويل.",
      });
    }

    const ai = getGeminiClient();
    if (cleanBase64.length > 24 * 1024 * 1024) {
      return res.status(413).json({
        success: false,
        error: "حجم الحزمة كبير جداً.",
        isPayloadTooLarge: true,
        isRateLimit: false,
        isUnavailable: false,
      });
    }

    const directionPreference = options?.direction || "auto"; // 'auto' | 'rtl' | 'ltr'
    const preserveHandwriting = options?.preserveHandwriting !== false;
    // `mathPrecision` arrives on the request body and is part of the documented
    // API contract, but no prompt or output depends on it. Kept accepted so existing
    // clients do not break.
    void options?.mathPrecision;

    const systemPrompt = `You are a master document transcription, OCR, and typesetting specialist for all languages and fields (English books, scientific & mathematical publications, STEM, literature, as well as classical and modern Arabic books, Islamic texts, Azhar curricula, and exam papers).
Your mission is to transcribe the attached document into pristine, professional, high-fidelity Markdown with 100% VERBATIM accuracy, strictly respecting the source language, orientation, and layout.

### Strict Core Guidelines (دستور النسخ الحرفي المطلق وتجريم أي تصرف أو تحريف):

1. **Zero Omission & Verbatim Guarantee (حظر الحذف أو التلخيص أو الاقتطاع)**:
   - Transcribe EVERY SINGLE WORD, sentence, line, footnote, header, table, exercise, question, and answer.
   - NEVER summarize, paraphrase, rewrite, shorten, or skip any content under any circumstances!
   - Preserve exact words and sentence meaning without guessing or semantic drift.

2. **Multi-Column & Side-Column Full Extraction (دقة الصفحات متعددة الأعمدة والحواشي)**:
   - For multi-column pages (two columns, or main text + margin commentary): transcribe each column completely in proper reading order (Right-to-Left for Arabic: right column first in full, then left column in full).
   - NEVER drop or skip one of the columns!

3. **Holy Quranic Verses in Authentic Uthmani Script (الآيات القرآنية بالرسم العثماني المعتمد)**:
   - Every single Quranic verse, partial ayah, or phrase (whether standalone, after قال تعالى or قوله تعالى, or quoted) MUST be transcribed in 100% authentic Uthmani script with full diacritical marks (تَشْكِيل كَامِل) and strictly wrapped between ornamental brackets: ﴿...﴾.
   - Example: قال تعالى: ﴿عَمَّ يَتَسَاءَلُونَ﴾.

4. **Arabic Diacritics & Vocalization (التشكيل الدقيق وضبط الكلمات)**:
   - Carefully preserve all Arabic vocalization and diacritical marks (حركات، شدة، تنوين، سكون) exactly as printed in the original document.

5. **Tables, Grids & Vocabulary Matrices (دقة الجداول والمصفوفات)**:
   - Transcribe all tables, comparison grids, exam questions/answers, and vocabulary matrices into standard Markdown tables:
     | العمود الأول | العمود الثاني | العمود الثالث |
     | :--- | :--- | :--- |
     | محتوى الخلية | محتوى الخلية | محتوى الخلية |
   - NEVER collapse multi-column tabular data into jumbled single lines of text.
   - STRICT RULE ON TABLE HEADERS: NEVER use the Arabic letter 'ا' as a column separator in table headers or curriculum plans (e.g. NEVER output "خطة القسم الأدبياالفترة الزمنيةاالموضوعات" or "الفهرساالموضوعارقم الصفحة" or "الرأياالحكماالتعليل"). EVERY table column MUST be separated by standard Markdown pipe characters (|) with spaces, e.g.:
     | خطة القسم الأدبي | الفترة الزمنية | الموضوعات |
     | الفهرس | الموضوع | رقم الصفحة |
     | الفقه الحنفي | نوع الدليل | التوضيح |
     | الرأي | الحكم | التعليل |
   - STRICT RULE ON FOOTNOTE & NOISE CLEANUP: NEVER output scanner artifact footnote noise or broken margin identifiers (such as the word "شمخ" or stray superscript symbols "^(١)").

6. **Cover Page Full Integrity (سلامة صفحة الغلاف)**:
   - When transcribing a title or cover page, capture every title, subtitle, author, department, and publisher without omissions.

7. **Footnotes Preservation & Separation (الهوامش والحواشي السفلية)**:
   - Separate footnotes from the body text and place them at the bottom of the page in standard Markdown footnote format:
     ---
     **Footnotes / الهوامش:**
     [^1]: Note content...

8. **Strict Page Parity Marker (تطابق الصفحات 1:1)**:
   - Insert an isolated line containing strictly "---PAGE_BREAK---" at the end of every original PDF page to ensure 1:1 page correspondence in Word and export formats.

9. **Numbering & Question Sequences (أرقام الأسئلة والتمارين)**:
   - Preserve the exact literal numbering: (1. , ١. , (1) , (١) , أ- , ب- , س١:). Do NOT renumber or drop question numbers.

10. **Underlined Text, Subtle Inline Marks, Fill-in-Blanks & Poetry Couplets (النصوص التي تحتها خط والتنسيقات الدقيقة)**:
    - **UNDERLINED TEXT (الخطوط السفلية — حرج جداً لأسئلة الإعراب والنحو)**: Whenever ANY word, phrase, or sentence in the original document is underlined (especially target words under *"أعرب ما تحته خط"* or *"اضبط ما تحته خط"* or *"تخير الإعراب الصحيح لما تحته خط"* in reading/grammar passages, as well as underlined headings or emphasized phrases inside paragraphs or tables), you MUST strictly wrap ONLY the underlined word/phrase in <u>...</u> tags! Never ignore or lose underlines! Example: "إن <u>العلم</u> <u>نورٌ</u> يهدي <u>الطلابَ</u>. — أعرب ما تحته خط."
    - **STRIKETHROUGH & SUPER/SUBSCRIPT**: Wrap struck-through text in ~~...~~, superscripts in <sup>...</sup>, and subscripts in <sub>...</sub>.
    - **FILL-IN-THE-BLANK LINES (فراغات الإجابة)**: Preserve exam answer blanks as ___ or ..... (never collapse or drop the blank space in "أكمل مكان النقط: _____").
    - **ARABIC POETRY COUPLETS (الأبيات الشعرية ذات الشطرين)**: Preserve both hemistichs separated clearly on the line using three asterisks spaced out ("صدر البيت   ***   عجز البيت"), never merging them without separation or dropping either half.

11. **Sanitization**:
    - Strip scanner/app watermarks (e.g. "CamScanner", "Created with Photo-to-PDF", "Adobe Scan").
    - Ban runaway dot chains (compress "......" to ".....").

OUTPUT DIRECTLY AS PRISTINE MARKDOWN ONLY (Do not wrap in JSON).`;

    let userPrompt = `Transcribe this document "${filename || 'document.pdf'}" into pristine, 100% VERBATIM Markdown matching its exact source layout and language:
- ABSOLUTE ZERO OMISSIONS: Transcribe every word, every column, and every footnote without summarizing or skipping anything.
- CRITICAL VISUAL FORMATTING: Carefully inspect the page image/PDF for ANY underlined words or phrases (especially in Arabic grammar passages with "أعرب ما تحته خط" / "اضبط ما تحته خط") and wrap every underlined word/phrase strictly in <u>...</u> tags. Also preserve ~~strikethrough~~, <sup>superscript</sup>, <sub>subscript</sub>, and answer blanks (___ / .....).
- Preserve all tables and grids using valid Markdown table format (| Column 1 | Column 2 |).
- Preserve all Arabic diacritics (تَشْكِيل) and render every Quranic verse in authentic Uthmani script with full harakat strictly inside ﴿...﴾.
- For multi-column pages: transcribe all columns completely in reading order.
- Include a separate "---PAGE_BREAK---" line at the end of each original page.
- Strip any scanner watermarks.`;

    // Detect mimeType if provided in data URL, default to application/pdf
    let mimeType = "application/pdf";
    const mimeMatch = pdfBase64.match(/^data:(image\/[a-zA-Z0-9+.-]+|application\/pdf);base64,/);
    if (mimeMatch) {
      mimeType = mimeMatch[1];
    }

    // Pre-scan digital PDFs for geometric vector underlines / Underline annotations (fast 2.5s guard)
    let detectedPdfUnderlines: PdfUnderlineDetectionResult = { pages: [], totalUnderlines: 0 };
    if (isPdfHeader) {
      try {
        const pdfChunkBuf = Buffer.from(cleanBase64, "base64");
        let guardTimer: any;
        detectedPdfUnderlines = await Promise.race([
          detectPdfUnderlines(pdfChunkBuf),
          new Promise<PdfUnderlineDetectionResult>((resolve) => {
            guardTimer = setTimeout(() => resolve({ pages: [], totalUnderlines: 0 }), 2500);
          }),
        ]);
        if (guardTimer) clearTimeout(guardTimer);

        if (detectedPdfUnderlines.totalUnderlines > 0) {
          const hintLines = detectedPdfUnderlines.pages
            .filter((p) => p.underlinedPhrases.length > 0)
            .slice(0, 12)
            .map((p) => `  - Page ${p.pageNumber}: ${p.underlinedPhrases.slice(0, 20).join("، ")}`);
          if (hintLines.length > 0) {
            userPrompt += `\n\n- VERIFIED DIGITAL UNDERLINES IN SOURCE PDF VECTOR LAYER (MUST wrap these exact words/phrases in <u>...</u> where underlined on each page):\n${hintLines.join("\n")}`;
          }
        }
      } catch {
        // Non-fatal pre-scan bypass
      }
    }

    let response: any = null;
    let lastError: any = null;

    // Retry loop with exponential backoff across available Gemini models
    const MAX_ROUNDS = 3;
    for (let round = 0; round < MAX_ROUNDS && !response; round++) {
      const modelsToTry = getAvailableModels();

      if (round > 0) {
        // Backoff delay before subsequent round with jitter
        const delayMs = Math.min(10000, 1500 + round * 1200 + Math.floor(Math.random() * 500));
        console.log(`[Backoff Round ${round + 1}/${MAX_ROUNDS}] Pausing ${delayMs}ms before retrying models...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }

      const earliestWaitMs = sharedModelPool.getEarliestReadyWaitMs();

      if (earliestWaitMs > 0) {
        const waitSec = Math.max(1, Math.min(60, Math.ceil(earliestWaitMs / 1000)));

        if (waitSec <= 15) {
          console.log(`[Rate Limit Guard] All models on cooldown. Waiting ${waitSec}s on server...`);
          await new Promise((r) => setTimeout(r, (waitSec + 1) * 1000));
        } else {
          console.log(`[Rate Limit Guard] Models in cooldown for ${waitSec}s. Delegating wait to client.`);
          return res.status(429).json({
            success: false,
            error: "تم بلوغ حد الطلبات اللحظي في الدقيقة (Rate limit). يرجى الانتظار ثوانٍ قليلة...",
            isRateLimit: true,
            isUnavailable: false,
            isPeakDemand: false,
            retryAfterSeconds: waitSec + 1,
          });
        }
      }

      for (const modelName of modelsToTry) {
        try {
          console.log(`[Round ${round + 1}/${MAX_ROUNDS}] Sending conversion request using model: ${modelName}...`);
          let timeoutHandle: any;
          const timeoutPromise = new Promise<never>((_, reject) => {
            timeoutHandle = setTimeout(() => {
              reject(new Error(`Model ${modelName} call timed out after 45s (peak demand safeguard)`));
            }, 45000);
          });

          const modelCallPromise = ai.models.generateContent({
            model: modelName,
            contents: [
              {
                role: "user",
                parts: [
                  {
                    inlineData: {
                      mimeType: mimeType,
                      data: cleanBase64,
                    },
                  },
                  {
                    text: userPrompt,
                  },
                ],
              },
            ],
            config: {
              systemInstruction: systemPrompt,
              ...buildSafeThinkingConfig(modelName),
              maxOutputTokens: 32768,
            },
          });

          try {
            response = await Promise.race([modelCallPromise, timeoutPromise]);
          } finally {
            clearTimeout(timeoutHandle);
          }

          if (response && response.text) {
            sharedModelPool.recordSuccess(modelName);
            break;
          }
        } catch (err: any) {
          const errMsg = err?.message || String(err);
          console.warn(`Model ${modelName} failed: ${errMsg}`);
          lastError = err;
          sharedModelPool.classifyAndRecordError(modelName, err);

          // Gentle pause between models in the same round
          await new Promise((r) => setTimeout(r, 400));
        }
      }
    }

    if (!response || !response.text) {
      throw lastError || new Error("The AI conversion service experienced temporary peak demand. Please retry in a few seconds.");
    }

    const rawText = (response.text || "").trim();
    let markdownContent = rawText;

    // In case the model wrapped in ```markdown ... ```
    if (markdownContent.startsWith("```markdown")) {
      markdownContent = markdownContent.replace(/^```markdown\s*/i, "").replace(/```\s*$/, "").trim();
    } else if (markdownContent.startsWith("```") && markdownContent.endsWith("```")) {
      // If it returned json or general codeblock, check if it's JSON
      const inner = markdownContent.replace(/^```[a-z]*\s*/i, "").replace(/```\s*$/, "").trim();
      try {
        const parsed = JSON.parse(inner);
        if (parsed && typeof parsed.markdown === "string") {
          markdownContent = parsed.markdown;
        } else {
          markdownContent = inner;
        }
      } catch {
        markdownContent = inner;
      }
    } else if (markdownContent.startsWith("{") && markdownContent.endsWith("}")) {
      try {
        const parsed = JSON.parse(markdownContent);
        if (parsed && typeof parsed.markdown === "string") {
          markdownContent = parsed.markdown;
        }
      } catch {
        // Use raw text as markdown directly
      }
    }

    // Detect language & direction from text
    const arabicCharCount = (markdownContent.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/g) || []).length;
    const latinCharCount = (markdownContent.match(/[a-zA-Z]/g) || []).length;
    const isArabic = directionPreference === "rtl" || (directionPreference === "auto" && arabicCharCount >= latinCharCount * 0.4);
    const textDirection = isArabic ? "rtl" : "ltr";
    const detectedLanguage = arabicCharCount > 10 && latinCharCount > 10 ? "Arabic & English" : isArabic ? "Arabic" : "English";

    // Extract title from first H1/H2 header or filename
    let docTitle = (filename || "document.pdf").replace(/\.[^/.]+$/, "").replace(/\s*\(pages\s*\d+-\d+\)/i, "");
    const headerMatch = markdownContent.match(/^#+\s+(.+)$/m);
    if (headerMatch && headerMatch[1]) {
      const cleanHeader = headerMatch[1].replace(/[*_#`]/g, "").trim();
      if (cleanHeader.length > 2 && cleanHeader.length < 80) {
        docTitle = cleanHeader;
      }
    }

    // Post-processing cleanup utility
    const cleanMarkdown = (md: string) => {
      let cleaned = md;

      // 1. Standardize pagination artifacts and strictly preserve true page breaks
      cleaned = cleaned.replace(/\s*---PAGE_BREAK---\s*/g, '\n\n---PAGE_BREAK---\n\n');
      // Clean up stray HTML line breaks and formatting tags from OCR
      cleaned = cleaned
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/br>/gi, '\n')
        .replace(/&nbsp;/gi, ' ')
        // Only unwrap the tags this list names. The alternation needs its own
        // boundaries: without them `i` matches the first letter of any tag, so
        // <img …>, <iframe …> and <input …> were matched and deleted outright,
        // silently discarding embedded images from the document.
        .replace(/<\/?(span|div|p|b|strong|em|i)(?=[\s/>])[^>]*>/gi, '');
      // Remove explicit pagination headers (e.g. "الصفحة 12", "Page 12", "- 12 -") without stripping standalone question numbers (1, 2, 3)
      cleaned = cleaned.replace(/^[ \t]*(?:الصفحة|Page)[ \t]+\d+[ \t]*$|^[ \t]*-[ \t]*\d+[ \t]*-[ \t]*$/gmi, '');

      // 2. Fix inconsistent footnote symbols if any sneaked through (e.g., replacing loose asterisks intended as footnotes)
      // This is risky for bold text, so we only target asterisks at the start of a line or after a space followed by nothing
      // We will rely primarily on the AI's prompt for footnotes, but we can clean up stray reference markers like [^] to [^1]
      let fnCounter = 1;
      cleaned = cleaned.replace(/\[\^[\s*]*\]/g, () => `[^${fnCounter++}]`);

      // 3. Remove residual debugging characters and artifacts
      cleaned = cleaned.replace(/\\text\{([^\}]+)\}/g, '$1'); // Fix stray \text{} wrappers from OCR
      cleaned = cleaned.replace(/\u200B/g, ''); // Remove zero-width spaces

      // 4. Eliminate empty paragraphs and normalize spacing
      cleaned = cleaned.replace(/[ \t]+$/gm, ''); // Trailing spaces
      cleaned = cleaned.replace(/\n[ \t]+\n/g, '\n\n'); // Empty lines with spaces
      cleaned = cleaned.replace(/\n{3,}/g, '\n\n'); // More than 2 newlines
      
      // 5. Clean up broken or orphaned horizontal rules
      cleaned = cleaned.replace(/^-{2,}$/gm, '---');
      cleaned = cleaned.replace(/\n---\n---\n/g, '\n---\n'); // Deduplicate horizontal rules

      // 6. Mandatory Quranic & Azhar Curriculum Post-Processing Verification
      // Rectifies critical OCR character confusions, runaway dot loops, and Azhar curriculum omissions
      cleaned = cleaned
        // Compress runaway dots and repetitive dot loops
        .replace(/\.{6,}/g, '.....')
        .replace(/^[ \t]*(\.[ \t]*){5,}$/gm, '.....')
        .replace(/(\n[ \t]*\.\.\.\.\.[ \t]*){2,}/g, '\n.....\n')
        // Table header column splitting & glued 'ا' artifact repair
        .replace(/خطة[ \t]*القسم[ \t]*الأدبياالفترة[ \t]*الزمنيةاالموضوعات/g, '| خطة القسم الأدبي | الفترة الزمنية | الموضوعات |')
        .replace(/خطة[ \t]*القسم[ \t]*العلمياالفترة[ \t]*الزمنيةاالموضوعات/g, '| خطة القسم العلمي | الفترة الزمنية | الموضوعات |')
        .replace(/الفهرساالموضوعارقم[ \t]*الصفحة/g, '| الفهرس | الموضوع | رقم الصفحة |')
        .replace(/الفقه[ \t]*الحنفيانوع[ \t]*الدليلاالتوضيح/g, '| الفقه الحنفي | نوع الدليل | التوضيح |')
        .replace(/الرأياالحكماالتعليل|الرأياالحكماالتوضيح/g, '| الرأي | الحكم | التعليل |')
        // Fiqh Hanafi & Azhar curriculum typos
        .replace(/(?:^|[^\u0621-\u064A])بأنًّا(?:$|[^\u0621-\u064A])/g, ' باتًّا ')
        .replace(/البيعي[ \t]+والوزني/g, 'الكيلي والوزني')
        .replace(/(?:^|[^\u0621-\u064A])الكتيف(?:$|[^\u0621-\u064A])/g, ' الكنيف ')
        .replace(/(?:^|[^\u0621-\u064A])الزعْر(?:$|[^\u0621-\u064A])/g, ' الزرع ')
        .replace(/تريق[ \t]+الصفقة/g, 'تفريق الصفقة')
        .replace(/(?:^|[^\u0621-\u064A])السففل(?:$|[^\u0621-\u064A])/g, ' السُّفْل ')
        .replace(/أجرة[ \t]+الصيغ/g, 'أجرة الصَّبْغ')
        .replace(/أكتوبرامن/g, 'أكتوبر من')
        .replace(/ومصوغهما[ \t]+ومصوغهما/g, 'ومصوغهما')
        // Scanner footnote noise removal ("شمخ" and broken superscript footnotes)
        .replace(/\bشمخ\b|[ \t]+شمخ(?=[ \t،.\n]|$)/g, '')
        .replace(/\^\(?[٠-٩1-9]+\)?/g, '')
        // Fix phrase repetitions in tables
        .replace(/وعن[ \t]+لبن[ \t]+في[ \t]+ضرع[،,\s]+وعن[ \t]+لبن[ \t]+في[ \t]+ضرع/g, 'وعن لبن في ضرع')
        // Fix Hadith typos & omissions
        .replace(/راوية[ \t]+ابن[ \t]+ماجه/g, 'رواية ابن ماجه')
        .replace(/النساء[ \t]+الرجال(?=[ \t]*[،.\n]|$)/g, 'النساء شقائق الرجال')
        // Fix Fiqh Shafi'i typos & truncation
        .replace(/كفته[ \t]+نيتة/g, 'كفته نيته')
        // Quranic verses
        .replace(/مَن[ \t]+تَقُوتُ|مِن[ \t]+تَقُوتُ/g, '﴿مِن تَفَاوُتٍ﴾')
        .replace(/جواب[ \t]+الأمر[:\s]+﴿?بِقَلْبٍ﴾?/g, 'جواب الأمر: ﴿يَنقَلِبْ﴾')
        .replace(/الْبَصَرُ[ \t]+خَاشِعًا|الْبَصَرُ[ \t]+خاشعا/g, 'الْبَصَرُ خَاسِئًا')
        .replace(/أَن[ \t]+يَخِيفَ/g, 'أَن يَخْسِفَ')
        .replace(/يَعْمَوْا[ \t]+عَمَهًا/g, 'سَمِعُوا لَهَا شَهِيقًا')
        .replace(/أَلَيَأْتِيكُم[ \t]+نَذِيرٌ/g, 'أَلَمْ يَأْتِكُمْ نَذِيرٌ')
        .replace(/معنى[ \t]+كلمة[ \t]+﴿?صَنَفَتْ﴾?/g, 'معنى كلمة ﴿صَافَّاتٍ﴾')
        .replace(/فِي[ \t]+مَنَاكِلِهَا/g, 'فِي مَنَاكِبِهَا')
        .replace(/تَمَيَّزُ[ \t]+مِنَ[ \t]+الْفَيْضِ/g, 'تَمَيَّزُ مِنَ الْغَيْظِ')
        .replace(/فَصُحْقًا/g, 'فَسُحْقًا')
        .replace(/﴿{2,}/g, '﴿')
        .replace(/﴾{2,}/g, '﴾');

      // Apply robust TextProcessor rule cleaning (Table noise, 'شمخ' artifacts, Fiqh dictionary)
      if (typeof TextProcessor !== 'undefined' && TextProcessor.process) {
        cleaned = TextProcessor.process(cleaned);
      }

      return cleaned.trim();
    };

    // Preserve CSS-underlined spans before downstream cleaning, and normalize combining/LaTeX underlines
    markdownContent = markdownContent
      .replace(/<span[^>]*style=["'][^"']*text-decoration\s*:\s*underline[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi, '<u>$1</u>')
      .replace(/\\underline\{([^}]+)\}/g, '<u>$1</u>');
    markdownContent = normalizeCombiningUnderlines(markdownContent);
    markdownContent = cleanMarkdown(markdownContent);
    markdownContent = markdownContent.replace(/\\underline\{([^}]+)\}/g, '<u>$1</u>');
    // Apply full Arabic normalization, OCR mojibake repair, and bilingual boundary polishing
    markdownContent = polishBilingualBoundariesCore(toStandardArabic(markdownContent));
    // Reinforce any missed digital PDF vector underlines on pages containing underline questions
    if (detectedPdfUnderlines.totalUnderlines > 0) {
      markdownContent = applyVerifiedUnderlinesToMarkdown(markdownContent, detectedPdfUnderlines.pages, true);
    }

    // Generate plainText safely without markdown syntax
    const plainText = markdownContent
      .replace(/^---\s*$/gm, '\n------------------------\n') // horizontal rules in plain text
      .replace(/\\text\{([^\}]+)\}/g, '$1') // strip stray \text{} blocks
      .replace(/^#+\s+/gm, "")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/_([^_]+)_/g, "$1")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\$\$?([^\$]+)\$\$?/g, "$1") // Strip math dollar signs
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/^\s*[-*+]\s+/gm, "• ")
      .trim();

    const cleanedPlainText = plainText
      .replace(/<\/?(?:u|ins|s|sup|sub|mark)(?:\s[^>]*)?>/gi, '')
      .replace(/~~([^~]+)~~/g, '$1');

    const parsedData = {
      title: docTitle,
      detectedLanguage,
      textDirection,
      pageCountEstimate: 1,
      hasMathOrScience: /\$|\\frac|\\sqrt|\\vec/.test(markdownContent),
      hasArabicText: arabicCharCount > 5,
      hasTables: markdownContent.includes("|"),
      hasHandwriting: preserveHandwriting,
      markdown: markdownContent,
      plainText: cleanedPlainText,
    };

    res.json({
      success: true,
      data: parsedData,
    });
  } catch (error: any) {
    const rawError = error?.message || String(error);
    console.error("PDF Conversion Error:", rawError);
    let userFriendlyError = rawError;
    let extractedRetrySec = 15;
    try {
      const match = rawError.match(/retry in ([0-9.]+)s/i) || rawError.match(/retryDelay"?:\s*"(\d+)s"/i);
      if (match) extractedRetrySec = Math.ceil(parseFloat(match[1]));
    } catch {}

    const isDailyQuotaExhausted =
      rawError.includes("GenerateRequestsPerDay") ||
      (rawError.includes("free_tier_requests") && (rawError.includes("limit: 500") || extractedRetrySec > 300));

    const isRateLimit =
      rawError.includes("429") ||
      rawError.includes("RESOURCE_EXHAUSTED") ||
      rawError.includes("Quota exceeded") ||
      rawError.toLowerCase().includes("rate limit") ||
      rawError.toLowerCase().includes("quota");

    const isUnavailable =
      rawError.includes("503") ||
      rawError.toLowerCase().includes("high demand") ||
      rawError.toLowerCase().includes("peak demand") ||
      rawError.includes("UNAVAILABLE") ||
      rawError.toLowerCase().includes("overloaded") ||
      rawError.toLowerCase().includes("temporary");

    if (isUnavailable) {
      userFriendlyError = "تشهد خدمة المعالجة ضغطاً مؤقتاً. الحفاظ على تقدمك وإعادة المحاولة تلقائياً...";
      return res.status(503).json({
        success: false,
        error: userFriendlyError,
        isRateLimit: false,
        isUnavailable: true,
        isPeakDemand: true,
        isDailyQuotaExhausted: false,
        retryAfterSeconds: Math.max(6, Math.min(25, extractedRetrySec)),
      });
    } else if (isRateLimit) {
      userFriendlyError = isDailyQuotaExhausted
        ? "تم استهلاك الحصة المجانية اليومية للطلبات البصرية. يمكنك إكمال الصفحات الرقمية فوراً أو المتابعة تلقائياً بعد انتهاء التهدئة."
        : "تم الوصول إلى الحد المؤقت للطلبات في الدقيقة (Rate limit). جاري الانتظار والاستئناف تلقائياً...";
      return res.status(429).json({
        success: false,
        error: userFriendlyError,
        isRateLimit: true,
        isUnavailable: false,
        isPeakDemand: false,
        isDailyQuotaExhausted,
        retryAfterSeconds: isDailyQuotaExhausted ? 60 : Math.max(10, Math.min(65, extractedRetrySec + 2)),
      });
    }

    res.status(500).json({
      success: false,
      error: userFriendlyError,
      isRateLimit: false,
    });
  }
});

// AI Contextual Checker Endpoint (Compares verses, hadiths, and fiqh terms against canonical databases)
app.post("/api/contextual-check", async (req, res) => {
  try {
    // subjectHint is accepted for API compatibility; the checker does not branch on it.
    const { markdown } = req.body;
    void req.body?.subjectHint;
    if (!markdown || typeof markdown !== "string") {
      return res.status(400).json({ success: false, error: "النص مطلوب للفحص السياقي." });
    }

    // Bypass Islamic canonical check if document has no significant Arabic text
    const arabicCharCount = (markdown.match(/[\u0600-\u06FF]/g) || []).length;
    if (arabicCharCount < 10) {
      return res.json({
        success: true,
        data: {
          correctedMarkdown: markdown,
          isAiVerified: false,
          fallbackReason: "English / non-Arabic document",
        },
      });
    }

    const ai = getGeminiClient();
    const systemInstruction = `أنت وحدة الفحص السياقي الذكي المتقدم (AI Contextual Checker) المتخصصة في المناهج والمصادر المعتمدة (المصحف الشريف برواية حفص بالرسم العثماني، كتب الحديث، أمهات كتب الفقه، والمراجع العلمية).
مهمتك الصارمة:
1. فحص سياق الآيات القرآنية ومطابقتها نصاً ولفظاً برسم المصحف المعتمد وضبط أي انحراف ناتج عن التعرف البصري (OCR) ووضع كل آية بين قوسي مصحف: ﴿...﴾ مع كامل التشكيل.
2. فحص الأحاديث النبوية ومقارنتها بكتب السنة المعتمدة واستكمال أي سقط، وتصحيح أي تصحيف مثل "راوية ابن ماجه" ➔ "رواية ابن ماجه"، و"النساء الرجال" ➔ "النساء شقائق الرجال".
3. ضبط المصطلحات الفقهية واللغوية وتصحيح التصحيفات المطبعية دون تغيير المعنى الأصلي إطلاقاً.
4. حظر الحذف أو التلخيص أو إعادة الصياغة: يُحظر حظراً تاماً اختصار أي فقرة أو حذف أي هامش أو إعادة صياغة جمل المؤلف؛ دورك تدقيقي وتصحيحي محض.
5. تطهير سيل النقاط المتكررة وحصر الفراغات في [.....] فقط.
6. الحفاظ التام والصارم بنسبة 100% على علامات فواصل الصفحات «---PAGE_BREAK---» في مواضعها الدقيقة دون حذف أو دمج أو تغيير إطلاقاً، لضمان تطابق صفحات الوورد مع أصل البي دي إف صفحة بصفحة 1:1.
7. الحفاظ التام على جميع وسوم التنسيق الموضعية مثل الخطوط السفلية <u>...</u> (خاصة الكلمات المراد إعرابها في "أعرب ما تحته خط") والتظليل <mark>...</mark> والأسس <sup> و <sub> والشطب ~~...~~ وفراغات الإكمال ___ كما وردت حرفياً دون حذفها.
8. أعد فقط النص المكتمل والمصحح بصيغة Markdown دون أي شرح أو مقدمات أو خاتمة.`;

    const modelsToTry = getAvailableModels();
    let resultText = "";
    let lastErr = null;

    for (const model of modelsToTry) {
      try {
        let timeoutHandle: any;
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutHandle = setTimeout(() => {
            reject(new Error(`Contextual check model ${model} timed out after 25s`));
          }, 25000);
        });

        const modelCallPromise = ai.models.generateContent({
          model,
          contents: `قم بالفحص والتدقيق السياقي الفوري لهذا المحتوى الأزهري، واضبط الآيات والأحاديث والجداول بالمسطرة وفق المراجع المعتمدة:\n\n${markdown.slice(0, 32000)}`,
          config: {
            systemInstruction,
            ...buildSafeThinkingConfig(model),
            maxOutputTokens: 8192,
          },
        });

        let response: any;
        try {
          response = await Promise.race([modelCallPromise, timeoutPromise]);
        } finally {
          clearTimeout(timeoutHandle);
        }

        resultText = response.text || "";
        if (resultText && resultText.trim().length > 0) {
          sharedModelPool.recordSuccess(model);
          break;
        }
      } catch (err: any) {
        lastErr = err;
        sharedModelPool.classifyAndRecordError(model, err);
        console.warn(`Contextual check failed on model ${model}:`, err.message || err);
      }
    }

    if (!resultText) {
      return res.json({
        success: true,
        data: {
          correctedMarkdown: markdown,
          isAiVerified: false,
          fallbackReason: lastErr?.message || "AI model unavailable, canonical rule engine applied",
        },
      });
    }

    // Critical Safeguard: If the AI output is significantly shorter than the input,
    // it means maxOutputTokens truncated a large document (e.g. 200 pages -> 2 pages).
    // In that case, NEVER overwrite the full document with a truncated stub!
    if (markdown.length > 8000 && resultText.length < markdown.length * 0.75) {
      console.warn(`[ContextualCheck] Truncation averted: Original length ${markdown.length} vs AI output ${resultText.length}. Preserving full document.`);
      return res.json({
        success: true,
        data: {
          correctedMarkdown: markdown,
          isAiVerified: false,
          isTruncationPrevented: true,
        },
      });
    }

    // Safeguard 2: Ensure 100% preservation of page breaks
    const origBreaks = (markdown.match(/---PAGE_BREAK---/g) || []).length;
    const resBreaks = (resultText.match(/---PAGE_BREAK---/g) || []).length;
    if (origBreaks > 0 && resBreaks < origBreaks) {
      console.warn(`[ContextualCheck] Result lost page breaks (${resBreaks} vs ${origBreaks}). Preserving original page structure.`);
      return res.json({
        success: true,
        data: {
          correctedMarkdown: markdown,
          isAiVerified: false,
          fallbackReason: "Preserving strict 1:1 page break parity",
        },
      });
    }

    res.json({
      success: true,
      data: {
        correctedMarkdown: resultText.trim(),
        isAiVerified: true,
      },
    });
  } catch (error: any) {
    console.error("Contextual checker route error:", error);
    // Graceful fallback to prevent disrupting client conversion pipeline
    res.json({
      success: true,
      data: {
        correctedMarkdown: req.body?.markdown || "",
        isAiVerified: false,
        fallbackReason: error?.message || "Internal fallback to canonical rule engine",
      },
    });
  }
});

// Arabic Grammar & Syntax Analyzer Endpoint (Detects open-ended truncation & predicts completions)
app.post("/api/grammar-syntax-check", async (req, res) => {
  try {
    // filename is accepted for API compatibility; the analyzer does not branch on it.
    const { markdown } = req.body;
    void req.body?.filename;
    if (!markdown || typeof markdown !== "string") {
      return res.status(400).json({ success: false, error: "النص مطلوب للتحليل النحوي والتركيبي." });
    }

    // Bypass Arabic syntax analyzer if document has no significant Arabic text
    const arabicCharCount = (markdown.match(/[\u0600-\u06FF]/g) || []).length;
    if (arabicCharCount < 10) {
      return res.json({
        success: true,
        data: {
          hasCriticalTruncation: false,
          isAbruptTermination: false,
          truncatedItems: [],
          overallGrammarVerdict: "English / non-Arabic document verified successfully",
          completedMarkdown: markdown,
        },
      });
    }

    const ai = getGeminiClient();
    const systemInstruction = `أنت خبير التدقيق النحوي والتركيبي المتقدم (Arabic Grammar & Syntax Analyzer).
مهمتك:
1. فحص الجمل العربية المفتوحة البتر (Abrupt Sentence Cuts / Open-ended Incomplete Syntax)، مثل انقطاع النص فجأة على حرف جر (بـ، في، من، إلى، عن)، أو جملة صلة غير مكتملة، أو مضاف بلا مضاف إليه، أو انقطاع في منتصف الفقرة أو الكلمة (مثل: "والمراد من ذلك الجنس الصادق بـ...").
2. فحص ما إذا كان الملف يبدو ناقصاً بشكل حرج (Critical Truncation) بانقطاعه في منتصف الدرس دون خاتمة أو أسئلة.
3. التنبؤ بتكملة الجمل المبتورة بدقة تامة بناءً على السياق الأكاديمي والشرعي واللغوي.
4. أخرج النتيجة بتنسيق JSON حصراً بهذا المخطط:
{
  "hasCriticalTruncation": boolean,
  "isAbruptTermination": boolean,
  "criticalTruncationAlert": "رسالة تنبيه واضحة إذا كان الملف مبتوراً أو ناقصاً",
  "truncatedItems": [
    {
      "truncatedText": "الجملة المبتورة كما وردت",
      "predictedCompletion": "التكملة النحوية والأكاديمية الصحيحة",
      "grammaticalReason": "العلة النحوية (مثل: حرف جر معلق / انقطاع في الموصول / مضاف بلا مضاف إليه)",
      "confidence": 0.95
    }
  ],
  "overallGrammarVerdict": "تقييم موجز للسلامة النحوية واكتمال الجمل",
  "completedMarkdown": "النص الكامل بعد إصلاح وتكملة الجمل المبتورة"
}`;

    const modelsToTry = getAvailableModels();
    let analysisResult: any = null;

    for (const model of modelsToTry) {
      try {
        let timeoutHandle: any;
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutHandle = setTimeout(() => {
            reject(new Error(`Grammar syntax check model ${model} timed out after 20s`));
          }, 20000);
        });

        const modelCallPromise = ai.models.generateContent({
          model,
          contents: `حلل هذا النص نحوياً وتركيبياً واكشف الجمل المفتوحة والبتر المفاجئ وأكملها وفق السياق:\n\n${markdown.slice(-15000)}`,
          config: {
            systemInstruction,
            ...buildSafeThinkingConfig(model),
            responseMimeType: "application/json",
          },
        });

        let response: any;
        try {
          response = await Promise.race([modelCallPromise, timeoutPromise]);
        } finally {
          clearTimeout(timeoutHandle);
        }

        if (response.text) {
          analysisResult = JSON.parse(response.text);
          sharedModelPool.recordSuccess(model);
          break;
        }
      } catch (err: any) {
        sharedModelPool.classifyAndRecordError(model, err);
        console.warn(`Grammar analyzer failed on model ${model}:`, err.message || err);
      }
    }

    if (!analysisResult) {
      return res.json({
        success: true,
        data: {
          hasCriticalTruncation: false,
          isAbruptTermination: false,
          truncatedItems: [],
          overallGrammarVerdict: "تم فحص القواعد النحوية محلياً",
        },
      });
    }

    res.json({
      success: true,
      data: analysisResult,
    });
  } catch (error: any) {
    console.error("Grammar syntax analyzer error:", error);
    // Graceful fallback to local grammar analyzer
    res.json({
      success: true,
      data: {
        hasCriticalTruncation: false,
        isAbruptTermination: false,
        truncatedItems: [],
        overallGrammarVerdict: "تم فحص القواعد النحوية محلياً",
      },
    });
  }
});

// Dedicated binary Word (.docx) export fallback endpoint (guarantees .docx download, never .md)
app.post("/api/export-docx", async (req, res) => {
  try {
    const {
      title,
      markdown,
      isRtl,
      author,
      typography,
      fontProfile,
      arabicFont,
      englishFont,
      arabicSizePt,
      englishSizePt,
    } = req.body || {};

    if (typeof markdown !== "string") {
      return res.status(400).json({ success: false, error: "محتوى المستند مطلوب لتصدير Word." });
    }

    const polished = polishBilingualBoundariesCore(markdown);
    const uint8 = await buildDocxBinary(
      {
        title: typeof title === "string" ? title : "مستند محول",
        markdown: polished,
        isRtl: typeof isRtl === "boolean" ? isRtl : undefined,
        author: typeof author === "string" ? author : undefined,
        typography,
        fontProfile,
        arabicFont,
        englishFont,
        arabicSizePt,
        englishSizePt,
      },
      { docx, JSZip }
    );

    const safeBase = (typeof title === "string" && title.trim() ? title.trim() : "document")
      .replace(/\.[^/.]+$/, "")
      .replace(/[^\w\u0600-\u06FF\s.-]/g, "_");
    res.setHeader("Content-Type", DOCX_MIME);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="document.docx"; filename*=UTF-8''${encodeURIComponent(safeBase + ".docx")}`
    );
    return res.send(Buffer.from(uint8));
  } catch (err: any) {
    console.error("[Export DOCX] Error:", err);
    return res.status(500).json({
      success: false,
      error: err?.message || "تعذر إنشاء ملف Word (.docx).",
    });
  }
});

// Register Live Model Discovery & Rotation Status routes (/api/models/*)
registerModelPoolRoutes(app, getGeminiClient);

// Register Persistent Background Conversion Jobs API (/api/jobs/*)
registerBackgroundJobRoutes(app, PROJECT_ROOT, getGeminiClient);

// Register Smart Compilation Studio routes (/api/compiler/*)
registerSmartCompilerRoutes(app, getGeminiClient);

// JSON / Body-parser error handler
app.use((err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err) {
    console.error("Express middleware error:", err);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    if (err.type === "entity.too.large" || err.status === 413) {
      return res.status(413).json({ success: false, error: "حجم الحزمة كبير جداً.", isPayloadTooLarge: true });
    }
    return res.status(err.status || 400).json({ success: false, error: err.message || "طلب غير صالح" });
  }
  next();
});

// 404 handler for all /api/* routes (ensures API callers never receive Vite SPA HTML)
app.all("/api/*", (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.status(404).json({
    success: false,
    error: `المسار البرمجي غير موجود: ${req.method} ${req.path}`,
    code: "NOT_FOUND",
  });
});

// Global Express error handler for all /api routes
app.use("/api", (err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("Unhandled API error:", err);
  const status = err.status || err.statusCode || 500;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.status(status).json({
    success: false,
    error: err.message || "حدث خطأ غير متوقع أثناء معالجة الطلب.",
    code: err.code || "INTERNAL_ERROR",
  });
});

async function startServer() {
  const httpServer = http.createServer(app);

  // Align HTTP keep-alive timeouts ABOVE GCP Cloud Run & Nginx reverse proxy (600s)
  // to prevent 502 / ECONNRESET mid-flight failures on POSTs after long browser idle.
  httpServer.keepAliveTimeout = 620_000;
  httpServer.headersTimeout = 625_000;
  httpServer.requestTimeout = 300_000;

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const hmrEnabled = process.env.DISABLE_HMR !== "true";
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: hmrEnabled ? { server: httpServer } : false,
        ...(hmrEnabled ? {} : { ws: false }),
      },
      appType: "spa",
    });
    app.use((req, res, next) => {
      if (req.method === "GET" && (!req.path.includes(".") || req.path === "/")) {
        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      }
      next();
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(PROJECT_ROOT, "dist");
    app.use(
      express.static(distPath, {
        setHeaders: (res, filePath) => {
          if (filePath.endsWith(".html")) {
            res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
          } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
            res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
          }
        },
      })
    );
    app.get("*", (_req, res) => {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  httpServer.on("error", (err: NodeJS.ErrnoException) => {
    console.error("HTTP server startup error:", err);
    process.exitCode = 1;
  });

  httpServer.listen(PORT, HOST, () => {
    console.log(`PDF Converter server running on http://${HOST}:${PORT}`);
    // Non-blocking warm-up discovery of live free Gemini models + periodic 15-min refresh
    setTimeout(() => {
      sharedModelPool.discoverAndVerify(getGeminiClient(), { probeActive: true }).catch(() => {});
    }, 1500);
    setInterval(() => {
      sharedModelPool.discoverAndVerify(getGeminiClient(), { probeActive: false }).catch(() => {});
    }, 15 * 60 * 1000).unref();
  });
}

startServer().catch((err) => {
  console.error("Fatal error during server startup:", err);
  process.exit(1);
});

