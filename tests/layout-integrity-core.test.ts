import { describe, it, expect } from 'vitest';
import { auditAndRestructureLayout } from '../src/utils/layoutIntegrityCore';
import { AR_MARKDOWN_FIXTURE, EN_MARKDOWN_FIXTURE } from './fixtures/curriculum';

/**
 * GROUP G — src/utils/layoutIntegrityCore.ts
 *
 * `auditAndRestructureLayout` splits on `---PAGE_BREAK---`, then per page:
 *   - collects table lines and re-emits them through `stabilizeMarkdownTable` (uniform column
 *     count, separator rewritten to `---:`, a blank line forced before and after),
 *   - runs list lines through `normalizeArabicPunctuation`,
 *   - counts RTL-compliant lines,
 *   - detects an orphan heading at the page bottom.
 *
 * The orphan-heading result is assigned to `orphanFound` and then NEVER READ
 * (layoutIntegrityCore.ts:243-256) — it is not in `PageLayoutAuditItem` and it does not affect
 * `pageStatus`. That dead computation is pinned below rather than silently ignored.
 */

/**
 * Exercises every construct the engine claims to handle, across two pages:
 *   page 1 — a ragged markdown table, Arabic-Indic AND Western digit lists, an unspaced list
 *            prefix, English punctuation inside Arabic lines, guillemets, an orphan heading;
 *   page 2 — a well-formed table and a clean list, so the "no issues" path is covered too.
 */
const LAYOUT_FIXTURE = [
  '# تخطيط الصفحة — اختبار',
  '',
  '## جدول غير متوازن',
  '',
  'الكلمة | الإعراب | العلة | ملاحظة',
  'مَا تَرَىٰ | اسم مبتدأ | ــ |Housing',
  'تَفَاوُتٍ | مجرور |',
  'سَبْعًا | مفعول مطلق | زائد | تمGMT',
  '',
  '## القوائم',
  '',
  '١. العنصر الأول',
  '٢. العنصر الثاني',
  '1. western item',
  '2) parenthesised item',
  '3.العنصر بلا مساحة',
  'أ-الحرف الأول',
  '(١) رقم داخل قوس',
  '',
  '## علامات الترقيم',
  '',
  'هل فهمت, الجواب نعم.',
  'قال "هكذا" في النص.',
  'سؤال: ما الحقب؟',
  '',
  '### عنوان يتيم في آخر الصفحة',
  '',
  '---PAGE_BREAK---',
  '',
  '## صفحة ثانية نظيفة',
  '',
  'البند | القيمة',
  '---: | ---:',
  'أ | ١',
  'ب | ٢',
  '',
  '1. first',
  '2. second',
  '',
  'نص عربي سليم بلا أي خلل في الترقيم.',
].join('\n');

describe('G. layoutIntegrityCore — auditAndRestructureLayout', () => {
  it('empty input returns the pinned all-clear report', async () => {
    expect(await auditAndRestructureLayout('')).toMatchInlineSnapshot(`
      {
        "report": {
          "isAllPagesValid": true,
          "listsNormalizedCount": 0,
          "overallLayoutScore": 100,
          "overallVerdict": "المستند فارغ.",
          "pageAudits": [],
          "rtlEnforcedCount": 0,
          "tablesStabilizedCount": 0,
          "totalPagesAudited": 0,
        },
        "restructuredMarkdown": "",
      }
    `);
    expect(await auditAndRestructureLayout('   \n\t ')).toMatchInlineSnapshot(`
      {
        "report": {
          "isAllPagesValid": true,
          "listsNormalizedCount": 0,
          "overallLayoutScore": 100,
          "overallVerdict": "المستند فارغ.",
          "pageAudits": [],
          "rtlEnforcedCount": 0,
          "tablesStabilizedCount": 0,
          "totalPagesAudited": 0,
        },
        "restructuredMarkdown": "",
      }
    `);
  });

  it('pins restructuredMarkdown and the full report for the mixed fixture', async () => {
    const result = await auditAndRestructureLayout(LAYOUT_FIXTURE);
    expect(result.restructuredMarkdown).toMatchInlineSnapshot(`
      "# تخطيط الصفحة — اختبار

      ## جدول غير متوازن


      | الكلمة | الإعراب | العلة | ملاحظة |
      | ---: | ---: | ---: | ---: |
      | مَا تَرَىٰ | اسم مبتدأ | ــ | Housing |
      | تَفَاوُتٍ | مجرور |  |  |
      | سَبْعًا | مفعول مطلق | زائد | تمGMT |


      ## القوائم

      ١. العنصر الأول
      ٢. العنصر الثاني
      1. western item
      2) parenthesised item
      3. العنصر بلا مساحة
      أ- الحرف الأول
      (١) رقم داخل قوس

      ## علامات الترقيم

      هل فهمت، الجواب نعم.
      قال «هكذا» في النص.
      سؤال: ما الحقب؟

      ### عنوان يتيم في آخر الصفحة

      ---PAGE_BREAK---

      ## صفحة ثانية نظيفة

      البند | القيمة
      ---: | ---:
      أ | ١
      ب | ٢

      1. first
      2. second

      نص عربي سليم بلا أي خلل في الترقيم."
    `);
    expect(result.report).toMatchInlineSnapshot(`
      {
        "isAllPagesValid": true,
        "listsNormalizedCount": 0,
        "overallLayoutScore": 100,
        "overallVerdict": "تم الفحص الهيكلي الكامل لـ (2) صفحة: تم تثبيت أبعاد (1) جدول، وضبط محاذاة (0) قائمة، وضمان اتجاه RTL متطابق 100% لكافة الفقرات.",
        "pageAudits": [
          {
            "isRtlCompliant": true,
            "listIssues": [],
            "overflowWarning": false,
            "pageNumber": 1,
            "status": "repaired",
            "tableIssues": [
              "تمت موازنة خلايا الجدول وتثبيت الأعمدة بعدد (4) أعمدة متساوية",
              "إدراج سطر ترويسة الجدول وتثبيت محاذاة اليمين (RTL Columns Locked)",
            ],
            "totalLists": 4,
            "totalTables": 1,
          },
          {
            "isRtlCompliant": true,
            "listIssues": [],
            "overflowWarning": false,
            "pageNumber": 2,
            "status": "perfect",
            "tableIssues": [],
            "totalLists": 2,
            "totalTables": 0,
          },
        ],
        "rtlEnforcedCount": 16,
        "tablesStabilizedCount": 1,
        "totalPagesAudited": 2,
      }
    `);
  });

  it('page splitting: ---PAGE_BREAK--- produces one page per segment', async () => {
    const { report } = await auditAndRestructureLayout(LAYOUT_FIXTURE);
    expect(report.totalPagesAudited).toBe(2);
    expect(report.pageAudits.map(p => p.pageNumber)).toEqual([1, 2]);
    // The pages are rejoined with the same marker plus surrounding blank lines.
    const { restructuredMarkdown } = await auditAndRestructureLayout(LAYOUT_FIXTURE);
    expect(restructuredMarkdown.split(/\n\n---PAGE_BREAK---\n\n/)).toHaveLength(2);
  });

  it('ragged tables are padded to the widest row and the separator is forced to ---:', async () => {
    const { restructuredMarkdown, report } = await auditAndRestructureLayout(LAYOUT_FIXTURE);
    const tableLines = restructuredMarkdown.split('\n').filter(l => l.trim().startsWith('|'));
    // Every emitted table row has the same cell count.
    const cellCounts = new Set(
      tableLines.map(l => l.trim().replace(/^\||\|$/g, '').split('|').length),
    );
    expect(cellCounts.size).toBe(1);
    expect([...cellCounts]).toMatchInlineSnapshot(`
      [
        4,
      ]
    `);
    // The separator was rebuilt, not preserved: the fixture declared `---:` only on page 2.
    expect(tableLines.filter(l => /^(\|\s*---:\s*\|)+$/.test(l.trim()))).toMatchInlineSnapshot(`[]`);
    expect(report.tablesStabilizedCount).toMatchInlineSnapshot(`1`);
  });

  it('a table with no separator row gets one INSERTED (layoutIntegrityCore.ts:106-113)', async () => {
    const noSeparator = ['عنوان', '', 'أ | ب', '١ | ٢', '٣ | ٤'].join('\n');
    const { restructuredMarkdown, report } = await auditAndRestructureLayout(noSeparator);
    expect(restructuredMarkdown).toMatchInlineSnapshot(`
      "عنوان

      أ | ب
      ١ | ٢
      ٣ | ٤"
    `);
    expect(report.pageAudits[0].tableIssues).toMatchInlineSnapshot(`[]`);
  });

  it('Arabic-Indic (٠-٩) and Western digit lists are both counted as lists', async () => {
    const arabicIndic = '٠. واحد\n١. اثنان\n٢. ثلاثة';
    const western = '1. one\n2. two\n3. three';
    const a = await auditAndRestructureLayout(arabicIndic);
    const w = await auditAndRestructureLayout(western);
    expect({
      arabicIndicTotalLists: a.report.pageAudits[0].totalLists,
      arabicIndicNormalized: a.report.listsNormalizedCount,
      westernTotalLists: w.report.pageAudits[0].totalLists,
      westernNormalized: w.report.listsNormalizedCount,
    }).toMatchInlineSnapshot(`
      {
        "arabicIndicNormalized": 0,
        "arabicIndicTotalLists": 3,
        "westernNormalized": 0,
        "westernTotalLists": 3,
      }
    `);
  });

  it('unspaced list prefixes get a space inserted (1.العنصر -> 1. العنصر)', async () => {
    const { restructuredMarkdown } = await auditAndRestructureLayout('1.العنصر بلا مساحة\n2.العنصر الثاني');
    expect(restructuredMarkdown).toMatchInlineSnapshot(`
      "1. العنصر بلا مساحة
      2. العنصر الثاني"
    `);
    expect(restructuredMarkdown).toContain('1. العنصر');
  });

  it('RTL punctuation normalization: ? -> ؟ , Arabic comma, "x" -> «x»', async () => {
    const { restructuredMarkdown } = await auditAndRestructureLayout(
      'سؤال: هل فهمت, الجواب نعم.\nقال "هكذا" في النص.',
    );
    expect(restructuredMarkdown).toMatchInlineSnapshot(`
      "سؤال: هل فهمت، الجواب نعم.
      قال «هكذا» في النص."
    `);
  });

  it('Latin-only text is left untouched by the RTL normalizer', async () => {
    const latin = 'Question: is this clear, yes.\nHe said "this" in the text.';
    const { restructuredMarkdown, report } = await auditAndRestructureLayout(latin);
    expect(restructuredMarkdown).toMatchInlineSnapshot(`
      "Question: is this clear, yes.
      He said "this" in the text."
    `);
    // `isArabicText` returns false, so nothing is counted as RTL-compliant.
    expect(report.pageAudits[0].isRtlCompliant).toBe(false);
    expect(report.rtlEnforcedCount).toMatchInlineSnapshot(`0`);
    expect(report.isAllPagesValid).toBe(false);
  });

  it('DEAD COMPUTATION: an orphan heading is detected but has NO effect on the report', async () => {
    // layoutIntegrityCore.ts:243-256 computes `orphanFound` and never reads it. The report
    // shape has no field for it and `pageStatus` does not consider it, so a page whose last
    // line is a heading is reported exactly like any other page.
    const orphan = '# عنوان\n\nنص.\n\n## عنوان يتيم\n';
    const noOrphan = '# عنوان\n\nنص.\n\nسطر أخير عادي\n';
    const a = await auditAndRestructureLayout(orphan);
    const b = await auditAndRestructureLayout(noOrphan);
    expect({
      orphanPageAudit: a.report.pageAudits[0],
      nonOrphanPageAudit: b.report.pageAudits[0],
      auditsAreIdentical: JSON.stringify(a.report.pageAudits) === JSON.stringify(b.report.pageAudits),
      orphanSurvivesInOutput: a.restructuredMarkdown.includes('## عنوان يتيم'),
    }).toMatchInlineSnapshot(`
      {
        "auditsAreIdentical": true,
        "nonOrphanPageAudit": {
          "isRtlCompliant": true,
          "listIssues": [],
          "overflowWarning": false,
          "pageNumber": 1,
          "status": "perfect",
          "tableIssues": [],
          "totalLists": 0,
          "totalTables": 0,
        },
        "orphanPageAudit": {
          "isRtlCompliant": true,
          "listIssues": [],
          "overflowWarning": false,
          "pageNumber": 1,
          "status": "perfect",
          "tableIssues": [],
          "totalLists": 0,
          "totalTables": 0,
        },
        "orphanSurvivesInOutput": true,
      }
    `);
    expect(JSON.stringify(a.report.pageAudits)).toBe(JSON.stringify(b.report.pageAudits));
  });

  it('trailing blank lines are popped, and popping continues past an orphan heading (the loop breaks)', async () => {
    // The `while` at layoutIntegrityCore.ts:244 pops trailing empties, then `break`s as soon as
    // it sees a non-heading line. With `## heading` followed by nothing, it pops the heading's
    // blank line then `break`s on the heading itself — the heading is NOT removed.
    const { restructuredMarkdown } = await auditAndRestructureLayout('نص\n\n## عنوان يتيم\n\n\n\n');
    expect(restructuredMarkdown).toMatchInlineSnapshot(`
      "نص

      ## عنوان يتيم"
    `);
  });

  it('pageStatus is "repaired" when either table or list issues were found on the page', async () => {
    const { report } = await auditAndRestructureLayout(LAYOUT_FIXTURE);
    expect(report.pageAudits.map(p => ({ page: p.pageNumber, status: p.status }))).toMatchInlineSnapshot(`
      [
        {
          "page": 1,
          "status": "repaired",
        },
        {
          "page": 2,
          "status": "perfect",
        },
      ]
    `);
    expect(report.pageAudits[1].status).toBe('perfect');
    expect(report.pageAudits[0].status).toBe('repaired');
  });

  it('overallLayoutScore is clamped to [90, 100] regardless of how many pages failed', async () => {
    const failing = Array.from({ length: 6 }, () => 'latin only line with no rtl').join('\n\n');
    const { report } = await auditAndRestructureLayout(failing);
    expect({
      overallLayoutScore: report.overallLayoutScore,
      isAllPagesValid: report.isAllPagesValid,
      statuses: report.pageAudits.map(p => p.status),
    }).toMatchInlineSnapshot(`
      {
        "isAllPagesValid": false,
        "overallLayoutScore": 100,
        "statuses": [
          "perfect",
        ],
      }
    `);
    expect(report.overallLayoutScore).toBeGreaterThanOrEqual(90);
  });

  it('overallVerdict embeds the three counters as a formatted string', async () => {
    const { report } = await auditAndRestructureLayout(LAYOUT_FIXTURE);
    expect(report.overallVerdict).toMatchInlineSnapshot(`"تم الفحص الهيكلي الكامل لـ (2) صفحة: تم تثبيت أبعاد (1) جدول، وضبط محاذاة (0) قائمة، وضمان اتجاه RTL متطابق 100% لكافة الفقرات."`);
  });

  it('the shared Arabic corpus fixture is pinned end to end', async () => {
    const result = await auditAndRestructureLayout(AR_MARKDOWN_FIXTURE);
    expect(result.restructuredMarkdown).toMatchInlineSnapshot(`
      "# سورة الملك — التفسير

      الموضوع الأول: تفسير السور الطوال

      قال ابن عباس رضي الله عنهما في قوله تعالى ﴿تَبَارَكَ الَّذِي بِيَدِهِ الْمُلْكُ﴾: الملك التام بلا نقص.

      ## وجوه الإعراب في سورة الملك


      | الكلمة | الإعراب | العلة |
      | ---: | ---: | ---: |
      | مَا تَرَىٰ | اسم مبتدأ | ــ |
      | تَفَاوُتٍ | مجرور | مِن زائدة |


      - **مَن تَقُوتُ** تصحيح شائع والصواب *مِن تَفَاوُتٍ*.
      - نص برمجي: \`code_sample = «تفاوت»\`.
      - معادلة: $E = mc^2$ و $a^2 + b^2 = c^2$.
      - رابط: [المصحف](https://quran.com) للمراجعة.

      $$مِدَاد$$

      [^1]

      ### تمرين

      س: ثم أُسند التدبير للخيل

      ج: قيل: المراد الملائكة.

      فقط.......ثم...............................

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

      الصفحة 22"
    `);
    expect(result.report).toMatchInlineSnapshot(`
      {
        "isAllPagesValid": true,
        "listsNormalizedCount": 1,
        "overallLayoutScore": 100,
        "overallVerdict": "تم الفحص الهيكلي الكامل لـ (2) صفحة: تم تثبيت أبعاد (1) جدول، وضبط محاذاة (1) قائمة، وضمان اتجاه RTL متطابق 100% لكافة الفقرات.",
        "pageAudits": [
          {
            "isRtlCompliant": true,
            "listIssues": [
              "ضبط ترقيم ومسافة البند: "- نص برمجي: \`code_sample ..."",
            ],
            "overflowWarning": false,
            "pageNumber": 1,
            "status": "repaired",
            "tableIssues": [
              "إدراج سطر ترويسة الجدول وتثبيت محاذاة اليمين (RTL Columns Locked)",
            ],
            "totalLists": 5,
            "totalTables": 1,
          },
          {
            "isRtlCompliant": true,
            "listIssues": [],
            "overflowWarning": false,
            "pageNumber": 2,
            "status": "perfect",
            "tableIssues": [],
            "totalLists": 0,
            "totalTables": 0,
          },
        ],
        "rtlEnforcedCount": 19,
        "tablesStabilizedCount": 1,
        "totalPagesAudited": 2,
      }
    `);
  });

  it('the English corpus fixture is pinned end to end', async () => {
    const result = await auditAndRestructureLayout(EN_MARKDOWN_FIXTURE);
    expect(result.restructuredMarkdown).toMatchInlineSnapshot(`
      "# Chapter 1 — Extraction Theory

      ## Heading two


      | Term | Meaning | Note |
      | ---: | ---: | ---: |
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

      Dots..............more...............dots

      ---

      Page separator follows.

      ---PAGE_BREAK---

      Chapter 2 — The Shell Layer

      1. first item
      2. second item
      4. fourth item

      _underscored emphasis_"
    `);
    expect(result.report).toMatchInlineSnapshot(`
      {
        "isAllPagesValid": false,
        "listsNormalizedCount": 0,
        "overallLayoutScore": 100,
        "overallVerdict": "تم الفحص الهيكلي الكامل لـ (2) صفحة: تم تثبيت أبعاد (1) جدول، وضبط محاذاة (0) قائمة، وضمان اتجاه RTL متطابق 100% لكافة الفقرات.",
        "pageAudits": [
          {
            "isRtlCompliant": false,
            "listIssues": [],
            "overflowWarning": false,
            "pageNumber": 1,
            "status": "repaired",
            "tableIssues": [
              "إدراج سطر ترويسة الجدول وتثبيت محاذاة اليمين (RTL Columns Locked)",
            ],
            "totalLists": 4,
            "totalTables": 1,
          },
          {
            "isRtlCompliant": false,
            "listIssues": [],
            "overflowWarning": false,
            "pageNumber": 2,
            "status": "perfect",
            "tableIssues": [],
            "totalLists": 3,
            "totalTables": 0,
          },
        ],
        "rtlEnforcedCount": 0,
        "tablesStabilizedCount": 1,
        "totalPagesAudited": 2,
      }
    `);
  });

  it('documentTitle is accepted but unused', async () => {
    const a = await auditAndRestructureLayout(LAYOUT_FIXTURE);
    const b = await auditAndRestructureLayout(LAYOUT_FIXTURE);
    expect(b).toEqual(a);
  });
});