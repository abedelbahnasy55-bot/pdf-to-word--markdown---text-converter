/**
 * Shared Smart Compilation Core
 * المحرك المشترك لتخطيط واستخراج ودمج التجميعات الدراسية والامتحانية
 *
 * Pure deterministic domain utilities shared between browser, Express server,
 * and automated Vitest verification suites.
 */

import { toStandardArabic } from './arabicText.js';

export type RepetitionPolicy =
  | 'preserve_across_exams'
  | 'preserve_with_frequency_note'
  | 'deduplicate_bank';

export type ExtractionMode =
  | 'questions_only'
  | 'exams_only'
  | 'full_content'
  | 'specific_sections'
  | 'answers_only';

export type OrganizationMode =
  | 'by_book_order'
  | 'by_exam_year'
  | 'by_source'
  | 'by_topic'
  | 'unified_bank';

export type AnswersPlacement = 'inline' | 'appendix' | 'exclude';

export interface SourceOutlineEntry {
  heading: string;
  level: number;
  pageNumber: number;
  years: string[];
  hasQuestions: boolean;
  sequenceOrder: number;
  isLessonOrChapter: boolean;
}

export interface CompilerSourceCatalogItem {
  id: string;
  title: string;
  fileName: string;
  totalPages: number;
  wordCount: number;
  detectedYears: string[];
  outline: SourceOutlineEntry[];
  sampleSnippet: string;
}

export interface CompilationDirective {
  sourceId: string;
  sourceTitle: string;
  include: boolean;
  extractionMode: ExtractionMode;
  targetKeywords: string[];
  targetYears: string[];
  targetUnits: string[];
  excludeUnits?: string[];
  rationale: string;
}

export interface CompilationPlan {
  compilationTitle: string;
  subtitle: string;
  organizationMode: OrganizationMode;
  yearSortOrder: 'desc' | 'asc';
  answersPlacement: AnswersPlacement;
  effectiveRepetitionPolicy: RepetitionPolicy;
  includeTableOfContents: boolean;
  unifyQuestionNumbering: boolean;
  detectedYears: string[];
  sourceDirectives: CompilationDirective[];
  assistantSummary: string;
  usedFallback?: boolean;
}

export interface ExtractedLessonSegment {
  lessonTitle: string;
  sequenceOrder: number;
  markdown: string;
  itemsCount: number;
}

export interface ExtractedSourceBlock {
  sourceId: string;
  sourceTitle: string;
  chunkIndex: number;
  sectionLabel: string;
  yearHint?: string;
  sequenceOrder?: number;
  lessonSegments?: ExtractedLessonSegment[];
  markdown: string;
  itemsCount: number;
}

export interface MarkdownChunk {
  chunkIndex: number;
  totalChunks: number;
  contextHeader: string;
  detectedYears: string[];
  startPage: number;
  endPage: number;
  markdown: string;
}

export interface RepetitionStats {
  totalQuestionsDetected: number;
  preservedCrossExamRepeats: number;
  intraSectionDuplicatesRemoved: number;
  annotatedRepeatsCount: number;
  consolidatedBankDuplicatesCount: number;
}

export interface CompilationAssemblyOutput {
  markdown: string;
  tableOfContentsCount: number;
  sectionCount: number;
  repetitionStats: RepetitionStats;
  answersMovedCount: number;
}

const ARABIC_INDIC_TO_ASCII: Record<string, string> = {
  '٠': '0',
  '١': '1',
  '٢': '2',
  '٣': '3',
  '٤': '4',
  '٥': '5',
  '٦': '6',
  '٧': '7',
  '٨': '8',
  '٩': '9',
};

export function normalizeDigitsToAscii(input: string): string {
  return (input || '').replace(/[٠-٩]/g, (ch) => ARABIC_INDIC_TO_ASCII[ch] || ch);
}

export function extractYearsFromText(text: string): string[] {
  const normalized = normalizeDigitsToAscii(text || '');
  const matches = normalized.match(/\b(199\d|20[0-3]\d)\b/g) || [];
  return Array.from(new Set(matches)).sort();
}

const QUESTION_LINE_PATTERN =
  /^(?:(?:#{1,6}\s*)?(?:\*\*)?(?:س\s*[0-9٠-٩]+|السؤال\s+(?:الأول|الثاني|الثالث|الرابع|الخامس|السادس|السابع|الثامن|التاسع|العاشر|[0-9٠-٩]+)|[0-9٠-٩]+\s*[-–.)]\s+|[(（][0-9٠-٩]+[)）]|(?:علل|اختر|أكمل|عرف|عرّف|ما حكم|بين الحكم|وضح|اذكر|اشرح|قارن|صوب|أعرب|استخرج|بم تفسر|دلل|تخير الإجابة)))/i;

const EXAM_HEADER_PATTERN =
  /(?:امتحان|اختبار|نموذج|بوكلت|بوكليت|الدور الأول|الدور الثاني|القسم العلمي|القسم الأدبي|الشهادة|الثانوية الأزهرية|الإعدادية الأزهرية|الفصل الدراسي)/i;

const QUESTION_SECTION_PATTERN =
  /(?:أسئلة|اسئلة|تدريبات|تمارين|تطبيقات|مراجعة|اختبر نفسك|بنك الأسئلة|المرشد)/i;

const LESSON_HEADER_PATTERN =
  /^(?:(?:#{1,4}\s*)?(?:الدرس|الباب|الفصل|الوحدة|المبحث|المطلب|كتاب\s+[^\s]+|القسم|الفرع|الموضوع|أولاً|ثانياً|ثالثاً)\s*(?:الأول|الثاني|الثالث|الرابع|الخامس|السادس|السابع|الثامن|التاسع|العاشر|[0-9٠-٩]+|[:：\-])?)/i;

const ANSWER_SECTION_PATTERN =
  /^(?:#{1,6}\s*)?(?:\*\*)?(?:الإجابة|إجابة السؤال|نموذج الإجابة|الحل|الإجابات النموذجية|ج\s*[0-9٠-٩]*\s*[:：\-])/i;

function normalizeUnitToken(unit: string): string {
  return normalizeDigitsToAscii(toStandardArabic(unit || ''))
    .replace(/[#*_`«»"']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function unitMatchesHeading(headingNorm: string, unitPhrase: string): boolean {
  const cleanUnit = normalizeUnitToken(unitPhrase).replace(
    /^(?:دروس|درس|أبواب|باب|فصول|فصل|وحدات|وحدة|موضوع|كتاب|قسم|مبحث)\s+/,
    ''
  );
  if (!cleanUnit || cleanUnit.length < 2) return false;
  if (headingNorm.includes(cleanUnit)) return true;
  // Also match core Arabic words inside multi-word lesson phrase
  const words = cleanUnit.split(/\s+/).filter((w) => w.length >= 3 && !/^(?:ال|من|في|عن|على|مع)$/.test(w));
  if (words.length > 0 && words.every((w) => headingNorm.includes(w))) return true;
  return false;
}

/**
 * Classifies whether the user message is a direct analytical / TOC inspection question
 * rather than an extraction, compilation, or document editing command.
 */
export function isConversationalQuestionIntent(message: string): boolean {
  const norm = normalizeDigitsToAscii(toStandardArabic(message || '')).trim();
  if (!norm) return false;
  const hasActionVerb =
    /(?:اجمع|تجميع|استخرج|استخلص|هات|رتب|انقل|احذف|وحد|اعمل\s*ملف|صد[ّ]?ر|حو[ّ]?ل|طلع|افرز|اكتب\s*لي\s*الأسئلة)/.test(
      norm
    );
  if (hasActionVerb) return false;
  return /(?:^(?:ما\s*هي|ما\s*هو|ايه|إيه|كم|هل|اعرض|وريني|اشرح|لخ[ّ]?ص|حل[ّ]?ل|عد[ّ]?د|فهرس)|[؟?]$|الدروس\s*الموجودة|محتوى\s*الملف|ملخص\s*(?:الكتاب|الدرس))/.test(
    norm
  );
}

/**
 * Extracts structured outline entries, exam years, and lesson/chapter hierarchy
 * from a converted Markdown document in canonical appearance order.
 */
export function extractSourceOutline(
  markdown: string,
  totalPagesHint?: number
): {
  outline: SourceOutlineEntry[];
  detectedYears: string[];
  wordCount: number;
  sampleSnippet: string;
} {
  const cleanMd = (markdown || '').trim();
  const pages = cleanMd.split(/---PAGE_BREAK---/);
  const outline: SourceOutlineEntry[] = [];
  const allYears = new Set<string>(extractYearsFromText(cleanMd));
  let seqCounter = 0;

  pages.forEach((pageContent, idx) => {
    const pageNumber = idx + 1;
    const lines = pageContent.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
      const isLessonLine =
        !headingMatch &&
        line.length >= 5 &&
        line.length <= 125 &&
        LESSON_HEADER_PATTERN.test(line) &&
        !/[.،؛]$/.test(line);
      const isExamBanner =
        !headingMatch &&
        line.length >= 6 &&
        line.length <= 120 &&
        (EXAM_HEADER_PATTERN.test(line) || QUESTION_SECTION_PATTERN.test(line));

      if (headingMatch || isLessonLine || isExamBanner) {
        const level = headingMatch ? headingMatch[1].length : isLessonLine ? 2 : 2;
        const headingText = (headingMatch ? headingMatch[2] : line)
          .replace(/[*_`]/g, '')
          .trim();
        if (!headingText || headingText.length < 3) continue;

        const windowText = lines.slice(i, Math.min(lines.length, i + 12)).join('\n');
        const years = extractYearsFromText(headingText + ' ' + lines.slice(i, i + 3).join(' '));
        years.forEach((y) => allYears.add(y));
        const hasQuestions =
          QUESTION_SECTION_PATTERN.test(headingText) ||
          EXAM_HEADER_PATTERN.test(headingText) ||
          QUESTION_LINE_PATTERN.test(windowText);
        const isLessonOrChapter = LESSON_HEADER_PATTERN.test(headingText) || Boolean(headingMatch && !EXAM_HEADER_PATTERN.test(headingText));

        // Avoid repeating adjacent identical headings
        const prev = outline[outline.length - 1];
        if (!prev || prev.heading !== headingText || prev.pageNumber !== pageNumber) {
          outline.push({
            heading: headingText.slice(0, 140),
            level,
            pageNumber,
            years,
            hasQuestions,
            sequenceOrder: seqCounter++,
            isLessonOrChapter,
          });
        }
      }
    }
  });

  const plainWords = cleanMd
    .replace(/---PAGE_BREAK---/g, ' ')
    .replace(/[#*_`>|]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const sampleSnippet = cleanMd
    .replace(/---PAGE_BREAK---/g, '\n')
    .slice(0, 900)
    .trim();

  if (outline.length === 0 && cleanMd.length > 0) {
    outline.push({
      heading: 'المحتوى العام للمستند',
      level: 1,
      pageNumber: totalPagesHint && totalPagesHint > 0 ? 1 : 1,
      years: Array.from(allYears),
      hasQuestions: QUESTION_LINE_PATTERN.test(cleanMd),
      sequenceOrder: 0,
      isLessonOrChapter: false,
    });
  }

  return {
    outline: outline.slice(0, 80),
    detectedYears: Array.from(allYears).sort(),
    wordCount: plainWords.length,
    sampleSnippet,
  };
}

/**
 * Splits large converted books (50-300+ pages) into context-preserving chunks
 * strictly along page-break / heading boundaries so no paragraph or question is sliced mid-sentence.
 */
export function splitMarkdownIntoSafeChunks(
  markdown: string,
  maxChars: number = 18000
): MarkdownChunk[] {
  const raw = (markdown || '').trim();
  if (!raw) return [];

  const pages = raw.split(/---PAGE_BREAK---/);
  const prelimChunks: Array<{
    text: string;
    contextHeader: string;
    startPage: number;
    endPage: number;
  }> = [];

  let activeHeading = '';
  let currentPieces: string[] = [];
  let currentLength = 0;
  let chunkStartPage = 1;
  let chunkContextHeader = '';

  const flushChunk = (endPage: number) => {
    const joined = currentPieces.join('\n\n---PAGE_BREAK---\n\n').trim();
    if (joined) {
      prelimChunks.push({
        text: joined,
        contextHeader: chunkContextHeader || activeHeading || 'بداية المستند',
        startPage: chunkStartPage,
        endPage,
      });
    }
    currentPieces = [];
    currentLength = 0;
  };

  pages.forEach((rawPage, idx) => {
    const pageNum = idx + 1;
    const page = rawPage.trim();
    if (!page) return;

    // Update running heading tracker
    const headingMatches = page.match(/^#{1,3}\s+.+$/gm);
    if (headingMatches && headingMatches.length > 0) {
      activeHeading = headingMatches[headingMatches.length - 1].replace(/^#+\s+/, '').trim();
    } else {
      const firstLine = page.split(/\r?\n/)[0]?.trim() || '';
      if (firstLine.length <= 100 && (EXAM_HEADER_PATTERN.test(firstLine) || QUESTION_SECTION_PATTERN.test(firstLine))) {
        activeHeading = firstLine.replace(/[*_`]/g, '').trim();
      }
    }

    // If single page exceeds maxChars, split it cleanly at double-newline / line boundaries
    if (page.length > maxChars) {
      if (currentPieces.length > 0) {
        flushChunk(Math.max(chunkStartPage, pageNum - 1));
      }
      const paragraphs = page.split(/\n{2,}/);
      let subBuf = '';
      for (const para of paragraphs) {
        if (subBuf.length + para.length + 2 > maxChars && subBuf.trim().length > 0) {
          prelimChunks.push({
            text: subBuf.trim(),
            contextHeader: activeHeading || `صفحة ${pageNum}`,
            startPage: pageNum,
            endPage: pageNum,
          });
          subBuf = '';
        }
        subBuf += (subBuf ? '\n\n' : '') + para;
      }
      if (subBuf.trim()) {
        prelimChunks.push({
          text: subBuf.trim(),
          contextHeader: activeHeading || `صفحة ${pageNum}`,
          startPage: pageNum,
          endPage: pageNum,
        });
      }
      chunkStartPage = pageNum + 1;
      chunkContextHeader = activeHeading;
      return;
    }

    if (currentPieces.length === 0) {
      chunkStartPage = pageNum;
      chunkContextHeader = activeHeading;
    }

    if (currentLength + page.length > maxChars && currentPieces.length > 0) {
      flushChunk(pageNum - 1);
      chunkStartPage = pageNum;
      chunkContextHeader = activeHeading;
    }

    currentPieces.push(page);
    currentLength += page.length + 20;
  });

  if (currentPieces.length > 0) {
    flushChunk(pages.length);
  }

  return prelimChunks.map((c, idx) => ({
    chunkIndex: idx,
    totalChunks: prelimChunks.length,
    contextHeader: c.contextHeader,
    detectedYears: extractYearsFromText(c.contextHeader + '\n' + c.text),
    startPage: c.startPage,
    endPage: c.endPage,
    markdown: c.text,
  }));
}

/**
 * Parses Arabic include vs exclude lesson/chapter lists from natural user prompts.
 * Example: "هات أسئلة درس النكاح والطلاق وسيب درس الخلع وباب العدة"
 */
export function parseIncludeExcludeUnitsFromInstruction(normInst: string): {
  includeUnits: string[];
  excludeUnits: string[];
} {
  const clean = normalizeDigitsToAscii(toStandardArabic(normInst || ''));
  const excludeTriggerRegex =
    /(?:وسيب|سيب|اترك|استبعد|احذف|ما\s*عدا|باستثناء|عدا|بدون\s*(?:دروس?|باب|فصل|وحدة)|غير\s*(?:دروس?|باب))/;

  const splitIdx = clean.search(excludeTriggerRegex);
  const includePart = splitIdx >= 0 ? clean.slice(0, splitIdx) : clean;
  const excludePart = splitIdx >= 0 ? clean.slice(splitIdx) : '';

  const extractUnitTokens = (fragment: string): string[] => {
    if (!fragment) return [];
    const results: string[] = [];
    // Match "دروس كذا وكذا" or "درس الأول والثاني" or "باب الطهارة، باب الصلاة"
    const unitPhrases =
      fragment.match(
        /(?:أبواب|باب|دروس|درس|فصول|فصل|وحدات|وحدة|أقسام|قسم|مباحث|مبحث)\s+[^.؛!\n]+/g
      ) || [];

    for (const rawPhrase of unitPhrases) {
      // Stop before secondary trailing clauses like "ورتبها حسب" or "مع امتحانات"
      const bounded = rawPhrase
        .split(/(?:مع\s+امتحان|ورتب|واحفظ|وحط|وانقل|من\s+حيث|على\s+حسب|بدون\s+إجاب)/)[0]
        .trim();
      const prefixMatch = bounded.match(
        /^(أبواب|باب|دروس|درس|فصول|فصل|وحدات|وحدة|أقسام|قسم|مباحث|مبحث)\s+(.+)$/
      );
      if (!prefixMatch) continue;
      const unitKind = prefixMatch[1]
        .replace(/^دروس$/, 'درس')
        .replace(/^أبواب$/, 'باب')
        .replace(/^فصول$/, 'فصل')
        .replace(/^وحدات$/, 'وحدة')
        .replace(/^أقسام$/, 'قسم')
        .replace(/^مباحث$/, 'مبحث');
      const namesBody = prefixMatch[2].trim();
      // Split coordinated items ("الأول والثاني" / "النكاح، الطلاق")
      const pieces = namesBody
        .split(/\s*[،,]\s*|\s+و(?=[أ-ي0-9])/)
        .map((p) => p.replace(/^(?:ال|كذلك\s+)/, (m) => m).trim())
        .filter((p) => p.length >= 2 && !/^(?:سيب|اترك|فقط|كلها)$/.test(p));

      if (pieces.length > 0) {
        for (const p of pieces) {
          const explicitSub = p.match(
            /^(أبواب|باب|دروس|درس|فصول|فصل|وحدات|وحدة|أقسام|قسم|مباحث|مبحث)\s+(.+)$/
          );
          const resolvedKind = explicitSub
            ? explicitSub[1]
                .replace(/^دروس$/, 'درس')
                .replace(/^أبواب$/, 'باب')
                .replace(/^فصول$/, 'فصل')
                .replace(/^وحدات$/, 'وحدة')
                .replace(/^أقسام$/, 'قسم')
                .replace(/^مباحث$/, 'مبحث')
            : unitKind;
          const cleanName = (explicitSub ? explicitSub[2] : p).trim();
          if (cleanName && !/^(?:كذا|وكذا|معين|محدد)$/.test(cleanName)) {
            results.push(`${resolvedKind} ${cleanName}`.slice(0, 60));
          }
        }
      }
    }
    return Array.from(new Set(results));
  };

  return {
    includeUnits: extractUnitTokens(includePart),
    excludeUnits: extractUnitTokens(excludePart),
  };
}

/**
 * Deterministic Arabic intent parser & Compilation Plan builder.
 * Handles both single-book lesson/TOC extraction and multi-book exam assembly.
 */
export function buildDeterministicPlan(
  instruction: string,
  repetitionPolicy: RepetitionPolicy,
  sources: CompilerSourceCatalogItem[]
): CompilationPlan {
  const normInst = normalizeDigitsToAscii(toStandardArabic(instruction || ''));

  // Detect effective repetition policy if user explicitly mentions bank deduplication or frequency notes
  let effectivePolicy: RepetitionPolicy = repetitionPolicy;
  if (
    /(?:احذف\s*المكرر|بدون\s*تكرار\s*نهائ|دمج\s*المكرر|بنك\s*أسئلة\s*موحد\s*بدون\s*تكرار)/.test(normInst)
  ) {
    effectivePolicy = 'deduplicate_bank';
  } else if (/(?:نوه\s*على\s*التكرار|تكرر\s*في|وسم\s*التكرار|أشر\s*للتكرار)/.test(normInst)) {
    effectivePolicy = 'preserve_with_frequency_note';
  }

  const asksForBookOrder =
    /(?:ترتيب(?:ها|هم)?\s*(?:في\s*)?(?:الدروس|الفهرس|الكتاب|الأبواب)|حسب\s*(?:ترتيب\s*)?(?:الدروس|الفهرس|الكتاب)|مرتب.*(?:فهرس|دروس))/.test(
      normInst
    );
  const asksForExams = /(?:امتحان|امتحانات|بوكلت|بوكليت|السنين|السنوات)/.test(normInst);

  // Detect organization mode
  let organizationMode: OrganizationMode = 'by_source';
  if (asksForBookOrder) {
    organizationMode = 'by_book_order';
  } else if (/(?:حسب\s*السن|رتب.*سن|من\s*الأحدث|من\s*الأقدم|امتحانات\s*السنين|تاريخي)/.test(normInst)) {
    organizationMode = 'by_exam_year';
  } else if (/(?:حسب\s*الباب|حسب\s*الدرس|حسب\s*الموضوع|موضوعي)/.test(normInst)) {
    organizationMode = 'by_book_order';
  } else if (effectivePolicy === 'deduplicate_bank' || /(?:بنك\s*أسئلة)/.test(normInst)) {
    organizationMode = 'unified_bank';
  } else if (
    sources.length === 1 &&
    !asksForExams &&
    sources[0].outline.some((o) => o.isLessonOrChapter)
  ) {
    organizationMode = 'by_book_order';
  } else if (sources.some((s) => s.detectedYears.length > 0)) {
    organizationMode = 'by_exam_year';
  }

  const yearSortOrder: 'desc' | 'asc' = /(?:من\s*الأقدم|تصاعدي)/.test(normInst) ? 'asc' : 'desc';

  // Answers placement
  let answersPlacement: AnswersPlacement = 'inline';
  if (/(?:بدون\s*إجاب|احذف\s*الإجاب|الأسئلة\s*فقط\s*دون\s*حل|أسئلة\s*بدون\s*حل)/.test(normInst)) {
    answersPlacement = 'exclude';
  } else if (
    /(?:ملحق|في\s*الآخر|في\s*النهاية|نهاية\s*الملف|قسم\s*مستقل\s*للإجاب|الإجابات\s*في\s*آخر)/.test(normInst)
  ) {
    answersPlacement = 'appendix';
  }

  const requestedYears = extractYearsFromText(normInst);
  const allDetectedYears = new Set<string>(requestedYears);
  sources.forEach((s) => s.detectedYears.forEach((y) => allDetectedYears.add(y)));

  const { includeUnits, excludeUnits } = parseIncludeExcludeUnitsFromInstruction(normInst);

  // Build per-source directives by matching keywords & file roles
  const directives: CompilationDirective[] = sources.map((src) => {
    const titleNorm = normalizeDigitsToAscii(toStandardArabic(src.title + ' ' + src.fileName));
    const isBookLike = /(?:مرشد|مذكر|كتاب|شرح|سلاح|امتحان\s*كتاب|الوافي|الأضواء)/.test(titleNorm);
    const isBookletExam = /(?:بوكلت|بوكليت|امتحان|سنوات|السنين|نموذج|أزهر|الأزهر)/.test(titleNorm);

    let extractionMode: ExtractionMode = 'full_content';
    const targetKeywords: string[] = [];

    const asksForQuestions = /(?:أسئلة|اسئلة|تدريبات|تمارين)/.test(normInst);
    const asksForAnswers = /(?:إجاب|نموذج\s*حل|حلول)/.test(normInst);

    if (isBookLike && asksForQuestions) {
      extractionMode = 'questions_only';
      targetKeywords.push('أسئلة', 'تدريبات', 'تمارين', 'س١', 'السؤال');
    } else if (isBookletExam && asksForExams) {
      extractionMode = 'exams_only';
      targetKeywords.push('امتحان', 'الدور', 'السؤال', 'نموذج');
    } else if (asksForQuestions && !asksForExams) {
      extractionMode = 'questions_only';
      targetKeywords.push('أسئلة', 'تدريبات', 'السؤال');
    } else if (asksForExams && !asksForQuestions) {
      extractionMode = 'exams_only';
      targetKeywords.push('امتحان', 'نموذج', 'السؤال');
    } else if (asksForAnswers && !asksForQuestions && !asksForExams) {
      extractionMode = 'answers_only';
      targetKeywords.push('الإجابة', 'نموذج الإجابة');
    } else if (asksForQuestions || asksForExams) {
      extractionMode = isBookLike ? 'questions_only' : 'exams_only';
    }

    if ((includeUnits.length > 0 || excludeUnits.length > 0) && extractionMode === 'full_content') {
      extractionMode = 'specific_sections';
    }

    const rationaleParts: string[] = [];
    if (extractionMode === 'questions_only') {
      rationaleParts.push('استخلاص الأسئلة والتدريبات فقط');
    } else if (extractionMode === 'exams_only') {
      rationaleParts.push('استخلاص نماذج الامتحانات وبنود الأسئلة');
    } else if (extractionMode === 'specific_sections') {
      rationaleParts.push('استهداف دروس/أبواب محددة');
    } else {
      rationaleParts.push('استخراج المحتوى المطلوب');
    }
    if (includeUnits.length > 0) rationaleParts.push(`تضمين: ${includeUnits.join('، ')}`);
    if (excludeUnits.length > 0) rationaleParts.push(`استبعاد: ${excludeUnits.join('، ')}`);

    return {
      sourceId: src.id,
      sourceTitle: src.title || src.fileName,
      include: true,
      extractionMode,
      targetKeywords,
      targetYears: requestedYears,
      targetUnits: includeUnits,
      excludeUnits,
      rationale: rationaleParts.join(' · '),
    };
  });

  // Determine clean publication title
  const detectedYearsArr = Array.from(allDetectedYears).sort();
  const titleHint =
    sources.length === 1
      ? organizationMode === 'by_book_order'
        ? `أسئلة وتدريبات ${sources[0].title} مرتبة حسب الفهرس والدروس`
        : `تجميعة ${sources[0].title}`
      : `المجموعة المنسقة: ${sources
          .slice(0, 3)
          .map((s) => s.title.replace(/\.[^/.]+$/, ''))
          .join(' + ')}${sources.length > 3 ? ` (+${sources.length - 3})` : ''}`;

  const policyDesc =
    effectivePolicy === 'deduplicate_bank'
      ? 'توحيد ودمج الأسئلة المكررة في بنك واحد'
      : effectivePolicy === 'preserve_with_frequency_note'
      ? 'حفظ التكرارات المفيدة بين الامتحانات مع توثيق سنوات التكرار'
      : 'حماية التكرارات المفيدة بين الامتحانات والسنوات دون حذف';

  const orderDesc =
    organizationMode === 'by_book_order'
      ? 'مرتبة بدقة وفق تسلسل الدروس والفهرس الأصلي'
      : organizationMode === 'by_exam_year'
      ? 'مرتبة زمنياً حسب سنوات الامتحانات'
      : 'منظمة حسب المصادر والموضوعات';

  return {
    compilationTitle: titleHint.slice(0, 120),
    subtitle: `${orderDesc} (${sources.length} ${sources.length === 1 ? 'مصدر' : 'مصادر'}) · ${policyDesc}`,
    organizationMode,
    yearSortOrder,
    answersPlacement,
    effectiveRepetitionPolicy: effectivePolicy,
    includeTableOfContents: true,
    unifyQuestionNumbering: !/(?:بدون\s*توحيد\s*ترقيم)/.test(normInst),
    detectedYears: detectedYearsArr,
    sourceDirectives: directives,
    assistantSummary: `تم إعداد الخطة لعدد (${sources.length}) ${
      sources.length === 1 ? 'ملف' : 'مصادر'
    } (${orderDesc})، مع ${
      answersPlacement === 'appendix'
        ? 'تخصيص ملحق مستقل للإجابات في نهاية الملف'
        : answersPlacement === 'exclude'
        ? 'استبعاد الإجابات والاكتفاء بالأسئلة'
        : 'الاحتفاظ بالإجابات في مواضعها'
    }.`,
    usedFallback: true,
  };
}

/**
 * High-recall deterministic & lesson-aware extraction for a single chunk.
 * Splits cleanly across lessons/chapters, honors BOTH include (targetUnits) and
 * exclude (excludeUnits) filters, and emits ordered lessonSegments.
 */
export function deterministicExtractFromChunk(
  chunkMarkdown: string,
  directive: CompilationDirective,
  sourceTitle: string,
  chunkIndex: number = 0,
  contextHeader: string = ''
): ExtractedSourceBlock {
  const mode = directive.extractionMode;
  const raw = (chunkMarkdown || '').replace(/---PAGE_BREAK---/g, '\n\n').trim();
  const includeUnits = directive.targetUnits || [];
  const excludeUnits = directive.excludeUnits || [];

  if (!raw || !directive.include) {
    return {
      sourceId: directive.sourceId,
      sourceTitle,
      chunkIndex,
      sectionLabel: contextHeader || sourceTitle,
      sequenceOrder: chunkIndex * 1000,
      lessonSegments: [],
      markdown: '',
      itemsCount: 0,
    };
  }

  if (
    mode === 'full_content' &&
    includeUnits.length === 0 &&
    excludeUnits.length === 0 &&
    directive.targetYears.length === 0
  ) {
    const qCount = (raw.match(/(?:^|\n)\s*(?:#{1,4}\s*)?(?:س\s*[0-9٠-٩]+|السؤال|[0-9٠-٩]+\s*[-–.)])/g) || []).length;
    return {
      sourceId: directive.sourceId,
      sourceTitle,
      chunkIndex,
      sectionLabel: contextHeader || sourceTitle,
      yearHint: extractYearsFromText(contextHeader + ' ' + raw.slice(0, 400))[0],
      sequenceOrder: chunkIndex * 1000,
      markdown: raw,
      itemsCount: Math.max(1, qCount),
    };
  }

  const targetYearsSet = new Set(directive.targetYears.map(normalizeDigitsToAscii));
  const lines = raw.split(/\r?\n/);

  interface WorkingSegment {
    lessonTitle: string;
    sequenceOrder: number;
    lines: string[];
    itemsCount: number;
    excluded: boolean;
    included: boolean;
  }

  const segments: WorkingSegment[] = [];
  let subSeq = 0;

  const evaluateHeadingFilters = (headingTitle: string): { included: boolean; excluded: boolean } => {
    const normHeading = normalizeUnitToken(headingTitle);
    const isExcluded = excludeUnits.some((u) => unitMatchesHeading(normHeading, u));
    if (isExcluded) return { included: false, excluded: true };

    const headingYears = extractYearsFromText(normHeading);
    const yearMatches =
      targetYearsSet.size === 0 ||
      headingYears.length === 0 ||
      headingYears.some((y) => targetYearsSet.has(y));

    if (!yearMatches) return { included: false, excluded: true };

    if (includeUnits.length > 0) {
      const matched = includeUnits.some((u) => unitMatchesHeading(normHeading, u));
      return { included: matched, excluded: false };
    }

    return { included: true, excluded: false };
  };

  const initialFilter = evaluateHeadingFilters(contextHeader || sourceTitle);
  let activeSeg: WorkingSegment = {
    lessonTitle: contextHeader || sourceTitle,
    sequenceOrder: chunkIndex * 1000 + subSeq++,
    lines: [],
    itemsCount: 0,
    excluded: initialFilter.excluded,
    included: initialFilter.included,
  };
  let capturingModeContent = mode === 'full_content' || mode === 'specific_sections';

  const flushSeg = () => {
    const cleaned = activeSeg.lines.join('\n').trim();
    if (cleaned && activeSeg.included && !activeSeg.excluded) {
      // If mode was questions_only or exams_only and this segment only has a heading line and zero body lines, skip empty shell
      const nonHeadingLines = activeSeg.lines.filter(
        (l) => l.trim().length > 0 && !/^#{1,4}\s+/.test(l.trim())
      );
      if (nonHeadingLines.length > 0 || mode === 'full_content' || mode === 'specific_sections') {
        segments.push({ ...activeSeg, lines: cleaned.split('\n') });
      }
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) {
      if (capturingModeContent && activeSeg.lines[activeSeg.lines.length - 1] !== '') {
        activeSeg.lines.push('');
      }
      continue;
    }

    const normLine = normalizeDigitsToAscii(toStandardArabic(trimmed));
    const isMarkdownHeading = /^#{1,4}\s+/.test(trimmed);
    const isLessonOrExamHeading =
      isMarkdownHeading ||
      (trimmed.length <= 125 && LESSON_HEADER_PATTERN.test(trimmed)) ||
      (trimmed.length <= 120 && EXAM_HEADER_PATTERN.test(trimmed));
    const isQuestionBannerHeading =
      !isLessonOrExamHeading && trimmed.length <= 100 && QUESTION_SECTION_PATTERN.test(trimmed);

    if (isLessonOrExamHeading) {
      const cleanHeadingTitle = trimmed.replace(/^#{1,4}\s+/, '').replace(/[*_`]/g, '').trim();
      const isTopLessonBoundary =
        LESSON_HEADER_PATTERN.test(cleanHeadingTitle) ||
        EXAM_HEADER_PATTERN.test(cleanHeadingTitle) ||
        /^#{1,2}\s+/.test(trimmed);

      if (isTopLessonBoundary) {
        flushSeg();
        const filt = evaluateHeadingFilters(cleanHeadingTitle);
        activeSeg = {
          lessonTitle: cleanHeadingTitle,
          sequenceOrder: chunkIndex * 1000 + subSeq++,
          lines: [trimmed.startsWith('#') ? trimmed : `## ${cleanHeadingTitle}`],
          itemsCount: 0,
          excluded: filt.excluded,
          included: filt.included,
        };
        capturingModeContent =
          mode === 'full_content' ||
          mode === 'specific_sections' ||
          QUESTION_SECTION_PATTERN.test(cleanHeadingTitle) ||
          EXAM_HEADER_PATTERN.test(cleanHeadingTitle);
        continue;
      }
    }

    if (isQuestionBannerHeading) {
      if (!activeSeg.excluded && activeSeg.included) {
        capturingModeContent = mode === 'questions_only' || mode === 'exams_only' || mode === 'full_content' || mode === 'specific_sections';
        if (capturingModeContent) {
          activeSeg.lines.push(trimmed.startsWith('#') ? trimmed : `### ${trimmed}`);
        }
      }
      continue;
    }

    if (activeSeg.excluded || !activeSeg.included) {
      continue;
    }

    const isQuestionStart = QUESTION_LINE_PATTERN.test(trimmed);
    if (isQuestionStart) {
      activeSeg.itemsCount++;
      if (mode === 'questions_only' || mode === 'exams_only') {
        capturingModeContent = true;
      }
    }

    if (mode === 'answers_only' && ANSWER_SECTION_PATTERN.test(trimmed)) {
      capturingModeContent = true;
      activeSeg.itemsCount++;
    }

    // Stop narrative-only spillover in questions_only when a pure explanation heading starts
    if (
      mode === 'questions_only' &&
      !isQuestionStart &&
      /^(?:#{1,4}\s*)?(?:الشرح|تعريف الدرس|أولاً\s*:|التمهيد|مقدمة الدرس)/.test(normLine)
    ) {
      capturingModeContent = false;
    }

    if (capturingModeContent) {
      activeSeg.lines.push(line);
    }
  }

  flushSeg();

  const lessonSegments: ExtractedLessonSegment[] = segments.map((s) => ({
    lessonTitle: s.lessonTitle,
    sequenceOrder: s.sequenceOrder,
    markdown: s.lines.join('\n').trim(),
    itemsCount: s.itemsCount || 1,
  }));

  const out = lessonSegments.map((s) => s.markdown).join('\n\n').trim();
  const totalItems = lessonSegments.reduce((acc, s) => acc + s.itemsCount, 0);
  const years = extractYearsFromText(contextHeader + ' ' + out.slice(0, 600));

  return {
    sourceId: directive.sourceId,
    sourceTitle,
    chunkIndex,
    sectionLabel: lessonSegments[0]?.lessonTitle || contextHeader || sourceTitle,
    yearHint: years[0],
    sequenceOrder: chunkIndex * 1000,
    lessonSegments,
    markdown: out,
    itemsCount: totalItems || (out ? 1 : 0),
  };
}

/**
 * Normalizes a question string into a stable fingerprint for detecting cross-exam
 * useful repetitions (e.g., 2016 vs 2022) vs accidental same-section duplicates.
 */
export function normalizeQuestionFingerprint(text: string): string {
  return normalizeDigitsToAscii(toStandardArabic(text || ''))
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '') // Strip diacritics & tatweel
    .replace(/^(?:#{1,6}\s*)?(?:\*\*)?(?:س\s*[0-9]+\s*[:：\-.)]*|السؤال\s+(?:الأول|الثاني|الثالث|الرابع|الخامس|السادس|السابع|الثامن|التاسع|العاشر|[0-9]+)\s*[:：\-.)]*|[(（]?[0-9]+[)）.\-:]+\s*)/i, '')
    .replace(/[«»﴿﴾"'`*_\[\](){}.،؛:!؟?\-–—/\\|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 140);
}

interface ParsedQuestionUnit {
  rawMarkdown: string;
  fingerprint: string;
  isQuestion: boolean;
  answerMarkdown?: string;
}

function splitSectionIntoQuestionUnits(sectionMarkdown: string): ParsedQuestionUnit[] {
  const lines = (sectionMarkdown || '').split(/\r?\n/);
  const units: ParsedQuestionUnit[] = [];
  let buffer: string[] = [];
  let currentIsQuestion = false;

  const flush = () => {
    const joined = buffer.join('\n').trim();
    if (!joined) return;
    const firstLine = joined.split(/\r?\n/)[0] || joined;
    const fp = currentIsQuestion ? normalizeQuestionFingerprint(firstLine) : '';
    units.push({
      rawMarkdown: joined,
      fingerprint: fp.length >= 14 ? fp : '',
      isQuestion: currentIsQuestion,
    });
    buffer = [];
    currentIsQuestion = false;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    const startsQuestion = QUESTION_LINE_PATTERN.test(trimmed);
    if (startsQuestion && buffer.length > 0) {
      flush();
    }
    if (startsQuestion) {
      currentIsQuestion = true;
    }
    buffer.push(line);
  }
  flush();
  return units;
}

function separateAnswersFromSection(
  sectionMarkdown: string,
  sectionTitle: string,
  placement: AnswersPlacement
): { bodyMarkdown: string; appendixMarkdown: string; movedCount: number } {
  if (placement === 'inline') {
    return { bodyMarkdown: sectionMarkdown, appendixMarkdown: '', movedCount: 0 };
  }

  const lines = sectionMarkdown.split(/\r?\n/);
  const bodyLines: string[] = [];
  const answerLines: string[] = [];
  let capturingAnswer = false;
  let movedCount = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (ANSWER_SECTION_PATTERN.test(trimmed)) {
      capturingAnswer = true;
      movedCount++;
      answerLines.push(line);
      continue;
    }

    if (capturingAnswer) {
      if (QUESTION_LINE_PATTERN.test(trimmed) || /^#{1,3}\s+/.test(trimmed)) {
        capturingAnswer = false;
        bodyLines.push(line);
      } else {
        answerLines.push(line);
      }
    } else {
      bodyLines.push(line);
    }
  }

  const appendix =
    placement === 'appendix' && answerLines.length > 0
      ? `### إجابات: ${sectionTitle}\n\n${answerLines.join('\n').trim()}`
      : '';

  return {
    bodyMarkdown: bodyLines.join('\n').trim(),
    appendixMarkdown: appendix,
    movedCount,
  };
}

/**
 * Assembles extracted blocks into a unified, publication-grade Markdown document
 * while strictly enforcing the selected Repetition Policy, chronological/source ordering,
 * Table of Contents generation, and optional Answers Appendix separation.
 */
export function assembleCompilationDocument(
  plan: CompilationPlan,
  extractedBlocks: ExtractedSourceBlock[]
): CompilationAssemblyOutput {
  const nonEmptyBlocks = extractedBlocks.filter((b) => b.markdown && b.markdown.trim().length > 0);
  if (nonEmptyBlocks.length === 0) {
    return {
      markdown: `# ${plan.compilationTitle}\n\n> لم يتم العثور على مقاطع مطابقة لمعايير البحث في المصادر المحددة.`,
      tableOfContentsCount: 0,
      sectionCount: 0,
      repetitionStats: {
        totalQuestionsDetected: 0,
        preservedCrossExamRepeats: 0,
        intraSectionDuplicatesRemoved: 0,
        annotatedRepeatsCount: 0,
        consolidatedBankDuplicatesCount: 0,
      },
      answersMovedCount: 0,
    };
  }

  // Group blocks coherently into sections while preserving canonical lesson/TOC order
  interface AssembledSection {
    key: string;
    title: string;
    yearNum: number;
    sequenceOrder: number;
    sourceTitle: string;
    markdown: string;
  }

  const groupedMap = new Map<string, AssembledSection>();

  const expandedUnits: Array<{
    sourceId: string;
    sourceTitle: string;
    sectionLabel: string;
    yearHint?: string;
    sequenceOrder: number;
    markdown: string;
  }> = [];

  for (const block of nonEmptyBlocks) {
    if (
      (plan.organizationMode === 'by_book_order' || plan.organizationMode === 'by_topic') &&
      block.lessonSegments &&
      block.lessonSegments.length > 0
    ) {
      for (const seg of block.lessonSegments) {
        expandedUnits.push({
          sourceId: block.sourceId,
          sourceTitle: block.sourceTitle,
          sectionLabel: seg.lessonTitle,
          yearHint: block.yearHint,
          sequenceOrder: seg.sequenceOrder,
          markdown: seg.markdown,
        });
      }
    } else if (plan.organizationMode === 'by_book_order' && /^#{1,3}\s+/m.test(block.markdown)) {
      // Split AI-extracted chunk markdown by H2/H3 lesson headings to preserve exact TOC lesson flow
      const rawSections = block.markdown.split(/(?=^#{1,2}\s+.+$)/m).filter((s) => s.trim());
      rawSections.forEach((secText, idx) => {
        const firstHeading = secText.match(/^#{1,3}\s+(.+)$/m)?.[1]?.replace(/[*_`]/g, '').trim();
        expandedUnits.push({
          sourceId: block.sourceId,
          sourceTitle: block.sourceTitle,
          sectionLabel: firstHeading || block.sectionLabel || block.sourceTitle,
          yearHint: block.yearHint,
          sequenceOrder: (block.sequenceOrder ?? block.chunkIndex * 1000) + idx,
          markdown: secText.trim(),
        });
      });
    } else {
      expandedUnits.push({
        sourceId: block.sourceId,
        sourceTitle: block.sourceTitle,
        sectionLabel: block.sectionLabel,
        yearHint: block.yearHint,
        sequenceOrder: block.sequenceOrder ?? block.chunkIndex * 1000,
        markdown: block.markdown,
      });
    }
  }

  for (const unit of expandedUnits) {
    const yearStr =
      unit.yearHint || extractYearsFromText(unit.sectionLabel + ' ' + unit.sourceTitle)[0] || '';
    const yearNum = yearStr ? parseInt(yearStr, 10) : 0;

    let key = `${unit.sourceId}::${unit.sectionLabel}`;
    let title = unit.sectionLabel || unit.sourceTitle;

    if (plan.organizationMode === 'by_exam_year' && yearNum > 0) {
      key = `year::${yearNum}::${unit.sourceId}`;
      title = title.includes(yearStr) ? title : `${unit.sourceTitle} — ${yearStr}`;
    } else if (plan.organizationMode === 'by_source') {
      key = `source::${unit.sourceId}`;
      title = unit.sourceTitle;
    }

    const existing = groupedMap.get(key);
    if (existing) {
      existing.markdown = `${existing.markdown.trim()}\n\n${unit.markdown.trim()}`;
    } else {
      groupedMap.set(key, {
        key,
        title,
        yearNum,
        sequenceOrder: unit.sequenceOrder,
        sourceTitle: unit.sourceTitle,
        markdown: unit.markdown.trim(),
      });
    }
  }

  const sections = Array.from(groupedMap.values());

  if (plan.organizationMode === 'by_book_order' || plan.organizationMode === 'by_topic') {
    sections.sort((a, b) => a.sequenceOrder - b.sequenceOrder);
  } else if (plan.organizationMode === 'by_exam_year') {
    sections.sort((a, b) => {
      if (a.yearNum === b.yearNum) return a.title.localeCompare(b.title, 'ar');
      if (a.yearNum === 0) return 1;
      if (b.yearNum === 0) return -1;
      return plan.yearSortOrder === 'desc' ? b.yearNum - a.yearNum : a.yearNum - b.yearNum;
    });
  }

  // Track global question occurrences to distinguish cross-exam useful repeats from same-section noise
  const globalFingerprintOccurrences = new Map<string, string[]>();
  const parsedSections = sections.map((sec) => {
    const units = splitSectionIntoQuestionUnits(sec.markdown);
    for (const unit of units) {
      if (unit.fingerprint) {
        const prevList = globalFingerprintOccurrences.get(unit.fingerprint) || [];
        if (!prevList.includes(sec.title)) {
          prevList.push(sec.title);
          globalFingerprintOccurrences.set(unit.fingerprint, prevList);
        }
      }
    }
    return { section: sec, units };
  });

  const repetitionStats: RepetitionStats = {
    totalQuestionsDetected: 0,
    preservedCrossExamRepeats: 0,
    intraSectionDuplicatesRemoved: 0,
    annotatedRepeatsCount: 0,
    consolidatedBankDuplicatesCount: 0,
  };

  const bankSeenGlobal = new Set<string>();
  const finalSectionsOutput: string[] = [];
  const tocTitles: string[] = [];
  const appendixSections: string[] = [];
  let answersMovedCount = 0;

  for (const { section, units } of parsedSections) {
    const intraSectionSeen = new Set<string>();
    const keptUnits: string[] = [];

    for (const unit of units) {
      if (unit.isQuestion) {
        repetitionStats.totalQuestionsDetected++;
      }

      if (unit.fingerprint) {
        // Always prevent identical accidental duplicate inside the exact same exam sheet / section
        if (intraSectionSeen.has(unit.fingerprint)) {
          repetitionStats.intraSectionDuplicatesRemoved++;
          continue;
        }
        intraSectionSeen.add(unit.fingerprint);

        const allOccurrences = globalFingerprintOccurrences.get(unit.fingerprint) || [];
        const appearsInOtherExams = allOccurrences.length > 1;

        if (plan.effectiveRepetitionPolicy === 'deduplicate_bank') {
          if (bankSeenGlobal.has(unit.fingerprint)) {
            repetitionStats.consolidatedBankDuplicatesCount++;
            continue;
          }
          bankSeenGlobal.add(unit.fingerprint);
          if (appearsInOtherExams) {
            keptUnits.push(`${unit.rawMarkdown}\n\n> *مصادر الورود:* ${allOccurrences.join(' · ')}`);
          } else {
            keptUnits.push(unit.rawMarkdown);
          }
        } else if (plan.effectiveRepetitionPolicy === 'preserve_with_frequency_note') {
          if (appearsInOtherExams) {
            repetitionStats.preservedCrossExamRepeats++;
            repetitionStats.annotatedRepeatsCount++;
            const otherPlaces = allOccurrences.filter((t) => t !== section.title).slice(0, 3);
            keptUnits.push(
              `${unit.rawMarkdown}\n\n*(ملاحظة تكرار مفيدة: ورد أيضاً في ${otherPlaces.join('، ')})*`
            );
          } else {
            keptUnits.push(unit.rawMarkdown);
          }
        } else {
          // Default: preserve_across_exams — keep both 2016 and 2022 exam questions completely intact!
          if (appearsInOtherExams) {
            repetitionStats.preservedCrossExamRepeats++;
          }
          keptUnits.push(unit.rawMarkdown);
        }
      } else {
        keptUnits.push(unit.rawMarkdown);
      }
    }

    const joinedBody = keptUnits.join('\n\n').trim();
    if (!joinedBody) continue;

    const { bodyMarkdown, appendixMarkdown, movedCount } = separateAnswersFromSection(
      joinedBody,
      section.title,
      plan.answersPlacement
    );
    answersMovedCount += movedCount;
    if (appendixMarkdown) {
      appendixSections.push(appendixMarkdown);
    }

    if (bodyMarkdown) {
      tocTitles.push(section.title);
      // Avoid duplicating identical H2 heading if body already starts with it
      const startsWithSameHeading = bodyMarkdown
        .split(/\r?\n/)[0]
        ?.replace(/^#+\s+/, '')
        .trim() === section.title;
      const renderedSection = startsWithSameHeading
        ? bodyMarkdown
        : `## ${section.title}\n\n${bodyMarkdown}`;
      finalSectionsOutput.push(renderedSection);
    }
  }

  // Build World-Class Publication Header + TOC + Body + Optional Appendix
  const headerLines: string[] = [
    `# ${plan.compilationTitle}`,
    '',
    `> ${plan.subtitle}`,
    '',
    `**إجمالي الأقسام:** ${tocTitles.length} · **إجمالي الأسئلة المرصودة:** ${repetitionStats.totalQuestionsDetected} · **تاريخ الإعداد:** ${new Date().toLocaleDateString('ar-EG')}`,
    '',
  ];

  if (plan.includeTableOfContents && tocTitles.length > 1) {
    headerLines.push('## فهرس المحتويات', '');
    tocTitles.forEach((t, idx) => {
      headerLines.push(`${idx + 1}. ${t}`);
    });
    if (appendixSections.length > 0) {
      headerLines.push(`${tocTitles.length + 1}. ملحق الإجابات النموذجية`);
    }
    headerLines.push('', '---PAGE_BREAK---', '');
  }

  let bodyStr = finalSectionsOutput.join('\n\n---PAGE_BREAK---\n\n');

  if (appendixSections.length > 0) {
    bodyStr += `\n\n---PAGE_BREAK---\n\n## ملحق الإجابات النموذجية\n\n${appendixSections.join('\n\n---\n\n')}`;
  }

  return {
    markdown: `${headerLines.join('\n')}\n${bodyStr}`.trim(),
    tableOfContentsCount: tocTitles.length,
    sectionCount: finalSectionsOutput.length,
    repetitionStats,
    answersMovedCount,
  };
}

/**
 * Deterministic structural refinement handler for common follow-up user commands
 * (works instantaneously even on huge 100-page compiled anthologies without truncation risk).
 */
export function applyDeterministicRefinement(
  currentMarkdown: string,
  editRequest: string
): { applied: boolean; updatedMarkdown: string; description: string } {
  const normReq = normalizeDigitsToAscii(toStandardArabic(editRequest || ''));

  // 1. Move answers to appendix at end
  if (/(?:انقل.*إجاب.*(?:الآخر|النهاية|ملحق)|اجعل\s*الإجابات\s*في\s*ملحق)/.test(normReq)) {
    const sections = currentMarkdown.split(/\n*---PAGE_BREAK---\n*/);
    const updatedBodies: string[] = [];
    const appendices: string[] = [];
    let moved = 0;

    for (const sec of sections) {
      const headingMatch = sec.match(/^##\s+(.+)$/m);
      const secTitle = headingMatch ? headingMatch[1].trim() : 'قسم';
      if (/^##\s+ملحق الإجابات النموذجية/.test(sec.trim())) {
        appendices.push(sec.replace(/^##\s+ملحق الإجابات النموذجية\s*/m, '').trim());
        continue;
      }
      const res = separateAnswersFromSection(sec, secTitle, 'appendix');
      if (res.appendixMarkdown) appendices.push(res.appendixMarkdown);
      moved += res.movedCount;
      if (res.bodyMarkdown) updatedBodies.push(res.bodyMarkdown);
    }

    if (moved > 0 || appendices.length > 0) {
      const joined = `${updatedBodies.join('\n\n---PAGE_BREAK---\n\n')}\n\n---PAGE_BREAK---\n\n## ملحق الإجابات النموذجية\n\n${appendices.join('\n\n---\n\n')}`;
      return {
        applied: true,
        updatedMarkdown: joined.trim(),
        description: `تم نقل (${moved}) كتلة إجابة إلى «ملحق الإجابات النموذجية» في نهاية المستند مع الإبقاء على نص الأسئلة سليماً.`,
      };
    }
  }

  // 2. Sort exam sections chronologically (newest-first or oldest-first)
  if (/(?:رتب.*(?:من\s*الأحدث|من\s*الأقدم|تصاعدي|تنازلي|حسب\s*السن))/.test(normReq)) {
    const asc = /(?:من\s*الأقدم|تصاعدي)/.test(normReq);
    const pages = currentMarkdown.split(/\n*---PAGE_BREAK---\n*/);
    const leadSections: string[] = [];
    const sortableSections: Array<{ text: string; year: number }> = [];
    const tailSections: string[] = [];

    for (const page of pages) {
      const trimmed = page.trim();
      if (!trimmed) continue;

      // Handle cover header (# Title) glued to the first ## Section without a page break
      if (/^#\s+/.test(trimmed)) {
        const firstH2Idx = trimmed.search(/^##\s+(?!فهرس المحتويات)/m);
        if (firstH2Idx > 0) {
          const coverPart = trimmed.slice(0, firstH2Idx).trim();
          const firstSectionPart = trimmed.slice(firstH2Idx).trim();
          if (coverPart) leadSections.push(coverPart);
          if (firstSectionPart) {
            const heading = firstSectionPart.split(/\r?\n/)[0] || '';
            const y = parseInt(extractYearsFromText(heading)[0] || '0', 10);
            sortableSections.push({ text: firstSectionPart, year: y });
          }
          continue;
        }
        leadSections.push(trimmed);
      } else if (/^##\s+فهرس المحتويات/.test(trimmed)) {
        leadSections.push(trimmed);
      } else if (/^##\s+ملحق الإجابات/.test(trimmed)) {
        tailSections.push(trimmed);
      } else {
        const heading = trimmed.split(/\r?\n/)[0] || '';
        const y = parseInt(extractYearsFromText(heading)[0] || '0', 10);
        sortableSections.push({ text: trimmed, year: y });
      }
    }

    if (sortableSections.some((s) => s.year > 0)) {
      sortableSections.sort((a, b) => {
        if (a.year === b.year) return 0;
        if (a.year === 0) return 1;
        if (b.year === 0) return -1;
        return asc ? a.year - b.year : b.year - a.year;
      });
      const reassembled = [
        ...leadSections,
        ...sortableSections.map((s) => s.text),
        ...tailSections,
      ].join('\n\n---PAGE_BREAK---\n\n');

      return {
        applied: true,
        updatedMarkdown: reassembled,
        description: `تمت إعادة ترتيب أقسام الامتحانات ${asc ? 'من الأقدم إلى الأحدث' : 'من الأحدث إلى الأقدم'} مع الحفاظ على جميع الأسئلة.`,
      };
    }
  }

  // 3. Unify question numbering per section (س١:، س٢:...)
  if (/(?:وح[ّ]?د\s*ترقيم\s*الأسئلة|رق[ّ]?م\s*الأسئلة\s*بالتسلسل)/.test(normReq)) {
    const pages = currentMarkdown.split(/\n*---PAGE_BREAK---\n*/);
    let unifiedCount = 0;
    const toArabicIndic = (n: number) =>
      String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]);

    const updatedPages = pages.map((page) => {
      let qNum = 1;
      return page
        .split(/\r?\n/)
        .map((line) => {
          const m = line.match(
            /^(?:\*\*)?(?:س\s*[0-9٠-٩]+|السؤال\s+(?:الأول|الثاني|الثالث|الرابع|الخامس|السادس|السابع|الثامن|التاسع|العاشر|[0-9٠-٩]+))\s*[:：\-.)]*\s*(.*)$/
          );
          if (m) {
            const rest = m[1].replace(/^\*\*\s*/, '').trim();
            const label = `**س${toArabicIndic(qNum++)}:**`;
            unifiedCount++;
            return rest ? `${label} ${rest}` : label;
          }
          return line;
        })
        .join('\n');
    });

    if (unifiedCount > 0) {
      return {
        applied: true,
        updatedMarkdown: updatedPages.join('\n\n---PAGE_BREAK---\n\n'),
        description: `تم توحيد ترقيم (${unifiedCount}) سؤال بنمط طباعي منضبط (س١، س٢...) داخل كل قسم.`,
      };
    }
  }

  return { applied: false, updatedMarkdown: currentMarkdown, description: '' };
}
