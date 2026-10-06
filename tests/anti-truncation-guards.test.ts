import { describe, it, expect } from 'vitest';
import { extractIfCondition, extractRhs } from './helpers/inlineExtract';
import { sourceSlice } from './helpers/sourceExtract';
import { autoFixQuranicErrors } from '../src/utils/quranAuditor';
import { AR_MARKDOWN_FIXTURE } from './fixtures/curriculum';

/**
 * GROUP F — the anti-truncation guards.
 *
 * Four sites, and the thresholds are NOT what the task brief assumed:
 *
 *   F1  src/utils/contextualChecker.ts     `baseMarkdown.length > 5000 && returnedText.length < baseMarkdown.length * 0.8`
 *   F2  src/utils/documentConverter.ts     `(rawMergedMarkdown.length > 5000 && contextualResult...length < rawMergedMarkdown.length * 0.8) || (origBreaks > 0 && ctxBreaks < origBreaks)`
 *   F3  server.ts                          `markdown.length > 8000 && resultText.length < markdown.length * 0.75`
 *   F4  server.ts                          `origBreaks > 0 && resBreaks < origBreaks`
 *
 * There is NO 0.75 in documentConverter.ts: the 0.75 lives in server.ts, and the 0.8 the
 * brief attributed to contextualChecker is used by BOTH client-side guards. `0.8` also
 * appears in src/utils/quranicVerificationAgent.ts:78, but that is a similarity floor
 * (`Math.max(0.75, minLen / maxLen)`), not a truncation guard — it is not pinned here.
 *
 * Every condition is compiled from the real `if (...)` text, so a threshold change in
 * production shows up as a failing test rather than as silently stale expectations.
 */
const F1 = extractIfCondition('src/utils/contextualChecker.ts', 'if (baseMarkdown.length > 5000');
const F2 = extractIfCondition('src/utils/documentConverter.ts', '(rawMergedMarkdown.length > 5000');
const F3 = extractIfCondition('server.ts', 'if (markdown.length > 8000');
const F4 = extractIfCondition('server.ts', 'if (origBreaks > 0 && resBreaks < origBreaks)');

const PB = '---PAGE_BREAK---';
const countBreaks = (s: string): number => (s.match(/---PAGE_BREAK---/g) || []).length;

const f1 = (baseLength: number, returnedLength: number): boolean =>
  F1.fn({ baseMarkdown: 'x'.repeat(baseLength), returnedText: 'y'.repeat(returnedLength) }) === true;
const f2 = (inputLength: number, outputLength: number, origBreaks = 0, ctxBreaks = 0): boolean =>
  F2.fn({
    rawMergedMarkdown: 'x'.repeat(inputLength),
    contextualResult: { correctedMarkdown: 'y'.repeat(outputLength) },
    origBreaks,
    ctxBreaks,
  }) === true;
const f3 = (inputLength: number, outputLength: number): boolean =>
  F3.fn({ markdown: 'x'.repeat(inputLength), resultText: 'y'.repeat(outputLength) }) === true;
const f4 = (origBreaks: number, resBreaks: number): boolean =>
  F4.fn({ origBreaks, resBreaks }) === true;

/** 10000 is above both length gates (> 5000 and > 8000). */
const RATIOS = [0.7, 0.74, 0.75, 0.76, 0.79, 0.8, 0.81, 0.85, 0.99, 1] as const;

describe('F. provenance: the four conditions as written', () => {
  it('F1 contextualChecker.ts — length only, no page-break clause', () => {
    expect({ file: 'src/utils/contextualChecker.ts', anchor: 'if (baseMarkdown.length > 5000', expr: F1.expr, vars: F1.vars, guardBody: sourceSlice('src/utils/contextualChecker.ts', F1.startLine, F1.startLine + 6).split('\n').slice(0, 4) }).toMatchInlineSnapshot(`
      {
        "anchor": "if (baseMarkdown.length > 5000",
        "expr": "baseMarkdown.length > 5000 && returnedText.length < baseMarkdown.length * 0.8",
        "file": "src/utils/contextualChecker.ts",
        "guardBody": [
          "        if (baseMarkdown.length > 5000 && returnedText.length < baseMarkdown.length * 0.8) {",
          "          console.warn(\`[ContextualChecker] Prevented document truncation: original \${baseMarkdown.length} chars vs AI \${returnedText.length} chars. Keeping full document intact.\`);",
          "          return {",
          "            correctedMarkdown: baseMarkdown,",
        ],
        "vars": [
          "baseMarkdown",
          "returnedText",
        ],
      }
    `);
  });

  it('F2 documentConverter.ts — length OR lost page breaks, one combined condition', () => {
    expect({ file: 'src/utils/documentConverter.ts', anchor: '(rawMergedMarkdown.length > 5000', expr: F2.expr, vars: F2.vars }).toMatchInlineSnapshot(`
      {
        "anchor": "(rawMergedMarkdown.length > 5000",
        "expr": "(rawMergedMarkdown.length > 5000 && contextualResult.correctedMarkdown.length < rawMergedMarkdown.length * 0.8) ||
            (origBreaks > 0 && ctxBreaks < origBreaks)",
        "file": "src/utils/documentConverter.ts",
        "vars": [
          "rawMergedMarkdown",
          "contextualResult",
          "origBreaks",
          "ctxBreaks",
        ],
      }
    `);
  });

  it('F3 server.ts — length only, different gate and a different ratio', () => {
    expect({ file: 'server.ts', anchor: 'if (markdown.length > 8000', expr: F3.expr, vars: F3.vars, guardBody: sourceSlice('server.ts', F3.startLine, F3.startLine + 7).split('\n').slice(0, 3) }).toMatchInlineSnapshot(`
      {
        "anchor": "if (markdown.length > 8000",
        "expr": "markdown.length > 8000 && resultText.length < markdown.length * 0.75",
        "file": "server.ts",
        "guardBody": [
          "    if (markdown.length > 8000 && resultText.length < markdown.length * 0.75) {",
          "      console.warn(\`[ContextualCheck] Truncation averted: Original length \${markdown.length} vs AI output \${resultText.length}. Preserving full document.\`);",
          "      return res.json({",
        ],
        "vars": [
          "markdown",
          "resultText",
        ],
      }
    `);
  });

  it('F4 server.ts — the page-break clause as a separate guard', () => {
    expect({ file: 'server.ts', anchor: 'if (origBreaks > 0 && resBreaks < origBreaks)', expr: F4.expr, vars: F4.vars }).toMatchInlineSnapshot(`
      {
        "anchor": "if (origBreaks > 0 && resBreaks < origBreaks)",
        "expr": "origBreaks > 0 && resBreaks < origBreaks",
        "file": "server.ts",
        "vars": [
          "origBreaks",
          "resBreaks",
        ],
      }
    `);
  });
});

describe('F. length-ratio boundary at input length 10000 (above both gates)', () => {
  it('output as an exact fraction of the input', () => {
    expect(
      RATIOS.map((r) => {
        const out = Math.round(10000 * r);
        return { ratio: r, outputLength: out, F1: f1(10000, out), F2: f2(10000, out, 0, 0), F3: f3(10000, out) };
      }),
    ).toMatchInlineSnapshot(`
      [
        {
          "F1": true,
          "F2": true,
          "F3": true,
          "outputLength": 7000,
          "ratio": 0.7,
        },
        {
          "F1": true,
          "F2": true,
          "F3": true,
          "outputLength": 7400,
          "ratio": 0.74,
        },
        {
          "F1": true,
          "F2": true,
          "F3": false,
          "outputLength": 7500,
          "ratio": 0.75,
        },
        {
          "F1": true,
          "F2": true,
          "F3": false,
          "outputLength": 7600,
          "ratio": 0.76,
        },
        {
          "F1": true,
          "F2": true,
          "F3": false,
          "outputLength": 7900,
          "ratio": 0.79,
        },
        {
          "F1": false,
          "F2": false,
          "F3": false,
          "outputLength": 8000,
          "ratio": 0.8,
        },
        {
          "F1": false,
          "F2": false,
          "F3": false,
          "outputLength": 8100,
          "ratio": 0.81,
        },
        {
          "F1": false,
          "F2": false,
          "F3": false,
          "outputLength": 8500,
          "ratio": 0.85,
        },
        {
          "F1": false,
          "F2": false,
          "F3": false,
          "outputLength": 9900,
          "ratio": 0.99,
        },
        {
          "F1": false,
          "F2": false,
          "F3": false,
          "outputLength": 10000,
          "ratio": 1,
        },
      ]
    `);
  });

  it('char-by-char sweep 7495..7510 around the 0.75 boundary (F3 only)', () => {
    const rows: number[] = [];
    for (let n = 7495; n <= 7510; n++) rows.push(n);
    expect(rows.map((n) => ({ outputLength: n, F3: f3(10000, n), F1: f1(10000, n), F2: f2(10000, n) }))).toMatchInlineSnapshot(`
      [
        {
          "F1": true,
          "F2": true,
          "F3": true,
          "outputLength": 7495,
        },
        {
          "F1": true,
          "F2": true,
          "F3": true,
          "outputLength": 7496,
        },
        {
          "F1": true,
          "F2": true,
          "F3": true,
          "outputLength": 7497,
        },
        {
          "F1": true,
          "F2": true,
          "F3": true,
          "outputLength": 7498,
        },
        {
          "F1": true,
          "F2": true,
          "F3": true,
          "outputLength": 7499,
        },
        {
          "F1": true,
          "F2": true,
          "F3": false,
          "outputLength": 7500,
        },
        {
          "F1": true,
          "F2": true,
          "F3": false,
          "outputLength": 7501,
        },
        {
          "F1": true,
          "F2": true,
          "F3": false,
          "outputLength": 7502,
        },
        {
          "F1": true,
          "F2": true,
          "F3": false,
          "outputLength": 7503,
        },
        {
          "F1": true,
          "F2": true,
          "F3": false,
          "outputLength": 7504,
        },
        {
          "F1": true,
          "F2": true,
          "F3": false,
          "outputLength": 7505,
        },
        {
          "F1": true,
          "F2": true,
          "F3": false,
          "outputLength": 7506,
        },
        {
          "F1": true,
          "F2": true,
          "F3": false,
          "outputLength": 7507,
        },
        {
          "F1": true,
          "F2": true,
          "F3": false,
          "outputLength": 7508,
        },
        {
          "F1": true,
          "F2": true,
          "F3": false,
          "outputLength": 7509,
        },
        {
          "F1": true,
          "F2": true,
          "F3": false,
          "outputLength": 7510,
        },
      ]
    `);
  });

  it('char-by-char sweep 7985..8005 around the 0.80 boundary (F1 + F2)', () => {
    const rows: number[] = [];
    for (let n = 7985; n <= 8005; n++) rows.push(n);
    expect(rows.map((n) => ({ outputLength: n, F1: f1(10000, n), F2: f2(10000, n), F3: f3(10000, n) }))).toMatchInlineSnapshot(`
      [
        {
          "F1": true,
          "F2": true,
          "F3": false,
          "outputLength": 7985,
        },
        {
          "F1": true,
          "F2": true,
          "F3": false,
          "outputLength": 7986,
        },
        {
          "F1": true,
          "F2": true,
          "F3": false,
          "outputLength": 7987,
        },
        {
          "F1": true,
          "F2": true,
          "F3": false,
          "outputLength": 7988,
        },
        {
          "F1": true,
          "F2": true,
          "F3": false,
          "outputLength": 7989,
        },
        {
          "F1": true,
          "F2": true,
          "F3": false,
          "outputLength": 7990,
        },
        {
          "F1": true,
          "F2": true,
          "F3": false,
          "outputLength": 7991,
        },
        {
          "F1": true,
          "F2": true,
          "F3": false,
          "outputLength": 7992,
        },
        {
          "F1": true,
          "F2": true,
          "F3": false,
          "outputLength": 7993,
        },
        {
          "F1": true,
          "F2": true,
          "F3": false,
          "outputLength": 7994,
        },
        {
          "F1": true,
          "F2": true,
          "F3": false,
          "outputLength": 7995,
        },
        {
          "F1": true,
          "F2": true,
          "F3": false,
          "outputLength": 7996,
        },
        {
          "F1": true,
          "F2": true,
          "F3": false,
          "outputLength": 7997,
        },
        {
          "F1": true,
          "F2": true,
          "F3": false,
          "outputLength": 7998,
        },
        {
          "F1": true,
          "F2": true,
          "F3": false,
          "outputLength": 7999,
        },
        {
          "F1": false,
          "F2": false,
          "F3": false,
          "outputLength": 8000,
        },
        {
          "F1": false,
          "F2": false,
          "F3": false,
          "outputLength": 8001,
        },
        {
          "F1": false,
          "F2": false,
          "F3": false,
          "outputLength": 8002,
        },
        {
          "F1": false,
          "F2": false,
          "F3": false,
          "outputLength": 8003,
        },
        {
          "F1": false,
          "F2": false,
          "F3": false,
          "outputLength": 8004,
        },
        {
          "F1": false,
          "F2": false,
          "F3": false,
          "outputLength": 8005,
        },
      ]
    `);
  });

  it('the comparison is a strict `<` against a fractional threshold, so the boundary is between two integers', () => {
    // Inputs must clear each guard's own length gate (F1/F2: > 5000, F3: > 8000), then the
    // threshold itself is fractional: 6001 * 0.8 = 4800.8 and 9001 * 0.75 = 6750.75, so the
    // last length that still trips the guard is the floor of the product.
    const rows = [
      { in: 6001, out: 4799, threshold: 6001 * 0.8 },
      { in: 6001, out: 4800, threshold: 6001 * 0.8 },
      { in: 6001, out: 4801, threshold: 6001 * 0.8 },
      { in: 6001, out: 4802, threshold: 6001 * 0.8 },
      { in: 6003, out: 4802, threshold: 6003 * 0.8 },
      { in: 9001, out: 6749, threshold: 9001 * 0.75 },
      { in: 9001, out: 6750, threshold: 9001 * 0.75 },
      { in: 9001, out: 6751, threshold: 9001 * 0.75 },
    ];
    expect(
      rows.map((r) => ({
        ...r,
        threshold: Number(r.threshold.toFixed(3)),
        F1_0_8: f1(r.in, r.out),
        F2_0_8: f2(r.in, r.out),
        F3_0_75: f3(r.in, r.out),
      })),
    ).toMatchInlineSnapshot(`
      [
        {
          "F1_0_8": true,
          "F2_0_8": true,
          "F3_0_75": false,
          "in": 6001,
          "out": 4799,
          "threshold": 4800.8,
        },
        {
          "F1_0_8": true,
          "F2_0_8": true,
          "F3_0_75": false,
          "in": 6001,
          "out": 4800,
          "threshold": 4800.8,
        },
        {
          "F1_0_8": false,
          "F2_0_8": false,
          "F3_0_75": false,
          "in": 6001,
          "out": 4801,
          "threshold": 4800.8,
        },
        {
          "F1_0_8": false,
          "F2_0_8": false,
          "F3_0_75": false,
          "in": 6001,
          "out": 4802,
          "threshold": 4800.8,
        },
        {
          "F1_0_8": true,
          "F2_0_8": true,
          "F3_0_75": false,
          "in": 6003,
          "out": 4802,
          "threshold": 4802.4,
        },
        {
          "F1_0_8": true,
          "F2_0_8": true,
          "F3_0_75": true,
          "in": 9001,
          "out": 6749,
          "threshold": 6750.75,
        },
        {
          "F1_0_8": true,
          "F2_0_8": true,
          "F3_0_75": true,
          "in": 9001,
          "out": 6750,
          "threshold": 6750.75,
        },
        {
          "F1_0_8": true,
          "F2_0_8": true,
          "F3_0_75": false,
          "in": 9001,
          "out": 6751,
          "threshold": 6750.75,
        },
      ]
    `);
  });
});

describe('F. the length gate is `> 5000` / `> 8000`, not `>=`', () => {
  it('F1 + F2 at exactly 5000 and 5001 chars', () => {
    const rows = [4999, 5000, 5001, 5002, 7999, 8000, 8001];
    expect(rows.map((len) => ({ inputLength: len, truncatedOutput: Math.floor(len * 0.5), F1: f1(len, Math.floor(len * 0.5)), F2: f2(len, Math.floor(len * 0.5)), F3: f3(len, Math.floor(len * 0.5)) }))).toMatchInlineSnapshot(`
      [
        {
          "F1": false,
          "F2": false,
          "F3": false,
          "inputLength": 4999,
          "truncatedOutput": 2499,
        },
        {
          "F1": false,
          "F2": false,
          "F3": false,
          "inputLength": 5000,
          "truncatedOutput": 2500,
        },
        {
          "F1": true,
          "F2": true,
          "F3": false,
          "inputLength": 5001,
          "truncatedOutput": 2500,
        },
        {
          "F1": true,
          "F2": true,
          "F3": false,
          "inputLength": 5002,
          "truncatedOutput": 2501,
        },
        {
          "F1": true,
          "F2": true,
          "F3": false,
          "inputLength": 7999,
          "truncatedOutput": 3999,
        },
        {
          "F1": true,
          "F2": true,
          "F3": false,
          "inputLength": 8000,
          "truncatedOutput": 4000,
        },
        {
          "F1": true,
          "F2": true,
          "F3": true,
          "inputLength": 8001,
          "truncatedOutput": 4000,
        },
      ]
    `);
  });

  it('a 5000-char document that lost 40% of its text is NOT protected by F1/F2 but IS by nothing at all in server either (gate is 8000)', () => {
    expect({ F1: f1(5000, 3000), F2: f2(5000, 3000), F3: f3(5000, 3000), note: 'server.ts gate is > 8000' }).toMatchInlineSnapshot(`
      {
        "F1": false,
        "F2": false,
        "F3": false,
        "note": "server.ts gate is > 8000",
      }
    `);
  });

  it('a document that lost 21-25% is reverted by F1/F2 (0.8) but ACCEPTED by server (0.75)', () => {
    expect({ outputLength: Math.round(9000 * 0.76), F1: f1(9000, Math.round(9000 * 0.76)), F2: f2(9000, Math.round(9000 * 0.76)), F3: f3(9000, Math.round(9000 * 0.76)) }).toMatchInlineSnapshot(`
      {
        "F1": true,
        "F2": true,
        "F3": false,
        "outputLength": 6840,
      }
    `);
  });
});

describe('F. page-break loss, with no length loss at all', () => {
  it('F2 and F4 on the page-break clause', () => {
    const rows = [
      { origBreaks: 0, outBreaks: 0 },
      { origBreaks: 1, outBreaks: 1 },
      { origBreaks: 1, outBreaks: 0 },
      { origBreaks: 3, outBreaks: 3 },
      { origBreaks: 3, outBreaks: 2 },
      { origBreaks: 3, outBreaks: 4 },
      { origBreaks: 3, outBreaks: 0 },
      { origBreaks: 10, outBreaks: 9 },
    ];
    expect(
      rows.map((r) => ({
        ...r,
        F2: f2(10000, 10000, r.origBreaks, r.outBreaks),
        F4: f4(r.origBreaks, r.outBreaks),
        F1: f1(10000, 10000),
        F3: f3(10000, 10000),
      })),
    ).toMatchInlineSnapshot(`
      [
        {
          "F1": false,
          "F2": false,
          "F3": false,
          "F4": false,
          "origBreaks": 0,
          "outBreaks": 0,
        },
        {
          "F1": false,
          "F2": false,
          "F3": false,
          "F4": false,
          "origBreaks": 1,
          "outBreaks": 1,
        },
        {
          "F1": false,
          "F2": true,
          "F3": false,
          "F4": true,
          "origBreaks": 1,
          "outBreaks": 0,
        },
        {
          "F1": false,
          "F2": false,
          "F3": false,
          "F4": false,
          "origBreaks": 3,
          "outBreaks": 3,
        },
        {
          "F1": false,
          "F2": true,
          "F3": false,
          "F4": true,
          "origBreaks": 3,
          "outBreaks": 2,
        },
        {
          "F1": false,
          "F2": false,
          "F3": false,
          "F4": false,
          "origBreaks": 3,
          "outBreaks": 4,
        },
        {
          "F1": false,
          "F2": true,
          "F3": false,
          "F4": true,
          "origBreaks": 3,
          "outBreaks": 0,
        },
        {
          "F1": false,
          "F2": true,
          "F3": false,
          "F4": true,
          "origBreaks": 10,
          "outBreaks": 9,
        },
      ]
    `);
  });

  it('the two page-break clauses are the same predicate with different variable names', () => {
    const rows = [0, 1, 2, 3, 4];
    expect(
      rows.map((b) => ({
        origBreaks: b,
        ctxBreaks: b,
        F2_pageBreakClause: F2.fn({ rawMergedMarkdown: 'x'.repeat(10000), contextualResult: { correctedMarkdown: 'x'.repeat(10000) }, origBreaks: b, ctxBreaks: b }) === true,
        F4: f4(b, b),
      })),
    ).toMatchInlineSnapshot(`
      [
        {
          "F2_pageBreakClause": false,
          "F4": false,
          "ctxBreaks": 0,
          "origBreaks": 0,
        },
        {
          "F2_pageBreakClause": false,
          "F4": false,
          "ctxBreaks": 1,
          "origBreaks": 1,
        },
        {
          "F2_pageBreakClause": false,
          "F4": false,
          "ctxBreaks": 2,
          "origBreaks": 2,
        },
        {
          "F2_pageBreakClause": false,
          "F4": false,
          "ctxBreaks": 3,
          "origBreaks": 3,
        },
        {
          "F2_pageBreakClause": false,
          "F4": false,
          "ctxBreaks": 4,
          "origBreaks": 4,
        },
      ]
    `);
  });
});

describe('F. what "revert" actually restores', () => {
  it('F1 returns the LOCAL baseline (already run through autoFixQuranicErrors), not the raw input', () => {
    // contextualChecker.ts:21 sets baseMarkdown = autoFixQuranicErrors(markdown).correctedText
    const raw = AR_MARKDOWN_FIXTURE;
    expect({
      guardFires: f1(raw.length, 10),
      localBaseline_equals_autoFix: autoFixQuranicErrors(raw).correctedText,
      isSameAsRaw: autoFixQuranicErrors(raw).correctedText === raw,
    }).toMatchInlineSnapshot(`
      {
        "guardFires": false,
        "isSameAsRaw": false,
        "localBaseline_equals_autoFix": "# سورة الملك — التفسير

      الموضوع الأول: تفسير السور الطوال

      قال ابن عباس رضي الله عنهما في قوله تعالى ﴿تَبَارَكَ الَّذِي بِيَدِهِ الْمُلْكُ﴾: الملك التام بلا نقص.

      ## وجوه الإعراب في سورة الملك

      | الكلمة | الإعراب | العلة |
      | مَا تَرَىٰ | اسم مبتدأ | ــ |
      | تَفَاوُتٍ | مجرور | مِن زائدة |

      - **﴿مِن تَفَاوُتٍ﴾** تصحيح شائع والصواب *مِن تَفَاوُتٍ*.
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

      سورة النبأ ﴿لَّابِثِينَ فِيهَا أَحْقَابًا﴾

      الفقه الحنفي: بيع الحاضر للبادي: وهو أن يقدم القروي بمتاعه لبيعه بسعر يومه فيقول له البلدي: اتركه عندي لأبيعه لك على التدريج بأغلى؛ وعلة النهي: لئلا يتضرر أهل البلد.

      رواية ابن ماجه والنساء شقائق الرجال.

      كفته نيته.

      ﴿مِن تَفَاوُتٍ﴾

      الصفحة 22
      ",
      }
    `);
  });

  it('F2 restores autoFixQuranicErrors(rawMergedMarkdown).correctedText', () => {
    const target = extractRhs('src/utils/documentConverter.ts', 'contextualResult.correctedMarkdown = autoFixQuranicErrors');
    const raw = AR_MARKDOWN_FIXTURE;
    const restored = target.fn({ autoFixQuranicErrors, rawMergedMarkdown: raw });
    expect({ anchor: 'contextualResult.correctedMarkdown = autoFixQuranicErrors', expr: target.expr, guardFires: f2(raw.length, 100, 2, 1), restoredLength: (restored as string).length, restoredEqualsRaw: restored === raw }).toMatchInlineSnapshot(`
      {
        "anchor": "contextualResult.correctedMarkdown = autoFixQuranicErrors",
        "expr": "autoFixQuranicErrors(rawMergedMarkdown).correctedText",
        "guardFires": true,
        "restoredEqualsRaw": false,
        "restoredLength": 1468,
      }
    `);
  });

  it('F3/F4 return the untouched server-side `markdown`', () => {
    const body = sourceSlice('server.ts', F3.startLine, F4.startLine + 6);
    expect({ guardFires: f3(9000, 100), f4Fires: f4(4, 1), serverSourceExcerpt: body.split('\n').filter((l) => l.includes('correctedMarkdown') || l.includes('isTruncationPrevented') || l.includes('res.json')) }).toMatchInlineSnapshot(`
      {
        "f4Fires": true,
        "guardFires": true,
        "serverSourceExcerpt": [
          "      return res.json({",
          "          correctedMarkdown: markdown,",
          "          isTruncationPrevented: true,",
          "      return res.json({",
          "          correctedMarkdown: markdown,",
        ],
      }
    `);
  });
});

describe('F. combined boundary: real page-break counts from a real document', () => {
  it('break counts are literal `---PAGE_BREAK---` matches; formatting variants are invisible', () => {
    const doc = `page one\n\n${PB}\n\npage two\n\n${PB}\n\npage three`;
    const mangled = `page one\n\n---PAGE_BREAK---\n\npage two\n\n--- page break ---\n\npage three`;
    expect({
      docBreaks: countBreaks(doc),
      mangledBreaks: countBreaks(mangled),
      F2_doc: f2(10000, 10000, countBreaks(doc), countBreaks(doc)),
      F2_mangled: f2(10000, 10000, countBreaks(doc), countBreaks(mangled)),
      F4_doc: f4(countBreaks(doc), countBreaks(doc)),
      F4_mangled: f4(countBreaks(doc), countBreaks(mangled)),
    }).toMatchInlineSnapshot(`
      {
        "F2_doc": false,
        "F2_mangled": true,
        "F4_doc": false,
        "F4_mangled": true,
        "docBreaks": 2,
        "mangledBreaks": 1,
      }
    `);
  });

  it('an output that keeps every character but loses half the page breaks', () => {
    const outLen = 10000;
    expect({ F1: f1(outLen, outLen), F2: f2(outLen, outLen, 4, 2), F3: f3(outLen, outLen), F4: f4(4, 2) }).toMatchInlineSnapshot(`
      {
        "F1": false,
        "F2": true,
        "F3": false,
        "F4": true,
      }
    `);
  });
});