/**
 * arabicLex.ts — build Arabic fixture fragments from exact code points.
 *
 * Several rule patterns in this repo spell their Arabic in ways no NFC-normalizing editor
 * would reproduce: non-canonical combining order, and (in `quranAuditor.ts`) U+0641 (ف)
 * where U+064A (ي) belongs. A characterization fixture must reach a rule the way the rule was
 * written, so the fragments are assembled from code points rather than typed as literals —
 * typing them would silently normalize them away and the fixture would pin the opposite of
 * the current behavior.
 */

/** Builds a string from explicit code points. */
export const cp = (...codes: number[]): string => String.fromCodePoint(...codes);

// Arabic letters
export const LAM = 0x0644;
export const KAF = 0x0643;
export const HA = 0x0647;
export const DAL = 0x0630;
export const RA = 0x0631;
export const YA = 0x064a;
export const NUN = 0x0646;
export const HAMZA_ALIF = 0x0623;
export const ALIF = 0x0627;
export const WAW = 0x0648;
export const MADDA = 0x0649;
export const SEEN = 0x0633;
export const SHIN = 0x0634;
export const KHA = 0x062e;
export const QAF = 0x0642;
export const MEEM = 0x0645;
export const FA = 0x0641;
export const AYN = 0x0639;
export const TEH = 0x062a;
export const BEH = 0x0628;
export const HAMZA = 0x0621;
export const LAM_ALEF = 0x0622;

// Marks
export const FATH = 0x064e;
export const KASRA = 0x0650;
export const SHADDA = 0x0651;
export const SUKUN = 0x0652;
export const DAMMA = 0x064f;
export const FATHATAN = 0x064b;
export const KASRATAN = 0x064d;
export const SUPERSCRIPT_ALIF = 0x0670;

/**
 * Splits a regex source string into maximal runs of Arabic code points, returning each run as
 * an array of code points. Everything else (regex metacharacters, ASCII, spaces) is dropped,
 * so the result is exactly the literal text the pattern can match on.
 */
export function arabicRuns(patternSource: string): number[][] {
  const runs: number[][] = [];
  let current: number[] = [];
  for (const ch of patternSource) {
    const c = ch.codePointAt(0)!;
    // The whole Arabic block plus its combining marks and Quranic annotation signs.
    const isArabic = c >= 0x0600 && c <= 0x06ff;
    if (isArabic) {
      current.push(c);
    } else if (current.length) {
      runs.push(current);
      current = [];
    }
  }
  if (current.length) runs.push(current);
  return runs;
}