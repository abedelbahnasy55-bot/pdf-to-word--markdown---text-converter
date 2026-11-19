import type { Express } from "express";
import { extractDirectTextFromPdf } from "../services/directPdfExtractor.js";
import type { GovernanceManager } from "../governanceManager.js";

export function registerDirectExtractRoutes(
  app: Express,
  governance?: GovernanceManager
): void {
  app.post("/api/extract-direct-pdf", async (req, res) => {
    const startedAt = Date.now();
    const isManagedClient = req.headers["x-telemetry-managed"] === "1";
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
          error:
            "لم يتم العثور على طبقة نصوص رقمية في الملف (الملف عبارة عن صور ممسوحة ضوئياً ويحتاج إلى التعرف البصري OCR).",
        });
      }

      const isArabic = (result.markdown.match(/[\u0600-\u06FF]/g) || []).length > 20;

      if (governance && !isManagedClient) {
        const identity = governance.extractClientIdentity(req);
        const wordsCount = result.text.trim() ? result.text.trim().split(/\s+/).length : 0;
        governance.recordConversionEvent({
          clientId: identity.clientId,
          ip: identity.ip,
          deviceLabel: identity.deviceLabel,
          fileName: filename || "document.pdf",
          fileSize: pdfBuffer.byteLength,
          mimeType: "application/pdf",
          operation: "direct-extract",
          status: "completed",
          pagesCount: result.totalPages || 1,
          wordsCount,
          charsCount: result.markdown.length,
          extractionMethod: "direct_digital_extraction",
          durationMs: Date.now() - startedAt,
          startedAt,
          completedAt: Date.now(),
        });
      }

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
}
