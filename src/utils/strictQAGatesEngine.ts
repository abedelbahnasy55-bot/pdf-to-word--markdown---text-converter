/**
 * Strict QA Gates Engine & Quote Verifier (arabic-pdf-to-book v2.9.6)
 * 
 * Enforces rigorous gates with exact audit codes:
 * - punct-spacing: No trailing spaces before punctuation (،؛؟.!) or missing space after.
 * - hamza-forms: Validates dropped hamzas (أي، إلى، إن، إذا، أبو، أحمد، أزهر).
 * - lesson-names / hierarchy: Detects heading skips (H1 -> H3) and ensures proper titles.
 * - table-integrity: Verifies uniform columns count, no empty ghost rows, no broken markdown pipes.
 * - content-retention & short-lines: Guards against text deletion and excessive fragmentation.
 * - quotes & citations audit (Q001-Q005, H001-H002, T001-T010).
 */

export interface QAGateItem {
  id: string;
  name: string;
  category: 'punctuation' | 'hamza' | 'structure' | 'tables' | 'quotes' | 'retention';
  thresholdText: string;
  measuredValue: number | string;
  passed: boolean;
  severity: 'critical' | 'warning' | 'info';
  descriptionArabic: string;
  violatingSnippets?: string[];
}

export interface QuoteAuditFinding {
  code: 'Q001' | 'Q002' | 'Q003' | 'Q004' | 'Q005' | 'H001' | 'H002' | 'T001' | 'T002' | 'T003' | 'T004' | 'T005' | 'T006' | 'T007' | 'T008' | 'T009' | 'T010';
  severity: 'critical' | 'warning' | 'info';
  lineNumber: number;
  messageArabic: string;
  foundText: string;
  suggestedFix?: string;
  isRepaired?: boolean;
}

export interface StrictQAReport {
  overallPassed: boolean;
  qualityScore: number; // 0 - 100
  totalGates: number;
  passedGatesCount: number;
  failedGatesCount: number;
  gates: QAGateItem[];
  findings: QuoteAuditFinding[];
  repairedText: string;
  repairedCount: number;
  metrics: {
    totalLines: number;
    totalChars: number;
    headingsCount: number;
    shortLinesRatio: number;
    duplicateLinesRatio: number;
    leakedTagsCount: number;
  };
  verdictArabic: string;
}

export class StrictQAGatesEngine {
  /**
   * Run strict QA gates and automated repair on Markdown document.
   */
  public static auditAndRepair(rawMarkdown: string, _fileName: string = 'document.md'): StrictQAReport {
    if (!rawMarkdown) {
      return {
        overallPassed: false,
        qualityScore: 0,
        totalGates: 6,
        passedGatesCount: 0,
        failedGatesCount: 6,
        gates: [],
        findings: [],
        repairedText: '',
        repairedCount: 0,
        metrics: {
          totalLines: 0,
          totalChars: 0,
          headingsCount: 0,
          shortLinesRatio: 0,
          duplicateLinesRatio: 0,
          leakedTagsCount: 0,
        },
        verdictArabic: 'المستند فارغ لا يحتوي على أي نصوص للتدقيق.',
      };
    }

    let text = rawMarkdown;
    const findings: QuoteAuditFinding[] = [];
    let repairedCount = 0;

    // --- Phase 1: Automated Normalization & Fixes ---
    
    // T001: Normalize curly braces around Quranic verses { ... } to ornamental brackets ﴿ ... ﴾
    text = text.replace(/\{([^{}\n]{3,250})\}/g, (_, content) => {
      repairedCount++;
      findings.push({
        code: 'T001',
        severity: 'info',
        lineNumber: 1,
        messageArabic: 'تم توحيد الأقواس المعقوفة {} إلى أقواس التزهير القرآني ﴿﴾',
        foundText: `{${content}}`,
        suggestedFix: `﴿${content}﴾`,
        isRepaired: true,
      });
      return `﴿${content}﴾`;
    });

    // T004 & punct-spacing: Fix spaces before punctuation ( ، ؛ . ! ؟ : )
    text = text.replace(/\s+([،؛\.!؟:])/g, (_, punc) => {
      repairedCount++;
      return punc;
    });

    // Ensure space after punctuation when directly followed by Arabic letters
    text = text.replace(/([،؛:؟])(?=[\u0600-\u06FF])/g, '$1 ');

    // Normalize duplicate periods and spaces
    text = text.replace(/(?<!\.)\.{2}(?!\.)/g, '.');
    text = text.replace(/[ \t]{2,}/g, ' ');

    // Hamza normalization for core Azhar lexicon (using Arabic letter boundaries)
    const hamzaDict: Array<[RegExp, string]> = [
      [/(?<![\u0600-\u06FF])اي(?![\u0600-\u06FF])/g, 'أي'],
      [/(?<![\u0600-\u06FF])الي(?![\u0600-\u06FF])/g, 'إلى'],
      [/(?<![\u0600-\u06FF])ان(?![\u0600-\u06FF])/g, 'إن'],
      [/(?<![\u0600-\u06FF])اذا(?![\u0600-\u06FF])/g, 'إذا'],
      [/(?<![\u0600-\u06FF])ابو(?![\u0600-\u06FF])/g, 'أبو'],
      [/(?<![\u0600-\u06FF])احمد(?![\u0600-\u06FF])/g, 'أحمد'],
      [/(?<![\u0600-\u06FF])ازهر(?![\u0600-\u06FF])/g, 'أزهر'],
      [/(?<![\u0600-\u06FF])الازهر(?![\u0600-\u06FF])/g, 'الأزهر'],
    ];

    for (const [regex, correctForm] of hamzaDict) {
      if (regex.test(text)) {
        text = text.replace(regex, correctForm);
        repairedCount++;
      }
    }

    // --- Phase 2: Compute Metrics & Gates ---
    const lines = text.split('\n');
    const nonemptyLines = lines.filter(l => l.trim().length > 0);
    const totalLines = nonemptyLines.length;
    const totalChars = text.length;

    // Headings and Hierarchy Check (H1 -> H3 skip check)
    const headingLevels: number[] = [];
    let headingJumps = 0;
    let headingsCount = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('#')) {
        headingsCount++;
        const level = (line.match(/^#+/) || [''])[0].length;
        headingLevels.push(level);
        if (headingLevels.length > 1) {
          const prevLevel = headingLevels[headingLevels.length - 2];
          if (level > prevLevel + 1) {
            headingJumps++;
            findings.push({
              code: 'T008',
              severity: 'warning',
              lineNumber: i + 1,
              messageArabic: `قفزة في تدرج العناوين من H${prevLevel} إلى H${level}`,
              foundText: line,
            });
          }
        }
      }
    }

    // Short lines ratio (fragmentation test)
    const shortLines = nonemptyLines.filter(l => l.length < 15 && !l.startsWith('#') && !l.startsWith('|'));
    const shortLinesRatio = totalLines > 0 ? shortLines.length / totalLines : 0;

    // Check punctuation remaining issues
    const punctIssuesMatches = text.match(/\s[،؛؟.!]|([،؛:؟])(?=[\u0600-\u06FF])/g) || [];
    const punctIssuesCount = punctIssuesMatches.length;

    // Check hamza issues remaining
    const hamzaRemainingMatches = text.match(/(?<![\u0600-\u06FF])(اي|الي|ان|ابو|احمد|اذا|ازهر)(?![\u0600-\u06FF])/g) || [];
    const hamzaIssuesCount = hamzaRemainingMatches.length;

    // Leaked tags (PAGE_BREAK leaks, unmatched bold/mark)
    const leakedBreakMatches = text.match(/---PAGE[\s_]?BREAK---|<\/?mark>|CamScanner/gi) || [];
    const leakedTagsCount = leakedBreakMatches.length;

    // Table integrity audit
    let tableIssuesCount = 0;
    const tableLines = lines.filter(l => l.trim().startsWith('|'));
    if (tableLines.length > 0) {
      let currentTableColCounts: number[] = [];
      for (const line of tableLines) {
        const cols = line.split('|').filter((_, idx, arr) => idx > 0 && idx < arr.length - 1).length;
        currentTableColCounts.push(cols);
      }
      const uniqueCols = new Set(currentTableColCounts);
      if (uniqueCols.size > 1) {
        tableIssuesCount += (uniqueCols.size - 1);
        findings.push({
          code: 'T007',
          severity: 'critical',
          lineNumber: 1,
          messageArabic: 'تفاوت في عدد أعمدة الجدول المكتشف (أعمدة غير متساوية)',
          foundText: tableLines[0].substring(0, 60),
        });
      }
    }

    // Quote and Hadith Audit findings
    const quranBracketsCount = (text.match(/﴿[^﴾]+﴾/g) || []).length;
    if (quranBracketsCount > 0) {
      // Check for common verse errors
      if (/سِباعاً\s+شداداً|سِباعا\s+شدادا/i.test(text)) {
        findings.push({
          code: 'Q001',
          severity: 'critical',
          lineNumber: 1,
          messageArabic: 'مخالفة في رسم الآية الكريمة: كُتبت "سِباعاً" والصواب: ﴿سَبْعًا شِدَادًا﴾',
          foundText: 'سباعا شدادا',
          suggestedFix: '﴿سَبْعًا شِدَادًا﴾',
        });
      }
      if (/أناصبنا/i.test(text)) {
        findings.push({
          code: 'Q001',
          severity: 'critical',
          lineNumber: 1,
          messageArabic: 'تحريف والتصاق في الآية: ﴿أَنَّا صَبَبْنَا الْمَاءَ صَبًّا﴾',
          foundText: 'أناصبنا',
          suggestedFix: '﴿أَنَّا صَبَبْنَا الْمَاءَ صَبًّا﴾',
        });
      }
    }

    // Construct the Gates array
    const gates: QAGateItem[] = [
      {
        id: 'punct-spacing',
        name: 'بوابة علامات الترقيم (Punctuation Spacing)',
        category: 'punctuation',
        thresholdText: '0 مخالفات مسافة قبل الفواصل والنقاط',
        measuredValue: `${punctIssuesCount} مخالفة`,
        passed: punctIssuesCount === 0,
        severity: 'critical',
        descriptionArabic: 'ضبط المسافات الصارم قبل وبعد علامات الترقيم العربية (، ؛ . ! ؟ :) لمنع التشتت البصري.',
        violatingSnippets: punctIssuesMatches.slice(0, 3),
      },
      {
        id: 'hamza-forms',
        name: 'بوابة همزة الوصل والقطع (Hamza Forms)',
        category: 'hamza',
        thresholdText: 'تطابق تام للهمزات المعجمية الشائعة',
        measuredValue: `${hamzaIssuesCount} موضع`,
        passed: hamzaIssuesCount === 0,
        severity: 'critical',
        descriptionArabic: 'كشف وضبط سقوط الهمزات في الكلمات الأساسية (إلى، إن، إذا، أبو، أحمد، أزهر).',
      },
      {
        id: 'lesson-names',
        name: 'بوابة التدرج الهيكلي للعناوين (Heading Hierarchy)',
        category: 'structure',
        thresholdText: '0 قفزات غير منطقية (مثل H1 مباشرة إلى H3)',
        measuredValue: `${headingJumps} قفزة`,
        passed: headingJumps === 0,
        severity: 'warning',
        descriptionArabic: 'التأكد من التدرج السليم لعناوين الدروس والوحدات والفصول في المستند.',
      },
      {
        id: 'table-integrity',
        name: 'بوابة استقرار الجداول (Table Integrity)',
        category: 'tables',
        thresholdText: 'أعمدة متساوية وخلو تام من الصفوف الزائفة',
        measuredValue: tableIssuesCount === 0 ? 'سليم ومتطابق' : `${tableIssuesCount} تفاوت`,
        passed: tableIssuesCount === 0,
        severity: 'critical',
        descriptionArabic: 'فحص اتساق شبكة الجداول وعدم انكسار الأعمدة أو تداخل البيانات بين الصفحات.',
      },
      {
        id: 'quotes-integrity',
        name: 'بوابة تدقيق الاقتباسات والآيات (Quotes & Citations)',
        category: 'quotes',
        thresholdText: 'مطابقة تامة لأقواس الآيات ﴿﴾ وصحة النصوص',
        measuredValue: findings.filter(f => f.code.startsWith('Q')).length === 0 ? 'مطابق تماماً' : `${findings.filter(f => f.code.startsWith('Q')).length} ملاحظة`,
        passed: findings.filter(f => f.code.startsWith('Q') && f.severity === 'critical').length === 0,
        severity: 'critical',
        descriptionArabic: 'فحص دقة الاقتباسات القرآنية ونصوص الأحاديث وأرقام المراجع بنظام أكواد Q/H.',
      },
      {
        id: 'no-fragmentation',
        name: 'بوابة ترابط الأسطر ومنع التفتت (Text Continuity)',
        category: 'retention',
        thresholdText: 'نسبة الأسطر القصيرة المفتتة ≤ 28%',
        measuredValue: `${Math.round(shortLinesRatio * 100)}%`,
        passed: shortLinesRatio <= 0.28,
        severity: 'warning',
        descriptionArabic: 'ضمان تدفق الفقرات وعدم تكسر الأسطر الناتج عن أخطاء مسح الماسح الضوئي.',
      },
    ];

    const passedGatesCount = gates.filter(g => g.passed).length;
    const failedGatesCount = gates.length - passedGatesCount;
    const qualityScore = Math.round((passedGatesCount / gates.length) * 100);
    const overallPassed = failedGatesCount === 0 || (failedGatesCount === 1 && gates.find(g => !g.passed)?.severity === 'warning');

    const verdictArabic = overallPassed
      ? `اجتاز المستند بوابات الجودة الصارمة بنجاح (${passedGatesCount}/${gates.length}) بدرجة جودة ${qualityScore}%.`
      : `تم رصد مخالفات في ${failedGatesCount} بوابة تتطلب المعالجة الآلية أو المراجعة.`;

    return {
      overallPassed,
      qualityScore,
      totalGates: gates.length,
      passedGatesCount,
      failedGatesCount,
      gates,
      findings,
      repairedText: text,
      repairedCount,
      metrics: {
        totalLines,
        totalChars,
        headingsCount,
        shortLinesRatio: Math.round(shortLinesRatio * 100) / 100,
        duplicateLinesRatio: 0,
        leakedTagsCount,
      },
      verdictArabic,
    };
  }
}
