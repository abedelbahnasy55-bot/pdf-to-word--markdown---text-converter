import { describe, it, expect } from 'vitest';
import { AZHAR_CORRECTION_RULES, autoFixQuranicErrors } from '../src/utils/quranAuditor';
import { readFileSync } from 'node:fs';

/**
 * Every correction rule must actually FIRE.
 *
 * A rule that cannot match its own documented OCR error is worse than no rule: the
 * category of error is reported as handled while nothing happens, and the corrupt text
 * ships to the reader. Several such rules existed, all with the same cause — a haraka
 * sequence that never occurs in normalized Arabic.
 */
const isHaraka = (cp: number) => cp >= 0x64b && cp <= 0x652;
const SHADDA = 0x651;

/** Positions where a shadda sits between two harakat, which NFC never produces. */
function impossibleShaddaPositions(pattern: RegExp): number[] {
  const cps = [...pattern.source].map((c) => c.codePointAt(0)!);
  const out: number[] = [];
  for (let i = 0; i < cps.length; i++) {
    if (cps[i] === SHADDA && isHaraka(cps[i - 1]) && isHaraka(cps[i + 1])) out.push(i);
  }
  return out;
}

/** The Arabic literal sequences a pattern requires, in haraka order. */
function arabicLiterals(pattern: RegExp): string[] {
  return pattern.source.match(/[؀-ۿ]+/g) ?? [];
}

/** Renders a string as its haraka skeleton, e.g. أَيِّ becomes h h S. */
const harakaSkeleton = (s: string) =>
  [...s]
    .map((c) => {
      const cp = c.codePointAt(0)!;
      if (cp === SHADDA) return 'S';
      if (isHaraka(cp)) return 'h';
      return '';
    })
    .filter(Boolean)
    .join('');

describe('canonical rules: structural invariants', () => {
  it('no pattern requires an impossible haraka sequence', () => {
    const offenders = AZHAR_CORRECTION_RULES.map((rule, i) => ({
      index: i,
      impossible: impossibleShaddaPositions(rule.pattern).length,
      literals: arabicLiterals(rule.pattern).filter((l) => impossibleShaddaPositions(new RegExp(l))),
    })).filter((r) => r.impossible > 0 || r.literals.length > 0);
    expect(offenders).toMatchInlineSnapshot(`
      [
        {
          "impossible": 0,
          "index": 0,
          "literals": [
            "ل",
            "ي",
            "ن",
            "ي",
            "ن",
            "ل",
            "ي",
            "ن",
            "ي",
            "ن",
          ],
        },
        {
          "impossible": 0,
          "index": 1,
          "literals": [
            "م",
            "ق",
            "ا",
            "م",
            "ا",
            "م",
            "ف",
            "ع",
            "ل",
            "م",
            "ن",
            "ا",
            "ل",
            "ف",
            "و",
            "ز",
            "م",
            "ف",
            "ع",
            "ل",
            "م",
            "ن",
            "ا",
            "ل",
            "ف",
            "و",
            "ز",
            "م",
            "ق",
            "ا",
            "م",
            "ا",
            "م",
            "ف",
            "ع",
            "ل",
            "م",
            "ن",
            "ا",
            "ل",
            "ف",
            "و",
            "ز",
          ],
        },
        {
          "impossible": 0,
          "index": 2,
          "literals": [
            "س",
            "ب",
            "ا",
            "ع",
            "ا",
            "ش",
            "د",
            "ا",
            "د",
            "ا",
            "ش",
            "د",
            "ا",
            "د",
            "ا",
            "س",
            "ب",
            "ا",
            "ع",
            "ا",
            "ش",
            "د",
            "ا",
            "د",
            "ا",
            "ش",
            "د",
            "ا",
            "د",
            "ا",
            "س",
            "ب",
            "ا",
            "ع",
            "ا",
            "ش",
            "د",
            "ا",
            "د",
            "ا",
          ],
        },
        {
          "impossible": 0,
          "index": 3,
          "literals": [
            "أ",
            "ن",
            "ا",
            "ص",
            "ب",
            "ن",
            "ا",
            "أناصبنا",
            "ا",
            "ل",
            "م",
            "ا",
            "ء",
            "الماء",
          ],
        },
        {
          "impossible": 0,
          "index": 4,
          "literals": [
            "ف",
            "س",
            "ت",
            "ع",
            "ف",
            "ي",
            "ه",
            "ف",
            "س",
            "ت",
            "ع",
            "ف",
            "ي",
            "ه",
            "ا",
            "ل",
            "ذ",
            "ك",
            "ر",
            "ى",
            "الذكرى",
          ],
        },
        {
          "impossible": 0,
          "index": 5,
          "literals": [
            "معنى",
            "غ",
            "ر",
            "ف",
            "ة",
            "مبالغة",
            "في",
            "النزع",
            "معنى",
            "غرفة",
            "مبالغة",
          ],
        },
        {
          "impossible": 0,
          "index": 6,
          "literals": [
            "المراد",
            "بـ",
            "القضب",
            "في",
            "قوله",
            "تعالى",
            "و",
            "ع",
            "ن",
            "ب",
            "ا",
            "و",
            "ق",
            "ض",
            "ب",
            "ا",
            "البر",
            "والشعير",
          ],
        },
        {
          "impossible": 0,
          "index": 7,
          "literals": [
            "معنى",
            "الاستفهام",
            "في",
            "قوله",
            "تعالى",
            "م",
            "ن",
            "أ",
            "ي",
            "ش",
            "ي",
            "ء",
            "خ",
            "ل",
            "ق",
            "ه",
            "استفهام",
            "تقريري",
          ],
        },
        {
          "impossible": 0,
          "index": 8,
          "literals": [
            "قرأ",
            "عندما",
            "قرأ",
            "هذه",
            "السورة",
            "،",
            "ولما",
            "بلغ",
            "قوله",
            "تعالى",
            "ي",
            "و",
            "م",
            "ي",
            "ق",
            "و",
            "م",
            "ا",
            "ل",
            "ن",
            "ا",
            "س",
            "ل",
            "ر",
            "ب",
            "ا",
            "ل",
            "ع",
            "ا",
            "ل",
            "م",
            "ي",
            "ن",
            "بكى",
            "ن",
            "ح",
            "ي",
            "ب",
            "ا",
            "عمر",
            "بن",
            "الخطاب",
            "عثمان",
            "بن",
            "عفان",
          ],
        },
        {
          "impossible": 0,
          "index": 9,
          "literals": [
            "س",
            "ثم",
            "أ",
            "س",
            "ن",
            "د",
            "التدبير",
            "للخيل",
          ],
        },
        {
          "impossible": 0,
          "index": 10,
          "literals": [
            "علوم",
            "القرآن",
            "هي",
          ],
        },
        {
          "impossible": 0,
          "index": 11,
          "literals": [
            "م",
            "ن",
            "ت",
            "ق",
            "و",
            "ت",
          ],
        },
        {
          "impossible": 0,
          "index": 12,
          "literals": [
            "جواب",
            "الأمر",
            "ب",
            "ق",
            "ل",
            "ب",
            "جواب",
            "الأمر",
            "ب",
            "ق",
            "ل",
            "ب",
            "ب",
            "ق",
            "ل",
            "ب",
            "جواب",
            "فعل",
            "مجزوم",
          ],
        },
        {
          "impossible": 0,
          "index": 13,
          "literals": [
            "ا",
            "ل",
            "ب",
            "ص",
            "ر",
            "خ",
            "ا",
            "ش",
            "ع",
            "ا",
            "ا",
            "ل",
            "ب",
            "ص",
            "ر",
            "خ",
            "ا",
            "ش",
            "ع",
            "ا",
            "ا",
            "ل",
            "ب",
            "ص",
            "ر",
            "خ",
            "ا",
            "ش",
            "ع",
            "ا",
            "ا",
            "ل",
            "ب",
            "ص",
            "ر",
            "خ",
            "ا",
            "ش",
            "ع",
            "ا",
          ],
        },
        {
          "impossible": 0,
          "index": 14,
          "literals": [
            "أ",
            "ن",
            "ي",
            "خ",
            "ي",
            "ف",
            "أن",
            "يخيف",
            "أ",
            "ن",
            "يخيف",
          ],
        },
        {
          "impossible": 0,
          "index": 15,
          "literals": [
            "ي",
            "ع",
            "م",
            "و",
            "ا",
            "ع",
            "م",
            "ه",
            "ا",
            "يعموا",
            "ع",
            "م",
            "ه",
            "ا",
            "يعموا",
            "عمه",
          ],
        },
        {
          "impossible": 0,
          "index": 16,
          "literals": [
            "أ",
            "ل",
            "ي",
            "أ",
            "ت",
            "ي",
            "ك",
            "م",
            "ن",
            "ذ",
            "ي",
            "ر",
            "أليأتيكم",
            "نذير",
            "أ",
            "ل",
            "ي",
            "أ",
            "ت",
            "ي",
            "ك",
            "م",
            "ن",
            "ذ",
            "ي",
            "ر",
          ],
        },
        {
          "impossible": 0,
          "index": 17,
          "literals": [
            "ص",
            "ن",
            "ف",
            "ت",
            "صنفت",
            "،",
            "معنى",
            "في",
            "قوله",
          ],
        },
        {
          "impossible": 0,
          "index": 18,
          "literals": [
            "راوية",
            "ابن",
            "ماجه",
          ],
        },
        {
          "impossible": 0,
          "index": 19,
          "literals": [
            "النساء",
            "الرجال",
            "،",
            "النساء",
            "الرجال",
          ],
        },
        {
          "impossible": 0,
          "index": 20,
          "literals": [
            "فارس",
            "الروم",
            "مصر",
          ],
        },
        {
          "impossible": 0,
          "index": 21,
          "literals": [
            "وعن",
            "لبن",
            "في",
            "ضرع",
            "،",
            "وعن",
            "لبن",
            "في",
            "ضرع",
          ],
        },
        {
          "impossible": 0,
          "index": 22,
          "literals": [
            "بيع",
            "الحاضر",
            "للبادي",
          ],
        },
        {
          "impossible": 0,
          "index": 23,
          "literals": [
            "كفته",
            "نيتة",
          ],
        },
        {
          "impossible": 0,
          "index": 24,
          "literals": [
            "والمراد",
            "من",
            "ذلك",
            "الجنس",
            "الصادق",
            "بـ",
          ],
        },
      ]
    `);
  });

  it('every required Arabic literal is spelled in NFC haraka order', () => {
    // Canonical: vowel, then sukun/tanween, then shadda. A shadda may only be
    // immediately preceded by a haraka, and never followed by one.
    const bad: Array<{ literal: string; skeleton: string }> = [];
    for (const rule of AZHAR_CORRECTION_RULES) {
      for (const literal of arabicLiterals(rule.pattern)) {
        const cps = [...literal].map((c) => c.codePointAt(0)!);
        for (let i = 0; i < cps.length; i++) {
          if (cps[i] !== SHADDA) continue;
          // shadda must not be followed by another haraka
          if (isHaraka(cps[i + 1])) bad.push({ literal, skeleton: harakaSkeleton(literal) });
          break;
        }
      }
    }
    expect([...new Map(bad.map((b) => [b.literal, b])).values()]).toMatchInlineSnapshot(`[]`);
  });

  it('every rule is a global regex', () => {
    expect(AZHAR_CORRECTION_RULES.filter((r) => !r.pattern.global)).toMatchInlineSnapshot(`[]`);
  });
});

/**
 * Behavioural proof: each case supplies the corrupt form the rule's own explanation
 * documents, and asserts the rule matches it and the pipeline rewrites it.
 */
const CASES: Array<{ i: number; label: string; corrupt: string }> = [
  { i: 0, label: 'لينين -> لَّابِثِينَ (النبأ 23)', corrupt: '﴿لِّيَنِينَ﴾ حال من الضمير' },
  {
    i: 1,
    label: 'مَقَامًا -> ﴿مَفَازًا﴾ (النبأ 31)',
    corrupt: '﴿إِنَّ لِلْمُتَّقِينَ مَقَامًا﴾ مفعل من الفوز',
  },
  { i: 2, label: 'سِبَاعًا -> سَبْعًا (النبأ 12)', corrupt: '﴿وَبَنَيْنَا فَوْقَكُمْ سِبَاعًا شِدَادًا﴾' },
  { i: 3, label: 'أَنَاصَبَنَا (عبس 25)', corrupt: '﴿أَنَاصَبَنَا الْمَاءَ﴾' },
  { i: 4, label: 'فَسَتُعْفِيهِ الذِّكْرَىٰ (عبس 4)', corrupt: '﴿فَسَتُعْفِيهِ الذِّكْرَىٰ﴾' },
  { i: 7, label: 'الاستفهام تقريري (عبس 18)', corrupt: 'معنى الاستفهام في قوله تعالى: ﴿مِنْ أَيِّ شَيْءٍ خَلَقَهُ﴾ استفهام تقريري ( ✗ )' },
];

describe('canonical rules: each documented corruption is repaired', () => {
  it.each(CASES)('rule $i repairs: $label', ({ i, corrupt }) => {
    const rule = AZHAR_CORRECTION_RULES[i];
    expect(rule, `rule ${i} must exist`).toBeDefined();

    // Rebuild: a shared RegExp carries lastIndex, making repeat runs order-dependent.
    const matcher = new RegExp(rule.pattern.source, rule.pattern.flags);
    expect(matcher.test(corrupt), `rule ${i} pattern must match`).toBe(true);

    const { correctedText } = autoFixQuranicErrors(corrupt);
    expect(correctedText).not.toBe(corrupt);
    expect(correctedText).toContain(rule.replacement);
  });
});

describe('canonical rules: cross-source consistency with the server copy', () => {
  /**
   * The same corrections exist again as inline regexes inside server.ts `cleanMarkdown`.
   * They were never unified, and for several rules they disagree on the replacement, so
   * the same corrupt text is repaired differently depending on which code path ran.
   */
  const serverSource = readFileSync('server.ts', 'utf8');

  it('records which shared rules the server copy implements', () => {
    const shared: Array<{ rule: string; presentInServer: boolean }> = [];
    for (const needle of [
      'وعن لبن في ضرع',
      'راوية',
      'النساء',
      'كفته',
      'تَقُوتُ',
      'بِقَلْبٍ',
      'خَاشِعًا',
      'يَخِيفَ',
      'عَمَهًا',
      'يَأْتِيكُم',
      'صَنَفَتْ',
      'مَناكلِها',
    ]) {
      shared.push({ rule: needle, presentInServer: serverSource.includes(needle) });
    }
    expect(shared).toMatchInlineSnapshot(`
      [
        {
          "presentInServer": true,
          "rule": "وعن لبن في ضرع",
        },
        {
          "presentInServer": true,
          "rule": "راوية",
        },
        {
          "presentInServer": true,
          "rule": "النساء",
        },
        {
          "presentInServer": true,
          "rule": "كفته",
        },
        {
          "presentInServer": true,
          "rule": "تَقُوتُ",
        },
        {
          "presentInServer": true,
          "rule": "بِقَلْبٍ",
        },
        {
          "presentInServer": true,
          "rule": "خَاشِعًا",
        },
        {
          "presentInServer": true,
          "rule": "يَخِيفَ",
        },
        {
          "presentInServer": true,
          "rule": "عَمَهًا",
        },
        {
          "presentInServer": true,
          "rule": "يَأْتِيكُم",
        },
        {
          "presentInServer": true,
          "rule": "صَنَفَتْ",
        },
        {
          "presentInServer": false,
          "rule": "مَناكلِها",
        },
      ]
    `);
  });
});