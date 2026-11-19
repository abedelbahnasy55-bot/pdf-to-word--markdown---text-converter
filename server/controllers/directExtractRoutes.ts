import type { Express } from "express";
import { extractDirectTextFromPdf } from "../services/directPdfExtractor.js";

export function registerDirectExtractRoutes(app: Express): void {
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
          error:
            "لم يتم العثور على طبقة نصوص رقمية في الملف (الملف عبارة عن صور ممسوحة ضوئياً ويحتاج إلى التعرف البصري OCR).",
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
}
