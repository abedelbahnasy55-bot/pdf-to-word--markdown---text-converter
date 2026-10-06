import { describe, it, expect } from 'vitest';
import { extractDecl, extractRhs } from './helpers/inlineExtract';
import { extractFunction } from './helpers/sourceExtract';
import { AR_MARKDOWN_FIXTURE, EN_MARKDOWN_FIXTURE, AR_FOOTNOTE_FIXTURE } from './fixtures/curriculum';

/**
 * GROUP B — Arabic detection.
 *
 * THREE families now live side by side (this file was written while a concurrent
 * refactor was migrating the inline copies, so the set is documented as it is NOW):
 *
 *   Count family — ABSOLUTE threshold, `(text.match(/[\u0600-\u06FF]/g) || []).length > 20`
 *     B2  src/App.tsx              binding `err.partialMarkdown`
 *     B3  src/App.tsx              binding `finalMarkdown`
 *     B4  src/App.tsx              binding `currentExtractedMarkdown`
 *     => needs >= 21 Arabic chars from block 0600-06FF ONLY; ignores Latin entirely.
 *
 *   Ratio family (private, layout engine) — `isArabicText`
 *     B5  src/utils/layoutIntegrityCore.ts, `function isArabicText`
 *     => arabicCount > 0 && arabicCount >= latinCount * 0.3, over 0600-06FF + 0750-077F
 *        + 08A0-08FF.
 *
 *   Ratio family (new canonical module, added during this stage) — `isRightToLeftText`
 *     B6  shared/arabicText.ts, `export function isRightToLeftText`
 *     B1  src/utils/documentConverter.ts now CALLS it: `const isArabic = isRightToLeftText(finalMarkdown)`
 *     => same 0.3 ratio, but arabicCount === 0 returns early and the call site is a
 *        delegated call instead of an inline copy. The inline `> 20` copy that used to
 *        live in documentConverter.ts is GONE, so the count family is 3 copies, not 4.
 *
 * B5 is extracted with `extractFunction` (a `function` declaration); B1..B4 are one-line
 * initializers read with `extractRhs`; B6 is a declaration read with `extractDecl`.
 * Line numbers are deliberately NOT snapshotted — see the anchor comment in each section.
 */
const B2 = extractRhs('src/App.tsx', 'const isAr = (err.partialMarkdown');
const B3 = extractRhs('src/App.tsx', 'const isArabic = (finalMarkdown');
const B4 = extractRhs('src/App.tsx', 'const isAr = (currentExtractedMarkdown');
const B5 = extractFunction<(text: string) => boolean>(
  'src/utils/layoutIntegrityCore.ts',
  'function isArabicText',
  'isArabicText',
);
const B6 = extractDecl<(text: string) => boolean>('shared/arabicText.ts', 'export function isRightToLeftText', 'isRightToLeftText', { module: true });
/** The documentConverter call site, evaluated against the REAL B6 so the pipeline verdict is real. */
const B1 = extractRhs('src/utils/documentConverter.ts', 'const isArabic = isRightToLeftText');

/** 1 Arabic char (U+0633) and 1 ASCII letter, for exact-ratio fixtures. */
const AR1 = '\u0633';
const EN1 = 'a';

const countFamily = [
  { id: 'B2 App.tsx (err.partialMarkdown)', expr: B2, bind: (s: string) => ({ err: { partialMarkdown: s } }) },
  { id: 'B3 App.tsx (finalMarkdown)', expr: B3, bind: (s: string) => ({ finalMarkdown: s }) },
  { id: 'B4 App.tsx (currentExtractedMarkdown)', expr: B4, bind: (s: string) => ({ currentExtractedMarkdown: s }) },
];

/** True when every count-family copy agrees (they must: the text is identical). */
const countSays = (s: string): boolean => countFamily.every((c) => c.expr.fn(c.bind(s)) === true);
const layoutSays = (s: string): boolean => B5(s) === true;
const canonicalSays = (s: string): boolean => B6(s) === true;
const pipelineSays = (s: string): boolean => B1.fn({ isRightToLeftText: B6, finalMarkdown: s }) === true;

const mix = (arabic: number, latin: number): string => AR1.repeat(arabic) + EN1.repeat(latin);

describe('B. provenance: three rules, not one', () => {
  it('the three surviving count-family copies read the same literal, three different bindings', () => {
    expect({
      B2: { file: 'src/App.tsx', anchor: 'const isAr = (err.partialMarkdown', expr: B2.expr, vars: B2.vars },
      B3: { file: 'src/App.tsx', anchor: 'const isArabic = (finalMarkdown', expr: B3.expr, vars: B3.vars },
      B4: { file: 'src/App.tsx', anchor: 'const isAr = (currentExtractedMarkdown', expr: B4.expr, vars: B4.vars },
      distinctExprs: new Set([B2.expr, B3.expr, B4.expr]).size,
    }).toMatchInlineSnapshot(`
      {
        "B2": {
          "anchor": "const isAr = (err.partialMarkdown",
          "expr": "(err.partialMarkdown.match(/[\\u0600-\\u06FF]/g) || []).length > 20",
          "file": "src/App.tsx",
          "vars": [
            "err",
          ],
        },
        "B3": {
          "anchor": "const isArabic = (finalMarkdown",
          "expr": "(finalMarkdown.match(/[\\u0600-\\u06FF]/g) || []).length > 20",
          "file": "src/App.tsx",
          "vars": [
            "finalMarkdown",
          ],
        },
        "B4": {
          "anchor": "const isAr = (currentExtractedMarkdown",
          "expr": "(currentExtractedMarkdown.match(/[\\u0600-\\u06FF]/g) || []).length > 20",
          "file": "src/App.tsx",
          "vars": [
            "currentExtractedMarkdown",
          ],
        },
        "distinctExprs": 3,
      }
    `);
  });

  it('documentConverter.ts no longer holds an inline copy: it delegates to the canonical module', () => {
    expect({
      file: 'src/utils/documentConverter.ts',
      anchor: 'const isArabic = isRightToLeftText',
      expr: B1.expr,
      vars: B1.vars,
      inlineCopyRemaining: false,
    }).toMatchInlineSnapshot(`
      {
        "anchor": "const isArabic = isRightToLeftText",
        "expr": "isRightToLeftText(finalMarkdown)",
        "file": "src/utils/documentConverter.ts",
        "inlineCopyRemaining": false,
        "vars": [
          "isRightToLeftText",
          "finalMarkdown",
        ],
      }
    `);
  });

  it('B5 is the private ratio predicate', () => {
    expect(B5.toString()).toMatchInlineSnapshot(`
      "function isArabicText(text) {
        const arabicMatch = text.match(/[\\u0600-\\u06FF\\u0750-\\u077F\\u08A0-\\u08FF]/g);
        const latinMatch = text.match(/[a-zA-Z]/g);
        const arabicCount = arabicMatch ? arabicMatch.length : 0;
        const latinCount = latinMatch ? latinMatch.length : 0;
        return arabicCount > 0 && arabicCount >= latinCount * 0.3;
      }"
    `);
  });

  it('B6 is the canonical ratio predicate', () => {
    expect(B6.__source).toMatchInlineSnapshot(`
      "/**
       * Canonical Arabic text handling, shared by the browser client and the Node server.
       *
       * This module is the single owner of every Arabic-script text rule in the project.
       * It previously had no owner at all: the same normalization was expected of the
       * markdown pipeline, the docx exporter, and the layout auditor, each with its own
       * private inline copy.
       */

      /**
       * Arabic Presentation Forms blocks:
       *   U+FB50–U+FDFF  Arabic Presentation Forms-A
       *   U+FE70–U+FEFF  Arabic Presentation Forms-B
       *
       * These are the legacy shaping glyphs that PDFs embed for pre-shaped Arabic.
       */
      const ARABIC_PRESENTATION_FORMS = /[\\uFB50-\\uFDFF\\uFE70-\\uFEFF]/g;

      /** The full Arabic Unicode range including the extended Arabic blocks. */
      const ARABIC_LETTER = /[\\u0600-\\u06FF\\u0750-\\u077F\\u08A0-\\u08FF]/;
      const ARABIC_LETTER_GLOBAL = /[\\u0600-\\u06FF\\u0750-\\u077F\\u08A0-\\u08FF]/g;

      /**
       * Converts Arabic Presentation Forms back to standard Arabic letters.
       *
       * WHY THIS MATTERS MORE THAN ANY OTHER RTL FIX
       * Presentation forms are pre-shaped, isolated glyphs. Text in this form looks like
       * Arabic but is not: the shaping engine cannot reshape it, and — critically — the
       * Unicode bidirectional algorithm treats each glyph as an opaque neutral character
       * rather than as a letter. The result in Word is that Arabic renders as disconnected
       * letter fragments, embedded digits and Latin words get reordered incorrectly, and
       * the text cannot be searched or copied out cleanly.
       *
       * Measured on this project's own extraction golden, 149 of 212 Arabic characters
       * arrived in presentation form, so roughly 70% of the Arabic in a converted book was
       * affected.
       *
       * Only the presentation-forms blocks are normalized, deliberately NOT a blanket
       * NFKC of the whole document. A blanket normalize would also rewrite unrelated
       * content the curriculum actually uses: ① becomes 1, ﬁ becomes fi, ½ becomes 1/2,
       * ™ becomes TM. Restricting the replacement to the two presentation-forms blocks
       * converts 149 characters to 0 while leaving every other codepoint untouched, and
       * still resolves the sacred ligature U+FDF2 (ﷲ) to the correct Allah.
       */
      export function toStandardArabic(text: string): string {
        if (!text) return text;
        return text.replace(ARABIC_PRESENTATION_FORMS, (char) => char.normalize('NFKC'));
      }

      /** Counts characters in the Arabic Unicode range. */
      export function countArabicCharacters(text: string): number {
        if (!text) return 0;
        return (text.match(ARABIC_LETTER_GLOBAL) || []).length;
      }

      /** Counts Latin letters. */
      export function countLatinCharacters(text: string): number {
        if (!text) return 0;
        return (text.match(/[a-zA-Z]/g) || []).length;
      }

      /** True when at least one Arabic letter is present. */
      export function containsArabic(text: string): boolean {
        if (!text) return false;
        return ARABIC_LETTER.test(text);
      }

      /**
       * Decides whether a document should be treated as right-to-left.
       *
       * This is the ratio-based decision, replacing the six copies of an absolute
       * character-count threshold that disagreed with one another: a threshold of "more
       * than 20 Arabic characters" calls a 700-character English lecture with a short
       * Arabic title Arabic, and calls a two-line Arabic passage English.
       *
       * Direction is a property of the document as a whole, so it is decided by
       * proportion rather than by presence.
       */
      export function isRightToLeftText(text: string): boolean {
        if (!text) return false;
        const arabic = countArabicCharacters(text);
        const latin = countLatinCharacters(text);
        if (arabic === 0) return false;
        // Arabic is the majority script. Religious curricula interleave Latin terms
        // (proper nouns, transliterations) heavily, so a bare "more Arabic than Latin"
        // rule is too strict; 30% is the conventional cutoff.
        return arabic >= latin * 0.3;
      }"
    `);
  });

  it('B5 and B6 are the same 0.3 ratio rule, so they agree on every probe below', () => {
    const probes = ['', 'س', 'a', mix(1, 0), mix(20, 0), mix(21, 0), mix(30, 100), mix(30, 101), 'فارسی', String.fromCharCode(0x0750).repeat(25)];
    expect(probes.map((t) => ({ len: t.length, B5_layout: layoutSays(t), B6_canonical: canonicalSays(t), equal: layoutSays(t) === canonicalSays(t) }))).toMatchInlineSnapshot(`
      [
        {
          "B5_layout": false,
          "B6_canonical": false,
          "equal": true,
          "len": 0,
        },
        {
          "B5_layout": true,
          "B6_canonical": true,
          "equal": true,
          "len": 1,
        },
        {
          "B5_layout": false,
          "B6_canonical": false,
          "equal": true,
          "len": 1,
        },
        {
          "B5_layout": true,
          "B6_canonical": true,
          "equal": true,
          "len": 1,
        },
        {
          "B5_layout": true,
          "B6_canonical": true,
          "equal": true,
          "len": 20,
        },
        {
          "B5_layout": true,
          "B6_canonical": true,
          "equal": true,
          "len": 21,
        },
        {
          "B5_layout": true,
          "B6_canonical": true,
          "equal": true,
          "len": 130,
        },
        {
          "B5_layout": false,
          "B6_canonical": false,
          "equal": true,
          "len": 131,
        },
        {
          "B5_layout": true,
          "B6_canonical": true,
          "equal": true,
          "len": 5,
        },
        {
          "B5_layout": true,
          "B6_canonical": true,
          "equal": true,
          "len": 25,
        },
      ]
    `);
  });
});

describe('B. the seven requested Arabic ratios', () => {
  const cases = [
    { ratio: '0%', arabic: 0, latin: 40 },
    { ratio: '5%', arabic: 2, latin: 38 },
    { ratio: '20%', arabic: 8, latin: 32 },
    { ratio: '21%', arabic: 21, latin: 79 },
    { ratio: '40%', arabic: 40, latin: 60 },
    { ratio: '60%', arabic: 60, latin: 40 },
    { ratio: '100%', arabic: 60, latin: 0 },
  ];

  it('count family vs both ratio families at each ratio', () => {
    expect(
      cases.map((c) => {
        const text = mix(c.arabic, c.latin);
        return {
          ratio: c.ratio,
          arabicChars: c.arabic,
          latinChars: c.latin,
          countFamily: countSays(text),
          ratio_layoutCore: layoutSays(text),
          ratio_canonical: canonicalSays(text),
          pipeline_documentConverter: pipelineSays(text),
        };
      }),
    ).toMatchInlineSnapshot(`
      [
        {
          "arabicChars": 0,
          "countFamily": false,
          "latinChars": 40,
          "pipeline_documentConverter": false,
          "ratio": "0%",
          "ratio_canonical": false,
          "ratio_layoutCore": false,
        },
        {
          "arabicChars": 2,
          "countFamily": false,
          "latinChars": 38,
          "pipeline_documentConverter": false,
          "ratio": "5%",
          "ratio_canonical": false,
          "ratio_layoutCore": false,
        },
        {
          "arabicChars": 8,
          "countFamily": false,
          "latinChars": 32,
          "pipeline_documentConverter": false,
          "ratio": "20%",
          "ratio_canonical": false,
          "ratio_layoutCore": false,
        },
        {
          "arabicChars": 21,
          "countFamily": true,
          "latinChars": 79,
          "pipeline_documentConverter": false,
          "ratio": "21%",
          "ratio_canonical": false,
          "ratio_layoutCore": false,
        },
        {
          "arabicChars": 40,
          "countFamily": true,
          "latinChars": 60,
          "pipeline_documentConverter": true,
          "ratio": "40%",
          "ratio_canonical": true,
          "ratio_layoutCore": true,
        },
        {
          "arabicChars": 60,
          "countFamily": true,
          "latinChars": 40,
          "pipeline_documentConverter": true,
          "ratio": "60%",
          "ratio_canonical": true,
          "ratio_layoutCore": true,
        },
        {
          "arabicChars": 60,
          "countFamily": true,
          "latinChars": 0,
          "pipeline_documentConverter": true,
          "ratio": "100%",
          "ratio_canonical": true,
          "ratio_layoutCore": true,
        },
      ]
    `);
  });

  it('all three count-family copies return the same verdict on every case', () => {
    expect(
      cases.map((c) => {
        const text = mix(c.arabic, c.latin);
        return countFamily.map((f) => f.expr.fn(f.bind(text)));
      }),
    ).toMatchInlineSnapshot(`
      [
        [
          false,
          false,
          false,
        ],
        [
          false,
          false,
          false,
        ],
        [
          false,
          false,
          false,
        ],
        [
          true,
          true,
          true,
        ],
        [
          true,
          true,
          true,
        ],
        [
          true,
          true,
          true,
        ],
        [
          true,
          true,
          true,
        ],
      ]
    `);
  });
});

describe('B. exact flip points', () => {
  it('count family flips at 21 Arabic chars (strictly > 20), with zero latin present', () => {
    const sweep = [0, 1, 5, 19, 20, 21, 22, 40];
    expect(
      sweep.map((n) => {
        const text = mix(n, 0);
        return { arabic: n, countFamily: countSays(text), ratio_layoutCore: layoutSays(text), ratio_canonical: canonicalSays(text) };
      }),
    ).toMatchInlineSnapshot(`
      [
        {
          "arabic": 0,
          "countFamily": false,
          "ratio_canonical": false,
          "ratio_layoutCore": false,
        },
        {
          "arabic": 1,
          "countFamily": false,
          "ratio_canonical": true,
          "ratio_layoutCore": true,
        },
        {
          "arabic": 5,
          "countFamily": false,
          "ratio_canonical": true,
          "ratio_layoutCore": true,
        },
        {
          "arabic": 19,
          "countFamily": false,
          "ratio_canonical": true,
          "ratio_layoutCore": true,
        },
        {
          "arabic": 20,
          "countFamily": false,
          "ratio_canonical": true,
          "ratio_layoutCore": true,
        },
        {
          "arabic": 21,
          "countFamily": true,
          "ratio_canonical": true,
          "ratio_layoutCore": true,
        },
        {
          "arabic": 22,
          "countFamily": true,
          "ratio_canonical": true,
          "ratio_layoutCore": true,
        },
        {
          "arabic": 40,
          "countFamily": true,
          "ratio_canonical": true,
          "ratio_layoutCore": true,
        },
      ]
    `);
  });

  it('ratio family flips at arabic=30 / latin=100 (arabic >= latin * 0.3)', () => {
    const sweep = [29, 30, 31, 60, 99, 100, 101, 200];
    expect(
      sweep.map((latin) => {
        const text = mix(30, latin);
        return { latin, countFamily: countSays(text), ratio_layoutCore: layoutSays(text), ratio_canonical: canonicalSays(text) };
      }),
    ).toMatchInlineSnapshot(`
      [
        {
          "countFamily": true,
          "latin": 29,
          "ratio_canonical": true,
          "ratio_layoutCore": true,
        },
        {
          "countFamily": true,
          "latin": 30,
          "ratio_canonical": true,
          "ratio_layoutCore": true,
        },
        {
          "countFamily": true,
          "latin": 31,
          "ratio_canonical": true,
          "ratio_layoutCore": true,
        },
        {
          "countFamily": true,
          "latin": 60,
          "ratio_canonical": true,
          "ratio_layoutCore": true,
        },
        {
          "countFamily": true,
          "latin": 99,
          "ratio_canonical": true,
          "ratio_layoutCore": true,
        },
        {
          "countFamily": true,
          "latin": 100,
          "ratio_canonical": true,
          "ratio_layoutCore": true,
        },
        {
          "countFamily": true,
          "latin": 101,
          "ratio_canonical": false,
          "ratio_layoutCore": false,
        },
        {
          "countFamily": true,
          "latin": 200,
          "ratio_canonical": false,
          "ratio_layoutCore": false,
        },
      ]
    `);
  });

  it('a latin-only string, and small amounts of Arabic inside a long latin document', () => {
    const probes = [
      { label: 'latin only', text: mix(0, 500) },
      { label: '1 arabic char in 500 latin', text: mix(1, 500) },
      { label: '20 arabic chars in 500 latin', text: mix(20, 500) },
      { label: '21 arabic chars in 500 latin', text: mix(21, 500) },
      { label: '21 arabic chars in 67 latin', text: mix(21, 67) },
      { label: '100 arabic chars in 100 latin', text: mix(100, 100) },
    ];
    expect(
      probes.map((p) => ({
        ...p,
        length: p.text.length,
        countFamily: countSays(p.text),
        ratio_layoutCore: layoutSays(p.text),
        ratio_canonical: canonicalSays(p.text),
      })),
    ).toMatchInlineSnapshot(`
      [
        {
          "countFamily": false,
          "label": "latin only",
          "length": 500,
          "ratio_canonical": false,
          "ratio_layoutCore": false,
          "text": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
        {
          "countFamily": false,
          "label": "1 arabic char in 500 latin",
          "length": 501,
          "ratio_canonical": false,
          "ratio_layoutCore": false,
          "text": "سaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
        {
          "countFamily": false,
          "label": "20 arabic chars in 500 latin",
          "length": 520,
          "ratio_canonical": false,
          "ratio_layoutCore": false,
          "text": "سسسسسسسسسسسسسسسسسسسسaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
        {
          "countFamily": true,
          "label": "21 arabic chars in 500 latin",
          "length": 521,
          "ratio_canonical": false,
          "ratio_layoutCore": false,
          "text": "سسسسسسسسسسسسسسسسسسسسسaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
        {
          "countFamily": true,
          "label": "21 arabic chars in 67 latin",
          "length": 88,
          "ratio_canonical": true,
          "ratio_layoutCore": true,
          "text": "سسسسسسسسسسسسسسسسسسسسسaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
        {
          "countFamily": true,
          "label": "100 arabic chars in 100 latin",
          "length": 200,
          "ratio_canonical": true,
          "ratio_layoutCore": true,
          "text": "سسسسسسسسسسسسسسسسسسسسسسسسسسسسسسسسسسسسسسسسسسسسسسسسسسسسسسسسسسسسسسسسسسسسسسسسسسسسسسسسسسسسسسسسسسسسسسسسسسسسaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
      ]
    `);
  });
});

describe('B. disagreements between the count family and the ratio families', () => {
  it('short Arabic text: ratio says Arabic, count says English', () => {
    const probes = [
      { label: 'single arabic char', text: mix(1, 0) },
      { label: '5 arabic chars, 0 latin', text: mix(5, 0) },
      { label: '10 arabic chars, 0 latin', text: mix(10, 0) },
      { label: '20 arabic chars, 0 latin (boundary)', text: mix(20, 0) },
      { label: '21 arabic chars in 10000 latin', text: mix(21, 10000) },
      { label: '30 arabic chars in 10000 latin', text: mix(30, 10000) },
    ];
    expect(
      probes.map((p) => ({
        ...p,
        countFamily: countSays(p.text),
        ratio_layoutCore: layoutSays(p.text),
        ratio_canonical: canonicalSays(p.text),
        DISAGREE: countSays(p.text) !== canonicalSays(p.text),
      })),
    ).toMatchInlineSnapshot(`
      [
        {
          "DISAGREE": true,
          "countFamily": false,
          "label": "single arabic char",
          "ratio_canonical": true,
          "ratio_layoutCore": true,
          "text": "س",
        },
        {
          "DISAGREE": true,
          "countFamily": false,
          "label": "5 arabic chars, 0 latin",
          "ratio_canonical": true,
          "ratio_layoutCore": true,
          "text": "سسسسس",
        },
        {
          "DISAGREE": true,
          "countFamily": false,
          "label": "10 arabic chars, 0 latin",
          "ratio_canonical": true,
          "ratio_layoutCore": true,
          "text": "سسسسسسسسسس",
        },
        {
          "DISAGREE": true,
          "countFamily": false,
          "label": "20 arabic chars, 0 latin (boundary)",
          "ratio_canonical": true,
          "ratio_layoutCore": true,
          "text": "سسسسسسسسسسسسسسسسسسسس",
        },
        {
          "DISAGREE": true,
          "countFamily": true,
          "label": "21 arabic chars in 10000 latin",
          "ratio_canonical": false,
          "ratio_layoutCore": false,
          "text": "سسسسسسسسسسسسسسسسسسسسسaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
        {
          "DISAGREE": true,
          "countFamily": true,
          "label": "30 arabic chars in 10000 latin",
          "ratio_canonical": false,
          "ratio_layoutCore": false,
          "text": "سسسسسسسسسسسسسسسسسسسسسسسسسسسسسسaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
      ]
    `);
  });

  it('character ranges: 0750-077F and 08A0-08FF count for the ratio families only', () => {
    const supp = String.fromCharCode(0x0750);
    const aug = String.fromCharCode(0x08a0);
    const persian = '\u0641\u0627\u0631\u0633\u06cc';
    const probes = [
      { label: '25 x U+0750 (Arabic Supplement)', text: supp.repeat(25) },
      { label: '25 x U+08A0 (Arabic Extended-A)', text: aug.repeat(25) },
      { label: 'Persian فارسی (contains U+06CC)', text: persian },
      { label: 'Persian x 8', text: persian.repeat(8) },
      { label: '25 x U+FB50 (Presentation Forms-A, outside every range)', text: String.fromCharCode(0xfb50).repeat(25) },
    ];
    expect(
      probes.map((p) => ({
        ...p,
        countFamily: countSays(p.text),
        ratio_layoutCore: layoutSays(p.text),
        ratio_canonical: canonicalSays(p.text),
        DISAGREE: countSays(p.text) !== canonicalSays(p.text),
      })),
    ).toMatchInlineSnapshot(`
      [
        {
          "DISAGREE": true,
          "countFamily": false,
          "label": "25 x U+0750 (Arabic Supplement)",
          "ratio_canonical": true,
          "ratio_layoutCore": true,
          "text": "ݐݐݐݐݐݐݐݐݐݐݐݐݐݐݐݐݐݐݐݐݐݐݐݐݐ",
        },
        {
          "DISAGREE": true,
          "countFamily": false,
          "label": "25 x U+08A0 (Arabic Extended-A)",
          "ratio_canonical": true,
          "ratio_layoutCore": true,
          "text": "ࢠࢠࢠࢠࢠࢠࢠࢠࢠࢠࢠࢠࢠࢠࢠࢠࢠࢠࢠࢠࢠࢠࢠࢠࢠ",
        },
        {
          "DISAGREE": true,
          "countFamily": false,
          "label": "Persian فارسی (contains U+06CC)",
          "ratio_canonical": true,
          "ratio_layoutCore": true,
          "text": "فارسی",
        },
        {
          "DISAGREE": false,
          "countFamily": true,
          "label": "Persian x 8",
          "ratio_canonical": true,
          "ratio_layoutCore": true,
          "text": "فارسیفارسیفارسیفارسیفارسیفارسیفارسیفارسی",
        },
        {
          "DISAGREE": false,
          "countFamily": false,
          "label": "25 x U+FB50 (Presentation Forms-A, outside every range)",
          "ratio_canonical": false,
          "ratio_layoutCore": false,
          "text": "ﭐﭐﭐﭐﭐﭐﭐﭐﭐﭐﭐﭐﭐﭐﭐﭐﭐﭐﭐﭐﭐﭐﭐﭐﭐ",
        },
      ]
    `);
  });

  it('non-Arabic scripts: invisible to both families, but they still disagree with each other', () => {
    const probes = [
      { label: 'Russian, 42 chars', text: '\u0417\u0434\u0440\u0430\u0432\u0441\u0442\u0432\u0443\u0439'.repeat(6) },
      { label: 'digits + punctuation only', text: '0123456789 ......'.repeat(3) },
      { label: 'Hebrew, 30 chars', text: '\u05e9\u05dc\u05d5\u05dd'.repeat(10) },
      { label: 'empty string', text: '' },
    ];
    expect(
      probes.map((p) => ({
        ...p,
        countFamily: countSays(p.text),
        ratio_layoutCore: layoutSays(p.text),
        ratio_canonical: canonicalSays(p.text),
        DISAGREE: countSays(p.text) !== canonicalSays(p.text),
      })),
    ).toMatchInlineSnapshot(`
      [
        {
          "DISAGREE": false,
          "countFamily": false,
          "label": "Russian, 42 chars",
          "ratio_canonical": false,
          "ratio_layoutCore": false,
          "text": "ЗдравствуйЗдравствуйЗдравствуйЗдравствуйЗдравствуйЗдравствуй",
        },
        {
          "DISAGREE": false,
          "countFamily": false,
          "label": "digits + punctuation only",
          "ratio_canonical": false,
          "ratio_layoutCore": false,
          "text": "0123456789 ......0123456789 ......0123456789 ......",
        },
        {
          "DISAGREE": false,
          "countFamily": false,
          "label": "Hebrew, 30 chars",
          "ratio_canonical": false,
          "ratio_layoutCore": false,
          "text": "שלוםשלוםשלוםשלוםשלוםשלוםשלוםשלוםשלוםשלום",
        },
        {
          "DISAGREE": false,
          "countFamily": false,
          "label": "empty string",
          "ratio_canonical": false,
          "ratio_layoutCore": false,
          "text": "",
        },
      ]
    `);
  });
});

describe('B. all detectors on the shared fixtures', () => {
  it('AR / EN / footnote fixtures and one mixed case', () => {
    const rows = [
      { label: 'AR_MARKDOWN_FIXTURE', text: AR_MARKDOWN_FIXTURE },
      { label: 'EN_MARKDOWN_FIXTURE', text: EN_MARKDOWN_FIXTURE },
      { label: 'AR_FOOTNOTE_FIXTURE', text: AR_FOOTNOTE_FIXTURE },
      { label: 'EN fixture with an Arabic header pasted in', text: `# مقدمة\n\n${EN_MARKDOWN_FIXTURE}` },
    ];
    expect(
      rows.map((r) => {
        const arabic = (r.text.match(/[\u0600-\u06FF]/g) || []).length;
        const latin = (r.text.match(/[a-zA-Z]/g) || []).length;
        return {
          label: r.label,
          arabicChars: arabic,
          latinChars: latin,
          arabicShare: Number((arabic / (arabic + latin)).toFixed(4)),
          countFamily: countSays(r.text),
          ratio_layoutCore: layoutSays(r.text),
          ratio_canonical: canonicalSays(r.text),
          perCountCopy: countFamily.map((c) => c.expr.fn(c.bind(r.text))),
        };
      }),
    ).toMatchInlineSnapshot(`
      [
        {
          "arabicChars": 552,
          "arabicShare": 0.9356,
          "countFamily": true,
          "label": "AR_MARKDOWN_FIXTURE",
          "latinChars": 38,
          "perCountCopy": [
            true,
            true,
            true,
          ],
          "ratio_canonical": true,
          "ratio_layoutCore": true,
        },
        {
          "arabicChars": 4,
          "arabicShare": 0.0112,
          "countFamily": false,
          "label": "EN_MARKDOWN_FIXTURE",
          "latinChars": 352,
          "perCountCopy": [
            false,
            false,
            false,
          ],
          "ratio_canonical": false,
          "ratio_layoutCore": false,
        },
        {
          "arabicChars": 212,
          "arabicShare": 1,
          "countFamily": true,
          "label": "AR_FOOTNOTE_FIXTURE",
          "latinChars": 0,
          "perCountCopy": [
            true,
            true,
            true,
          ],
          "ratio_canonical": true,
          "ratio_layoutCore": true,
        },
        {
          "arabicChars": 9,
          "arabicShare": 0.0249,
          "countFamily": false,
          "label": "EN fixture with an Arabic header pasted in",
          "latinChars": 352,
          "perCountCopy": [
            false,
            false,
            false,
          ],
          "ratio_canonical": false,
          "ratio_layoutCore": false,
        },
      ]
    `);
  });
});