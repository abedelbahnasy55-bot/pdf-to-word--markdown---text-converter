import { describe, it, expect } from 'vitest';
import { formatEtaArabic, calculateBatchQueueEta, calculateSingleFileEta } from '../src/utils/etaCalculator';

/**
 * GROUP E — src/utils/etaCalculator.ts
 *
 * The headline finding of this group: `calculateBatchQueueEta` branches on the strings
 * `'processing'` (etaCalculator.ts:100) and `'pending'` (etaCalculator.ts:106), but the type it
 * accepts is `Array<{ size: number; status: string; progress?: number }>` — `status` is a bare
 * `string`, so nothing stops those strings being passed. The question is whether any CALLER
 * ever does. Both call sites are pinned below.
 */

/** The status union that App.tsx's BatchFileItem actually uses. */
type BatchItem = { size: number; status: string; progress?: number };

describe('E. etaCalculator — formatEtaArabic', () => {
  it('pins every branch of the formatter', () => {
    const inputs = [
      // <= 0 branch
      0, -1, -1000,
      // < 6 branch
      1, 5, 5.9,
      // < 60 branch
      6, 30, 59.4, 59.6,
      // minutes === 1
      60, 89, 90,
      // minutes === 2
      120, 150,
      // 3..10 minutes
      180, 181, 300, 599, 600, 601,
      // >10 and <60 minutes
      660, 661, 1200, 3599,
      // hours
      3600, 3660, 7200, 7260, 86400,
      // fractional
      7.4, 45.5, 123.7, 1234.5,
    ];
    expect(inputs.map(s => ({ input: s, output: formatEtaArabic(s) }))).toMatchInlineSnapshot(`
      [
        {
          "input": 0,
          "output": "لحظات قليلة...",
        },
        {
          "input": -1,
          "output": "لحظات قليلة...",
        },
        {
          "input": -1000,
          "output": "لحظات قليلة...",
        },
        {
          "input": 1,
          "output": "أقل من 5 ثوانٍ",
        },
        {
          "input": 5,
          "output": "أقل من 5 ثوانٍ",
        },
        {
          "input": 5.9,
          "output": "أقل من 5 ثوانٍ",
        },
        {
          "input": 6,
          "output": "حوالي 6 ثانية",
        },
        {
          "input": 30,
          "output": "حوالي 30 ثانية",
        },
        {
          "input": 59.4,
          "output": "حوالي 59 ثانية",
        },
        {
          "input": 59.6,
          "output": "حوالي 60 ثانية",
        },
        {
          "input": 60,
          "output": "حوالي دقيقة واحدة",
        },
        {
          "input": 89,
          "output": "حوالي دقيقة و 29 ثانية",
        },
        {
          "input": 90,
          "output": "حوالي دقيقة و 30 ثانية",
        },
        {
          "input": 120,
          "output": "حوالي دقيقتين",
        },
        {
          "input": 150,
          "output": "حوالي دقيقتين و 30 ثانية",
        },
        {
          "input": 180,
          "output": "حوالي 3 دقائق",
        },
        {
          "input": 181,
          "output": "حوالي 3 دقائق و 1 ثانية",
        },
        {
          "input": 300,
          "output": "حوالي 5 دقائق",
        },
        {
          "input": 599,
          "output": "حوالي 9 دقائق و 59 ثانية",
        },
        {
          "input": 600,
          "output": "حوالي 10 دقائق",
        },
        {
          "input": 601,
          "output": "حوالي 10 دقائق و 1 ثانية",
        },
        {
          "input": 660,
          "output": "حوالي 11 دقيقة",
        },
        {
          "input": 661,
          "output": "حوالي 11 دقيقة و 1 ثانية",
        },
        {
          "input": 1200,
          "output": "حوالي 20 دقيقة",
        },
        {
          "input": 3599,
          "output": "حوالي 59 دقيقة و 59 ثانية",
        },
        {
          "input": 3600,
          "output": "حوالي 1 ساعة و 0 دقيقة",
        },
        {
          "input": 3660,
          "output": "حوالي 1 ساعة و 1 دقيقة",
        },
        {
          "input": 7200,
          "output": "حوالي 2 ساعة و 0 دقيقة",
        },
        {
          "input": 7260,
          "output": "حوالي 2 ساعة و 1 دقيقة",
        },
        {
          "input": 86400,
          "output": "حوالي 24 ساعة و 0 دقيقة",
        },
        {
          "input": 7.4,
          "output": "حوالي 7 ثانية",
        },
        {
          "input": 45.5,
          "output": "حوالي 46 ثانية",
        },
        {
          "input": 123.7,
          "output": "حوالي دقيقتين و 4 ثانية",
        },
        {
          "input": 1234.5,
          "output": "حوالي 20 دقيقة و 35 ثانية",
        },
      ]
    `);
  });

  it('the minute/second boundary uses Math.round, so a "minute" can print "60 ثانية"', () => {
    // `Math.floor(totalSeconds / 60)` and `Math.round(totalSeconds % 60)` are independent
    // (etaCalculator.ts:29-30). At 119.6 s the floor gives 1 minute while the round gives 60,
    // and the minutes===1 branch wins, so the output is "حوالي دقيقة و 60 ثانية" — a minute
    // containing sixty seconds. PINNED, NOT FIXED.
    expect(formatEtaArabic(119.6)).toBe('حوالي دقيقة و 60 ثانية');
    expect(formatEtaArabic(59.6)).toBe('حوالي 60 ثانية');
    expect(formatEtaArabic(119.4)).toBe('حوالي دقيقة و 59 ثانية');
    expect(formatEtaArabic(120)).toBe('حوالي دقيقتين');
  });

  it('NaN falls through to the hour branch rather than short-circuiting', () => {
    // All comparisons with NaN are false, so `minutes` is NaN and every branch guard fails.
    expect(formatEtaArabic(NaN)).toMatchInlineSnapshot(`"حوالي NaN ساعة و NaN دقيقة"`);
  });
});

describe('E. etaCalculator — calculateSingleFileEta', () => {
  it('percentage is clamped to [1, 99] before use', () => {
    expect(calculateSingleFileEta(0, 10)).toMatchInlineSnapshot(`
      {
        "formattedEta": "حوالي 3 دقائق و 10 ثانية",
        "remainingSeconds": 190,
      }
    `);
    expect(calculateSingleFileEta(-20, 10)).toMatchInlineSnapshot(`
      {
        "formattedEta": "حوالي 16 دقيقة و 30 ثانية",
        "remainingSeconds": 990,
      }
    `);
    expect(calculateSingleFileEta(100, 10)).toMatchInlineSnapshot(`
      {
        "formattedEta": "ثوانٍ معدودة...",
        "remainingSeconds": 2,
      }
    `);
    expect(calculateSingleFileEta(150, 10)).toMatchInlineSnapshot(`
      {
        "formattedEta": "ثوانٍ معدودة...",
        "remainingSeconds": 2,
      }
    `);
    expect(calculateSingleFileEta(NaN, 10)).toMatchInlineSnapshot(`
      {
        "formattedEta": "حوالي 3 دقائق و 10 ثانية",
        "remainingSeconds": 190,
      }
    `);
  });

  it('percentage >= 98 short-circuits to a fixed 2 seconds regardless of elapsed time', () => {
    expect(calculateSingleFileEta(98, 0)).toEqual({ remainingSeconds: 2, formattedEta: 'ثوانٍ معدودة...' });
    expect(calculateSingleFileEta(99, 99999)).toEqual({ remainingSeconds: 2, formattedEta: 'ثوانٍ معدودة...' });
  });

  it('elapsedSeconds >= 2 uses the extrapolation branch', () => {
    const cases: Array<[number, number, number | undefined]> = [
      [50, 30, undefined],
      [50, 30, 1_000_000],
      [10, 100, undefined],
      [90, 1000, undefined],
      [25, 2, undefined],
    ];
    expect(
      cases.map(([pct, elapsed, size]) => ({
        call: `${pct}% after ${elapsed}s size=${size ?? 'default'}`,
        result: calculateSingleFileEta(pct, elapsed, size),
      })),
    ).toMatchInlineSnapshot(`
      [
        {
          "call": "50% after 30s size=default",
          "result": {
            "formattedEta": "حوالي 30 ثانية",
            "remainingSeconds": 30,
          },
        },
        {
          "call": "50% after 30s size=1000000",
          "result": {
            "formattedEta": "حوالي 30 ثانية",
            "remainingSeconds": 30,
          },
        },
        {
          "call": "10% after 100s size=default",
          "result": {
            "formattedEta": "حوالي 15 دقيقة",
            "remainingSeconds": 900,
          },
        },
        {
          "call": "90% after 1000s size=default",
          "result": {
            "formattedEta": "حوالي دقيقة و 51 ثانية",
            "remainingSeconds": 111,
          },
        },
        {
          "call": "25% after 2s size=default",
          "result": {
            "formattedEta": "حوالي 6 ثانية",
            "remainingSeconds": 6,
          },
        },
      ]
    `);
  });

  it('elapsedSeconds < 2 uses the size-based baseline branch', () => {
    const cases: Array<[number, number, number | undefined]> = [
      [0, 0, undefined],
      [0, 0, 0],
      [0, 0, 1000],
      [0, 0, 5_000_000],
      [0, 0, 50_000_000],
      [90, 1, undefined],
      [1, 1, 500_000],
    ];
    expect(
      cases.map(([pct, elapsed, size]) => ({
        call: `${pct}% after ${elapsed}s size=${size ?? 'default'}`,
        result: calculateSingleFileEta(pct, elapsed, size),
      })),
    ).toMatchInlineSnapshot(`
      [
        {
          "call": "0% after 0s size=default",
          "result": {
            "formattedEta": "حوالي 13 ثانية",
            "remainingSeconds": 13,
          },
        },
        {
          "call": "0% after 0s size=0",
          "result": {
            "formattedEta": "حوالي 13 ثانية",
            "remainingSeconds": 13,
          },
        },
        {
          "call": "0% after 0s size=1000",
          "result": {
            "formattedEta": "حوالي 10 ثانية",
            "remainingSeconds": 10,
          },
        },
        {
          "call": "0% after 0s size=5000000",
          "result": {
            "formattedEta": "حوالي 46 ثانية",
            "remainingSeconds": 46,
          },
        },
        {
          "call": "0% after 0s size=50000000",
          "result": {
            "formattedEta": "حوالي 57 ثانية",
            "remainingSeconds": 57,
          },
        },
        {
          "call": "90% after 1s size=default",
          "result": {
            "formattedEta": "أقل من 5 ثوانٍ",
            "remainingSeconds": 3,
          },
        },
        {
          "call": "1% after 1s size=500000",
          "result": {
            "formattedEta": "حوالي 14 ثانية",
            "remainingSeconds": 14,
          },
        },
      ]
    `);
  });

  it('the Math.max(3, …) floor applies only to the two computed branches, not the >=98 shortcut', () => {
    // The `>= 98` early return at etaCalculator.ts:192 returns a hard-coded 2, bypassing the
    // floor used by both branches below it. PINNED, NOT FIXED: 2 is below the floor the rest
    // of the function defends.
    expect(calculateSingleFileEta(98, 0).remainingSeconds).toBe(2);
    expect(calculateSingleFileEta(97, 2).remainingSeconds).toBeGreaterThanOrEqual(3);
    expect(calculateSingleFileEta(0, 0).remainingSeconds).toBeGreaterThanOrEqual(3);
  });

  it('PINNED ODDITY: 98 and 99 are reachable only because 100 is clamped down to 99', () => {
    // `Math.min(99, 100)` makes the `>= 98` guard fire for a 100% progress report too, which is
    // almost certainly intended. It also means a caller asking for 100% gets "ثوانٍ معدودة"
    // rather than "done". PINNED, NOT FIXED.
    expect(calculateSingleFileEta(100, 500).formattedEta).toBe('ثوانٍ معدودة...');
    expect(calculateSingleFileEta(100, 500).remainingSeconds).toBe(2);
  });
});

describe('E. etaCalculator — calculateBatchQueueEta: the live status union', () => {
  it('pins a realistic App.tsx batchQueue using only the five real statuses', () => {
    // These are the statuses App.tsx assigns. documentMerger.ts:11 declares the same five.
    const batch: BatchItem[] = [
      { size: 4_000_000, status: 'done' },
      { size: 6_000_000, status: 'done' },
      { size: 3_000_000, status: 'converting', progress: 45 },
      { size: 5_000_000, status: 'auditing', progress: 80 },
      { size: 2_000_000, status: 'idle' },
      { size: 0, status: 'error' },
    ];
    expect(calculateBatchQueueEta(batch, 42)).toMatchInlineSnapshot(`
      {
        "completedFiles": 2,
        "estimatedSecondsRemaining": 0,
        "estimatedTotalSeconds": 42,
        "formattedEta": "اكتملت المعالجة بالكامل",
        "overallPercentage": 100,
        "processedBytes": 20001024,
        "remainingBytes": 0,
        "remainingFiles": 0,
        "speedFormatted": "مكتمل",
        "totalBytes": 20001024,
        "totalFiles": 6,
      }
    `);
  });

  it('"idle", "converting" and "auditing" are counted as NEITHER done NOR remaining', () => {
    // etaCalculator.ts:97-109 only knows 'done', 'processing', and 'pending'. Everything else
    // falls into the final `else`, which adds to totalBytes but not to processedBytes and not
    // to remainingFiles. So a fully idle queue reports remainingFiles === 0 and is treated as
    // COMPLETE. PINNED, NOT FIXED — this is the bug this test exists to document.
    const allIdle: BatchItem[] = [
      { size: 1_000_000, status: 'idle' },
      { size: 1_000_000, status: 'converting', progress: 50 },
      { size: 1_000_000, status: 'auditing', progress: 50 },
    ];
    const result = calculateBatchQueueEta(allIdle, 60);
    expect({
      remainingFiles: result.remainingFiles,
      overallPercentage: result.overallPercentage,
      formattedEta: result.formattedEta,
      speedFormatted: result.speedFormatted,
    }).toMatchInlineSnapshot(`
      {
        "formattedEta": "اكتملت المعالجة بالكامل",
        "overallPercentage": 100,
        "remainingFiles": 0,
        "speedFormatted": "مكتمل",
      }
    `);
  });

  it('the all-idle queue reports "processing complete" while nothing is processed', () => {
    const result = calculateBatchQueueEta(
      [{ size: 5_000_000, status: 'idle' }, { size: 5_000_000, status: 'idle' }],
      10,
    );
    expect(result.remainingFiles).toBe(0);
    expect(result.overallPercentage).toBe(100);
    expect(result.formattedEta).toBe('اكتملت المعالجة بالكامل');
    expect(result.speedFormatted).toBe('مكتمل');
    expect(result.processedBytes).toBe(result.totalBytes);
  });

  it('an empty queue returns the pinned all-zero report', () => {
    expect(calculateBatchQueueEta([], 999)).toMatchInlineSnapshot(`
      {
        "completedFiles": 0,
        "estimatedSecondsRemaining": 0,
        "estimatedTotalSeconds": 0,
        "formattedEta": "0 ثانية",
        "overallPercentage": 0,
        "processedBytes": 0,
        "remainingBytes": 0,
        "remainingFiles": 0,
        "speedFormatted": "0 ك.ب/ث",
        "totalBytes": 0,
        "totalFiles": 0,
      }
    `);
  });
});

describe('E. etaCalculator — DEAD BRANCH PROOF for "processing" and "pending"', () => {
  /**
   * The premise from the brief is that `'processing'` and `'pending'` are unreachable because
   * `calculateBatchQueueEta` is fed the `QueuedDocument` union. That premise is FALSE for the
   * only live call site, and the tests below establish which is which with evidence rather
   * than assertion.
   */

  it('PROOF 1: passing "processing" and "pending" DOES take the branches at lines 100 and 106', () => {
    const items: BatchItem[] = [
      { size: 2_000_000, status: 'processing', progress: 50 },
      { size: 2_000_000, status: 'pending' },
    ];
    const result = calculateBatchQueueEta(items, 5);
    // remainingFiles === 2 proves BOTH branches fired: the 'processing' branch (line 101) and
    // the 'pending' branch (line 107). If they were dead it would be 0.
    expect({
      remainingFiles: result.remainingFiles,
      processedBytes: result.processedBytes,
      totalBytes: result.totalBytes,
      overallPercentage: result.overallPercentage,
      formattedEta: result.formattedEta,
    }).toMatchInlineSnapshot(`
      {
        "formattedEta": "حوالي 32 ثانية",
        "overallPercentage": 25,
        "processedBytes": 1000000,
        "remainingFiles": 2,
        "totalBytes": 4000000,
      }
    `);
    expect(result.remainingFiles).toBe(2);
  });

  it('PROOF 2: the branches are LIVE for the real caller — App.tsx uses "pending"/"processing"', () => {
    // App.tsx:59-68 declares `interface BatchFileItem { status: 'pending' | 'processing' | 'done' | 'error' }`
    // and App.tsx:114 passes `batchQueue` straight into `calculateBatchQueueEta`. So the two
    // branches are not merely reachable, they are the ONLY way a running batch reports
    // remaining work. The brief's premise (that the QueuedDocument union is fed instead) does
    // not hold for this call site.
    const running: BatchItem[] = [
      { size: 1_000_000, status: 'done' },
      { size: 1_000_000, status: 'processing', progress: 40 },
      { size: 1_000_000, status: 'processing', progress: 40 },
      { size: 1_000_000, status: 'pending' },
    ];
    const result = calculateBatchQueueEta(running, 20);
    expect({
      totalFiles: result.totalFiles,
      completedFiles: result.completedFiles,
      remainingFiles: result.remainingFiles,
      overallPercentage: result.overallPercentage,
      formattedEta: result.formattedEta,
    }).toMatchInlineSnapshot(`
      {
        "completedFiles": 1,
        "formattedEta": "حوالي 27 ثانية",
        "overallPercentage": 45,
        "remainingFiles": 3,
        "totalFiles": 4,
      }
    `);
  });

  it('PROOF 3: what IS dead — the "processing" branch ignores progress when it is 0 or absent', () => {
    // `item.progress || 10` at etaCalculator.ts:102 treats progress 0 as absent and silently
    // substitutes 10%. And an item with no progress at all contributes only 10% of its bytes
    // while still counting as a remaining file. PINNED, NOT FIXED.
    const zero: BatchItem[] = [
      { size: 1_000_000, status: 'processing', progress: 0 },
      { size: 1_000_000, status: 'processing' },
      { size: 1_000_000, status: 'processing', progress: 100 },
    ];
    const result = calculateBatchQueueEta(zero, 5);
    expect({
      processedBytes: result.processedBytes,
      totalBytes: result.totalBytes,
      // 10% + 10% + 100% of 1 MB each
      expectedProcessedBytes: 1_000_000 * 0.1 + 1_000_000 * 0.1 + 1_000_000 * 1.0,
    }).toMatchInlineSnapshot(`
      {
        "expectedProcessedBytes": 1200000,
        "processedBytes": 1200000,
        "totalBytes": 3000000,
      }
    `);
  });

  it('PROOF 4: sizes below 1024 bytes are floored up, so a queue of empty files looks big', () => {
    // `Math.max(1024, item.size || 1024)` at etaCalculator.ts:94. PINNED, NOT FIXED.
    const tiny: BatchItem[] = [
      { size: 0, status: 'processing', progress: 50 },
      { size: 1, status: 'processing', progress: 50 },
    ];
    const result = calculateBatchQueueEta(tiny, 5);
    expect({ totalBytes: result.totalBytes, processedBytes: result.processedBytes }).toMatchInlineSnapshot(`
      {
        "processedBytes": 1024,
        "totalBytes": 2048,
      }
    `);
    expect(result.totalBytes).toBe(2048);
  });

  it('PROOF 5: the "all done" shortcut keys off remainingFiles, not processedBytes', () => {
    // etaCalculator.ts:119 — `remainingFiles === 0 || overallPercentage >= 100`. A queue made
    // only of unknown statuses has remainingFiles 0 and short-circuits immediately, so the
    // heuristic ETA block (lines 135-157) is skipped entirely. PINNED, NOT FIXED.
    const unknownOnly: BatchItem[] = [
      { size: 10_000_000, status: 'auditing', progress: 5 },
      { size: 10_000_000, status: 'converting', progress: 5 },
    ];
    const result = calculateBatchQueueEta(unknownOnly, 30);
    expect(result.formattedEta).toBe('اكتملت المعالجة بالكامل');
    expect(result.estimatedSecondsRemaining).toBe(0);
    expect(result.estimatedTotalSeconds).toBe(30);
  });

  it('the heuristic vs empirical blend boundary is pinned (elapsedSeconds >= 3 && processedBytes > 1024)', () => {
    const items: BatchItem[] = [
      { size: 4_000_000, status: 'done' },
      { size: 6_000_000, status: 'pending' },
      { size: 4_000_000, status: 'pending' },
    ];
    expect(
      [0, 1, 2, 3, 4, 5, 10, 15, 20, 30, 60, 120, 300].map(elapsed => ({
        elapsed,
        eta: calculateBatchQueueEta(items, elapsed).formattedEta,
        seconds: calculateBatchQueueEta(items, elapsed).estimatedSecondsRemaining,
        speed: calculateBatchQueueEta(items, elapsed).speedFormatted,
      })),
    ).toMatchInlineSnapshot(`
      [
        {
          "elapsed": 0,
          "eta": "حوالي دقيقة و 32 ثانية",
          "seconds": 92,
          "speed": "148 ك.ب/ث",
        },
        {
          "elapsed": 1,
          "eta": "حوالي دقيقة و 32 ثانية",
          "seconds": 92,
          "speed": "148 ك.ب/ث",
        },
        {
          "elapsed": 2,
          "eta": "حوالي دقيقة و 32 ثانية",
          "seconds": 92,
          "speed": "148 ك.ب/ث",
        },
        {
          "elapsed": 3,
          "eta": "حوالي دقيقة و 20 ثانية",
          "seconds": 80,
          "speed": "1.3 م.ب/ث",
        },
        {
          "elapsed": 4,
          "eta": "حوالي دقيقة و 17 ثانية",
          "seconds": 77,
          "speed": "977 ك.ب/ث",
        },
        {
          "elapsed": 5,
          "eta": "حوالي دقيقة و 14 ثانية",
          "seconds": 74,
          "speed": "781 ك.ب/ث",
        },
        {
          "elapsed": 10,
          "eta": "حوالي دقيقة و 1 ثانية",
          "seconds": 61,
          "speed": "391 ك.ب/ث",
        },
        {
          "elapsed": 15,
          "eta": "حوالي 54 ثانية",
          "seconds": 54,
          "speed": "260 ك.ب/ث",
        },
        {
          "elapsed": 20,
          "eta": "حوالي 56 ثانية",
          "seconds": 56,
          "speed": "195 ك.ب/ث",
        },
        {
          "elapsed": 30,
          "eta": "حوالي دقيقة و 18 ثانية",
          "seconds": 78,
          "speed": "130 ك.ب/ث",
        },
        {
          "elapsed": 60,
          "eta": "حوالي دقيقتين و 21 ثانية",
          "seconds": 141,
          "speed": "65 ك.ب/ث",
        },
        {
          "elapsed": 120,
          "eta": "حوالي 4 دقائق و 29 ثانية",
          "seconds": 269,
          "speed": "33 ك.ب/ث",
        },
        {
          "elapsed": 300,
          "eta": "حوالي 10 دقائق و 51 ثانية",
          "seconds": 651,
          "speed": "13 ك.ب/ث",
        },
      ]
    `);
  });

  it('weight is capped at 0.85, so a very slow observed speed can never dominate', () => {
    // `Math.min(0.85, (elapsedSeconds / 15) * 0.7)` at etaCalculator.ts:149. Pinned so a change
    // to the cap is visible.
    const items: BatchItem[] = [
      { size: 100_000, status: 'done' },
      { size: 100_000_000, status: 'pending' },
    ];
    expect(
      [3, 18, 100, 1000, 100000].map(elapsed => ({
        elapsed,
        result: calculateBatchQueueEta(items, elapsed),
      })),
    ).toMatchInlineSnapshot(`
      [
        {
          "elapsed": 3,
          "result": {
            "completedFiles": 1,
            "estimatedSecondsRemaining": 1098,
            "estimatedTotalSeconds": 1101,
            "formattedEta": "حوالي 18 دقيقة و 18 ثانية",
            "overallPercentage": 0,
            "processedBytes": 100000,
            "remainingBytes": 100000000,
            "remainingFiles": 1,
            "speedFormatted": "33 ك.ب/ث",
            "totalBytes": 100100000,
            "totalFiles": 2,
          },
        },
        {
          "elapsed": 18,
          "result": {
            "completedFiles": 1,
            "estimatedSecondsRemaining": 15246,
            "estimatedTotalSeconds": 15264,
            "formattedEta": "حوالي 4 ساعة و 14 دقيقة",
            "overallPercentage": 0,
            "processedBytes": 100000,
            "remainingBytes": 100000000,
            "remainingFiles": 1,
            "speedFormatted": "5 ك.ب/ث",
            "totalBytes": 100100000,
            "totalFiles": 2,
          },
        },
        {
          "elapsed": 100,
          "result": {
            "completedFiles": 1,
            "estimatedSecondsRemaining": 17118,
            "estimatedTotalSeconds": 17218,
            "formattedEta": "حوالي 4 ساعة و 45 دقيقة",
            "overallPercentage": 0,
            "processedBytes": 100000,
            "remainingBytes": 100000000,
            "remainingFiles": 1,
            "speedFormatted": "1 ك.ب/ث",
            "totalBytes": 100100000,
            "totalFiles": 2,
          },
        },
        {
          "elapsed": 1000,
          "result": {
            "completedFiles": 1,
            "estimatedSecondsRemaining": 17118,
            "estimatedTotalSeconds": 18118,
            "formattedEta": "حوالي 4 ساعة و 45 دقيقة",
            "overallPercentage": 0,
            "processedBytes": 100000,
            "remainingBytes": 100000000,
            "remainingFiles": 1,
            "speedFormatted": "0 ك.ب/ث",
            "totalBytes": 100100000,
            "totalFiles": 2,
          },
        },
        {
          "elapsed": 100000,
          "result": {
            "completedFiles": 1,
            "estimatedSecondsRemaining": 17118,
            "estimatedTotalSeconds": 117118,
            "formattedEta": "حوالي 4 ساعة و 45 دقيقة",
            "overallPercentage": 0,
            "processedBytes": 100000,
            "remainingBytes": 100000000,
            "remainingFiles": 1,
            "speedFormatted": "0 ك.ب/ث",
            "totalBytes": 100100000,
            "totalFiles": 2,
          },
        },
      ]
    `);
  });
});