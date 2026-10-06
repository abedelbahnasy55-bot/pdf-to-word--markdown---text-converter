import { describe, it, expect } from 'vitest';
import { extractAssignmentChain, extractStatementRun } from './helpers/inlineExtract';
import { readSourceLines } from './helpers/sourceExtract';
import { AR_MARKDOWN_FIXTURE, EN_MARKDOWN_FIXTURE } from './fixtures/curriculum';

/**
 * GROUP A — the chunk-sanitization chains (dot compression + HTML artifact stripping).
 *
 * Four live copies, pinned SEPARATELY, because "they look the same" is exactly the claim
 * this suite exists to check:
 *
 *   A1  src/utils/documentConverter.ts   anchor `sanitizedChunkMd = chunkData.markdown`     7 steps
 *   A2  src/utils/documentConverter.ts   anchor `sanitizedChunkTxt = chunkData.plainText`  4 steps
 *   A3  src/utils/quranAuditor.ts        anchor `corrected = corrected.replace(/\.{6,}/g`   3 steps
 *   A4  server.ts                        anchor `// Compress runaway dots and repetitive dot loops`
 *                                                                                           19 steps
 *
 * A1/A2 are `const X = Y` chains, so `sourceExtract.extractChain` cannot reach them: its
 * 'const' shape requires the RHS to be a bare identifier, and both are member expressions
 * (`chunkData.markdown`). A3 is a run of single-line statements, A4 a self-assignment chain.
 * All four are compiled by `tests/helpers/inlineExtract.ts`.
 *
 * Every site is located by a CONTENT ANCHOR. A4's search start is derived from the position
 * of its distinctive `// Compress runaway dots...` comment, never from a hard-coded line:
 * server.ts contains five `cleaned = cleaned` statements and only the last is the 19-step
 * curriculum chain.
 *
 * Callers apply `.trim()` after the chain (documentConverter) or `cleanMarkdown` returns
 * `cleaned.trim()` (server). The `.trim()` lives OUTSIDE these chains and is not pinned here.
 */
const A1 = extractAssignmentChain('src/utils/documentConverter.ts', 'sanitizedChunkMd = chunkData.markdown');
const A2 = extractAssignmentChain('src/utils/documentConverter.ts', 'sanitizedChunkTxt = chunkData.plainText');
const A3 = extractStatementRun('src/utils/quranAuditor.ts', "corrected = corrected.replace(/\\.{6,}/g", { count: 3 });
const SERVER_DOT_COMMENT_LINE =
  readSourceLines('server.ts').findIndex((l) => l.includes('// Compress runaway dots and repetitive dot loops')) + 1;
const A4 = extractAssignmentChain('server.ts', 'cleaned = cleaned', { from: SERVER_DOT_COMMENT_LINE - 1 });

/** Bindings each chain reads, named exactly as in the production source. */
const md = (markdown: string) => ({ chunkData: { markdown } });
const txt = (plainText: string) => ({ chunkData: { plainText } });
const corrected = (content: string) => ({ corrected: content });
const cleaned = (content: string) => ({ cleaned: content });

/** dot-only inputs, deliberately free of the Azhar phrases server.ts also rewrites. */
const DOT_PROBES = [
  'فقط.......ثم...............................',
  'علوم القرآن هي .....',
  'a.....b',
  'a......b',
  '. . . . . .\n. . . . . .',
  'x\n.....\n.....\ny',
  'نقطة..........نقطة',
  '',
  '..............',
] as const;

const HTML_PROBES = [
  'a<br>b<br/>c',
  'a<BR />b</BR>c',
  'a&nbsp;b',
  'a&NBSP;b',
  '<p>نص</p>',
  '<span class="x">متن</span><div dir="rtl">آخر</div>',
  '<strong>غامق</strong><em>مائل</em><b>عريض</b><i>مائل2</i>',
  '<h1>عنوان</h1>',
  '<img src="x.png">',
  '<P class="a">فقرة</P>',
] as const;

describe('A. provenance + shape of each sanitization copy', () => {
  it('A1 documentConverter markdown chain: 7 steps, HTML strip last', () => {
    expect({ file: 'src/utils/documentConverter.ts', anchor: 'sanitizedChunkMd = chunkData.markdown', steps: A1.steps, source: A1.source }).toMatchInlineSnapshot(`
      {
        "anchor": "sanitizedChunkMd = chunkData.markdown",
        "file": "src/utils/documentConverter.ts",
        "source": "const sanitizedChunkMd = chunkData.markdown
      .replace(/\\.{6,}/g, '.....')
      .replace(/^[ \\t]*(\\.[ \\t]*){5,}$/gm, '.....')
      .replace(/(\\n[ \\t]*\\.\\.\\.\\.\\.[ \\t]*){2,}/g, '\\n.....\\n')
      .replace(/<br\\s*\\/?>/gi, '\\n')
      .replace(/<\\/br>/gi, '\\n')
      .replace(/&nbsp;/gi, ' ')
      // Only unwrap the tags this list names. The alternation needs its own
      // boundaries: without them \`i\` matches the first letter of any tag, so
      // <img …>, <iframe …> and <input …> were matched and deleted outright,
      // silently discarding embedded images from the document.
      .replace(/<\\/?(span|div|p|b|strong|em|i)(?=[\\s/>])[^>]*>/gi, '');",
        "steps": 7,
      }
    `);
  });

  it('A2 documentConverter plainText chain: 4 steps', () => {
    expect({ file: 'src/utils/documentConverter.ts', anchor: 'sanitizedChunkTxt = chunkData.plainText', steps: A2.steps, source: A2.source }).toMatchInlineSnapshot(`
      {
        "anchor": "sanitizedChunkTxt = chunkData.plainText",
        "file": "src/utils/documentConverter.ts",
        "source": "const sanitizedChunkTxt = chunkData.plainText
      .replace(/\\.{6,}/g, '.....')
      .replace(/^[ \\t]*(\\.[ \\t]*){5,}$/gm, '.....')
      .replace(/<br\\s*\\/?>/gi, '\\n')
      .replace(/&nbsp;/gi, ' ');",
        "steps": 4,
      }
    `);
  });

  it('A3 quranAuditor: 3 one-line self-assignments', () => {
    expect({ file: 'src/utils/quranAuditor.ts', anchor: 'corrected = corrected.replace(/\\.{6,}/g', statements: A3.statements }).toMatchInlineSnapshot(`
      {
        "anchor": "corrected = corrected.replace(/\\.{6,}/g",
        "file": "src/utils/quranAuditor.ts",
        "statements": [
          "corrected = corrected.replace(/\\.{6,}/g, '.....')",
          "corrected = corrected.replace(/^[ \\t]*(\\.[ \\t]*){5,}$/gm, '.....')",
          "corrected = corrected.replace(/(\\n[ \\t]*\\.\\.\\.\\.\\.[ \\t]*){2,}/g, '\\n.....\\n')",
        ],
      }
    `);
  });

  it('A4 server.ts cleanMarkdown: 19 steps, dot stage + Azhar curriculum fixes', () => {
    expect({ file: 'server.ts', anchor: 'cleaned = cleaned', steps: A4.steps, source: A4.source }).toMatchInlineSnapshot(`
      {
        "anchor": "cleaned = cleaned",
        "file": "server.ts",
        "source": "cleaned = cleaned
      // Compress runaway dots and repetitive dot loops
      .replace(/\\.{6,}/g, '.....')
      .replace(/^[ \\t]*(\\.[ \\t]*){5,}$/gm, '.....')
      .replace(/(\\n[ \\t]*\\.\\.\\.\\.\\.[ \\t]*){2,}/g, '\\n.....\\n')
      // Fix phrase repetitions in tables
      .replace(/وعن[ \\t]+لبن[ \\t]+في[ \\t]+ضرع[،,\\s]+وعن[ \\t]+لبن[ \\t]+في[ \\t]+ضرع/g, 'وعن لبن في ضرع')
      // Fix Hadith typos & omissions
      .replace(/راوية[ \\t]+ابن[ \\t]+ماجه/g, 'رواية ابن ماجه')
      .replace(/النساء[ \\t]+الرجال(?=[ \\t]*[،.\\n]|$)/g, 'النساء شقائق الرجال')
      // Fix Fiqh Shafi'i typos & truncation
      .replace(/كفته[ \\t]+نيتة/g, 'كفته نيته')
      // Quranic verses
      .replace(/مَن[ \\t]+تَقُوتُ|مِن[ \\t]+تَقُوتُ/g, '﴿مِن تَفَاوُتٍ﴾')
      .replace(/جواب[ \\t]+الأمر[:\\s]+﴿?بِقَلْبٍ﴾?/g, 'جواب الأمر: ﴿يَنقَلِبْ﴾')
      .replace(/الْبَصَرُ[ \\t]+خَاشِعًا|الْبَصَرُ[ \\t]+خاشعا/g, 'الْبَصَرُ خَاسِئًا')
      .replace(/أَن[ \\t]+يَخِيفَ/g, 'أَن يَخْسِفَ')
      .replace(/يَعْمَوْا[ \\t]+عَمَهًا/g, 'سَمِعُوا لَهَا شَهِيقًا')
      .replace(/أَلَيَأْتِيكُم[ \\t]+نَذِيرٌ/g, 'أَلَمْ يَأْتِكُمْ نَذِيرٌ')
      .replace(/معنى[ \\t]+كلمة[ \\t]+﴿?صَنَفَتْ﴾?/g, 'معنى كلمة ﴿صَافَّاتٍ﴾')
      .replace(/فِي[ \\t]+مَنَاكِلِهَا/g, 'فِي مَنَاكِبِهَا')
      .replace(/تَمَيَّزُ[ \\t]+مِنَ[ \\t]+الْفَيْضِ/g, 'تَمَيَّزُ مِنَ الْغَيْظِ')
      .replace(/فَصُحْقًا/g, 'فَسُحْقًا')
      .replace(/﴿{2,}/g, '﴿')
      .replace(/﴾{2,}/g, '﴾');",
        "steps": 19,
      }
    `);
  });
});

describe('A. dot-compression stage: exact output per copy', () => {
  it('A1 markdown chain, dot probes', () => {
    expect(DOT_PROBES.map((p) => A1.fn(md(p)))).toMatchInlineSnapshot(`
      [
        "فقط.....ثم.....",
        "علوم القرآن هي .....",
        "a.....b",
        "a.....b",
        ".....
      .....",
        "x
      .....

      y",
        "نقطة.....نقطة",
        "",
        ".....",
      ]
    `);
  });

  it('A2 plainText chain, dot probes', () => {
    expect(DOT_PROBES.map((p) => A2.fn(txt(p)))).toMatchInlineSnapshot(`
      [
        "فقط.....ثم.....",
        "علوم القرآن هي .....",
        "a.....b",
        "a.....b",
        ".....
      .....",
        "x
      .....
      .....
      y",
        "نقطة.....نقطة",
        "",
        ".....",
      ]
    `);
  });

  it('A3 quranAuditor, dot probes', () => {
    expect(DOT_PROBES.map((p) => A3.fn(corrected(p)))).toMatchInlineSnapshot(`
      [
        "فقط.....ثم.....",
        "علوم القرآن هي .....",
        "a.....b",
        "a.....b",
        ".....
      .....",
        "x
      .....

      y",
        "نقطة.....نقطة",
        "",
        ".....",
      ]
    `);
  });

  it('A4 server.ts, dot probes', () => {
    expect(DOT_PROBES.map((p) => A4.fn(cleaned(p)))).toMatchInlineSnapshot(`
      [
        "فقط.....ثم.....",
        "علوم القرآن هي .....",
        "a.....b",
        "a.....b",
        ".....
      .....",
        "x
      .....

      y",
        "نقطة.....نقطة",
        "",
        ".....",
      ]
    `);
  });

  it('A1 = A3 = A4 on dot-only inputs; A2 differs exactly where its missing step 3 fires', () => {
    const a1 = DOT_PROBES.map((p) => A1.fn(md(p)));
    const a2 = DOT_PROBES.map((p) => A2.fn(txt(p)));
    const a3 = DOT_PROBES.map((p) => A3.fn(corrected(p)));
    const a4 = DOT_PROBES.map((p) => A4.fn(cleaned(p)));
    expect({ a1_eq_a2: a1.join('|') === a2.join('|'), a1_eq_a3: a1.join('|') === a3.join('|'), a1_eq_a4: a1.join('|') === a4.join('|') }).toMatchInlineSnapshot(`
      {
        "a1_eq_a2": false,
        "a1_eq_a3": true,
        "a1_eq_a4": true,
      }
    `);
  });

  it('dot-stage edge cases: {6,} leaves 5 alone; spaced runs become one block; a leading newline can appear', () => {
    const edge = ['....', '.....', '......', '.....\n', '\n.....\n.....', '   ..   ..   ..   ', '\t..\t..\t..\t..'];
    expect({ A1: edge.map((p) => A1.fn(md(p))), A3: edge.map((p) => A3.fn(corrected(p))) }).toMatchInlineSnapshot(`
      {
        "A1": [
          "....",
          ".....",
          ".....",
          ".....
      ",
          "
      .....
      ",
          ".....",
          ".....",
        ],
        "A3": [
          "....",
          ".....",
          ".....",
          ".....
      ",
          "
      .....
      ",
          ".....",
          ".....",
        ],
      }
    `);
  });
});

describe('A. HTML-strip stage: where the 7-step and 4-step copies diverge', () => {
  it('A1 markdown chain (7 steps) on HTML probes', () => {
    expect(HTML_PROBES.map((p) => A1.fn(md(p)))).toMatchInlineSnapshot(`
      [
        "a
      b
      c",
        "a
      b
      c",
        "a b",
        "a b",
        "نص",
        "متنآخر",
        "غامقمائلعريضمائل2",
        "<h1>عنوان</h1>",
        "<img src="x.png">",
        "فقرة",
      ]
    `);
  });

  it('A2 plainText chain (4 steps) on HTML probes — keeps every inline tag', () => {
    expect(HTML_PROBES.map((p) => A2.fn(txt(p)))).toMatchInlineSnapshot(`
      [
        "a
      b
      c",
        "a
      b</BR>c",
        "a b",
        "a b",
        "<p>نص</p>",
        "<span class="x">متن</span><div dir="rtl">آخر</div>",
        "<strong>غامق</strong><em>مائل</em><b>عريض</b><i>مائل2</i>",
        "<h1>عنوان</h1>",
        "<img src="x.png">",
        "<P class="a">فقرة</P>",
      ]
    `);
  });

  it('A3 quranAuditor has NO html stage at all', () => {
    expect(HTML_PROBES.map((p) => A3.fn(corrected(p)))).toMatchInlineSnapshot(`
      [
        "a<br>b<br/>c",
        "a<BR />b</BR>c",
        "a&nbsp;b",
        "a&NBSP;b",
        "<p>نص</p>",
        "<span class="x">متن</span><div dir="rtl">آخر</div>",
        "<strong>غامق</strong><em>مائل</em><b>عريض</b><i>مائل2</i>",
        "<h1>عنوان</h1>",
        "<img src="x.png">",
        "<P class="a">فقرة</P>",
      ]
    `);
  });

  it('divergence map: which inputs A1 and A2 disagree on, and why', () => {
    const rows = HTML_PROBES.map((p) => {
      const a1 = A1.fn(md(p));
      const a2 = A2.fn(txt(p));
      return { input: p, a1, a2, equal: a1 === a2 };
    });
    expect(rows).toMatchInlineSnapshot(`
      [
        {
          "a1": "a
      b
      c",
          "a2": "a
      b
      c",
          "equal": true,
          "input": "a<br>b<br/>c",
        },
        {
          "a1": "a
      b
      c",
          "a2": "a
      b</BR>c",
          "equal": false,
          "input": "a<BR />b</BR>c",
        },
        {
          "a1": "a b",
          "a2": "a b",
          "equal": true,
          "input": "a&nbsp;b",
        },
        {
          "a1": "a b",
          "a2": "a b",
          "equal": true,
          "input": "a&NBSP;b",
        },
        {
          "a1": "نص",
          "a2": "<p>نص</p>",
          "equal": false,
          "input": "<p>نص</p>",
        },
        {
          "a1": "متنآخر",
          "a2": "<span class="x">متن</span><div dir="rtl">آخر</div>",
          "equal": false,
          "input": "<span class="x">متن</span><div dir="rtl">آخر</div>",
        },
        {
          "a1": "غامقمائلعريضمائل2",
          "a2": "<strong>غامق</strong><em>مائل</em><b>عريض</b><i>مائل2</i>",
          "equal": false,
          "input": "<strong>غامق</strong><em>مائل</em><b>عريض</b><i>مائل2</i>",
        },
        {
          "a1": "<h1>عنوان</h1>",
          "a2": "<h1>عنوان</h1>",
          "equal": true,
          "input": "<h1>عنوان</h1>",
        },
        {
          "a1": "<img src="x.png">",
          "a2": "<img src="x.png">",
          "equal": true,
          "input": "<img src="x.png">",
        },
        {
          "a1": "فقرة",
          "a2": "<P class="a">فقرة</P>",
          "equal": false,
          "input": "<P class="a">فقرة</P>",
        },
      ]
    `);
  });

  it('A2 is A1 minus step 3 and step 7 — proven from the step list of A1 itself', () => {
    // Each step is compiled out of A1's extracted chain source (never re-typed here), so
    // "which step fires on this input" is answered by production code, not by this test.
    const steps: Array<(s: string) => string> = A1.chainSource.split('\n').map((line) => {
      const compiled = new Function('x', `return x${line.replace(/;$/, '')};`) as (x: string) => string;
      return compiled;
    });
    const probes = [...DOT_PROBES, ...HTML_PROBES];
    const rows = probes.map((p) => {
      const a1Out = A1.fn(md(p));
      const a2Out = A2.fn(txt(p));
      return {
        input: p,
        a1StepsThatFire: steps.map((step, i) => (step(p) !== p ? i + 1 : 0)).filter((n) => n !== 0),
        equal: a1Out === a2Out,
        a1: a1Out,
        a2: a2Out,
      };
    });
    expect({
      stepCount: steps.length,
      a2LacksSteps: [3, 7],
      rows,
      everyDisagreementCausedByStep3Or7: rows
        .filter((r) => !r.equal)
        .every((r) => r.a1StepsThatFire.includes(3) || r.a1StepsThatFire.includes(7)),
    }).toMatchInlineSnapshot(`
      {
        "a2LacksSteps": [
          3,
          7,
        ],
        "everyDisagreementCausedByStep3Or7": false,
        "rows": [
          {
            "a1": "فقط.....ثم.....",
            "a1StepsThatFire": [
              1,
            ],
            "a2": "فقط.....ثم.....",
            "equal": true,
            "input": "فقط.......ثم...............................",
          },
          {
            "a1": "علوم القرآن هي .....",
            "a1StepsThatFire": [],
            "a2": "علوم القرآن هي .....",
            "equal": true,
            "input": "علوم القرآن هي .....",
          },
          {
            "a1": "a.....b",
            "a1StepsThatFire": [],
            "a2": "a.....b",
            "equal": true,
            "input": "a.....b",
          },
          {
            "a1": "a.....b",
            "a1StepsThatFire": [
              1,
            ],
            "a2": "a.....b",
            "equal": true,
            "input": "a......b",
          },
          {
            "a1": ".....
      .....",
            "a1StepsThatFire": [
              2,
            ],
            "a2": ".....
      .....",
            "equal": true,
            "input": ". . . . . .
      . . . . . .",
          },
          {
            "a1": "x
      .....

      y",
            "a1StepsThatFire": [
              3,
            ],
            "a2": "x
      .....
      .....
      y",
            "equal": false,
            "input": "x
      .....
      .....
      y",
          },
          {
            "a1": "نقطة.....نقطة",
            "a1StepsThatFire": [
              1,
            ],
            "a2": "نقطة.....نقطة",
            "equal": true,
            "input": "نقطة..........نقطة",
          },
          {
            "a1": "",
            "a1StepsThatFire": [],
            "a2": "",
            "equal": true,
            "input": "",
          },
          {
            "a1": ".....",
            "a1StepsThatFire": [
              1,
              2,
            ],
            "a2": ".....",
            "equal": true,
            "input": "..............",
          },
          {
            "a1": "a
      b
      c",
            "a1StepsThatFire": [
              4,
            ],
            "a2": "a
      b
      c",
            "equal": true,
            "input": "a<br>b<br/>c",
          },
          {
            "a1": "a
      b
      c",
            "a1StepsThatFire": [
              4,
              5,
            ],
            "a2": "a
      b</BR>c",
            "equal": false,
            "input": "a<BR />b</BR>c",
          },
          {
            "a1": "a b",
            "a1StepsThatFire": [
              6,
            ],
            "a2": "a b",
            "equal": true,
            "input": "a&nbsp;b",
          },
          {
            "a1": "a b",
            "a1StepsThatFire": [
              6,
            ],
            "a2": "a b",
            "equal": true,
            "input": "a&NBSP;b",
          },
          {
            "a1": "نص",
            "a1StepsThatFire": [
              7,
            ],
            "a2": "<p>نص</p>",
            "equal": false,
            "input": "<p>نص</p>",
          },
          {
            "a1": "متنآخر",
            "a1StepsThatFire": [
              7,
            ],
            "a2": "<span class="x">متن</span><div dir="rtl">آخر</div>",
            "equal": false,
            "input": "<span class="x">متن</span><div dir="rtl">آخر</div>",
          },
          {
            "a1": "غامقمائلعريضمائل2",
            "a1StepsThatFire": [
              7,
            ],
            "a2": "<strong>غامق</strong><em>مائل</em><b>عريض</b><i>مائل2</i>",
            "equal": false,
            "input": "<strong>غامق</strong><em>مائل</em><b>عريض</b><i>مائل2</i>",
          },
          {
            "a1": "<h1>عنوان</h1>",
            "a1StepsThatFire": [],
            "a2": "<h1>عنوان</h1>",
            "equal": true,
            "input": "<h1>عنوان</h1>",
          },
          {
            "a1": "<img src="x.png">",
            "a1StepsThatFire": [],
            "a2": "<img src="x.png">",
            "equal": true,
            "input": "<img src="x.png">",
          },
          {
            "a1": "فقرة",
            "a1StepsThatFire": [
              7,
            ],
            "a2": "<P class="a">فقرة</P>",
            "equal": false,
            "input": "<P class="a">فقرة</P>",
          },
        ],
        "stepCount": 7,
      }
    `);
  });
});

describe('A. whole-fixture output per copy', () => {
  it('A1 vs A2 on the Arabic fixture: identical here (no inline tags in the fixture)', () => {
    expect({ a1: A1.fn(md(AR_MARKDOWN_FIXTURE)), a2: A2.fn(txt(AR_MARKDOWN_FIXTURE)), equal: A1.fn(md(AR_MARKDOWN_FIXTURE)) === A2.fn(txt(AR_MARKDOWN_FIXTURE)) }).toMatchInlineSnapshot(`
      {
        "a1": "# سورة الملك — التفسير

      الموضوع الأول: تفسير السور الطوال

      قال ابن عباس رضي الله عنهما في قوله تعالى ﴿تَبَارَكَ الَّذِي بِيَدِهِ الْمُلْكُ﴾: الملك التام بلا نقص.

      ## وجوه الإعراب في سورة الملك

      | الكلمة | الإعراب | العلة |
      | مَا تَرَىٰ | اسم مبتدأ | ــ |
      | تَفَاوُتٍ | مجرور | مِن زائدة |

      - **مَن تَقُوتُ** تصحيح شائع والصواب *مِن تَفَاوُتٍ*.
      - نص برمجي: \`code_sample = "تفاوت"\`.
      - معادلة: $E = mc^2$ و $a^2 + b^2 = c^2$.
      - رابط: [المصحف](https://quran.com) للمراجعة.

      $$مِدَاد$$

      [^1]

      ### تمرين

      س: ثم أُسند التدبير للخيل

      ج: قيل: المراد الملائكة.

      فقط.....ثم.....

      علوم القرآن هي .....

      والمراد من ذلك الجنس الصادق بـ

      الأرقام بالخط الهندي: ٠١٢٣٤٥٦٧٨٩ وبالخط الغربي: 0123456789

      السؤال: هل فهمت؟ الجواب: نعم.

      ---

      146. وحينها

      ---PAGE_BREAK---

      سورة النبأ ﴿لَّابِثِينَ فِيهَا أَحْقَابًا﴾

      الفقه الحنفي: بيع الحاضر للبادي

      راوية ابن ماجه والنساء الرجال.

      كفته نيتة.

      مِن تَقُوتُ

      الصفحة 22
      ",
        "a2": "# سورة الملك — التفسير

      الموضوع الأول: تفسير السور الطوال

      قال ابن عباس رضي الله عنهما في قوله تعالى ﴿تَبَارَكَ الَّذِي بِيَدِهِ الْمُلْكُ﴾: الملك التام بلا نقص.

      ## وجوه الإعراب في سورة الملك

      | الكلمة | الإعراب | العلة |
      | مَا تَرَىٰ | اسم مبتدأ | ــ |
      | تَفَاوُتٍ | مجرور | مِن زائدة |

      - **مَن تَقُوتُ** تصحيح شائع والصواب *مِن تَفَاوُتٍ*.
      - نص برمجي: \`code_sample = "تفاوت"\`.
      - معادلة: $E = mc^2$ و $a^2 + b^2 = c^2$.
      - رابط: [المصحف](https://quran.com) للمراجعة.

      $$مِدَاد$$

      [^1]

      ### تمرين

      س: ثم أُسند التدبير للخيل

      ج: قيل: المراد الملائكة.

      فقط.....ثم.....

      علوم القرآن هي .....

      والمراد من ذلك الجنس الصادق بـ

      الأرقام بالخط الهندي: ٠١٢٣٤٥٦٧٨٩ وبالخط الغربي: 0123456789

      السؤال: هل فهمت؟ الجواب: نعم.

      ---

      146. وحينها

      ---PAGE_BREAK---

      سورة النبأ ﴿لَّابِثِينَ فِيهَا أَحْقَابًا﴾

      الفقه الحنفي: بيع الحاضر للبادي

      راوية ابن ماجه والنساء الرجال.

      كفته نيتة.

      مِن تَقُوتُ

      الصفحة 22
      ",
        "equal": true,
      }
    `);
  });

  it('A3 vs A1 on the Arabic fixture', () => {
    expect({ a3: A3.fn(corrected(AR_MARKDOWN_FIXTURE)) }).toMatchInlineSnapshot(`
      {
        "a3": "# سورة الملك — التفسير

      الموضوع الأول: تفسير السور الطوال

      قال ابن عباس رضي الله عنهما في قوله تعالى ﴿تَبَارَكَ الَّذِي بِيَدِهِ الْمُلْكُ﴾: الملك التام بلا نقص.

      ## وجوه الإعراب في سورة الملك

      | الكلمة | الإعراب | العلة |
      | مَا تَرَىٰ | اسم مبتدأ | ــ |
      | تَفَاوُتٍ | مجرور | مِن زائدة |

      - **مَن تَقُوتُ** تصحيح شائع والصواب *مِن تَفَاوُتٍ*.
      - نص برمجي: \`code_sample = "تفاوت"\`.
      - معادلة: $E = mc^2$ و $a^2 + b^2 = c^2$.
      - رابط: [المصحف](https://quran.com) للمراجعة.

      $$مِدَاد$$

      [^1]

      ### تمرين

      س: ثم أُسند التدبير للخيل

      ج: قيل: المراد الملائكة.

      فقط.....ثم.....

      علوم القرآن هي .....

      والمراد من ذلك الجنس الصادق بـ

      الأرقام بالخط الهندي: ٠١٢٣٤٥٦٧٨٩ وبالخط الغربي: 0123456789

      السؤال: هل فهمت؟ الجواب: نعم.

      ---

      146. وحينها

      ---PAGE_BREAK---

      سورة النبأ ﴿لَّابِثِينَ فِيهَا أَحْقَابًا﴾

      الفقه الحنفي: بيع الحاضر للبادي

      راوية ابن ماجه والنساء الرجال.

      كفته نيتة.

      مِن تَقُوتُ

      الصفحة 22
      ",
      }
    `);
  });

  it('A4 on the Arabic fixture — also applies the Azhar curriculum rewrites', () => {
    expect(A4.fn(cleaned(AR_MARKDOWN_FIXTURE))).toMatchInlineSnapshot(`
      "# سورة الملك — التفسير

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

      س: ثم أُسند التدبير للخيل

      ج: قيل: المراد الملائكة.

      فقط.....ثم.....

      علوم القرآن هي .....

      والمراد من ذلك الجنس الصادق بـ

      الأرقام بالخط الهندي: ٠١٢٣٤٥٦٧٨٩ وبالخط الغربي: 0123456789

      السؤال: هل فهمت؟ الجواب: نعم.

      ---

      146. وحينها

      ---PAGE_BREAK---

      سورة النبأ ﴿لَّابِثِينَ فِيهَا أَحْقَابًا﴾

      الفقه الحنفي: بيع الحاضر للبادي

      رواية ابن ماجه والنساء شقائق الرجال.

      كفته نيته.

      ﴿مِن تَفَاوُتٍ﴾

      الصفحة 22
      "
    `);
  });

  it('A1 vs A2 on the English fixture', () => {
    expect({ a1: A1.fn(md(EN_MARKDOWN_FIXTURE)), a2: A2.fn(txt(EN_MARKDOWN_FIXTURE)) }).toMatchInlineSnapshot(`
      {
        "a1": "# Chapter 1 — Extraction Theory

      ## Heading two

      | Term | Meaning | Note |
      | core | the inner part | ــ |
      | shell | the outer part | ــ |

      - **bold item** and *italic item*.
      - Inline code: \`const x = 1;\`.
      - Formula: $E = mc^2$ and $$a^2 + b^2 = c^2$$.
      - Link: [Spec](https://example.com/spec).

      [^1]: A footnote that belongs at the bottom.

      ### Exercise

      Question: what is the core?
      Answer: it is the inner part.

      Dots.....more.....dots

      ---

      Page separator follows.

      ---PAGE_BREAK---

      Chapter 2 — The Shell Layer

      1. first item
      2. second item
      4. fourth item

      _underscored emphasis_
      ",
        "a2": "# Chapter 1 — Extraction Theory

      ## Heading two

      | Term | Meaning | Note |
      | core | the inner part | ــ |
      | shell | the outer part | ــ |

      - **bold item** and *italic item*.
      - Inline code: \`const x = 1;\`.
      - Formula: $E = mc^2$ and $$a^2 + b^2 = c^2$$.
      - Link: [Spec](https://example.com/spec).

      [^1]: A footnote that belongs at the bottom.

      ### Exercise

      Question: what is the core?
      Answer: it is the inner part.

      Dots.....more.....dots

      ---

      Page separator follows.

      ---PAGE_BREAK---

      Chapter 2 — The Shell Layer

      1. first item
      2. second item
      4. fourth item

      _underscored emphasis_
      ",
      }
    `);
  });

  it('A3 vs A4 on the English fixture', () => {
    expect({ a3: A3.fn(corrected(EN_MARKDOWN_FIXTURE)), a4: A4.fn(cleaned(EN_MARKDOWN_FIXTURE)) }).toMatchInlineSnapshot(`
      {
        "a3": "# Chapter 1 — Extraction Theory

      ## Heading two

      | Term | Meaning | Note |
      | core | the inner part | ــ |
      | shell | the outer part | ــ |

      - **bold item** and *italic item*.
      - Inline code: \`const x = 1;\`.
      - Formula: $E = mc^2$ and $$a^2 + b^2 = c^2$$.
      - Link: [Spec](https://example.com/spec).

      [^1]: A footnote that belongs at the bottom.

      ### Exercise

      Question: what is the core?
      Answer: it is the inner part.

      Dots.....more.....dots

      ---

      Page separator follows.

      ---PAGE_BREAK---

      Chapter 2 — The Shell Layer

      1. first item
      2. second item
      4. fourth item

      _underscored emphasis_
      ",
        "a4": "# Chapter 1 — Extraction Theory

      ## Heading two

      | Term | Meaning | Note |
      | core | the inner part | ــ |
      | shell | the outer part | ــ |

      - **bold item** and *italic item*.
      - Inline code: \`const x = 1;\`.
      - Formula: $E = mc^2$ and $$a^2 + b^2 = c^2$$.
      - Link: [Spec](https://example.com/spec).

      [^1]: A footnote that belongs at the bottom.

      ### Exercise

      Question: what is the core?
      Answer: it is the inner part.

      Dots.....more.....dots

      ---

      Page separator follows.

      ---PAGE_BREAK---

      Chapter 2 — The Shell Layer

      1. first item
      2. second item
      4. fourth item

      _underscored emphasis_
      ",
      }
    `);
  });

  it('A4 differs from A1 on the Arabic fixture: list the first differing lines', () => {
    const a1 = String(A1.fn(md(AR_MARKDOWN_FIXTURE))).split('\n');
    const a4 = String(A4.fn(cleaned(AR_MARKDOWN_FIXTURE))).split('\n');
    const diffs = a1
      .map((line, i) => (a4[i] === line ? null : { i, a1: line, a4: a4[i] }))
      .filter((d): d is { i: number; a1: string; a4: string } => d !== null);
    expect(diffs).toMatchInlineSnapshot(`
      [
        {
          "a1": "- **مَن تَقُوتُ** تصحيح شائع والصواب *مِن تَفَاوُتٍ*.",
          "a4": "- **﴿مِن تَفَاوُتٍ﴾** تصحيح شائع والصواب *مِن تَفَاوُتٍ*.",
          "i": 12,
        },
        {
          "a1": "راوية ابن ماجه والنساء الرجال.",
          "a4": "رواية ابن ماجه والنساء شقائق الرجال.",
          "i": 47,
        },
        {
          "a1": "كفته نيتة.",
          "a4": "كفته نيته.",
          "i": 49,
        },
        {
          "a1": "مِن تَقُوتُ",
          "a4": "﴿مِن تَفَاوُتٍ﴾",
          "i": 51,
        },
      ]
    `);
  });
});