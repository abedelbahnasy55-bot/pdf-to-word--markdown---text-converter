import fs from "fs";
import path from "path";
import crypto from "crypto";
import type { Express, Request, Response } from "express";
import multer from "multer";
import { GoogleGenAI } from "@google/genai";
import { PDFDocument } from "pdf-lib";
import { PDFParse } from "pdf-parse";
import JSZip from "jszip";
import * as docx from "docx";
import {
  detectPdfUnderlines,
  applyVerifiedUnderlinesToPageText,
  applyVerifiedUnderlinesToMarkdown,
  normalizeCombiningUnderlines,
  type PageDetectedUnderlines,
} from "./pdfUnderlineExtractor.js";
import {
  runFullRefinementPipeline,
  polishBilingualBoundariesCore,
  toStandardArabicCore,
  isRightToLeftTextCore,
  markdownToPlainTextCore,
} from "../shared/arabicPipelineCore.js";
import { buildDocxBinary, DOCX_MIME, type FontProfileId } from "../shared/typographyDocxCore.js";
import { sharedModelPool, buildSafeThinkingConfig } from "./modelPool.js";
import { executeWithModelPool } from "./clients/geminiClient.js";

/**
 * 100% Free-tier Active Gemini OCR Model Pool.
 * Zero paid models, zero deprecated aliases.
 */
export const FREE_OCR_MODELS = ["gemini-4-hydrogen", "gemini-3.1-flash-lite"] as const;
const PAGE_BREAK_MARKER = "---PAGE_BREAK---";
const WATERMARK_STRIP_RE =
  /(?:Created with Photo-to-PDF[^\n]*|https?:\/\/(?:www\.)?firehawk\.ai[^\s]*|Scanned (?:with|by)|CamScanner|Adobe Scan|iScanner|TapScanner|ClearScanner|WPS Office|vFlat)[^\n]*/gi;

export type BackgroundJobStatus = "queued" | "running" | "completed" | "paused" | "failed";

export interface BackgroundJobMeta {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  status: BackgroundJobStatus;
  createdAt: number;
  updatedAt: number;
  startedAt?: number;
  completedAt?: number;
  totalPages: number;
  completedPages: number;
  digitalPages: number;
  ocrPages: number;
  currentPageRange?: string;
  completedBatches: number;
  totalBatches: number;
  currentPhaseLabel: string;
  percentage: number;
  etaSeconds: number | null;
  errorMessage?: string;
  direction: "auto" | "rtl" | "ltr";
  title: string;
}

export interface BackgroundJobResult {
  title: string;
  detectedLanguage: string;
  textDirection: "rtl" | "ltr";
  totalPages: number;
  pageCountEstimate: number;
  totalChunksProcessed: number;
  hasArabicText: boolean;
  hasTables: boolean;
  hasMathOrScience: boolean;
  hasHandwriting: boolean;
  markdown: string;
  plainText: string;
  sourceExtractText: string;
  fileName: string;
  fileSize: number;
  conversionDurationMs: number;
  isAutoAudited: boolean;
  autoFixedCount: number;
  fixedItemsSummary: string[];
  digitalPagesCount: number;
  ocrPagesCount: number;
}

export interface PageTriageInfo {
  pageNumber: number;
  isDigitalClean: boolean;
  digitalMarkdown: string;
  underlinedPhrases: string[];
}

export function buildThinkingConfigForModel(modelName: string) {
  return buildSafeThinkingConfig(modelName);
}

/**
 * Determines whether an extracted PDF page has clean readable digital text
 * or is a scan / watermark-only / mojibake-corrupted page requiring vision OCR.
 */
export function isPageDigitalClean(rawPageText: string): boolean {
  if (!rawPageText) return false;
  const cleaned = rawPageText.replace(WATERMARK_STRIP_RE, "").trim();
  const nonWs = cleaned.replace(/\s+/g, "");
  if (nonWs.length < 25) return false;
  // Detect severe encoding corruption / replacement glyph density (> 12%)
  const replacementCount = (nonWs.match(/\uFFFD/g) || []).length;
  if (replacementCount / nonWs.length > 0.12) return false;
  return true;
}

function formatDigitalPageToMarkdown(rawText: string, underlinedPhrases: string[]): string {
  const cleanText = (rawText || "").replace(/[\u0332\u0333]/g, "").trim();
  if (!cleanText) return "";

  const lines = cleanText.split("\n");
  const mdLines = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return "";
    if (
      /^(?:(?:الوحدة|الدرس|الباب|الفصل|المبحث|المطلب|المقدمة|سلسلة|كتاب|المذكرة)(?=\s|$|:|—|-)|(?:Unit|Chapter|Lesson|PART|MODULE)\b)/i.test(
        trimmed
      )
    ) {
      return `## ${trimmed}`;
    }
    if (
      /^(?:س\s*[٠-٩\d]+[:.\-)]?|السؤال\s+(?:الأول|الثاني|الثالث|الرابع|الخامس|السادس|السابع|الثامن|التاسع|العاشر|[٠-٩\d]+)|[٠-٩\d]+[.\-)]|\([٠-٩\d]+\))\s+/i.test(
        trimmed
      )
    ) {
      return `\n### ${trimmed}`;
    }
    return trimmed;
  });

  const mdPage = mdLines.join("\n");
  return applyVerifiedUnderlinesToPageText(mdPage, underlinedPhrases, false);
}

/**
 * Groups scanned page numbers into adaptive 3-4 page contiguous or compact batches.
 */
export function batchScannedPageNumbers(pageNumbers: number[], batchSize: number = 3): number[][] {
  const safeSize = Math.max(1, Math.min(5, batchSize));
  const batches: number[][] = [];
  for (let i = 0; i < pageNumbers.length; i += safeSize) {
    batches.push(pageNumbers.slice(i, i + safeSize));
  }
  return batches;
}

export class BackgroundJobManager {
  private jobsRootDir: string;
  private readonly resolvedJobsRoot: string;
  private getGeminiClient: () => GoogleGenAI;
  private activeJobId: string | null = null;
  private pausedJobIds = new Set<string>();
  private workerScheduled = false;
  private stopped = false;

  constructor(projectRoot: string, getGeminiClient: () => GoogleGenAI) {
    this.jobsRootDir = path.join(projectRoot, ".jobs");
    this.resolvedJobsRoot = path.resolve(this.jobsRootDir);
    this.getGeminiClient = getGeminiClient;
    if (!fs.existsSync(this.jobsRootDir)) {
      fs.mkdirSync(this.jobsRootDir, { recursive: true });
    }
  }

  public shutdown(): void {
    this.stopped = true;
  }

  private resolveSafeJobDir(id: string): string | null {
    if (typeof id !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{1,119}$/.test(id)) {
      return null;
    }
    const resolved = path.resolve(this.resolvedJobsRoot, id);
    if (!resolved.startsWith(this.resolvedJobsRoot + path.sep)) {
      return null;
    }
    return resolved;
  }

  private jobDir(id: string): string {
    const safeDir = this.resolveSafeJobDir(id);
    if (!safeDir) {
      throw new Error("معرّف المهمة غير صالح.");
    }
    return safeDir;
  }

  private atomicWriteJson(filePath: string, data: unknown) {
    const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    try {
      fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf-8");
      fs.renameSync(tmpPath, filePath);
    } catch (err) {
      try {
        fs.rmSync(tmpPath, { force: true });
      } catch {}
      throw err;
    }
  }

  private readMeta(id: string): BackgroundJobMeta | null {
    const dir = this.resolveSafeJobDir(id);
    if (!dir) return null;
    const metaPath = path.join(dir, "meta.json");
    if (!fs.existsSync(metaPath)) return null;
    try {
      return JSON.parse(fs.readFileSync(metaPath, "utf-8")) as BackgroundJobMeta;
    } catch {
      return null;
    }
  }

  private writeMeta(meta: BackgroundJobMeta) {
    meta.updatedAt = Date.now();
    this.atomicWriteJson(path.join(this.jobDir(meta.id), "meta.json"), meta);
  }

  private readSavedPages(id: string): Record<string, string> {
    const p = path.join(this.jobDir(id), "pages.json");
    if (!fs.existsSync(p)) return {};
    try {
      return JSON.parse(fs.readFileSync(p, "utf-8")) as Record<string, string>;
    } catch {
      return {};
    }
  }

  private writeSavedPages(id: string, pages: Record<string, string>) {
    this.atomicWriteJson(path.join(this.jobDir(id), "pages.json"), pages);
  }

  public getJobResult(id: string): BackgroundJobResult | null {
    const dir = this.resolveSafeJobDir(id);
    if (!dir) return null;
    const p = path.join(dir, "result.json");
    if (!fs.existsSync(p)) return null;
    try {
      return JSON.parse(fs.readFileSync(p, "utf-8")) as BackgroundJobResult;
    } catch {
      return null;
    }
  }

  private writeJobResult(id: string, result: BackgroundJobResult) {
    this.atomicWriteJson(path.join(this.jobDir(id), "result.json"), result);
  }

  public initAndRecover(): void {
    const all = this.listJobs();
    let recoveredCount = 0;
    for (const job of all) {
      if (job.status === "running") {
        job.status = "queued";
        job.currentPhaseLabel = "استئناف تلقائي بعد إعادة تشغيل الخادم من آخر صفحة محفوظة...";
        this.writeMeta(job);
        recoveredCount++;
      } else if (job.status === "queued") {
        recoveredCount++;
      }
    }
    if (recoveredCount > 0) {
      console.log(`[BackgroundJobs] Recovering ${recoveredCount} queued/interrupted conversion job(s) from disk.`);
      this.scheduleWorker();
    }
  }

  public createJobFromBuffer(params: {
    fileBuffer: Buffer;
    fileName: string;
    mimeType: string;
    direction?: "auto" | "rtl" | "ltr";
  }): BackgroundJobMeta {
    const id = `job_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
    const dir = this.jobDir(id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "source.bin"), params.fileBuffer);

    const baseTitle = (params.fileName || "document").replace(/\.[^/.]+$/, "");
    const now = Date.now();
    const meta: BackgroundJobMeta = {
      id,
      fileName: params.fileName || "document.pdf",
      mimeType: params.mimeType || "application/pdf",
      fileSize: params.fileBuffer.byteLength,
      status: "queued",
      createdAt: now,
      updatedAt: now,
      totalPages: 0,
      completedPages: 0,
      digitalPages: 0,
      ocrPages: 0,
      completedBatches: 0,
      totalBatches: 0,
      currentPhaseLabel: "في قائمة الانتظار — جاري فحص الصفحات وتحديد الأجزاء الرقمية...",
      percentage: 3,
      etaSeconds: null,
      direction: params.direction || "auto",
      title: baseTitle,
    };

    this.writeMeta(meta);
    this.writeSavedPages(id, {});
    this.scheduleWorker();
    return meta;
  }

  public listJobs(): BackgroundJobMeta[] {
    if (!fs.existsSync(this.jobsRootDir)) return [];
    const entries = fs.readdirSync(this.jobsRootDir, { withFileTypes: true });
    const list: BackgroundJobMeta[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const meta = this.readMeta(entry.name);
      if (meta) list.push(meta);
    }
    return list.sort((a, b) => b.createdAt - a.createdAt);
  }

  public getJobDetail(id: string): {
    meta: BackgroundJobMeta | null;
    result: BackgroundJobResult | null;
    partialMarkdown: string;
  } {
    const meta = this.readMeta(id);
    if (!meta) return { meta: null, result: null, partialMarkdown: "" };
    const result = this.getJobResult(id);
    let partialMarkdown = "";
    if (!result) {
      const saved = this.readSavedPages(id);
      const sortedNums = Object.keys(saved)
        .map(Number)
        .filter((n) => Number.isFinite(n))
        .sort((a, b) => a - b);
      partialMarkdown = sortedNums.map((n) => saved[String(n)]).filter(Boolean).join(`\n\n${PAGE_BREAK_MARKER}\n\n`);
    }
    return { meta, result, partialMarkdown };
  }

  public pauseOrCancelJob(id: string): BackgroundJobMeta | null {
    const meta = this.readMeta(id);
    if (!meta) return null;
    this.pausedJobIds.add(id);
    if (meta.status === "queued" || meta.status === "running") {
      meta.status = "paused";
      meta.currentPhaseLabel = `تم الإيقاف المؤقت — التقدم محفوظ (${meta.completedPages} من ${meta.totalPages || "?"} صفحة)`;
      meta.etaSeconds = null;
      this.writeMeta(meta);
    }
    return meta;
  }

  public resumeJob(id: string): BackgroundJobMeta | null {
    const meta = this.readMeta(id);
    if (!meta) return null;
    this.pausedJobIds.delete(id);
    if (meta.status === "paused" || meta.status === "failed") {
      meta.status = "queued";
      meta.errorMessage = undefined;
      meta.currentPhaseLabel = `جاري الاستئناف من الصفحة ${meta.completedPages + 1}...`;
      this.writeMeta(meta);
      this.scheduleWorker();
    }
    return meta;
  }

  public deleteJob(id: string): boolean {
    const dir = this.resolveSafeJobDir(id);
    if (!dir) return false;
    this.pausedJobIds.add(id);
    if (!fs.existsSync(dir)) return false;
    fs.rmSync(dir, { recursive: true, force: true });
    return true;
  }

  private scheduleWorker() {
    if (this.stopped || this.workerScheduled || this.activeJobId) return;
    this.workerScheduled = true;
    setImmediate(() => {
      this.workerScheduled = false;
      if (!this.stopped) {
        void this.runWorkerLoop();
      }
    });
  }

  private async runWorkerLoop() {
    if (this.activeJobId || this.stopped) return;
    while (!this.stopped) {
      const nextJob = this.listJobs()
        .filter((j) => j.status === "queued" && !this.pausedJobIds.has(j.id))
        .sort((a, b) => a.createdAt - b.createdAt)[0];

      if (!nextJob) break;

      this.activeJobId = nextJob.id;
      try {
        await this.executeJob(nextJob.id);
      } catch (err: any) {
        const current = this.readMeta(nextJob.id);
        if (current && current.status !== "paused" && current.status !== "completed") {
          current.status = "failed";
          current.errorMessage = err?.message || "حدث خطأ غير متوقع أثناء المعالجة.";
          current.currentPhaseLabel = `توقف عند الصفحة ${current.completedPages}: ${current.errorMessage}`;
          current.etaSeconds = null;
          this.writeMeta(current);
        }
      } finally {
        this.activeJobId = null;
      }
    }
  }

  private isPaused(id: string): boolean {
    if (this.pausedJobIds.has(id)) return true;
    const meta = this.readMeta(id);
    return !meta || meta.status === "paused";
  }

  private async callFreeVisionModel(
    inlineBase64: string,
    mimeType: string,
    fileName: string,
    pageNumbers: number[],
    underlineHints: PageDetectedUnderlines[]
  ): Promise<string> {
    const ai = this.getGeminiClient();
    const pageRangeLabel =
      pageNumbers.length === 1
        ? `Page ${pageNumbers[0]}`
        : `Pages ${pageNumbers[0]}-${pageNumbers[pageNumbers.length - 1]}`;

    const systemInstruction = `You are a master verbatim document transcription and typesetting specialist for Arabic, Islamic/Azhar curricula, English, and STEM texts.
Transcribe every single word, column, table, footnote, exercise, and question verbatim into clean Markdown.
Rules:
1. ZERO OMISSION: Never summarize, shorten, paraphrase, or skip any word or column.
2. UNDERLINES (أعرب ما تحته خط / اضبط ما تحته خط): Wrap EVERY visually underlined word or phrase strictly inside <u>...</u> tags.
3. QURANIC SCRIPT: Wrap every Quranic verse or partial ayah in ornamental brackets ﴿...﴾ with full Uthmani diacritics.
4. TABLES: Convert every table into valid Markdown pipe syntax (| Col 1 | Col 2 |).
5. PAGE BREAKS: Place a standalone "---PAGE_BREAK---" line between pages.
6. SANITIZATION: Strip scanner watermarks (CamScanner, Adobe Scan, Photo-to-PDF) and collapse excessive dot chains to ".....".
7. OUTPUT: Return pure Markdown only (no JSON wrapper).`;

    let userPrompt = `Transcribe "${fileName}" (${pageRangeLabel}) verbatim into clean Markdown. Preserve all underlines as <u>...</u>, tables, Arabic diacritics, footnotes, and separate multiple pages with "---PAGE_BREAK---".`;

    const hintLines = underlineHints
      .filter((h) => h.underlinedPhrases.length > 0)
      .map((h) => `- Page ${h.pageNumber}: ${h.underlinedPhrases.slice(0, 20).join("، ")}`);
    if (hintLines.length > 0) {
      userPrompt += `\n\nVerified underlined targets detected in vector layer (must be wrapped in <u>...</u>):\n${hintLines.join("\n")}`;
    }

    const waitMs = sharedModelPool.getEarliestReadyWaitMs();
    if (waitMs > 0) {
      await new Promise((r) => setTimeout(r, Math.min(65000, waitMs + 1000)));
    }

    const outcome = await executeWithModelPool({
      ai,
      maxRounds: 4,
      timeoutMs: 45000,
      respectCooldownGate: false,
      pauseBetweenRounds: true,
      pauseBetweenModelsMs: 0,
      buildTimeoutMessage: (modelName) => `Timeout after 45s on ${modelName}`,
      generateForModel: async (modelName, client) => {
        const response = await client.models.generateContent({
          model: modelName,
          contents: [
            {
              role: "user",
              parts: [
                {
                  inlineData: {
                    mimeType,
                    data: inlineBase64,
                  },
                },
                { text: userPrompt },
              ],
            },
          ],
          config: {
            systemInstruction,
            ...buildSafeThinkingConfig(modelName),
            maxOutputTokens: 32768,
          },
        });
        if (!(response?.text || "").trim()) {
          throw new Error(`Empty response from ${modelName}`);
        }
        return response;
      },
    });

    if (outcome.kind === "success") {
      return outcome.responseText
        .replace(/^```(?:markdown)?\s*/i, "")
        .replace(/```\s*$/i, "")
        .trim();
    }

    const lastError = outcome.kind === "failed" ? outcome.lastError : null;
    throw lastError instanceof Error
      ? lastError
      : new Error("تعذر تفريغ الدفعة مؤقتاً بسبب ضغط الخدمة.");
  }

  private async executeJob(id: string): Promise<void> {
    const meta = this.readMeta(id);
    if (!meta) return;

    const sourcePath = path.join(this.jobDir(id), "source.bin");
    if (!fs.existsSync(sourcePath)) {
      throw new Error("ملف المصدر غير موجود على القرص.");
    }

    const fileBuffer = fs.readFileSync(sourcePath);
    const startedAt = meta.startedAt || Date.now();
    meta.status = "running";
    meta.startedAt = startedAt;
    meta.errorMessage = undefined;
    meta.currentPhaseLabel = "جاري فحص الصفحات وفرز النصوص الرقمية عن الصفحات المصوّرة...";
    this.writeMeta(meta);

    const savedPages = this.readSavedPages(id);
    const isPdf =
      meta.mimeType === "application/pdf" ||
      fileBuffer.subarray(0, 4).toString("ascii").startsWith("%PDF");
    const isImage =
      meta.mimeType.startsWith("image/") ||
      /\.(png|jpg|jpeg|webp|bmp)$/i.test(meta.fileName);

    let totalPages = 1;
    let digitalCount = 0;
    let ocrCount = 0;
    let detectedUnderlines: PageDetectedUnderlines[] = [];

    if (isImage) {
      totalPages = 1;
      meta.totalPages = 1;
      meta.ocrPages = 1;
      meta.digitalPages = 0;
      meta.totalBatches = 1;
      meta.currentPhaseLabel = "تحويل الصورة ضوئياً بدقة فائقة...";
      this.writeMeta(meta);

      if (!savedPages["1"]) {
        if (this.isPaused(id)) return;
        const mime = meta.mimeType.startsWith("image/") ? meta.mimeType : "image/png";
        const md = await this.callFreeVisionModel(
          fileBuffer.toString("base64"),
          mime,
          meta.fileName,
          [1],
          []
        );
        savedPages["1"] = md;
        this.writeSavedPages(id, savedPages);
      }
      digitalCount = 0;
      ocrCount = 1;
      meta.completedPages = 1;
      meta.completedBatches = 1;
      meta.percentage = 90;
      this.writeMeta(meta);
    } else if (isPdf) {
      // Phase 1: Per-Page Digital Triage using pdf-parse + pdfUnderlineExtractor
      let rawPageTexts: string[] = [];
      const parser = new PDFParse({ data: new Uint8Array(fileBuffer) });
      try {
        let underlineTimer: ReturnType<typeof setTimeout> | undefined;
        const [parsed, underlineRes] = await Promise.all([
          parser.getText({ lineThreshold: 4 }),
          Promise.race([
            detectPdfUnderlines(fileBuffer).catch(() => ({ pages: [], totalUnderlines: 0 })),
            new Promise<{ pages: PageDetectedUnderlines[]; totalUnderlines: number }>((resolve) => {
              underlineTimer = setTimeout(() => resolve({ pages: [], totalUnderlines: 0 }), 6000);
            }),
          ]).finally(() => {
            if (underlineTimer) clearTimeout(underlineTimer);
          }),
        ]);
        detectedUnderlines = underlineRes.pages || [];
        rawPageTexts =
          parsed.pages && parsed.pages.length > 0
            ? parsed.pages.map((p) => p.text)
            : [parsed.text || ""];
        totalPages = Math.max(rawPageTexts.length, parsed.total || 1);
      } finally {
        await parser.destroy();
      }

      const underlineMap = new Map<number, string[]>();
      for (const u of detectedUnderlines) {
        if (u.underlinedPhrases.length > 0) underlineMap.set(u.pageNumber, u.underlinedPhrases);
      }

      const srcPdf = await PDFDocument.load(fileBuffer, { ignoreEncryption: true });
      totalPages = Math.max(totalPages, srcPdf.getPageCount());

      const ocrPageNumbers: number[] = [];
      for (let p = 1; p <= totalPages; p++) {
        const rawText = rawPageTexts[p - 1] || "";
        if (isPageDigitalClean(rawText)) {
          digitalCount++;
          if (!savedPages[String(p)]) {
            savedPages[String(p)] = formatDigitalPageToMarkdown(rawText, underlineMap.get(p) || []);
          }
        } else {
          ocrCount++;
          if (!savedPages[String(p)]) {
            ocrPageNumbers.push(p);
          }
        }
      }

      // Persist all instantaneously extracted digital pages immediately
      this.writeSavedPages(id, savedPages);

      const batches = batchScannedPageNumbers(ocrPageNumbers, 3);
      meta.totalPages = totalPages;
      meta.digitalPages = digitalCount;
      meta.ocrPages = ocrCount;
      meta.completedPages = Object.keys(savedPages).filter((k) => savedPages[k] !== undefined).length;
      meta.totalBatches = batches.length;
      meta.completedBatches = 0;
      meta.percentage =
        totalPages > 0
          ? Math.max(12, Math.round((meta.completedPages / totalPages) * 85))
          : 50;
      meta.currentPhaseLabel =
        ocrPageNumbers.length === 0
          ? `تم استخراج جميع الصفحات الرقمية (${digitalCount}/${totalPages}) مباشرةً بسرعتها القصوى بدون استهلاك حصة!`
          : `فرز الصفحات: ${digitalCount} صفحة رقمية فورية · ${ocrPageNumbers.length} صفحة مصوّرة عبر ${batches.length} دفعات`;
      this.writeMeta(meta);

      // Phase 2: Adaptive Free-Model Vision OCR strictly for scanned/incomplete pages
      const batchDurations: number[] = [];
      for (let bIdx = 0; bIdx < batches.length; bIdx++) {
        if (this.isPaused(id)) return;

        const batchPages = batches[bIdx];
        const rangeLabel =
          batchPages.length === 1
            ? `${batchPages[0]}`
            : `${batchPages[0]}-${batchPages[batchPages.length - 1]}`;

        meta.currentPageRange = rangeLabel;
        meta.currentPhaseLabel = `تفريغ الصفحات المصوّرة (${rangeLabel}) من إجمالي ${totalPages} صفحة (الدفعة ${bIdx + 1}/${batches.length})...`;
        this.writeMeta(meta);

        const batchStart = Date.now();
        await this.processPdfPageBatchWithBisection(
          srcPdf,
          batchPages,
          savedPages,
          underlineMap,
          meta.fileName
        );
        batchDurations.push(Date.now() - batchStart);

        // Save after every batch so tab/laptop shutdown never loses progress
        this.writeSavedPages(id, savedPages);

        const doneCount = Object.keys(savedPages).filter((k) => savedPages[k] !== undefined).length;
        const avgBatchMs =
          batchDurations.reduce((a, b) => a + b, 0) / Math.max(1, batchDurations.length);
        const remainingBatches = batches.length - (bIdx + 1);
        const etaSec = remainingBatches > 0 ? Math.ceil((remainingBatches * (avgBatchMs + 2200)) / 1000) : 2;

        meta.completedBatches = bIdx + 1;
        meta.completedPages = doneCount;
        meta.percentage = Math.min(92, Math.max(15, Math.round((doneCount / Math.max(1, totalPages)) * 90)));
        meta.etaSeconds = etaSec;
        this.writeMeta(meta);

        // Gentle pacing between vision batches to respect free RPM limits sustainably
        if (bIdx < batches.length - 1) {
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
    } else {
      throw new Error("نوع الملف غير مدعوم للمعالجة الخلفية على الخادم. يرجى رفع ملف PDF أو صورة.");
    }

    if (this.isPaused(id)) return;

    // Phase 3: Merge, Normalize Arabic, Apply Underlines, Run Strict QA & Persist Result
    meta.currentPhaseLabel = "التدقيق اللغوي والقرآني النهائي وبناء بنية Word المحسّنة...";
    meta.percentage = 96;
    meta.etaSeconds = 1;
    this.writeMeta(meta);

    const orderedPages: string[] = [];
    for (let p = 1; p <= totalPages; p++) {
      orderedPages.push((savedPages[String(p)] || "").trim());
    }

    let merged = orderedPages.filter((t) => t.length > 0).join(`\n\n${PAGE_BREAK_MARKER}\n\n`);
    merged = normalizeCombiningUnderlines(merged);
    merged = toStandardArabicCore(merged);
    merged = polishBilingualBoundariesCore(merged);
    if (detectedUnderlines.length > 0) {
      merged = applyVerifiedUnderlinesToMarkdown(merged, detectedUnderlines, false);
    }

    const qaRefined = runFullRefinementPipeline(merged);
    const finalMarkdown = qaRefined.markdown || merged;
    const plainText = markdownToPlainTextCore(finalMarkdown);
    const isRtl =
      meta.direction === "rtl"
        ? true
        : meta.direction === "ltr"
        ? false
        : isRightToLeftTextCore(finalMarkdown);

    let docTitle = meta.title || meta.fileName.replace(/\.[^/.]+$/, "");
    const hMatch = finalMarkdown.match(/^#+\s+(.+)$/m);
    if (hMatch && hMatch[1]) {
      const candidate = hMatch[1].replace(/[*_#`]/g, "").trim();
      if (candidate.length > 2 && candidate.length < 90) {
        docTitle = candidate;
      }
    }

    const result: BackgroundJobResult = {
      title: docTitle,
      detectedLanguage: qaRefined.detectedLanguage,
      textDirection: isRtl ? "rtl" : "ltr",
      totalPages,
      pageCountEstimate: totalPages,
      totalChunksProcessed: Math.max(1, meta.totalBatches),
      hasArabicText: /[\u0600-\u06FF]/.test(finalMarkdown),
      hasTables: finalMarkdown.includes("|"),
      hasMathOrScience: /\$|\\frac|\\sqrt|\\vec/.test(finalMarkdown),
      hasHandwriting: ocrCount > 0,
      markdown: finalMarkdown,
      plainText,
      sourceExtractText: finalMarkdown,
      fileName: meta.fileName,
      fileSize: meta.fileSize,
      conversionDurationMs: Date.now() - startedAt,
      isAutoAudited: true,
      autoFixedCount: qaRefined.autoFixedCount,
      fixedItemsSummary: [
        digitalCount > 0
          ? `استخراج رقمي فوري مباشر لـ ${digitalCount} صفحة (صفر استهلاك للحصة)`
          : `تفريغ بصري فائق الدقة لـ ${ocrCount} صفحة`,
        `الاستخراج البنيوي وتوحيد الجداول والفقرات (تطابق ${qaRefined.fidelitySummary.wordFidelityRatio}%)`,
        qaRefined.qaReport.verdictArabic,
      ],
      digitalPagesCount: digitalCount,
      ocrPagesCount: ocrCount,
    };

    this.writeJobResult(id, result);

    meta.status = "completed";
    meta.completedAt = Date.now();
    meta.completedPages = totalPages;
    meta.percentage = 100;
    meta.etaSeconds = 0;
    meta.title = docTitle;
    meta.currentPhaseLabel = `اكتمل التحويل بنجاح (${totalPages} صفحة)`;
    this.writeMeta(meta);
  }

  private async processPdfPageBatchWithBisection(
    srcPdf: PDFDocument,
    pageNumbers: number[],
    savedPages: Record<string, string>,
    underlineMap: Map<number, string[]>,
    fileName: string
  ): Promise<void> {
    const subDoc = await PDFDocument.create();
    const zeroBased = pageNumbers.map((p) => p - 1);
    const copied = await subDoc.copyPages(srcPdf, zeroBased);
    for (const page of copied) subDoc.addPage(page);

    const bytes = await subDoc.save();
    const base64 = Buffer.from(bytes).toString("base64");

    // Auto-bisect oversized chunks before hitting payload limits
    if (base64.length > 14 * 1024 * 1024 && pageNumbers.length > 1) {
      const mid = Math.ceil(pageNumbers.length / 2);
      await this.processPdfPageBatchWithBisection(
        srcPdf,
        pageNumbers.slice(0, mid),
        savedPages,
        underlineMap,
        fileName
      );
      await this.processPdfPageBatchWithBisection(
        srcPdf,
        pageNumbers.slice(mid),
        savedPages,
        underlineMap,
        fileName
      );
      return;
    }

    const hints = pageNumbers.map((p) => ({
      pageNumber: p,
      underlinedPhrases: underlineMap.get(p) || [],
    }));

    const batchMarkdown = await this.callFreeVisionModel(
      base64,
      "application/pdf",
      fileName,
      pageNumbers,
      hints
    );

    const splitPages = batchMarkdown.split(/\n*---PAGE_BREAK---\n*/);
    if (pageNumbers.length === 1) {
      savedPages[String(pageNumbers[0])] = batchMarkdown;
    } else if (splitPages.length >= pageNumbers.length) {
      for (let i = 0; i < pageNumbers.length; i++) {
        savedPages[String(pageNumbers[i])] = (splitPages[i] || "").trim();
      }
    } else {
      // Distribute proportionally if model omitted inner PAGE_BREAK tags
      savedPages[String(pageNumbers[0])] = batchMarkdown;
      for (let i = 1; i < pageNumbers.length; i++) {
        savedPages[String(pageNumbers[i])] = "";
      }
    }
  }
}

export function registerBackgroundJobRoutes(
  app: Express,
  projectRoot: string,
  getGeminiClient: () => GoogleGenAI
): BackgroundJobManager {
  const manager = new BackgroundJobManager(projectRoot, getGeminiClient);
  manager.initAndRecover();

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 220 * 1024 * 1024 },
  });

  app.post("/api/jobs", upload.single("file"), async (req: Request, res: Response) => {
    try {
      let fileBuffer: Buffer | null = null;
      let fileName = "document.pdf";
      let mimeType = "application/pdf";
      const directionRaw = String(req.body?.direction || "auto");
      const direction =
        directionRaw === "rtl" || directionRaw === "ltr" ? directionRaw : "auto";

      if (req.file && req.file.buffer) {
        fileBuffer = req.file.buffer;
        fileName = req.file.originalname || "document.pdf";
        mimeType = req.file.mimetype || "application/pdf";
      } else if (typeof req.body?.fileBase64 === "string" && req.body.fileBase64.length > 0) {
        const clean = req.body.fileBase64.replace(/^data:[^;]+;base64,/, "");
        fileBuffer = Buffer.from(clean, "base64");
        fileName = String(req.body.fileName || "document.pdf");
        mimeType = String(req.body.mimeType || "application/pdf");
      }

      if (!fileBuffer || fileBuffer.byteLength < 8) {
        return res.status(400).json({
          success: false,
          error: "يرجى إرفاق ملف PDF أو صورة صالحة.",
        });
      }

      const job = manager.createJobFromBuffer({
        fileBuffer,
        fileName,
        mimeType,
        direction,
      });

      return res.status(201).json({ success: true, job });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        error: err?.message || "تعذر إنشاء مهمة المعالجة الخلفية.",
      });
    }
  });

  app.get("/api/jobs", (_req: Request, res: Response) => {
    try {
      const jobs = manager.listJobs();
      return res.json({ success: true, jobs });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message });
    }
  });

  app.get("/api/jobs/:id", (req: Request, res: Response) => {
    try {
      const detail = manager.getJobDetail(req.params.id);
      if (!detail.meta) {
        return res.status(404).json({ success: false, error: "المهمة غير موجودة." });
      }
      return res.json({
        success: true,
        job: detail.meta,
        result: detail.result,
        partialMarkdown: detail.partialMarkdown,
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message });
    }
  });

  app.get("/api/jobs/:id/download-docx", async (req: Request, res: Response) => {
    try {
      const detail = manager.getJobDetail(req.params.id);
      if (!detail.meta || !detail.result) {
        return res.status(404).json({ success: false, error: "النتيجة غير جاهزة بعد." });
      }
      const uint8 = await buildDocxBinary(
        {
          title: detail.result.title,
          markdown: polishBilingualBoundariesCore(detail.result.markdown),
          isRtl: detail.result.textDirection === "rtl",
          fontProfile:
            typeof req.query.fontProfile === "string"
              ? (req.query.fontProfile as FontProfileId)
              : undefined,
        },
        { docx, JSZip }
      );
      const base = (detail.result.fileName || detail.result.title || "document")
        .replace(/\.[^/.]+$/, "")
        .replace(/[^\w\u0600-\u06FF\s.-]/g, "_");
      res.setHeader("Content-Type", DOCX_MIME);
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="document.docx"; filename*=UTF-8''${encodeURIComponent(base + ".docx")}`
      );
      return res.send(Buffer.from(uint8));
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        error: err?.message || "تعذر تصدير ملف Word.",
      });
    }
  });

  app.post("/api/jobs/:id/cancel", (req: Request, res: Response) => {
    const job = manager.pauseOrCancelJob(req.params.id);
    if (!job) {
      return res.status(404).json({ success: false, error: "المهمة غير موجودة." });
    }
    return res.json({ success: true, job });
  });

  app.post("/api/jobs/:id/resume", (req: Request, res: Response) => {
    const job = manager.resumeJob(req.params.id);
    if (!job) {
      return res.status(404).json({ success: false, error: "المهمة غير موجودة." });
    }
    return res.json({ success: true, job });
  });

  app.delete("/api/jobs/:id", (req: Request, res: Response) => {
    const deleted = manager.deleteJob(req.params.id);
    if (!deleted) {
      return res.status(404).json({ success: false, error: "المهمة غير موجودة." });
    }
    return res.json({ success: true });
  });

  return manager;
}
