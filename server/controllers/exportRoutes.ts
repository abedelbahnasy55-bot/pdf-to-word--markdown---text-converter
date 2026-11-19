import type { Express } from "express";
import JSZip from "jszip";
import * as docx from "docx";
import { polishBilingualBoundariesCore } from "../../shared/arabicPipelineCore.js";
import { buildDocxBinary, DOCX_MIME } from "../../shared/typographyDocxCore.js";

export function registerExportRoutes(app: Express): void {
  // Dedicated binary Word (.docx) export endpoint
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
}
