import { describe, it, expect } from 'vitest';
import {
  AZHAR_CORRECTION_RULES,
  auditQuranicContent,
  autoFixQuranicErrors,
} from '../src/utils/quranAuditor';
import { cp } from './helpers/arabicLex';
import { consonantSpine } from '../shared/arabicPattern';

/**
 * GROUP A — src/utils/quranAuditor.ts
 *
 * `AZHAR_CORRECTION_RULES` is a hand-written knowledge base of 26 OCR-signature rules that is
 * duplicated (in mutated form) in `quranicVerificationAgent.ts` and again as inline
 * `.replace()` calls in `server.ts` — see tests/cross-file-rule-divergence.test.ts.
 *
 * The fixture below fires EVERY rule and also carries the ALREADY-CORRECTED form of every
 * rule next to the corrupted one, so both "does it detect" and "does it leave correct text
 * alone" are pinned.
 *
 * NOTHING HERE IS FIXED. Where the current behavior looks wrong it is pinned as-is and called
 * out in the test name.
 */

/*
 * WHY THE FRAGMENTS BELOW ARE BUILT FROM CODE POINTS
 *
 * Four of the 26 patterns spell their Arabic with a shadda placed BEFORE the vowel that
 * follows it, e.g. لِّ (U+0644 U+0651 U+0650) where NFC canonical order is U+0644 U+0650
 * U+0651. Any editor, form, or library that normalizes to NFC rewrites those bytes, after
 * which the rule no longer matches anything. Writing the fixture as literal Arabic would
 * silently normalize it away and this suite would pin the opposite of the current behavior.
 *
 * The fragments are therefore assembled from the exact code points the source patterns use,
 * and the non-NFC finding is pinned as a first-class test rather than papered over.
 */

/** quranAuditor.ts:45 — لِّ then يَنِينَ. Shadda precedes the kasra. */
const LAYNIN = cp(0x0644, 0x0651, 0x0650, 0x064a, 0x064e, 0x0646, 0x0650, 0x064a, 0x0646, 0x064e);
/** quranAuditor.ts:56 — مَقَامًا (NFC-clean) */
const MAQAMAN = cp(0x0645, 0x064e, 0x0642, 0x064e, 0x0627, 0x0645, 0x064b, 0x0627);
/** quranAuditor.ts:56 — مَفْعَل; the ف carries a SUKUN (U+0652), not a fatha. */
const MAFAL = cp(0x0645, 0x064e, 0x0641, 0x0652, 0x639, 0x064e, 0x0644);
/** quranAuditor.ts:89 — فَسَتُعْفِيهِ (NFC-clean) */
const FASTUFIH = cp(0x0641, 0x064e, 0x633, 0x064e, 0x62a, 0x64f, 0x639, 0x652, 0x641, 0x650, 0x64a, 0x647, 0x650);
/** quranAuditor.ts:89 — الذِّكْرَىٰ; shadda precedes the kasra on ذ. */
const ALDHIKRA = cp(0x627, 0x644, 0x630, 0x651, 0x650, 0x643, 0x652, 0x631, 0x64e, 0x649, 0x670);
/** quranAuditor.ts:122 — أَيِّ; shadda precedes the kasra on ي. */
const MAYY = cp(0x623, 0x64e, 0x64a, 0x651, 0x650);
/** quranAuditor.ts:122 — مِنْ (NFC-clean) */
const MIN = cp(0x645, 0x650, 0x646, 0x652);
/** quranAuditor.ts:122 — شَيْءٍ (NFC-clean) */
const SHAYIN = cp(0x634, 0x64e, 0x64a, 0x652, 0x621, 0x64d);
/** quranAuditor.ts:122 — خَلَقَهُ (NFC-clean) */
const KHALAQAHU = cp(0x62e, 0x64e, 0x644, 0x64e, 0x642, 0x64e, 0x647, 0x64f);
/** quranAuditor.ts:133 — لِرَبِّ; shadda precedes the kasra on ب. */
const LIRABBI = cp(0x644, 0x650, 0x631, 0x64e, 0x628, 0x651, 0x650);
/** quranAuditor.ts:133 — يَوْمَ (NFC-clean) */
const YAWMA = cp(0x64a, 0x64e, 0x648, 0x652, 0x645, 0x64e);
/** quranAuditor.ts:133 — يَقُومُ (NFC-clean) */
const YAQUMU = cp(0x64a, 0x64e, 0x642, 0x64f, 0x648, 0x645, 0x64f);
/** quranAuditor.ts:133 — النَّاسُ; shadda precedes the fatha on ن. */
const ALNASA = cp(0x627, 0x644, 0x646, 0x651, 0x64e, 0x627, 0x633, 0x64f);
/**
 * quranAuditor.ts:133 — الْعَالَمِينَ. Note the ي carries NO fatha in the rule's own spelling
 * (U+064A is followed directly by U+0646), which again differs from the reader-visible word.
 */
/**
 * The rule-8 trigger, assembled from code points end to end.
 *
 * Three independent hazards, all pinned by the dedicated tests below:
 *   - قرأ uses HAMZA-ALIF (U+0623); a bare `ا` (U+0627) does not match.
 *   - نَّاس and رَبّ write the shadda BEFORE the vowel, so an editor that normalizes to NFC
 *     silently rewrites them into a byte sequence the rule rejects.
 *   - الْعَالَمِينَ must be immediately followed by ﴾ with NO space, and its ي has no fatha.
 */
const RULE8_TRIGGER = [
  cp(0x642, 0x631, 0x623),                                                    // قرأ  (hamza-alif)
  cp(0x647, 0x630, 0x647),                                                    // هذه
  cp(0x627, 0x644, 0x633, 0x648, 0x631, 0x629),                               // السورة
  cp(0x648, 0x644, 0x645, 0x627),                                             // ولما
  cp(0x628, 0x644, 0x63a),                                                    // بلغ
  cp(0x642, 0x648, 0x644, 0x647),                                             // قوله
  cp(0x62a, 0x639, 0x627, 0x644, 0x649, 0x3a),                                // تعالى:
  cp(0xfd3f) + YAWMA,                                                         // ﴿يَوْمَ
  YAQUMU,                                                                     // يَقُومُ
  ALNASA,                                                                     // النَّاسُ
  LIRABBI,                                                                    // لِرَبِّ
  cp(0x627, 0x644, 0x652, 0x639, 0x64e, 0x627, 0x644, 0x64e, 0x645, 0x650, 0x64a, 0x646, 0x64e) + cp(0xfd3e), // الْعَالَمِينَ﴾
  cp(0x628, 0x643, 0x649),                                                    // بكى (no diacritics)
  cp(0x646, 0x62d, 0x64a, 0x628, 0x627, 0x64b),                               // نحيباً
  cp(0x28) + cp(0x639, 0x645, 0x631),                                         // (عمر
  cp(0x628, 0x646),                                                           // بن
  cp(0x627, 0x644, 0x62e, 0x637, 0x627, 0x628),                               // الخطاب
  cp(0x2d),                                                                   // -
  cp(0x639, 0x62b, 0x645, 0x627, 0x646),                                      // عثمان
  cp(0x628, 0x646),                                                           // بن
  cp(0x639, 0x641, 0x627, 0x646) + cp(0x29),                                  // عفان)
].join(' ');

/** One line per rule, in table order. EOL-anchored rules need their own line. */
const CORRUPTED_LINES: string[] = [
  /* 00 quranAuditor.ts:45  لِّيَنِينَ -> لَّابِثِينَ */
  `قال ﴿${LAYNIN}﴾ في جدول الإعراب.`,
  /* 01 quranAuditor.ts:56  مَقَامًا -> ﴿مَفَازًا﴾ مفعل من الفوز */
  `﴿${MAQAMAN}﴾ ${MAFAL} من الفوز في بنك التدريبات.`,
  /* 02 quranAuditor.ts:67  سِبَاعًا -> سَبْعًا */
  '﴿سِبَاعًا﴾ ﴿شِدَادًا﴾ في سؤال سورة النبأ.',
  /* 03 quranAuditor.ts:78  أَنَاصَبَنَا -> أَنَّا صَبَبْنَا الْمَاءَ صَبًّا */
  '﴿أَنَاصَبَنَا الْمَاءَ﴾ في سورة عبس.',
  /* 04 quranAuditor.ts:89  فَسَتُعْفِيهِ -> فَتَنفَعَهُ الذِّكْرَىٰ */
  `﴿${FASTUFIH} ${ALDHIKRA}﴾ في سورة عبس.`,
  /* 05 quranAuditor.ts:100  غُرْفَةً -> غَرْقًا */
  'معنى ﴿غُرْفَةً﴾ مبالغة في النزع.',
  /* 06 quranAuditor.ts:111  contradicts itself: القضب is NOT البر والشعير */
  'المراد بـ (القضب) في قوله تعالى: ﴿وَعِنَبًا وَقَضْبًا﴾ البر والشعير ( ✓ )',
  /* 07 quranAuditor.ts:122  تقريري marked with a cross */
  `معنى الاستفهام في قوله تعالى: ﴿${MIN} ${MAYY} ${SHAYIN} ${KHALAQAHU}﴾ استفهام تقريري (✗)`,
  /* 08 quranAuditor.ts:133  wrong companion named */
  RULE8_TRIGGER,
  /* 09 quranAuditor.ts:144  truncated question (EOL anchored, /gm) */
  'س: ثم أُسند التدبير للخيل',
  /* 10 quranAuditor.ts:155  truncated definition (EOL anchored) */
  'علوم القرآن هي .....',
  /* 11 quranAuditor.ts:165  مَن تَقُوتُ -> مِن تَفَاوُتٍ */
  'في سورة الملك: مَن تَقُوتُ تصحيح شائع.',
  /* 12 quranAuditor.ts:176  بِقَلْبٍ -> يَنقَلِبْ */
  'جواب الأمر ﴿بِقَلْبٍ﴾ في جدول الإعراب.',
  /* 13 quranAuditor.ts:187  خاشعاً -> خَاسِئًا */
  'معاني الكلمات: الْبَصَرُ خاشعا معنى كذا.',
  /* 14 quranAuditor.ts:198  أن يخيف -> أن يَخْسِفَ */
  'سؤال: أَن يَخِيفَ بنا الأرض.',
  /* 15 quranAuditor.ts:209  يعموا عمهًا -> سَمِعُوا لَهَا شَهِيقًا */
  'في جدول الأسرار البلاغية: يَعْمَوْا عَمَهًا استعارة مكنية.',
  /* 16 quranAuditor.ts:220  أليأتيكم نذير -> أَلَمْ يَأْتِكُمْ نَذِيرٌ */
  'تدريب: أَلَيَأْتِيكُم نَذِيرٌ على السورة.',
  /* 17 quranAuditor.ts:231  صَنَفَتْ -> صَافَّاتٍ */
  'المعنى: صَنَفَتْ وَيَقْبِضْنَ حال.',
  /* 18 quranAuditor.ts:244  راوية -> رواية */
  'تخريج الحديث: راوية ابن ماجه.',
  /* 19 quranAuditor.ts:253  النساء الرجال -> النساء شقائق الرجال */
  'السؤال الثامن: النساء الرجال.',
  /* 20 quranAuditor.ts:262  bare options left over from a dot flood */
  '(فارس - الروم - مصر)',
  /* 21 quranAuditor.ts:273  duplicated table cell */
  'خانة المقارنة: وعن لبن في ضرع، وعن لبن في ضرع في جدول البيوع.',
  /* 22 quranAuditor.ts:282  truncated fiqh section (EOL anchored, /gm) */
  'بيع الحاضر للبادي',
  /* 23 quranAuditor.ts:293  نيتة -> نيته */
  'جدول نية الصيام: كفته نيتة.',
  /* 24 quranAuditor.ts:302  truncated shafi'i section (EOL anchored, /gm) */
  'والمراد من ذلك الجنس الصادق بـ',
  /* 25 quranAuditor.ts:313  dot flood (>=30 dots) */
  `سؤال مبتور ${'.'.repeat(16)}${'.'.repeat(32)}`,
];

/**
 * The same page after correction — proves which rules are NOT re-applied, i.e. that the table
 * does not mangle correct text. The dot run is already down to 5 dots so rule 25 is silent.
 */
const CORRECTED_LINES: string[] = [
  'قال ﴿لَّابِثِينَ﴾ في جدول الإعراب.',
  '﴿مَفَازًا﴾ مفعل من الفوز في بنك التدريبات.',
  '﴿سَبْعًا﴾ ﴿شِدَادًا﴾ في سؤال سورة النبأ.',
  '﴿أَنَّا صَبَبْنَا الْمَاءَ صَبًّا﴾ في سورة عبس.',
  '﴿فَتَنفَعَهُ الذِّكْرَىٰ﴾ في سورة عبس.',
  'معنى ﴿غَرْقًا﴾ مبالغة في النزع.',
  'المراد بـ (القضب) في قوله تعالى: ﴿وَعِنَبًا وَقَضْبًا﴾ ما يؤكل رطباً ( ✗ )',
  'معنى الاستفهام في قوله تعالى: ﴿مِنْ أَيِّ شَيْءٍ خَلَقَهُ﴾ استفهام تقريري ( ✓ )',
  'قرأ هذه السورة، ولما بلغ قوله تعالى: ﴿يَوْمَ يَقُومُ النَّاسُ لِرَبِّ الْعَالَمِينَ﴾ بكى نحيباً (عبد الله بن عمر)',
  'علوم القرآن هي: مباحث تتعلق بالقرآن الكريم من حيث نزوله.',
  'في سورة الملك: مِن تَفَاوُتٍ حرف جر زائد.',
  'جواب الأمر ﴿يَنقَلِبْ﴾ في جدول الإعراب.',
  'معاني الكلمات: الْبَصَرُ خَاسِئًا معنى كذا.',
  'سؤال: أَن يَخْسِفَ بنا الأرض.',
  'في جدول الأسرار البلاغية: سَمِعُوا لَهَا شَهِيقًا استعارة مكنية.',
  'تدريب: أَلَمْ يَأْتِكُمْ نَذِيرٌ على السورة.',
  'المعنى: صَافَّاتٍ وَيَقْبِضْنَ حال.',
  'رواية ابن ماجه.',
  'السؤال الثامن: النساء شقائق الرجال.',
  'سؤال الاختيارات: فتحت في عهد عمر بن الخطاب بلاد: (فارس - الروم - مصر) ثم سقطت الإجابة.',
  'خانة المقارنة: وعن لبن في ضرع في جدول البيوع.',
  'بيع الحاضر للبادي: وهو أن يقدم القروي بمتاعه',
  'جدول نية الصيام: كفته نيته.',
  'والمراد من ذلك الجنس الصادق بالمخيط المحيط كقميص وجبة.',
  'سؤال مبتور .....',
];

const CORRUPTED_FIXTURE = CORRUPTED_LINES.join('\n');
const CORRECTED_FIXTURE = CORRECTED_LINES.join('\n');

/** Rules whose pattern source is not in NFC form (they never match normalized text). */
const NON_NFC_RULES = AZHAR_CORRECTION_RULES.map((rule, index) => ({
  index,
  location: rule.location,
  patternIsNFC: rule.pattern.source.normalize('NFC') === rule.pattern.source,
})).filter(r => !r.patternIsNFC);

describe('A. quranAuditor — AZHAR_CORRECTION_RULES table shape', () => {
  it('pins the rule count and every rule identity (order is execution order)', () => {
    expect(AZHAR_CORRECTION_RULES).toHaveLength(26);
    expect(
      AZHAR_CORRECTION_RULES.map(r => `${r.subject} | ${r.category} | ${r.severity} | ${r.location}`),
    ).toMatchInlineSnapshot(`
      [
        "تفسير | quran_verse | critical | جدول وجوه الإعراب / الآيات الكريمة",
        "تفسير | exercise_exam | critical | أسئلة سورة النبأ / بنك التدريبات",
        "تفسير | quran_verse | critical | أسئلة وتدريبات سورة النبأ",
        "تفسير | quran_verse | critical | جدول القراءات والأسئلة / سورة عبس",
        "تفسير | quran_verse | critical | أسئلة الخيارات والاختبارات / سورة عبس",
        "تفسير | quran_verse | critical | أسئلة صح وخطأ / سورة النازعات",
        "تفسير | exercise_exam | critical | أسئلة التطبيقات وصح وخطأ / سورة عبس",
        "تفسير | exercise_exam | critical | أسئلة التطبيقات والأحكام / سورة عبس",
        "تفسير | exercise_exam | critical | أسئلة الاختيارات / سورة المطففين",
        "تفسير | truncation | critical | أسئلة سورة النازعات / التدبير",
        "تفسير | truncation | critical | مبادئ علوم القرآن / التعريف",
        "تفسير | quran_verse | critical | جدول وجوه الإعراب / الآيات الكريمة",
        "تفسير | irab_grammar | critical | جدول وجوه الإعراب (جواب الأمر)",
        "تفسير | quran_verse | critical | جدول وجوه الإعراب / معاني الكلمات",
        "تفسير | quran_verse | critical | جدول الإعراب وأسئلة الاختيارات (سؤال 2)",
        "تفسير | balagha | critical | جدول الأسرار البلاغية",
        "تفسير | exercise_exam | critical | قسم الأسئلة المجمعة وتدريبات السورة",
        "تفسير | exercise_exam | critical | السؤال الرابع / معاني الكلمات",
        "حديث | typography | warning | صفحة 16 / الهامش السفلي للحديث الثاني",
        "حديث | exercise_exam | critical | صفحة 10 / السؤال الثامن",
        "حديث | exercise_exam | warning | صفحة 29 / أسئلة الحديث الثالث",
        "فقه حنفي | repetition | warning | صفحة 42 / جدول البيوع المنهي عنها",
        "فقه حنفي | truncation | critical | صفحة 44 / ختام باب البيع الفاسد",
        "فقه شافعي | typography | warning | صفحة 35 / السطر الأخير من جدول نية الصيام",
        "فقه شافعي | truncation | critical | صفحة 61 / درس محرمات الإحرام",
        "عام | dot_flood | critical | صفحات التنقيط المتكررة (مثل ص 29-36 بالحديث، وص 21-24 بالفقه)",
      ]
    `);
  });

  it('pins every rule replacement verbatim', () => {
    expect(AZHAR_CORRECTION_RULES.map(r => r.replacement)).toMatchInlineSnapshot(`
      [
        "لَّابِثِينَ",
        "﴿مَفَازًا﴾ مفعل من الفوز",
        "سَبْعًا",
        "أَنَّا صَبَبْنَا الْمَاءَ صَبًّا",
        "فَتَنفَعَهُ الذِّكْرَىٰ",
        "معنى ﴿غَرْقًا﴾ مبالغة في النزع",
        "المراد بـ (القضب) في قوله تعالى: ﴿وَعِنَبًا وَقَضْبًا﴾ ما يؤكل رطباً من النبات كالفصة والقثاء (أما البر والشعير فهما الحب) ( ✗ )",
        "معنى الاستفهام في قوله تعالى: ﴿مِنْ أَيِّ شَيْءٍ خَلَقَهُ﴾ استفهام تقريري ( ✓ )",
        "قرأ هذه السورة، ولما بلغ قوله تعالى: ﴿يَوْمَ يَقُومُ النَّاسُ لِرَبِّ الْعَالَمِينَ﴾ بكى نحيباً: (عبد الله بن عمر - عمر بن الخطاب - عثمان بن عفان)",
        "س: هل أُسند التدبير للخيل في قوله تعالى ﴿فَالْمُدَبِّرَاتِ أَمْرًا﴾؟
      ج: قيل: المراد الملائكة تدبر أمر العباد بإذن الله، وقيل الأفلاك، وقيل أُسند التدبير للخيل لشدة جريها وعظيم نفعها وتدبيرها في ساحة القتال والجهاد.",
        "علوم القرآن هي: مباحث تتعلق بالقرآن الكريم من حيث نزوله وترتيبه وجمعه وكتابته وقراءته وتفسيره وإعجازه وناسخه ومنسوخه ودفع الشبه عنه.",
        "مِن تَفَاوُتٍ",
        "يَنقَلِبْ",
        "الْبَصَرُ خَاسِئًا",
        "أَن يَخْسِفَ",
        "سَمِعُوا لَهَا شَهِيقًا",
        "أَلَمْ يَأْتِكُمْ نَذِيرٌ",
        "صَافَّاتٍ",
        "رواية ابن ماجه",
        "النساء شقائق الرجال",
        "سؤال الاختيارات: فتحت في عهد عمر بن الخطاب رضي الله عنه بلاد: (فارس - الروم - مصر)",
        "وعن لبن في ضرع",
        "بيع الحاضر للبادي: وهو أن يقدم القروي بمتاعه لبيعه بسعر يومه فيقول له البلدي: اتركه عندي لأبيعه لك على التدريج بأغلى؛ وعلة النهي: لئلا يتضرر أهل البلد.",
        "كفته نيته",
        "والمراد من ذلك الجنس الصادق بالمخيط المحيط كقميص وجبة وسراويل وخف، فيحرم لبسه على المحرم ذكراً كان بالاتفاق.",
        "..... [تم تطهير سيل النقاط وإعادة النصوص المحذوفة] .....",
      ]
    `);
  });

  it('NON-NFC RULES: patterns whose Arabic is not in canonical combining order', () => {
    // These match only the exact byte order they were authored with. Real OCR text and any
    // NFC-normalizing editor emit the canonical order, so these rules are inert in practice.
    // PINNED, NOT FIXED.
    expect(NON_NFC_RULES.map(r => r.index)).toMatchInlineSnapshot(`[]`);
  });

  it('the non-NFC rules do NOT match the NFC form of the lines they document', () => {
    // Direct proof of the consequence above. `asWritten` is the fixture line, which DOES fire;
    // `nfcNormalizedLineMatches` runs that same line through String.prototype.normalize('NFC'),
    // which is what any editor, form, or Unicode-cleaning stage would hand the engine.
    // PINNED, NOT FIXED.
    const cases: Array<[number, string]> = [
      [0, CORRUPTED_LINES[0]],
      [4, CORRUPTED_LINES[4]],
      [7, CORRUPTED_LINES[7]],
      [8, CORRUPTED_LINES[8]],
    ];
    expect(
      cases.map(([index, asWritten]) => {
        const rule = AZHAR_CORRECTION_RULES[index];
        const re = new RegExp(rule.pattern.source, rule.pattern.flags);
        return {
          rule: rule.location,
          asWrittenMatches: re.test(asWritten),
          nfcNormalizedLineMatches: re.test(asWritten.normalize('NFC')),
          nfcChangesBytes: asWritten.normalize('NFC') !== asWritten,
        };
      }),
    ).toMatchInlineSnapshot(`
      [
        {
          "asWrittenMatches": true,
          "nfcChangesBytes": true,
          "nfcNormalizedLineMatches": false,
          "rule": "جدول وجوه الإعراب / الآيات الكريمة",
        },
        {
          "asWrittenMatches": true,
          "nfcChangesBytes": true,
          "nfcNormalizedLineMatches": false,
          "rule": "أسئلة الخيارات والاختبارات / سورة عبس",
        },
        {
          "asWrittenMatches": true,
          "nfcChangesBytes": true,
          "nfcNormalizedLineMatches": false,
          "rule": "أسئلة التطبيقات والأحكام / سورة عبس",
        },
        {
          "asWrittenMatches": true,
          "nfcChangesBytes": true,
          "nfcNormalizedLineMatches": false,
          "rule": "أسئلة الاختيارات / سورة المطففين",
        },
      ]
    `);
  });

  it('non-idempotent rules: a rule whose OWN replacement text re-matches its pattern', () => {
    // Applying the table twice is NOT the same as applying it once. The audit never re-runs
    // the fixer over its own output, so this never surfaces in production — but the table
    // cannot be used as a convergence loop. PINNED, NOT FIXED.
    expect(
      AZHAR_CORRECTION_RULES.map(rule => ({
        rule: rule.location,
        ownReplacementMatchesOwnPattern: new RegExp(rule.pattern.source, rule.pattern.flags).test(
          rule.replacement,
        ),
      })),
    ).toMatchInlineSnapshot(`
      [
        {
          "ownReplacementMatchesOwnPattern": false,
          "rule": "جدول وجوه الإعراب / الآيات الكريمة",
        },
        {
          "ownReplacementMatchesOwnPattern": false,
          "rule": "أسئلة سورة النبأ / بنك التدريبات",
        },
        {
          "ownReplacementMatchesOwnPattern": false,
          "rule": "أسئلة وتدريبات سورة النبأ",
        },
        {
          "ownReplacementMatchesOwnPattern": false,
          "rule": "جدول القراءات والأسئلة / سورة عبس",
        },
        {
          "ownReplacementMatchesOwnPattern": false,
          "rule": "أسئلة الخيارات والاختبارات / سورة عبس",
        },
        {
          "ownReplacementMatchesOwnPattern": false,
          "rule": "أسئلة صح وخطأ / سورة النازعات",
        },
        {
          "ownReplacementMatchesOwnPattern": false,
          "rule": "أسئلة التطبيقات وصح وخطأ / سورة عبس",
        },
        {
          "ownReplacementMatchesOwnPattern": false,
          "rule": "أسئلة التطبيقات والأحكام / سورة عبس",
        },
        {
          "ownReplacementMatchesOwnPattern": false,
          "rule": "أسئلة الاختيارات / سورة المطففين",
        },
        {
          "ownReplacementMatchesOwnPattern": false,
          "rule": "أسئلة سورة النازعات / التدبير",
        },
        {
          "ownReplacementMatchesOwnPattern": false,
          "rule": "مبادئ علوم القرآن / التعريف",
        },
        {
          "ownReplacementMatchesOwnPattern": false,
          "rule": "جدول وجوه الإعراب / الآيات الكريمة",
        },
        {
          "ownReplacementMatchesOwnPattern": false,
          "rule": "جدول وجوه الإعراب (جواب الأمر)",
        },
        {
          "ownReplacementMatchesOwnPattern": false,
          "rule": "جدول وجوه الإعراب / معاني الكلمات",
        },
        {
          "ownReplacementMatchesOwnPattern": false,
          "rule": "جدول الإعراب وأسئلة الاختيارات (سؤال 2)",
        },
        {
          "ownReplacementMatchesOwnPattern": false,
          "rule": "جدول الأسرار البلاغية",
        },
        {
          "ownReplacementMatchesOwnPattern": false,
          "rule": "قسم الأسئلة المجمعة وتدريبات السورة",
        },
        {
          "ownReplacementMatchesOwnPattern": false,
          "rule": "السؤال الرابع / معاني الكلمات",
        },
        {
          "ownReplacementMatchesOwnPattern": false,
          "rule": "صفحة 16 / الهامش السفلي للحديث الثاني",
        },
        {
          "ownReplacementMatchesOwnPattern": false,
          "rule": "صفحة 10 / السؤال الثامن",
        },
        {
          "ownReplacementMatchesOwnPattern": false,
          "rule": "صفحة 29 / أسئلة الحديث الثالث",
        },
        {
          "ownReplacementMatchesOwnPattern": false,
          "rule": "صفحة 42 / جدول البيوع المنهي عنها",
        },
        {
          "ownReplacementMatchesOwnPattern": false,
          "rule": "صفحة 44 / ختام باب البيع الفاسد",
        },
        {
          "ownReplacementMatchesOwnPattern": false,
          "rule": "صفحة 35 / السطر الأخير من جدول نية الصيام",
        },
        {
          "ownReplacementMatchesOwnPattern": false,
          "rule": "صفحة 61 / درس محرمات الإحرام",
        },
        {
          "ownReplacementMatchesOwnPattern": false,
          "rule": "صفحات التنقيط المتكررة (مثل ص 29-36 بالحديث، وص 21-24 بالفقه)",
        },
      ]
    `);
  });
});

describe('A. quranAuditor — auditQuranicContent', () => {
  it('empty / whitespace input returns the pinned empty report', () => {
    expect(auditQuranicContent('')).toMatchInlineSnapshot(`
      {
        "criticalErrorsCount": 0,
        "errors": [],
        "hasDotFlood": false,
        "hasQuranicDistortion": false,
        "hasTruncation": false,
        "qualityScore": 100,
        "summary": "المستند فارغ.",
        "totalErrors": 0,
        "warningsCount": 0,
      }
    `);
    expect(auditQuranicContent('   \n\t ')).toMatchInlineSnapshot(`
      {
        "criticalErrorsCount": 0,
        "errors": [],
        "hasDotFlood": false,
        "hasQuranicDistortion": false,
        "hasTruncation": false,
        "qualityScore": 100,
        "summary": "المستند فارغ.",
        "totalErrors": 0,
        "warningsCount": 0,
      }
    `);
  });

  it('the fixture fires ALL 26 rules, and pins the full report shape', () => {
    const report = auditQuranicContent(CORRUPTED_FIXTURE);
    // Every rule must be represented; a rule that silently stopped matching would
    // otherwise be invisible inside a large snapshot.
    expect(report.totalErrors).toBe(AZHAR_CORRECTION_RULES.length);
    expect(report.errors.map(e => e.id)).toEqual(
      AZHAR_CORRECTION_RULES.map((_, i) => `err-${i + 1}`),
    );
    expect(report).toMatchInlineSnapshot(`
      {
        "criticalErrorsCount": 22,
        "detectedSubject": "تفسير سورة الملك",
        "errors": [
          {
            "ayahNumber": 23,
            "category": "quran_verse",
            "contextSentence": "قال ﴿لِّيَنِينَ﴾ في جدول الإعراب. ﴿مَقَامًا﴾ مَفْعَل من الفوز في بنك التدريبات. ﴿سِب",
            "correctText": "لَّابِثِينَ",
            "explanation": "تحريف خطير في الآية القرآنية بسورة النبأ؛ كُتبت "لِّيَنِينَ" والصواب: ﴿لَّابِثِينَ فِيهَا أَحْقَابًا﴾، وهي حال من الضمير في ﴿لِلطَّاغِينَ﴾.",
            "foundText": "﴿لِّيَنِينَ﴾",
            "id": "err-1",
            "location": "جدول وجوه الإعراب / الآيات الكريمة",
            "severity": "critical",
            "subject": "تفسير",
            "surah": "سورة النبأ",
          },
          {
            "ayahNumber": 31,
            "category": "exercise_exam",
            "contextSentence": "قال ﴿لِّيَنِينَ﴾ في جدول الإعراب. ﴿مَقَامًا﴾ مَفْعَل من الفوز في بنك التدريبات. ﴿سِبَاعًا﴾ ﴿شِدَادًا﴾ في سؤال سورة",
            "correctText": "﴿مَفَازًا﴾ مفعل من الفوز",
            "explanation": "خطأ في الكلمة القرآنية بسورة النبأ؛ كُتبت "مقاماً" والصواب: ﴿إِنَّ لِلْمُتَّقِينَ مَفَازًا﴾، مفعل من الفوز يصلح أن يكون مصدراً ميمياً أو اسم مكان.",
            "foundText": "﴿مَقَامًا﴾",
            "id": "err-2",
            "location": "أسئلة سورة النبأ / بنك التدريبات",
            "severity": "critical",
            "subject": "تفسير",
            "surah": "سورة النبأ",
          },
          {
            "ayahNumber": 12,
            "category": "quran_verse",
            "contextSentence": "اب. ﴿مَقَامًا﴾ مَفْعَل من الفوز في بنك التدريبات. ﴿سِبَاعًا﴾ ﴿شِدَادًا﴾ في سؤال سورة النبأ. ﴿أَنَاصَبَنَا الْمَاءَ﴾ في سورة عبس. ﴿",
            "correctText": "سَبْعًا",
            "explanation": "تحريف في قوله تعالى: ﴿وَبَنَيْنَا فَوْقَكُمْ سَبْعًا شِدَادًا﴾؛ كُتبت بكسر السين "سِباعاً" والصواب بالفتح "سَبْعًا" جمع سبع سماوات.",
            "foundText": "﴿سِبَاعًا﴾",
            "id": "err-3",
            "location": "أسئلة وتدريبات سورة النبأ",
            "severity": "critical",
            "subject": "تفسير",
            "surah": "سورة النبأ",
          },
          {
            "ayahNumber": 25,
            "category": "quran_verse",
            "contextSentence": "دريبات. ﴿سِبَاعًا﴾ ﴿شِدَادًا﴾ في سؤال سورة النبأ. ﴿أَنَاصَبَنَا الْمَاءَ﴾ في سورة عبس. ﴿فَسَتُعْفِيهِ الذِّكْرَىٰ﴾ في سورة عبس. مع",
            "correctText": "أَنَّا صَبَبْنَا الْمَاءَ صَبًّا",
            "explanation": "تحريف شنيع لقوله تعالى في سورة عبس: ﴿أَنَّا صَبَبْنَا الْمَاءَ صَبًّا﴾؛ دُمجت الكلمات خطأً بسبب الـ OCR لتصبح "أناصبنا".",
            "foundText": "﴿أَنَاصَبَنَا الْمَاءَ﴾",
            "id": "err-4",
            "location": "جدول القراءات والأسئلة / سورة عبس",
            "severity": "critical",
            "subject": "تفسير",
            "surah": "سورة عبس",
          },
          {
            "ayahNumber": 4,
            "category": "quran_verse",
            "contextSentence": "سورة النبأ. ﴿أَنَاصَبَنَا الْمَاءَ﴾ في سورة عبس. ﴿فَسَتُعْفِيهِ الذِّكْرَىٰ﴾ في سورة عبس. معنى ﴿غُرْفَةً﴾ مبالغة في النزع. المراد",
            "correctText": "فَتَنفَعَهُ الذِّكْرَىٰ",
            "explanation": "تحريف شنيع للفظ القرآني في سورة عبس في قوله تعالى: ﴿أَوْ يَذَّكَّرُ فَتَنفَعَهُ الذِّكْرَىٰ﴾؛ كُتبت "فستعفيه الذكرى".",
            "foundText": "﴿فَسَتُعْفِيهِ الذِّكْرَى",
            "id": "err-5",
            "location": "أسئلة الخيارات والاختبارات / سورة عبس",
            "severity": "critical",
            "subject": "تفسير",
            "surah": "سورة عبس",
          },
          {
            "ayahNumber": 1,
            "category": "quran_verse",
            "contextSentence": "ورة عبس. ﴿فَسَتُعْفِيهِ الذِّكْرَىٰ﴾ في سورة عبس. معنى ﴿غُرْفَةً﴾ مبالغة في النزع. المراد بـ (القضب) في قوله تعالى: ﴿وَعِنَبًا وَق",
            "correctText": "معنى ﴿غَرْقًا﴾ مبالغة في النزع",
            "explanation": "تحريف للفظ القرآني في فاتحة سورة النازعات: ﴿وَالنَّازِعَاتِ غَرْقًا﴾؛ كُتبت "غرفة" والصواب غرقاً أي مبالغة وإغراقاً في النزع.",
            "foundText": "معنى ﴿غُرْفَةً﴾ مبالغة في النزع",
            "id": "err-6",
            "location": "أسئلة صح وخطأ / سورة النازعات",
            "severity": "critical",
            "subject": "تفسير",
            "surah": "سورة النازعات",
          },
          {
            "ayahNumber": 28,
            "category": "exercise_exam",
            "contextSentence": "ىٰ﴾ في سورة عبس. معنى ﴿غُرْفَةً﴾ مبالغة في النزع. المراد بـ (القضب) في قوله تعالى: ﴿وَعِنَبًا وَقَضْبًا﴾ البر والشعير ( ✓ ) معنى ا",
            "correctText": "المراد بـ (القضب) في قوله تعالى: ﴿وَعِنَبًا وَقَضْبًا﴾ ...",
            "explanation": "تناقض علمي؛ وُضعت علامة صح أمام أن القضب هو البر والشعير، بينما الشرح يؤكد أن القضب هو ما يؤكل رطباً، أما البر والشعير فهما الحب.",
            "foundText": "المراد بـ (القضب) في قوله تعالى: ﴿و...",
            "id": "err-7",
            "location": "أسئلة التطبيقات وصح وخطأ / سورة عبس",
            "severity": "critical",
            "subject": "تفسير",
            "surah": "سورة عبس",
          },
          {
            "ayahNumber": 18,
            "category": "exercise_exam",
            "contextSentence": "ه تعالى: ﴿وَعِنَبًا وَقَضْبًا﴾ البر والشعير ( ✓ ) معنى الاستفهام في قوله تعالى: ﴿مِنْ أَيِّ شَيْءٍ خَلَقَهُ﴾ استفهام تقريري (✗) قر",
            "correctText": "معنى الاستفهام في قوله تعالى: ﴿مِنْ أَيِّ شَيْءٍ خَلَقَ...",
            "explanation": "تناقض علمي؛ وُضعت علامة خطأ أمام أن الاستفهام تقريري بالرغم من أن الشرح يقرر أنه استفهام تقريري توبيخي لبيان حقارة أصل خلق الإنسان.",
            "foundText": "معنى الاستفهام في قوله تعالى: ﴿مِنْ...",
            "id": "err-8",
            "location": "أسئلة التطبيقات والأحكام / سورة عبس",
            "severity": "critical",
            "subject": "تفسير",
            "surah": "سورة عبس",
          },
          {
            "ayahNumber": 6,
            "category": "exercise_exam",
            "contextSentence": ": ﴿مِنْ أَيِّ شَيْءٍ خَلَقَهُ﴾ استفهام تقريري (✗) قرأ هذه السورة ولما بلغ قوله تعالى: ﴿يَوْمَ يَقُومُ النَّاسُ لِرَبِّ الْعَالَمِي",
            "correctText": "قرأ هذه السورة، ولما بلغ قوله تعالى: ﴿يَوْمَ يَقُومُ ال...",
            "explanation": "سقوط الإجابة الصحيحة من بين الأقواس؛ الصحابي الجليل الذي بكى نحيباً هو عبد الله بن عمر رضي الله عنهما.",
            "foundText": "قرأ هذه السورة ولما بلغ قوله تعالى:...",
            "id": "err-9",
            "location": "أسئلة الاختيارات / سورة المطففين",
            "severity": "critical",
            "subject": "تفسير",
            "surah": "سورة المطففين",
          },
          {
            "ayahNumber": 5,
            "category": "truncation",
            "contextSentence": "مِينَ﴾ بكى نحيباً (عمر بن الخطاب - عثمان بن عفان) س: ثم أُسند التدبير للخيل علوم القرآن هي ..... في سورة الملك: مَن تَقُوتُ تصحيح",
            "correctText": "س: هل أُسند التدبير للخيل في قوله تعالى ﴿فَالْمُدَبِّرَ...",
            "explanation": "سؤال مبتور انقطع قبل توضيح الإجابة الفقهية والتفسيرية المقررة بالأزهر.",
            "foundText": "س: ثم أُسند التدبير للخيل",
            "id": "err-10",
            "location": "أسئلة سورة النازعات / التدبير",
            "severity": "critical",
            "subject": "تفسير",
            "surah": "سورة النازعات",
          },
          {
            "ayahNumber": undefined,
            "category": "truncation",
            "contextSentence": "الخطاب - عثمان بن عفان) س: ثم أُسند التدبير للخيل علوم القرآن هي ..... في سورة الملك: مَن تَقُوتُ تصحيح شائع. جواب الأمر ﴿بِقَلْبٍ",
            "correctText": "علوم القرآن هي: مباحث تتعلق بالقرآن الكريم من حيث نزوله...",
            "explanation": "جملة تعريفية مبتورة بسيل نقاط حذفت التعريف العلمي المعتمد.",
            "foundText": "علوم القرآن هي .....",
            "id": "err-11",
            "location": "مبادئ علوم القرآن / التعريف",
            "severity": "critical",
            "subject": "تفسير",
            "surah": undefined,
          },
          {
            "ayahNumber": 3,
            "category": "quran_verse",
            "contextSentence": "التدبير للخيل علوم القرآن هي ..... في سورة الملك: مَن تَقُوتُ تصحيح شائع. جواب الأمر ﴿بِقَلْبٍ﴾ في جدول الإعراب. معاني الكلمات: ال",
            "correctText": "مِن تَفَاوُتٍ",
            "explanation": "خطأ طباعي فادح نتج عن قراءة خاطئة للـ OCR لحرف الفاء كـ قاف. الصواب: ﴿مَّا تَرَىٰ فِي خَلْقِ الرَّحْمَٰنِ مِن تَفَاوُتٍ﴾. "مِن" حرف جر زائد لتأكيد النفي، و"تَفَاوُتٍ" مجرور لفظاً منصوب محلاً مفعول به.",
            "foundText": "مَن تَقُوتُ",
            "id": "err-12",
            "location": "جدول وجوه الإعراب / الآيات الكريمة",
            "severity": "critical",
            "subject": "تفسير",
            "surah": "سورة الملك",
          },
          {
            "ayahNumber": 4,
            "category": "irab_grammar",
            "contextSentence": "ن هي ..... في سورة الملك: مَن تَقُوتُ تصحيح شائع. جواب الأمر ﴿بِقَلْبٍ﴾ في جدول الإعراب. معاني الكلمات: الْبَصَرُ خاشعا معنى كذا.",
            "correctText": "يَنقَلِبْ",
            "explanation": "تحريف خطير في الإعراب؛ كُتبت "بِقَلْبٍ" والصواب هو الفعل المضارع ﴿يَنقَلِبْ﴾ المجزوم في جواب الأمر ﴿ثُمَّ ارْجِعِ الْبَصَرَ كَرَّتَيْنِ يَنقَلِبْ إِلَيْكَ الْبَصَرُ خَاسِئًا﴾ وعلامة جزمه السكون.",
            "foundText": "جواب الأمر ﴿بِقَلْبٍ﴾",
            "id": "err-13",
            "location": "جدول وجوه الإعراب (جواب الأمر)",
            "severity": "critical",
            "subject": "تفسير",
            "surah": "سورة الملك",
          },
          {
            "ayahNumber": 4,
            "category": "quran_verse",
            "contextSentence": "الأمر ﴿بِقَلْبٍ﴾ في جدول الإعراب. معاني الكلمات: الْبَصَرُ خاشعا معنى كذا. سؤال: أَن يَخِيفَ بنا الأرض. في جدول الأسرار البلاغية:",
            "correctText": "الْبَصَرُ خَاسِئًا",
            "explanation": "خلط بين آيات القرآن؛ كُتبت "خاشعاً" والصواب في سورة الملك: ﴿يَنقَلِبْ إِلَيْكَ الْبَصَرُ خَاسِئًا وَهُوَ حَسِيرٌ﴾. خاسئاً: أي ذليلاً صاغراً كليلاً عن رؤية عيب أو خلل، وهي حال منصوبة.",
            "foundText": "الْبَصَرُ خاشعا",
            "id": "err-14",
            "location": "جدول وجوه الإعراب / معاني الكلمات",
            "severity": "critical",
            "subject": "تفسير",
            "surah": "سورة الملك",
          },
          {
            "ayahNumber": 16,
            "category": "quran_verse",
            "contextSentence": "ب. معاني الكلمات: الْبَصَرُ خاشعا معنى كذا. سؤال: أَن يَخِيفَ بنا الأرض. في جدول الأسرار البلاغية: يَعْمَوْا عَمَهًا استعارة مكنية",
            "correctText": "أَن يَخْسِفَ",
            "explanation": "تصحيف شنيع للمعنى؛ كُتبت "يخيف" (من الخوف) والصواب: ﴿أَأَمِنتُم مَّن فِي السَّمَاءِ أَن يَخْسِفَ بِكُمُ الْأَرْضَ﴾. الفعل مشتق من "الخسف" وهو الغؤور في الأرض.",
            "foundText": "أَن يَخِيفَ",
            "id": "err-15",
            "location": "جدول الإعراب وأسئلة الاختيارات (سؤال 2)",
            "severity": "critical",
            "subject": "تفسير",
            "surah": "سورة الملك",
          },
          {
            "ayahNumber": 7,
            "category": "balagha",
            "contextSentence": "أَن يَخِيفَ بنا الأرض. في جدول الأسرار البلاغية: يَعْمَوْا عَمَهًا استعارة مكنية. تدريب: أَلَيَأْتِيكُم نَذِيرٌ على السورة. المعن",
            "correctText": "سَمِعُوا لَهَا شَهِيقًا",
            "explanation": "إيراد جملة ملفقة تماماً مكان الآية! التفسير البلاغي يذكر: "استعارة مكنية، شبه شدة استعارها وحسيسها بصوت الحمار"، والآية الشريفة هي: ﴿إِذَا أُلْقُوا فِيهَا سَمِعُوا لَهَا شَهِيقًا وَهِيَ تَفُورُ﴾.",
            "foundText": "يَعْمَوْا عَمَهًا",
            "id": "err-16",
            "location": "جدول الأسرار البلاغية",
            "severity": "critical",
            "subject": "تفسير",
            "surah": "سورة الملك",
          },
          {
            "ayahNumber": 8,
            "category": "exercise_exam",
            "contextSentence": "البلاغية: يَعْمَوْا عَمَهًا استعارة مكنية. تدريب: أَلَيَأْتِيكُم نَذِيرٌ على السورة. المعنى: صَنَفَتْ وَيَقْبِضْنَ حال. تخريج الحد",
            "correctText": "أَلَمْ يَأْتِكُمْ نَذِيرٌ",
            "explanation": "تحريف لأداة النفي والجزم؛ كُتبت "أليأتيكم" والصواب: ﴿كُلَّمَا أُلْقِيَ فِيهَا فَوْجٌ سَأَلَهُمْ خَزَنَتُهَا أَلَمْ يَأْتِكُمْ نَذِيرٌ﴾.",
            "foundText": "أَلَيَأْتِيكُم نَذِيرٌ",
            "id": "err-17",
            "location": "قسم الأسئلة المجمعة وتدريبات السورة",
            "severity": "critical",
            "subject": "تفسير",
            "surah": "سورة الملك",
          },
          {
            "ayahNumber": 19,
            "category": "exercise_exam",
            "contextSentence": "تدريب: أَلَيَأْتِيكُم نَذِيرٌ على السورة. المعنى: صَنَفَتْ وَيَقْبِضْنَ حال. تخريج الحديث: راوية ابن ماجه. السؤال الثامن: النساء ا",
            "correctText": "صَافَّاتٍ",
            "explanation": "خطأ في نقل الكلمة القرآنية؛ كُتبت "صنفت" والمطلوب في المنهج الأزهري معنى قوله تعالى: ﴿أَوَلَمْ يَرَوْا إِلَى الطَّيْرِ فَوْقَهُمْ صَافَّاتٍ وَيَقْبِضْنَ﴾.",
            "foundText": "صَنَفَتْ",
            "id": "err-18",
            "location": "السؤال الرابع / معاني الكلمات",
            "severity": "critical",
            "subject": "تفسير",
            "surah": "سورة الملك",
          },
          {
            "ayahNumber": undefined,
            "category": "typography",
            "contextSentence": "المعنى: صَنَفَتْ وَيَقْبِضْنَ حال. تخريج الحديث: راوية ابن ماجه. السؤال الثامن: النساء الرجال. (فارس - الروم - مصر) خانة المقارنة",
            "correctText": "رواية ابن ماجه",
            "explanation": "خطأ مطبعي في تخريج الحديث؛ كُتبت "راوية" والصواب "رواية ابن ماجه".",
            "foundText": "راوية ابن ماجه",
            "id": "err-19",
            "location": "صفحة 16 / الهامش السفلي للحديث الثاني",
            "severity": "warning",
            "subject": "حديث",
            "surah": undefined,
          },
          {
            "ayahNumber": undefined,
            "category": "exercise_exam",
            "contextSentence": "حال. تخريج الحديث: راوية ابن ماجه. السؤال الثامن: النساء الرجال. (فارس - الروم - مصر) خانة المقارنة: وعن لبن في ضرع، وعن لبن في ضر",
            "correctText": "النساء شقائق الرجال",
            "explanation": "سقوط كلمة أساسية من نص الحديث النبوي الشريف في السؤال الثامن: كُتبت "النساء الرجال" والصواب: "النساء شقائق الرجال".",
            "foundText": "النساء الرجال",
            "id": "err-20",
            "location": "صفحة 10 / السؤال الثامن",
            "severity": "critical",
            "subject": "حديث",
            "surah": undefined,
          },
          {
            "ayahNumber": undefined,
            "category": "exercise_exam",
            "contextSentence": "يث: راوية ابن ماجه. السؤال الثامن: النساء الرجال. (فارس - الروم - مصر) خانة المقارنة: وعن لبن في ضرع، وعن لبن في ضرع في جدول البيو",
            "correctText": "سؤال الاختيارات: فتحت في عهد عمر بن الخطاب رضي الله عنه...",
            "explanation": "خيارات أسئلة عائمة ومبتورة ناتجة عن سيل النقاط الذي طمس السؤال الأصلي.",
            "foundText": "(فارس - الروم - مصر)",
            "id": "err-21",
            "location": "صفحة 29 / أسئلة الحديث الثالث",
            "severity": "warning",
            "subject": "حديث",
            "surah": undefined,
          },
          {
            "ayahNumber": undefined,
            "category": "repetition",
            "contextSentence": "لنساء الرجال. (فارس - الروم - مصر) خانة المقارنة: وعن لبن في ضرع، وعن لبن في ضرع في جدول البيوع. بيع الحاضر للبادي جدول نية الصيام",
            "correctText": "وعن لبن في ضرع",
            "explanation": "تكرار غير مقصود للعبارة في الجدول الفقهي أفسد تنسيق خانات المقارنة.",
            "foundText": "وعن لبن في ضرع، وعن لبن في ضرع",
            "id": "err-22",
            "location": "صفحة 42 / جدول البيوع المنهي عنها",
            "severity": "warning",
            "subject": "فقه حنفي",
            "surah": undefined,
          },
          {
            "ayahNumber": undefined,
            "category": "truncation",
            "contextSentence": "ة: وعن لبن في ضرع، وعن لبن في ضرع في جدول البيوع. بيع الحاضر للبادي جدول نية الصيام: كفته نيتة. والمراد من ذلك الجنس الصادق بـ سؤا",
            "correctText": "بيع الحاضر للبادي: وهو أن يقدم القروي بمتاعه لبيعه بسعر...",
            "explanation": "انقطاع النص فجأة وبتر الملف بالكامل في منتصف شرح "بيع الحاضر للبادي" دون إكمال المسألة أو ذكر أسئلتها.",
            "foundText": "بيع الحاضر للبادي",
            "id": "err-23",
            "location": "صفحة 44 / ختام باب البيع الفاسد",
            "severity": "critical",
            "subject": "فقه حنفي",
            "surah": undefined,
          },
          {
            "ayahNumber": undefined,
            "category": "typography",
            "contextSentence": "ي جدول البيوع. بيع الحاضر للبادي جدول نية الصيام: كفته نيتة. والمراد من ذلك الجنس الصادق بـ سؤال مبتور ...........................",
            "correctText": "كفته نيته",
            "explanation": "خطأ إملائي بوضع تاء مربوطة بدلاً من الهاء في "نيته".",
            "foundText": "كفته نيتة",
            "id": "err-24",
            "location": "صفحة 35 / السطر الأخير من جدول نية الصيام",
            "severity": "warning",
            "subject": "فقه شافعي",
            "surah": undefined,
          },
          {
            "ayahNumber": undefined,
            "category": "truncation",
            "contextSentence": "وع. بيع الحاضر للبادي جدول نية الصيام: كفته نيتة. والمراد من ذلك الجنس الصادق بـ سؤال مبتور ......................................",
            "correctText": "والمراد من ذلك الجنس الصادق بالمخيط المحيط كقميص وجبة و...",
            "explanation": "بتر مفاجئ وكارثي للملف في منتصف الكلمة والجملة، ترتب عليه ضياع أكثر من 135 صفحة من باقي منهج الفقه الشافعي.",
            "foundText": "والمراد من ذلك الجنس الصادق بـ",
            "id": "err-25",
            "location": "صفحة 61 / درس محرمات الإحرام",
            "severity": "critical",
            "subject": "فقه شافعي",
            "surah": undefined,
          },
          {
            "ayahNumber": undefined,
            "category": "dot_flood",
            "contextSentence": "ه نيتة. والمراد من ذلك الجنس الصادق بـ سؤال مبتور ................................................",
            "correctText": "..... [تم تطهير سيل النقاط وإعادة النصوص المحذوفة] .....",
            "explanation": "حلقة تكرار لانهائية لرمز النقطة (...) لآلاف المرات بسبب توقف الـ OCR عند أسئلة أكمل بالنقاط، مما التهم صفحات كاملة ومحا الأحاديث والدروس.",
            "foundText": "......................................",
            "id": "err-26",
            "location": "صفحات التنقيط المتكررة (مثل ص 29-36 بالحديث، وص 21-24 بالفقه)",
            "severity": "critical",
            "subject": "عام",
            "surah": undefined,
          },
        ],
        "hasDotFlood": true,
        "hasQuranicDistortion": true,
        "hasTruncation": true,
        "qualityScore": 0,
        "summary": "الملف تالف جسيماً: يحتوي على (22) أخطاء حرجة، مع وجود سيل نقاط متكرر أدى لمحو أجزاء واسعة وبتر المنهج قبل اكتماله. شكوى المراجع صحيحة 100%.",
        "totalErrors": 26,
        "warningsCount": 4,
      }
    `);
  });

  it('rule-by-rule hit matrix: the corrupted fixture fires every rule', () => {
    expect(
      AZHAR_CORRECTION_RULES.map(rule => ({
        rule: rule.location,
        hitsCorrupted: new RegExp(rule.pattern.source, rule.pattern.flags).test(CORRUPTED_FIXTURE),
      })),
    ).toMatchInlineSnapshot(`
      [
        {
          "hitsCorrupted": true,
          "rule": "جدول وجوه الإعراب / الآيات الكريمة",
        },
        {
          "hitsCorrupted": true,
          "rule": "أسئلة سورة النبأ / بنك التدريبات",
        },
        {
          "hitsCorrupted": true,
          "rule": "أسئلة وتدريبات سورة النبأ",
        },
        {
          "hitsCorrupted": true,
          "rule": "جدول القراءات والأسئلة / سورة عبس",
        },
        {
          "hitsCorrupted": true,
          "rule": "أسئلة الخيارات والاختبارات / سورة عبس",
        },
        {
          "hitsCorrupted": true,
          "rule": "أسئلة صح وخطأ / سورة النازعات",
        },
        {
          "hitsCorrupted": true,
          "rule": "أسئلة التطبيقات وصح وخطأ / سورة عبس",
        },
        {
          "hitsCorrupted": true,
          "rule": "أسئلة التطبيقات والأحكام / سورة عبس",
        },
        {
          "hitsCorrupted": true,
          "rule": "أسئلة الاختيارات / سورة المطففين",
        },
        {
          "hitsCorrupted": true,
          "rule": "أسئلة سورة النازعات / التدبير",
        },
        {
          "hitsCorrupted": true,
          "rule": "مبادئ علوم القرآن / التعريف",
        },
        {
          "hitsCorrupted": true,
          "rule": "جدول وجوه الإعراب / الآيات الكريمة",
        },
        {
          "hitsCorrupted": true,
          "rule": "جدول وجوه الإعراب (جواب الأمر)",
        },
        {
          "hitsCorrupted": true,
          "rule": "جدول وجوه الإعراب / معاني الكلمات",
        },
        {
          "hitsCorrupted": true,
          "rule": "جدول الإعراب وأسئلة الاختيارات (سؤال 2)",
        },
        {
          "hitsCorrupted": true,
          "rule": "جدول الأسرار البلاغية",
        },
        {
          "hitsCorrupted": true,
          "rule": "قسم الأسئلة المجمعة وتدريبات السورة",
        },
        {
          "hitsCorrupted": true,
          "rule": "السؤال الرابع / معاني الكلمات",
        },
        {
          "hitsCorrupted": true,
          "rule": "صفحة 16 / الهامش السفلي للحديث الثاني",
        },
        {
          "hitsCorrupted": true,
          "rule": "صفحة 10 / السؤال الثامن",
        },
        {
          "hitsCorrupted": true,
          "rule": "صفحة 29 / أسئلة الحديث الثالث",
        },
        {
          "hitsCorrupted": true,
          "rule": "صفحة 42 / جدول البيوع المنهي عنها",
        },
        {
          "hitsCorrupted": true,
          "rule": "صفحة 44 / ختام باب البيع الفاسد",
        },
        {
          "hitsCorrupted": true,
          "rule": "صفحة 35 / السطر الأخير من جدول نية الصيام",
        },
        {
          "hitsCorrupted": true,
          "rule": "صفحة 61 / درس محرمات الإحرام",
        },
        {
          "hitsCorrupted": true,
          "rule": "صفحات التنقيط المتكررة (مثل ص 29-36 بالحديث، وص 21-24 بالفقه)",
        },
      ]
    `);
  });

  it('the already-corrected fixture still trips some rules: pin which, and the full report', () => {
    const report = auditQuranicContent(CORRECTED_FIXTURE);
    expect(report.totalErrors).toBeLessThan(AZHAR_CORRECTION_RULES.length);
    expect(report.errors.map(e => `${e.id} | ${e.foundText} | ${e.correctText}`)).toMatchInlineSnapshot(`[]`);
    expect(report).toMatchInlineSnapshot(`
      {
        "criticalErrorsCount": 0,
        "detectedSubject": "تفسير سورة الملك",
        "errors": [],
        "hasDotFlood": false,
        "hasQuranicDistortion": false,
        "hasTruncation": false,
        "qualityScore": 100,
        "summary": "الملف مكتمل وسليم 100% ومطابق للمصادر الأزهرية ولا توجد نقاط متكررة أو نواقص.",
        "totalErrors": 0,
        "warningsCount": 0,
      }
    `);
  });

  it('quality scoring arithmetic: critical -18, warning -5, dotFlood -30, truncation -40', () => {
    expect(auditQuranicContent('نص سليم جدا لا يحتوي على أي خطأ معروف.').qualityScore).toBe(100);

    const oneWarning = auditQuranicContent('تخريج: راوية ابن ماجه.');
    expect(oneWarning).toMatchObject({ criticalErrorsCount: 0, warningsCount: 1, qualityScore: 95 });

    // Math.max(0, ...) is load-bearing: 26 rules would otherwise produce a negative score.
    const manyCriticals = auditQuranicContent(CORRUPTED_FIXTURE);
    expect(manyCriticals.criticalErrorsCount).toBeGreaterThan(5);
    expect(manyCriticals.qualityScore).toBe(0);
  });

  it('hasQuranicDistortion is driven ONLY by quran_verse / irab_grammar categories', () => {
    const warningsOnly = auditQuranicContent('رواية ابن ماجه وكفته نيتة.');
    expect(warningsOnly.warningsCount).toBeGreaterThan(0);
    expect(warningsOnly.criticalErrorsCount).toBe(0);
    expect(warningsOnly.hasQuranicDistortion).toBe(false);

    expect(auditQuranicContent(CORRUPTED_FIXTURE).hasQuranicDistortion).toBe(true);
  });
});

describe('A. quranAuditor — autoFixQuranicErrors', () => {
  it('pins correctedText and fixedCount for the all-rules fixture', () => {
    const result = autoFixQuranicErrors(CORRUPTED_FIXTURE);
    expect(result.fixedCount).toMatchInlineSnapshot(`26`);
    expect(result.correctedText).toMatchInlineSnapshot(`
      "قال ﴿لَّابِثِينَ﴾ في جدول الإعراب.
      ﴿مَفَازًا﴾ مفعل من الفوز مَفْعَل من الفوز في بنك التدريبات.
      ﴿سَبْعًا﴾ ﴿شِدَادًا﴾ في سؤال سورة النبأ.
      ﴿أَنَّا صَبَبْنَا الْمَاءَ صَبًّا﴾ في سورة عبس.
      ﴿فَتَنفَعَهُ الذِّكْرَىٰ﴾ٰ﴾ في سورة عبس.
      ﴿معنى ﴿غَرْقًا﴾ مبالغة في النزع﴾.
      المراد بـ (القضب) في قوله تعالى: ﴿وَعِنَبًا وَقَضْبًا﴾ ما يؤكل رطباً من النبات كالفصة والقثاء (أما البر والشعير فهما الحب) ( ✗ )
      معنى الاستفهام في قوله تعالى: ﴿مِنْ أَيِّ شَيْءٍ خَلَقَهُ﴾ استفهام تقريري ( ✓ )
      قرأ هذه السورة، ولما بلغ قوله تعالى: ﴿يَوْمَ يَقُومُ النَّاسُ لِرَبِّ الْعَالَمِينَ﴾ بكى نحيباً: (عبد الله بن عمر - عمر بن الخطاب - عثمان بن عفان)
      س: هل أُسند التدبير للخيل في قوله تعالى ﴿فَالْمُدَبِّرَاتِ أَمْرًا﴾؟
      ج: قيل: المراد الملائكة تدبر أمر العباد بإذن الله، وقيل الأفلاك، وقيل أُسند التدبير للخيل لشدة جريها وعظيم نفعها وتدبيرها في ساحة القتال والجهاد.
      علوم القرآن هي: مباحث تتعلق بالقرآن الكريم من حيث نزوله وترتيبه وجمعه وكتابته وقراءته وتفسيره وإعجازه وناسخه ومنسوخه ودفع الشبه عنه.
      في سورة الملك: ﴿مِن تَفَاوُتٍ﴾ تصحيح شائع.
      يَنقَلِبْ في جدول الإعراب.
      معاني الكلمات: ﴿الْبَصَرُ خَاسِئًا﴾ معنى كذا.
      سؤال: ﴿أَن يَخْسِفَ﴾ بنا الأرض.
      في جدول الأسرار البلاغية: سَمِعُوا لَهَا شَهِيقًا استعارة مكنية.
      تدريب: أَلَمْ يَأْتِكُمْ نَذِيرٌ على السورة.
      المعنى: صَافَّاتٍ وَيَقْبِضْنَ حال.
      تخريج الحديث: رواية ابن ماجه.
      السؤال الثامن: النساء شقائق الرجال.
      سؤال الاختيارات: فتحت في عهد عمر بن الخطاب رضي الله عنه بلاد: (فارس - الروم - مصر)
      خانة المقارنة: وعن لبن في ضرع في جدول البيوع.
      بيع الحاضر للبادي: وهو أن يقدم القروي بمتاعه لبيعه بسعر يومه فيقول له البلدي: اتركه عندي لأبيعه لك على التدريج بأغلى؛ وعلة النهي: لئلا يتضرر أهل البلد.
      جدول نية الصيام: كفته نيته.
      والمراد من ذلك الجنس الصادق بالمخيط المحيط كقميص وجبة وسراويل وخف، فيحرم لبسه على المحرم ذكراً كان بالاتفاق.
      سؤال مبتور ..... [تم تطهير سيل النقاط وإعادة النصوص المحذوفة] ....."
    `);
  });

  it('pins fixedItems (the PRE-fix audit report is what gets attached)', () => {
    expect(
      autoFixQuranicErrors(CORRUPTED_FIXTURE).fixedItems.map(
        e => `${e.id} | ${e.category} | ${e.severity}`,
      ),
    ).toMatchInlineSnapshot(`
      [
        "err-1 | quran_verse | critical",
        "err-2 | exercise_exam | critical",
        "err-3 | quran_verse | critical",
        "err-4 | quran_verse | critical",
        "err-5 | quran_verse | critical",
        "err-6 | quran_verse | critical",
        "err-7 | exercise_exam | critical",
        "err-8 | exercise_exam | critical",
        "err-9 | exercise_exam | critical",
        "err-10 | truncation | critical",
        "err-11 | truncation | critical",
        "err-12 | quran_verse | critical",
        "err-13 | irab_grammar | critical",
        "err-14 | quran_verse | critical",
        "err-15 | quran_verse | critical",
        "err-16 | balagha | critical",
        "err-17 | exercise_exam | critical",
        "err-18 | exercise_exam | critical",
        "err-19 | typography | warning",
        "err-20 | exercise_exam | critical",
        "err-21 | exercise_exam | warning",
        "err-22 | repetition | warning",
        "err-23 | truncation | critical",
        "err-24 | typography | warning",
        "err-25 | truncation | critical",
        "err-26 | dot_flood | critical",
      ]
    `);
  });

  it('quran_verse rules get wrapped in ﴿ ﴾; every other category does not', () => {
    const result = autoFixQuranicErrors(CORRUPTED_FIXTURE);

    // Located by consonant spine: the canonical rules spell diacritics as an optional
    // class, so `تَقُوتُ` no longer appears verbatim in the pattern source.
    const rule11 = AZHAR_CORRECTION_RULES.find(r =>
      consonantSpine(r.pattern.source).includes(consonantSpine('تَقُوتُ'))
    )!;
    expect(rule11.category).toBe('quran_verse');
    expect(rule11.replacement).toBe('مِن تَفَاوُتٍ');
    // … but the emitted text is bracketed (quranAuditor.ts:447-449).
    expect(result.correctedText).toContain('﴿مِن تَفَاوُتٍ﴾');

    const rule23 = AZHAR_CORRECTION_RULES.find(r => r.pattern.source.includes('نيتة'))!;
    expect(rule23.category).toBe('typography');
    expect(rule23.replacement).toBe('كفته نيته');
    expect(result.correctedText).toContain('كفته نيته');
    expect(result.correctedText).not.toContain('﴿كفته نيته﴾');
  });

  it('DEAD RULE: the dot_flood rule (index 25) can never fire inside autoFixQuranicErrors', () => {
    // quranAuditor.ts:438 compresses /.{6,}/ -> '.....' BEFORE the rule loop (line 443), and
    // The `dot_flood` rule needs 10+ or 30+ consecutive dots. The rules now run BEFORE the
    // generic dot-compression pass, so the rule can observe the raw corruption it was
    // written for and fire. Previously the compression collapsed the run first and the
    // rule was unreachable.
    const dotRule = AZHAR_CORRECTION_RULES[AZHAR_CORRECTION_RULES.length - 1];
    expect(dotRule.category).toBe('dot_flood');
    expect(new RegExp(dotRule.pattern.source, dotRule.pattern.flags).test('.'.repeat(32))).toBe(true);

    const withFlood = `${CORRUPTED_FIXTURE}\nسؤال آخر ${'.'.repeat(34)}`;
    expect(auditQuranicContent(withFlood).hasDotFlood).toBe(true);

    const fixed = autoFixQuranicErrors(withFlood);
    // The flood rule now applies its own repair (replacing the whole run), and the
    // subsequent generic compression leaves it alone.
    expect(fixed.correctedText).toContain(dotRule.replacement);
  });

  it('second pass never nests brackets, but it DOES re-apply the non-idempotent rule', () => {
    const once = autoFixQuranicErrors(CORRUPTED_FIXTURE);
    const twice = autoFixQuranicErrors(once.correctedText);
    expect(twice.correctedText).not.toMatch(/﴿\s*﴿/);
    expect(twice.fixedCount).toMatchInlineSnapshot(`1`);
  });
});