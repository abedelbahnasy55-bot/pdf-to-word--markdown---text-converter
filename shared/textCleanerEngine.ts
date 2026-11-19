export interface CleanerRuleItem {
  id: string;
  patternStr: string;
  flags: string;
  replacement: string;
  category: 'table_header' | 'margin_noise' | 'fiqh_typo' | 'spelling' | 'custom';
  subject: string;
  description: string;
  enabled: boolean;
  isCustom?: boolean;
}

export interface CleanerAuditReport {
  cleanedText: string;
  totalReplacements: number;
  tableHeadersFixed: number;
  noisePurged: number;
  typosCorrected: number;
  appliedRuleIds: string[];
  executionTimeMs: number;
}

/**
 * Standard reference dictionary of default Azhar & Fiqh correction rules
 */
export const DEFAULT_CLEANER_RULES: CleanerRuleItem[] = [
  // --- 1. Table Headers & Glued 'ا' Column Separators ---
  {
    id: 'tbl-1',
    patternStr: 'خطة[ \\t]*القسم[ \\t]*الأدبياالفترة[ \\t]*الزمنيةاالموضوعات',
    flags: 'g',
    replacement: '| خطة القسم الأدبي | الفترة الزمنية | الموضوعات |',
    category: 'table_header',
    subject: 'عام',
    description: 'تفكيك فواصل الألف الملتصقة في خطة القسم الأدبي إلى جدول ماركداون قياسي',
    enabled: true,
  },
  {
    id: 'tbl-2',
    patternStr: 'خطة[ \\t]*القسم[ \\t]*العلمياالفترة[ \\t]*الزمنيةاالموضوعات',
    flags: 'g',
    replacement: '| خطة القسم العلمي | الفترة الزمنية | الموضوعات |',
    category: 'table_header',
    subject: 'عام',
    description: 'تفكيك فواصل الألف الملتصقة في خطة القسم العلمي إلى جدول ماركداون قياسي',
    enabled: true,
  },
  {
    id: 'tbl-3-quad',
    patternStr: 'الفهرساالموضوعارقم[ \\t]*الصفحةاااالموضوعارقم[ \\t]*الصفحة',
    flags: 'g',
    replacement: '| الموضوع | رقم الصفحة | الموضوع | رقم الصفحة |',
    category: 'table_header',
    subject: 'عام',
    description: 'إصلاح عناوين الفهرس المزدوج الملتصقة بحرف الألف إلى جدول ماركداون رباعي الأعمدة',
    enabled: true,
  },
  {
    id: 'tbl-3',
    patternStr: 'الفهرساالموضوعارقم[ \\t]*الصفحة',
    flags: 'g',
    replacement: '| الفهرس | الموضوع | رقم الصفحة |',
    category: 'table_header',
    subject: 'عام',
    description: 'إصلاح عناوين الفهرس الملتصقة بحرف الألف إلى جدول ماركداون',
    enabled: true,
  },
  {
    id: 'tbl-4',
    patternStr: 'الفقه[ \\t]*الحنفيانوع[ \\t]*الدليلاالتوضيح',
    flags: 'g',
    replacement: '| الفقه الحنفي | نوع الدليل | التوضيح |',
    category: 'table_header',
    subject: 'فقه حنفي',
    description: 'تفكيك وتصحيح عناوين جدول الفقه الحنفي والدليل',
    enabled: true,
  },
  {
    id: 'tbl-4-sub',
    patternStr: 'نوع[ \\t]*الدليلاالتوضيح',
    flags: 'g',
    replacement: '| نوع الدليل | التوضيح |',
    category: 'table_header',
    subject: 'فقه حنفي',
    description: 'تفكيك عنوان الفرع لجدول نوع الدليل والتوضيح',
    enabled: true,
  },
  {
    id: 'tbl-12',
    patternStr: '(?:سلاح[ \\t]*الأزهر[ي]?[ \\t]*ا|ما)?صاحب[ \\t]*ا+الرأي[ \\t]*ا+الحكم[ \\t]*ا+التعليل[ \\t]*ا+والدليل',
    flags: 'g',
    replacement: '| صاحب الرأي | الحكم | التعليل | الدليل |',
    category: 'table_header',
    subject: 'فقه حنفي',
    description: 'تفكيك جدول صاحب الرأي والحكم والتعليل والدليل',
    enabled: true,
  },
  {
    id: 'tbl-13',
    patternStr: '(?:سلاح[ \\t]*الأزهر[ي]?[ \\t]*ا|ما)?صاحب[ \\t]*ا+الرأي[ \\t]*ا+الحكم[ \\t]*ا+التعليل[ \\t]*(?:ا+والتعليل)?',
    flags: 'g',
    replacement: '| صاحب الرأي | الحكم | التعليل |',
    category: 'table_header',
    subject: 'فقه حنفي',
    description: 'تفكيك جدول صاحب الرأي والحكم والتعليل',
    enabled: true,
  },
  {
    id: 'tbl-11',
    patternStr: 'صاحباالرأيابيانهاالتعليل',
    flags: 'g',
    replacement: '| صاحب الرأي | البيان | التعليل |',
    category: 'table_header',
    subject: 'فقه حنفي',
    description: 'تفكيك جدول صاحب الرأي والبيان والتعليل',
    enabled: true,
  },
  {
    id: 'tbl-18',
    patternStr: 'صاحب[ \\t]*ا+الرأي[ \\t]*ا+المدة[ \\t]*ا+العلة',
    flags: 'g',
    replacement: '| صاحب الرأي | المدة | العلة |',
    category: 'table_header',
    subject: 'فقه حنفي',
    description: 'تفكيك جدول صاحب الرأي والمدة والعلة',
    enabled: true,
  },
  {
    id: 'tbl-19',
    patternStr: 'صاحب[ \\t]*ا+الرأي[ \\t]*ا+الحكم[ \\t]*ا+الدليل[ \\t]*ا+والتعليل',
    flags: 'g',
    replacement: '| صاحب الرأي | الحكم | الدليل | التعليل |',
    category: 'table_header',
    subject: 'فقه حنفي',
    description: 'تفكيك جدول صاحب الرأي والحكم والدليل والتعليل',
    enabled: true,
  },
  {
    id: 'tbl-5',
    patternStr: 'الرأياالحكماالتعليل|الرأياالحكماالتوضيح',
    flags: 'g',
    replacement: '| الرأي | الحكم | التعليل |',
    category: 'table_header',
    subject: 'عام',
    description: 'تفكيك وترتيب عناوين جدول الرأي والحكم والتعليل',
    enabled: true,
  },
  {
    id: 'tbl-6',
    patternStr: 'المطلوباالتوضيح',
    flags: 'g',
    replacement: '| المطلوب | التوضيح |',
    category: 'table_header',
    subject: 'عام',
    description: 'تفكيك ورص الجدول العرضي للمطلوب والتوضيح',
    enabled: true,
  },
  {
    id: 'tbl-7',
    patternStr: 'ما[ \\t]*ينعقد[ \\t]*بهاالتوضيح',
    flags: 'g',
    replacement: '| ما ينعقد بها | التوضيح |',
    category: 'table_header',
    subject: 'فقه حنفي',
    description: 'تفكيك عنوان جدول ما ينعقد به البيع',
    enabled: true,
  },
  {
    id: 'tbl-8',
    patternStr: 'نوعاالمبيعاالحكماالتعليل',
    flags: 'g',
    replacement: '| نوع المبيع | الحكم | التعليل |',
    category: 'table_header',
    subject: 'فقه حنفي',
    description: 'تفكيك عنوان جدول نوع المبيع والحكم والتعليل',
    enabled: true,
  },
  {
    id: 'tbl-9',
    patternStr: 'المسألةاالحكم[ \\t]*والتوضيح|المسألةاالتوضيح',
    flags: 'g',
    replacement: '| المسألة | التوضيح |',
    category: 'table_header',
    subject: 'فقه حنفي',
    description: 'تفكيك جدول المسألة والتوضيح',
    enabled: true,
  },
  {
    id: 'tbl-10',
    patternStr: 'المصطلحاالتوضيح',
    flags: 'g',
    replacement: '| المصطلح | التوضيح |',
    category: 'table_header',
    subject: 'فقه حنفي',
    description: 'تفكيك جدول المصطلح والتوضيح',
    enabled: true,
  },
  {
    id: 'tbl-14',
    patternStr: '(?:سلاح[ \\t]*الأزهر[ي]?[ \\t]*ا|ما)?المسألة[ \\t]*ا+الحكم[ \\t]*والتوضيح',
    flags: 'g',
    replacement: '| المسألة | الحكم والتوضيح |',
    category: 'table_header',
    subject: 'فقه حنفي',
    description: 'تفكيك جدول المسألة والحكم والتوضيح',
    enabled: true,
  },
  {
    id: 'tbl-15',
    patternStr: '(?:سلاح[ \\t]*الأزهر[ي]?[ \\t]*ا|ما)?المسألة[ \\t]*ا+التوضيح(?:[ \\t]*والتعليل)?',
    flags: 'g',
    replacement: '| المسألة | التوضيح والتعليل |',
    category: 'table_header',
    subject: 'فقه حنفي',
    description: 'تفكيك جدول المسألة والتوضيح والتعليل',
    enabled: true,
  },
  {
    id: 'tbl-16',
    patternStr: '(?:سلاح[ \\t]*الأزهر[ي]?[ \\t]*ا|ما)?المثال[ \\t]*ا+التوضيح',
    flags: 'g',
    replacement: '| المثال | التوضيح |',
    category: 'table_header',
    subject: 'فقه حنفي',
    description: 'تفكيك جدول المثال والتوضيح',
    enabled: true,
  },
  {
    id: 'tbl-17',
    patternStr: '(?:سلاح[ \\t]*الأزهر[ي]?[ \\t]*ا|ما)?المصطلح[ \\t]*ا+التوضيح',
    flags: 'g',
    replacement: '| المصطلح | التوضيح |',
    category: 'table_header',
    subject: 'فقه حنفي',
    description: 'تفكيك جدول المصطلح والتوضيح',
    enabled: true,
  },

  // --- 2. Fiqh & Spelling Typos ---
  {
    id: 'typo-1',
    patternStr: 'بأنًّا|بأنًا|بانًا|بأنّا|بانّا|بانّاً|بأنّاً',
    flags: 'g',
    replacement: 'باتًّا',
    category: 'fiqh_typo',
    subject: 'فقه حنفي',
    description: 'تصحيح المصطلح الفقهي المحرف من "بأنًّا" إلى "باتًّا" (أي نافذاً قطعيّاً)',
    enabled: true,
  },
  {
    id: 'typo-2',
    patternStr: 'البيعي[ \\t]+والوزني',
    flags: 'g',
    replacement: 'الكيلي والوزني',
    category: 'fiqh_typo',
    subject: 'فقه حنفي',
    description: 'تصحيح المصطلح الفقهي المنهجي المعتمد من "البيعي والوزني" إلى "الكيلي والوزني"',
    enabled: true,
  },
  {
    id: 'typo-3',
    patternStr: 'الكتيف',
    flags: 'g',
    replacement: 'الكنيف',
    category: 'fiqh_typo',
    subject: 'فقه حنفي',
    description: 'تصحيح الكلمة الفقهية من "الكتيف" إلى "الكنيف" (بمعنى المرحاض)',
    enabled: true,
  },
  {
    id: 'typo-4',
    patternStr: 'الزعْر|الزعر',
    flags: 'g',
    replacement: 'الزرع',
    category: 'fiqh_typo',
    subject: 'فقه حنفي',
    description: 'تصحيح الكلمة الفقهية إلى "الزرع"',
    enabled: true,
  },
  {
    id: 'typo-5',
    patternStr: 'تريق[ \\t]+الصفقة',
    flags: 'g',
    replacement: 'تفريق الصفقة',
    category: 'fiqh_typo',
    subject: 'فقه حنفي',
    description: 'تصحيح المصطلح الفقهي المحرف إلى "تفريق الصفقة"',
    enabled: true,
  },
  {
    id: 'typo-6',
    patternStr: 'السففل',
    flags: 'g',
    replacement: 'السُّفْل',
    category: 'fiqh_typo',
    subject: 'فقه حنفي',
    description: 'تصحيح الكلمة الفقهية إلى "السُّفْل" (الطابق السفلي)',
    enabled: true,
  },
  {
    id: 'typo-7',
    patternStr: 'أجرة[ \\t]+الصيغ',
    flags: 'g',
    replacement: 'أجرة الصَّبْغ',
    category: 'fiqh_typo',
    subject: 'فقه حنفي',
    description: 'تصحيح المصطلح الفقهي إلى "أجرة الصَّبْغ"',
    enabled: true,
  },
  {
    id: 'typo-8',
    patternStr: 'أكتوبرامن',
    flags: 'g',
    replacement: 'أكتوبر من',
    category: 'spelling',
    subject: 'عام',
    description: 'فك الكلمتين المدمجتين من "أكتوبرامن" إلى "أكتوبر من"',
    enabled: true,
  },
  {
    id: 'typo-9',
    patternStr: 'نوفمبرامن',
    flags: 'g',
    replacement: 'نوفمبر من',
    category: 'spelling',
    subject: 'عام',
    description: 'فك الكلمتين المدمجتين من "نوفمبرامن" إلى "نوفمبر من"',
    enabled: true,
  },
  {
    id: 'typo-10',
    patternStr: 'ديسمبرامن',
    flags: 'g',
    replacement: 'ديسمبر من',
    category: 'spelling',
    subject: 'عام',
    description: 'فك الكلمتين المدمجتين من "ديسمبرامن" إلى "ديسمبر من"',
    enabled: true,
  },
  {
    id: 'typo-11',
    patternStr: 'ينايراامتحان',
    flags: 'g',
    replacement: 'يناير | امتحان',
    category: 'spelling',
    subject: 'عام',
    description: 'فك وتصحيح خانة شهر يناير والامتحان',
    enabled: true,
  },
  {
    id: 'typo-12',
    patternStr: 'للقسمين[ \\t]+العلمي[ \\t]+والأبي',
    flags: 'g',
    replacement: 'للقسمين العلمي والأدبي',
    category: 'spelling',
    subject: 'عام',
    description: 'تصحيح الخطأ المطبعي "والأبي" إلى "والأدبي"',
    enabled: true,
  },
  {
    id: 'typo-13',
    patternStr: 'رأول[ \\t]+مرة',
    flags: 'g',
    replacement: 'ولأول مرة',
    category: 'spelling',
    subject: 'عام',
    description: 'تصحيح الخطأ المطبعي "رأول مرة" إلى "ولأول مرة"',
    enabled: true,
  },
  {
    id: 'typo-14',
    patternStr: 'للححال',
    flags: 'g',
    replacement: 'للحال',
    category: 'spelling',
    subject: 'عام',
    description: 'تصحيح الخطأ المطبعي "للححال" إلى "للحال"',
    enabled: true,
  },
  {
    id: 'typo-15',
    patternStr: 'حصصة',
    flags: 'g',
    replacement: 'حصة',
    category: 'spelling',
    subject: 'عام',
    description: 'تصحيح الخطأ المطبعي "حصصة" إلى "حصة"',
    enabled: true,
  },
  {
    id: 'typo-16',
    patternStr: 'كاما:',
    flags: 'g',
    replacement: 'كلاهما:',
    category: 'spelling',
    subject: 'فقه حنفي',
    description: 'تصحيح "كاما:" إلى "كلاهما:"',
    enabled: true,
  },
  {
    id: 'typo-17',
    patternStr: 'في[ \\t]+قره؟',
    flags: 'g',
    replacement: 'في قدره؟',
    category: 'spelling',
    subject: 'فقه حنفي',
    description: 'تصحيح "في قره؟" إلى "في قدره؟"',
    enabled: true,
  },
  {
    id: 'typo-18',
    patternStr: 'ينبيء',
    flags: 'g',
    replacement: 'ينبئ',
    category: 'spelling',
    subject: 'عام',
    description: 'تصحيح إملاء "ينبيء" إلى "ينبئ"',
    enabled: true,
  },
  {
    id: 'typo-19',
    patternStr: 'افتترق',
    flags: 'g',
    replacement: 'افترق',
    category: 'spelling',
    subject: 'عام',
    description: 'تصحيح إملاء "افتترق" إلى "افترق"',
    enabled: true,
  },
  {
    id: 'typo-20',
    patternStr: 'لا[ \\t]+تصصح',
    flags: 'g',
    replacement: 'لا تصح',
    category: 'spelling',
    subject: 'عام',
    description: 'تصحيح "لا تصصح" إلى "لا تصح"',
    enabled: true,
  },
  {
    id: 'typo-21',
    patternStr: 'تفرقيق',
    flags: 'g',
    replacement: 'تفريق',
    category: 'spelling',
    subject: 'عام',
    description: 'تصحيح "تفرقيق" إلى "تفريق"',
    enabled: true,
  },
  {
    id: 'typo-22',
    patternStr: 'ومصوغهما[ \\t]+ومصوغهما',
    flags: 'g',
    replacement: 'ومصوغهما',
    category: 'spelling',
    subject: 'فقه حنفي',
    description: 'حذف التكرار المزدوج لكلمة "ومصوغهما"',
    enabled: true,
  },
  {
    id: 'typo-23',
    patternStr: 'نوفمبراباب:',
    flags: 'g',
    replacement: 'نوفمبر | باب:',
    category: 'spelling',
    subject: 'عام',
    description: 'فك تداخل شهر نوفمبر وباب الخطة الدراسية',
    enabled: true,
  },
  {
    id: 'typo-24',
    patternStr: 'ديسمبراباب:',
    flags: 'g',
    replacement: 'ديسمبر | باب:',
    category: 'spelling',
    subject: 'عام',
    description: 'فك تداخل شهر ديسمبر وباب الخطة الدراسية',
    enabled: true,
  },
  {
    id: 'typo-25',
    patternStr: 'أكتوبراباب:',
    flags: 'g',
    replacement: 'أكتوبر | باب:',
    category: 'spelling',
    subject: 'عام',
    description: 'فك تداخل شهر أكتوبر وباب الخطة الدراسية',
    enabled: true,
  },

  // --- 3. Margin & Scanner Noise ---
  {
    id: 'noise-1',
    patternStr: '\\bشمخ\\b|[ \\t]+شمخ(?=[ \\t،.\\n]|$)',
    flags: 'g',
    replacement: '',
    category: 'margin_noise',
    subject: 'عام',
    description: 'تطهير وحذف رمز الهامش المكسور "شمخ" الملتصق بأسماء الأعلام والصحابة',
    enabled: true,
  },
  {
    id: 'noise-2',
    patternStr: '\\^?\\(?\\s*[٠-٩0-9]+\\s*\\)?\\s*شمخ',
    flags: 'g',
    replacement: '',
    category: 'margin_noise',
    subject: 'عام',
    description: 'حذف شائبة الهوامش المكسورة "شمخ" والرموز الطافية',
    enabled: true,
  },
  {
    id: 'noise-3',
    patternStr: '^[ \\t]*(?:الصف[ \\t]+الثاني[ \\t]+الثانوي|الفصل[ \\t]+الدراسي[ \\t]+الأول|سلاح[ \\t]+الأزهرى?|الفقه[ \\t]+الحنفي)[ \\t]*$\\n?',
    flags: 'gm',
    replacement: '',
    category: 'margin_noise',
    subject: 'عام',
    description: 'تنظيف العناوين المكررة وشعارات رأس الصفحة الطافية في منتصف الجمل',
    enabled: true,
  },
  {
    id: 'noise-4',
    patternStr: '^[ \\t]*(?:الصف[ \\t]+الثاني[ \\t]+الثانوي|الفصل[ \\t]+الدراسي[ \\t]+الأول|سلاح[ \\t]+الأزهر[ي]?|الفقه[ \\t]+الحنفي)[ \\t]*\\n[ \\t]*[٠-٩0-9]+[ \\t]*$\\n?',
    flags: 'gm',
    replacement: '',
    category: 'margin_noise',
    subject: 'عام',
    description: 'حذف شعارات رأس الصفحة المتبوعة بأرقام الصفحات المعزولة لمنع تشويه الفقرات',
    enabled: true,
  },
];

const LOCAL_STORAGE_RULES_KEY = 'azhar_custom_cleaner_rules_v1';

/**
 * Text Cleaner Engine class providing modular post-processing
 */
export class TextCleanerEngine {
  private rules: CleanerRuleItem[];

  constructor(customRules?: CleanerRuleItem[]) {
    if (customRules && customRules.length > 0) {
      this.rules = [...customRules];
    } else {
      this.rules = this.loadStoredRules();
    }
  }

  private loadStoredRules(): CleanerRuleItem[] {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const stored = localStorage.getItem(LOCAL_STORAGE_RULES_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
          }
        }
      } catch (err) {
        console.warn('[TextCleanerEngine] Error loading stored custom rules:', err);
      }
    }
    return DEFAULT_CLEANER_RULES;
  }

  public saveRules(rules: CleanerRuleItem[]): void {
    this.rules = rules;
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        localStorage.setItem(LOCAL_STORAGE_RULES_KEY, JSON.stringify(rules));
      } catch (err) {
        console.warn('[TextCleanerEngine] Error saving rules to localStorage:', err);
      }
    }
  }

  public getRules(): CleanerRuleItem[] {
    return [...this.rules];
  }

  public resetToDefault(): CleanerRuleItem[] {
    this.rules = [...DEFAULT_CLEANER_RULES];
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        localStorage.removeItem(LOCAL_STORAGE_RULES_KEY);
      } catch {}
    }
    return this.getRules();
  }

  public addRule(newRule: Omit<CleanerRuleItem, 'id'>): CleanerRuleItem {
    const rule: CleanerRuleItem = {
      ...newRule,
      id: `custom-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      isCustom: true,
    };
    this.rules.push(rule);
    this.saveRules(this.rules);
    return rule;
  }

  public toggleRule(id: string, enabled?: boolean): void {
    this.rules = this.rules.map((r) => (r.id === id ? { ...r, enabled: enabled ?? !r.enabled } : r));
    this.saveRules(this.rules);
  }

  public removeRule(id: string): void {
    this.rules = this.rules.filter((r) => r.id !== id);
    this.saveRules(this.rules);
  }

  /**
   * Executes full post-processing text cleaning pass
   */
  public cleanText(text: string): CleanerAuditReport {
    const startTime = performance?.now ? performance.now() : Date.now();
    let cleaned = text;

    let totalReplacements = 0;
    let tableHeadersFixed = 0;
    let noisePurged = 0;
    let typosCorrected = 0;
    const appliedRuleIds: string[] = [];

    if (!text || !text.trim()) {
      return {
        cleanedText: text || '',
        totalReplacements: 0,
        tableHeadersFixed: 0,
        noisePurged: 0,
        typosCorrected: 0,
        appliedRuleIds: [],
        executionTimeMs: 0,
      };
    }

    // 1. Dynamic Rule Pass
    for (const rule of this.rules) {
      if (!rule.enabled) continue;
      try {
        const re = new RegExp(rule.patternStr, rule.flags || 'g');
        const matches = cleaned.match(re);
        if (matches && matches.length > 0) {
          const matchCount = matches.length;
          cleaned = cleaned.replace(re, rule.replacement);

          totalReplacements += matchCount;
          appliedRuleIds.push(rule.id);

          if (rule.category === 'table_header') {
            tableHeadersFixed += matchCount;
          } else if (rule.category === 'margin_noise') {
            noisePurged += matchCount;
          } else {
            typosCorrected += matchCount;
          }
        }
      } catch (err) {
        console.warn(`[TextCleanerEngine] Error executing rule ${rule.id} (${rule.patternStr}):`, err);
      }
    }

    // 2. Generic Structural Heuristic for Glued Table Headers ('ا')
    // e.g. "الرأياالحكماالتعليل" or words glued by 'ا' inside table context
    const gluedPattern = /([أ-ي]{3,})ا([أ-ي]{3,})ا([أ-ي]{3,})/g;
    cleaned = cleaned.replace(gluedPattern, (match, p1, p2, p3) => {
      if (/خطة|فهرس|موضوع|صفحة|دليل|رأي|حكم|تعليل|قسم|فترة|زمن/.test(match)) {
        tableHeadersFixed++;
        totalReplacements++;
        return `| ${p1} | ${p2} | ${p3} |`;
      }
      return match;
    });

    // 3. Tab-separated Table Row Structuring
    // If text contains tab characters separating 2 or more columns, transform them into standard Markdown table rows
    if (cleaned.includes('\t')) {
      const lines = cleaned.split('\n');
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
        cleaned = lines.join('\n');
        tableHeadersFixed += tabRowsConverted;
        totalReplacements += tabRowsConverted;
      }
    }

    const endTime = performance?.now ? performance.now() : Date.now();
    const executionTimeMs = Math.round(endTime - startTime);

    return {
      cleanedText: cleaned,
      totalReplacements,
      tableHeadersFixed,
      noisePurged,
      typosCorrected,
      appliedRuleIds,
      executionTimeMs,
    };
  }
}

export function cleanTextWithEngine(text: string, customRules?: CleanerRuleItem[]): CleanerAuditReport {
  const engine = new TextCleanerEngine(customRules);
  return engine.cleanText(text);
}
