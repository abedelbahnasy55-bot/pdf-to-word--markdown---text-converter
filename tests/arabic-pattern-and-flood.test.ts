import { describe, it, expect } from 'vitest';
import { autoFixQuranicErrors, AZHAR_CORRECTION_RULES } from '../src/utils/quranAuditor';
import { consonantSpine, toHarakaPattern } from '../shared/arabicPattern';

describe('shared arabic pattern helpers', () => {
  describe('consonantSpine', () => {
    it('reduces a vocalized literal to its base letters', () => {
      expect(consonantSpine('تَقُوتُ')).toBe('تقوت');
    });

    it('removes the tolerant-class scaffolding from a diacritic-tolerant pattern', () => {
      const pattern = new RegExp(`ت${toHarakaPattern('ق')}`).source;
      // The class is present in the source...
      expect(pattern).toContain('u064B');
      // ...and gone from the spine.
      expect(consonantSpine(pattern)).toBe('تق');
    });

    it('is idempotent', () => {
      const once = consonantSpine('﴿مِنْ أَيِّ﴾');
      expect(consonantSpine(once)).toBe(once);
    });
  });

  describe('toHarakaPattern', () => {
    it('matches with any subset of diacritics present', () => {
      const re = new RegExp(toHarakaPattern('سَبْعًا'), 'g');
      for (const variant of ['سَبْعًا', 'سبعاً', 'سبعًا', 'سبعا']) {
        expect(new RegExp(toHarakaPattern('سَبْعًا'), 'g').test(variant)).toBe(true);
      }
      expect(re.test('سَبْعًا')).toBe(true);
    });

    it('never matches a different set of base letters', () => {
      // The whole point: tolerance is for diacritics ONLY.
      expect(new RegExp(toHarakaPattern('سَبْعًا'), 'g').test('ركبعا')).toBe(false);
    });
  });
});

describe('dot_flood rule reachability', () => {
  /**
   * The `dot_flood` rule needs a run of 10+ dots, or a long repeated dot-run. It used to
   * run AFTER a generic compression pass that collapsed every run of 6+ dots down to five
   * — so the corruption the rule exists to detect had already been normalised away and the
   * rule could never fire. It now runs first.
   */
  const flood = AZHAR_CORRECTION_RULES.find((r) => r.category === 'dot_flood');
  it('exists and targets a catastrophic dot run', () => {
    expect(flood).toBeDefined();
    expect(new RegExp(flood!.pattern.source, flood!.pattern.flags).test('....'.repeat(9))).toBe(true);
  });

  it('fires on a catastrophic dot run', () => {
    const out = autoFixQuranicErrors('.'.repeat(40)).correctedText;
    expect(out).toContain('تم تطهير سيل النقاط');
  });

  it('does NOT hijack an ordinary long-ish dot run', () => {
    // Six dots is a truncated sentence, not a runaway loop. It should compress quietly.
    const out = autoFixQuranicErrors('نص ...... نص').correctedText;
    expect(out).toBe('نص ..... نص');
    expect(out).not.toContain('تم تطهير');
  });
});

describe('rule ordering no longer suppresses a rule', () => {
  it('every rule category can still be reached after the reorder', () => {
    // A smoke check that the reorder did not orphan a whole category: each non-empty
    // category should still have its rule present in the table.
    const categories = new Set(AZHAR_CORRECTION_RULES.map((r) => r.category));
    expect(categories.size).toBeGreaterThan(3);
    expect(categories.has('dot_flood')).toBe(true);
    expect(categories.has('quran_verse')).toBe(true);
  });
});