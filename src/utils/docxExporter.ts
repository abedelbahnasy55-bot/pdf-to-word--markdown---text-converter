import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  BorderStyle,
  WidthType,
  convertInchesToTwip,
  ShadingType,
  PageBreak,
  FootnoteReferenceRun,
} from "docx";
import JSZip from "jszip";
import { toStandardArabic } from "../../shared/arabicText";

interface DocxExportOptions {
  title: string;
  markdown: string;
  isRtl?: boolean;
  author?: string;
}

function createRunOptions(text: string, fontName: string, isRtl: boolean, extra: any = {}) {
  // Setup font config to handle Arabic (complex script) and ASCII seamlessly
  const fontConfig = {
    ascii: fontName,
    cs: fontName,
    hAnsi: fontName,
    eastAsia: fontName,
  };

  const targetSize = extra.size || 26;

  return {
    text: text,
    font: fontConfig,
    rightToLeft: isRtl, // crucial for Arabic characters rendering direction
    // Mirror bold/italic/size to complex scripts properties for Word Arabic rendering
    boldComplexScript: extra.bold,
    italicsComplexScript: extra.italics,
    sizeComplexScript: targetSize,
    // Tag the language per run so Word applies Arabic typography: correct contextual
    // letterforms, justification, and digit rendering. Verified against the library:
    // run-level `language` emits <w:lang w:val="ar-SA" w:bidi="ar-SA"/>, whereas the
    // same option on the default document style is silently dropped, so it belongs
    // here rather than in styles.default.
    ...(isRtl ? { language: { value: "ar-SA", bidirectional: "ar-SA" } } : {}),
    ...extra,
  };
}

/**
 * Splits a mixed Arabic/Latin/digit string into runs of uniform script.
 *
 * A single run cannot be both right-to-left and left-to-right. When Arabic prose
 * contains a Latin term or a number — and Azhar curricula contain both constantly:
 * page references, years, transliterated names, English chapter titles — marking
 * the whole run RTL makes Word reorder those embedded fragments by the bidi
 * algorithm, which is what produces the classic symptom of an Arabic line whose
 * numbers, Latin words, or trailing punctuation appear in the wrong order.
 *
 * So the string is split at script boundaries and each segment is emitted as its own
 * run, RTL for Arabic and neutral script, LTR for Latin and digits. Word then has no
 * mixed run to misorder, and the visual result matches the source document.
 *
 * Script boundaries are computed on the ALREADY-NORMALIZED string, so presentation
 * forms never influence segmentation.
 */
interface ScriptSegment {
  text: string;
  isArabic: boolean;
}

const isArabicSegment = (text: string): boolean => /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(text);

export function segmentByScript(text: string): ScriptSegment[] {
  if (!text) return [];
  const segments: ScriptSegment[] = [];
  let buffer = '';
  let bufferIsArabic: boolean | null = null;

  for (const char of text) {
    // Digits, Latin, and neutral characters (spaces, punctuation) attach to the
    // surrounding run rather than forming a run of their own, so a number inside an
    // Arabic sentence stays with the Arabic instead of being split out as LTR.
    const charIsArabic = isArabicSegment(char);
    const isNeutralOrLatin = /[0-9A-Za-z\s.,:;!?()[\]{}'"«»\-–—/\\%*+=<>@#&_]/.test(char);

    let effective = charIsArabic;
    if (!charIsArabic && isNeutralOrLatin && bufferIsArabic !== null) {
      effective = bufferIsArabic;
    }

    if (bufferIsArabic === null) {
      bufferIsArabic = effective;
      buffer = char;
      continue;
    }

    if (effective === bufferIsArabic) {
      buffer += char;
    } else {
      segments.push({ text: buffer, isArabic: bufferIsArabic });
      buffer = char;
      bufferIsArabic = effective;
    }
  }

  if (buffer) segments.push({ text: buffer, isArabic: bufferIsArabic === true });
  return segments;
}

/**
 * Converts any HTML tables (<table>...</table>) inside OCR/AI output into clean Markdown tables
 */
function convertHtmlTablesToMarkdown(text: string): string {
  if (!text || !text.includes("<table")) return text;
  return text.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (_, tableContent) => {
    const rows: string[][] = [];
    const trMatches = tableContent.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);
    if (!trMatches) return '';
    for (const tr of trMatches) {
      const cells: string[] = [];
      const cellMatches = tr.match(/<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/gi);
      if (cellMatches) {
        for (const cell of cellMatches) {
          const cellText = cell
            .replace(/<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/gi, '$1')
            .replace(/<[^>]+>/g, '')
            .replace(/\r?\n+/g, ' ')
            .trim();
          cells.push(cellText);
        }
      }
      if (cells.length > 0) {
        rows.push(cells);
      }
    }
    if (rows.length === 0) return '';
    const maxCols = Math.max(...rows.map(r => r.length));
    const padRows = rows.map(r => {
      const copy = [...r];
      while (copy.length < maxCols) copy.push('');
      return copy;
    });
    const header = padRows[0];
    const sep = Array(maxCols).fill('---');
    const mdLines = [
      `| ${header.join(' | ')} |`,
      `| ${sep.join(' | ')} |`,
      ...padRows.slice(1).map(r => `| ${r.join(' | ')} |`)
    ];
    return '\n\n' + mdLines.join('\n') + '\n\n';
  });
}

/**
 * Strips HTML tags (<br>, <p>, <span>, <div>, &nbsp;) and programming artifacts from text
 */
function stripHtmlAndArtifacts(raw: string): string {
  if (!raw) return "";
  // First convert any HTML tables to markdown so they aren't destroyed
  let text = convertHtmlTablesToMarkdown(raw);

  return text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/br>/gi, "\n")
    .replace(/&nbsp;/gi, " ")
    .replace(/<\/?(span|div|p|strong|em|b|i)[^>]*>/gi, "")
    .replace(/\\text\{([^\}]+)\}/g, "$1") // strip LaTeX \text{} wrappers
    .replace(/\u200B/g, ""); // remove zero-width spaces
}

/**
 * Parses markdown text and converts it into native docx document paragraphs, tables, and runs.
 * Guarantees strict RTL layout, true page-for-page parity, and authentic numbering preservation.
 */
export async function generateDocxBlob(options: DocxExportOptions): Promise<Blob> {
  const { title, isRtl = true, author = "PDF to Docx Converter" } = options;

  // Normalize presentation forms BEFORE any segmentation or run construction.
  // See shared/arabicText.ts: PDFs embed pre-shaped Arabic glyphs that Word cannot
  // reshape and the bidi algorithm cannot order. Measured on this project's own
  // extraction golden, ~70% of the Arabic arrived in this form, which is the
  // dominant cause of converted documents rendering as broken, disconnected Arabic.
  let markdown = toStandardArabic(stripHtmlAndArtifacts(options.markdown || ""));

  // Extract footnotes from Markdown (e.g. [^1]: text)
  const footnoteRegex = /^\[\^([^\]]+)\]:\s*(.*)$/gm;
  const footnotesData: Record<number, { children: Paragraph[] }> = {};
  const footnoteIdMap = new Map<string, number>();
  let fnCounter = 1;

  let match;
  while ((match = footnoteRegex.exec(markdown)) !== null) {
    const fnRef = match[1];
    const fnText = match[2];
    footnoteIdMap.set(fnRef, fnCounter);
    
    footnotesData[fnCounter] = {
      children: [
        new Paragraph({
          alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
          bidirectional: isRtl,
          spacing: { before: 30, after: 30, line: 240 },
          children: [
            new TextRun(createRunOptions(fnText.trim(), isRtl ? "Traditional Arabic" : "Calibri", isRtl, { size: 18 }))
          ],
        }),
      ],
    };
    fnCounter++;
  }
  
  // Remove footnote definitions from markdown body
  markdown = markdown.replace(/^\[\^([^\]]+)\]:\s*(.*)$/gm, '').trim();

  const lines = markdown.split("\n");
  const children: (Paragraph | Table)[] = [];

  const defaultFont = isRtl ? "Traditional Arabic" : "Calibri";
  const defaultAlignment = isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT;

  // Title at the top
  if (title && title.trim()) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.TITLE,
        alignment: defaultAlignment,
        bidirectional: isRtl,
        spacing: { before: 80, after: 180 },
        children: [
          new TextRun(createRunOptions(title.trim(), defaultFont, isRtl, { bold: true, size: 30, color: "1A365D" })),
        ],
      })
    );
  }

  let inTable = false;
  let tableRowsData: string[][] = [];

  const flushTable = () => {
    if (tableRowsData.length === 0) return;

    // Filter out markdown separator line (e.g. |---|---|)
    const validRows = tableRowsData.filter(
      (row) => !row.every((cell) => /^[\s-:]+$/.test(cell))
    );

    if (validRows.length > 0) {
      const numCols = Math.max(...validRows.map((r) => r.length));
      // Standard A4 width = 11906 twips; Content width with 0.65in (936 twips) margins = ~10034 twips
      const totalWidthTwips = 9600;
      const colWidthTwip = Math.floor(totalWidthTwips / Math.max(1, numCols));

      const docxRows: TableRow[] = validRows.map((row, rowIndex) => {
        const isHeader = rowIndex === 0;
        const cells: TableCell[] = [];
        for (let colIdx = 0; colIdx < numCols; colIdx++) {
          const cellText = row[colIdx] || "";
          cells.push(
            new TableCell({
              width: { size: colWidthTwip, type: WidthType.DXA },
              shading: isHeader
                ? { fill: "E2E8F0", type: ShadingType.CLEAR }
                : rowIndex % 2 === 1
                ? { fill: "F8FAFC", type: ShadingType.CLEAR }
                : undefined,
              margins: {
                top: 120,
                bottom: 120,
                left: 140,
                right: 140,
              },
              children: [
                new Paragraph({
                  alignment: defaultAlignment,
                  bidirectional: isRtl,
                  spacing: { before: 30, after: 30, line: 260 },
                  children: parseInlineFormatting(
                    cellText.trim(),
                    defaultFont,
                    isRtl,
                    footnoteIdMap,
                    isHeader ? 24 : 22
                  ),
                }),
              ],
            })
          );
        }
        return new TableRow({
          children: cells,
          tableHeader: isHeader,
          cantSplit: true,
        });
      });

      children.push(
        new Table({
          columnWidths: Array(numCols).fill(colWidthTwip),
          rows: docxRows,
          width: { size: 100, type: WidthType.PERCENTAGE },
          alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
          visuallyRightToLeft: isRtl,
          borders: {
            top: { style: BorderStyle.SINGLE, size: 4, color: "94A3B8" },
            bottom: { style: BorderStyle.SINGLE, size: 4, color: "94A3B8" },
            left: { style: BorderStyle.SINGLE, size: 4, color: "94A3B8" },
            right: { style: BorderStyle.SINGLE, size: 4, color: "94A3B8" },
            insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: "CBD5E1" },
            insideVertical: { style: BorderStyle.SINGLE, size: 2, color: "CBD5E1" },
          },
        })
      );
      // Spacing after table
      children.push(new Paragraph({ spacing: { after: 120 }, bidirectional: isRtl }));
    }
    tableRowsData = [];
    inTable = false;
  };

  let inCodeBlock = false;
  let codeBlockLines: string[] = [];

  const flushCodeBlock = () => {
    if (codeBlockLines.length > 0) {
      children.push(
        new Paragraph({
          shading: { fill: "F1F5F9", type: ShadingType.CLEAR },
          spacing: { before: 60, after: 60 },
          children: [
            new TextRun(createRunOptions(codeBlockLines.join("\n"), "Consolas", false, { size: 18, color: "1E293B" })),
          ],
        })
      );
      codeBlockLines = [];
    }
    inCodeBlock = false;
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();

    // Code block check
    if (line.startsWith("```")) {
      if (inCodeBlock) {
        flushCodeBlock();
      } else {
        if (inTable) flushTable();
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines.push(rawLine);
      continue;
    }

    // Table row check:
    // 1. Line starts and ends with |
    // 2. Or line has pipes separating columns (e.g. | col1 | col2 or col1 | col2 | col3)
    const isTableRow =
      (line.startsWith("|") && (line.endsWith("|") || line.includes("|", 1))) ||
      ((line.match(/\|/g) || []).length >= 2 && !line.startsWith("#"));

    if (isTableRow) {
      inTable = true;
      let cleanLine = line;
      if (cleanLine.startsWith("|")) cleanLine = cleanLine.slice(1);
      if (cleanLine.endsWith("|")) cleanLine = cleanLine.slice(0, -1);
      const cells = cleanLine
        .split("|")
        .map((c) => c.trim());
      tableRowsData.push(cells);
      continue;
    } else {
      if (inTable) {
        flushTable();
      }
    }

    // Explicit Page Break markers from AI / conversion pipeline
    if (
      line === "---PAGE_BREAK---" ||
      line.includes("---PAGE_BREAK---") ||
      line.toLowerCase() === "<!-- pagebreak -->" ||
      line.toLowerCase() === "<!-- page_break -->" ||
      line.toLowerCase() === "<!--pagebreak-->"
    ) {
      children.push(
        new Paragraph({
          bidirectional: isRtl,
          children: [new PageBreak()],
        })
      );
      continue;
    }

    // Empty lines: emit lightweight spacing
    if (!line) {
      children.push(new Paragraph({ spacing: { after: 60 } }));
      continue;
    }

    // Horizontal rule
    if (/^(\*\*\*|---|___)$/.test(line)) {
      children.push(
        new Paragraph({
          border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: "CBD5E1" } },
          spacing: { before: 80, after: 80 },
        })
      );
      continue;
    }

    // Headings
    if (line.startsWith("# ")) {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          alignment: defaultAlignment,
          bidirectional: isRtl,
          spacing: { before: 180, after: 90 },
          children: [
            new TextRun(createRunOptions(line.replace(/^#\s+/, ""), defaultFont, isRtl, { bold: true, size: 28, color: "0F172A" })),
          ],
        })
      );
      continue;
    }
    if (line.startsWith("## ")) {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          alignment: defaultAlignment,
          bidirectional: isRtl,
          spacing: { before: 150, after: 75 },
          children: [
            new TextRun(createRunOptions(line.replace(/^##\s+/, ""), defaultFont, isRtl, { bold: true, size: 26, color: "1E293B" })),
          ],
        })
      );
      continue;
    }
    if (line.startsWith("### ")) {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          alignment: defaultAlignment,
          bidirectional: isRtl,
          spacing: { before: 120, after: 60 },
          children: [
            new TextRun(createRunOptions(line.replace(/^###\s+/, ""), defaultFont, isRtl, { bold: true, size: 24, color: "334155" })),
          ],
        })
      );
      continue;
    }
    if (line.startsWith("#### ")) {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_4,
          alignment: defaultAlignment,
          bidirectional: isRtl,
          spacing: { before: 100, after: 50 },
          children: [
            new TextRun(createRunOptions(line.replace(/^####\s+/, ""), defaultFont, isRtl, { bold: true, size: 22, color: "475569" })),
          ],
        })
      );
      continue;
    }

    // Numbered lists and questions: (1. , ١. , (1) , (١) , أ- , ب- , 1- )
    // CRITICAL: We preserve the EXACT original numbering as literal text instead of Word's auto-counter
    // to prevent the catastrophic bug where numbers increment to 1214, 1215, 1216 across questions!
    const numberedListMatch = line.match(/^(\s*)([\d\u0660-\u0669\u06F0-\u06F9]+|[أ-ي]\b|[a-zA-Z]\b|\([^\)]+\)|[٠-٩]+)([\.\-\)]\s+|\s+-\s+)(.*)$/);
    if (numberedListMatch) {
      const prefixSymbol = `${numberedListMatch[2]}${numberedListMatch[3].trim()}`;
      const restOfText = numberedListMatch[4];
      children.push(
        new Paragraph({
          alignment: defaultAlignment,
          bidirectional: isRtl,
          indent: isRtl ? { right: 360, hanging: 360 } : { left: 360, hanging: 360 },
          spacing: { before: 30, after: 30, line: 260 },
          children: [
            new TextRun(createRunOptions(`${prefixSymbol} `, defaultFont, isRtl, { bold: true, size: 23, color: "0F172A" })),
            ...parseInlineFormatting(restOfText, defaultFont, isRtl, footnoteIdMap, 23),
          ],
        })
      );
      continue;
    }

    // Bullet lists (- or * or +)
    if (/^\s*[-*+]\s+/.test(line)) {
      const itemText = line.replace(/^\s*[-*+]\s+/, "");
      children.push(
        new Paragraph({
          alignment: defaultAlignment,
          bidirectional: isRtl,
          indent: isRtl ? { right: 360, hanging: 360 } : { left: 360, hanging: 360 },
          spacing: { before: 30, after: 30, line: 260 },
          children: [
            new TextRun(createRunOptions("• ", defaultFont, isRtl, { bold: true, size: 24, color: "0284C7" })),
            ...parseInlineFormatting(itemText, defaultFont, isRtl, footnoteIdMap, 23),
          ],
        })
      );
      continue;
    }

    // Blockquote
    if (line.startsWith("> ")) {
      const quoteText = line.replace(/^>\s+/, "");
      children.push(
        new Paragraph({
          alignment: defaultAlignment,
          bidirectional: isRtl,
          spacing: { before: 60, after: 60 },
          indent: isRtl ? { right: convertInchesToTwip(0.2) } : { left: convertInchesToTwip(0.2) },
          border: isRtl
            ? { right: { style: BorderStyle.SINGLE, size: 16, color: "0284C7" } }
            : { left: { style: BorderStyle.SINGLE, size: 16, color: "0284C7" } },
          children: parseInlineFormatting(quoteText, defaultFont, isRtl, footnoteIdMap, 22),
        })
      );
      continue;
    }

    // Standard paragraph with inline formatting (bold, italic, math, code, footnotes)
    children.push(
      new Paragraph({
        alignment: defaultAlignment,
        bidirectional: isRtl,
        spacing: { before: 35, after: 35, line: 260 }, // 1.08 line spacing for perfect 1-page fit
        children: parseInlineFormatting(line, defaultFont, isRtl, footnoteIdMap, 23),
      })
    );
  }

  // Flush any open table or code block
  if (inTable) flushTable();
  if (inCodeBlock) flushCodeBlock();

  const doc = new Document({
    creator: author,
    title: title || "Converted Document",
    description: "High-precision PDF transcription converted to DOCX with 100% page and numbering fidelity",
    footnotes: footnotesData,
    styles: {
      default: {
        document: {
          run: {
            rightToLeft: isRtl,
            font: {
              ascii: defaultFont,
              cs: defaultFont,
              hAnsi: defaultFont,
            },
            // Run-level language tagging lives in createRunOptions: the docx library
            // accepts `language` on the default document style but silently drops it.
          },
          paragraph: {
            alignment: defaultAlignment,
            ...(isRtl ? ({ bidirectional: true } as any) : {}),
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(0.65),
              bottom: convertInchesToTwip(0.65),
              left: convertInchesToTwip(0.65),
              right: convertInchesToTwip(0.65),
            },
          },
        },
        children: children,
      },
    ],
  });

  const baseBlob = await Packer.toBlob(doc);

  if (!isRtl) {
    return baseBlob;
  }

  try {
    const arrayBuffer = await baseBlob.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);

    // 1. Section-level RTL: <w:bidi/> must be a child of <w:sectPr>.
    //
    // The docx library has no option for this, so it is injected here — but only
    // here, and only in the one place it is actually needed. Paragraph-level and
    // run-level RTL are already emitted correctly by the library through the
    // `bidirectional` and `rightToLeft` options, in valid schema order.
    //
    // The previous implementation also rewrote every <w:pPr> and every <w:pPr> in
    // styles.xml with a regex. That was actively harmful, for two reasons:
    //   - it PREPENDED <w:bidi/> to the start of pPr, placing it before <w:pStyle>,
    //     which violates the CT_PPr element order and makes Word discard or repair
    //     the properties;
    //   - it APPENDED <w:jc> to the end of pPr, which puts it after <w:rPr>, also
    //     out of order.
    // Where the library had already emitted the correct values the rewrite was a
    // harmless no-op, which is why the damage never showed up in testing; it only
    // corrupted the paragraphs the library had left alone.
    const docXmlFile = zip.file("word/document.xml");
    if (docXmlFile) {
      let docXml = await docXmlFile.async("text");
      docXml = docXml.replace(/<w:sectPr([^>]*)>/g, (openTag) => {
        // Locate the closing tag of this specific sectPr, not the first match in the
        // file, and insert immediately before </w:sectPr> so <w:bidi/> lands after the
        // page/column settings that must precede it in CT_SectPr ordering.
        const closeIdx = docXml.indexOf("</w:sectPr>", docXml.indexOf(openTag));
        if (closeIdx === -1) return openTag;
        const inner = docXml.slice(docXml.indexOf(openTag), closeIdx);
        if (inner.includes("<w:bidi")) return openTag;
        return docXml.slice(0, closeIdx) + "<w:bidi/>" + docXml.slice(closeIdx);
      });
      zip.file("word/document.xml", docXml);
    }

    return await zip.generateAsync({
      type: "blob",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
  } catch (zipErr) {
    console.warn("Could not post-process docx for sectPr bidi, returning base blob:", zipErr);
    return baseBlob;
  }
}

/**
 * Simplifies LaTeX math expressions to clean Unicode representations for Word (.docx)
 */
function cleanMathForDocx(rawMath: string): string {
  let text = rawMath
    .replace(/\\vec\{(\\text\{([^\}]+)\}|([^\}]+))\}/g, "$2$3 ⃗")
    .replace(/\\text\{([^\}]+)\}/g, "$1")
    .replace(/\\mathrm\{([^\}]+)\}/g, "$1")
    .replace(/\\mathbf\{([^\}]+)\}/g, "$1")
    .replace(/\\frac\{([^\}]+)\}\{([^\}]+)\}/g, "($1 ÷ $2)")
    .replace(/\\sqrt\{([^\}]+)\}/g, "√($1)")
    .replace(/\\langle/g, "⟨")
    .replace(/\\rangle/g, "⟩")
    .replace(/\\times/g, "×")
    .replace(/\\div/g, "÷")
    .replace(/\\pm/g, "±")
    .replace(/\\le/g, "≤")
    .replace(/\\ge/g, "≥")
    .replace(/\\ne/g, "≠")
    .replace(/\\approx/g, "≈")
    .replace(/\\infty/g, "∞")
    .replace(/\\theta/g, "θ")
    .replace(/\\alpha/g, "α")
    .replace(/\\beta/g, "β")
    .replace(/\\gamma/g, "γ")
    .replace(/\\Delta/g, "Δ")
    .replace(/\\pi/g, "π")
    .replace(/\\therefore/g, "∴")
    .replace(/\\because/g, "∵")
    .replace(/\\parallel/g, "//")
    .replace(/\\left\(/g, "(")
    .replace(/\\right\)/g, ")")
    .replace(/\\left\[/g, "[")
    .replace(/\\right\]/g, "]")
    .replace(/\\left\\{/g, "{")
    .replace(/\\right\\}/g, "}")
    .replace(/\\|/g, "||")
    .replace(/\\cos/g, "cos")
    .replace(/\\sin/g, "sin")
    .replace(/\\tan/g, "tan")
    .replace(/\\;/g, " ")
    .replace(/\\,/g, " ")
    .replace(/\\quad/g, "  ")
    .replace(/\\qquad/g, "   ")
    .replace(/\\[a-zA-Z]+/g, ""); // strip any remaining latex commands
  return text.trim();
}

/**
 * Parses bold, italic, inline code, math, and text runs from a markdown line
 */
function parseInlineFormatting(
  text: string,
  fontName: string,
  isRtl: boolean,
  footnoteIdMap: Map<string, number>,
  baseFontSize: number = 23
): (TextRun | FootnoteReferenceRun)[] {
  const runs: (TextRun | FootnoteReferenceRun)[] = [];

  /**
   * Emits one styled run per script segment so Arabic and Latin/digit fragments
   * inside the same styled span get the correct run-level direction each.
   */
  const pushSegmented = (content: string, font: string, extra: any) => {
    if (!content) return;
    // Single-script content needs no splitting: avoid a pointless extra run.
    const segments = isRtl ? segmentByScript(content) : [{ text: content, isArabic: false }];
    for (const segment of segments) {
      if (!segment.text) continue;
      runs.push(
        new TextRun(
          createRunOptions(segment.text, font, isRtl && segment.isArabic, {
            ...extra,
            size: extra?.size ?? baseFontSize,
          })
        )
      );
    }
  };

  // Match bold **text**, italic *text*, inline code `code`, inline math $math$, footnote [^1], or regular text
  const regex = /(\$\$[\s\S]*?\$\$|\$[^\$\n]+?\$|\*\*.*?\*\*|\*.*?\*|`.*?`|\[\^[^\]]+\]|[^*`\$\[]+)/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const part = match[0];

    if (part.startsWith("$$") && part.endsWith("$$") && part.length >= 4) {
      const cleanMath = cleanMathForDocx(part.slice(2, -2));
      runs.push(new TextRun(createRunOptions(` ${cleanMath} `, "Cambria Math", isRtl, { bold: true, size: baseFontSize, color: "1E3A8A" })));
    } else if (part.startsWith("$") && part.endsWith("$") && part.length >= 2) {
      const cleanMath = cleanMathForDocx(part.slice(1, -1));
      runs.push(new TextRun(createRunOptions(` ${cleanMath} `, "Cambria Math", isRtl, { size: baseFontSize, color: "1E3A8A" })));
    } else if (part.startsWith("**") && part.endsWith("**") && part.length >= 4) {
      pushSegmented(part.slice(2, -2), fontName, { bold: true });
    } else if (part.startsWith("*") && part.endsWith("*") && part.length >= 2) {
      pushSegmented(part.slice(1, -1), fontName, { italics: true });
    } else if (part.startsWith("`") && part.endsWith("`") && part.length >= 2) {
      runs.push(new TextRun(createRunOptions(part.slice(1, -1), "Consolas", false, { size: baseFontSize - 4, color: "B91C1C", shading: { fill: "F3F4F6", type: ShadingType.CLEAR } })));
    } else if (part.startsWith("[^") && part.endsWith("]")) {
      const fnRef = part.slice(2, -1);
      const fnId = footnoteIdMap.get(fnRef);
      if (fnId) {
        runs.push(new FootnoteReferenceRun(fnId));
      } else {
        // Fallback if not found
        runs.push(new TextRun(createRunOptions(part, fontName, isRtl, { size: baseFontSize })));
      }
    } else {
      // Regular text (strip stray markdown brackets or math artifacts)
      const cleanPart = part.replace(/\\text\{([^\}]+)\}/g, "$1");
      pushSegmented(cleanPart, fontName, {});
    }
  }

  if (runs.length === 0) {
    runs.push(new TextRun(createRunOptions(text, fontName, isRtl, { size: baseFontSize })));
  }
  return runs;
}

/**
 * Triggers browser download of generated DOCX file
 */
export async function downloadDocx(options: DocxExportOptions, filename: string): Promise<void> {
  const blob = await generateDocxBlob(options);
  const docxFilename = filename.endsWith(".docx") ? filename : `${filename}.docx`;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = docxFilename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Triggers browser download of text or markdown
 */
export function downloadTextFile(content: string, filename: string, mimeType: string = "text/plain;charset=utf-8"): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
