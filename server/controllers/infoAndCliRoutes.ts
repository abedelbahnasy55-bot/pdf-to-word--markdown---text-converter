import fs from "fs";
import path from "path";
import type { Express } from "express";
import JSZip from "jszip";
import { TYPOGRAPHY_PROFILES } from "../../shared/typographyDocxCore.js";
import { sharedModelPool } from "../modelPool.js";
import { getPublicOrigin } from "../config/runtimeConfig.js";

function injectServerOrigin(code: string, origin: string): string {
  return code
    .replace(
      /https:\/\/ais-(?:dev|pre)-wpsct27fdufcpry5x6ikjn-685461883733\.europe-west2\.run\.app/g,
      origin
    )
    .replace(
      /https:\/\/pdf-to-word-markdown-text-converter\.ai\.studio/g,
      origin
    );
}

const BUNDLE_SCRIPT_FILES: Array<{ name: string; replace: boolean }> = [
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

const BUNDLE_SHARED_FILES = ["arabicPipelineCore.js", "typographyDocxCore.js"] as const;

function resolveScriptDownloadEntry(
  projectRoot: string,
  scriptName: string
): { path: string; filename: string; mime: string } | undefined {
  const scriptsRoot = path.join(projectRoot, "scripts");
  const scriptMap: Record<string, { path: string; filename: string; mime: string }> = {
    "mcp-server": {
      path: path.join(scriptsRoot, "mcp-server.js"),
      filename: "mcp-server.js",
      mime: "application/javascript; charset=utf-8",
    },
    "batch-runner-js": {
      path: path.join(scriptsRoot, "batch-runner.js"),
      filename: "batch-runner.js",
      mime: "application/javascript; charset=utf-8",
    },
    "batch-runner-py": {
      path: path.join(scriptsRoot, "batch_runner.py"),
      filename: "batch_runner.py",
      mime: "text/x-python; charset=utf-8",
    },
    "run-batch-bat": {
      path: path.join(scriptsRoot, "run_batch.bat"),
      filename: "run_batch.bat",
      mime: "application/x-bat; charset=utf-8",
    },
    "run-batch-sh": {
      path: path.join(scriptsRoot, "run_batch.sh"),
      filename: "run_batch.sh",
      mime: "application/x-sh; charset=utf-8",
    },
    "package-json": {
      path: path.join(scriptsRoot, "package.json"),
      filename: "package.json",
      mime: "application/json; charset=utf-8",
    },
    "package.json": {
      path: path.join(scriptsRoot, "package.json"),
      filename: "package.json",
      mime: "application/json; charset=utf-8",
    },
    "install-sh": {
      path: path.join(scriptsRoot, "install.sh"),
      filename: "install.sh",
      mime: "application/x-sh; charset=utf-8",
    },
    "install.sh": {
      path: path.join(scriptsRoot, "install.sh"),
      filename: "install.sh",
      mime: "application/x-sh; charset=utf-8",
    },
    "install-bat": {
      path: path.join(scriptsRoot, "install.bat"),
      filename: "install.bat",
      mime: "application/x-bat; charset=utf-8",
    },
    "install.bat": {
      path: path.join(scriptsRoot, "install.bat"),
      filename: "install.bat",
      mime: "application/x-bat; charset=utf-8",
    },
    readme: {
      path: path.join(scriptsRoot, "README.md"),
      filename: "README.md",
      mime: "text/markdown; charset=utf-8",
    },
    "readme.md": {
      path: path.join(scriptsRoot, "README.md"),
      filename: "README.md",
      mime: "text/markdown; charset=utf-8",
    },
  };
  return scriptMap[scriptName];
}

export function registerInfoAndCliRoutes(app: Express, projectRoot: string): void {
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

  // Full API Documentation & Contract Specification
  app.get("/api/info", (req, res) => {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    const origin = getPublicOrigin(req);

    res.json({
      name: "PDF Converter API",
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
          magicByteValidation: ["%PDF", "PNG", "JPEG", "WEBP"],
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
            markdown:
              "string (pristine verbatim Markdown with authentic Uthmani Quran in ﴿...﴾ and tables)",
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
    const guidePath = path.join(projectRoot, "LINKS_GUIDE.md");
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
          description:
            "تحويل كتاب محدد إلى مستند Word (.docx) بالخطوط المعايرة وفصل الاتجاه العربي/الإنجليزي مع العمل تلقائياً حتى عند توقف السيرفر",
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
    const currentOrigin = getPublicOrigin(req);

    if (scriptName === "bundle" || scriptName === "bundle.zip" || scriptName === "all") {
      try {
        const zip = new JSZip();
        const scriptsDir = path.join(projectRoot, "scripts");
        const sharedDir = path.join(projectRoot, "shared");

        for (const f of BUNDLE_SCRIPT_FILES) {
          const fullPath = path.join(scriptsDir, f.name);
          if (fs.existsSync(fullPath)) {
            let fileData = fs.readFileSync(fullPath, "utf-8");
            if (f.replace) {
              fileData = injectServerOrigin(fileData, currentOrigin);
            }
            zip.file(f.name, fileData);
          }
        }

        for (const sharedFile of BUNDLE_SHARED_FILES) {
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

    const target = resolveScriptDownloadEntry(projectRoot, scriptName);
    if (!target || !fs.existsSync(target.path)) {
      return res.status(404).json({ success: false, error: "Script not found" });
    }

    try {
      const content = injectServerOrigin(fs.readFileSync(target.path, "utf-8"), currentOrigin);
      res.setHeader("Content-Disposition", `attachment; filename="${target.filename}"`);
      res.setHeader("Content-Type", target.mime);
      return res.send(content);
    } catch {
      res.setHeader("Content-Disposition", `attachment; filename="${target.filename}"`);
      res.setHeader("Content-Type", target.mime);
      return res.sendFile(target.path);
    }
  });
}
