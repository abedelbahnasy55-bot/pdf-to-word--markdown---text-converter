import { describe, it, expect } from 'vitest';
import { AZHAR_CORRECTION_RULES } from '../src/utils/quranAuditor';
import { extractClosure, extractConstArrayDeclaration, parseReplacePairs } from './helpers/serverExtract';

/**
 * GROUP C — CROSS-FILE RULE DIVERGENCE
 *
 * The same Azhar curriculum corrections exist in THREE places:
 *
 *   A) src/utils/quranAuditor.ts        AZHAR_CORRECTION_RULES        (exported table)
 *   B) src/utils/quranicVerificationAgent.ts  KNOWN_OCR_CANONICAL_TARGETS (private table)
 *   C) server.ts                        cleanMarkdown closure         (inline .replace() calls)
 *
 * All three were written to fix the same OCR misreads. They are NOT byte-identical. This suite
 * holds THREE SEPARATE TABLES (one per source, never merged) and then asserts programmatically
 * where they DISAGREE. No winner is chosen and no source is edited: a divergence here means a
 * merge would be a behaviour change and must be authorized, not folded into a refactor.
 *
 * Sourcing rules:
 *   - A is imported (it is exported).
 *   - B is module-private, so it is sliced out of the real file by `extractConstArrayDeclaration`.
 *   - C is a multi-line closure, so it is sliced out by `extractClosure` and its `.replace()`
 *     pairs are parsed by `parseReplacePairs`. Nothing is retyped by hand.
 */

interface AuditorRule {
  pattern: RegExp;
  replacement: string;
  severity: string;
  category: string;
  subject: string;
  location: string;
}

interface KnownOcrTarget {
  triggerPattern: RegExp;
  canonicalSurah: string;
  canonicalAyah: number;
  replacementUthmani: string;
  notes: string;
}

/* ------------------------------------------------------------------ SOURCE A */

const TABLE_A: AuditorRule[] = AZHAR_CORRECTION_RULES as unknown as AuditorRule[];

/* ------------------------------------------------------------------ SOURCE B */

const TABLE_B = (
  extractConstArrayDeclaration(
    'src/utils/quranicVerificationAgent.ts',
    'const KNOWN_OCR_CANONICAL_TARGETS',
  ) as { value: KnownOcrTarget[] }
).value;

/* ------------------------------------------------------------------ SOURCE C */

const CLEAN_MARKDOWN = extractClosure('server.ts', 'const cleanMarkdown = (md: string)');
const TABLE_C = parseReplacePairs(CLEAN_MARKDOWN.source);

/**
 * Helper: how a rule in A or B behaves once applied. A wraps `quran_verse` replacements in
 * ﴿ ﴾ (quranAuditor.ts:447-449); B always wraps in `fixedSnippet`
 * (quranicVerificationAgent.ts:596); C emits the replacement verbatim. Comparing the raw table
 * strings would compare notes, not behaviour, so the comparison is done on the EMITTED text.
 */
function emittedA(rule: AuditorRule): string {
  return rule.category === 'quran_verse' ? `﴿${rule.replacement}﴾` : rule.replacement;
}

/* ============================================================================================
 * THE THREE TABLES, KEPT SEPARATE
 * ========================================================================================== */

describe('C. source A — AZHAR_CORRECTION_RULES (src/utils/quranAuditor.ts)', () => {
  it('is imported directly; its size is pinned', () => {
    expect(TABLE_A.length).toBe(26);
  });

  it('A_TABLE: pattern + replacement for every rule', () => {
    expect(
      TABLE_A.map(r => ({ pattern: r.pattern.source, flags: r.pattern.flags, replacement: r.replacement })),
    ).toMatchInlineSnapshot(`
      [
        {
          "flags": "g",
          "pattern": "﴿?\\s*ل[\\u064B-\\u0652\\u0670]*ي[\\u064B-\\u0652\\u0670]*ن[\\u064B-\\u0652\\u0670]*ي[\\u064B-\\u0652\\u0670]*ن[\\u064B-\\u0652\\u0670]*\\s*﴾?|﴿?\\s*ل[\\u064B-\\u0652\\u0670]*ي[\\u064B-\\u0652\\u0670]*ن[\\u064B-\\u0652\\u0670]*ي[\\u064B-\\u0652\\u0670]*ن[\\u064B-\\u0652\\u0670]*\\s*﴾?",
          "replacement": "لَّابِثِينَ",
        },
        {
          "flags": "g",
          "pattern": "﴿?\\s*م[\\u064B-\\u0652\\u0670]*ق[\\u064B-\\u0652\\u0670]*ا[\\u064B-\\u0652\\u0670]*م[\\u064B-\\u0652\\u0670]*ا[\\u064B-\\u0652\\u0670]*\\s*﴾?(?=[ \\t]+م[\\u064B-\\u0652\\u0670]*ف[\\u064B-\\u0652\\u0670]*ع[\\u064B-\\u0652\\u0670]*ل[\\u064B-\\u0652\\u0670]*[ \\t]+م[\\u064B-\\u0652\\u0670]*ن[\\u064B-\\u0652\\u0670]*[ \\t]+ا[\\u064B-\\u0652\\u0670]*ل[\\u064B-\\u0652\\u0670]*ف[\\u064B-\\u0652\\u0670]*و[\\u064B-\\u0652\\u0670]*ز[\\u064B-\\u0652\\u0670]*|م[\\u064B-\\u0652\\u0670]*ف[\\u064B-\\u0652\\u0670]*ع[\\u064B-\\u0652\\u0670]*ل[\\u064B-\\u0652\\u0670]*[ \\t]+م[\\u064B-\\u0652\\u0670]*ن[\\u064B-\\u0652\\u0670]*[ \\t]+ا[\\u064B-\\u0652\\u0670]*ل[\\u064B-\\u0652\\u0670]*ف[\\u064B-\\u0652\\u0670]*و[\\u064B-\\u0652\\u0670]*ز[\\u064B-\\u0652\\u0670]*)|﴿?\\s*م[\\u064B-\\u0652\\u0670]*ق[\\u064B-\\u0652\\u0670]*ا[\\u064B-\\u0652\\u0670]*م[\\u064B-\\u0652\\u0670]*ا[\\u064B-\\u0652\\u0670]*\\s*﴾?[ \\t]+م[\\u064B-\\u0652\\u0670]*ف[\\u064B-\\u0652\\u0670]*ع[\\u064B-\\u0652\\u0670]*ل[\\u064B-\\u0652\\u0670]*[ \\t]+م[\\u064B-\\u0652\\u0670]*ن[\\u064B-\\u0652\\u0670]*[ \\t]+ا[\\u064B-\\u0652\\u0670]*ل[\\u064B-\\u0652\\u0670]*ف[\\u064B-\\u0652\\u0670]*و[\\u064B-\\u0652\\u0670]*ز[\\u064B-\\u0652\\u0670]*",
          "replacement": "﴿مَفَازًا﴾ مفعل من الفوز",
        },
        {
          "flags": "g",
          "pattern": "س[\\u064B-\\u0652\\u0670]*ب[\\u064B-\\u0652\\u0670]*ا[\\u064B-\\u0652\\u0670]*ع[\\u064B-\\u0652\\u0670]*ا[\\u064B-\\u0652\\u0670]*(?=[ \\t]+ش[\\u064B-\\u0652\\u0670]*د[\\u064B-\\u0652\\u0670]*ا[\\u064B-\\u0652\\u0670]*د[\\u064B-\\u0652\\u0670]*ا[\\u064B-\\u0652\\u0670]*|ش[\\u064B-\\u0652\\u0670]*د[\\u064B-\\u0652\\u0670]*ا[\\u064B-\\u0652\\u0670]*د[\\u064B-\\u0652\\u0670]*ا[\\u064B-\\u0652\\u0670]*)|س[\\u064B-\\u0652\\u0670]*ب[\\u064B-\\u0652\\u0670]*ا[\\u064B-\\u0652\\u0670]*ع[\\u064B-\\u0652\\u0670]*ا[\\u064B-\\u0652\\u0670]*(?=[ \\t]+ش[\\u064B-\\u0652\\u0670]*د[\\u064B-\\u0652\\u0670]*ا[\\u064B-\\u0652\\u0670]*د[\\u064B-\\u0652\\u0670]*ا[\\u064B-\\u0652\\u0670]*|ش[\\u064B-\\u0652\\u0670]*د[\\u064B-\\u0652\\u0670]*ا[\\u064B-\\u0652\\u0670]*د[\\u064B-\\u0652\\u0670]*ا[\\u064B-\\u0652\\u0670]*)|﴿س[\\u064B-\\u0652\\u0670]*ب[\\u064B-\\u0652\\u0670]*ا[\\u064B-\\u0652\\u0670]*ع[\\u064B-\\u0652\\u0670]*ا[\\u064B-\\u0652\\u0670]*﴾(?=[ \\t]+﴿?ش[\\u064B-\\u0652\\u0670]*د[\\u064B-\\u0652\\u0670]*ا[\\u064B-\\u0652\\u0670]*د[\\u064B-\\u0652\\u0670]*ا[\\u064B-\\u0652\\u0670]*﴾?)",
          "replacement": "سَبْعًا",
        },
        {
          "flags": "g",
          "pattern": "﴿?\\s*(?:أ[\\u064B-\\u0652\\u0670]*ن[\\u064B-\\u0652\\u0670]*ا[\\u064B-\\u0652\\u0670]*ص[\\u064B-\\u0652\\u0670]*ب[\\u064B-\\u0652\\u0670]*ن[\\u064B-\\u0652\\u0670]*ا[\\u064B-\\u0652\\u0670]*|أناصبنا)(?:[ \\t]+ا[\\u064B-\\u0652\\u0670]*ل[\\u064B-\\u0652\\u0670]*م[\\u064B-\\u0652\\u0670]*ا[\\u064B-\\u0652\\u0670]*ء[\\u064B-\\u0652\\u0670]*|[ \\t]+الماء)?\\s*﴾?",
          "replacement": "أَنَّا صَبَبْنَا الْمَاءَ صَبًّا",
        },
        {
          "flags": "g",
          "pattern": "﴿?\\s*(?:ف[\\u064B-\\u0652\\u0670]*س[\\u064B-\\u0652\\u0670]*ت[\\u064B-\\u0652\\u0670]*ع[\\u064B-\\u0652\\u0670]*ف[\\u064B-\\u0652\\u0670]*ي[\\u064B-\\u0652\\u0670]*ه[\\u064B-\\u0652\\u0670]*|ف[\\u064B-\\u0652\\u0670]*س[\\u064B-\\u0652\\u0670]*ت[\\u064B-\\u0652\\u0670]*ع[\\u064B-\\u0652\\u0670]*ف[\\u064B-\\u0652\\u0670]*ي[\\u064B-\\u0652\\u0670]*ه[\\u064B-\\u0652\\u0670]*)[ \\t]+(?:ا[\\u064B-\\u0652\\u0670]*ل[\\u064B-\\u0652\\u0670]*ذ[\\u064B-\\u0652\\u0670]*ك[\\u064B-\\u0652\\u0670]*ر[\\u064B-\\u0652\\u0670]*ى[\\u064B-\\u0652\\u0670]*?|الذكرى)\\s*﴾?",
          "replacement": "فَتَنفَعَهُ الذِّكْرَىٰ",
        },
        {
          "flags": "g",
          "pattern": "معنى[ \\t]+﴿?غ[\\u064B-\\u0652\\u0670]*ر[\\u064B-\\u0652\\u0670]*ف[\\u064B-\\u0652\\u0670]*ة[\\u064B-\\u0652\\u0670]*﴾?[ \\t]+مبالغة[ \\t]+في[ \\t]+النزع|معنى[ \\t]+﴿?غرفة﴾?[ \\t]+مبالغة",
          "replacement": "معنى ﴿غَرْقًا﴾ مبالغة في النزع",
        },
        {
          "flags": "g",
          "pattern": "المراد[ \\t]+بـ\\s*\\(?القضب\\)?(?:[ \\t]+في[ \\t]+قوله[ \\t]+تعالى:[ \\t]+﴿?و[\\u064B-\\u0652\\u0670]*ع[\\u064B-\\u0652\\u0670]*ن[\\u064B-\\u0652\\u0670]*ب[\\u064B-\\u0652\\u0670]*ا[\\u064B-\\u0652\\u0670]*[ \\t]+و[\\u064B-\\u0652\\u0670]*ق[\\u064B-\\u0652\\u0670]*ض[\\u064B-\\u0652\\u0670]*ب[\\u064B-\\u0652\\u0670]*ا[\\u064B-\\u0652\\u0670]*﴾?)?[ \\t]+البر[ \\t]+والشعير(?:\\s*\\(?\\s*[✓\\u2713]\\s*\\)?)?",
          "replacement": "المراد بـ (القضب) في قوله تعالى: ﴿وَعِنَبًا وَقَضْبًا﴾ ما يؤكل رطباً من النبات كالفصة والقثاء (أما البر والشعير فهما الحب) ( ✗ )",
        },
        {
          "flags": "g",
          "pattern": "معنى[ \\t]+الاستفهام[ \\t]+في[ \\t]+قوله[ \\t]+تعالى:[ \\t]+﴿?م[\\u064B-\\u0652\\u0670]*ن[\\u064B-\\u0652\\u0670]*[ \\t]+أ[\\u064B-\\u0652\\u0670]*ي[\\u064B-\\u0652\\u0670]*[ \\t]+ش[\\u064B-\\u0652\\u0670]*ي[\\u064B-\\u0652\\u0670]*ء[\\u064B-\\u0652\\u0670]*[ \\t]+خ[\\u064B-\\u0652\\u0670]*ل[\\u064B-\\u0652\\u0670]*ق[\\u064B-\\u0652\\u0670]*ه[\\u064B-\\u0652\\u0670]*﴾?[ \\t]+استفهام[ \\t]+تقريري[ \\t]*\\([ \\t]*[✗xX]\\s*\\)",
          "replacement": "معنى الاستفهام في قوله تعالى: ﴿مِنْ أَيِّ شَيْءٍ خَلَقَهُ﴾ استفهام تقريري ( ✓ )",
        },
        {
          "flags": "g",
          "pattern": "(?:قرأ|عندما[ \\t]+قرأ)[ \\t]+هذه[ \\t]+السورة[،,\\s]+ولما[ \\t]+بلغ[ \\t]+قوله[ \\t]+تعالى:[ \\t]+﴿?ي[\\u064B-\\u0652\\u0670]*و[\\u064B-\\u0652\\u0670]*م[\\u064B-\\u0652\\u0670]*[ \\t]+ي[\\u064B-\\u0652\\u0670]*ق[\\u064B-\\u0652\\u0670]*و[\\u064B-\\u0652\\u0670]*م[\\u064B-\\u0652\\u0670]*[ \\t]+ا[\\u064B-\\u0652\\u0670]*ل[\\u064B-\\u0652\\u0670]*ن[\\u064B-\\u0652\\u0670]*ا[\\u064B-\\u0652\\u0670]*س[\\u064B-\\u0652\\u0670]*[ \\t]+ل[\\u064B-\\u0652\\u0670]*ر[\\u064B-\\u0652\\u0670]*ب[\\u064B-\\u0652\\u0670]*[ \\t]+ا[\\u064B-\\u0652\\u0670]*ل[\\u064B-\\u0652\\u0670]*ع[\\u064B-\\u0652\\u0670]*ا[\\u064B-\\u0652\\u0670]*ل[\\u064B-\\u0652\\u0670]*م[\\u064B-\\u0652\\u0670]*ي[\\u064B-\\u0652\\u0670]*ن[\\u064B-\\u0652\\u0670]*﴾?[ \\t]+بكى[ \\t]+ن[\\u064B-\\u0652\\u0670]*ح[\\u064B-\\u0652\\u0670]*ي[\\u064B-\\u0652\\u0670]*ب[\\u064B-\\u0652\\u0670]*ا[\\u064B-\\u0652\\u0670]*[ \\t]*\\([ \\t]*عمر[ \\t]+بن[ \\t]+الخطاب[ \\t]*-[ \\t]*عثمان[ \\t]+بن[ \\t]+عفان[ \\t]*\\)",
          "replacement": "قرأ هذه السورة، ولما بلغ قوله تعالى: ﴿يَوْمَ يَقُومُ النَّاسُ لِرَبِّ الْعَالَمِينَ﴾ بكى نحيباً: (عبد الله بن عمر - عمر بن الخطاب - عثمان بن عفان)",
        },
        {
          "flags": "gm",
          "pattern": "س:\\s*ثم\\s+أ[\\u064B-\\u0652\\u0670]*س[\\u064B-\\u0652\\u0670]*ن[\\u064B-\\u0652\\u0670]*د[\\u064B-\\u0652\\u0670]*\\s+التدبير\\s+للخيل\\s*\\??(?=[ \\t]*\\n[ \\t]*$|$)",
          "replacement": "س: هل أُسند التدبير للخيل في قوله تعالى ﴿فَالْمُدَبِّرَاتِ أَمْرًا﴾؟
      ج: قيل: المراد الملائكة تدبر أمر العباد بإذن الله، وقيل الأفلاك، وقيل أُسند التدبير للخيل لشدة جريها وعظيم نفعها وتدبيرها في ساحة القتال والجهاد.",
        },
        {
          "flags": "g",
          "pattern": "علوم\\s+القرآن\\s+هي\\s*\\.{3,}(?=[ \\t]*\\n|$)",
          "replacement": "علوم القرآن هي: مباحث تتعلق بالقرآن الكريم من حيث نزوله وترتيبه وجمعه وكتابته وقراءته وتفسيره وإعجازه وناسخه ومنسوخه ودفع الشبه عنه.",
        },
        {
          "flags": "g",
          "pattern": "م[\\u064B-\\u0652\\u0670]*ن[\\u064B-\\u0652\\u0670]*[ \\t]+ت[\\u064B-\\u0652\\u0670]*ق[\\u064B-\\u0652\\u0670]*و[\\u064B-\\u0652\\u0670]*ت[\\u064B-\\u0652\\u0670]*",
          "replacement": "مِن تَفَاوُتٍ",
        },
        {
          "flags": "g",
          "pattern": "(?:جواب[ \\t]+الأمر[:\\s]+)?ب[\\u064B-\\u0652\\u0670]*ق[\\u064B-\\u0652\\u0670]*ل[\\u064B-\\u0652\\u0670]*ب[\\u064B-\\u0652\\u0670]*|جواب[ \\t]+الأمر[ \\t]+﴿?ب[\\u064B-\\u0652\\u0670]*ق[\\u064B-\\u0652\\u0670]*ل[\\u064B-\\u0652\\u0670]*ب[\\u064B-\\u0652\\u0670]*﴾?|﴿ب[\\u064B-\\u0652\\u0670]*ق[\\u064B-\\u0652\\u0670]*ل[\\u064B-\\u0652\\u0670]*ب[\\u064B-\\u0652\\u0670]*﴾(?=[ \\t]*(?:جواب|فعل|مجزوم))",
          "replacement": "يَنقَلِبْ",
        },
        {
          "flags": "g",
          "pattern": "ا[\\u064B-\\u0652\\u0670]*ل[\\u064B-\\u0652\\u0670]*ب[\\u064B-\\u0652\\u0670]*ص[\\u064B-\\u0652\\u0670]*ر[\\u064B-\\u0652\\u0670]*[ \\t]+خ[\\u064B-\\u0652\\u0670]*ا[\\u064B-\\u0652\\u0670]*ش[\\u064B-\\u0652\\u0670]*ع[\\u064B-\\u0652\\u0670]*ا[\\u064B-\\u0652\\u0670]*|ا[\\u064B-\\u0652\\u0670]*ل[\\u064B-\\u0652\\u0670]*ب[\\u064B-\\u0652\\u0670]*ص[\\u064B-\\u0652\\u0670]*ر[\\u064B-\\u0652\\u0670]*[ \\t]+خ[\\u064B-\\u0652\\u0670]*ا[\\u064B-\\u0652\\u0670]*ش[\\u064B-\\u0652\\u0670]*ع[\\u064B-\\u0652\\u0670]*ا[\\u064B-\\u0652\\u0670]*|ا[\\u064B-\\u0652\\u0670]*ل[\\u064B-\\u0652\\u0670]*ب[\\u064B-\\u0652\\u0670]*ص[\\u064B-\\u0652\\u0670]*ر[\\u064B-\\u0652\\u0670]*[ \\t]+خ[\\u064B-\\u0652\\u0670]*ا[\\u064B-\\u0652\\u0670]*ش[\\u064B-\\u0652\\u0670]*ع[\\u064B-\\u0652\\u0670]*ا[\\u064B-\\u0652\\u0670]*|ا[\\u064B-\\u0652\\u0670]*ل[\\u064B-\\u0652\\u0670]*ب[\\u064B-\\u0652\\u0670]*ص[\\u064B-\\u0652\\u0670]*ر[\\u064B-\\u0652\\u0670]*[ \\t]+خ[\\u064B-\\u0652\\u0670]*ا[\\u064B-\\u0652\\u0670]*ش[\\u064B-\\u0652\\u0670]*ع[\\u064B-\\u0652\\u0670]*ا[\\u064B-\\u0652\\u0670]*",
          "replacement": "الْبَصَرُ خَاسِئًا",
        },
        {
          "flags": "g",
          "pattern": "أ[\\u064B-\\u0652\\u0670]*ن[\\u064B-\\u0652\\u0670]*[ \\t]+ي[\\u064B-\\u0652\\u0670]*خ[\\u064B-\\u0652\\u0670]*ي[\\u064B-\\u0652\\u0670]*ف[\\u064B-\\u0652\\u0670]*|أن[ \\t]+يخيف|أ[\\u064B-\\u0652\\u0670]*ن[\\u064B-\\u0652\\u0670]*[ \\t]+يخيف",
          "replacement": "أَن يَخْسِفَ",
        },
        {
          "flags": "g",
          "pattern": "ي[\\u064B-\\u0652\\u0670]*ع[\\u064B-\\u0652\\u0670]*م[\\u064B-\\u0652\\u0670]*و[\\u064B-\\u0652\\u0670]*ا[\\u064B-\\u0652\\u0670]*[ \\t]+ع[\\u064B-\\u0652\\u0670]*م[\\u064B-\\u0652\\u0670]*ه[\\u064B-\\u0652\\u0670]*ا[\\u064B-\\u0652\\u0670]*|يعموا[ \\t]+ع[\\u064B-\\u0652\\u0670]*م[\\u064B-\\u0652\\u0670]*ه[\\u064B-\\u0652\\u0670]*ا[\\u064B-\\u0652\\u0670]*|يعموا[ \\t]+عمه",
          "replacement": "سَمِعُوا لَهَا شَهِيقًا",
        },
        {
          "flags": "g",
          "pattern": "أ[\\u064B-\\u0652\\u0670]*ل[\\u064B-\\u0652\\u0670]*ي[\\u064B-\\u0652\\u0670]*أ[\\u064B-\\u0652\\u0670]*ت[\\u064B-\\u0652\\u0670]*ي[\\u064B-\\u0652\\u0670]*ك[\\u064B-\\u0652\\u0670]*م[\\u064B-\\u0652\\u0670]*[ \\t]+ن[\\u064B-\\u0652\\u0670]*ذ[\\u064B-\\u0652\\u0670]*ي[\\u064B-\\u0652\\u0670]*ر[\\u064B-\\u0652\\u0670]*|أليأتيكم[ \\t]+نذير|أ[\\u064B-\\u0652\\u0670]*ل[\\u064B-\\u0652\\u0670]*ي[\\u064B-\\u0652\\u0670]*أ[\\u064B-\\u0652\\u0670]*ت[\\u064B-\\u0652\\u0670]*ي[\\u064B-\\u0652\\u0670]*ك[\\u064B-\\u0652\\u0670]*م[\\u064B-\\u0652\\u0670]*[ \\t]+ن[\\u064B-\\u0652\\u0670]*ذ[\\u064B-\\u0652\\u0670]*ي[\\u064B-\\u0652\\u0670]*ر[\\u064B-\\u0652\\u0670]*",
          "replacement": "أَلَمْ يَأْتِكُمْ نَذِيرٌ",
        },
        {
          "flags": "g",
          "pattern": "ص[\\u064B-\\u0652\\u0670]*ن[\\u064B-\\u0652\\u0670]*ف[\\u064B-\\u0652\\u0670]*ت[\\u064B-\\u0652\\u0670]*|صنفت(?=[ \\t]*[،:]|[ \\t]+معنى|[ \\t]+في قوله)",
          "replacement": "صَافَّاتٍ",
        },
        {
          "flags": "g",
          "pattern": "راوية[ \\t]+ابن[ \\t]+ماجه",
          "replacement": "رواية ابن ماجه",
        },
        {
          "flags": "g",
          "pattern": "النساء[ \\t]+الرجال(?=[ \\t]*[،.\\n]|$)|النساء[ \\t]+\\[\\.\\.\\.\\][ \\t]+الرجال",
          "replacement": "النساء شقائق الرجال",
        },
        {
          "flags": "g",
          "pattern": "\\(\\s*فارس[ \\t]*-[ \\t]*الروم[ \\t]*-[ \\t]*مصر\\s*\\)(?=[ \\t]*\\n|\\.\\.\\.)",
          "replacement": "سؤال الاختيارات: فتحت في عهد عمر بن الخطاب رضي الله عنه بلاد: (فارس - الروم - مصر)",
        },
        {
          "flags": "g",
          "pattern": "وعن[ \\t]+لبن[ \\t]+في[ \\t]+ضرع[،,\\s]+وعن[ \\t]+لبن[ \\t]+في[ \\t]+ضرع",
          "replacement": "وعن لبن في ضرع",
        },
        {
          "flags": "gm",
          "pattern": "بيع[ \\t]+الحاضر[ \\t]+للبادي(?=[ \\t]*\\n[ \\t]*$|$)",
          "replacement": "بيع الحاضر للبادي: وهو أن يقدم القروي بمتاعه لبيعه بسعر يومه فيقول له البلدي: اتركه عندي لأبيعه لك على التدريج بأغلى؛ وعلة النهي: لئلا يتضرر أهل البلد.",
        },
        {
          "flags": "g",
          "pattern": "كفته[ \\t]+نيتة",
          "replacement": "كفته نيته",
        },
        {
          "flags": "gm",
          "pattern": "والمراد[ \\t]+من[ \\t]+ذلك[ \\t]+الجنس[ \\t]+الصادق[ \\t]+بـ\\s*\\.{0,}\\s*$",
          "replacement": "والمراد من ذلك الجنس الصادق بالمخيط المحيط كقميص وجبة وسراويل وخف، فيحرم لبسه على المحرم ذكراً كان بالاتفاق.",
        },
        {
          "flags": "g",
          "pattern": "(?:\\.{10,}[ \\t]*\\n*){2,}|(?:\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.\\.)",
          "replacement": "..... [تم تطهير سيل النقاط وإعادة النصوص المحذوفة] .....",
        },
      ]
    `);
  });
});

describe('C. source B — KNOWN_OCR_CANONICAL_TARGETS (src/utils/quranicVerificationAgent.ts)', () => {
  it('is sliced from the real source; its size and location are pinned', () => {
    expect(TABLE_B.length).toMatchInlineSnapshot(`14`);
  });

  it('B_TABLE: trigger pattern + replacement for every target', () => {
    expect(
      TABLE_B.map(t => ({
        pattern: t.triggerPattern.source,
        flags: t.triggerPattern.flags,
        replacement: t.replacementUthmani,
        wrappedByAgent: `﴿${t.replacementUthmani}﴾`,
      })),
    ).toMatchInlineSnapshot(`
      [
        {
          "flags": "g",
          "pattern": "لّ?ِيَنِينَ|لينين",
          "replacement": "لَّابِثِينَ",
          "wrappedByAgent": "﴿لَّابِثِينَ﴾",
        },
        {
          "flags": "g",
          "pattern": "إذا\\s+السماء\\s+انشقت|اذا\\s+السماء\\s+انشقت|السماء\\s+انشقت",
          "replacement": "إِذَا السَّمَاءُ انشَقَّتْ",
          "wrappedByAgent": "﴿إِذَا السَّمَاءُ انشَقَّتْ﴾",
        },
        {
          "flags": "g",
          "pattern": "إذا\\s+السماء\\s+انفطرت|اذا\\s+السماء\\s+انفطرت|السماء\\s+انفطرت",
          "replacement": "إِذَا السَّمَاءُ انفَطَرَتْ",
          "wrappedByAgent": "﴿إِذَا السَّمَاءُ انفَطَرَتْ﴾",
        },
        {
          "flags": "g",
          "pattern": "مَقَامًا(?=[ \\t]+مَفْعَل|مفعل[ \\t]+من[ \\t]+الفوز)",
          "replacement": "مَفَازًا",
          "wrappedByAgent": "﴿مَفَازًا﴾",
        },
        {
          "flags": "g",
          "pattern": "سِبَاعًا(?=[ \\t]+شِدَادًا)|﴿سِبَاعًا﴾(?=[ \\t]+﴿?شِدَادًا﴾?)",
          "replacement": "سَبْعًا",
          "wrappedByAgent": "﴿سَبْعًا﴾",
        },
        {
          "flags": "g",
          "pattern": "أَنَاصَبَنَا[ \\t]+(?:الْمَاءَ|الماء)|أَنَاصَبَنَا|أناصبنا",
          "replacement": "أَنَّا صَبَبْنَا الْمَاءَ صَبًّا",
          "wrappedByAgent": "﴿أَنَّا صَبَبْنَا الْمَاءَ صَبًّا﴾",
        },
        {
          "flags": "g",
          "pattern": "فَسَتُعْفِيهِ[ \\t]+(?:الذِّكْرَىٰ?|الذكرى)|فستعفيه",
          "replacement": "أَوْ يَذَّكَّرُ فَتَنفَعَهُ الذِّكْرَىٰ",
          "wrappedByAgent": "﴿أَوْ يَذَّكَّرُ فَتَنفَعَهُ الذِّكْرَىٰ﴾",
        },
        {
          "flags": "g",
          "pattern": "معنى[ \\t]+﴿?غُرْفَةً﴾?[ \\t]+مبالغة",
          "replacement": "غَرْقًا",
          "wrappedByAgent": "﴿غَرْقًا﴾",
        },
        {
          "flags": "g",
          "pattern": "مَن[ \\t]+تَقُوتُ|مِن[ \\t]+تَقُوتُ|من[ \\t]+تقوت",
          "replacement": "مِن تَفَاوُتٍ",
          "wrappedByAgent": "﴿مِن تَفَاوُتٍ﴾",
        },
        {
          "flags": "g",
          "pattern": "الْبَصَرُ[ \\t]+خَاشِعًا|البصر[ \\t]+خاشعا",
          "replacement": "خَاسِئًا",
          "wrappedByAgent": "﴿خَاسِئًا﴾",
        },
        {
          "flags": "g",
          "pattern": "أَن[ \\t]+يَخِيفَ",
          "replacement": "أَن يَخْسِفَ",
          "wrappedByAgent": "﴿أَن يَخْسِفَ﴾",
        },
        {
          "flags": "g",
          "pattern": "يَعْمَوْا[ \\t]+عَمَهًا",
          "replacement": "سَمِعُوا لَهَا شَهِيقًا وَهِيَ تَفُورُ",
          "wrappedByAgent": "﴿سَمِعُوا لَهَا شَهِيقًا وَهِيَ تَفُورُ﴾",
        },
        {
          "flags": "g",
          "pattern": "أَلَيَأْتِيكُم[ \\t]+نَذِيرٌ",
          "replacement": "أَلَمْ يَأْتِكُمْ نَذِيرٌ",
          "wrappedByAgent": "﴿أَلَمْ يَأْتِكُمْ نَذِيرٌ﴾",
        },
        {
          "flags": "g",
          "pattern": "معنى[ \\t]+كلمة[ \\t]+﴿?صَنَفَتْ﴾?|صَنَفَتْ[ \\t]+وَيَقْبِضْنَ",
          "replacement": "صَافَّاتٍ",
          "wrappedByAgent": "﴿صَافَّاتٍ﴾",
        },
      ]
    `);
  });
});

describe('C. source C — cleanMarkdown closure (server.ts)', () => {
  it('is compiled from the real closure and behaves as a function', () => {
    // Line numbers are reported, never asserted on: an unrelated edit above the closure shifts
    // them. What must hold is that the SLICE is the whole closure and that it is executable.
    expect(CLEAN_MARKDOWN.startLine).toBeGreaterThan(0);
    expect(CLEAN_MARKDOWN.source.trimStart().startsWith('const cleanMarkdown = (md: string) => {')).toBe(true);
    expect(CLEAN_MARKDOWN.source.trimEnd().endsWith('};')).toBe(true);
    expect(CLEAN_MARKDOWN.source).toContain('return cleaned.trim();');
    expect(CLEAN_MARKDOWN.resultName).toBe('cleanMarkdown');
    expect(CLEAN_MARKDOWN.inputName).toBe('md');
    expect(typeof CLEAN_MARKDOWN.fn('نص')).toBe('string');
    // The compiled closure really is the production one: it applies its own Azhar rules.
    expect(CLEAN_MARKDOWN.fn('تخريج: راوية ابن ماجه.')).toBe('تخريج: رواية ابن ماجه.');
  });

  it('C_TABLE: every .replace() pair inside cleanMarkdown, in source order', () => {
    expect(
      TABLE_C.map(p => ({ pattern: p.patternSource, flags: p.flags, replacement: p.replacement })),
    ).toMatchInlineSnapshot(`
      [
        {
          "flags": "g",
          "pattern": "\\s*---PAGE_BREAK---\\s*",
          "replacement": "

      ---PAGE_BREAK---

      ",
        },
        {
          "flags": "gi",
          "pattern": "<br\\s*\\/?>",
          "replacement": "
      ",
        },
        {
          "flags": "gi",
          "pattern": "<\\/br>",
          "replacement": "
      ",
        },
        {
          "flags": "gi",
          "pattern": "&nbsp;",
          "replacement": " ",
        },
        {
          "flags": "gi",
          "pattern": "<\\/?(span|div|p|b|strong|em|i)(?=[\\s/>])[^>]*>",
          "replacement": "",
        },
        {
          "flags": "gmi",
          "pattern": "^[ \\t]*(الصفحة|Page)?[ \\t]*\\d+[ \\t]*$",
          "replacement": "",
        },
        {
          "flags": "g",
          "pattern": "\\[\\^[\\s*]*\\]",
          "replacement": "<expression: ()>",
        },
        {
          "flags": "g",
          "pattern": "\\\\text\\{([^\\}]+)\\}",
          "replacement": "$1",
        },
        {
          "flags": "g",
          "pattern": "\\u200B",
          "replacement": "",
        },
        {
          "flags": "gm",
          "pattern": "[ \\t]+$",
          "replacement": "",
        },
        {
          "flags": "g",
          "pattern": "\\n[ \\t]+\\n",
          "replacement": "

      ",
        },
        {
          "flags": "g",
          "pattern": "\\n{3,}",
          "replacement": "

      ",
        },
        {
          "flags": "gm",
          "pattern": "^-{2,}$",
          "replacement": "---",
        },
        {
          "flags": "g",
          "pattern": "\\n---\\n---\\n",
          "replacement": "
      ---
      ",
        },
        {
          "flags": "g",
          "pattern": "\\.{6,}",
          "replacement": ".....",
        },
        {
          "flags": "gm",
          "pattern": "^[ \\t]*(\\.[ \\t]*){5,}$",
          "replacement": ".....",
        },
        {
          "flags": "g",
          "pattern": "(\\n[ \\t]*\\.\\.\\.\\.\\.[ \\t]*){2,}",
          "replacement": "
      .....
      ",
        },
        {
          "flags": "g",
          "pattern": "وعن[ \\t]+لبن[ \\t]+في[ \\t]+ضرع[،,\\s]+وعن[ \\t]+لبن[ \\t]+في[ \\t]+ضرع",
          "replacement": "وعن لبن في ضرع",
        },
        {
          "flags": "g",
          "pattern": "راوية[ \\t]+ابن[ \\t]+ماجه",
          "replacement": "رواية ابن ماجه",
        },
        {
          "flags": "g",
          "pattern": "النساء[ \\t]+الرجال(?=[ \\t]*[،.\\n]|$)",
          "replacement": "النساء شقائق الرجال",
        },
        {
          "flags": "g",
          "pattern": "كفته[ \\t]+نيتة",
          "replacement": "كفته نيته",
        },
        {
          "flags": "g",
          "pattern": "مَن[ \\t]+تَقُوتُ|مِن[ \\t]+تَقُوتُ",
          "replacement": "﴿مِن تَفَاوُتٍ﴾",
        },
        {
          "flags": "g",
          "pattern": "جواب[ \\t]+الأمر[:\\s]+﴿?بِقَلْبٍ﴾?",
          "replacement": "جواب الأمر: ﴿يَنقَلِبْ﴾",
        },
        {
          "flags": "g",
          "pattern": "الْبَصَرُ[ \\t]+خَاشِعًا|الْبَصَرُ[ \\t]+خاشعا",
          "replacement": "الْبَصَرُ خَاسِئًا",
        },
        {
          "flags": "g",
          "pattern": "أَن[ \\t]+يَخِيفَ",
          "replacement": "أَن يَخْسِفَ",
        },
        {
          "flags": "g",
          "pattern": "يَعْمَوْا[ \\t]+عَمَهًا",
          "replacement": "سَمِعُوا لَهَا شَهِيقًا",
        },
        {
          "flags": "g",
          "pattern": "أَلَيَأْتِيكُم[ \\t]+نَذِيرٌ",
          "replacement": "أَلَمْ يَأْتِكُمْ نَذِيرٌ",
        },
        {
          "flags": "g",
          "pattern": "معنى[ \\t]+كلمة[ \\t]+﴿?صَنَفَتْ﴾?",
          "replacement": "معنى كلمة ﴿صَافَّاتٍ﴾",
        },
        {
          "flags": "g",
          "pattern": "فِي[ \\t]+مَنَاكِلِهَا",
          "replacement": "فِي مَنَاكِبِهَا",
        },
        {
          "flags": "g",
          "pattern": "تَمَيَّزُ[ \\t]+مِنَ[ \\t]+الْفَيْضِ",
          "replacement": "تَمَيَّزُ مِنَ الْغَيْظِ",
        },
        {
          "flags": "g",
          "pattern": "فَصُحْقًا",
          "replacement": "فَسُحْقًا",
        },
        {
          "flags": "g",
          "pattern": "﴿{2,}",
          "replacement": "﴿",
        },
        {
          "flags": "g",
          "pattern": "﴾{2,}",
          "replacement": "﴾",
        },
      ]
    `);
  });
});

/* ============================================================================================
 * THE DIVERGENCE MATRIX
 *
 * Each entry names one logical rule and points at the row in each table that implements it.
 * `null` means the source has no such rule. `disagreement` is computed, not asserted by hand.
 * ========================================================================================== */

interface DivergenceRow {
  /** Logical rule name, used only for reporting. */
  rule: string;
  /** Index into TABLE_A, or null when source A has no such rule. */
  a: number | null;
  /** Index into TABLE_B, or null when source B has no such rule. */
  b: number | null;
  /** Index into TABLE_C, or null when source C has no such rule. */
  c: number | null;
}

/**
 * Row indices are FOUND, not hard-coded, so the matrix keeps pointing at the right rule after
 * a rule is inserted or reordered. Each locator is a distinctive literal in that source's
 * pattern text.
 */
/**
 * Reduces a pattern or a needle to its CONSONANT SPINE for matching.
 *
 * The canonical rules now spell their Arabic with diacritics made optional, so a rule's
 * pattern source looks like `ت[\u064B-\u0652\u0670]*ق[\u064B-\u0652\u0670]*و...` rather than a
 * literal `تَقُوتُ`. A vocalized needle therefore no longer appears verbatim in the source,
 * and a naive `includes` returns -1 and silently repoints a divergence row at nothing.
 *
 * Two things are removed: the harakat themselves, and the tolerant-class scaffolding that
 * stands in for them. What is left is the ordered sequence of base letters — the only part
 * of the pattern that identifies WHICH rule it is, independent of how that rule chooses to
 * spell its vowels.
 */
const toConsonantSpine = (s: string): string =>
  s
    // The tolerant haraka class as it appears LITERALLY in pattern.source:
    // the text `[` + backslash + `u064B-\u0652` + backslash + `u0670` + `]*`.
    .replace(/\[\\u064B-\\u0652\\u0670\]\*/g, '')
    .replace(/\[\\u064B-\\u0652\\u0670\]/g, '')
    // Literal harakat characters, in case a rule still spells them out.
    .replace(/[\u064B-\u0652\u0670]/g, '');

const stripHarakat = toConsonantSpine;

const findA = (needle: string) => {
  const target = stripHarakat(needle);
  return TABLE_A.findIndex((r) => stripHarakat(r.pattern.source).includes(target));
};
const findB = (needle: string) => {
  const target = stripHarakat(needle);
  return TABLE_B.findIndex((t) => stripHarakat(t.triggerPattern.source).includes(target));
};
const findC = (needle: string) => {
  const target = stripHarakat(needle);
  return TABLE_C.findIndex((p) => stripHarakat(p.patternSource).includes(target));
};
const idx = (i: number) => (i === -1 ? null : i);

const DIVERGENCE: DivergenceRow[] = [
  { rule: 'وعن لبن في ضرع (duplicate table cell)', a: idx(findA('لبن')), b: idx(findB('لبن')), c: idx(findC('لبن')) },
  { rule: 'راوية ابن ماجه -> رواية ابن ماجه', a: idx(findA('راوية')), b: idx(findB('راوية')), c: idx(findC('راوية')) },
  { rule: 'النساء الرجال -> النساء شقائق الرجال', a: idx(findA('النساء')), b: idx(findB('النساء')), c: idx(findC('النساء')) },
  { rule: 'مِن تَقُوتُ -> مِن تَفَاوُتٍ', a: idx(findA('تَقُوتُ')), b: idx(findB('تَقُوتُ')), c: idx(findC('تَقُوتُ')) },
  { rule: 'يَعْمَوْا عَمَهًا (balagha, surah 67:7)', a: idx(findA('عَمَهًا')), b: idx(findB('عَمَهًا')), c: idx(findC('عَمَهًا')) },
  { rule: 'أَلَيَأْتِيكُم نَذِيرٌ (surah 67:8)', a: idx(findA('أَلَيَأْتِيكُم')), b: idx(findB('أَلَيَأْتِيكُم')), c: idx(findC('أَلَيَأْتِيكُم')) },
  { rule: 'صَنَفَتْ -> صَافَّاتٍ (surah 67:19)', a: idx(findA('صَنَفَتْ')), b: idx(findB('صَنَفَتْ')), c: idx(findC('صَنَفَتْ')) },
  { rule: 'كفته نيتة -> كفته نيته', a: idx(findA('نيتة')), b: idx(findB('نيتة')), c: idx(findC('نيتة')) },

  // Additional overlaps found while comparing, beyond the eight named in the brief.
  { rule: 'بِقَلْبٍ -> يَنقَلِبْ (surah 67:4)', a: idx(findA('بِقَلْبٍ')), b: idx(findB('بِقَلْبٍ')), c: idx(findC('بِقَلْبٍ')) },
  { rule: 'الْبَصَرُ خَاشِعًا -> خَاسِئًا (surah 67:4)', a: idx(findA('خَاشِع')), b: idx(findB('خَاشِع')), c: idx(findC('خَاشِع')) },
  { rule: 'أَن يَخِيفَ -> أَن يَخْسِفَ (surah 67:16)', a: idx(findA('يَخِيفَ')), b: idx(findB('يَخِيفَ')), c: idx(findC('يَخِيفَ')) },
  { rule: 'لِّيَنِينَ -> لَّابِثِينَ (surah 78:23)', a: idx(findA('يَنِينَ')), b: idx(findB('يَنِينَ')), c: idx(findC('يَنِينَ')) },
  { rule: 'مَقَامًا -> مَفَازًا (surah 78:31)', a: idx(findA('مَقَامًا')), b: idx(findB('مَقَامًا')), c: idx(findC('مَقَامًا')) },
  { rule: 'سِبَاعًا -> سَبْعًا (surah 78:12)', a: idx(findA('سِبَاعًا')), b: idx(findB('سِبَاعًا')), c: idx(findC('سِبَاعًا')) },
  { rule: 'أَنَاصَبَنَا -> أَنَّا صَبَبْنَا (surah 80:25)', a: idx(findA('أَنَاصَبَنَا')), b: idx(findB('أَنَاصَبَنَا')), c: idx(findC('أَنَاصَبَنَا')) },
  { rule: 'فَسَتُعْفِيهِ -> فَتَنفَعَهُ الذِّكْرَىٰ (surah 80:4)', a: idx(findA('فَسَتُعْفِيهِ')), b: idx(findB('فَسَتُعْفِيهِ')), c: idx(findC('فَسَتُعْفِيهِ')) },
  { rule: 'غُرْفَةً -> غَرْقًا (surah 79:1)', a: idx(findA('غُرْفَةً')), b: idx(findB('غُرْفَةً')), c: idx(findC('غُرْفَةً')) },
  { rule: 'بيع الحاضر للبادي (fiqh truncation)', a: idx(findA('الحاضر')), b: idx(findB('الحاضر')), c: idx(findC('الحاضر')) },
  { rule: '﴿ {2,} collapse (double-bracket sanitizer)', a: null, b: null, c: idx(findC('﴿{2,}')) },
];

function cell(row: DivergenceRow, src: 'A' | 'B' | 'C'): string | null {
  const i = row[src.toLowerCase() as 'a' | 'b' | 'c'];
  if (i === null) return null;
  if (src === 'A') {
    const r = TABLE_A[i];
    return `${r.pattern.source}  =>  ${emittedA(r)}`;
  }
  if (src === 'B') {
    const t = TABLE_B[i];
    return `${t.triggerPattern.source}  =>  ﴿${t.replacementUthmani}﴾`;
  }
  const p = TABLE_C[i];
  return `${p.patternSource}  =>  ${p.replacement}`;
}

describe('C. DIVERGENCE TABLE — every rule present in more than one source', () => {
  it('pins, per shared rule, each source\'s pattern and REPLACEMENT', () => {
    expect(
      DIVERGENCE.map(row => ({
        rule: row.rule,
        inA: row.a !== null,
        inB: row.b !== null,
        inC: row.c !== null,
        A_patternAndReplacement: cell(row, 'A'),
        B_patternAndReplacement: cell(row, 'B'),
        C_patternAndReplacement: cell(row, 'C'),
      })),
    ).toMatchInlineSnapshot(`
      [
        {
          "A_patternAndReplacement": "وعن[ \\t]+لبن[ \\t]+في[ \\t]+ضرع[،,\\s]+وعن[ \\t]+لبن[ \\t]+في[ \\t]+ضرع  =>  وعن لبن في ضرع",
          "B_patternAndReplacement": null,
          "C_patternAndReplacement": "وعن[ \\t]+لبن[ \\t]+في[ \\t]+ضرع[،,\\s]+وعن[ \\t]+لبن[ \\t]+في[ \\t]+ضرع  =>  وعن لبن في ضرع",
          "inA": true,
          "inB": false,
          "inC": true,
          "rule": "وعن لبن في ضرع (duplicate table cell)",
        },
        {
          "A_patternAndReplacement": "راوية[ \\t]+ابن[ \\t]+ماجه  =>  رواية ابن ماجه",
          "B_patternAndReplacement": null,
          "C_patternAndReplacement": "راوية[ \\t]+ابن[ \\t]+ماجه  =>  رواية ابن ماجه",
          "inA": true,
          "inB": false,
          "inC": true,
          "rule": "راوية ابن ماجه -> رواية ابن ماجه",
        },
        {
          "A_patternAndReplacement": "النساء[ \\t]+الرجال(?=[ \\t]*[،.\\n]|$)|النساء[ \\t]+\\[\\.\\.\\.\\][ \\t]+الرجال  =>  النساء شقائق الرجال",
          "B_patternAndReplacement": null,
          "C_patternAndReplacement": "النساء[ \\t]+الرجال(?=[ \\t]*[،.\\n]|$)  =>  النساء شقائق الرجال",
          "inA": true,
          "inB": false,
          "inC": true,
          "rule": "النساء الرجال -> النساء شقائق الرجال",
        },
        {
          "A_patternAndReplacement": "م[\\u064B-\\u0652\\u0670]*ن[\\u064B-\\u0652\\u0670]*[ \\t]+ت[\\u064B-\\u0652\\u0670]*ق[\\u064B-\\u0652\\u0670]*و[\\u064B-\\u0652\\u0670]*ت[\\u064B-\\u0652\\u0670]*  =>  ﴿مِن تَفَاوُتٍ﴾",
          "B_patternAndReplacement": "مَن[ \\t]+تَقُوتُ|مِن[ \\t]+تَقُوتُ|من[ \\t]+تقوت  =>  ﴿مِن تَفَاوُتٍ﴾",
          "C_patternAndReplacement": "مَن[ \\t]+تَقُوتُ|مِن[ \\t]+تَقُوتُ  =>  ﴿مِن تَفَاوُتٍ﴾",
          "inA": true,
          "inB": true,
          "inC": true,
          "rule": "مِن تَقُوتُ -> مِن تَفَاوُتٍ",
        },
        {
          "A_patternAndReplacement": "ي[\\u064B-\\u0652\\u0670]*ع[\\u064B-\\u0652\\u0670]*م[\\u064B-\\u0652\\u0670]*و[\\u064B-\\u0652\\u0670]*ا[\\u064B-\\u0652\\u0670]*[ \\t]+ع[\\u064B-\\u0652\\u0670]*م[\\u064B-\\u0652\\u0670]*ه[\\u064B-\\u0652\\u0670]*ا[\\u064B-\\u0652\\u0670]*|يعموا[ \\t]+ع[\\u064B-\\u0652\\u0670]*م[\\u064B-\\u0652\\u0670]*ه[\\u064B-\\u0652\\u0670]*ا[\\u064B-\\u0652\\u0670]*|يعموا[ \\t]+عمه  =>  سَمِعُوا لَهَا شَهِيقًا",
          "B_patternAndReplacement": "يَعْمَوْا[ \\t]+عَمَهًا  =>  ﴿سَمِعُوا لَهَا شَهِيقًا وَهِيَ تَفُورُ﴾",
          "C_patternAndReplacement": "يَعْمَوْا[ \\t]+عَمَهًا  =>  سَمِعُوا لَهَا شَهِيقًا",
          "inA": true,
          "inB": true,
          "inC": true,
          "rule": "يَعْمَوْا عَمَهًا (balagha, surah 67:7)",
        },
        {
          "A_patternAndReplacement": "أ[\\u064B-\\u0652\\u0670]*ل[\\u064B-\\u0652\\u0670]*ي[\\u064B-\\u0652\\u0670]*أ[\\u064B-\\u0652\\u0670]*ت[\\u064B-\\u0652\\u0670]*ي[\\u064B-\\u0652\\u0670]*ك[\\u064B-\\u0652\\u0670]*م[\\u064B-\\u0652\\u0670]*[ \\t]+ن[\\u064B-\\u0652\\u0670]*ذ[\\u064B-\\u0652\\u0670]*ي[\\u064B-\\u0652\\u0670]*ر[\\u064B-\\u0652\\u0670]*|أليأتيكم[ \\t]+نذير|أ[\\u064B-\\u0652\\u0670]*ل[\\u064B-\\u0652\\u0670]*ي[\\u064B-\\u0652\\u0670]*أ[\\u064B-\\u0652\\u0670]*ت[\\u064B-\\u0652\\u0670]*ي[\\u064B-\\u0652\\u0670]*ك[\\u064B-\\u0652\\u0670]*م[\\u064B-\\u0652\\u0670]*[ \\t]+ن[\\u064B-\\u0652\\u0670]*ذ[\\u064B-\\u0652\\u0670]*ي[\\u064B-\\u0652\\u0670]*ر[\\u064B-\\u0652\\u0670]*  =>  أَلَمْ يَأْتِكُمْ نَذِيرٌ",
          "B_patternAndReplacement": "أَلَيَأْتِيكُم[ \\t]+نَذِيرٌ  =>  ﴿أَلَمْ يَأْتِكُمْ نَذِيرٌ﴾",
          "C_patternAndReplacement": "أَلَيَأْتِيكُم[ \\t]+نَذِيرٌ  =>  أَلَمْ يَأْتِكُمْ نَذِيرٌ",
          "inA": true,
          "inB": true,
          "inC": true,
          "rule": "أَلَيَأْتِيكُم نَذِيرٌ (surah 67:8)",
        },
        {
          "A_patternAndReplacement": "ص[\\u064B-\\u0652\\u0670]*ن[\\u064B-\\u0652\\u0670]*ف[\\u064B-\\u0652\\u0670]*ت[\\u064B-\\u0652\\u0670]*|صنفت(?=[ \\t]*[،:]|[ \\t]+معنى|[ \\t]+في قوله)  =>  صَافَّاتٍ",
          "B_patternAndReplacement": "معنى[ \\t]+كلمة[ \\t]+﴿?صَنَفَتْ﴾?|صَنَفَتْ[ \\t]+وَيَقْبِضْنَ  =>  ﴿صَافَّاتٍ﴾",
          "C_patternAndReplacement": "معنى[ \\t]+كلمة[ \\t]+﴿?صَنَفَتْ﴾?  =>  معنى كلمة ﴿صَافَّاتٍ﴾",
          "inA": true,
          "inB": true,
          "inC": true,
          "rule": "صَنَفَتْ -> صَافَّاتٍ (surah 67:19)",
        },
        {
          "A_patternAndReplacement": "كفته[ \\t]+نيتة  =>  كفته نيته",
          "B_patternAndReplacement": null,
          "C_patternAndReplacement": "كفته[ \\t]+نيتة  =>  كفته نيته",
          "inA": true,
          "inB": false,
          "inC": true,
          "rule": "كفته نيتة -> كفته نيته",
        },
        {
          "A_patternAndReplacement": "(?:جواب[ \\t]+الأمر[:\\s]+)?ب[\\u064B-\\u0652\\u0670]*ق[\\u064B-\\u0652\\u0670]*ل[\\u064B-\\u0652\\u0670]*ب[\\u064B-\\u0652\\u0670]*|جواب[ \\t]+الأمر[ \\t]+﴿?ب[\\u064B-\\u0652\\u0670]*ق[\\u064B-\\u0652\\u0670]*ل[\\u064B-\\u0652\\u0670]*ب[\\u064B-\\u0652\\u0670]*﴾?|﴿ب[\\u064B-\\u0652\\u0670]*ق[\\u064B-\\u0652\\u0670]*ل[\\u064B-\\u0652\\u0670]*ب[\\u064B-\\u0652\\u0670]*﴾(?=[ \\t]*(?:جواب|فعل|مجزوم))  =>  يَنقَلِبْ",
          "B_patternAndReplacement": null,
          "C_patternAndReplacement": "جواب[ \\t]+الأمر[:\\s]+﴿?بِقَلْبٍ﴾?  =>  جواب الأمر: ﴿يَنقَلِبْ﴾",
          "inA": true,
          "inB": false,
          "inC": true,
          "rule": "بِقَلْبٍ -> يَنقَلِبْ (surah 67:4)",
        },
        {
          "A_patternAndReplacement": "ا[\\u064B-\\u0652\\u0670]*ل[\\u064B-\\u0652\\u0670]*ب[\\u064B-\\u0652\\u0670]*ص[\\u064B-\\u0652\\u0670]*ر[\\u064B-\\u0652\\u0670]*[ \\t]+خ[\\u064B-\\u0652\\u0670]*ا[\\u064B-\\u0652\\u0670]*ش[\\u064B-\\u0652\\u0670]*ع[\\u064B-\\u0652\\u0670]*ا[\\u064B-\\u0652\\u0670]*|ا[\\u064B-\\u0652\\u0670]*ل[\\u064B-\\u0652\\u0670]*ب[\\u064B-\\u0652\\u0670]*ص[\\u064B-\\u0652\\u0670]*ر[\\u064B-\\u0652\\u0670]*[ \\t]+خ[\\u064B-\\u0652\\u0670]*ا[\\u064B-\\u0652\\u0670]*ش[\\u064B-\\u0652\\u0670]*ع[\\u064B-\\u0652\\u0670]*ا[\\u064B-\\u0652\\u0670]*|ا[\\u064B-\\u0652\\u0670]*ل[\\u064B-\\u0652\\u0670]*ب[\\u064B-\\u0652\\u0670]*ص[\\u064B-\\u0652\\u0670]*ر[\\u064B-\\u0652\\u0670]*[ \\t]+خ[\\u064B-\\u0652\\u0670]*ا[\\u064B-\\u0652\\u0670]*ش[\\u064B-\\u0652\\u0670]*ع[\\u064B-\\u0652\\u0670]*ا[\\u064B-\\u0652\\u0670]*|ا[\\u064B-\\u0652\\u0670]*ل[\\u064B-\\u0652\\u0670]*ب[\\u064B-\\u0652\\u0670]*ص[\\u064B-\\u0652\\u0670]*ر[\\u064B-\\u0652\\u0670]*[ \\t]+خ[\\u064B-\\u0652\\u0670]*ا[\\u064B-\\u0652\\u0670]*ش[\\u064B-\\u0652\\u0670]*ع[\\u064B-\\u0652\\u0670]*ا[\\u064B-\\u0652\\u0670]*  =>  ﴿الْبَصَرُ خَاسِئًا﴾",
          "B_patternAndReplacement": "الْبَصَرُ[ \\t]+خَاشِعًا|البصر[ \\t]+خاشعا  =>  ﴿خَاسِئًا﴾",
          "C_patternAndReplacement": "الْبَصَرُ[ \\t]+خَاشِعًا|الْبَصَرُ[ \\t]+خاشعا  =>  الْبَصَرُ خَاسِئًا",
          "inA": true,
          "inB": true,
          "inC": true,
          "rule": "الْبَصَرُ خَاشِعًا -> خَاسِئًا (surah 67:4)",
        },
        {
          "A_patternAndReplacement": "أ[\\u064B-\\u0652\\u0670]*ن[\\u064B-\\u0652\\u0670]*[ \\t]+ي[\\u064B-\\u0652\\u0670]*خ[\\u064B-\\u0652\\u0670]*ي[\\u064B-\\u0652\\u0670]*ف[\\u064B-\\u0652\\u0670]*|أن[ \\t]+يخيف|أ[\\u064B-\\u0652\\u0670]*ن[\\u064B-\\u0652\\u0670]*[ \\t]+يخيف  =>  ﴿أَن يَخْسِفَ﴾",
          "B_patternAndReplacement": "أَن[ \\t]+يَخِيفَ  =>  ﴿أَن يَخْسِفَ﴾",
          "C_patternAndReplacement": "أَن[ \\t]+يَخِيفَ  =>  أَن يَخْسِفَ",
          "inA": true,
          "inB": true,
          "inC": true,
          "rule": "أَن يَخِيفَ -> أَن يَخْسِفَ (surah 67:16)",
        },
        {
          "A_patternAndReplacement": "﴿?\\s*ل[\\u064B-\\u0652\\u0670]*ي[\\u064B-\\u0652\\u0670]*ن[\\u064B-\\u0652\\u0670]*ي[\\u064B-\\u0652\\u0670]*ن[\\u064B-\\u0652\\u0670]*\\s*﴾?|﴿?\\s*ل[\\u064B-\\u0652\\u0670]*ي[\\u064B-\\u0652\\u0670]*ن[\\u064B-\\u0652\\u0670]*ي[\\u064B-\\u0652\\u0670]*ن[\\u064B-\\u0652\\u0670]*\\s*﴾?  =>  ﴿لَّابِثِينَ﴾",
          "B_patternAndReplacement": "لّ?ِيَنِينَ|لينين  =>  ﴿لَّابِثِينَ﴾",
          "C_patternAndReplacement": null,
          "inA": true,
          "inB": true,
          "inC": false,
          "rule": "لِّيَنِينَ -> لَّابِثِينَ (surah 78:23)",
        },
        {
          "A_patternAndReplacement": "﴿?\\s*م[\\u064B-\\u0652\\u0670]*ق[\\u064B-\\u0652\\u0670]*ا[\\u064B-\\u0652\\u0670]*م[\\u064B-\\u0652\\u0670]*ا[\\u064B-\\u0652\\u0670]*\\s*﴾?(?=[ \\t]+م[\\u064B-\\u0652\\u0670]*ف[\\u064B-\\u0652\\u0670]*ع[\\u064B-\\u0652\\u0670]*ل[\\u064B-\\u0652\\u0670]*[ \\t]+م[\\u064B-\\u0652\\u0670]*ن[\\u064B-\\u0652\\u0670]*[ \\t]+ا[\\u064B-\\u0652\\u0670]*ل[\\u064B-\\u0652\\u0670]*ف[\\u064B-\\u0652\\u0670]*و[\\u064B-\\u0652\\u0670]*ز[\\u064B-\\u0652\\u0670]*|م[\\u064B-\\u0652\\u0670]*ف[\\u064B-\\u0652\\u0670]*ع[\\u064B-\\u0652\\u0670]*ل[\\u064B-\\u0652\\u0670]*[ \\t]+م[\\u064B-\\u0652\\u0670]*ن[\\u064B-\\u0652\\u0670]*[ \\t]+ا[\\u064B-\\u0652\\u0670]*ل[\\u064B-\\u0652\\u0670]*ف[\\u064B-\\u0652\\u0670]*و[\\u064B-\\u0652\\u0670]*ز[\\u064B-\\u0652\\u0670]*)|﴿?\\s*م[\\u064B-\\u0652\\u0670]*ق[\\u064B-\\u0652\\u0670]*ا[\\u064B-\\u0652\\u0670]*م[\\u064B-\\u0652\\u0670]*ا[\\u064B-\\u0652\\u0670]*\\s*﴾?[ \\t]+م[\\u064B-\\u0652\\u0670]*ف[\\u064B-\\u0652\\u0670]*ع[\\u064B-\\u0652\\u0670]*ل[\\u064B-\\u0652\\u0670]*[ \\t]+م[\\u064B-\\u0652\\u0670]*ن[\\u064B-\\u0652\\u0670]*[ \\t]+ا[\\u064B-\\u0652\\u0670]*ل[\\u064B-\\u0652\\u0670]*ف[\\u064B-\\u0652\\u0670]*و[\\u064B-\\u0652\\u0670]*ز[\\u064B-\\u0652\\u0670]*  =>  ﴿مَفَازًا﴾ مفعل من الفوز",
          "B_patternAndReplacement": "مَقَامًا(?=[ \\t]+مَفْعَل|مفعل[ \\t]+من[ \\t]+الفوز)  =>  ﴿مَفَازًا﴾",
          "C_patternAndReplacement": null,
          "inA": true,
          "inB": true,
          "inC": false,
          "rule": "مَقَامًا -> مَفَازًا (surah 78:31)",
        },
        {
          "A_patternAndReplacement": "س[\\u064B-\\u0652\\u0670]*ب[\\u064B-\\u0652\\u0670]*ا[\\u064B-\\u0652\\u0670]*ع[\\u064B-\\u0652\\u0670]*ا[\\u064B-\\u0652\\u0670]*(?=[ \\t]+ش[\\u064B-\\u0652\\u0670]*د[\\u064B-\\u0652\\u0670]*ا[\\u064B-\\u0652\\u0670]*د[\\u064B-\\u0652\\u0670]*ا[\\u064B-\\u0652\\u0670]*|ش[\\u064B-\\u0652\\u0670]*د[\\u064B-\\u0652\\u0670]*ا[\\u064B-\\u0652\\u0670]*د[\\u064B-\\u0652\\u0670]*ا[\\u064B-\\u0652\\u0670]*)|س[\\u064B-\\u0652\\u0670]*ب[\\u064B-\\u0652\\u0670]*ا[\\u064B-\\u0652\\u0670]*ع[\\u064B-\\u0652\\u0670]*ا[\\u064B-\\u0652\\u0670]*(?=[ \\t]+ش[\\u064B-\\u0652\\u0670]*د[\\u064B-\\u0652\\u0670]*ا[\\u064B-\\u0652\\u0670]*د[\\u064B-\\u0652\\u0670]*ا[\\u064B-\\u0652\\u0670]*|ش[\\u064B-\\u0652\\u0670]*د[\\u064B-\\u0652\\u0670]*ا[\\u064B-\\u0652\\u0670]*د[\\u064B-\\u0652\\u0670]*ا[\\u064B-\\u0652\\u0670]*)|﴿س[\\u064B-\\u0652\\u0670]*ب[\\u064B-\\u0652\\u0670]*ا[\\u064B-\\u0652\\u0670]*ع[\\u064B-\\u0652\\u0670]*ا[\\u064B-\\u0652\\u0670]*﴾(?=[ \\t]+﴿?ش[\\u064B-\\u0652\\u0670]*د[\\u064B-\\u0652\\u0670]*ا[\\u064B-\\u0652\\u0670]*د[\\u064B-\\u0652\\u0670]*ا[\\u064B-\\u0652\\u0670]*﴾?)  =>  ﴿سَبْعًا﴾",
          "B_patternAndReplacement": "سِبَاعًا(?=[ \\t]+شِدَادًا)|﴿سِبَاعًا﴾(?=[ \\t]+﴿?شِدَادًا﴾?)  =>  ﴿سَبْعًا﴾",
          "C_patternAndReplacement": null,
          "inA": true,
          "inB": true,
          "inC": false,
          "rule": "سِبَاعًا -> سَبْعًا (surah 78:12)",
        },
        {
          "A_patternAndReplacement": "﴿?\\s*(?:أ[\\u064B-\\u0652\\u0670]*ن[\\u064B-\\u0652\\u0670]*ا[\\u064B-\\u0652\\u0670]*ص[\\u064B-\\u0652\\u0670]*ب[\\u064B-\\u0652\\u0670]*ن[\\u064B-\\u0652\\u0670]*ا[\\u064B-\\u0652\\u0670]*|أناصبنا)(?:[ \\t]+ا[\\u064B-\\u0652\\u0670]*ل[\\u064B-\\u0652\\u0670]*م[\\u064B-\\u0652\\u0670]*ا[\\u064B-\\u0652\\u0670]*ء[\\u064B-\\u0652\\u0670]*|[ \\t]+الماء)?\\s*﴾?  =>  ﴿أَنَّا صَبَبْنَا الْمَاءَ صَبًّا﴾",
          "B_patternAndReplacement": "أَنَاصَبَنَا[ \\t]+(?:الْمَاءَ|الماء)|أَنَاصَبَنَا|أناصبنا  =>  ﴿أَنَّا صَبَبْنَا الْمَاءَ صَبًّا﴾",
          "C_patternAndReplacement": null,
          "inA": true,
          "inB": true,
          "inC": false,
          "rule": "أَنَاصَبَنَا -> أَنَّا صَبَبْنَا (surah 80:25)",
        },
        {
          "A_patternAndReplacement": "﴿?\\s*(?:ف[\\u064B-\\u0652\\u0670]*س[\\u064B-\\u0652\\u0670]*ت[\\u064B-\\u0652\\u0670]*ع[\\u064B-\\u0652\\u0670]*ف[\\u064B-\\u0652\\u0670]*ي[\\u064B-\\u0652\\u0670]*ه[\\u064B-\\u0652\\u0670]*|ف[\\u064B-\\u0652\\u0670]*س[\\u064B-\\u0652\\u0670]*ت[\\u064B-\\u0652\\u0670]*ع[\\u064B-\\u0652\\u0670]*ف[\\u064B-\\u0652\\u0670]*ي[\\u064B-\\u0652\\u0670]*ه[\\u064B-\\u0652\\u0670]*)[ \\t]+(?:ا[\\u064B-\\u0652\\u0670]*ل[\\u064B-\\u0652\\u0670]*ذ[\\u064B-\\u0652\\u0670]*ك[\\u064B-\\u0652\\u0670]*ر[\\u064B-\\u0652\\u0670]*ى[\\u064B-\\u0652\\u0670]*?|الذكرى)\\s*﴾?  =>  ﴿فَتَنفَعَهُ الذِّكْرَىٰ﴾",
          "B_patternAndReplacement": "فَسَتُعْفِيهِ[ \\t]+(?:الذِّكْرَىٰ?|الذكرى)|فستعفيه  =>  ﴿أَوْ يَذَّكَّرُ فَتَنفَعَهُ الذِّكْرَىٰ﴾",
          "C_patternAndReplacement": null,
          "inA": true,
          "inB": true,
          "inC": false,
          "rule": "فَسَتُعْفِيهِ -> فَتَنفَعَهُ الذِّكْرَىٰ (surah 80:4)",
        },
        {
          "A_patternAndReplacement": "معنى[ \\t]+﴿?غ[\\u064B-\\u0652\\u0670]*ر[\\u064B-\\u0652\\u0670]*ف[\\u064B-\\u0652\\u0670]*ة[\\u064B-\\u0652\\u0670]*﴾?[ \\t]+مبالغة[ \\t]+في[ \\t]+النزع|معنى[ \\t]+﴿?غرفة﴾?[ \\t]+مبالغة  =>  ﴿معنى ﴿غَرْقًا﴾ مبالغة في النزع﴾",
          "B_patternAndReplacement": "معنى[ \\t]+﴿?غُرْفَةً﴾?[ \\t]+مبالغة  =>  ﴿غَرْقًا﴾",
          "C_patternAndReplacement": null,
          "inA": true,
          "inB": true,
          "inC": false,
          "rule": "غُرْفَةً -> غَرْقًا (surah 79:1)",
        },
        {
          "A_patternAndReplacement": "بيع[ \\t]+الحاضر[ \\t]+للبادي(?=[ \\t]*\\n[ \\t]*$|$)  =>  بيع الحاضر للبادي: وهو أن يقدم القروي بمتاعه لبيعه بسعر يومه فيقول له البلدي: اتركه عندي لأبيعه لك على التدريج بأغلى؛ وعلة النهي: لئلا يتضرر أهل البلد.",
          "B_patternAndReplacement": null,
          "C_patternAndReplacement": null,
          "inA": true,
          "inB": false,
          "inC": false,
          "rule": "بيع الحاضر للبادي (fiqh truncation)",
        },
        {
          "A_patternAndReplacement": null,
          "B_patternAndReplacement": null,
          "C_patternAndReplacement": "﴿{2,}  =>  ﴿",
          "inA": false,
          "inB": false,
          "inC": true,
          "rule": "﴿ {2,} collapse (double-bracket sanitizer)",
        },
      ]
    `);
  });

  it('COMPUTED AGREEMENT: replacement strings compared pairwise, where both exist', () => {
    // This is the assertion that matters: it is computed from the tables at runtime, so it
    // keeps reporting the truth after any edit, instead of freezing one hand-checked verdict.
    expect(
      DIVERGENCE.filter(r => [r.a, r.b, r.c].filter(v => v !== null).length >= 2).map(row => {
        const a = row.a !== null ? emittedA(TABLE_A[row.a]) : null;
        const b = row.b !== null ? `﴿${TABLE_B[row.b].replacementUthmani}﴾` : null;
        const c = row.c !== null ? TABLE_C[row.c].replacement : null;
        const present = [a, b, c].filter(v => v !== null) as string[];
        return {
          rule: row.rule,
          sources: [row.a !== null && 'A', row.b !== null && 'B', row.c !== null && 'C'].filter(Boolean).join('+'),
          allReplacementsIdentical: new Set(present).size === 1,
          replacementCount: new Set(present).size,
        };
      }),
    ).toMatchInlineSnapshot(`
      [
        {
          "allReplacementsIdentical": true,
          "replacementCount": 1,
          "rule": "وعن لبن في ضرع (duplicate table cell)",
          "sources": "A+C",
        },
        {
          "allReplacementsIdentical": true,
          "replacementCount": 1,
          "rule": "راوية ابن ماجه -> رواية ابن ماجه",
          "sources": "A+C",
        },
        {
          "allReplacementsIdentical": true,
          "replacementCount": 1,
          "rule": "النساء الرجال -> النساء شقائق الرجال",
          "sources": "A+C",
        },
        {
          "allReplacementsIdentical": true,
          "replacementCount": 1,
          "rule": "مِن تَقُوتُ -> مِن تَفَاوُتٍ",
          "sources": "A+B+C",
        },
        {
          "allReplacementsIdentical": false,
          "replacementCount": 2,
          "rule": "يَعْمَوْا عَمَهًا (balagha, surah 67:7)",
          "sources": "A+B+C",
        },
        {
          "allReplacementsIdentical": false,
          "replacementCount": 2,
          "rule": "أَلَيَأْتِيكُم نَذِيرٌ (surah 67:8)",
          "sources": "A+B+C",
        },
        {
          "allReplacementsIdentical": false,
          "replacementCount": 3,
          "rule": "صَنَفَتْ -> صَافَّاتٍ (surah 67:19)",
          "sources": "A+B+C",
        },
        {
          "allReplacementsIdentical": true,
          "replacementCount": 1,
          "rule": "كفته نيتة -> كفته نيته",
          "sources": "A+C",
        },
        {
          "allReplacementsIdentical": false,
          "replacementCount": 2,
          "rule": "بِقَلْبٍ -> يَنقَلِبْ (surah 67:4)",
          "sources": "A+C",
        },
        {
          "allReplacementsIdentical": false,
          "replacementCount": 3,
          "rule": "الْبَصَرُ خَاشِعًا -> خَاسِئًا (surah 67:4)",
          "sources": "A+B+C",
        },
        {
          "allReplacementsIdentical": false,
          "replacementCount": 2,
          "rule": "أَن يَخِيفَ -> أَن يَخْسِفَ (surah 67:16)",
          "sources": "A+B+C",
        },
        {
          "allReplacementsIdentical": true,
          "replacementCount": 1,
          "rule": "لِّيَنِينَ -> لَّابِثِينَ (surah 78:23)",
          "sources": "A+B",
        },
        {
          "allReplacementsIdentical": false,
          "replacementCount": 2,
          "rule": "مَقَامًا -> مَفَازًا (surah 78:31)",
          "sources": "A+B",
        },
        {
          "allReplacementsIdentical": true,
          "replacementCount": 1,
          "rule": "سِبَاعًا -> سَبْعًا (surah 78:12)",
          "sources": "A+B",
        },
        {
          "allReplacementsIdentical": true,
          "replacementCount": 1,
          "rule": "أَنَاصَبَنَا -> أَنَّا صَبَبْنَا (surah 80:25)",
          "sources": "A+B",
        },
        {
          "allReplacementsIdentical": false,
          "replacementCount": 2,
          "rule": "فَسَتُعْفِيهِ -> فَتَنفَعَهُ الذِّكْرَىٰ (surah 80:4)",
          "sources": "A+B",
        },
        {
          "allReplacementsIdentical": false,
          "replacementCount": 2,
          "rule": "غُرْفَةً -> غَرْقًا (surah 79:1)",
          "sources": "A+B",
        },
      ]
    `);
  });

  it('COMPUTED AGREEMENT: pattern sources compared pairwise, where both exist', () => {
    // Patterns differ far more often than replacements do, and a narrower pattern is a silent
    // miss rather than a wrong output — so it is tracked separately.
    expect(
      DIVERGENCE.filter(r => [r.a, r.b, r.c].filter(v => v !== null).length >= 2).map(row => {
        const a = row.a !== null ? TABLE_A[row.a].pattern.source : null;
        const b = row.b !== null ? TABLE_B[row.b].triggerPattern.source : null;
        const c = row.c !== null ? TABLE_C[row.c].patternSource : null;
        const present = [a, b, c].filter(v => v !== null) as string[];
        return {
          rule: row.rule,
          allPatternsIdentical: new Set(present).size === 1,
          distinctPatternCount: new Set(present).size,
        };
      }),
    ).toMatchInlineSnapshot(`
      [
        {
          "allPatternsIdentical": true,
          "distinctPatternCount": 1,
          "rule": "وعن لبن في ضرع (duplicate table cell)",
        },
        {
          "allPatternsIdentical": true,
          "distinctPatternCount": 1,
          "rule": "راوية ابن ماجه -> رواية ابن ماجه",
        },
        {
          "allPatternsIdentical": false,
          "distinctPatternCount": 2,
          "rule": "النساء الرجال -> النساء شقائق الرجال",
        },
        {
          "allPatternsIdentical": false,
          "distinctPatternCount": 3,
          "rule": "مِن تَقُوتُ -> مِن تَفَاوُتٍ",
        },
        {
          "allPatternsIdentical": false,
          "distinctPatternCount": 2,
          "rule": "يَعْمَوْا عَمَهًا (balagha, surah 67:7)",
        },
        {
          "allPatternsIdentical": false,
          "distinctPatternCount": 2,
          "rule": "أَلَيَأْتِيكُم نَذِيرٌ (surah 67:8)",
        },
        {
          "allPatternsIdentical": false,
          "distinctPatternCount": 3,
          "rule": "صَنَفَتْ -> صَافَّاتٍ (surah 67:19)",
        },
        {
          "allPatternsIdentical": true,
          "distinctPatternCount": 1,
          "rule": "كفته نيتة -> كفته نيته",
        },
        {
          "allPatternsIdentical": false,
          "distinctPatternCount": 2,
          "rule": "بِقَلْبٍ -> يَنقَلِبْ (surah 67:4)",
        },
        {
          "allPatternsIdentical": false,
          "distinctPatternCount": 3,
          "rule": "الْبَصَرُ خَاشِعًا -> خَاسِئًا (surah 67:4)",
        },
        {
          "allPatternsIdentical": false,
          "distinctPatternCount": 2,
          "rule": "أَن يَخِيفَ -> أَن يَخْسِفَ (surah 67:16)",
        },
        {
          "allPatternsIdentical": false,
          "distinctPatternCount": 2,
          "rule": "لِّيَنِينَ -> لَّابِثِينَ (surah 78:23)",
        },
        {
          "allPatternsIdentical": false,
          "distinctPatternCount": 2,
          "rule": "مَقَامًا -> مَفَازًا (surah 78:31)",
        },
        {
          "allPatternsIdentical": false,
          "distinctPatternCount": 2,
          "rule": "سِبَاعًا -> سَبْعًا (surah 78:12)",
        },
        {
          "allPatternsIdentical": false,
          "distinctPatternCount": 2,
          "rule": "أَنَاصَبَنَا -> أَنَّا صَبَبْنَا (surah 80:25)",
        },
        {
          "allPatternsIdentical": false,
          "distinctPatternCount": 2,
          "rule": "فَسَتُعْفِيهِ -> فَتَنفَعَهُ الذِّكْرَىٰ (surah 80:4)",
        },
        {
          "allPatternsIdentical": false,
          "distinctPatternCount": 2,
          "rule": "غُرْفَةً -> غَرْقًا (surah 79:1)",
        },
      ]
    `);
  });

  it('EXPLICIT DISAGREEMENT 1: يَعْمَوْا عَمَهًا — B restores a longer ayah than A and C', () => {
    const row = DIVERGENCE.find(r => r.rule.includes('عَمَهًا'))!;
    const a = emittedA(TABLE_A[row.a!]);
    const b = `﴿${TABLE_B[row.b!].replacementUthmani}﴾`;
    const c = TABLE_C[row.c!].replacement;
    expect({ a, b, c, aEqualsC: a === c, bEqualsA: b === a, bEqualsC: b === c }).toMatchInlineSnapshot(`
      {
        "a": "سَمِعُوا لَهَا شَهِيقًا",
        "aEqualsC": true,
        "b": "﴿سَمِعُوا لَهَا شَهِيقًا وَهِيَ تَفُورُ﴾",
        "bEqualsA": false,
        "bEqualsC": false,
        "c": "سَمِعُوا لَهَا شَهِيقًا",
      }
    `);
  });

  it('EXPLICIT DISAGREEMENT 2: صَنَفَتْ — C keeps the "معنى كلمة" wrapper, A and B do not', () => {
    const row = DIVERGENCE.find(r => r.rule.includes('صَنَفَتْ'))!;
    const a = emittedA(TABLE_A[row.a!]);
    const b = `﴿${TABLE_B[row.b!].replacementUthmani}﴾`;
    const c = TABLE_C[row.c!].replacement;
    expect({ a, b, c, aEqualsB: a === b, cEqualsA: c === a, cEqualsB: c === b }).toMatchInlineSnapshot(`
      {
        "a": "صَافَّاتٍ",
        "aEqualsB": false,
        "b": "﴿صَافَّاتٍ﴾",
        "c": "معنى كلمة ﴿صَافَّاتٍ﴾",
        "cEqualsA": false,
        "cEqualsB": false,
      }
    `);
  });

  it('EXPLICIT DISAGREEMENT 3: صَنَفَتْ — pattern scope differs three ways', () => {
    const row = DIVERGENCE.find(r => r.rule.includes('صَنَفَتْ'))!;
    const probeBare = 'صَنَفَتْ وَيَقْبِضْنَ حال';
    const probeWithPrefix = 'معنى كلمة ﴿صَنَفَتْ﴾ في معاني الكلمات';
    expect({
      A_bare: new RegExp(TABLE_A[row.a!].pattern.source, TABLE_A[row.a!].pattern.flags).test(probeBare),
      B_bare: new RegExp(TABLE_B[row.b!].triggerPattern.source, TABLE_B[row.b!].triggerPattern.flags).test(probeBare),
      C_bare: TABLE_C[row.c!].regex.test(probeBare),
      A_withPrefix: new RegExp(TABLE_A[row.a!].pattern.source, TABLE_A[row.a!].pattern.flags).test(probeWithPrefix),
      B_withPrefix: new RegExp(TABLE_B[row.b!].triggerPattern.source, TABLE_B[row.b!].triggerPattern.flags).test(probeWithPrefix),
      C_withPrefix: TABLE_C[row.c!].regex.test(probeWithPrefix),
    }).toMatchInlineSnapshot(`
      {
        "A_bare": true,
        "A_withPrefix": true,
        "B_bare": true,
        "B_withPrefix": true,
        "C_bare": false,
        "C_withPrefix": true,
      }
    `);
  });

  it('EXPLICIT DISAGREEMENT 4: النساء pattern has TWO alternatives in A and only ONE in C; B has no such rule', () => {
    const row = DIVERGENCE.find(r => r.rule.includes('النساء'))!;
    const probeEllipsis = 'النساء [...] الرجال';
    const probePlain = 'النساء الرجال.';
    const testA = (p: string) => new RegExp(TABLE_A[row.a!].pattern.source, TABLE_A[row.a!].pattern.flags).test(p);
    const testC = (p: string) => TABLE_C[row.c!].regex.test(p);
    expect({
      // A carries a second alternative `النساء[ \t]+\[\.\.\.\][ \t]+الرجال` that C does not have.
      A_ellipsis: testA(probeEllipsis),
      C_ellipsis: testC(probeEllipsis),
      A_plain: testA(probePlain),
      C_plain: testC(probePlain),
      B_hasThisRule: row.b !== null,
    }).toMatchInlineSnapshot(`
      {
        "A_ellipsis": true,
        "A_plain": true,
        "B_hasThisRule": false,
        "C_ellipsis": false,
        "C_plain": true,
      }
    `);
  });

  it('EXPLICIT DISAGREEMENT 5: مِن تَقُوتُ — C narrows the pattern, dropping the undiacritized form', () => {
    const row = DIVERGENCE.find(r => r.rule.includes('تَقُوتُ'))!;
    const probes = {
      withMadda: 'مِن تَقُوتُ',
      plainArabic: 'من تقوت',
      withMim: 'مَن تَقُوتُ',
    };
    const testA = (p: string) =>
      new RegExp(TABLE_A[row.a!].pattern.source, TABLE_A[row.a!].pattern.flags).test(p);
    const testB = (p: string) =>
      new RegExp(TABLE_B[row.b!].triggerPattern.source, TABLE_B[row.b!].triggerPattern.flags).test(p);
    const testC = (p: string) => TABLE_C[row.c!].regex.test(p);
    expect({
      A: { ...probes, withMadda: testA(probes.withMadda), plainArabic: testA(probes.plainArabic), withMim: testA(probes.withMim) },
      B: { ...probes, withMadda: testB(probes.withMadda), plainArabic: testB(probes.plainArabic), withMim: testB(probes.withMim) },
      C: { ...probes, withMadda: testC(probes.withMadda), plainArabic: testC(probes.plainArabic), withMim: testC(probes.withMim) },
    }).toMatchInlineSnapshot(`
      {
        "A": {
          "plainArabic": true,
          "withMadda": true,
          "withMim": true,
        },
        "B": {
          "plainArabic": true,
          "withMadda": true,
          "withMim": true,
        },
        "C": {
          "plainArabic": false,
          "withMadda": true,
          "withMim": true,
        },
      }
    `);
  });

  it('EXPLICIT DISAGREEMENT 6: بيع الحاضر للبادي — A and B restore different sentences; C has no such rule', () => {
    const row = DIVERGENCE.find(r => r.rule.includes('الحاضر'))!;
    expect({
      A: emittedA(TABLE_A[row.a!]),
      B: row.b !== null ? `﴿${TABLE_B[row.b].replacementUthmani}﴾` : null,
      C: row.c !== null ? TABLE_C[row.c].replacement : null,
      B_hasThisRule: row.b !== null,
    }).toMatchInlineSnapshot(`
      {
        "A": "بيع الحاضر للبادي: وهو أن يقدم القروي بمتاعه لبيعه بسعر يومه فيقول له البلدي: اتركه عندي لأبيعه لك على التدريج بأغلى؛ وعلة النهي: لئلا يتضرر أهل البلد.",
        "B": null,
        "B_hasThisRule": false,
        "C": null,
      }
    `);
  });

  it('EXPLICIT DISAGREEMENT 7: غُرْفَةً — A emits the whole clause, B emits only the corrected word', () => {
    const row = DIVERGENCE.find(r => r.rule.includes('غُرْفَةً'))!;
    expect({
      A: emittedA(TABLE_A[row.a!]),
      B: `﴿${TABLE_B[row.b!].replacementUthmani}﴾`,
      C: row.c !== null ? TABLE_C[row.c!].replacement : null,
    }).toMatchInlineSnapshot(`
      {
        "A": "﴿معنى ﴿غَرْقًا﴾ مبالغة في النزع﴾",
        "B": "﴿غَرْقًا﴾",
        "C": null,
      }
    `);
  });

  it('EXPLICIT DISAGREEMENT 8: مَقَامًا — A appends the grammatical note, B does not', () => {
    const row = DIVERGENCE.find(r => r.rule.includes('مَقَامًا'))!;
    expect({
      A: emittedA(TABLE_A[row.a!]),
      B: `﴿${TABLE_B[row.b!].replacementUthmani}﴾`,
      C: row.c !== null ? TABLE_C[row.c!].replacement : null,
    }).toMatchInlineSnapshot(`
      {
        "A": "﴿مَفَازًا﴾ مفعل من الفوز",
        "B": "﴿مَفَازًا﴾",
        "C": null,
      }
    `);
  });

  it('EXPLICIT DISAGREEMENT 9: فَسَتُعْفِيهِ — B restores a longer phrase than A', () => {
    const row = DIVERGENCE.find(r => r.rule.includes('فَسَتُعْفِيهِ'))!;
    expect({
      A: emittedA(TABLE_A[row.a!]),
      B: `﴿${TABLE_B[row.b!].replacementUthmani}﴾`,
    }).toMatchInlineSnapshot(`
      {
        "A": "﴿فَتَنفَعَهُ الذِّكْرَىٰ﴾",
        "B": "﴿أَوْ يَذَّكَّرُ فَتَنفَعَهُ الذِّكْرَىٰ﴾",
      }
    `);
  });

  it('EXPLICIT DISAGREEMENT 10: الْبَصَرُ خَاشِعًا — three different replacement scopes', () => {
    const row = DIVERGENCE.find(r => r.rule.includes('خَاشِع'))!;
    expect({
      A: emittedA(TABLE_A[row.a!]),
      B: `﴿${TABLE_B[row.b!].replacementUthmani}﴾`,
      C: TABLE_C[row.c!].replacement,
    }).toMatchInlineSnapshot(`
      {
        "A": "﴿الْبَصَرُ خَاسِئًا﴾",
        "B": "﴿خَاسِئًا﴾",
        "C": "الْبَصَرُ خَاسِئًا",
      }
    `);
  });
});

/* ============================================================================================
 * END-TO-END: the same input through all three implementations at once
 * ========================================================================================== */

/** Applies source A's single rule the way `autoFixQuranicErrors` would. */
function runA(rule: AuditorRule, input: string): string {
  return input.replace(new RegExp(rule.pattern.source, rule.pattern.flags), () => emittedA(rule));
}

/** Applies source B's single target the way `quranicVerificationAgent` step 2 would. */
function runB(target: KnownOcrTarget, input: string): string {
  return input.replace(
    new RegExp(target.triggerPattern.source, target.triggerPattern.flags),
    () => `﴿${target.replacementUthmani}﴾`,
  );
}

/** Applies source C's single pair. */
function runC(pairIndex: number, input: string): string {
  const p = TABLE_C[pairIndex];
  return input.replace(new RegExp(p.patternSource, p.flags), p.replacement);
}

describe('C. same input through all three implementations', () => {
  const probes: Array<[string, string]> = [
    ['يَعْمَوْا عَمَهًا', 'عَمَهًا'],
    ['صَنَفَتْ وَيَقْبِضْنَ', 'صَنَفَتْ'],
    ['النساء [...] الرجال', 'النساء'],
    ['مِن تَقُوتُ', 'تَقُوتُ'],
    ['﴿غُرْفَةً﴾ مبالغة', 'غُرْفَةً'],
    ['﴿مَقَامًا﴾ مفعل من الفوز', 'مَقَامًا'],
    ['﴿فَسَتُعْفِيهِ الذِّكْرَىٰ﴾', 'فَسَتُعْفِيهِ'],
    ['الْبَصَرُ خَاشِعًا', 'خَاشِع'],
    ['بيع الحاضر للبادي', 'الحاضر'],
  ];

  it('pins each implementation\'s output side by side', () => {
    expect(
      probes.map(([probe, needle]) => {
        const ia = TABLE_A.findIndex(r => r.pattern.source.includes(needle));
        const ib = TABLE_B.findIndex(t => t.triggerPattern.source.includes(needle));
        const ic = TABLE_C.findIndex(p => p.patternSource.includes(needle));
        return {
          probe,
          A: ia === -1 ? null : runA(TABLE_A[ia], probe),
          B: ib === -1 ? null : runB(TABLE_B[ib], probe),
          C: ic === -1 ? null : runC(ic, probe),
        };
      }),
    ).toMatchInlineSnapshot(`
      [
        {
          "A": null,
          "B": "﴿سَمِعُوا لَهَا شَهِيقًا وَهِيَ تَفُورُ﴾",
          "C": "سَمِعُوا لَهَا شَهِيقًا",
          "probe": "يَعْمَوْا عَمَهًا",
        },
        {
          "A": null,
          "B": "﴿صَافَّاتٍ﴾",
          "C": "صَنَفَتْ وَيَقْبِضْنَ",
          "probe": "صَنَفَتْ وَيَقْبِضْنَ",
        },
        {
          "A": "النساء شقائق الرجال",
          "B": null,
          "C": "النساء [...] الرجال",
          "probe": "النساء [...] الرجال",
        },
        {
          "A": null,
          "B": "﴿مِن تَفَاوُتٍ﴾",
          "C": "﴿مِن تَفَاوُتٍ﴾",
          "probe": "مِن تَقُوتُ",
        },
        {
          "A": null,
          "B": "﴿غُرْفَةً﴾ مبالغة",
          "C": null,
          "probe": "﴿غُرْفَةً﴾ مبالغة",
        },
        {
          "A": null,
          "B": "﴿مَقَامًا﴾ مفعل من الفوز",
          "C": null,
          "probe": "﴿مَقَامًا﴾ مفعل من الفوز",
        },
        {
          "A": null,
          "B": "﴿فَسَتُعْفِيهِ الذِّكْرَىٰ﴾",
          "C": null,
          "probe": "﴿فَسَتُعْفِيهِ الذِّكْرَىٰ﴾",
        },
        {
          "A": null,
          "B": "﴿خَاسِئًا﴾",
          "C": "الْبَصَرُ خَاسِئًا",
          "probe": "الْبَصَرُ خَاشِعًا",
        },
        {
          "A": "بيع الحاضر للبادي: وهو أن يقدم القروي بمتاعه لبيعه بسعر يومه فيقول له البلدي: اتركه عندي لأبيعه لك على التدريج بأغلى؛ وعلة النهي: لئلا يتضرر أهل البلد.",
          "B": null,
          "C": null,
          "probe": "بيع الحاضر للبادي",
        },
      ]
    `);
  });

  it('every probe that at least one source matches is marked as a DIVERGENT probe', () => {
    // A probe where A, B, and C all fire and all agree would be safe to merge; any row where the
    // outputs differ is a documented behaviour difference.
    expect(
      probes.map(([probe, needle]) => {
        const ia = TABLE_A.findIndex(r => r.pattern.source.includes(needle));
        const ib = TABLE_B.findIndex(t => t.triggerPattern.source.includes(needle));
        const ic = TABLE_C.findIndex(p => p.patternSource.includes(needle));
        const outs = [ia, ib, ic]
          .map((i, k) => (i === -1 ? null : k === 0 ? runA(TABLE_A[i], probe) : k === 1 ? runB(TABLE_B[i], probe) : runC(i, probe)))
          .filter((v): v is string => v !== null);
        return {
          probe,
          sourcesThatFired: outs.length,
          outputsIdentical: new Set(outs).size === 1,
        };
      }),
    ).toMatchInlineSnapshot(`
      [
        {
          "outputsIdentical": false,
          "probe": "يَعْمَوْا عَمَهًا",
          "sourcesThatFired": 2,
        },
        {
          "outputsIdentical": false,
          "probe": "صَنَفَتْ وَيَقْبِضْنَ",
          "sourcesThatFired": 2,
        },
        {
          "outputsIdentical": false,
          "probe": "النساء [...] الرجال",
          "sourcesThatFired": 2,
        },
        {
          "outputsIdentical": true,
          "probe": "مِن تَقُوتُ",
          "sourcesThatFired": 2,
        },
        {
          "outputsIdentical": true,
          "probe": "﴿غُرْفَةً﴾ مبالغة",
          "sourcesThatFired": 1,
        },
        {
          "outputsIdentical": true,
          "probe": "﴿مَقَامًا﴾ مفعل من الفوز",
          "sourcesThatFired": 1,
        },
        {
          "outputsIdentical": true,
          "probe": "﴿فَسَتُعْفِيهِ الذِّكْرَىٰ﴾",
          "sourcesThatFired": 1,
        },
        {
          "outputsIdentical": false,
          "probe": "الْبَصَرُ خَاشِعًا",
          "sourcesThatFired": 2,
        },
        {
          "outputsIdentical": true,
          "probe": "بيع الحاضر للبادي",
          "sourcesThatFired": 1,
        },
      ]
    `);
  });
});