import { PDFParse } from "pdf-parse";
import { toStandardArabic } from "../../shared/arabicText.js";
import { polishBilingualBoundariesCore } from "../../shared/arabicPipelineCore.js";
import {
  detectPdfUnderlines,
  applyVerifiedUnderlinesToPageText,
  normalizeCombiningUnderlines,
  type PdfUnderlineDetectionResult,
} from "../pdfUnderlineExtractor.js";

/**
 * Line-join threshold handed to pdf-parse. Matches `Math.abs(lastY - item.transform[5]) < 4`.
 */
const LINE_JOIN_Y_THRESHOLD = 4;
const PAGE_BREAK_MARKER = "---PAGE_BREAK---";

export interface DirectPdfExtractionResult {
  text: string;
  markdown: string;
  totalPages: number;
  hasDigitalText: boolean;
}

/**
 * Direct PDF text extraction helper using pdf-parse + geometric underline detection.
 * Runs locally on the server in milliseconds with 0 Gemini API calls.
 */
export async function extractDirectTextFromPdf(
  pdfBuffer: Buffer
): Promise<DirectPdfExtractionResult> {
  // pdf-parse v2 owns a pdf.js worker, so it must always be torn down.
  const parser = new PDFParse({ data: new Uint8Array(pdfBuffer) });

  try {
    const [parsed, underlineResult] = await Promise.all([
      parser.getText({ lineThreshold: LINE_JOIN_Y_THRESHOLD }),
      detectPdfUnderlines(pdfBuffer).catch(
        () => ({ pages: [], totalUnderlines: 0 } as PdfUnderlineDetectionResult)
      ),
    ]);

    const underlineByPage = new Map<number, string[]>();
    for (const pg of underlineResult.pages) {
      if (pg.underlinedPhrases.length > 0) {
        underlineByPage.set(pg.pageNumber, pg.underlinedPhrases);
      }
    }

    const rawPageTexts =
      parsed.pages.length > 0 ? parsed.pages.map((page) => page.text) : [parsed.text];

    const rawText = rawPageTexts
      .map((pg) => pg.replace(/[\u0332\u0333]/g, ""))
      .join(`\n\n${PAGE_BREAK_MARKER}\n\n`);
    const totalPages = parsed.total || rawPageTexts.length || 1;

    const rawPages = rawPageTexts
      .map((p: string) => p.trim())
      .filter((p: string) => p.length > 0);

    const formattedPages = (rawPages.length > 0 ? rawPages : [rawText.trim()]).map(
      (page: string, idx: number) => {
        const lines = page.split("\n");
        const mdLines = lines.map((line: string) => {
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
            /^(?:س\s*[٠-٩\d]+[:.\-)]?|السؤال\s+(?:الأول|الثاني|الثالث|الرابع|الخامس|السادس|السابع|الثامن|التاسع|العاشر|[٠-٩\d]+)|[٠-٩\d]+[\.\-\)]|\([٠-٩\d]+\))\s+/i.test(
              trimmed
            )
          ) {
            return `\n### ${trimmed}`;
          }
          return trimmed;
        });
        const mdPage = mdLines.join("\n");
        return applyVerifiedUnderlinesToPageText(
          mdPage,
          underlineByPage.get(idx + 1) || [],
          false
        );
      }
    );

    let fullMarkdown = formattedPages.join(`\n\n${PAGE_BREAK_MARKER}\n\n`);
    fullMarkdown = polishBilingualBoundariesCore(
      toStandardArabic(normalizeCombiningUnderlines(fullMarkdown))
    );
    const hasDigitalText = rawText.replace(/\s+/g, "").length > 50;

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
