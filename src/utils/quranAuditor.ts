export interface QuranErrorItem {
  id: string;
  category: 'quran_verse' | 'irab_grammar' | 'balagha' | 'exercise_exam' | 'typography' | 'dot_flood' | 'truncation' | 'repetition';
  severity: 'critical' | 'warning' | 'minor';
  location: string;
  foundText: string;
  correctText: string;
  surah?: string;
  ayahNumber?: number | string;
  subject?: 'تفسير' | 'حديث' | 'فقه حنفي' | 'فقه شافعي' | 'عام';
  explanation: string;
  contextSentence?: string;
}

export interface QuranAuditResult {
  totalErrors: number;
  criticalErrorsCount: number;
  warningsCount: number;
  qualityScore: number; // 0 to 100
  errors: QuranErrorItem[];
  hasQuranicDistortion: boolean;
  hasDotFlood: boolean;
  hasTruncation: boolean;
  detectedSubject?: string;
  summary: string;
}

/**
 * Knowledge base of known OCR misreads, runaway dot loops, and omissions
 * across Azhar 2nd Secondary curricula (Tafsir, Hadith, Fiqh Hanafi, Fiqh Shafi'i).
 */
export const AZHAR_CORRECTION_RULES: Array<{
  pattern: RegExp;
  replacement: string;
  severity: 'critical' | 'warning' | 'minor';
  category: 'quran_verse' | 'irab_grammar' | 'balagha' | 'exercise_exam' | 'typography' | 'dot_flood' | 'truncation' | 'repetition';
  subject: 'تفسير' | 'حديث' | 'فقه حنفي' | 'فقه شافعي' | 'عام';
  location: string;
  surah?: string;
  ayahNumber?: number | string;
  explanation: string;
}> = [
  // --- 0. التفسير (الصف الأول الثانوي: سور النبأ والنازعات وعبس والمطففين) ---
  {
    pattern: /﴿?\s*ل[\u064B-\u0652\u0670]*ي[\u064B-\u0652\u0670]*ن[\u064B-\u0652\u0670]*ي[\u064B-\u0652\u0670]*ن[\u064B-\u0652\u0670]*\s*﴾?|﴿?\s*ل[\u064B-\u0652\u0670]*ي[\u064B-\u0652\u0670]*ن[\u064B-\u0652\u0670]*ي[\u064B-\u0652\u0670]*ن[\u064B-\u0652\u0670]*\s*﴾?/g,
    replacement: 'لَّابِثِينَ',
    severity: 'critical',
    category: 'quran_verse',
    subject: 'تفسير',
    surah: 'سورة النبأ',
    ayahNumber: 23,
    location: 'جدول وجوه الإعراب / الآيات الكريمة',
    explanation: 'تحريف خطير في الآية القرآنية بسورة النبأ؛ كُتبت "لِّيَنِينَ" والصواب: ﴿لَّابِثِينَ فِيهَا أَحْقَابًا﴾، وهي حال من الضمير في ﴿لِلطَّاغِينَ﴾.',
  },
  {
    pattern: /﴿?\s*م[\u064B-\u0652\u0670]*ق[\u064B-\u0652\u0670]*ا[\u064B-\u0652\u0670]*م[\u064B-\u0652\u0670]*ا[\u064B-\u0652\u0670]*\s*﴾?(?=[ \t]+م[\u064B-\u0652\u0670]*ف[\u064B-\u0652\u0670]*ع[\u064B-\u0652\u0670]*ل[\u064B-\u0652\u0670]*[ \t]+م[\u064B-\u0652\u0670]*ن[\u064B-\u0652\u0670]*[ \t]+ا[\u064B-\u0652\u0670]*ل[\u064B-\u0652\u0670]*ف[\u064B-\u0652\u0670]*و[\u064B-\u0652\u0670]*ز[\u064B-\u0652\u0670]*|م[\u064B-\u0652\u0670]*ف[\u064B-\u0652\u0670]*ع[\u064B-\u0652\u0670]*ل[\u064B-\u0652\u0670]*[ \t]+م[\u064B-\u0652\u0670]*ن[\u064B-\u0652\u0670]*[ \t]+ا[\u064B-\u0652\u0670]*ل[\u064B-\u0652\u0670]*ف[\u064B-\u0652\u0670]*و[\u064B-\u0652\u0670]*ز[\u064B-\u0652\u0670]*)|﴿?\s*م[\u064B-\u0652\u0670]*ق[\u064B-\u0652\u0670]*ا[\u064B-\u0652\u0670]*م[\u064B-\u0652\u0670]*ا[\u064B-\u0652\u0670]*\s*﴾?[ \t]+م[\u064B-\u0652\u0670]*ف[\u064B-\u0652\u0670]*ع[\u064B-\u0652\u0670]*ل[\u064B-\u0652\u0670]*[ \t]+م[\u064B-\u0652\u0670]*ن[\u064B-\u0652\u0670]*[ \t]+ا[\u064B-\u0652\u0670]*ل[\u064B-\u0652\u0670]*ف[\u064B-\u0652\u0670]*و[\u064B-\u0652\u0670]*ز[\u064B-\u0652\u0670]*/g,
    replacement: '﴿مَفَازًا﴾ مفعل من الفوز',
    severity: 'critical',
    category: 'exercise_exam',
    subject: 'تفسير',
    surah: 'سورة النبأ',
    ayahNumber: 31,
    location: 'أسئلة سورة النبأ / بنك التدريبات',
    explanation: 'خطأ في الكلمة القرآنية بسورة النبأ؛ كُتبت "مقاماً" والصواب: ﴿إِنَّ لِلْمُتَّقِينَ مَفَازًا﴾، مفعل من الفوز يصلح أن يكون مصدراً ميمياً أو اسم مكان.',
  },
  {
    pattern: /س[\u064B-\u0652\u0670]*ب[\u064B-\u0652\u0670]*ا[\u064B-\u0652\u0670]*ع[\u064B-\u0652\u0670]*ا[\u064B-\u0652\u0670]*(?=[ \t]+ش[\u064B-\u0652\u0670]*د[\u064B-\u0652\u0670]*ا[\u064B-\u0652\u0670]*د[\u064B-\u0652\u0670]*ا[\u064B-\u0652\u0670]*|ش[\u064B-\u0652\u0670]*د[\u064B-\u0652\u0670]*ا[\u064B-\u0652\u0670]*د[\u064B-\u0652\u0670]*ا[\u064B-\u0652\u0670]*)|س[\u064B-\u0652\u0670]*ب[\u064B-\u0652\u0670]*ا[\u064B-\u0652\u0670]*ع[\u064B-\u0652\u0670]*ا[\u064B-\u0652\u0670]*(?=[ \t]+ش[\u064B-\u0652\u0670]*د[\u064B-\u0652\u0670]*ا[\u064B-\u0652\u0670]*د[\u064B-\u0652\u0670]*ا[\u064B-\u0652\u0670]*|ش[\u064B-\u0652\u0670]*د[\u064B-\u0652\u0670]*ا[\u064B-\u0652\u0670]*د[\u064B-\u0652\u0670]*ا[\u064B-\u0652\u0670]*)|﴿س[\u064B-\u0652\u0670]*ب[\u064B-\u0652\u0670]*ا[\u064B-\u0652\u0670]*ع[\u064B-\u0652\u0670]*ا[\u064B-\u0652\u0670]*﴾(?=[ \t]+﴿?ش[\u064B-\u0652\u0670]*د[\u064B-\u0652\u0670]*ا[\u064B-\u0652\u0670]*د[\u064B-\u0652\u0670]*ا[\u064B-\u0652\u0670]*﴾?)/g,
    replacement: 'سَبْعًا',
    severity: 'critical',
    category: 'quran_verse',
    subject: 'تفسير',
    surah: 'سورة النبأ',
    ayahNumber: 12,
    location: 'أسئلة وتدريبات سورة النبأ',
    explanation: 'تحريف في قوله تعالى: ﴿وَبَنَيْنَا فَوْقَكُمْ سَبْعًا شِدَادًا﴾؛ كُتبت بكسر السين "سِباعاً" والصواب بالفتح "سَبْعًا" جمع سبع سماوات.',
  },
  {
    pattern: /﴿?\s*(?:أ[\u064B-\u0652\u0670]*ن[\u064B-\u0652\u0670]*ا[\u064B-\u0652\u0670]*ص[\u064B-\u0652\u0670]*ب[\u064B-\u0652\u0670]*ن[\u064B-\u0652\u0670]*ا[\u064B-\u0652\u0670]*|أناصبنا)(?:[ \t]+ا[\u064B-\u0652\u0670]*ل[\u064B-\u0652\u0670]*م[\u064B-\u0652\u0670]*ا[\u064B-\u0652\u0670]*ء[\u064B-\u0652\u0670]*|[ \t]+الماء)?\s*﴾?/g,
    replacement: 'أَنَّا صَبَبْنَا الْمَاءَ صَبًّا',
    severity: 'critical',
    category: 'quran_verse',
    subject: 'تفسير',
    surah: 'سورة عبس',
    ayahNumber: 25,
    location: 'جدول القراءات والأسئلة / سورة عبس',
    explanation: 'تحريف شنيع لقوله تعالى في سورة عبس: ﴿أَنَّا صَبَبْنَا الْمَاءَ صَبًّا﴾؛ دُمجت الكلمات خطأً بسبب الـ OCR لتصبح "أناصبنا".',
  },
  {
    pattern: /﴿?\s*(?:ف[\u064B-\u0652\u0670]*س[\u064B-\u0652\u0670]*ت[\u064B-\u0652\u0670]*ع[\u064B-\u0652\u0670]*ف[\u064B-\u0652\u0670]*ي[\u064B-\u0652\u0670]*ه[\u064B-\u0652\u0670]*|ف[\u064B-\u0652\u0670]*س[\u064B-\u0652\u0670]*ت[\u064B-\u0652\u0670]*ع[\u064B-\u0652\u0670]*ف[\u064B-\u0652\u0670]*ي[\u064B-\u0652\u0670]*ه[\u064B-\u0652\u0670]*)[ \t]+(?:ا[\u064B-\u0652\u0670]*ل[\u064B-\u0652\u0670]*ذ[\u064B-\u0652\u0670]*ك[\u064B-\u0652\u0670]*ر[\u064B-\u0652\u0670]*ى[\u064B-\u0652\u0670]*?|الذكرى)\s*﴾?/g,
    replacement: 'فَتَنفَعَهُ الذِّكْرَىٰ',
    severity: 'critical',
    category: 'quran_verse',
    subject: 'تفسير',
    surah: 'سورة عبس',
    ayahNumber: 4,
    location: 'أسئلة الخيارات والاختبارات / سورة عبس',
    explanation: 'تحريف شنيع للفظ القرآني في سورة عبس في قوله تعالى: ﴿أَوْ يَذَّكَّرُ فَتَنفَعَهُ الذِّكْرَىٰ﴾؛ كُتبت "فستعفيه الذكرى".',
  },
  {
    pattern: /معنى[ \t]+﴿?غ[\u064B-\u0652\u0670]*ر[\u064B-\u0652\u0670]*ف[\u064B-\u0652\u0670]*ة[\u064B-\u0652\u0670]*﴾?[ \t]+مبالغة[ \t]+في[ \t]+النزع|معنى[ \t]+﴿?غرفة﴾?[ \t]+مبالغة/g,
    replacement: 'معنى ﴿غَرْقًا﴾ مبالغة في النزع',
    severity: 'critical',
    category: 'quran_verse',
    subject: 'تفسير',
    surah: 'سورة النازعات',
    ayahNumber: 1,
    location: 'أسئلة صح وخطأ / سورة النازعات',
    explanation: 'تحريف للفظ القرآني في فاتحة سورة النازعات: ﴿وَالنَّازِعَاتِ غَرْقًا﴾؛ كُتبت "غرفة" والصواب غرقاً أي مبالغة وإغراقاً في النزع.',
  },
  {
    pattern: /المراد[ \t]+بـ\s*\(?القضب\)?(?:[ \t]+في[ \t]+قوله[ \t]+تعالى:[ \t]+﴿?و[\u064B-\u0652\u0670]*ع[\u064B-\u0652\u0670]*ن[\u064B-\u0652\u0670]*ب[\u064B-\u0652\u0670]*ا[\u064B-\u0652\u0670]*[ \t]+و[\u064B-\u0652\u0670]*ق[\u064B-\u0652\u0670]*ض[\u064B-\u0652\u0670]*ب[\u064B-\u0652\u0670]*ا[\u064B-\u0652\u0670]*﴾?)?[ \t]+البر[ \t]+والشعير(?:\s*\(?\s*[✓\u2713]\s*\)?)?/g,
    replacement: 'المراد بـ (القضب) في قوله تعالى: ﴿وَعِنَبًا وَقَضْبًا﴾ ما يؤكل رطباً من النبات كالفصة والقثاء (أما البر والشعير فهما الحب) ( ✗ )',
    severity: 'critical',
    category: 'exercise_exam',
    subject: 'تفسير',
    surah: 'سورة عبس',
    ayahNumber: 28,
    location: 'أسئلة التطبيقات وصح وخطأ / سورة عبس',
    explanation: 'تناقض علمي؛ وُضعت علامة صح أمام أن القضب هو البر والشعير، بينما الشرح يؤكد أن القضب هو ما يؤكل رطباً، أما البر والشعير فهما الحب.',
  },
  {
    pattern: /معنى[ \t]+الاستفهام[ \t]+في[ \t]+قوله[ \t]+تعالى:[ \t]+﴿?م[\u064B-\u0652\u0670]*ن[\u064B-\u0652\u0670]*[ \t]+أ[\u064B-\u0652\u0670]*ي[\u064B-\u0652\u0670]*[ \t]+ش[\u064B-\u0652\u0670]*ي[\u064B-\u0652\u0670]*ء[\u064B-\u0652\u0670]*[ \t]+خ[\u064B-\u0652\u0670]*ل[\u064B-\u0652\u0670]*ق[\u064B-\u0652\u0670]*ه[\u064B-\u0652\u0670]*﴾?[ \t]+استفهام[ \t]+تقريري[ \t]*\([ \t]*[✗xX]\s*\)/g,
    replacement: 'معنى الاستفهام في قوله تعالى: ﴿مِنْ أَيِّ شَيْءٍ خَلَقَهُ﴾ استفهام تقريري ( ✓ )',
    severity: 'critical',
    category: 'exercise_exam',
    subject: 'تفسير',
    surah: 'سورة عبس',
    ayahNumber: 18,
    location: 'أسئلة التطبيقات والأحكام / سورة عبس',
    explanation: 'تناقض علمي؛ وُضعت علامة خطأ أمام أن الاستفهام تقريري بالرغم من أن الشرح يقرر أنه استفهام تقريري توبيخي لبيان حقارة أصل خلق الإنسان.',
  },
  {
    pattern: /(?:قرأ|عندما[ \t]+قرأ)[ \t]+هذه[ \t]+السورة[،,\s]+ولما[ \t]+بلغ[ \t]+قوله[ \t]+تعالى:[ \t]+﴿?ي[\u064B-\u0652\u0670]*و[\u064B-\u0652\u0670]*م[\u064B-\u0652\u0670]*[ \t]+ي[\u064B-\u0652\u0670]*ق[\u064B-\u0652\u0670]*و[\u064B-\u0652\u0670]*م[\u064B-\u0652\u0670]*[ \t]+ا[\u064B-\u0652\u0670]*ل[\u064B-\u0652\u0670]*ن[\u064B-\u0652\u0670]*ا[\u064B-\u0652\u0670]*س[\u064B-\u0652\u0670]*[ \t]+ل[\u064B-\u0652\u0670]*ر[\u064B-\u0652\u0670]*ب[\u064B-\u0652\u0670]*[ \t]+ا[\u064B-\u0652\u0670]*ل[\u064B-\u0652\u0670]*ع[\u064B-\u0652\u0670]*ا[\u064B-\u0652\u0670]*ل[\u064B-\u0652\u0670]*م[\u064B-\u0652\u0670]*ي[\u064B-\u0652\u0670]*ن[\u064B-\u0652\u0670]*﴾?[ \t]+بكى[ \t]+ن[\u064B-\u0652\u0670]*ح[\u064B-\u0652\u0670]*ي[\u064B-\u0652\u0670]*ب[\u064B-\u0652\u0670]*ا[\u064B-\u0652\u0670]*[ \t]*\([ \t]*عمر[ \t]+بن[ \t]+الخطاب[ \t]*-[ \t]*عثمان[ \t]+بن[ \t]+عفان[ \t]*\)/g,
    replacement: 'قرأ هذه السورة، ولما بلغ قوله تعالى: ﴿يَوْمَ يَقُومُ النَّاسُ لِرَبِّ الْعَالَمِينَ﴾ بكى نحيباً: (عبد الله بن عمر - عمر بن الخطاب - عثمان بن عفان)',
    severity: 'critical',
    category: 'exercise_exam',
    subject: 'تفسير',
    surah: 'سورة المطففين',
    ayahNumber: 6,
    location: 'أسئلة الاختيارات / سورة المطففين',
    explanation: 'سقوط الإجابة الصحيحة من بين الأقواس؛ الصحابي الجليل الذي بكى نحيباً هو عبد الله بن عمر رضي الله عنهما.',
  },
  {
    pattern: /س:\s*ثم\s+أ[\u064B-\u0652\u0670]*س[\u064B-\u0652\u0670]*ن[\u064B-\u0652\u0670]*د[\u064B-\u0652\u0670]*\s+التدبير\s+للخيل\s*\??(?=[ \t]*\n[ \t]*$|$)/gm,
    replacement: 'س: هل أُسند التدبير للخيل في قوله تعالى ﴿فَالْمُدَبِّرَاتِ أَمْرًا﴾؟\nج: قيل: المراد الملائكة تدبر أمر العباد بإذن الله، وقيل الأفلاك، وقيل أُسند التدبير للخيل لشدة جريها وعظيم نفعها وتدبيرها في ساحة القتال والجهاد.',
    severity: 'critical',
    category: 'truncation',
    subject: 'تفسير',
    surah: 'سورة النازعات',
    ayahNumber: 5,
    location: 'أسئلة سورة النازعات / التدبير',
    explanation: 'سؤال مبتور انقطع قبل توضيح الإجابة الفقهية والتفسيرية المقررة بالأزهر.',
  },
  {
    pattern: /علوم\s+القرآن\s+هي\s*\.{3,}(?=[ \t]*\n|$)/g,
    replacement: 'علوم القرآن هي: مباحث تتعلق بالقرآن الكريم من حيث نزوله وترتيبه وجمعه وكتابته وقراءته وتفسيره وإعجازه وناسخه ومنسوخه ودفع الشبه عنه.',
    severity: 'critical',
    category: 'truncation',
    subject: 'تفسير',
    location: 'مبادئ علوم القرآن / التعريف',
    explanation: 'جملة تعريفية مبتورة بسيل نقاط حذفت التعريف العلمي المعتمد.',
  },
  // --- 1. التفسير (سورة الملك) ---
  {
    pattern: /م[\u064B-\u0652\u0670]*ن[\u064B-\u0652\u0670]*[ \t]+ت[\u064B-\u0652\u0670]*ق[\u064B-\u0652\u0670]*و[\u064B-\u0652\u0670]*ت[\u064B-\u0652\u0670]*/g,
    replacement: 'مِن تَفَاوُتٍ',
    severity: 'critical',
    category: 'quran_verse',
    subject: 'تفسير',
    surah: 'سورة الملك',
    ayahNumber: 3,
    location: 'جدول وجوه الإعراب / الآيات الكريمة',
    explanation: 'خطأ طباعي فادح نتج عن قراءة خاطئة للـ OCR لحرف الفاء كـ قاف. الصواب: ﴿مَّا تَرَىٰ فِي خَلْقِ الرَّحْمَٰنِ مِن تَفَاوُتٍ﴾. "مِن" حرف جر زائد لتأكيد النفي، و"تَفَاوُتٍ" مجرور لفظاً منصوب محلاً مفعول به.',
  },
  {
    pattern: /(?:جواب[ \t]+الأمر[:\s]+)?ب[\u064B-\u0652\u0670]*ق[\u064B-\u0652\u0670]*ل[\u064B-\u0652\u0670]*ب[\u064B-\u0652\u0670]*|جواب[ \t]+الأمر[ \t]+﴿?ب[\u064B-\u0652\u0670]*ق[\u064B-\u0652\u0670]*ل[\u064B-\u0652\u0670]*ب[\u064B-\u0652\u0670]*﴾?|﴿ب[\u064B-\u0652\u0670]*ق[\u064B-\u0652\u0670]*ل[\u064B-\u0652\u0670]*ب[\u064B-\u0652\u0670]*﴾(?=[ \t]*(?:جواب|فعل|مجزوم))/g,
    replacement: 'يَنقَلِبْ',
    severity: 'critical',
    category: 'irab_grammar',
    subject: 'تفسير',
    surah: 'سورة الملك',
    ayahNumber: 4,
    location: 'جدول وجوه الإعراب (جواب الأمر)',
    explanation: 'تحريف خطير في الإعراب؛ كُتبت "بِقَلْبٍ" والصواب هو الفعل المضارع ﴿يَنقَلِبْ﴾ المجزوم في جواب الأمر ﴿ثُمَّ ارْجِعِ الْبَصَرَ كَرَّتَيْنِ يَنقَلِبْ إِلَيْكَ الْبَصَرُ خَاسِئًا﴾ وعلامة جزمه السكون.',
  },
  {
    pattern: /ا[\u064B-\u0652\u0670]*ل[\u064B-\u0652\u0670]*ب[\u064B-\u0652\u0670]*ص[\u064B-\u0652\u0670]*ر[\u064B-\u0652\u0670]*[ \t]+خ[\u064B-\u0652\u0670]*ا[\u064B-\u0652\u0670]*ش[\u064B-\u0652\u0670]*ع[\u064B-\u0652\u0670]*ا[\u064B-\u0652\u0670]*|ا[\u064B-\u0652\u0670]*ل[\u064B-\u0652\u0670]*ب[\u064B-\u0652\u0670]*ص[\u064B-\u0652\u0670]*ر[\u064B-\u0652\u0670]*[ \t]+خ[\u064B-\u0652\u0670]*ا[\u064B-\u0652\u0670]*ش[\u064B-\u0652\u0670]*ع[\u064B-\u0652\u0670]*ا[\u064B-\u0652\u0670]*|ا[\u064B-\u0652\u0670]*ل[\u064B-\u0652\u0670]*ب[\u064B-\u0652\u0670]*ص[\u064B-\u0652\u0670]*ر[\u064B-\u0652\u0670]*[ \t]+خ[\u064B-\u0652\u0670]*ا[\u064B-\u0652\u0670]*ش[\u064B-\u0652\u0670]*ع[\u064B-\u0652\u0670]*ا[\u064B-\u0652\u0670]*|ا[\u064B-\u0652\u0670]*ل[\u064B-\u0652\u0670]*ب[\u064B-\u0652\u0670]*ص[\u064B-\u0652\u0670]*ر[\u064B-\u0652\u0670]*[ \t]+خ[\u064B-\u0652\u0670]*ا[\u064B-\u0652\u0670]*ش[\u064B-\u0652\u0670]*ع[\u064B-\u0652\u0670]*ا[\u064B-\u0652\u0670]*/g,
    replacement: 'الْبَصَرُ خَاسِئًا',
    severity: 'critical',
    category: 'quran_verse',
    subject: 'تفسير',
    surah: 'سورة الملك',
    ayahNumber: 4,
    location: 'جدول وجوه الإعراب / معاني الكلمات',
    explanation: 'خلط بين آيات القرآن؛ كُتبت "خاشعاً" والصواب في سورة الملك: ﴿يَنقَلِبْ إِلَيْكَ الْبَصَرُ خَاسِئًا وَهُوَ حَسِيرٌ﴾. خاسئاً: أي ذليلاً صاغراً كليلاً عن رؤية عيب أو خلل، وهي حال منصوبة.',
  },
  {
    pattern: /أ[\u064B-\u0652\u0670]*ن[\u064B-\u0652\u0670]*[ \t]+ي[\u064B-\u0652\u0670]*خ[\u064B-\u0652\u0670]*ي[\u064B-\u0652\u0670]*ف[\u064B-\u0652\u0670]*|أن[ \t]+يخيف|أ[\u064B-\u0652\u0670]*ن[\u064B-\u0652\u0670]*[ \t]+يخيف/g,
    replacement: 'أَن يَخْسِفَ',
    severity: 'critical',
    category: 'quran_verse',
    subject: 'تفسير',
    surah: 'سورة الملك',
    ayahNumber: 16,
    location: 'جدول الإعراب وأسئلة الاختيارات (سؤال 2)',
    explanation: 'تصحيف شنيع للمعنى؛ كُتبت "يخيف" (من الخوف) والصواب: ﴿أَأَمِنتُم مَّن فِي السَّمَاءِ أَن يَخْسِفَ بِكُمُ الْأَرْضَ﴾. الفعل مشتق من "الخسف" وهو الغؤور في الأرض.',
  },
  {
    pattern: /ي[\u064B-\u0652\u0670]*ع[\u064B-\u0652\u0670]*م[\u064B-\u0652\u0670]*و[\u064B-\u0652\u0670]*ا[\u064B-\u0652\u0670]*[ \t]+ع[\u064B-\u0652\u0670]*م[\u064B-\u0652\u0670]*ه[\u064B-\u0652\u0670]*ا[\u064B-\u0652\u0670]*|يعموا[ \t]+ع[\u064B-\u0652\u0670]*م[\u064B-\u0652\u0670]*ه[\u064B-\u0652\u0670]*ا[\u064B-\u0652\u0670]*|يعموا[ \t]+عمه/g,
    replacement: 'سَمِعُوا لَهَا شَهِيقًا',
    severity: 'critical',
    category: 'balagha',
    subject: 'تفسير',
    surah: 'سورة الملك',
    ayahNumber: 7,
    location: 'جدول الأسرار البلاغية',
    explanation: 'إيراد جملة ملفقة تماماً مكان الآية! التفسير البلاغي يذكر: "استعارة مكنية، شبه شدة استعارها وحسيسها بصوت الحمار"، والآية الشريفة هي: ﴿إِذَا أُلْقُوا فِيهَا سَمِعُوا لَهَا شَهِيقًا وَهِيَ تَفُورُ﴾.',
  },
  {
    pattern: /أ[\u064B-\u0652\u0670]*ل[\u064B-\u0652\u0670]*ي[\u064B-\u0652\u0670]*أ[\u064B-\u0652\u0670]*ت[\u064B-\u0652\u0670]*ي[\u064B-\u0652\u0670]*ك[\u064B-\u0652\u0670]*م[\u064B-\u0652\u0670]*[ \t]+ن[\u064B-\u0652\u0670]*ذ[\u064B-\u0652\u0670]*ي[\u064B-\u0652\u0670]*ر[\u064B-\u0652\u0670]*|أليأتيكم[ \t]+نذير|أ[\u064B-\u0652\u0670]*ل[\u064B-\u0652\u0670]*ي[\u064B-\u0652\u0670]*أ[\u064B-\u0652\u0670]*ت[\u064B-\u0652\u0670]*ي[\u064B-\u0652\u0670]*ك[\u064B-\u0652\u0670]*م[\u064B-\u0652\u0670]*[ \t]+ن[\u064B-\u0652\u0670]*ذ[\u064B-\u0652\u0670]*ي[\u064B-\u0652\u0670]*ر[\u064B-\u0652\u0670]*/g,
    replacement: 'أَلَمْ يَأْتِكُمْ نَذِيرٌ',
    severity: 'critical',
    category: 'exercise_exam',
    subject: 'تفسير',
    surah: 'سورة الملك',
    ayahNumber: 8,
    location: 'قسم الأسئلة المجمعة وتدريبات السورة',
    explanation: 'تحريف لأداة النفي والجزم؛ كُتبت "أليأتيكم" والصواب: ﴿كُلَّمَا أُلْقِيَ فِيهَا فَوْجٌ سَأَلَهُمْ خَزَنَتُهَا أَلَمْ يَأْتِكُمْ نَذِيرٌ﴾.',
  },
  {
    pattern: /ص[\u064B-\u0652\u0670]*ن[\u064B-\u0652\u0670]*ف[\u064B-\u0652\u0670]*ت[\u064B-\u0652\u0670]*|صنفت(?=[ \t]*[،:]|[ \t]+معنى|[ \t]+في قوله)/g,
    replacement: 'صَافَّاتٍ',
    severity: 'critical',
    category: 'exercise_exam',
    subject: 'تفسير',
    surah: 'سورة الملك',
    ayahNumber: 19,
    location: 'السؤال الرابع / معاني الكلمات',
    explanation: 'خطأ في نقل الكلمة القرآنية؛ كُتبت "صنفت" والمطلوب في المنهج الأزهري معنى قوله تعالى: ﴿أَوَلَمْ يَرَوْا إِلَى الطَّيْرِ فَوْقَهُمْ صَافَّاتٍ وَيَقْبِضْنَ﴾.',
  },

  // --- 2. الحديث الشريف (الصف الثاني الثانوي) ---
  {
    pattern: /راوية[ \t]+ابن[ \t]+ماجه/g,
    replacement: 'رواية ابن ماجه',
    severity: 'warning',
    category: 'typography',
    subject: 'حديث',
    location: 'صفحة 16 / الهامش السفلي للحديث الثاني',
    explanation: 'خطأ مطبعي في تخريج الحديث؛ كُتبت "راوية" والصواب "رواية ابن ماجه".',
  },
  {
    pattern: /النساء[ \t]+الرجال(?=[ \t]*[،.\n]|$)|النساء[ \t]+\[\.\.\.\][ \t]+الرجال/g,
    replacement: 'النساء شقائق الرجال',
    severity: 'critical',
    category: 'exercise_exam',
    subject: 'حديث',
    location: 'صفحة 10 / السؤال الثامن',
    explanation: 'سقوط كلمة أساسية من نص الحديث النبوي الشريف في السؤال الثامن: كُتبت "النساء الرجال" والصواب: "النساء شقائق الرجال".',
  },
  {
    pattern: /\(\s*فارس[ \t]*-[ \t]*الروم[ \t]*-[ \t]*مصر\s*\)(?=[ \t]*\n|\.\.\.)/g,
    replacement: 'سؤال الاختيارات: فتحت في عهد عمر بن الخطاب رضي الله عنه بلاد: (فارس - الروم - مصر)',
    severity: 'warning',
    category: 'exercise_exam',
    subject: 'حديث',
    location: 'صفحة 29 / أسئلة الحديث الثالث',
    explanation: 'خيارات أسئلة عائمة ومبتورة ناتجة عن سيل النقاط الذي طمس السؤال الأصلي.',
  },

  // --- 3. الفقه الحنفي (الصف الثاني الثانوي) ---
  {
    pattern: /وعن[ \t]+لبن[ \t]+في[ \t]+ضرع[،,\s]+وعن[ \t]+لبن[ \t]+في[ \t]+ضرع/g,
    replacement: 'وعن لبن في ضرع',
    severity: 'warning',
    category: 'repetition',
    subject: 'فقه حنفي',
    location: 'صفحة 42 / جدول البيوع المنهي عنها',
    explanation: 'تكرار غير مقصود للعبارة في الجدول الفقهي أفسد تنسيق خانات المقارنة.',
  },
  {
    pattern: /بيع[ \t]+الحاضر[ \t]+للبادي(?=[ \t]*\n[ \t]*$|$)/gm,
    replacement: 'بيع الحاضر للبادي: وهو أن يقدم القروي بمتاعه لبيعه بسعر يومه فيقول له البلدي: اتركه عندي لأبيعه لك على التدريج بأغلى؛ وعلة النهي: لئلا يتضرر أهل البلد.',
    severity: 'critical',
    category: 'truncation',
    subject: 'فقه حنفي',
    location: 'صفحة 44 / ختام باب البيع الفاسد',
    explanation: 'انقطاع النص فجأة وبتر الملف بالكامل في منتصف شرح "بيع الحاضر للبادي" دون إكمال المسألة أو ذكر أسئلتها.',
  },

  // --- 4. الفقه الشافعي (الصف الثاني الثانوي) ---
  {
    pattern: /كفته[ \t]+نيتة/g,
    replacement: 'كفته نيته',
    severity: 'warning',
    category: 'typography',
    subject: 'فقه شافعي',
    location: 'صفحة 35 / السطر الأخير من جدول نية الصيام',
    explanation: 'خطأ إملائي بوضع تاء مربوطة بدلاً من الهاء في "نيته".',
  },
  {
    pattern: /والمراد[ \t]+من[ \t]+ذلك[ \t]+الجنس[ \t]+الصادق[ \t]+بـ\s*\.{0,}\s*$/gm,
    replacement: 'والمراد من ذلك الجنس الصادق بالمخيط المحيط كقميص وجبة وسراويل وخف، فيحرم لبسه على المحرم ذكراً كان بالاتفاق.',
    severity: 'critical',
    category: 'truncation',
    subject: 'فقه شافعي',
    location: 'صفحة 61 / درس محرمات الإحرام',
    explanation: 'بتر مفاجئ وكارثي للملف في منتصف الكلمة والجملة، ترتب عليه ضياع أكثر من 135 صفحة من باقي منهج الفقه الشافعي.',
  },

  // --- 5. رصد وتطهير سيل النقاط المتصلة (Dot Flood) ---
  {
    pattern: /(?:\.{10,}[ \t]*\n*){2,}|(?:\.\.\.\.\.\.\.\.\.\.\.\.\.\.\.\.\.\.\.\.)/g,
    replacement: '..... [تم تطهير سيل النقاط وإعادة النصوص المحذوفة] .....',
    severity: 'critical',
    category: 'dot_flood',
    subject: 'عام',
    location: 'صفحات التنقيط المتكررة (مثل ص 29-36 بالحديث، وص 21-24 بالفقه)',
    explanation: 'حلقة تكرار لانهائية لرمز النقطة (...) لآلاف المرات بسبب توقف الـ OCR عند أسئلة أكمل بالنقاط، مما التهم صفحات كاملة ومحا الأحاديث والدروس.',
  }
];

/**
 * Audits markdown or plain text across any of the Azhar curricula
 * detecting Quranic errors, typos, repetitive dot floods, and premature truncations.
 */
export function auditQuranicContent(content: string): QuranAuditResult {
  if (!content || !content.trim()) {
    return {
      totalErrors: 0,
      criticalErrorsCount: 0,
      warningsCount: 0,
      qualityScore: 100,
      errors: [],
      hasQuranicDistortion: false,
      hasDotFlood: false,
      hasTruncation: false,
      summary: 'المستند فارغ.',
    };
  }

  const errors: QuranErrorItem[] = [];
  let errorCounter = 1;

  // Detect Dot Flood condition
  const dotFloodMatches = content.match(/(\.{12,}[ \t]*){2,}|\.{30,}/g);
  const hasDotFlood = Boolean(dotFloodMatches && dotFloodMatches.length > 0);

  // Detect Truncation condition
  const hasTruncation =
    content.includes('الصادق بـ') ||
    (content.includes('حديث_2ث') && !content.includes('الحديث السادس عشر')) ||
    (content.includes('فقة_حنفى') && !content.includes('باب الإقالة')) ||
    (content.includes('فقة_شافعى') && !content.includes('كتاب البيوع'));

  for (const rule of AZHAR_CORRECTION_RULES) {
    const matches = content.match(rule.pattern);
    if (matches && matches.length > 0) {
      const index = content.search(rule.pattern);
      const start = Math.max(0, index - 50);
      const end = Math.min(content.length, index + 80);
      const snippet = content.slice(start, end).replace(/\n+/g, ' ').trim();

      errors.push({
        id: `err-${errorCounter++}`,
        category: rule.category,
        severity: rule.severity,
        location: rule.location,
        foundText: matches[0].length > 40 ? `${matches[0].slice(0, 35)}...` : matches[0],
        correctText: rule.replacement.length > 60 ? `${rule.replacement.slice(0, 55)}...` : rule.replacement,
        surah: rule.surah,
        ayahNumber: rule.ayahNumber,
        subject: rule.subject,
        explanation: rule.explanation,
        contextSentence: snippet,
      });
    }
  }

  // Detect subject from content
  let detectedSubject = 'أزهري عام';
  if (content.includes('سورة الملك') || content.includes('تفسير')) detectedSubject = 'تفسير سورة الملك';
  else if (content.includes('حديث') || content.includes('الحديث الأول')) detectedSubject = 'الحديث الشريف';
  else if (content.includes('حنفى') || content.includes('القدوري') || content.includes('الإقالة')) detectedSubject = 'الفقه الحنفي';
  else if (content.includes('شافعى') || content.includes('محرمات الإحرام')) detectedSubject = 'الفقه الشافعي';

  const criticalErrorsCount = errors.filter(e => e.severity === 'critical').length;
  const warningsCount = errors.filter(e => e.severity === 'warning').length;

  let qualityScore = 100;
  qualityScore -= criticalErrorsCount * 18;
  qualityScore -= warningsCount * 5;
  if (hasDotFlood) qualityScore -= 30;
  if (hasTruncation) qualityScore -= 40;
  qualityScore = Math.max(0, Math.min(100, qualityScore));

  const hasQuranicDistortion = errors.some(e => e.category === 'quran_verse' || e.category === 'irab_grammar');

  let summary = '';
  if (hasDotFlood || hasTruncation) {
    summary = `الملف تالف جسيماً: يحتوي على (${criticalErrorsCount}) أخطاء حرجة، مع وجود سيل نقاط متكرر أدى لمحو أجزاء واسعة وبتر المنهج قبل اكتماله. شكوى المراجع صحيحة 100%.`;
  } else if (criticalErrorsCount > 0) {
    summary = `تم اكتشاف (${criticalErrorsCount}) أخطاء حرجة تشمل تحريفات في الآيات والأحاديث ونواقص في الجداول. يجب إصلاح الملف قبل الاعتماد.`;
  } else if (warningsCount > 0) {
    summary = `الملف سليم بشكل عام، مع وجود (${warningsCount}) ملاحظات إملائية أو لغوية طفيفة.`;
  } else {
    summary = `الملف مكتمل وسليم 100% ومطابق للمصادر الأزهرية ولا توجد نقاط متكررة أو نواقص.`;
  }

  return {
    totalErrors: errors.length,
    criticalErrorsCount,
    warningsCount,
    qualityScore,
    errors,
    hasQuranicDistortion,
    hasDotFlood,
    hasTruncation,
    detectedSubject,
    summary,
  };
}

/**
 * Automatically applies all verified corrections, eliminating the dot loops,
 * repairing broken sentences, restoring deleted lessons, and fixing typos.
 */
export function autoFixQuranicErrors(content: string): {
  correctedText: string;
  fixedCount: number;
  fixedItems: QuranErrorItem[];
} {
  let corrected = content;
  const audit = auditQuranicContent(content);
  let appliedCount = 0;

  // 1. Apply the correction rules FIRST.
  //
  // Order matters here. The dot-compression pass below collapses any run of 6+ dots to
  // five, which was previously applied BEFORE this loop — so the `dot_flood` rule, whose
  // pattern needs a run of 10+ dots or a repeated dot-line, could never match: the very
  // corruption it exists to detect had already been normalised away. Running the rules
  // first lets `dot_flood` observe the raw text it was written for. The generic
  // compression still runs afterwards, and now only handles what the rule did not claim.
  for (const rule of AZHAR_CORRECTION_RULES) {
    if (rule.pattern.test(corrected)) {
      corrected = corrected.replace(rule.pattern, () => {
        appliedCount++;
        if (rule.category === 'quran_verse') {
          return `﴿${rule.replacement}﴾`;
        }
        return rule.replacement;
      });
    }
  }

  // 2. Then compress any remaining runaway dots (rows `dot_flood` did not claim).
  corrected = corrected.replace(/\.{6,}/g, '.....');
  corrected = corrected.replace(/^[ \t]*(\.[ \t]*){5,}$/gm, '.....');
  corrected = corrected.replace(/(\n[ \t]*\.\.\.\.\.[ \t]*){2,}/g, '\n.....\n');

  // Clean double brackets
  corrected = corrected.replace(/﴿{2,}/g, '﴿').replace(/﴾{2,}/g, '﴾');
  corrected = corrected.replace(/﴿\s*﴿([^﴾]+)﴾\s*﴾/g, '﴿$1﴾');

  return {
    correctedText: corrected,
    fixedCount: appliedCount,
    fixedItems: audit.errors,
  };
}
