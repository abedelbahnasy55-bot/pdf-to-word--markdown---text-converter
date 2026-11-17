/**
 * Unified Publication-Grade Bilingual Word (.docx) Typography & BiDi Engine.
 *
 * Provides calibrated dual-script sizing (OOXML sz for Latin vs szCs for Arabic Complex Script),
 * strict script segmentation for mixed Arabic/English prose ("الكلام المتداخل"), selectable
 * typography profiles, and complete structural richness across Browser, Server, MCP, and CLI.
 */

import {
  toStandardArabicCore,
  isRightToLeftTextCore,
  containsArabicCore as containsArabic,
} from './arabicPipelineCore.js';

export const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/**
 * Strips XML 1.0 illegal control characters and unpaired UTF-16 surrogates
 * so OOXML generation never emits corrupted XML or throws during export.
 */
export function sanitizeXmlString(input) {
  if (input === null || input === undefined) return '';
  const str = String(input);
  let out = '';
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    // High surrogate
    if (code >= 0xd800 && code <= 0xdbff) {
      if (i + 1 < str.length) {
        const low = str.charCodeAt(i + 1);
        if (low >= 0xdc00 && low <= 0xdfff) {
          out += str[i] + str[i + 1];
          i++;
          continue;
        }
      }
      continue;
    }
    // Lone low surrogate
    if (code >= 0xdc00 && code <= 0xdfff) continue;
    // Allowed XML 1.0 chars: 0x09 (\t), 0x0A (\n), 0x0D (\r), >= 0x20 except 0xFFFE/0xFFFF/0x7F
    if (
      code === 0x09 ||
      code === 0x0a ||
      code === 0x0d ||
      (code >= 0x20 && code !== 0x7f && code !== 0xfffe && code !== 0xffff)
    ) {
      out += str[i];
    }
  }
  return out;
}

export const DEFAULT_FONT_PROFILE = 'bilingual_publication';

export const TYPOGRAPHY_PROFILES = {
  bilingual_publication: {
    id: 'bilingual_publication',
    labelArabic: 'الاحترافي المزدوج الفاخر (Amiri 14pt + Plus Jakarta Sans 14pt • تباعد 1.5)',
    arabicFont: 'Amiri',
    englishFont: 'Plus Jakarta Sans',
    codeFont: 'Consolas',
    mathFont: 'Cambria Math',
    arabicBodyPt: 14,
    englishBodyPt: 14,
    lineSpacing: 360, // Exact 1.5x line spacing (1.5 * 240 = 360 twips)
    palette: {
      title: '0F172A',
      h1Text: '0B4F2C',
      h1Bg: 'F4F8F6',
      h1Border: '0B4F2C',
      h2Text: '1E3A8A',
      h2Border: '1E3A8A',
      h3Text: '9A6B00',
      h4Text: '334155',
      bodyText: '1E293B',
      quranText: '065F46',
      questionText: '7B1E1E',
      answerText: '065F46',
      bulletText: '0284C7',
      quoteBorder: '0284C7',
      codeText: 'B91C1C',
      codeBg: 'F1F5F9',
      mathText: '1E3A8A',
      tableHeaderBg: 'EEF2FF',
      tableAltBg: 'F8FAFC',
      tableOuterBorder: '1E3A8A',
      tableSideBorder: 'CBD5E1',
      tableInnerBorder: 'E2E8F0',
    },
  },
  heritage_azhari: {
    id: 'heritage_azhari',
    labelArabic: 'التراثي الأزهري (Traditional Arabic 15pt + Calibri 11.5pt)',
    arabicFont: 'Traditional Arabic',
    englishFont: 'Calibri',
    codeFont: 'Consolas',
    mathFont: 'Cambria Math',
    arabicBodyPt: 15,
    englishBodyPt: 11.5,
    lineSpacing: 300, // 1.25x comfortable clearance for Arabic diacritics (Tashkeel)
    palette: {
      title: '1A365D',
      h1Text: '0B4F2C',
      h1Bg: 'F7F2E3',
      h1Border: 'A67C00',
      h2Text: '1F3864',
      h2Border: '1F3864',
      h3Text: 'A67C00',
      h4Text: '2E4B73',
      bodyText: '1E293B',
      quranText: '065F46',
      questionText: '7B1E1E',
      answerText: '065F46',
      bulletText: '0284C7',
      quoteBorder: '0284C7',
      codeText: 'B91C1C',
      codeBg: 'F1F5F9',
      mathText: '1E3A8A',
      tableHeaderBg: 'F7F2E3',
      tableAltBg: 'FBF9F5',
      tableOuterBorder: 'A67C00',
      tableSideBorder: 'CBD5E1',
      tableInnerBorder: 'E2E8F0',
    },
  },
  academic_editorial: {
    id: 'academic_editorial',
    labelArabic: 'الأكاديمي الرصين (Amiri 13.5pt + Times New Roman 11.5pt)',
    arabicFont: 'Amiri',
    englishFont: 'Times New Roman',
    codeFont: 'Consolas',
    mathFont: 'Cambria Math',
    arabicBodyPt: 13.5,
    englishBodyPt: 11.5,
    lineSpacing: 300,
    palette: {
      title: '0F172A',
      h1Text: '1E3A8A',
      h1Bg: 'F8FAFC',
      h1Border: '1E3A8A',
      h2Text: '1E293B',
      h2Border: '3B82F6',
      h3Text: '334155',
      h4Text: '475569',
      bodyText: '0F172A',
      quranText: '065F46',
      questionText: '7B1E1E',
      answerText: '065F46',
      bulletText: '1D4ED8',
      quoteBorder: '3B82F6',
      codeText: 'B91C1C',
      codeBg: 'F1F5F9',
      mathText: '1E3A8A',
      tableHeaderBg: 'EEF2FF',
      tableAltBg: 'F8FAFC',
      tableOuterBorder: '1E3A8A',
      tableSideBorder: 'CBD5E1',
      tableInnerBorder: 'E2E8F0',
    },
  },
  modern_crisp: {
    id: 'modern_crisp',
    labelArabic: 'العصري الواضح (Sakkal Majalla 14.5pt + Segoe UI 11pt)',
    arabicFont: 'Sakkal Majalla',
    englishFont: 'Segoe UI',
    codeFont: 'Consolas',
    mathFont: 'Cambria Math',
    arabicBodyPt: 14.5,
    englishBodyPt: 11,
    lineSpacing: 290,
    palette: {
      title: '0F172A',
      h1Text: '0F766E',
      h1Bg: 'F0FDFA',
      h1Border: '0D9488',
      h2Text: '1E293B',
      h2Border: '0D9488',
      h3Text: '0F766E',
      h4Text: '334155',
      bodyText: '1E293B',
      quranText: '065F46',
      questionText: '991B1B',
      answerText: '065F46',
      bulletText: '0D9488',
      quoteBorder: '0D9488',
      codeText: 'BE123C',
      codeBg: 'F8FAFC',
      mathText: '1E3A8A',
      tableHeaderBg: 'CCFBF1',
      tableAltBg: 'F0FDFA',
      tableOuterBorder: '0D9488',
      tableSideBorder: 'CBD5E1',
      tableInnerBorder: 'E2E8F0',
    },
  },
  cairo_modern: {
    id: 'cairo_modern',
    labelArabic: 'الهندسي الحديث (Cairo 12.5pt + Calibri 11pt)',
    arabicFont: 'Cairo',
    englishFont: 'Calibri',
    codeFont: 'Consolas',
    mathFont: 'Cambria Math',
    arabicBodyPt: 12.5,
    englishBodyPt: 11,
    lineSpacing: 290,
    palette: {
      title: '1E293B',
      h1Text: '1D4ED8',
      h1Bg: 'EFF6FF',
      h1Border: '2563EB',
      h2Text: '1E293B',
      h2Border: '3B82F6',
      h3Text: '2563EB',
      h4Text: '475569',
      bodyText: '1E293B',
      quranText: '065F46',
      questionText: '991B1B',
      answerText: '065F46',
      bulletText: '2563EB',
      quoteBorder: '2563EB',
      codeText: 'B91C1C',
      codeBg: 'F1F5F9',
      mathText: '1E3A8A',
      tableHeaderBg: 'DBEAFE',
      tableAltBg: 'F8FAFC',
      tableOuterBorder: '2563EB',
      tableSideBorder: 'CBD5E1',
      tableInnerBorder: 'E2E8F0',
    },
  },
};

/**
 * Resolves typography configuration with proportional dual-script half-point sizes.
 */
export function resolveTypographyConfig(options = {}) {
  const typo = options.typography || options || {};
  const profileKey =
    typo.fontProfile && TYPOGRAPHY_PROFILES[typo.fontProfile]
      ? typo.fontProfile
      : DEFAULT_FONT_PROFILE;
  const baseProfile = TYPOGRAPHY_PROFILES[profileKey];

  const arabicFont = typo.arabicFont || baseProfile.arabicFont;
  const englishFont = typo.englishFont || baseProfile.englishFont;
  const codeFont = typo.codeFont || baseProfile.codeFont;
  const mathFont = typo.mathFont || baseProfile.mathFont;

  const arabicBodyPt =
    typeof typo.arabicSizePt === 'number' && typo.arabicSizePt >= 9 && typo.arabicSizePt <= 28
      ? typo.arabicSizePt
      : baseProfile.arabicBodyPt;
  const englishBodyPt =
    typeof typo.englishSizePt === 'number' && typo.englishSizePt >= 8 && typo.englishSizePt <= 24
      ? typo.englishSizePt
      : baseProfile.englishBodyPt;

  const lineSpacing =
    typeof typo.lineSpacing === 'number' && typo.lineSpacing >= 220 && typo.lineSpacing <= 480
      ? typo.lineSpacing
      : baseProfile.lineSpacing;

  const arHp = (deltaPt) => Math.round((arabicBodyPt + deltaPt) * 2);
  const enHp = (deltaPt) => Math.round((englishBodyPt + deltaPt) * 2);

  return {
    profileId: profileKey,
    arabicFont,
    englishFont,
    codeFont,
    mathFont,
    lineSpacing,
    palette: baseProfile.palette,
    sizes: {
      title: { cs: arHp(6), ascii: enHp(5) },          // 20pt AR / 19pt EN
      h1: { cs: arHp(4), ascii: enHp(3.5) },           // 18pt AR / 17.5pt EN
      h2: { cs: arHp(2), ascii: enHp(2) },             // 16pt AR / 16pt EN
      h3: { cs: arHp(1), ascii: enHp(1) },             // 15pt AR / 15pt EN
      h4: { cs: arHp(0), ascii: enHp(0) },             // 14pt bold AR / EN
      body: { cs: arHp(0), ascii: enHp(0) },           // 14pt AR / 14pt EN (28 half-pts)
      examPrefix: { cs: arHp(0.5), ascii: enHp(0) },   // 14.5pt AR
      quran: { cs: arHp(1.5), ascii: enHp(0.5) },      // 15.5pt AR bold Uthmani
      tableHeader: { cs: arHp(-1), ascii: enHp(-1.5) },// 13pt AR / 12.5pt EN
      tableBody: { cs: arHp(-1.5), ascii: enHp(-2) },  // 12.5pt AR / 12pt EN
      quote: { cs: arHp(-0.5), ascii: enHp(-1) },      // 13.5pt AR / 13pt EN
      footnote: { cs: Math.max(20, arHp(-3)), ascii: Math.max(18, enHp(-3)) }, // 11pt
      code: { cs: Math.max(18, enHp(-3)), ascii: Math.max(18, enHp(-3)) },      // 11pt monospace
    },
  };
}

/**
 * Creates calibrated OOXML TextRun properties with separate fonts and half-point sizes
 * for Latin/ASCII vs Arabic Complex Script, plus strict run-level direction and language.
 */
export function createDualScriptRunOptions(
  text,
  typoConfig,
  runIsArabic,
  role = 'body',
  extra = {}
) {
  const roleSizes = typoConfig.sizes[role] || typoConfig.sizes.body;
  const asciiSize = extra.size ?? roleSizes.ascii;
  const csSize = extra.sizeComplexScript ?? roleSizes.cs;

  const isCodeRole = role === 'code';
  const isMathRole = role === 'math';

  const asciiFont = isCodeRole
    ? typoConfig.codeFont
    : isMathRole
    ? typoConfig.mathFont
    : extra.asciiFont || typoConfig.englishFont;

  const csFont = isCodeRole
    ? typoConfig.codeFont
    : isMathRole
    ? typoConfig.mathFont
    : extra.arabicFont || typoConfig.arabicFont;

  const safeText = sanitizeXmlString(text);

  const base = {
    text: safeText,
    font: {
      ascii: asciiFont,
      hAnsi: asciiFont,
      cs: csFont,
      eastAsia: asciiFont,
    },
    size: asciiSize,
    sizeComplexScript: csSize,
    rightToLeft: Boolean(runIsArabic),
    language: runIsArabic ? { value: 'ar-SA', bidirectional: 'ar-SA' } : { value: 'en-US' },
  };

  if (extra.bold) {
    base.bold = true;
    base.boldComplexScript = true;
  }
  if (extra.italics) {
    base.italics = true;
    base.italicsComplexScript = true;
  }
  if (extra.underline) base.underline = extra.underline;
  if (extra.strike) base.strike = true;
  if (extra.superScript) base.superScript = true;
  if (extra.subScript) base.subScript = true;
  if (extra.color) base.color = extra.color;
  if (extra.highlight) base.highlight = extra.highlight;
  if (extra.shading) base.shading = extra.shading;

  return base;
}

const ARABIC_CHAR_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFD3E\uFD3F]/;
const LATIN_LETTER_RE = /[A-Za-z\u00C0-\u024F]/;

/**
 * Splits mixed Arabic/Latin strings into uniform-direction segments.
 *
 * Critical guarantees for "الكلام المتداخل" (interleaved Arabic & English):
 * 1) Single-word or multi-word English phrases (e.g. "Model Context Protocol", "PDF to Word")
 *    inside an Arabic sentence are ALWAYS isolated into an LTR segment (`isArabic: false`),
 *    while spaces between English words stay inside the single LTR segment so word order never flips.
 * 2) Parenthetical Latin phrases like "(MCP Server)" keep their opening and closing parentheses
 *    together inside the LTR segment so Word never mirrors brackets into ")Server MCP(".
 * 3) Multi-part technical/date tokens like "2026-11-15" or "v2.4.5" or URLs stay together as LTR.
 * 4) Standalone Arabic prose punctuation (، ؛ ؟) and Arabic-Indic numerals stay inside Arabic RTL segments.
 */
export function segmentByScript(text) {
  if (!text) return [];

  // Fast path: purely Latin/ASCII text with zero Arabic letters -> single clean LTR run
  if (!containsArabic(text) && !/[\uFD3E\uFD3F]/.test(text)) {
    return [{ text, isArabic: false }];
  }

  const segments = [];
  let i = 0;
  const n = text.length;

  const pushSeg = (segText, isArabic) => {
    if (!segText) return;
    const prev = segments[segments.length - 1];
    if (prev && prev.isArabic === isArabic) {
      prev.text += segText;
    } else {
      segments.push({ text: segText, isArabic });
    }
  };

  // Helper: check if an opening paren/bracket at index `pos` closes a purely non-Arabic Latin span
  const matchBalancedLatinBracket = (pos) => {
    const open = text[pos];
    const close = open === '(' ? ')' : open === '[' ? ']' : null;
    if (!close) return -1;
    let depth = 0;
    let hasLatin = false;
    for (let k = pos; k < n && k - pos < 160; k++) {
      const ch = text[k];
      if (ARABIC_CHAR_RE.test(ch)) return -1;
      if (LATIN_LETTER_RE.test(ch)) hasLatin = true;
      if (ch === open) depth++;
      else if (ch === close) {
        depth--;
        if (depth === 0) {
          return hasLatin ? k : -1;
        }
      }
    }
    return -1;
  };

  // Match compound LTR numeric patterns like 2026-11-15, 192.168.1.1, 3.14.1 (without Arabic digits)
  const matchCompoundNumericLtr = (pos) => {
    const slice = text.slice(pos);
    const m = slice.match(/^https?:\/\/[^\s\u0600-\u06FF]+|^v?\d+(?:[.\-/:]\d+){1,4}(?:\.\d+)?/);
    if (m && m[0]) {
      return pos + m[0].length;
    }
    return -1;
  };

  let arabicBuf = '';
  const flushArabic = () => {
    if (arabicBuf) {
      pushSeg(arabicBuf, true);
      arabicBuf = '';
    }
  };

  while (i < n) {
    const ch = text[i];

    // Case 1: Balanced bracketed Latin expression e.g. "(MCP Server)" or "[API v2]"
    if (ch === '(' || ch === '[') {
      const endBracket = matchBalancedLatinBracket(i);
      if (endBracket !== -1) {
        // Also check if another Latin phrase continues immediately after closing bracket
        let end = endBracket + 1;
        while (end < n) {
          const rest = text.slice(end);
          const contMatch = rest.match(/^[ \t,/:\-–—+]+[A-Za-z0-9\u00C0-\u024F._+\-/@#&=:%~()[\]]*/);
          if (contMatch && LATIN_LETTER_RE.test(contMatch[0])) {
            end += contMatch[0].length;
          } else {
            break;
          }
        }
        flushArabic();
        pushSeg(text.slice(i, end), false);
        i = end;
        continue;
      }
    }

    // Case 2: URLs or compound version/date numeric tokens (e.g. https://..., 2026-11-15)
    if (ch === 'h' || /[0-9v]/.test(ch)) {
      const urlOrCompoundEnd = matchCompoundNumericLtr(i);
      if (urlOrCompoundEnd !== -1 && !LATIN_LETTER_RE.test(ch)) {
        // Starts with a digit compound (dates/versions)
        flushArabic();
        pushSeg(text.slice(i, urlOrCompoundEnd), false);
        i = urlOrCompoundEnd;
        continue;
      }
      if (ch === 'h' && text.slice(i).startsWith('http')) {
        if (urlOrCompoundEnd !== -1) {
          flushArabic();
          pushSeg(text.slice(i, urlOrCompoundEnd), false);
          i = urlOrCompoundEnd;
          continue;
        }
      }
    }

    // Case 3: Latin letter starts an LTR span (can include digits, symbols, spaces between Latin words, and trailing paired brackets with Latin)
    if (LATIN_LETTER_RE.test(ch)) {
      flushArabic();
      let end = i + 1;
      while (end < n) {
        const c = text[end];
        if (ARABIC_CHAR_RE.test(c)) break;

        // Direct Latin/digit/technical characters
        if (/[A-Za-z0-9\u00C0-\u024F._+\-/@#&=:%~]/.test(c)) {
          // Avoid swallowing trailing Arabic sentence punctuation glued to end like a stray colon unless part of URL/time
          end++;
          continue;
        }

        // Balanced bracket inside or right after Latin phrase, e.g. "React (v19)"
        if (c === '(' || c === '[') {
          const bEnd = matchBalancedLatinBracket(end);
          if (bEnd !== -1) {
            end = bEnd + 1;
            continue;
          }
        }

        // Spaces / comma / slash / ampersand / hyphen connecting to MORE Latin or balanced Latin brackets or compound digits
        if (/[ \t,/:\-–—&+]/.test(c)) {
          let look = end + 1;
          while (look < n && /[ \t,/:\-–—&+0-9]/.test(text[look])) {
            look++;
          }
          if (look < n && (LATIN_LETTER_RE.test(text[look]) || ((text[look] === '(' || text[look] === '[') && matchBalancedLatinBracket(look) !== -1))) {
            end++;
            continue;
          }
          // Check digit immediately attached to Latin e.g. "PDF 2" where '2' ends a Latin phrase? Keep "HTTP 429" together!
          if (c === ' ' && end + 1 < n && /[0-9]/.test(text[end + 1])) {
            let numEnd = end + 1;
            while (numEnd < n && /[0-9.\-/:%]/.test(text[numEnd])) numEnd++;
            // Attach number if followed by boundary/Latin (e.g. "HTTP 429" or "Node 22") rather than standalone next Arabic clause
            const afterNum = text[numEnd];
            if (!afterNum || !ARABIC_CHAR_RE.test(afterNum)) {
              // Peek past spaces after the number: only absorb number into Latin run if NO Arabic follows or if clearly version/code (e.g. after uppercase acronym or before Latin)
              const prevWord = text.slice(i, end).trim();
              if (/^[A-Za-z0-9\-]+$/.test(prevWord)) {
                end = numEnd;
                continue;
              }
            }
          }
        }

        break;
      }

      // Trim any trailing weak punctuation like '.' ',' ':' from end of LTR run when followed by Arabic prose,
      // unless inside abbreviations/dots like "e.g." inside purely technical context
      let rawLatin = text.slice(i, end);
      while (rawLatin.length > 1 && /[ \t,:;/]$/.test(rawLatin)) {
        rawLatin = rawLatin.slice(0, -1);
        end--;
      }
      // Also don't swallow trailing single period right before Arabic text
      if (rawLatin.endsWith('.') && end < n && ARABIC_CHAR_RE.test(text.slice(end).trimStart()[0] || '')) {
        rawLatin = rawLatin.slice(0, -1);
        end--;
      }

      pushSeg(rawLatin, false);
      i = end;
      continue;
    }

    // Default: Arabic or Arabic-context character
    arabicBuf += ch;
    i++;
  }

  flushArabic();
  return segments;
}

/**
 * Determines paragraph-level RTL direction cleanly.
 * Mixed Arabic+English paragraphs stay RTL (`isRtl`), while purely English/Latin lines
 * (zero Arabic characters and at least 2 Latin letters) flow cleanly LTR even inside RTL books!
 */
export function resolveParagraphDirection(lineText, documentIsRtl) {
  if (!documentIsRtl) return false;
  if (!lineText) return true;
  if (containsArabic(lineText) || /[\uFD3E\uFD3F]/.test(lineText)) return true;
  const latinCount = (lineText.match(/[A-Za-z]/g) || []).length;
  return latinCount < 2;
}

function cleanMathForDocx(rawMath) {
  return rawMath
    .replace(/\\vec\{(\\text\{([^}]+)\}|([^}]+))\}/g, '$2$3 ⃗')
    .replace(/\\text\{([^}]+)\}/g, '$1')
    .replace(/\\mathrm\{([^}]+)\}/g, '$1')
    .replace(/\\mathbf\{([^}]+)\}/g, '$1')
    .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '($1 ÷ $2)')
    .replace(/\\sqrt\{([^}]+)\}/g, '√($1)')
    .replace(/\\langle/g, '⟨')
    .replace(/\\rangle/g, '⟩')
    .replace(/\\times/g, '×')
    .replace(/\\div/g, '÷')
    .replace(/\\pm/g, '±')
    .replace(/\\le/g, '≤')
    .replace(/\\ge/g, '≥')
    .replace(/\\ne/g, '≠')
    .replace(/\\approx/g, '≈')
    .replace(/\\infty/g, '∞')
    .replace(/\\theta/g, 'θ')
    .replace(/\\alpha/g, 'α')
    .replace(/\\beta/g, 'β')
    .replace(/\\gamma/g, 'γ')
    .replace(/\\Delta/g, 'Δ')
    .replace(/\\pi/g, 'π')
    .replace(/\\therefore/g, '∴')
    .replace(/\\because/g, '∵')
    .replace(/\\parallel/g, '//')
    .replace(/\\left\(/g, '(')
    .replace(/\\right\)/g, ')')
    .replace(/\\left\[/g, '[')
    .replace(/\\right\]/g, ']')
    .replace(/\\left\\{/g, '{')
    .replace(/\\right\\}/g, '}')
    .replace(/\\\|/g, '||')
    .replace(/\\cos/g, 'cos')
    .replace(/\\sin/g, 'sin')
    .replace(/\\tan/g, 'tan')
    .replace(/\\;/g, ' ')
    .replace(/\\,/g, ' ')
    .replace(/\\quad/g, '  ')
    .replace(/\\qquad/g, '   ')
    .replace(/\\[a-zA-Z]+/g, '')
    .trim();
}

function convertHtmlTablesToMarkdown(text) {
  if (!text || !text.includes('<table')) return text;
  return text.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (_, tableContent) => {
    const rows = [];
    const trMatches = tableContent.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);
    if (!trMatches) return '';
    for (const tr of trMatches) {
      const cells = [];
      const cellMatches = tr.match(/<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/gi);
      if (cellMatches) {
        for (const cell of cellMatches) {
          cells.push(
            cell
              .replace(/<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/gi, '$1')
              .replace(/<[^>]+>/g, '')
              .replace(/\r?\n+/g, ' ')
              .trim()
          );
        }
      }
      if (cells.length > 0) rows.push(cells);
    }
    if (rows.length === 0) return '';
    const maxCols = Math.max(...rows.map((r) => r.length));
    const padRows = rows.map((r) => {
      const copy = [...r];
      while (copy.length < maxCols) copy.push('');
      return copy;
    });
    const header = padRows[0];
    const sep = Array(maxCols).fill('---');
    return `\n\n| ${header.join(' | ')} |\n| ${sep.join(' | ')} |\n${padRows
      .slice(1)
      .map((r) => `| ${r.join(' | ')} |`)
      .join('\n')}\n\n`;
  });
}

function prepareMarkdownForDocx(raw) {
  if (!raw) return '';
  let text = toStandardArabicCore(sanitizeXmlString(raw));
  text = convertHtmlTablesToMarkdown(text);
  return sanitizeXmlString(
    text
      .replace(/---PAGE_BREAK[A-Z]*---/gi, '---PAGE_BREAK---')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/br>/gi, '\n')
      .replace(/&nbsp;/gi, ' ')
      .replace(/<\/?(span|div|p|strong|em|b|i)(?=[\s/>])[^>]*>/gi, '')
      .replace(/\\text\{([^}]+)\}/g, '$1')
      .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
      .replace(/^\s*\|\s*[-:]+\s*\|\s*$/gm, '')
      .replace(/\u200B/g, '')
  );
}

/**
 * Generates OOXML Document binary (Uint8Array) using injected `docx` and `JSZip` constructors.
 * Works identically in Node.js (MCP/CLI) and Browser bundles (via docxExporter.ts).
 */
export async function buildDocxBinary(options, deps) {
  const { docx, JSZip } = deps;
  const {
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
    UnderlineType,
  } = docx;

  const typoConfig = resolveTypographyConfig(options);
  const { palette } = typoConfig;
  const rawMarkdown = prepareMarkdownForDocx(options.markdown || '');
  const isRtl =
    options.isRtl !== undefined
      ? Boolean(options.isRtl)
      : options.direction === 'ltr'
      ? false
      : options.direction === 'rtl'
      ? true
      : isRightToLeftTextCore(rawMarkdown);

  const title = sanitizeXmlString(options.title || '');
  const author = sanitizeXmlString(options.author || 'Document Publishing Studio');

  const underlineStyle = { type: UnderlineType ? UnderlineType.SINGLE : 'single' };

  // Parse inline formatting using dual-script calibrated runs (supports nested bold/italic/underline/highlight/sup/sub/strike)
  const parseInlineRuns = (text, role = 'body', footnoteIdMap = new Map(), baseExtra = {}, paraRtl = isRtl, depth = 0) => {
    const runs = [];
    if (!text) return runs;
    if (depth > 6) {
      return [new TextRun(createDualScriptRunOptions(String(text), typoConfig, paraRtl, role, baseExtra))];
    }

    const pushSegmented = (content, runRole, extra = {}) => {
      if (!content) return;
      const mergedExtra = { ...baseExtra, ...extra };
      const segments = segmentByScript(content);
      for (const segment of segments) {
        if (!segment.text) continue;
        // Treat segment as Arabic RTL if segment is Arabic (or neutral inside RTL line without Latin)
        const runIsArabic = paraRtl ? segment.isArabic : false;
        runs.push(
          new TextRun(createDualScriptRunOptions(segment.text, typoConfig, runIsArabic, runRole, mergedExtra))
        );
      }
    };

    const pushNested = (inner, extra = {}) => {
      if (!inner) return;
      if (depth >= 4 || !/[<*~`$\[﴿]/.test(inner)) {
        pushSegmented(inner, role, extra);
        return;
      }
      const nestedRuns = parseInlineRuns(
        inner,
        role,
        footnoteIdMap,
        { ...baseExtra, ...extra },
        paraRtl,
        depth + 1
      );
      runs.push(...nestedRuns);
    };

    const regex =
      /(<u(?:\s[^>]*)?>[\s\S]*?<\/u>|<ins(?:\s[^>]*)?>[\s\S]*?<\/ins>|<mark(?:\s[^>]*)?>[\s\S]*?<\/mark>|<sup(?:\s[^>]*)?>[\s\S]*?<\/sup>|<sub(?:\s[^>]*)?>[\s\S]*?<\/sub>|<s(?:\s[^>]*)?>[\s\S]*?<\/s>|~~[^~\n]+~~|﴿[^﴾]+﴾|\$\$[\s\S]*?\$\$|\$[^\$\n]+?\$|\*\*\*[^\n]+?\*\*\*|\*\*[^\n]+?\*\*|\*(?!\*)[^\n*]+?\*(?!\*)|`.*?`|\[\^[^\]]+\]|\t|[^*`\$\[<﴿~\t]+|<(?!\/?(?:mark|u|ins|s|sup|sub)\b)[^>]*>)/gi;
    let match;
    let lastPos = -1;
    let loopCount = 0;

    while ((match = regex.exec(text)) !== null) {
      if (match[0].length === 0 || match.index === lastPos) {
        regex.lastIndex++;
        continue;
      }
      lastPos = match.index;
      if (++loopCount > 50000) break;

      const part = match[0];

      if (/^<u(?:\s[^>]*)?>[\s\S]*<\/u>$/i.test(part)) {
        const inner = part.replace(/^<u(?:\s[^>]*)?>|<\/u>$/gi, '');
        pushNested(inner, { underline: underlineStyle });
      } else if (/^<ins(?:\s[^>]*)?>[\s\S]*<\/ins>$/i.test(part)) {
        const inner = part.replace(/^<ins(?:\s[^>]*)?>|<\/ins>$/gi, '');
        pushNested(inner, { underline: underlineStyle });
      } else if (/^<mark(?:\s[^>]*)?>[\s\S]*<\/mark>$/i.test(part)) {
        const inner = part.replace(/^<mark(?:\s[^>]*)?>|<\/mark>$/gi, '');
        pushNested(inner, { highlight: 'yellow' });
      } else if (/^<sup(?:\s[^>]*)?>[\s\S]*<\/sup>$/i.test(part)) {
        const inner = part.replace(/^<sup(?:\s[^>]*)?>|<\/sup>$/gi, '');
        pushNested(inner, { superScript: true });
      } else if (/^<sub(?:\s[^>]*)?>[\s\S]*<\/sub>$/i.test(part)) {
        const inner = part.replace(/^<sub(?:\s[^>]*)?>|<\/sub>$/gi, '');
        pushNested(inner, { subScript: true });
      } else if (/^<s(?:\s[^>]*)?>[\s\S]*<\/s>$/i.test(part)) {
        const inner = part.replace(/^<s(?:\s[^>]*)?>|<\/s>$/gi, '');
        pushNested(inner, { strike: true });
      } else if (part.startsWith('~~') && part.endsWith('~~') && part.length >= 4) {
        pushNested(part.slice(2, -2), { strike: true });
      } else if (part.startsWith('﴿') && part.endsWith('﴾') && part.length >= 3) {
        runs.push(
          new TextRun(
            createDualScriptRunOptions(part, typoConfig, true, 'quran', {
              ...baseExtra,
              bold: true,
              color: palette.quranText,
              sizeComplexScript: Math.max(typoConfig.sizes.quran.cs, typoConfig.sizes[role]?.cs || 0),
            })
          )
        );
      } else if (part === '\t') {
        runs.push(new TextRun(createDualScriptRunOptions('\t', typoConfig, paraRtl, role, baseExtra)));
      } else if (part.startsWith('$$') && part.endsWith('$$') && part.length >= 4) {
        const cleanMath = cleanMathForDocx(part.slice(2, -2));
        runs.push(
          new TextRun(
            createDualScriptRunOptions(` ${cleanMath} `, typoConfig, false, 'math', {
              ...baseExtra,
              bold: true,
              color: palette.mathText,
            })
          )
        );
      } else if (part.startsWith('$') && part.endsWith('$') && part.length >= 2) {
        const innerMath = part.slice(1, -1).trim();
        const isRealMath =
          /[\^_\\]|[\+\*\/\=<>±×÷≤≥≠≈∑∫√]|\\(?:frac|sqrt|times|pm|approx|le|ge|neq|sum|int|sin|cos|tan|pi|alpha|beta|theta|gamma|delta|sigma|infty|parallel)/.test(
            innerMath
          );
        if (isRealMath) {
          const cleanMath = cleanMathForDocx(innerMath);
          runs.push(
            new TextRun(
              createDualScriptRunOptions(` ${cleanMath} `, typoConfig, false, 'math', {
                ...baseExtra,
                color: palette.mathText,
              })
            )
          );
        } else {
          // Fake math wrapper (e.g. $٣٤٪$, $أ$) -> render cleanly as normal bilingual prose
          pushSegmented(innerMath, role);
        }
      } else if (part.startsWith('***') && part.endsWith('***') && part.length >= 6) {
        pushNested(part.slice(3, -3), { bold: true, italics: true });
      } else if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
        pushNested(part.slice(2, -2), { bold: true });
      } else if (part.startsWith('*') && part.endsWith('*') && part.length >= 2) {
        pushNested(part.slice(1, -1), { italics: true });
      } else if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
        runs.push(
          new TextRun(
            createDualScriptRunOptions(part.slice(1, -1), typoConfig, false, 'code', {
              ...baseExtra,
              color: palette.codeText,
              shading: { fill: 'F3F4F6', type: ShadingType.CLEAR },
            })
          )
        );
      } else if (part.startsWith('[^') && part.endsWith(']') && FootnoteReferenceRun) {
        const fnRef = part.slice(2, -1);
        const fnId = footnoteIdMap.get(fnRef);
        if (fnId) {
          runs.push(new FootnoteReferenceRun(fnId));
        } else {
          pushSegmented(part, role);
        }
      } else {
        const cleanPart = part
          .replace(/\\text\{([^}]+)\}/g, '$1')
          .replace(/<(?!\/?(?:mark|u|s|sup|sub)\b)[^>]*>/gi, '');
        if (cleanPart) {
          pushSegmented(cleanPart, role);
        }
      }
    }

    if (runs.length === 0) {
      pushSegmented(text, role);
    }
    return runs;
  };

  // Extract footnotes
  const footnoteRegex = /^\[\^([^\]]+)\]:\s*(.*)$/gm;
  const footnotesData = {};
  const footnoteIdMap = new Map();
  let fnCounter = 1;
  let fnMatch;

  while ((fnMatch = footnoteRegex.exec(rawMarkdown)) !== null) {
    const fnRef = fnMatch[1];
    const fnText = fnMatch[2];
    footnoteIdMap.set(fnRef, fnCounter);
    const fnRtl = resolveParagraphDirection(fnText, isRtl);

    footnotesData[fnCounter] = {
      children: [
        new Paragraph({
          alignment: fnRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
          bidirectional: fnRtl,
          spacing: { before: 40, after: 40, line: Math.max(240, typoConfig.lineSpacing - 40) },
          children: parseInlineRuns(fnText.trim(), 'footnote', new Map(), { color: palette.bodyText }, fnRtl),
        }),
      ],
    };
    fnCounter++;
  }

  const markdown = rawMarkdown.replace(/^\[\^([^\]]+)\]:\s*(.*)$/gm, '').trim();
  const lines = markdown.split('\n');
  const children = [];

  const defaultAlignment = isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT;

  // Title paragraph
  if (title && title.trim()) {
    const titleRtl = resolveParagraphDirection(title, isRtl);
    children.push(
      new Paragraph({
        heading: HeadingLevel.TITLE,
        alignment: titleRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
        bidirectional: titleRtl,
        spacing: { before: 100, after: 200, line: typoConfig.lineSpacing },
        children: parseInlineRuns(
          title.trim(),
          'title',
          footnoteIdMap,
          { bold: true, color: palette.title },
          titleRtl
        ),
      })
    );
  }

  let inTable = false;
  let tableRowsData = [];

  const flushTable = () => {
    if (tableRowsData.length === 0) return;
    const validRows = tableRowsData.filter((row) => !row.every((cell) => /^[\s-:]+$/.test(cell)));

    if (validRows.length > 0) {
      const numCols = Math.max(...validRows.map((r) => r.length));
      const totalWidthTwips = 9600;
      const colWidthTwip = Math.floor(totalWidthTwips / Math.max(1, numCols));

      const docxRows = validRows.map((row, rowIndex) => {
        const isHeader = rowIndex === 0;
        const cells = [];
        for (let colIdx = 0; colIdx < numCols; colIdx++) {
          const cellText = (row[colIdx] || '').trim();
          const cellRtl = resolveParagraphDirection(cellText, isRtl);
          cells.push(
            new TableCell({
              width: { size: colWidthTwip, type: WidthType.DXA },
              shading: isHeader
                ? { fill: palette.tableHeaderBg, type: ShadingType.CLEAR }
                : rowIndex % 2 === 1
                ? { fill: palette.tableAltBg, type: ShadingType.CLEAR }
                : undefined,
              margins: { top: 130, bottom: 130, left: 150, right: 150 },
              children: [
                new Paragraph({
                  alignment: cellRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
                  bidirectional: cellRtl,
                  spacing: { before: 30, after: 30, line: Math.max(250, typoConfig.lineSpacing - 20) },
                  children: parseInlineRuns(
                    cellText,
                    isHeader ? 'tableHeader' : 'tableBody',
                    footnoteIdMap,
                    isHeader ? { bold: true, color: palette.title } : { color: palette.bodyText },
                    cellRtl
                  ),
                }),
              ],
            })
          );
        }
        return new TableRow({ children: cells, tableHeader: isHeader, cantSplit: true });
      });

      children.push(
        new Table({
          columnWidths: Array(numCols).fill(colWidthTwip),
          rows: docxRows,
          width: { size: 100, type: WidthType.PERCENTAGE },
          alignment: defaultAlignment,
          visuallyRightToLeft: isRtl,
          borders: {
            top: { style: BorderStyle.SINGLE, size: 6, color: palette.tableOuterBorder },
            bottom: { style: BorderStyle.SINGLE, size: 6, color: palette.tableOuterBorder },
            left: { style: BorderStyle.SINGLE, size: 4, color: palette.tableSideBorder },
            right: { style: BorderStyle.SINGLE, size: 4, color: palette.tableSideBorder },
            insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: palette.tableInnerBorder },
            insideVertical: { style: BorderStyle.SINGLE, size: 2, color: palette.tableInnerBorder },
          },
        })
      );
      children.push(new Paragraph({ spacing: { after: 140 }, bidirectional: isRtl }));
    }

    tableRowsData = [];
    inTable = false;
  };

  let inCodeBlock = false;
  let codeBlockLines = [];

  const flushCodeBlock = () => {
    if (codeBlockLines.length > 0) {
      children.push(
        new Paragraph({
          alignment: AlignmentType.LEFT,
          bidirectional: false,
          shading: { fill: palette.codeBg, type: ShadingType.CLEAR },
          spacing: { before: 80, after: 80, line: 260 },
          children: [
            new TextRun(
              createDualScriptRunOptions(codeBlockLines.join('\n'), typoConfig, false, 'code', {
                color: palette.bodyText,
              })
            ),
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

    if (line.startsWith('```')) {
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

    const isTableRow =
      (line.startsWith('|') && (line.endsWith('|') || line.includes('|', 1))) ||
      ((line.match(/\|/g) || []).length >= 2 && !line.startsWith('#'));

    if (isTableRow) {
      inTable = true;
      let cleanLine = line;
      if (cleanLine.startsWith('|')) cleanLine = cleanLine.slice(1);
      if (cleanLine.endsWith('|')) cleanLine = cleanLine.slice(0, -1);
      tableRowsData.push(cleanLine.split('|').map((c) => c.trim()));
      continue;
    } else if (inTable) {
      flushTable();
    }

    if (line === '---PAGE_BREAK---' || /^(?:---PAGE[\s_]?BREAK---|<!--\s*page_?break\s*-->)$/i.test(line)) {
      children.push(new Paragraph({ bidirectional: isRtl, children: [new PageBreak()] }));
      continue;
    }

    if (!line) {
      children.push(new Paragraph({ spacing: { after: 60 }, bidirectional: isRtl }));
      continue;
    }

    if (/^(\*\*\*|---|___)$/.test(line)) {
      children.push(
        new Paragraph({
          bidirectional: isRtl,
          border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: palette.tableSideBorder } },
          spacing: { before: 80, after: 80 },
        })
      );
      continue;
    }

    // Headings H1–H4 with calibrated sizes, keepNext orphan protection, and mixed-script support
    if (line.startsWith('# ')) {
      const hText = line.replace(/^#\s+/, '');
      if (i <= 2 && title && hText.trim() === title.trim()) {
        continue;
      }
      const hRtl = resolveParagraphDirection(hText, isRtl);
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          alignment: hRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
          bidirectional: hRtl,
          keepNext: true,
          spacing: { before: 240, after: 120, line: typoConfig.lineSpacing },
          shading: { fill: palette.h1Bg, type: ShadingType.CLEAR },
          border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: palette.h1Border } },
          children: parseInlineRuns(hText, 'h1', footnoteIdMap, { bold: true, color: palette.h1Text }, hRtl),
        })
      );
      continue;
    }

    if (line.startsWith('## ')) {
      const hText = line.replace(/^##\s+/, '');
      const hRtl = resolveParagraphDirection(hText, isRtl);
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          alignment: hRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
          bidirectional: hRtl,
          keepNext: true,
          spacing: { before: 180, after: 90, line: typoConfig.lineSpacing },
          border: hRtl
            ? { right: { style: BorderStyle.SINGLE, size: 8, color: palette.h2Border } }
            : { left: { style: BorderStyle.SINGLE, size: 8, color: palette.h2Border } },
          children: parseInlineRuns(hText, 'h2', footnoteIdMap, { bold: true, color: palette.h2Text }, hRtl),
        })
      );
      continue;
    }

    if (line.startsWith('### ')) {
      const hText = line.replace(/^###\s+/, '');
      const hRtl = resolveParagraphDirection(hText, isRtl);
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          alignment: hRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
          bidirectional: hRtl,
          keepNext: true,
          spacing: { before: 140, after: 70, line: typoConfig.lineSpacing },
          children: parseInlineRuns(hText, 'h3', footnoteIdMap, { bold: true, color: palette.h3Text }, hRtl),
        })
      );
      continue;
    }

    if (line.startsWith('#### ')) {
      const hText = line.replace(/^####\s+/, '');
      const hRtl = resolveParagraphDirection(hText, isRtl);
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_4,
          alignment: hRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
          bidirectional: hRtl,
          keepNext: true,
          spacing: { before: 110, after: 55, line: typoConfig.lineSpacing },
          children: parseInlineRuns(hText, 'h4', footnoteIdMap, { bold: true, color: palette.h4Text }, hRtl),
        })
      );
      continue;
    }

    // Arabic Exam Q/A pattern (س١: / **س١:** / ج١:)
    const examQMatch = line.match(/^(\s*)(?:\*\*)?([سج]\s*[٠-٩\d]+)\s*([:.\-)])(?:\*\*)?\s*(.*)$/);
    if (examQMatch) {
      const prefixSymbol = `${examQMatch[2]}${examQMatch[3]}`;
      const restOfText = examQMatch[4];
      const isQuestion = examQMatch[2].startsWith('س');
      const symbolColor = isQuestion ? palette.questionText : palette.answerText;

      children.push(
        new Paragraph({
          alignment: defaultAlignment,
          bidirectional: isRtl,
          indent: isRtl ? { right: 360, hanging: 360 } : { left: 360, hanging: 360 },
          spacing: { before: 55, after: 45, line: typoConfig.lineSpacing },
          children: [
            new TextRun(
              createDualScriptRunOptions(`${prefixSymbol} `, typoConfig, isRtl, 'examPrefix', {
                bold: true,
                color: symbolColor,
              })
            ),
            ...parseInlineRuns(restOfText, 'body', footnoteIdMap, { color: palette.bodyText }, isRtl),
          ],
        })
      );
      continue;
    }

    // Numbered lists
    const numberedMatch = line.match(
      /^(\s*)([\d\u0660-\u0669\u06F0-\u06F9]+|[أ-ي]\b|[a-zA-Z]\b|\([^)]+\)|[٠-٩]+)([.\-)]\s+|\s+-\s+)(.*)$/
    );
    if (numberedMatch) {
      const prefixSymbol = `${numberedMatch[2]}${numberedMatch[3].trim()}`;
      const restOfText = numberedMatch[4];
      const pRtl = resolveParagraphDirection(restOfText, isRtl);
      const isQuestion = /سؤال|علل|بين|ما الحكم|وضح|اذكر|قارن|ما رأي/i.test(restOfText);
      const symbolColor = isQuestion ? palette.questionText : palette.h2Text;

      children.push(
        new Paragraph({
          alignment: pRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
          bidirectional: pRtl,
          indent: pRtl ? { right: 360, hanging: 360 } : { left: 360, hanging: 360 },
          spacing: { before: 45, after: 45, line: typoConfig.lineSpacing },
          children: [
            new TextRun(
              createDualScriptRunOptions(`${prefixSymbol} `, typoConfig, pRtl, 'body', {
                bold: true,
                color: symbolColor,
              })
            ),
            ...parseInlineRuns(restOfText, 'body', footnoteIdMap, { color: palette.bodyText }, pRtl),
          ],
        })
      );
      continue;
    }

    // Bullet lists
    if (/^\s*[-*+]\s+/.test(line)) {
      const itemText = line.replace(/^\s*[-*+]\s+/, '');
      const pRtl = resolveParagraphDirection(itemText, isRtl);
      children.push(
        new Paragraph({
          alignment: pRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
          bidirectional: pRtl,
          indent: pRtl ? { right: 360, hanging: 360 } : { left: 360, hanging: 360 },
          spacing: { before: 40, after: 40, line: typoConfig.lineSpacing },
          children: [
            new TextRun(
              createDualScriptRunOptions('• ', typoConfig, pRtl, 'body', {
                bold: true,
                color: palette.bulletText,
              })
            ),
            ...parseInlineRuns(itemText, 'body', footnoteIdMap, { color: palette.bodyText }, pRtl),
          ],
        })
      );
      continue;
    }

    // Blockquotes
    if (line.startsWith('> ')) {
      const quoteText = line.replace(/^>\s+/, '');
      const qRtl = resolveParagraphDirection(quoteText, isRtl);
      children.push(
        new Paragraph({
          alignment: qRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
          bidirectional: qRtl,
          spacing: { before: 70, after: 70, line: typoConfig.lineSpacing },
          indent: qRtl ? { right: convertInchesToTwip(0.22) } : { left: convertInchesToTwip(0.22) },
          border: qRtl
            ? { right: { style: BorderStyle.SINGLE, size: 16, color: palette.quoteBorder } }
            : { left: { style: BorderStyle.SINGLE, size: 16, color: palette.quoteBorder } },
          children: parseInlineRuns(quoteText, 'quote', footnoteIdMap, { color: palette.bodyText }, qRtl),
        })
      );
      continue;
    }

    // Standard paragraph
    let cleanParaLine = line.replace(/\s*\|\s*$/, '').replace(/\s+\|\s+/g, '\t');
    const pRtl = resolveParagraphDirection(cleanParaLine, isRtl);

    children.push(
      new Paragraph({
        alignment: pRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
        bidirectional: pRtl,
        spacing: { before: 40, after: 120, line: typoConfig.lineSpacing },
        children: parseInlineRuns(cleanParaLine, 'body', footnoteIdMap, { color: palette.bodyText }, pRtl),
      })
    );
  }

  if (inTable) flushTable();
  if (inCodeBlock) flushCodeBlock();

  const docConfig = {
    creator: author,
    title: title || 'Converted Document',
    description: 'High-precision bilingual PDF transcription converted to DOCX with calibrated Arabic/English typography',
    styles: {
      default: {
        document: {
          run: {
            rightToLeft: isRtl,
            font: {
              ascii: typoConfig.englishFont,
              cs: typoConfig.arabicFont,
              hAnsi: typoConfig.englishFont,
              eastAsia: typoConfig.englishFont,
            },
            size: typoConfig.sizes.body.ascii,
            sizeComplexScript: typoConfig.sizes.body.cs,
          },
          paragraph: {
            alignment: defaultAlignment,
            spacing: { line: typoConfig.lineSpacing, after: 120 },
            ...(isRtl ? { bidirectional: true } : {}),
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: {
              width: 11906, // A4 width in twips
              height: 16838, // A4 height in twips
            },
            margin: {
              top: convertInchesToTwip(0.68),
              bottom: convertInchesToTwip(0.68),
              left: convertInchesToTwip(0.7),
              right: convertInchesToTwip(0.7),
            },
          },
        },
        children,
      },
    ],
  };

  if (Object.keys(footnotesData).length > 0) {
    docConfig.footnotes = footnotesData;
  }

  const doc = new Document(docConfig);
  const rawUint8 = Packer.toUint8Array
    ? await Packer.toUint8Array(doc)
    : new Uint8Array(await Packer.toBuffer(doc));

  if (!isRtl || !JSZip) {
    return rawUint8;
  }

  try {
    const zip = await JSZip.loadAsync(rawUint8);
    const docXmlFile = zip.file('word/document.xml');
    if (docXmlFile) {
      let docXml = await docXmlFile.async('text');
      if (!/<w:sectPr\b[^>]*>[\s\S]*?<w:bidi\b/.test(docXml)) {
        docXml = docXml.replace(/<\/w:sectPr>/g, '<w:bidi/></w:sectPr>');
      }
      zip.file('word/document.xml', docXml);
    }
    return await zip.generateAsync({ type: 'uint8array' });
  } catch {
    return rawUint8;
  }
}
