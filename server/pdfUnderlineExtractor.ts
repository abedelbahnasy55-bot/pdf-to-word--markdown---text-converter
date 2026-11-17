/**
 * Geometric & Annotation-based PDF Underline Extractor
 * مستخرج الخطوط التحتية (التسطير) من مستندات PDF الرقمية
 *
 * Inspects pdfjs-dist operator lists (stroke paths & thin filled rectangles under text baselines),
 * PDF Underline annotations, and Unicode combining low-line glyphs (\u0332 / \u0333)
 * so Arabic grammar targets ("أعرب ما تحته خط") are preserved as <u>...</u> in Markdown and DOCX.
 */

export interface PageDetectedUnderlines {
  pageNumber: number;
  underlinedPhrases: string[];
}

export interface PdfUnderlineDetectionResult {
  pages: PageDetectedUnderlines[];
  totalUnderlines: number;
}

interface UnderlineBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

type Matrix6 = [number, number, number, number, number, number];

function multiplyMatrix(m1: Matrix6, m2: Matrix6): Matrix6 {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

function transformPoint(m: Matrix6, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

function transformBbox(m: Matrix6, minX: number, minY: number, maxX: number, maxY: number): UnderlineBox {
  const pts = [
    transformPoint(m, minX, minY),
    transformPoint(m, maxX, minY),
    transformPoint(m, minX, maxY),
    transformPoint(m, maxX, maxY),
  ];
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

function isHorizontalUnderlineCandidate(box: UnderlineBox, pageWidth: number): boolean {
  const width = box.maxX - box.minX;
  const height = box.maxY - box.minY;
  // Must be at least 5pt wide, strictly thinner than 4.5pt, and not a full-page horizontal rule
  if (width < 5 || height > 4.5) return false;
  if (pageWidth > 0 && width > pageWidth * 0.62) return false;
  return true;
}

function normalizeTextForMatch(text: string): string {
  return (text || '')
    .replace(/[\u0332\u0333]/g, '')
    .replace(/[\u0640]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function computeOverlap(a0: number, a1: number, b0: number, b1: number): number {
  const lo = Math.max(Math.min(a0, a1), Math.min(b0, b1));
  const hi = Math.min(Math.max(a0, a1), Math.max(b0, b1));
  return Math.max(0, hi - lo);
}

/**
 * Normalizes Unicode combining low-line / double low-line characters (\u0332, \u0333)
 * into clean <u>...</u> tags without breaking surrounding words.
 */
export function normalizeCombiningUnderlines(text: string): string {
  if (!text || !/[\u0332\u0333]/.test(text)) return text;
  // Group contiguous characters (allowing combining diacritics) that carry \u0332 or \u0333
  return text.replace(/(?:[^\s<>][\u064B-\u065F\u0670]*[\u0332\u0333]+[\u064B-\u065F\u0670]*)+/g, (match) => {
    const clean = match.replace(/[\u0332\u0333]/g, '');
    return clean.trim() ? `<u>${clean}</u>` : clean;
  });
}

function getCharVisualWeight(ch: string): number {
  if (ch === ' ') return 0.52;
  if (/[ilIjtfr1.,:;!'`|]/.test(ch)) return 0.55;
  if (/[mwMW@]/.test(ch)) return 1.42;
  if (/[A-Z]/.test(ch)) return 1.15;
  if (/[\u0627\u0623\u0625\u0622\u0644\u0631\u0632\u062F\u0630\u0648]/.test(ch)) return 0.72;
  if (/[\u0633\u0634\u0635\u0636\u0637\u0638]/.test(ch)) return 1.28;
  if (/[\u064B-\u065F\u0670]/.test(ch)) return 0; // combining diacritics carry zero horizontal advance
  return 1.0;
}

function extractMatchingWordsFromTextItem(
  str: string,
  itemX0: number,
  itemWidth: number,
  underlineBoxes: UnderlineBox[],
  textY: number,
  fontH: number
): string[] {
  const cleanedStr = normalizeTextForMatch(str);
  if (!cleanedStr || itemWidth <= 0) return [];

  // Filter boxes positioned vertically right beneath this text baseline
  const matchingYBoxes = underlineBoxes.filter((b) => {
    const lineCenterY = (b.minY + b.maxY) / 2;
    return lineCenterY >= textY - fontH * 0.6 && lineCenterY <= textY + fontH * 0.16;
  });

  if (matchingYBoxes.length === 0) return [];

  const itemX1 = itemX0 + itemWidth;
  const totalOverlap = matchingYBoxes.reduce(
    (acc, b) => Math.max(acc, computeOverlap(itemX0, itemX1, b.minX, b.maxX)),
    0
  );
  if (totalOverlap < 4) return [];

  // Split into tokens with character ranges so partial underlines only extract underlined words
  const tokens: Array<{ word: string; startIdx: number; endIdx: number }> = [];
  const tokenRegex = /\S+/g;
  let tm: RegExpExecArray | null;
  while ((tm = tokenRegex.exec(cleanedStr)) !== null) {
    tokens.push({
      word: tm[0],
      startIdx: tm.index,
      endIdx: tm.index + tm[0].length,
    });
  }

  if (tokens.length === 0) return [];

  // If the underline spans almost the entire text item, return the whole phrase
  if (totalOverlap >= itemWidth * 0.78 || tokens.length === 1) {
    const whole = cleanedStr.replace(/^[.,،؛:؟!()«»"']+|[.,،؛:؟!()«»"']+$/g, '').trim();
    return whole.length >= 2 ? [whole] : [];
  }

  // Perceptual weighted horizontal estimation (accounting for Arabic RTL direction & variable glyph widths)
  const isArabic = /[\u0600-\u06FF]/.test(cleanedStr);
  const cumWeights = new Array<number>(cleanedStr.length + 1).fill(0);
  for (let i = 0; i < cleanedStr.length; i++) {
    cumWeights[i + 1] = cumWeights[i] + getCharVisualWeight(cleanedStr[i]);
  }
  const totalWeight = Math.max(1, cumWeights[cleanedStr.length]);
  const hitWords: string[] = [];

  for (const tok of tokens) {
    const startFrac = cumWeights[tok.startIdx] / totalWeight;
    const endFrac = cumWeights[tok.endIdx] / totalWeight;
    const wX0 = isArabic ? itemX1 - endFrac * itemWidth : itemX0 + startFrac * itemWidth;
    const wX1 = isArabic ? itemX1 - startFrac * itemWidth : itemX0 + endFrac * itemWidth;
    const wLen = Math.max(1, Math.abs(wX1 - wX0));

    const maxWordOverlap = matchingYBoxes.reduce(
      (acc, b) => Math.max(acc, computeOverlap(wX0, wX1, b.minX, b.maxX)),
      0
    );

    if (maxWordOverlap >= Math.max(4, wLen * 0.6)) {
      const cleanWord = tok.word.replace(/^[.,،؛:؟!()«»"']+|[.,،؛:؟!()«»"']+$/g, '').trim();
      if (cleanWord.length >= 2) {
        hitWords.push(cleanWord);
      }
    }
  }

  return hitWords;
}

/**
 * Extracts underlined words/phrases per page from a digital PDF buffer using
 * vector stroke paths, thin filled rectangles, combining underline characters, and PDF annotations.
 */
export async function detectPdfUnderlines(
  pdfBuffer: Buffer | Uint8Array
): Promise<PdfUnderlineDetectionResult> {
  const empty: PdfUnderlineDetectionResult = { pages: [], totalUnderlines: 0 };
  if (!pdfBuffer || pdfBuffer.byteLength < 16) return empty;

  let pdfDoc: any = null;
  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const data = pdfBuffer instanceof Uint8Array ? new Uint8Array(pdfBuffer) : new Uint8Array(pdfBuffer);
    const loadingTask = pdfjs.getDocument({
      data,
      verbosity: 0,
      useWorkerFetch: false,
      isEvalSupported: false,
    } as any);
    pdfDoc = await loadingTask.promise;

    const OPS = pdfjs.OPS;
    const numPages = pdfDoc.numPages || 0;
    const pages: PageDetectedUnderlines[] = [];
    let totalUnderlines = 0;

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const page = await pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1 });
      const pageWidth = viewport.width || 595;

      const underlineBoxes: UnderlineBox[] = [];

      // 1. Inspect vector paths & thin filled rectangles from PDF content stream
      try {
        const opList = await page.getOperatorList();
        let ctm: Matrix6 = [1, 0, 0, 1, 0, 0];
        const ctmStack: Matrix6[] = [];

        for (let i = 0; i < opList.fnArray.length; i++) {
          const fn = opList.fnArray[i];
          const args = opList.argsArray[i];

          if (fn === OPS.save) {
            ctmStack.push([...ctm] as Matrix6);
          } else if (fn === OPS.restore) {
            const popped = ctmStack.pop();
            if (popped) ctm = popped;
          } else if (fn === OPS.transform && Array.isArray(args) && args.length >= 6) {
            ctm = multiplyMatrix(ctm, [args[0], args[1], args[2], args[3], args[4], args[5]]);
          } else if (fn === OPS.constructPath && Array.isArray(args) && args.length >= 3 && args[2]) {
            const bbox = args[2];
            const minX = Number(bbox[0]);
            const minY = Number(bbox[1]);
            const maxX = Number(bbox[2]);
            const maxY = Number(bbox[3]);
            if ([minX, minY, maxX, maxY].every((v) => Number.isFinite(v))) {
              const transformed = transformBbox(ctm, minX, minY, maxX, maxY);
              if (isHorizontalUnderlineCandidate(transformed, pageWidth)) {
                underlineBoxes.push(transformed);
              }
            }
          }
        }
      } catch {
        // Ignore operator list parse glitches on malformed streams
      }

      // 2. Inspect PDF Markup Underline Annotations
      try {
        const annotations = await page.getAnnotations();
        for (const annot of annotations || []) {
          if (annot?.subtype === 'Underline' && Array.isArray(annot.rect) && annot.rect.length >= 4) {
            const [rx0, ry0, rx1, ry1] = annot.rect.map(Number);
            if ([rx0, ry0, rx1, ry1].every(Number.isFinite)) {
              underlineBoxes.push({
                minX: Math.min(rx0, rx1),
                minY: Math.min(ry0, ry1),
                maxX: Math.max(rx0, rx1),
                maxY: Math.min(ry0, ry1) + 2,
              });
            }
          }
        }
      } catch {
        // Ignore annotation errors
      }

      // 3. Match underline boxes against page text items + detect combining \u0332 glyphs
      const phraseSet = new Set<string>();
      try {
        const textContent = await page.getTextContent();
        for (const rawItem of textContent.items || []) {
          const item = rawItem as any;
          if (!item || typeof item.str !== 'string' || !item.str.trim()) continue;

          // Combining underline characters directly inside PDF text layer
          if (/[\u0332\u0333]/.test(item.str)) {
            const normalizedWithTags = normalizeCombiningUnderlines(item.str);
            const matches = normalizedWithTags.matchAll(/<u>([^<]+)<\/u>/gi);
            for (const m of matches) {
              const clean = (m[1] || '').trim();
              if (clean.length >= 2) phraseSet.add(clean);
            }
          }

          if (underlineBoxes.length > 0 && Array.isArray(item.transform) && item.transform.length >= 6) {
            const textX = Number(item.transform[4]) || 0;
            const textY = Number(item.transform[5]) || 0;
            const fontH = Math.max(8, Math.hypot(Number(item.transform[2]) || 0, Number(item.transform[3]) || 0) || Number(item.height) || 12);
            const itemW = Number(item.width) || 0;

            const hits = extractMatchingWordsFromTextItem(
              item.str,
              textX,
              itemW,
              underlineBoxes,
              textY,
              fontH
            );
            for (const h of hits) {
              phraseSet.add(h);
            }
          }
        }
      } catch {
        // Ignore textContent errors
      }

      const underlinedPhrases = Array.from(phraseSet);
      totalUnderlines += underlinedPhrases.length;
      pages.push({ pageNumber: pageNum, underlinedPhrases });
    }

    return { pages, totalUnderlines };
  } catch (err: any) {
    console.warn('[PdfUnderlineExtractor] Non-fatal underline inspection bypass:', err?.message || err);
    return empty;
  } finally {
    if (pdfDoc && typeof pdfDoc.destroy === 'function') {
      try {
        await pdfDoc.destroy();
      } catch {}
    }
  }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Applies verified underlined phrases onto a single page's Markdown safely
 * without double-wrapping existing <u>, <ins>, links, or code spans.
 */
export function applyVerifiedUnderlinesToPageText(
  pageText: string,
  underlinedPhrases: string[],
  requireQuestionContext: boolean = false
): string {
  let result = normalizeCombiningUnderlines(pageText || '');
  if (!result || !underlinedPhrases || underlinedPhrases.length === 0) return result;

  if (
    requireQuestionContext &&
    !/(?:ما\s+تحته\s+خط|تحته\s+خط|أعرب|اضبط|الخط|underlined)/i.test(result)
  ) {
    return result;
  }

  // Sort longer phrases first so multi-word spans wrap cleanly before single words
  const sortedPhrases = [...underlinedPhrases]
    .map((p) => p.trim())
    .filter((p) => p.length >= 2)
    .sort((a, b) => b.length - a.length);

  // Protect existing <u>...</u>, <ins>...</ins>, markdown links, and inline code from re-wrapping
  const heldSegments: string[] = [];
  const hold = (segment: string) => {
    const token = `__UNDERLINE_HOLD_${heldSegments.length}__`;
    heldSegments.push(segment);
    return token;
  };

  result = result.replace(
    /(<(?:u|ins)(?:\s[^>]*)?>[\s\S]*?<\/(?:u|ins)>|```[\s\S]*?```|`[^`\n]+`|\[[^\]]+\]\([^)]+\))/gi,
    (m) => hold(m)
  );

  for (const phrase of sortedPhrases) {
    const escaped = escapeRegExp(phrase);
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}\\p{M}_])(${escaped})(?![\\p{L}\\p{N}\\p{M}_])`, 'gu');
    result = result.replace(pattern, (_full, inner) => hold(`<u>${inner}</u>`));
  }

  return result.replace(/__UNDERLINE_HOLD_(\d+)__/g, (_, i) => heldSegments[Number(i)] || '');
}

/**
 * Applies verified per-page underlined phrases across a multi-page Markdown document
 * split by ---PAGE_BREAK---.
 */
export function applyVerifiedUnderlinesToMarkdown(
  markdown: string,
  pages: PageDetectedUnderlines[],
  requireQuestionContext: boolean = false
): string {
  const normalized = normalizeCombiningUnderlines(markdown || '');
  if (!normalized || !pages || pages.length === 0) return normalized;

  const byPage = new Map<number, string[]>();
  for (const p of pages) {
    if (p.underlinedPhrases.length > 0) {
      byPage.set(p.pageNumber, p.underlinedPhrases);
    }
  }
  if (byPage.size === 0) return normalized;

  const mdPages = normalized.split(/\n*---PAGE_BREAK---\n*/);
  const updated = mdPages.map((pgText, idx) => {
    const phrases = byPage.get(idx + 1) || (mdPages.length === 1 ? pages.flatMap((p) => p.underlinedPhrases) : []);
    if (phrases.length === 0) return pgText;
    return applyVerifiedUnderlinesToPageText(pgText, phrases, requireQuestionContext);
  });

  return updated.join('\n\n---PAGE_BREAK---\n\n');
}
