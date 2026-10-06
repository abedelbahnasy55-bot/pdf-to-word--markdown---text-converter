/**
 * Reduces an Arabic pattern or literal to its ordered CONSONANT SPINE.
 *
 * Strips two things: the harakat themselves, and the tolerant-class scaffolding
 * (`[\u064B-\u0652\u0670]*`) that stands in for them in a diacritic-tolerant pattern. What
 * remains is the sequence of base letters, which is what identifies WHICH rule a pattern
 * is regardless of how it spells its vowels.
 *
 * Used to locate a rule by name without breaking when the rules switch between spelling
 * diacritics literally and spelling them as an optional class.
 */
export function consonantSpine(text: string): string {
  return text
    .replace(/\[\\u064B-\\u0652\\u0670\]\*/g, '')
    .replace(/\[\\u064B-\\u0652\\u0670\]/g, '')
    .replace(/[ً-ْٰٟ]/g, '');
}

/**
 * Diacritic-insensitive matching for Quranic correction rules.
 *
 * WHY THIS EXISTS
 * Several correction rules could never match anything. Two distinct defects:
 *
 * 1. MISSING HARAKAT. OCR output of the same word varies in how many diacritics
 *    survive, and different PDF producers emit different subsets. A rule that spells
 *    every mark literally matches exactly one rendering of its target. In this codebase
 *    that meant a rule whose own documented corruption did not match its own pattern,
 *    so the corrupt text passed through untouched while the rule claimed to handle it.
 *
 * 2. HARAKA ORDER. In NFC Arabic a vowel precedes the shadda: أَيِّ is fatha, kasra,
 *    shadda. A literal written shadda-then-vowel can never match real text.
 *
 * The approach here is a consonant skeleton: every diacritic is dropped from the literal
 * and harakat become optional. That handles both defects at once, and it also absorbs
 * presentation forms, which normalize to the same base letters.
 *
 * WHAT IS DELIBERATELY NOT DONE
 * Base letters are never loosened. Matching on a skeleton alone would let a rule fire on
 * a different word that merely shares consonants, which in religious text is worse than
 * not firing at all: it would silently substitute one word for another and present the
 * result as a correction. Only diacritics, which carry no lexical identity here, are
 * treated as optional.
 */

/**
 * Short vowels, tanween, sukun, shadda, and the superscript alef.
 *
 * Presentation Forms are deliberately NOT here. Those blocks contain pre-shaped
 * LETTERS, not diacritics, so treating them as harakat would be wrong twice over: it
 * would loosen nothing and hide the real problem. They are normalized to standard
 * Arabic by `toStandardArabic` at the point text enters the pipeline, so every
 * downstream stage — these rules included — sees ordinary Arabic.
 */
const HARAKAT_CLASS = '\\u064B-\\u0652\\u0670';

const isHaraka = (cp: number) => (cp >= 0x064b && cp <= 0x0652) || cp === 0x0670;

/**
 * Builds a regex fragment matching `literal` regardless of which diacritics are present.
 *
 * @param literal Arabic text. Haraka order does not matter, since harakat are dropped.
 */
export function toHarakaPattern(literal: string): string {
  let out = '';

  for (const ch of literal) {
    const cp = ch.codePointAt(0)!;

    if (isHaraka(cp)) {
      // Harakat present in the source literal are absorbed by the class already emitted
      // after the preceding letter, so they contribute nothing here.
      continue;
    }

    if (cp === 0x0640) {
      // Tatweel: carries no lexical identity and is frequently mangled by OCR.
      out += '\\u0640*';
      continue;
    }

    out += escapeLiteral(ch);
    // Every letter may carry diacritics, whether or not the source literal showed them.
    // Emitting this unconditionally is what makes the fragment match a word whose
    // diacritics were partly lost: emitting it only where the literal had a mark leaves
    // every other letter pinned to bare, which is the defect that made three rules inert.
    out += `[${HARAKAT_CLASS}]*`;
  }

  return out;
}

function escapeLiteral(ch: string): string {
  return /[.*+?^${}()|[\]\\/]/.test(ch) ? `\\${ch}` : ch;
}

/** True when the string contains any haraka at all. */
export const containsHaraka = (s: string): boolean => /[ؐ-ٰٟ]/.test(s);

/**
 * Reports a haraka sequence that normalized Arabic never produces: a shadda immediately
 * followed by another haraka.
 *
 * Used to flag literals for correction, not to rewrite input text — rewriting the text
 * would change what the reader sees, and the fix belongs in the pattern.
 */
export function harakaOrderProblem(literal: string): string | null {
  const cp = [...literal].map((c) => c.codePointAt(0)!);
  for (let i = 0; i < cp.length - 1; i++) {
    if (cp[i] === 0x0651 && isHaraka(cp[i + 1])) {
      return `shadda at index ${i} is followed by U+${cp[i + 1].toString(16).toUpperCase()}`;
    }
  }
  return null;
}