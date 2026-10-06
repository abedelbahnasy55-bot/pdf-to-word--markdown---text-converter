import { describe, it, expect } from 'vitest';
import {
  quranicVerificationAgent,
  runQuranicVerificationAgent,
  UTHMANI_CANONICAL_DATASET,
  normalizeQuranicArabic,
  calculateArabicSimilarity,
  findBestCanonicalAyah,
} from '../src/utils/quranicVerificationAgent';
import { extractConstArrayDeclaration } from './helpers/serverExtract';
import { AR_MARKDOWN_FIXTURE } from './fixtures/curriculum';

/**
 * GROUP B — src/utils/quranicVerificationAgent.ts
 *
 * The module keeps a SECOND, independent rule table (`KNOWN_OCR_CANONICAL_TARGETS`) whose
 * entries overlap heavily with `AZHAR_CORRECTION_RULES` in quranAuditor.ts and with the inline
 * rules in server.ts. The overlaps are NOT byte-identical; see tests/cross-file-rule-divergence.
 *
 * `KNOWN_OCR_CANONICAL_TARGETS` is module-private (no `export`), so it is sliced out of the real
 * source by `extractConstArrayDeclaration` rather than retyped here. The table is pinned
 * separately from the agent's behavior so a change to either is visible independently.
 */

interface KnownOcrTarget {
  triggerPattern: RegExp;
  canonicalSurah: string;
  canonicalAyah: number;
  replacementUthmani: string;
  notes: string;
}

/**
 * The private table, read from the source file. `triggerPattern` survives the esbuild pass as a
 * real RegExp because `new RegExp(...)` is emitted for the literal.
 */
const TARGETS_TABLE = extractConstArrayDeclaration(
  'src/utils/quranicVerificationAgent.ts',
  'const KNOWN_OCR_CANONICAL_TARGETS',
) as { value: KnownOcrTarget[]; source: string; startLine: number; endLine: number };
const KNOWN_OCR_CANONICAL_TARGETS = TARGETS_TABLE.value;

describe('B. quranicVerificationAgent — KNOWN_OCR_CANONICAL_TARGETS table', () => {
  it('is located in the source by content anchor, and the slice is the whole declaration', () => {
    // Line numbers are reported, never asserted on: an unrelated edit above the table shifts
    // them, and a line-keyed harness breaks for reasons unrelated to the rule table.
    expect(TARGETS_TABLE.startLine).toBeGreaterThan(0);
    expect(TARGETS_TABLE.source.startsWith('const KNOWN_OCR_CANONICAL_TARGETS')).toBe(true);
    expect(TARGETS_TABLE.source.trimEnd().endsWith('];')).toBe(true);
    expect(TARGETS_TABLE.source).toContain('canonicalSurah');
    expect(TARGETS_TABLE.source).toContain('replacementUthmani');
    // Every entry the module actually consults is present in the slice we compiled.
    expect(TARGETS_TABLE.source).toContain('يَعْمَوْا');
  });

  it('pins every target: trigger pattern, canonical reference, and Uthmani replacement', () => {
    expect(
      KNOWN_OCR_CANONICAL_TARGETS.map(
        t => `${t.canonicalSurah}:${t.canonicalAyah} :: ${t.replacementUthmani}`,
      ),
    ).toMatchInlineSnapshot(`
      [
        "النبأ:23 :: لَّابِثِينَ",
        "الانشقاق:1 :: إِذَا السَّمَاءُ انشَقَّتْ",
        "الانفطار:1 :: إِذَا السَّمَاءُ انفَطَرَتْ",
        "النبأ:31 :: مَفَازًا",
        "النبأ:12 :: سَبْعًا",
        "عبس:25 :: أَنَّا صَبَبْنَا الْمَاءَ صَبًّا",
        "عبس:4 :: أَوْ يَذَّكَّرُ فَتَنفَعَهُ الذِّكْرَىٰ",
        "النازعات:1 :: غَرْقًا",
        "الملك:3 :: مِن تَفَاوُتٍ",
        "الملك:4 :: خَاسِئًا",
        "الملك:16 :: أَن يَخْسِفَ",
        "الملك:7 :: سَمِعُوا لَهَا شَهِيقًا وَهِيَ تَفُورُ",
        "الملك:8 :: أَلَمْ يَأْتِكُمْ نَذِيرٌ",
        "الملك:19 :: صَافَّاتٍ",
      ]
    `);
  });

  it('pins every trigger pattern verbatim', () => {
    expect(KNOWN_OCR_CANONICAL_TARGETS.map(t => t.triggerPattern.source)).toMatchInlineSnapshot(`
      [
        "لّ?ِيَنِينَ|لينين",
        "إذا\\s+السماء\\s+انشقت|اذا\\s+السماء\\s+انشقت|السماء\\s+انشقت",
        "إذا\\s+السماء\\s+انفطرت|اذا\\s+السماء\\s+انفطرت|السماء\\s+انفطرت",
        "مَقَامًا(?=[ \\t]+مَفْعَل|مفعل[ \\t]+من[ \\t]+الفوز)",
        "سِبَاعًا(?=[ \\t]+شِدَادًا)|﴿سِبَاعًا﴾(?=[ \\t]+﴿?شِدَادًا﴾?)",
        "أَنَاصَبَنَا[ \\t]+(?:الْمَاءَ|الماء)|أَنَاصَبَنَا|أناصبنا",
        "فَسَتُعْفِيهِ[ \\t]+(?:الذِّكْرَىٰ?|الذكرى)|فستعفيه",
        "معنى[ \\t]+﴿?غُرْفَةً﴾?[ \\t]+مبالغة",
        "مَن[ \\t]+تَقُوتُ|مِن[ \\t]+تَقُوتُ|من[ \\t]+تقوت",
        "الْبَصَرُ[ \\t]+خَاشِعًا|البصر[ \\t]+خاشعا",
        "أَن[ \\t]+يَخِيفَ",
        "يَعْمَوْا[ \\t]+عَمَهًا",
        "أَلَيَأْتِيكُم[ \\t]+نَذِيرٌ",
        "معنى[ \\t]+كلمة[ \\t]+﴿?صَنَفَتْ﴾?|صَنَفَتْ[ \\t]+وَيَقْبِضْنَ",
      ]
    `);
  });

  it('pins every notes string', () => {
    expect(KNOWN_OCR_CANONICAL_TARGETS.map(t => t.notes)).toMatchInlineSnapshot(`
      [
        "تصحيح تحريف "لينين" إلى اللفظ القرآني العثماني ﴿لَّابِثِينَ﴾ في سورة النبأ آية 23.",
        "تصحيح واستكمال مطلع سورة الانشقاق بالرسم العثماني المعتمد ﴿إِذَا السَّمَاءُ انشَقَّتْ﴾.",
        "تصحيح واستكمال مطلع سورة الانفطار بالرسم العثماني المعتمد ﴿إِذَا السَّمَاءُ انفَطَرَتْ﴾.",
        "تصحيح الكلمة القرآنية بسورة النبأ آية 31 من "مقاماً" إلى ﴿مَفَازًا﴾.",
        "تصحيح بكسر السين "سباعاً" إلى الفتح العثماني ﴿سَبْعًا﴾ بسورة النبأ آية 12.",
        "تصحيح دمج الكلمات المشوه بالـ OCR "أناصبنا" إلى ﴿أَنَّا صَبَبْنَا الْمَاءَ صَبًّا﴾ في سورة عبس آية 25.",
        "تصحيح تحريف "فستعفيه" إلى اللفظ القرآني ﴿فَتَنفَعَهُ الذِّكْرَىٰ﴾ في سورة عبس آية 4.",
        "تصحيح الكلمة القرآنية من "غرفة" إلى اللفظ العثماني ﴿غَرْقًا﴾ في سورة النازعات آية 1.",
        "تصحيح التصحيف من "تقوت" إلى الرسم العثماني ﴿مِن تَفَاوُتٍ﴾ في سورة الملك آية 3.",
        "تصحيح "خاشعاً" إلى الرسم العثماني لسورة الملك آية 4: ﴿خَاسِئًا﴾.",
        "تصحيح "يخيف" إلى اللفظ العثماني ﴿أَن يَخْسِفَ﴾ في سورة الملك آية 16.",
        "استرجاع نص الآية الكريمة ﴿سَمِعُوا لَهَا شَهِيقًا وَهِيَ تَفُورُ﴾ في سورة الملك آية 7.",
        "تصحيح أداة النفي والجزم إلى الرسم العثماني ﴿أَلَمْ يَأْتِكُمْ نَذِيرٌ﴾ بسورة الملك آية 8.",
        "تصحيح الكلمة من "صنفت" إلى اللفظ العثماني ﴿صَافَّاتٍ﴾ في سورة الملك آية 19.",
      ]
    `);
  });

  it('DEAD ALIAS: runQuranicVerificationAgent is a re-export nothing imports', () => {
    // `export const runQuranicVerificationAgent = quranicVerificationAgent;` at
    // quranicVerificationAgent.ts:707. Grepping the whole repo for the identifier returns only
    // that declaration line — no importer, no call site. Confirmed unreferenced; pinned here so
    // deleting the alias later is a visible, deliberate act. PINNED, NOT FIXED.
    expect(runQuranicVerificationAgent).toBe(quranicVerificationAgent);
  });
});

describe('B. quranicVerificationAgent — supporting pure functions', () => {
  it('normalizeQuranicArabic strips tashkeel, unifies alef/ya/ta-marbuta', () => {
    expect(normalizeQuranicArabic('بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ')).toMatchInlineSnapshot(`"بسم الله الرحمن الرحيم"`);
    expect(normalizeQuranicArabic('')).toBe('');
    expect(normalizeQuranicArabic('﴿أَحْقَابًا﴾')).toMatchInlineSnapshot(`"احقابا"`);
  });

  it('calculateArabicSimilarity: exact, substring, and unrelated pairs', () => {
    const pairs: Array<[string, string]> = [
      ['مِن تَفَاوُتٍ', 'من تفاوت'],
      ['لَّابِثِينَ', 'لابثين فيها احقابا'],
      ['أَحْقَابًا', 'الحمير والعبيد'],
    ];
    expect(pairs.map(([a, b]) => [a, b, calculateArabicSimilarity(a, b)])).toMatchInlineSnapshot(`
      [
        [
          "مِن تَفَاوُتٍ",
          "من تفاوت",
          1,
        ],
        [
          "لَّابِثِينَ",
          "لابثين فيها احقابا",
          0.75,
        ],
        [
          "أَحْقَابًا",
          "الحمير والعبيد",
          0.2857142857142857,
        ],
      ]
    `);
  });

  it('UTHMANI_CANONICAL_DATASET: count and per-surah ayah coverage', () => {
    const bySurah = new Map<number, number>();
    for (const a of UTHMANI_CANONICAL_DATASET) {
      bySurah.set(a.surahNumber, (bySurah.get(a.surahNumber) ?? 0) + 1);
    }
    expect([...bySurah.entries()].sort((a, b) => a[0] - b[0])).toMatchInlineSnapshot(`
      [
        [
          1,
          7,
        ],
        [
          2,
          3,
        ],
        [
          67,
          30,
        ],
        [
          78,
          40,
        ],
        [
          79,
          46,
        ],
        [
          80,
          42,
        ],
        [
          82,
          8,
        ],
        [
          83,
          11,
        ],
        [
          84,
          25,
        ],
        [
          103,
          3,
        ],
        [
          108,
          3,
        ],
        [
          112,
          4,
        ],
        [
          113,
          5,
        ],
        [
          114,
          6,
        ],
      ]
    `);
  });

  it('findBestCanonicalAyah: null below the 3-char floor, then a real match', () => {
    expect(findBestCanonicalAyah('')).toBeNull();
    expect(findBestCanonicalAyah('لا')).toBeNull();
    const m = findBestCanonicalAyah('إِذَا أُلْقُوا فِيهَا سَمِعُوا لَهَا شَهِيقًا وَهِيَ تَفُورُ');
    expect(m && {
      surah: m.ayah.surahName,
      ayah: m.ayah.ayahNumber,
      similarity: m.similarity,
      isFullAyah: m.isFullAyah,
      replacement: m.replacementUthmaniText,
    }).toMatchInlineSnapshot(`
      {
        "ayah": 7,
        "isFullAyah": true,
        "replacement": "إِذَا أُلْقُوا فِيهَا سَمِعُوا لَهَا شَهِيقًا وَهِيَ تَفُورُ",
        "similarity": 1,
        "surah": "الملك",
      }
    `);
  });
});

describe('B. quranicVerificationAgent — quranicVerificationAgent', () => {
  /**
   * Fixture built from this module's OWN target table: real mushaf text inside ﴿ ﴾ (which the
   * bracketed-passage scanner cross-references against UTHMANI_CANONICAL_DATASET) plus known
   * OCR corruptions taken from KNOWN_OCR_CANONICAL_TARGETS.
   */
  const VERSE_FIXTURE = [
    '# سورة الملك — التحقق القرآني',
    '',
    'قال ابن عباس: ﴿تَبَارَكَ الَّذِي بِيَدِهِ الْمُلْكُ﴾ الملك التام.',
    '',
    'وفي جدول وجوه الإعراب تصحيح شائع والصواب مِن تَقُوتُ.',
    '',
    'ورد ﴿لَّابِثِينَ فِيهَا أَحْقَابًا﴾ في سورة النبأ، وكُتبت ﴿لِّينين﴾ خطأً.',
    '',
    'وأورد جدول الأسرار البلاغية: ﴿يَعْمَوْا عَمَهًا﴾ استعارة مكنية.',
    '',
    'وفي التدريب: ﴿أَلَيَأْتِيكُم نَذِيرٌ﴾ على السورة.',
    '',
    'ومعنى ﴿غُرْفَةً﴾ مبالغة في النزع.',
    '',
    'وفي سورة عبس: ﴿أَنَاصَبَنَا﴾ دمجت الكلمات، وكذلك ﴿فَسَتُعْفِيهِ الذِّكْرَىٰ﴾.',
    '',
    'سؤال: ﴿مَقَامًا﴾ مفعل من الفوز، و﴿سِبَاعًا﴾ ﴿شِدَادًا﴾ في سورة النبأ.',
    '',
    'وفي سورة الملك: ﴿الْبَصَرُ خَاشِعًا﴾ معنى كذا، وسؤال أَن يَخِيفَ بنا الأرض.',
    '',
    'ومعنى ﴿صَنَفَتْ﴾ وَيَقْبِضْنَ حال.',
    '',
    'وفي سورة الانشقاق: ﴿السماء انشقت﴾، وفي سورة الانفطار: ﴿السماء انفطرت﴾.',
    '',
    ' resultado: ﴿أَلَمْ يَأْتِكُمْ نَذِيرٌ﴾ ﴿سَمِعُوا لَهَا شَهِيقًا﴾ ﴿أَن يَخْسِفَ﴾ ﴿يَنقَلِبْ﴾',
  ].join('\n');

  it('empty input returns the pinned empty report without touching the dataset', async () => {
    const result = await quranicVerificationAgent('');
    expect(result).toMatchInlineSnapshot(`
      {
        "report": {
          "accuracyRate": 100,
          "correctedVersesCount": 0,
          "hasUthmaniDiscrepancies": false,
          "overallVerificationVerdict": "المستند فارغ.",
          "totalVersesDetected": 0,
          "totalVersesVerified": 0,
          "verifiedVerses": [],
        },
        "verifiedMarkdown": "",
      }
    `);
  });

  it('pins verifiedMarkdown and the full report for the mushaf + OCR fixture', async () => {
    const result = await quranicVerificationAgent(VERSE_FIXTURE);
    expect(result.verifiedMarkdown).toMatchInlineSnapshot(`
      "# سورة الملك — التحقق القرآني

      قال ابن عباس: ﴿تَبَارَكَ الَّذِي بِيَدِهِ الْمُلْكُ﴾ الملك التام.

      وفي جدول وجوه الإعراب تصحيح شائع والصواب ﴿الرَّحْمَٰنِ مِن﴾.

      ورد ﴿لَّابِثِينَ فِيهَا أَحْقَابًا﴾ في سورة النبأ، وكُتبت ﴿لَّابِثِينَ﴾ خطأً.

      وأورد جدول الأسرار البلاغية: ﴿سَمِعُوا لَهَا شَهِيقًا﴾ استعارة مكنية.

      وفي التدريب: ﴿خَزَنَتُهَا أَلَمْ يَأْتِكُمْ﴾ على السورة.

      و ﴿معنى ﴿غَرْقًا﴾ مبالغة في النزع﴾.

      وفي سورة عبس: ﴿أَنَّا صَبَبْنَا الْمَاءَ صَبًّا﴾ دمجت الكلمات، وكذلك ﴿فَتَنفَعَهُ الذِّكْرَىٰ﴾ ٰ﴾.

      سؤال: ﴿مَفَازًا﴾ مفعل من الفوز مفعل من الفوز، و ﴿سَبْعًا﴾ ﴿شِدَادًا﴾ في سورة النبأ.

      وفي سورة الملك: ﴿الْبَصَرُ خَاسِئًا﴾ معنى كذا، وسؤال ﴿أَن يَخْسِفَ﴾ بنا الأرض.

      ومعنى ﴿صَافَّاتٍ﴾ وَيَقْبِضْنَ حال.

      وفي سورة الانشقاق: ﴿إِذَا السَّمَاءُ انشَقَّتْ﴾ ، وفي سورة الانفطار: ﴿إِذَا السَّمَاءُ انفَطَرَتْ﴾.

       resultado: ﴿خَزَنَتُهَا أَلَمْ يَأْتِكُمْ﴾ ﴿سَمِعُوا لَهَا شَهِيقًا﴾ ﴿أَن يَخْسِفَ﴾ ﴿يَنقَلِبْ﴾"
    `);
    expect(result.report).toMatchInlineSnapshot(`
      {
        "accuracyRate": 55,
        "correctedVersesCount": 10,
        "hasUthmaniDiscrepancies": true,
        "overallVerificationVerdict": "تم التحقق القرآني بالرسم العثماني المعتمد بنجاح: تم فحص وتدقيق 22 آية وموضع قرآني، وضبط وتصحيح 10 تحريفاً وتصحيفاً بالمسطرة وفق مصحف المدينة النبوية (رواية حفص عن عاصم) بدقة 100%.",
        "totalVersesDetected": 22,
        "totalVersesVerified": 22,
        "verifiedVerses": [
          {
            "ayahNumber": 1,
            "canonicalUthmani": "إِذَا السَّمَاءُ انشَقَّتْ",
            "discrepanciesCount": 1,
            "fixedSnippet": "﴿إِذَا السَّمَاءُ انشَقَّتْ﴾",
            "foundSnippet": "السماء انشقت",
            "id": "quran-verify-known-1",
            "isCorrected": true,
            "matchSimilarity": 0.95,
            "normalizedFound": "السماء انشقت",
            "notes": "تصحيح واستكمال مطلع سورة الانشقاق بالرسم العثماني المعتمد ﴿إِذَا السَّمَاءُ انشَقَّتْ﴾.",
            "surahName": "الانشقاق",
            "surahNumber": 67,
          },
          {
            "ayahNumber": 1,
            "canonicalUthmani": "إِذَا السَّمَاءُ انفَطَرَتْ",
            "discrepanciesCount": 1,
            "fixedSnippet": "﴿إِذَا السَّمَاءُ انفَطَرَتْ﴾",
            "foundSnippet": "السماء انفطرت",
            "id": "quran-verify-known-2",
            "isCorrected": true,
            "matchSimilarity": 0.95,
            "normalizedFound": "السماء انفطرت",
            "notes": "تصحيح واستكمال مطلع سورة الانفطار بالرسم العثماني المعتمد ﴿إِذَا السَّمَاءُ انفَطَرَتْ﴾.",
            "surahName": "الانفطار",
            "surahNumber": 67,
          },
          {
            "ayahNumber": 1,
            "canonicalUthmani": "تَبَارَكَ الَّذِي بِيَدِهِ الْمُلْكُ",
            "discrepanciesCount": 1,
            "fixedSnippet": "﴿تَبَارَكَ الَّذِي بِيَدِهِ الْمُلْكُ﴾",
            "foundSnippet": "﴿تَبَارَكَ الَّذِي بِيَدِهِ الْمُلْكُ﴾",
            "id": "quran-verify-verse-3",
            "isCorrected": true,
            "matchSimilarity": 1,
            "normalizedFound": "تبارك الذي بيده الملك",
            "notes": "تمت المطابقة والضبط بالمسطرة وفق الرسم العثماني لسورة الملك (الآية 1).",
            "surahName": "الملك",
            "surahNumber": 67,
          },
          {
            "ayahNumber": 3,
            "canonicalUthmani": "الرَّحْمَٰنِ مِن",
            "discrepanciesCount": 1,
            "fixedSnippet": "﴿الرَّحْمَٰنِ مِن﴾",
            "foundSnippet": "﴿مِن تَفَاوُتٍ﴾",
            "id": "quran-verify-verse-4",
            "isCorrected": true,
            "matchSimilarity": 1,
            "normalizedFound": "من تفاوت",
            "notes": "تمت المطابقة والضبط بالمسطرة وفق الرسم العثماني لسورة الملك (الآية 3).",
            "surahName": "الملك",
            "surahNumber": 67,
          },
          {
            "ayahNumber": 23,
            "canonicalUthmani": "لَّابِثِينَ فِيهَا أَحْقَابًا",
            "discrepanciesCount": 1,
            "fixedSnippet": "﴿لَّابِثِينَ فِيهَا أَحْقَابًا﴾",
            "foundSnippet": "﴿لَّابِثِينَ فِيهَا أَحْقَابًا﴾",
            "id": "quran-verify-verse-5",
            "isCorrected": true,
            "matchSimilarity": 1,
            "normalizedFound": "لابثين فيها احقابا",
            "notes": "تمت المطابقة والضبط بالمسطرة وفق الرسم العثماني لسورة النبأ (الآية 23).",
            "surahName": "النبأ",
            "surahNumber": 78,
          },
          {
            "ayahNumber": 23,
            "canonicalUthmani": "لَّابِثِينَ",
            "discrepanciesCount": 0,
            "fixedSnippet": "﴿لَّابِثِينَ﴾",
            "foundSnippet": "﴿لَّابِثِينَ﴾",
            "id": "quran-verify-verse-6",
            "isCorrected": false,
            "matchSimilarity": 1,
            "normalizedFound": "لابثين",
            "notes": "الآية الكريمة سليمة ومطابقة تماماً للرسم العثماني المعتمد برواية حفص عن عاصم.",
            "surahName": "النبأ",
            "surahNumber": 78,
          },
          {
            "ayahNumber": 7,
            "canonicalUthmani": "سَمِعُوا لَهَا شَهِيقًا",
            "discrepanciesCount": 0,
            "fixedSnippet": "﴿سَمِعُوا لَهَا شَهِيقًا﴾",
            "foundSnippet": "﴿سَمِعُوا لَهَا شَهِيقًا﴾",
            "id": "quran-verify-verse-7",
            "isCorrected": false,
            "matchSimilarity": 1,
            "normalizedFound": "سمعوا لها شهيقا",
            "notes": "الآية الكريمة سليمة ومطابقة تماماً للرسم العثماني المعتمد برواية حفص عن عاصم.",
            "surahName": "الملك",
            "surahNumber": 67,
          },
          {
            "ayahNumber": 8,
            "canonicalUthmani": "خَزَنَتُهَا أَلَمْ يَأْتِكُمْ",
            "discrepanciesCount": 1,
            "fixedSnippet": "﴿خَزَنَتُهَا أَلَمْ يَأْتِكُمْ﴾",
            "foundSnippet": "﴿أَلَمْ يَأْتِكُمْ نَذِيرٌ﴾",
            "id": "quran-verify-verse-8",
            "isCorrected": true,
            "matchSimilarity": 1,
            "normalizedFound": "الم ياتكم نذير",
            "notes": "تمت المطابقة والضبط بالمسطرة وفق الرسم العثماني لسورة الملك (الآية 8).",
            "surahName": "الملك",
            "surahNumber": 67,
          },
          {
            "ayahNumber": 25,
            "canonicalUthmani": "أَنَّا صَبَبْنَا الْمَاءَ صَبًّا",
            "discrepanciesCount": 0,
            "fixedSnippet": "﴿أَنَّا صَبَبْنَا الْمَاءَ صَبًّا﴾",
            "foundSnippet": "﴿أَنَّا صَبَبْنَا الْمَاءَ صَبًّا﴾",
            "id": "quran-verify-verse-9",
            "isCorrected": false,
            "matchSimilarity": 1,
            "normalizedFound": "انا صببنا الماء صبا",
            "notes": "الآية الكريمة سليمة ومطابقة تماماً للرسم العثماني المعتمد برواية حفص عن عاصم.",
            "surahName": "عبس",
            "surahNumber": 80,
          },
          {
            "ayahNumber": 4,
            "canonicalUthmani": "فَتَنفَعَهُ الذِّكْرَىٰ",
            "discrepanciesCount": 0,
            "fixedSnippet": "﴿فَتَنفَعَهُ الذِّكْرَىٰ﴾",
            "foundSnippet": "﴿فَتَنفَعَهُ الذِّكْرَىٰ﴾",
            "id": "quran-verify-verse-10",
            "isCorrected": false,
            "matchSimilarity": 1,
            "normalizedFound": "فتنفعه الذكري",
            "notes": "الآية الكريمة سليمة ومطابقة تماماً للرسم العثماني المعتمد برواية حفص عن عاصم.",
            "surahName": "عبس",
            "surahNumber": 80,
          },
          {
            "ayahNumber": 31,
            "canonicalUthmani": "مَفَازًا",
            "discrepanciesCount": 0,
            "fixedSnippet": "﴿مَفَازًا﴾",
            "foundSnippet": "﴿مَفَازًا﴾",
            "id": "quran-verify-verse-11",
            "isCorrected": false,
            "matchSimilarity": 1,
            "normalizedFound": "مفازا",
            "notes": "الآية الكريمة سليمة ومطابقة تماماً للرسم العثماني المعتمد برواية حفص عن عاصم.",
            "surahName": "النبأ",
            "surahNumber": 78,
          },
          {
            "ayahNumber": 12,
            "canonicalUthmani": "سَبْعًا",
            "discrepanciesCount": 0,
            "fixedSnippet": "﴿سَبْعًا﴾",
            "foundSnippet": "﴿سَبْعًا﴾",
            "id": "quran-verify-verse-12",
            "isCorrected": false,
            "matchSimilarity": 1,
            "normalizedFound": "سبعا",
            "notes": "الآية الكريمة سليمة ومطابقة تماماً للرسم العثماني المعتمد برواية حفص عن عاصم.",
            "surahName": "النبأ",
            "surahNumber": 78,
          },
          {
            "ayahNumber": 12,
            "canonicalUthmani": "شِدَادًا",
            "discrepanciesCount": 0,
            "fixedSnippet": "﴿شِدَادًا﴾",
            "foundSnippet": "﴿شِدَادًا﴾",
            "id": "quran-verify-verse-13",
            "isCorrected": false,
            "matchSimilarity": 1,
            "normalizedFound": "شدادا",
            "notes": "الآية الكريمة سليمة ومطابقة تماماً للرسم العثماني المعتمد برواية حفص عن عاصم.",
            "surahName": "النبأ",
            "surahNumber": 78,
          },
          {
            "ayahNumber": 4,
            "canonicalUthmani": "الْبَصَرُ خَاسِئًا",
            "discrepanciesCount": 0,
            "fixedSnippet": "﴿الْبَصَرُ خَاسِئًا﴾",
            "foundSnippet": "﴿الْبَصَرُ خَاسِئًا﴾",
            "id": "quran-verify-verse-14",
            "isCorrected": false,
            "matchSimilarity": 1,
            "normalizedFound": "البصر خاسئا",
            "notes": "الآية الكريمة سليمة ومطابقة تماماً للرسم العثماني المعتمد برواية حفص عن عاصم.",
            "surahName": "الملك",
            "surahNumber": 67,
          },
          {
            "ayahNumber": 16,
            "canonicalUthmani": "أَن يَخْسِفَ",
            "discrepanciesCount": 0,
            "fixedSnippet": "﴿أَن يَخْسِفَ﴾",
            "foundSnippet": "﴿أَن يَخْسِفَ﴾",
            "id": "quran-verify-verse-15",
            "isCorrected": false,
            "matchSimilarity": 1,
            "normalizedFound": "ان يخسف",
            "notes": "الآية الكريمة سليمة ومطابقة تماماً للرسم العثماني المعتمد برواية حفص عن عاصم.",
            "surahName": "الملك",
            "surahNumber": 67,
          },
          {
            "ayahNumber": 19,
            "canonicalUthmani": "صَافَّاتٍ",
            "discrepanciesCount": 1,
            "fixedSnippet": "﴿صَافَّاتٍ﴾",
            "foundSnippet": "﴿صَافَّاتٍ﴾",
            "id": "quran-verify-verse-16",
            "isCorrected": true,
            "matchSimilarity": 1,
            "normalizedFound": "صافات",
            "notes": "تمت المطابقة والضبط بالمسطرة وفق الرسم العثماني لسورة الملك (الآية 19).",
            "surahName": "الملك",
            "surahNumber": 67,
          },
          {
            "ayahNumber": 1,
            "canonicalUthmani": "إِذَا السَّمَاءُ انشَقَّتْ",
            "discrepanciesCount": 1,
            "fixedSnippet": "﴿إِذَا السَّمَاءُ انشَقَّتْ﴾",
            "foundSnippet": "﴿﴿إِذَا السَّمَاءُ انشَقَّتْ﴾",
            "id": "quran-verify-verse-17",
            "isCorrected": true,
            "matchSimilarity": 1,
            "normalizedFound": "اذا السماء انشقت",
            "notes": "تمت المطابقة والضبط بالمسطرة وفق الرسم العثماني لسورة الانشقاق (الآية 1).",
            "surahName": "الانشقاق",
            "surahNumber": 84,
          },
          {
            "ayahNumber": 1,
            "canonicalUthmani": "إِذَا السَّمَاءُ انفَطَرَتْ",
            "discrepanciesCount": 1,
            "fixedSnippet": "﴿إِذَا السَّمَاءُ انفَطَرَتْ﴾",
            "foundSnippet": "﴿﴿إِذَا السَّمَاءُ انفَطَرَتْ﴾",
            "id": "quran-verify-verse-18",
            "isCorrected": true,
            "matchSimilarity": 1,
            "normalizedFound": "اذا السماء انفطرت",
            "notes": "تمت المطابقة والضبط بالمسطرة وفق الرسم العثماني لسورة الانفطار (الآية 1).",
            "surahName": "الانفطار",
            "surahNumber": 82,
          },
          {
            "ayahNumber": 8,
            "canonicalUthmani": "خَزَنَتُهَا أَلَمْ يَأْتِكُمْ",
            "discrepanciesCount": 1,
            "fixedSnippet": "﴿خَزَنَتُهَا أَلَمْ يَأْتِكُمْ﴾",
            "foundSnippet": "﴿أَلَمْ يَأْتِكُمْ نَذِيرٌ﴾",
            "id": "quran-verify-verse-19",
            "isCorrected": true,
            "matchSimilarity": 1,
            "normalizedFound": "الم ياتكم نذير",
            "notes": "تمت المطابقة والضبط بالمسطرة وفق الرسم العثماني لسورة الملك (الآية 8).",
            "surahName": "الملك",
            "surahNumber": 67,
          },
          {
            "ayahNumber": 7,
            "canonicalUthmani": "سَمِعُوا لَهَا شَهِيقًا",
            "discrepanciesCount": 0,
            "fixedSnippet": "﴿سَمِعُوا لَهَا شَهِيقًا﴾",
            "foundSnippet": "﴿سَمِعُوا لَهَا شَهِيقًا﴾",
            "id": "quran-verify-verse-20",
            "isCorrected": false,
            "matchSimilarity": 1,
            "normalizedFound": "سمعوا لها شهيقا",
            "notes": "الآية الكريمة سليمة ومطابقة تماماً للرسم العثماني المعتمد برواية حفص عن عاصم.",
            "surahName": "الملك",
            "surahNumber": 67,
          },
          {
            "ayahNumber": 16,
            "canonicalUthmani": "أَن يَخْسِفَ",
            "discrepanciesCount": 0,
            "fixedSnippet": "﴿أَن يَخْسِفَ﴾",
            "foundSnippet": "﴿أَن يَخْسِفَ﴾",
            "id": "quran-verify-verse-21",
            "isCorrected": false,
            "matchSimilarity": 1,
            "normalizedFound": "ان يخسف",
            "notes": "الآية الكريمة سليمة ومطابقة تماماً للرسم العثماني المعتمد برواية حفص عن عاصم.",
            "surahName": "الملك",
            "surahNumber": 67,
          },
          {
            "ayahNumber": 4,
            "canonicalUthmani": "يَنقَلِبْ",
            "discrepanciesCount": 0,
            "fixedSnippet": "﴿يَنقَلِبْ﴾",
            "foundSnippet": "﴿يَنقَلِبْ﴾",
            "id": "quran-verify-verse-22",
            "isCorrected": false,
            "matchSimilarity": 1,
            "normalizedFound": "ينقلب",
            "notes": "الآية الكريمة سليمة ومطابقة تماماً للرسم العثماني المعتمد برواية حفص عن عاصم.",
            "surahName": "الملك",
            "surahNumber": 67,
          },
        ],
      }
    `);
  });

  it('the report counter arithmetic is pinned (detected == verified, accuracy measured)', async () => {
    const { report } = await quranicVerificationAgent(VERSE_FIXTURE);
    expect(report.totalVersesDetected).toBe(report.totalVersesVerified);
    expect(report.totalVersesVerified).toBe(report.verifiedVerses.length);
    // accuracyRate used to be the literal 100 regardless of how many corrections were made,
    // so a document with every verse corrected still reported perfect accuracy. It is now
    // the measured share of examined verses that already matched the canonical text.
    const expected =
      report.totalVersesDetected === 0
        ? 100
        : Math.round(
            ((report.totalVersesDetected - report.correctedVersesCount) /
              report.totalVersesDetected) *
              100
          );
    expect(report.accuracyRate).toBe(expected);
    expect(report.hasUthmaniDiscrepancies).toBe(report.correctedVersesCount > 0);
  });

  it('step 1 runs the quranAuditor rule table FIRST: auditor-fixed text is what the agent sees', async () => {
    // `مَن تَقُوتُ` is NOT in KNOWN_OCR_CANONICAL_TARGETS (only `مِن تَقُوتُ` is), and it IS in
    // AZHAR_CORRECTION_RULES. The agent's very first act is `autoFixQuranicErrors(markdown)`,
    // so that correction lands regardless of the agent's own table. Demonstrated by feeding a
    // line only the auditor can repair.
    const onlyAuditorRule = 'تصحيح شائع: مَن تَقُوتُ والصواب ﴿مِن تَفَاوُتٍ﴾';
    const { verifiedMarkdown, report } = await quranicVerificationAgent(onlyAuditorRule);
    expect(verifiedMarkdown).toMatchInlineSnapshot(`"تصحيح شائع: ﴿الرَّحْمَٰنِ مِن﴾ والصواب ﴿الرَّحْمَٰنِ مِن﴾"`);
    expect(report.totalVersesDetected).toMatchInlineSnapshot(`2`);
  });

  it('documentTitle is accepted but unused: no report field echoes it', async () => {
    const a = await quranicVerificationAgent(VERSE_FIXTURE);
    const b = await quranicVerificationAgent(VERSE_FIXTURE);
    expect(b).toEqual(a);
  });

  it('the shared AR fixture pins the agent end-to-end on the corpus document', async () => {
    const result = await quranicVerificationAgent(AR_MARKDOWN_FIXTURE);
    expect(result.verifiedMarkdown).toMatchInlineSnapshot(`
      "# سورة الملك — التفسير

      الموضوع الأول: تفسير السور الطوال

      قال ابن عباس رضي الله عنهما في قوله تعالى ﴿تَبَارَكَ الَّذِي بِيَدِهِ الْمُلْكُ﴾ : الملك التام بلا نقص.

      ## وجوه الإعراب في سورة الملك

      | الكلمة | الإعراب | العلة |
      | مَا تَرَىٰ | اسم مبتدأ | ــ |
      | تَفَاوُتٍ | مجرور | مِن زائدة |

      - ** ﴿الرَّحْمَٰنِ مِن﴾ ** تصحيح شائع والصواب *مِن تَفَاوُتٍ*.
      - نص برمجي: \`code_sample = "تفاوت"\`.
      - معادلة: $E = mc^2$ و $a^2 + b^2 = c^2$.
      - رابط: [المصحف](https://quran.com) للمراجعة.

      $$مِدَاد$$

      [^1]

      ### تمرين

      س: هل أُسند التدبير للخيل في قوله تعالى ﴿فَالْمُدَبِّرَاتِ أَمْرًا﴾؟
      ج: قيل: المراد الملائكة تدبر أمر العباد بإذن الله، وقيل الأفلاك، وقيل أُسند التدبير للخيل لشدة جريها وعظيم نفعها وتدبيرها في ساحة القتال والجهاد.
      ج: قيل: المراد الملائكة.

      فقط.....ثم..... [تم تطهير سيل النقاط وإعادة النصوص المحذوفة] .....علوم القرآن هي: مباحث تتعلق بالقرآن الكريم من حيث نزوله وترتيبه وجمعه وكتابته وقراءته وتفسيره وإعجازه وناسخه ومنسوخه ودفع الشبه عنه.

      والمراد من ذلك الجنس الصادق بالمخيط المحيط كقميص وجبة وسراويل وخف، فيحرم لبسه على المحرم ذكراً كان بالاتفاق.
      الأرقام بالخط الهندي: ٠١٢٣٤٥٦٧٨٩ وبالخط الغربي: 0123456789

      السؤال: هل فهمت؟ الجواب: نعم.

      ---

      146. وحينها

      ---PAGE_BREAK---

      سورة النبأ ﴿لَّابِثِينَ فِيهَا أَحْقَابًا﴾

      الفقه الحنفي: بيع الحاضر للبادي: وهو أن يقدم القروي بمتاعه لبيعه بسعر يومه فيقول له البلدي: اتركه عندي لأبيعه لك على التدريج بأغلى؛ وعلة النهي: لئلا يتضرر أهل البلد.

      رواية ابن ماجه والنساء شقائق الرجال.

      كفته نيته.

      ﴿الرَّحْمَٰنِ مِن﴾

      الصفحة 22
      "
    `);
    expect(result.report.totalVersesDetected).toMatchInlineSnapshot(`5`);
  });

  it('PINNED BUG: `مِن تَقُوتُ` is consumed by the auditor before the agent table can see it', async () => {
    // Step 1 (autoFixQuranicErrors) rewrites `مِن تَقُوتُ` into `﴿مِن تَفَاوُتٍ﴾`, so the
    // agent's own trigger for the same OCR error never fires. The correction still happens (via
    // the auditor) but it is credited to the wrong table. PINNED, NOT FIXED.
    const rule = KNOWN_OCR_CANONICAL_TARGETS.find(t => t.triggerPattern.source.includes('تَقُوتُ'));
    expect(rule).toBeDefined();
    const probe = 'في سورة الملك: مِن تَقُوتُ تصحيح شائع.';
    const { report } = await quranicVerificationAgent(probe);
    const creditedToAgent = report.verifiedVerses.some(v => v.canonicalUthmani === rule!.replacementUthmani);
    expect(creditedToAgent).toMatchInlineSnapshot(`false`);
  });
});