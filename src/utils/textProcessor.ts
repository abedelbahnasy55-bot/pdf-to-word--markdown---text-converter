import { TextCleanerEngine, CleanerRuleItem } from './textCleanerEngine';

export interface TextProcessorOptions {
  removeTableNoise?: boolean;
  purgeArtifacts?: boolean;
  applyKnownPatternFixes?: boolean;
  customRules?: Array<{ pattern: RegExp | string; replacement: string }>;
}

export interface TextProcessingResult {
  processedText: string;
  replacementsCount: number;
  tableNoiseFixes: number;
  artifactsPurged: number;
  patternFixesApplied: number;
}

/**
 * TextProcessor Module
 * Performs rule-based text cleaning on conversion outputs:
 * 1) Removes false-positive table noise like glued 'ا' separators in column headers & grids.
 * 2) Purges specific scanner artifacts like the word 'شمخ' and broken footnote references.
 * 3) Applies regex-based lookup for known error patterns (e.g., 'بأنًّا' -> 'باتًّا', 'تريق الصفقة' -> 'تفريق الصفقة').
 */
export class TextProcessor {
  private engine: TextCleanerEngine;

  constructor(customCleanerRules?: CleanerRuleItem[]) {
    this.engine = new TextCleanerEngine(customCleanerRules);
  }

  public getEngine(): TextCleanerEngine {
    return this.engine;
  }

  /**
   * Main entry point to process and clean an output text string.
   */
  public static process(text: string, options: TextProcessorOptions = {}): string {
    const processor = new TextProcessor();
    return processor.clean(text, options).processedText;
  }

  /**
   * Cleans text and returns detailed metrics.
   */
  public clean(text: string, options: TextProcessorOptions = {}): TextProcessingResult {
    const {
      removeTableNoise = true,
      purgeArtifacts = true,
      applyKnownPatternFixes = true,
      customRules = [],
    } = options;

    if (!text || typeof text !== 'string') {
      return {
        processedText: '',
        replacementsCount: 0,
        tableNoiseFixes: 0,
        artifactsPurged: 0,
        patternFixesApplied: 0,
      };
    }

    let result = text;
    let tableNoiseFixes = 0;
    let artifactsPurged = 0;
    let patternFixesApplied = 0;

    // 1. Remove table noise like glued 'ا' separators
    if (removeTableNoise) {
      result = result
        .replace(/خطة[ \t]*القسم[ \t]*الأدبياالفترة[ \t]*الزمنيةاالموضوعات/g, () => {
          tableNoiseFixes++;
          return '| خطة القسم الأدبي | الفترة الزمنية | الموضوعات |';
        })
        .replace(/خطة[ \t]*القسم[ \t]*العلمياالفترة[ \t]*الزمنيةاالموضوعات/g, () => {
          tableNoiseFixes++;
          return '| خطة القسم العلمي | الفترة الزمنية | الموضوعات |';
        })
        .replace(/الفهرساالموضوعارقم[ \t]*الصفحةاااالموضوعارقم[ \t]*الصفحة/g, () => {
          tableNoiseFixes++;
          return '| الموضوع | رقم الصفحة | الموضوع | رقم الصفحة |';
        })
        .replace(/الفهرساالموضوعارقم[ \t]*الصفحة/g, () => {
          tableNoiseFixes++;
          return '| الفهرس | الموضوع | رقم الصفحة |';
        })
        .replace(/الفقه[ \t]*الحنفيانوع[ \t]*الدليلاالتوضيح/g, () => {
          tableNoiseFixes++;
          return '| الفقه الحنفي | نوع الدليل | التوضيح |';
        })
        .replace(/نوع[ \t]*الدليلاالتوضيح/g, () => {
          tableNoiseFixes++;
          return '| نوع الدليل | التوضيح |';
        })
        .replace(/(?:سلاح[ \t]*الأزهر[ي]?[ \t]*ا|ما)?صاحب[ \t]*ا+الرأي[ \t]*ا+الحكم[ \t]*ا+التعليل[ \t]*ا+والدليل/g, () => {
          tableNoiseFixes++;
          return '| صاحب الرأي | الحكم | التعليل | الدليل |';
        })
        .replace(/(?:سلاح[ \t]*الأزهر[ي]?[ \t]*ا|ما)?صاحب[ \t]*ا+الرأي[ \t]*ا+الحكم[ \t]*ا+التعليل[ \t]*(?:ا+والتعليل)?/g, () => {
          tableNoiseFixes++;
          return '| صاحب الرأي | الحكم | التعليل |';
        })
        .replace(/صاحباالرأيابيانهاالتعليل/g, () => {
          tableNoiseFixes++;
          return '| صاحب الرأي | البيان | التعليل |';
        })
        .replace(/صاحب[ \t]*ا+الرأي[ \t]*ا+المدة[ \t]*ا+العلة/g, () => {
          tableNoiseFixes++;
          return '| صاحب الرأي | المدة | العلة |';
        })
        .replace(/صاحب[ \t]*ا+الرأي[ \t]*ا+الحكم[ \t]*ا+الدليل[ \t]*ا+والتعليل/g, () => {
          tableNoiseFixes++;
          return '| صاحب الرأي | الحكم | الدليل | التعليل |';
        })
        .replace(/الرأياالحكماالتعليل|الرأياالحكماالتوضيح/g, () => {
          tableNoiseFixes++;
          return '| الرأي | الحكم | التعليل |';
        })
        .replace(/المطلوباالتوضيح/g, () => {
          tableNoiseFixes++;
          return '| المطلوب | التوضيح |';
        })
        .replace(/ما[ \t]*ينعقد[ \t]*بهاالتوضيح/g, () => {
          tableNoiseFixes++;
          return '| ما ينعقد بها | التوضيح |';
        })
        .replace(/نوعاالمبيعاالحكماالتعليل/g, () => {
          tableNoiseFixes++;
          return '| نوع المبيع | الحكم | التعليل |';
        })
        .replace(/(?:سلاح[ \t]*الأزهر[ي]?[ \t]*ا|ما)?المسألة[ \t]*ا+الحكم[ \t]*والتوضيح/g, () => {
          tableNoiseFixes++;
          return '| المسألة | الحكم والتوضيح |';
        })
        .replace(/(?:سلاح[ \t]*الأزهر[ي]?[ \t]*ا|ما)?المسألة[ \t]*ا+التوضيح(?:[ \t]*والتعليل)?/g, () => {
          tableNoiseFixes++;
          return '| المسألة | التوضيح والتعليل |';
        })
        .replace(/(?:سلاح[ \t]*الأزهر[ي]?[ \t]*ا|ما)?المثال[ \t]*ا+التوضيح/g, () => {
          tableNoiseFixes++;
          return '| المثال | التوضيح |';
        })
        .replace(/(?:سلاح[ \t]*الأزهر[ي]?[ \t]*ا|ما)?المصطلح[ \t]*ا+التوضيح/g, () => {
          tableNoiseFixes++;
          return '| المصطلح | التوضيح |';
        })
        .replace(/([أ-ي]{3,})ا([أ-ي]{3,})ا([أ-ي]{3,})/g, (match, p1, p2, p3) => {
          if (/خطة|فهرس|موضوع|صفحة|دليل|رأي|حكم|تعليل|قسم|فترة|زمن/.test(match)) {
            tableNoiseFixes++;
            return `| ${p1} | ${p2} | ${p3} |`;
          }
          return match;
        });

      // Convert tab-separated table rows to Markdown table pipes
      if (result.includes('\t')) {
        const lines = result.split('\n');
        let tabRowsConverted = 0;
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line.includes('\t')) {
            const cells = line.split('\t').map((c) => c.trim()).filter((c) => c.length > 0);
            if (cells.length >= 2) {
              lines[i] = `| ${cells.join(' | ')} |`;
              tabRowsConverted++;
            }
          }
        }
        if (tabRowsConverted > 0) {
          result = lines.join('\n');
          tableNoiseFixes += tabRowsConverted;
        }
      }
    }

    // 2. Purge scanner artifacts like 'شمخ' and normalize structural markers
    if (purgeArtifacts) {
      const noisePattern = /\bشمخ\b|[ \t]+شمخ(?=[ \t،.\n]|$)/g;
      const noiseMatches = result.match(noisePattern);
      if (noiseMatches) {
        artifactsPurged += noiseMatches.length;
        result = result.replace(noisePattern, '');
      }

      // Normalize leaked question prefixes like "س: ١" or "س:١" or "س : ١" or "س : 1" -> "س١:"
      result = result.replace(/(?:^|(?<=[\s\n]))س\s*:\s*([٠-٩\d]+)\s*[:.-]?\s*/gm, (_, num) => {
        return `س${num}: `;
      });
      result = result.replace(/(?:^|(?<=[\s\n]))س\s+([٠-٩\d]+)\s*[:.-]\s*/gm, (_, num) => {
        return `س${num}: `;
      });

      // Normalize leaked answer markers like "ج: ١" or "ج:١" or "ج : ١" -> "ج١:"
      result = result.replace(/(?:^|(?<=[\s\n]))ج\s*:\s*([٠-٩\d]+)\s*[:.-]?\s*/gm, (_, num) => {
        return `ج${num}: `;
      });
      result = result.replace(/(?:^|(?<=[\s\n]))ج\s+([٠-٩\d]+)\s*[:.-]\s*/gm, (_, num) => {
        return `ج${num}: `;
      });

      // Strip page break markers that leaked into list items or table rows
      result = result.replace(/(^[-*+]\s+.*)[ \t]*---PAGE[\s_]?BREAK---[ \t]*/gm, '$1 ');
      result = result.replace(/(^\|.*)[ \t]*---PAGE[\s_]?BREAK---[ \t]*/gm, '$1 ');

      // Split embedded page breaks stuck inside normal sentences onto their own clean lines
      result = result.replace(/([^\n])[ \t]*---PAGE[\s_]?BREAK---[ \t]*([^\n])/gi, '$1\n\n---PAGE_BREAK---\n\n$2');

      // Normalize multiple consecutive page breaks into a single clean break
      result = result.replace(/(?:[ \t]*---PAGE[\s_]?BREAK---[ \t]*\n*){2,}/gi, '\n\n---PAGE_BREAK---\n\n');
      result = result.replace(/\n{3,}---PAGE[\s_]?BREAK---/gi, '\n\n---PAGE_BREAK---');
      result = result.replace(/---PAGE[\s_]?BREAK---\n{3,}/gi, '---PAGE_BREAK---\n\n');

      // Strip leading and trailing orphan page breaks
      result = result.replace(/^\s*(?:---PAGE[\s_]?BREAK---\s*)+/gi, '');
      result = result.replace(/(?:\s*---PAGE[\s_]?BREAK---)+\s*$/gi, '');

      const superscriptNoise = /\^?\(?\s*[٠-٩0-9]+\s*\)?\s*شمخ/g;
      const ssMatches = result.match(superscriptNoise);
      if (ssMatches) {
        artifactsPurged += ssMatches.length;
        result = result.replace(superscriptNoise, '');
      }

      const headerNoise = /^[ \t]*(?:الصف[ \t]+الثاني[ \t]+الثانوي|الفصل[ \t]+الدراسي[ \t]+الأول|سلاح[ \t]+الأزهر[ي]?|الفقه[ \t]+الحنفي)[ \t]*(\n[ \t]*[٠-٩0-9]+[ \t]*)?$/gm;
      const hnMatches = result.match(headerNoise);
      if (hnMatches) {
        artifactsPurged += hnMatches.length;
        result = result.replace(headerNoise, '');
      }
    }

    // 3. Apply regex lookup for known error patterns
    if (applyKnownPatternFixes) {
      const knownFixes: Array<{ pattern: RegExp; replacement: string }> = [
        { pattern: /بأنًّا|بأنًا|بانًا|بأنّا|بانّا|بانّاً|بأنّاً/g, replacement: 'باتًّا' },
        { pattern: /تريق[ \t]+الصفقة/g, replacement: 'تفريق الصفقة' },
        { pattern: /البيعي[ \t]+والوزني/g, replacement: 'الكيلي والوزني' },
        { pattern: /الكتيف/g, replacement: 'الكنيف' },
        { pattern: /الزعْر|الزعر/g, replacement: 'الزرع' },
        { pattern: /السففل/g, replacement: 'السُّفْل' },
        { pattern: /أجرة[ \t]+الصيغ/g, replacement: 'أجرة الصَّبْغ' },
        { pattern: /أكتوبرامن/g, replacement: 'أكتوبر من' },
        { pattern: /نوفمبرامن/g, replacement: 'نوفمبر من' },
        { pattern: /ديسمبرامن/g, replacement: 'ديسمبر من' },
        { pattern: /ينايراامتحان/g, replacement: 'يناير | امتحان' },
        { pattern: /للقسمين[ \t]+العلمي[ \t]+والأبي/g, replacement: 'للقسمين العلمي والأدبي' },
        { pattern: /رأول[ \t]+مرة/g, replacement: 'ولأول مرة' },
        { pattern: /للححال/g, replacement: 'للحال' },
        { pattern: /حصصة/g, replacement: 'حصة' },
        { pattern: /كاما:/g, replacement: 'كلاهما:' },
        { pattern: /في[ \t]+قره؟/g, replacement: 'في قدره؟' },
        { pattern: /ينبيء/g, replacement: 'ينبئ' },
        { pattern: /افتترق/g, replacement: 'افترق' },
        { pattern: /لا[ \t]+تصصح/g, replacement: 'لا تصح' },
        { pattern: /تفرقيق/g, replacement: 'تفريق' },
        { pattern: /ومصوغهما[ \t]+ومصوغهما/g, replacement: 'ومصوغهما' },
        { pattern: /نوفمبراباب:/g, replacement: 'نوفمبر | باب:' },
        { pattern: /ديسمبراباب:/g, replacement: 'ديسمبر | باب:' },
        { pattern: /أكتوبراباب:/g, replacement: 'أكتوبر | باب:' },
      ];

      for (const fix of knownFixes) {
        const matches = result.match(fix.pattern);
        if (matches) {
          patternFixesApplied += matches.length;
          result = result.replace(fix.pattern, fix.replacement);
        }
      }
    }

    // 4. Apply any persisted custom dictionary rules from TextCleanerEngine (isCustom && enabled)
    const persistedCustomRules = this.engine
      .getRules()
      .filter((r) => r.isCustom && r.enabled);
    for (const rule of persistedCustomRules) {
      try {
        const re = new RegExp(rule.patternStr, rule.flags || 'g');
        const matches = result.match(re);
        if (matches && matches.length > 0) {
          patternFixesApplied += matches.length;
          result = result.replace(re, rule.replacement);
        }
      } catch (err) {
        console.warn(`[TextProcessor] Invalid custom rule ${rule.id}:`, err);
      }
    }

    // 5. Apply any runtime custom rules
    if (customRules && customRules.length > 0) {
      for (const rule of customRules) {
        const re = typeof rule.pattern === 'string' ? new RegExp(rule.pattern, 'g') : rule.pattern;
        const matches = result.match(re);
        if (matches) {
          patternFixesApplied += matches.length;
          result = result.replace(re, rule.replacement);
        }
      }
    }

    return {
      processedText: result,
      replacementsCount: tableNoiseFixes + artifactsPurged + patternFixesApplied,
      tableNoiseFixes,
      artifactsPurged,
      patternFixesApplied,
    };
  }
}
