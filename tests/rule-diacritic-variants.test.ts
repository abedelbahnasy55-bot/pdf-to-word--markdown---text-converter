import { describe, it, expect } from 'vitest';
import { autoFixQuranicErrors } from '../src/utils/quranAuditor';

/**
 * Diacritic tolerance: the same word reaches the auditor spelled several ways depending
 * on how much of its vowel marking survived the PDF. All of these are the SAME corruption
 * and must all be repaired to the same replacement.
 */
describe('canonical rules: diacritic variants all repair', () => {
  const VARIANTS: Array<{ label: string; input: string; expected: string }> = [
    { label: 'سِبَاعًا (fatha tanween)', input: '﴿سِبَاعًا شِدَادًا﴾', expected: 'سَبْعًا' },
    { label: 'سِباعاً (alef tanween)', input: '﴿سِباعاً شِدَادًا﴾', expected: 'سَبْعًا' },
    { label: 'سِبَاعاً (mixed)', input: '﴿سِبَاعاً شِدَادًا﴾', expected: 'سَبْعًا' },
    { label: 'سِباعاً (no diacritics)', input: 'سِباعاً شداداً', expected: 'سَبْعًا' },
    { label: 'مِن تَقُوتُ (in mushaf)', input: '﴿مِنْ تَقُوتُ﴾', expected: 'مِن تَفَاوُتٍ' },
    { label: 'مِن تَقُوتُ (no mushaf)', input: 'مِنْ تَقُوتُ', expected: 'مِن تَفَاوُتٍ' },
    { label: 'من تقوت (bare)', input: '﴿من تقوت﴾', expected: 'مِن تَفَاوُتٍ' },
    { label: 'خَاشِعًا (fatha tanween)', input: 'الْبَصَرُ خَاشِعًا', expected: 'الْبَصَرُ خَاسِئًا' },
    { label: 'خاشعاً (alef tanween)', input: 'البصر خاشعاً', expected: 'الْبَصَرُ خَاسِئًا' },
    { label: 'خاشعا (bare)', input: 'البصر خاشعا', expected: 'الْبَصَرُ خَاسِئًا' },
  ];

  it.each(VARIANTS)('$label', ({ input, expected }) => {
    expect(autoFixQuranicErrors(input).correctedText).toContain(expected);
  });

  /**
   * Letters are NOT optional, only diacritics. A dropped CONSONANT is a different
   * corruption, deliberately not treated as a spelling variant of the same word: loosening
   * letters would let a rule fire on an unrelated word and silently substitute it, which
   * in religious text is worse than leaving the text alone.
   */
  it('does not repair a variant with a dropped consonant', () => {
    const out = autoFixQuranicErrors('مِنْ تَقُتُ').correctedText;
    expect(out).toBe('مِنْ تَقُتُ');
  });
});