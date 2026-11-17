/**
 * Unified Framework-Free Arabic & Bilingual Text Refinement + Strict QA Pipeline.
 * Consumed identically by the Browser Web App, Backend Server, MCP Server, and CLI Batch Runner
 * so offline conversions achieve 100% parity with the main web pipeline.
 */

const ARABIC_PRESENTATION_FORMS = /[\uFB50-\uFDFF\uFE70-\uFEFF]/g;
const ARABIC_LETTER = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;
const ARABIC_LETTER_GLOBAL = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/g;

const DAMAGED_OCR_REPLACEMENTS = [
  // Microsoft proprietary font PUA honorifics -> standard Arabic prose
  [/\uF074/g, ' (رضي الله عنه) '],
  [/\uF072/g, ' (صلى الله عليه وسلم) '],
  [/\uF073/g, ' (عليه السلام) '],
  [/\uF075/g, ' (رحمه الله) '],
  [/\uF076/g, ' (عز وجل) '],
  [/\uFDFA/g, ' صلى الله عليه وسلم '],
  [/\uFDFB/g, ' جل جلاله '],
  [/\uFDF0/g, ' صلعم '],
  [/\uFDF1/g, ' عليه السلام '],
  [/\uFDFD/g, ' بسم الله الرحمن الرحيم '],

  // Specific OCR artifacts and corrupted Latin/Arabic transitions
  [/يفid/g, 'يفيد'],
  [/الحكم\);/g, 'الحكم)؛'],
  [/([\u0621-\u064A])؛([a-zA-Z])/g, '$1؛ $2'],

  // Mojibake and encoding corruption (windows-1256 / UTF-8 misinterpretation)
  [/Ø§Ù„/g, 'ال'],
  [/Ø£Ù/g, 'أ'],
  [/Ø¥Ù/g, 'إ'],
  [/Ù ÙŠ/g, 'في'],
  [/Ù…Ù†/g, 'من'],
  [/Ø¹Ù„Ù‰/g, 'على'],
  [/Ù‡Ø°Ø§/g, 'هذا'],
  [/Ø§Ù„Ù„Ù‡/g, 'الله'],
  [/Ø±Ø¶ÙŠ/g, 'رضي'],
  [/Ø¹Ù†Ù‡/g, 'عنه'],
  [/ØµÙ„Ù‰/g, 'صلى'],
  [/Ø¹Ù„ÙŠÙ‡/g, 'عليه'],
  [/ÙˆØ³Ù„Ù…/g, 'وسلم'],
  [/Ø¨Ù†/g, 'بن'],
  [/Ø¹Ø¨Ø¯/g, 'عبد'],

  // Inverted / misplaced punctuation inside Arabic passages (same line only)
  [/([\u0621-\u064A])[ \t]*\?[ \t]*([\u0621-\u064A])/g, '$1؟ $2'],
  [/([\u0621-\u064A])[ \t]*;([\u0621-\u064A])/g, '$1؛ $2'],
  [/([\u0621-\u064A])[ \t]*,([\u0621-\u064A])/g, '$1، $2'],
  [/([\u0621-\u064A])[ \t]*\?$/gm, '$1؟'],
  [/([\u0621-\u064A])[ \t]*;$/gm, '$1؛'],
  [/([\u0621-\u064A])[ \t]*,$/gm, '$1،'],

  // Common broken OCR character confusions strictly inside Arabic words (never across spaces or Markdown table pipes)
  [/([\u0621-\u064A])l([\u0621-\u064A])/g, '$1ا$2'],
  [/([\u0621-\u064A])1([\u0621-\u064A])/g, '$1ا$2'],
  [/([\u0621-\u064A])0([\u0621-\u064A])/g, '$1ه$2'],
  [/([\u0621-\u064A])\|([\u0621-\u064A])/g, '$1ا$2'],

  // Excessive kashida / stretching
  [/ـ{2,}/g, 'ـ'],

  // Orphaned Arabic diacritics floating on whitespace
  [/\s+([\u064B-\u065F\u0670])/g, '$1'],

  // Spacing inside quotes & brackets
  [/«\s+/g, '«'],
  [/\s+»/g, '»'],
  [/\(\s+/g, '('],
  [/\s+\)/g, ')'],

  // Clean zero-width & replacement glyphs
  [/[\u200B\u200C\u200D\uFEFF\uFFFD]/g, ''],

  // Repeated garbage punctuation
  [/\?{2,}/g, '؟'],
  [/؛{2,}/g, '؛'],
  [/،{2,}/g, '،'],
  [/_{3,}/g, '___'],
  [/\.{6,}/g, '...'],
];

export function toStandardArabicCore(text) {
  if (!text) return text || '';
  let cleaned = text.replace(ARABIC_PRESENTATION_FORMS, (char) => char.normalize('NFKC'));
  for (const [pattern, replacement] of DAMAGED_OCR_REPLACEMENTS) {
    cleaned = cleaned.replace(pattern, replacement);
  }
  return cleaned;
}

export function countArabicCharactersCore(text) {
  if (!text) return 0;
  return (text.match(ARABIC_LETTER_GLOBAL) || []).length;
}

export function countLatinCharactersCore(text) {
  if (!text) return 0;
  return (text.match(/[a-zA-Z]/g) || []).length;
}

export function isRightToLeftTextCore(text) {
  if (!text) return false;
  const arabic = countArabicCharactersCore(text);
  const latin = countLatinCharactersCore(text);
  if (arabic === 0) return false;
  return arabic >= latin * 0.3;
}

export function containsArabicCore(text) {
  if (!text) return false;
  return ARABIC_LETTER.test(text);
}

/**
 * Unwraps fake math equations ($...$, \text{...}) into plain text while leaving real math intact.
 */
export function unwrapFakeMathCore(text) {
  if (!text) return '';
  let result = text
    .replace(/\\text\{([^}]+)\}/g, '$1')
    .replace(/\\mathbf\{([^}]+)\}/g, '$1')
    .replace(/\\mathrm\{([^}]+)\}/g, '$1')
    .replace(/\\underline\{([^}]+)\}/g, '<u>$1</u>')
    .replace(/(?:[^\s<>][\u064B-\u065F\u0670]*[\u0332\u0333]+[\u064B-\u065F\u0670]*)+/g, (m) => {
      const clean = m.replace(/[\u0332\u0333]/g, '');
      return clean.trim() ? `<u>${clean}</u>` : clean;
    })
    .replace(/\$([\u0600-\u06FF\s٪%٠-٩]+)\$/g, '$1');

  // Unwrap single-$ blocks that contain no mathematical operators (e.g. $أ$, $٣٤٪$, $PDF$)
  result = result.replace(/(?<!\$)\$([^\$\n]+?)\$(?!\$)/g, (full, inner) => {
    const trimmed = inner.trim();
    const hasMathOperators =
      /[\^_\\]|[\+\*\/\=<>±×÷≤≥≠≈∑∫√]|\\(?:frac|sqrt|times|pm|approx|le|ge|neq|sum|int|sin|cos|tan|pi|alpha|beta|theta|gamma|delta|sigma|infty|parallel)/.test(
        trimmed
      );
    return hasMathOperators ? full : trimmed;
  });

  return result;
}

/**
 * Removes running page headers/footers repeating across >= 50% of pages separated by ---PAGE_BREAK---.
 */
export function pruneRunningHeadersCore(markdown) {
  if (!markdown || !markdown.includes('---PAGE_BREAK---')) {
    return markdown || '';
  }

  const pages = markdown.split(/---PAGE_BREAK---/);
  if (pages.length <= 2) return markdown;

  const topCandidates = {};
  const bottomCandidates = {};

  for (const page of pages) {
    const lines = page
      .trim()
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    if (lines.length >= 4) {
      for (let i = 0; i < Math.min(2, lines.length); i++) {
        const norm = lines[i].replace(/[٠-٩\d\s\-_–—]/g, '');
        if (norm.length >= 6) topCandidates[norm] = (topCandidates[norm] || 0) + 1;
      }
      for (let i = Math.max(0, lines.length - 2); i < lines.length; i++) {
        const norm = lines[i].replace(/[٠-٩\d\s\-_–—]/g, '');
        if (norm.length >= 6) bottomCandidates[norm] = (bottomCandidates[norm] || 0) + 1;
      }
    }
  }

  const threshold = Math.max(2, Math.floor(pages.length * 0.5));
  const running = new Set();
  for (const [k, v] of Object.entries(topCandidates)) {
    if (v >= threshold) running.add(k);
  }
  for (const [k, v] of Object.entries(bottomCandidates)) {
    if (v >= threshold) running.add(k);
  }

  if (running.size === 0) return markdown;

  const cleanedPages = pages.map((page) => {
    const lines = page.split('\n');
    return lines
      .filter((line, idx) => {
        const norm = line.trim().replace(/[٠-٩\d\s\-_–—]/g, '');
        const nearEdge = idx < 3 || idx >= lines.length - 3;
        return !(nearEdge && running.has(norm));
      })
      .join('\n');
  });

  return cleanedPages.join('\n\n---PAGE_BREAK---\n\n');
}

/**
 * Expands glued multi-choice lines (-1 ... -2 ... or (أ) ... (ب) ...) into discrete list lines.
 */
export function explodeMultipleChoicesCore(text) {
  if (!text) return '';
  const lines = text.split('\n');
  const result = [];
  const multiChoicePattern =
    /(?:^|(?<=[\s.،]))(?:-([٠-٩\d]{1,2})|([٠-٩\d]{1,2})-|\(([\u0621-\u064Aa-zA-Z\d٠-٩]{1,2})\))\s+/g;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.startsWith('|') || line.startsWith('#')) {
      result.push(rawLine);
      continue;
    }
    const matches = [...line.matchAll(multiChoicePattern)];
    if (matches.length >= 2) {
      let remaining = line;
      const pieces = [];
      for (let i = matches.length - 1; i >= 0; i--) {
        const matchIndex = matches[i].index || 0;
        const piece = remaining.slice(matchIndex).trim();
        remaining = remaining.slice(0, matchIndex).trim();
        pieces.unshift(piece);
      }
      if (remaining) result.push(remaining);
      for (const p of pieces) {
        if (p) result.push(`- ${p.replace(/^[-–—]\s*/, '')}`);
      }
    } else {
      result.push(rawLine);
    }
  }
  return result.join('\n');
}

/**
 * Fixes glued table headers, scanner noise ('شمخ', watermarks), Azhar/fiqh/hadith typos, and Quranic OCR distortions.
 */
export function cleanKnownPatternsAndTablesCore(raw) {
  if (!raw) return '';
  let text = raw;
  let patternFixes = 0;

  // Convert HTML tables if present
  if (text.includes('<table')) {
    text = text.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (_, tableContent) => {
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
      const pad = (r) => {
        const copy = [...r];
        while (copy.length < maxCols) copy.push('');
        return copy;
      };
      const header = pad(rows[0]);
      const sep = Array(maxCols).fill('---');
      patternFixes++;
      return `\n\n| ${header.join(' | ')} |\n| ${sep.join(' | ')} |\n${rows
        .slice(1)
        .map((r) => `| ${pad(r).join(' | ')} |`)
        .join('\n')}\n\n`;
    });
  }

  // Strip HTML wrappers EXCEPT <mark>...</mark>, clean pagination noise & watermarks
  text = text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/br>/gi, '\n')
    .replace(/&nbsp;/gi, ' ')
    .replace(/<\/?(span|div|p|b|strong|em|i)(?=[\s/>])[^>]*>/gi, '')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    .replace(/(?:CamScanner|Created with Photo-to-PDF|Adobe Scan|Scanned with [^\n]+)/gi, '')
    .replace(/^[ \t]*(?:الصفحة|Page)[ \t]+\d+[ \t]*$|^[ \t]*-[ \t]*\d+[ \t]*-[ \t]*$/gim, '');

  // Glued 'ا' table headers & Azhar curriculum corrections
  const tableHeaderFixes = [
    [/خطة[ \t]*القسم[ \t]*الأدبياالفترة[ \t]*الزمنيةاالموضوعات/g, '| خطة القسم الأدبي | الفترة الزمنية | الموضوعات |'],
    [/خطة[ \t]*القسم[ \t]*العلمياالفترة[ \t]*الزمنيةاالموضوعات/g, '| خطة القسم العلمي | الفترة الزمنية | الموضوعات |'],
    [/الفهرساالموضوعارقم[ \t]*الصفحةاااالموضوعارقم[ \t]*الصفحة/g, '| الموضوع | رقم الصفحة | الموضوع | رقم الصفحة |'],
    [/الفهرساالموضوعارقم[ \t]*الصفحة/g, '| الفهرس | الموضوع | رقم الصفحة |'],
    [/الفقه[ \t]*الحنفيانوع[ \t]*الدليلاالتوضيح/g, '| الفقه الحنفي | نوع الدليل | التوضيح |'],
    [/نوع[ \t]*الدليلاالتوضيح/g, '| نوع الدليل | التوضيح |'],
    [/(?:سلاح[ \t]*الأزهر[ي]?[ \t]*ا|ما)?صاحب[ \t]*ا+الرأي[ \t]*ا+الحكم[ \t]*ا+التعليل[ \t]*ا+والدليل/g, '| صاحب الرأي | الحكم | التعليل | الدليل |'],
    [/(?:سلاح[ \t]*الأزهر[ي]?[ \t]*ا|ما)?صاحب[ \t]*ا+الرأي[ \t]*ا+الحكم[ \t]*ا+التعليل[ \t]*(?:ا+والتعليل)?/g, '| صاحب الرأي | الحكم | التعليل |'],
    [/صاحباالرأيابيانهاالتعليل/g, '| صاحب الرأي | البيان | التعليل |'],
    [/صاحب[ \t]*ا+الرأي[ \t]*ا+المدة[ \t]*ا+العلة/g, '| صاحب الرأي | المدة | العلة |'],
    [/صاحب[ \t]*ا+الرأي[ \t]*ا+الحكم[ \t]*ا+الدليل[ \t]*ا+والتعليل/g, '| صاحب الرأي | الحكم | الدليل | التعليل |'],
    [/الرأياالحكماالتعليل|الرأياالحكماالتوضيح/g, '| الرأي | الحكم | التعليل |'],
    [/المطلوباالتوضيح/g, '| المطلوب | التوضيح |'],
    [/ما[ \t]*ينعقد[ \t]*بهاالتوضيح/g, '| ما ينعقد بها | التوضيح |'],
    [/نوعاالمبيعاالحكماالتعليل/g, '| نوع المبيع | الحكم | التعليل |'],
    [/(?:سلاح[ \t]*الأزهر[ي]?[ \t]*ا|ما)?المسألة[ \t]*ا+الحكم[ \t]*والتوضيح/g, '| المسألة | الحكم والتوضيح |'],
    [/(?:سلاح[ \t]*الأزهر[ي]?[ \t]*ا|ما)?المسألة[ \t]*ا+التوضيح(?:[ \t]*والتعليل)?/g, '| المسألة | التوضيح والتعليل |'],
    [/(?:سلاح[ \t]*الأزهر[ي]?[ \t]*ا|ما)?المثال[ \t]*ا+التوضيح/g, '| المثال | التوضيح |'],
    [/(?:سلاح[ \t]*الأزهر[ي]?[ \t]*ا|ما)?المصطلح[ \t]*ا+التوضيح/g, '| المصطلح | التوضيح |'],
  ];

  for (const [pattern, replacement] of tableHeaderFixes) {
    if (pattern.test(text)) {
      text = text.replace(pattern, replacement);
      patternFixes++;
    }
  }

  // Known typos, scanner artifacts & Quranic fixes
  const curriculumAndQuranFixes = [
    [/\bشمخ\b|[ \t]+شمخ(?=[ \t،.\n]|$)/g, ''],
    [/\^?\(?\s*[٠-٩0-9]+\s*\)?\s*شمخ/g, ''],
    [/(?:^|[^\u0621-\u064A])(?:بأنًّا|بأنًا|بانًا|بأنّا|بانّا|بانّاً|بأنّاً)(?:$|[^\u0621-\u064A])/g, ' باتًّا '],
    [/البيعي[ \t]+والوزني/g, 'الكيلي والوزني'],
    [/(?:^|[^\u0621-\u064A])الكتيف(?:$|[^\u0621-\u064A])/g, ' الكنيف '],
    [/(?:^|[^\u0621-\u064A])الزعْر(?:$|[^\u0621-\u064A])/g, ' الزرع '],
    [/تريق[ \t]+الصفقة/g, 'تفريق الصفقة'],
    [/(?:^|[^\u0621-\u064A])السففل(?:$|[^\u0621-\u064A])/g, ' السُّفْل '],
    [/أجرة[ \t]+الصيغ/g, 'أجرة الصَّبْغ'],
    [/أكتوبرامن/g, 'أكتوبر من'],
    [/نوفمبرامن/g, 'نوفمبر من'],
    [/ديسمبرامن/g, 'ديسمبر من'],
    [/ينايراامتحان/g, 'يناير | امتحان'],
    [/ومصوغهما[ \t]+ومصوغهما/g, 'ومصوغهما'],
    [/وعن[ \t]+لبن[ \t]+في[ \t]+ضرع[،,\s]+وعن[ \t]+لبن[ \t]+في[ \t]+ضرع/g, 'وعن لبن في ضرع'],
    [/راوية[ \t]+ابن[ \t]+ماجه/g, 'رواية ابن ماجه'],
    [/النساء[ \t]+الرجال(?=[ \t]*[،.\n]|$)/g, 'النساء شقائق الرجال'],
    [/كفته[ \t]+نيتة/g, 'كفته نيته'],
    [/مَن[ \t]+تَقُوتُ|مِن[ \t]+تَقُوتُ/g, '﴿مِن تَفَاوُتٍ﴾'],
    [/جواب[ \t]+الأمر[:\s]+﴿?بِقَلْبٍ﴾?/g, 'جواب الأمر: ﴿يَنقَلِبْ﴾'],
    [/الْبَصَرُ[ \t]+خَاشِعًا|الْبَصَرُ[ \t]+خاشعا/g, 'الْبَصَرُ خَاسِئًا'],
    [/أَن[ \t]+يَخِيفَ/g, 'أَن يَخْسِفَ'],
    [/يَعْمَوْا[ \t]+عَمَهًا/g, 'سَمِعُوا لَهَا شَهِيقًا'],
    [/أَلَيَأْتِيكُم[ \t]+نَذِيرٌ/g, 'أَلَمْ يَأْتِكُمْ نَذِيرٌ'],
    [/معنى[ \t]+كلمة[ \t]+﴿?صَنَفَتْ﴾?/g, 'معنى كلمة ﴿صَافَّاتٍ﴾'],
    [/فِي[ \t]+مَنَاكِلِهَا/g, 'فِي مَنَاكِبِهَا'],
    [/تَمَيَّزُ[ \t]+مِنَ[ \t]+الْفَيْضِ/g, 'تَمَيَّزُ مِنَ الْغَيْظِ'],
    [/فَصُحْقًا/g, 'فَسُحْقًا'],
    [/﴿{2,}/g, '﴿'],
    [/﴾{2,}/g, '﴾'],
  ];

  for (const [pattern, replacement] of curriculumAndQuranFixes) {
    if (pattern.test(text)) {
      text = text.replace(pattern, replacement);
      patternFixes++;
    }
  }

  // Normalize exam question / answer prefixes
  text = text
    .replace(/(?:^|(?<=[\s\n]))س\s*:\s*([٠-٩\d]+)\s*[:.-]?\s*/gm, (_, num) => `س${num}: `)
    .replace(/(?:^|(?<=[\s\n]))س\s+([٠-٩\d]+)\s*[:.-]\s*/gm, (_, num) => `س${num}: `)
    .replace(/(?:^|(?<=[\s\n]))ج\s*:\s*([٠-٩\d]+)\s*[:.-]?\s*/gm, (_, num) => `ج${num}: `)
    .replace(/(?:^|(?<=[\s\n]))ج\s+([٠-٩\d]+)\s*[:.-]\s*/gm, (_, num) => `ج${num}: `);

  // Normalize page break boundaries
  text = text
    .replace(/---PAGE_BREAK[A-Z]*---/gi, '---PAGE_BREAK---')
    .replace(/(^[-*+]\s+.*)[ \t]*---PAGE[\s_]?BREAK---[ \t]*/gm, '$1 ')
    .replace(/(^\|.*)[ \t]*---PAGE[\s_]?BREAK---[ \t]*/gm, '$1 ')
    .replace(/([^\n])[ \t]*---PAGE[\s_]?BREAK---[ \t]*([^\n])/gi, '$1\n\n---PAGE_BREAK---\n\n$2')
    .replace(/(?:[ \t]*---PAGE[\s_]?BREAK---[ \t]*\n*){2,}/gi, '\n\n---PAGE_BREAK---\n\n')
    .replace(/\n{3,}---PAGE[\s_]?BREAK---/gi, '\n\n---PAGE_BREAK---')
    .replace(/---PAGE[\s_]?BREAK---\n{3,}/gi, '---PAGE_BREAK---\n\n')
    .replace(/^\s*(?:---PAGE[\s_]?BREAK---\s*)+/gi, '')
    .replace(/(?:\s*---PAGE[\s_]?BREAK---)+\s*$/gi, '');

  // Clean English ligatures & bilingual word-gluing boundaries (protecting <mark> and code spans)
  text = polishBilingualBoundariesCore(text);

  return { text: text.trim(), patternFixes };
}

/**
 * Separates accidentally glued Arabic<->English boundaries (e.g. "تقنيةOCR" -> "تقنية OCR")
 * and normalizes English typographic ligatures (ﬁ, ﬂ) without altering HTML tags or code blocks.
 */
export function polishBilingualBoundariesCore(markdown) {
  if (!markdown) return '';
  const protectedTokens = [];
  let text = markdown.replace(/(```[\s\S]*?```|`[^`\n]+`|<\/?(?:mark|u|ins|s|sup|sub)(?:\s[^>]*)?>|https?:\/\/[^\s)]+)/gi, (m) => {
    const id = `__BILINGUAL_HOLD_${protectedTokens.length}__`;
    protectedTokens.push(m);
    return id;
  });

  text = text
    .replace(/\uFB01/g, 'fi')
    .replace(/\uFB02/g, 'fl')
    // Insert missing space where Arabic letter touches Latin letter directly (not tatweel ـ)
    .replace(/([\u0621-\u064A\u0671-\u06D3])([A-Za-z])/g, '$1 $2')
    .replace(/([A-Za-z])([\u0621-\u064A\u0671-\u06D3])/g, '$1 $2')
    // Ensure a space after comma/semicolon in mixed English-Arabic lines if followed directly by word
    .replace(/([a-zA-Z0-9]),([\u0600-\u06FF])/g, '$1, $2');

  return text.replace(/__BILINGUAL_HOLD_(\d+)__/g, (_, i) => protectedTokens[Number(i)] || '');
}

/**
 * Pads ragged Markdown tables so every row matches max column count and always has a valid separator row.
 */
export function normalizeMarkdownTablesCore(markdown) {
  if (!markdown || !markdown.includes('|')) return markdown || '';
  const lines = markdown.split('\n');
  const out = [];
  let tableBuf = [];

  const flush = () => {
    if (tableBuf.length === 0) return;
    const parsedRows = tableBuf.map((l) => {
      let c = l.trim();
      if (c.startsWith('|')) c = c.slice(1);
      if (c.endsWith('|')) c = c.slice(0, -1);
      return c.split('|').map((cell) => cell.trim());
    });
    const contentRows = parsedRows.filter((r) => !r.every((cell) => /^[\s:-]+$/.test(cell)));
    if (contentRows.length > 0) {
      const maxCols = Math.max(1, ...contentRows.map((r) => r.length));
      const pad = (r) => {
        const copy = [...r];
        while (copy.length < maxCols) copy.push('');
        return copy;
      };
      const header = pad(contentRows[0]);
      const sep = Array(maxCols).fill('---');
      out.push(`| ${header.join(' | ')} |`);
      out.push(`| ${sep.join(' | ')} |`);
      for (let i = 1; i < contentRows.length; i++) {
        out.push(`| ${pad(contentRows[i]).join(' | ')} |`);
      }
    }
    tableBuf = [];
  };

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    const isRow =
      (trimmed.startsWith('|') && (trimmed.endsWith('|') || trimmed.includes('|', 1))) ||
      ((trimmed.match(/\|/g) || []).length >= 2 && !trimmed.startsWith('#'));
    if (isRow) {
      tableBuf.push(trimmed);
    } else {
      flush();
      out.push(rawLine);
    }
  }
  flush();
  return out.join('\n');
}

/**
 * Strict QA Gates audit and repair (mirroring StrictQAGatesEngine for offline MCP/CLI parity).
 */
export function runStrictQAGatesCore(rawMarkdown) {
  if (!rawMarkdown) {
    return {
      overallPassed: false,
      qualityScore: 0,
      repairedCount: 0,
      repairedText: '',
      findings: [],
      verdictArabic: 'المستند فارغ لا يحتوي على أي نصوص للتدقيق.',
    };
  }

  let text = rawMarkdown;
  let repairedCount = 0;
  const findings = [];

  // Normalize curly Quran brackets { ... } -> ﴿ ... ﴾
  text = text.replace(/\{([^{}\n]{3,250})\}/g, (_, content) => {
    repairedCount++;
    findings.push({ code: 'T001', messageArabic: 'تم توحيد الأقواس القرآنية {} إلى ﴿﴾' });
    return `﴿${content}﴾`;
  });

  // Remove space before Arabic/Latin sentence punctuation (except ellipsis)
  text = text.replace(/[ \t]+([،؛!؟:])/g, (_, p) => {
    repairedCount++;
    return p;
  });

  // Ensure space after Arabic comma/semicolon/question mark when attached to next Arabic letter
  text = text.replace(/([،؛؟])(?=[\u0600-\u06FF])/g, '$1 ');

  // Normalize hamzas for core lexicon
  const hamzaDict = [
    [/(?<![\u0600-\u06FF])اي(?![\u0600-\u06FF])/g, 'أي'],
    [/(?<![\u0600-\u06FF])الي(?![\u0600-\u06FF])/g, 'إلى'],
    [/(?<![\u0600-\u06FF])ان(?![\u0600-\u06FF])/g, 'إن'],
    [/(?<![\u0600-\u06FF])اذا(?![\u0600-\u06FF])/g, 'إذا'],
    [/(?<![\u0600-\u06FF])ابو(?![\u0600-\u06FF])/g, 'أبو'],
    [/(?<![\u0600-\u06FF])احمد(?![\u0600-\u06FF])/g, 'أحمد'],
    [/(?<![\u0600-\u06FF])ازهر(?![\u0600-\u06FF])/g, 'أزهر'],
    [/(?<![\u0600-\u06FF])الازهر(?![\u0600-\u06FF])/g, 'الأزهر'],
  ];
  for (const [re, replacement] of hamzaDict) {
    if (re.test(text)) {
      text = text.replace(re, replacement);
      repairedCount++;
    }
  }

  // Ensure proper spacing around ornamental Quranic brackets ﴿...﴾ without altering tables
  text = text
    .replace(/﴿+/g, '﴿')
    .replace(/﴾+/g, '﴾')
    .replace(/([^\s\n|﴿])﴿/g, '$1 ﴿')
    .replace(/﴾([^\s\n،.؛:|»﴾)])/g, '﴾ $1');

  // Stabilize tables & collapse excessive blank lines
  text = normalizeMarkdownTablesCore(text).replace(/\n{3,}/g, '\n\n').trim();

  // Compute quality metrics
  const lines = text.split('\n');
  const nonempty = lines.filter((l) => l.trim().length > 0);
  const punctIssues = (text.match(/\s[،؛؟!]|([،؛؟])(?=[\u0600-\u06FF])/g) || []).length;
  const hamzaRemaining = (text.match(/(?<![\u0600-\u06FF])(اي|الي|ان|ابو|احمد|اذا|ازهر)(?![\u0600-\u06FF])/g) || []).length;
  const leakedTags = (text.match(/CamScanner|<\/?(?:div|span|p)\b[^>]*>/gi) || []).length;

  let score = 100;
  if (punctIssues > 5) score -= Math.min(15, punctIssues);
  if (hamzaRemaining > 0) score -= Math.min(15, hamzaRemaining * 2);
  if (leakedTags > 0) score -= Math.min(20, leakedTags * 4);
  if (nonempty.length === 0) score = 0;
  score = Math.max(0, Math.min(100, score));

  return {
    overallPassed: score >= 85 && leakedTags === 0,
    qualityScore: score,
    repairedCount,
    repairedText: text,
    findings,
    metrics: {
      totalLines: nonempty.length,
      totalChars: text.length,
      punctIssuesRemaining: punctIssues,
      hamzaIssuesRemaining: hamzaRemaining,
      leakedTagsCount: leakedTags,
    },
    verdictArabic:
      score >= 95
        ? 'ممتاز: اجتاز المستند كافة بوابات الجودة الصارمة بدقة كاملة.'
        : score >= 80
        ? 'جيد جداً: تم إصلاح التشكيل والتنسيق والبوابات الأساسية.'
        : 'تم تطبيق الإصلاحات المتاحة مع رصد ملاحظات بنيوية تحتاج مراجعة.',
  };
}

/**
 * Computes deterministic microscopic fidelity parity metrics between source extract and refined output
 * for shared offline MCP/CLI verification parity.
 */
export function auditTextFidelityCore(sourceText, targetMarkdown) {
  const tokenize = (s) =>
    (s || '')
      .replace(/[\r\t]/g, ' ')
      .split(/\s+/)
      .map((w) => w.trim())
      .filter((w) => w.length > 0);
  const normalize = (s) =>
    (s || '')
      .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/[.,:;؛،؟?()﴿﴾«»"[\]{}!ـ\-]/g, '')
      .trim();

  const srcWords = tokenize(sourceText);
  const tgtWords = tokenize(targetMarkdown);
  const normTarget = normalize(targetMarkdown);

  let valid = 0;
  let matched = 0;
  for (const w of srcWords) {
    const nw = normalize(w);
    if (nw.length > 1) {
      valid++;
      if (normTarget.includes(nw)) matched++;
    }
  }

  const wordFidelityRatio = valid > 0 ? Math.min(100, Math.round((matched / valid) * 1000) / 10) : 100;
  const quranicVersesCount = (targetMarkdown?.match(/﴿[^﴾]+﴾/g) || []).length;
  const tablesCount = (targetMarkdown?.match(/\|[\s\S]*?\n\|(?:\s*:?-+:?\s*\|)+/g) || []).length;

  return {
    sourceWords: srcWords.length,
    targetWords: tgtWords.length,
    wordFidelityRatio,
    quranicVersesCount,
    tablesCount,
  };
}

/**
 * Generates clean plain text from refined Markdown.
 */
export function markdownToPlainTextCore(markdown) {
  if (!markdown) return '';
  return markdown
    .replace(/---PAGE_BREAK---/g, '\n----------------------------------------\n')
    .replace(/^---\s*$/gm, '\n------------------------\n')
    .replace(/\\text\{([^}]+)\}/g, '$1')
    .replace(/^#+\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/(?<!_)_([^_\n]+)_(?!_)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/<\/?(?:mark|u|ins|s|sup|sub)(?:\s[^>]*)?>/gi, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^\s*[-*+]\s+/gm, '• ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Executes the complete multi-stage linguistic, structural, and QA refinement pipeline.
 */
export function runFullRefinementPipeline(rawMarkdown) {
  if (!rawMarkdown || typeof rawMarkdown !== 'string') {
    return {
      markdown: '',
      plainText: '',
      isRtl: true,
      detectedLanguage: 'Arabic',
      qaReport: runStrictQAGatesCore(''),
      fidelitySummary: auditTextFidelityCore('', ''),
      autoFixedCount: 0,
    };
  }

  // Stage 1: Canonical Arabic presentation forms + PUA + mojibake
  let step1 = toStandardArabicCore(rawMarkdown);

  // Stage 2: Structural cleaning (fake math, running headers/footers, glued MCQ)
  let step2 = unwrapFakeMathCore(step1);
  step2 = pruneRunningHeadersCore(step2);
  step2 = explodeMultipleChoicesCore(step2);

  // Stage 3: Pattern & glued table header repair + bilingual boundary polish
  const { text: step3, patternFixes } = cleanKnownPatternsAndTablesCore(step2);

  // Stage 4: Strict QA Gates audit & automated repairs + presentation-form final pass
  const qaReport = runStrictQAGatesCore(toStandardArabicCore(step3));
  const finalMarkdown = qaReport.repairedText;
  const plainText = markdownToPlainTextCore(finalMarkdown);
  const fidelitySummary = auditTextFidelityCore(rawMarkdown, finalMarkdown);

  const arabicCount = countArabicCharactersCore(finalMarkdown);
  const latinCount = countLatinCharactersCore(finalMarkdown);
  const isRtl = isRightToLeftTextCore(finalMarkdown);
  const detectedLanguage =
    arabicCount > 10 && latinCount > 10 ? 'Arabic & English' : isRtl ? 'Arabic' : 'English';

  return {
    markdown: finalMarkdown,
    plainText,
    isRtl,
    detectedLanguage,
    qaReport,
    fidelitySummary,
    autoFixedCount: patternFixes + qaReport.repairedCount,
  };
}
