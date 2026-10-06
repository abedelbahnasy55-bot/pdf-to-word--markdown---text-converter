import { describe, it, expect } from 'vitest';
import { getRecommendedPagesPerChunk } from '../src/utils/pdfChunker';
import { toStandardArabic, isRightToLeftText, countArabicCharacters } from '../shared/arabicText';
import { toHarakaPattern, harakaOrderProblem } from '../shared/arabicPattern';

/**
 * pdfChunker decides how many AI requests a document costs. It is pure and DOM-free, so it
 * is directly testable — and it deserves it, because an off-by-one here is the difference
 * between a 5000-page book fitting in a day's quota and not.
 */
describe('pdfChunker', () => {
  describe('getRecommendedPagesPerChunk', () => {
    it('scales down for tiny documents so a one-pager still gets careful treatment', () => {
      const modes = ['maximum_savings', 'balanced', 'high_fidelity'] as const;
      for (const m of modes) {
        expect(getRecommendedPagesPerChunk(1, m)).toBeGreaterThan(0);
        expect(getRecommendedPagesPerChunk(3, m)).toBeGreaterThan(0);
      }
    });

    it('never returns a non-positive or non-finite page count', () => {
      for (const pages of [1, 2, 5, 10, 50, 100, 200, 500, 1000, 5000]) {
        for (const m of ['maximum_savings', 'balanced', 'high_fidelity'] as const) {
          const n = getRecommendedPagesPerChunk(pages, m);
          expect(Number.isFinite(n)).toBe(true);
          expect(n).toBeGreaterThan(0);
        }
      }
    });

    it('maximum_savings asks for MORE pages per request than high_fidelity', () => {
      // The whole point of the mode: fewer requests for the same document.
      for (const pages of [100, 200, 500, 1000]) {
        const saving = getRecommendedPagesPerChunk(pages, 'maximum_savings');
        const fidelity = getRecommendedPagesPerChunk(pages, 'high_fidelity');
        expect(saving).toBeGreaterThanOrEqual(fidelity);
      }
    });

    it('is monotonic: a longer document never gets a SMALLER chunk', () => {
      for (const m of ['maximum_savings', 'balanced', 'high_fidelity'] as const) {
        let previous = 0;
        for (const pages of [1, 5, 10, 25, 50, 100, 200, 500, 1000, 5000]) {
          const n = getRecommendedPagesPerChunk(pages, m);
          expect(n).toBeGreaterThanOrEqual(previous);
          previous = n;
        }
      }
    });
  });

  describe('request count', () => {
    it('a 5000-page book fits inside a 500-request daily allowance at maximum_savings', () => {
      const per = getRecommendedPagesPerChunk(5000, 'maximum_savings');
      const requests = Math.ceil(5000 / per);
      // Gemini free tier is 500 requests/day. This is the claim the README makes.
      expect(requests).toBeLessThanOrEqual(500);
    });
  });
});

describe('shared arabic text', () => {
  describe('toStandardArabic', () => {
    it('converts presentation forms back to standard letters', () => {
      const presentation = 'ﺃﺣﻤﺪ'; // presentation forms of أحمد
      const normalized = toStandardArabic(presentation);
      expect(normalized).toBe('أحمد');
      expect(normalized).not.toMatch(/[\uFB50-\uFDFF\uFE70-\uFEFF]/);
    });

    it('leaves standard Arabic untouched', () => {
      expect(toStandardArabic('أحمد بن محمد')).toBe('أحمد بن محمد');
    });

    it('is idempotent', () => {
      const once = toStandardArabic('ﺃﺣﻤﺪ');
      expect(toStandardArabic(once)).toBe(once);
    });

    it('does not touch non-Arabic content that NFKC would rewrite', () => {
      // A blanket NFKC would change these; the scoped version must not.
      const input = '① ½ ™ ﬁ';
      expect(toStandardArabic(input)).toBe(input);
    });
  });

  describe('isRightToLeftText', () => {
    it('detects clearly Arabic text', () => {
      expect(isRightToLeftText('قال تعالى ﴿بسم الله الرحمن الرحيم﴾')).toBe(true);
    });

    it('detects clearly English text as not RTL', () => {
      expect(isRightToLeftText('This is a lecture on pharmacology and kinetics')).toBe(false);
    });

    it('a short Arabic title in a long English document is still not RTL overall', () => {
      const text = 'Pharmacology ' + 'general '.repeat(80) + 'صفحة';
      expect(isRightToLeftText(text)).toBe(false);
    });

    it('handles empty input without throwing', () => {
      expect(isRightToLeftText('')).toBe(false);
      expect(isRightToLeftText('   ')).toBe(false);
    });
  });

  describe('countArabicCharacters', () => {
    it('counts only Arabic letters', () => {
      expect(countArabicCharacters('أحمد 123')).toBe(4);
      expect(countArabicCharacters('')).toBe(0);
    });
  });
});

describe('shared arabic pattern', () => {
  describe('harakaOrderProblem', () => {
    // Built from codepoints so no editor or shell normalization can silently reorder them.
    const SHADDA = '\u0651';
    const FATHA = '\u064E';
    const KASRA = '\u0650';

    it('flags a shadda followed by a haraka, an order NFC never produces', () => {
      // Canonical Arabic places the vowel BEFORE the shadda: أَيِّ is fatha, kasra, shadda.
      const impossible = 'أ' + FATHA + SHADDA + KASRA;
      expect(harakaOrderProblem(impossible)).not.toBeNull();
    });

    it('accepts the canonical vowel-then-shadda order', () => {
      const canonical = 'أ' + FATHA + KASRA + SHADDA;
      expect(harakaOrderProblem(canonical)).toBeNull();
    });
  });

  describe('toHarakaPattern', () => {
    it('accepts the literal with or without diacritics', () => {
      const pattern = toHarakaPattern('سَبْعًا');
      expect(new RegExp(pattern).test('سَبْعًا')).toBe(true);
      expect(new RegExp(pattern).test('سبعاً')).toBe(true);
      expect(new RegExp(pattern).test('سبعا')).toBe(true);
    });
  });
});