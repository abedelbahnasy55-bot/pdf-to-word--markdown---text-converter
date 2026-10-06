import { describe, it, expect } from 'vitest';
import { documentStructuralAuditor } from '../src/utils/documentStructuralAuditor';
import { AR_FOOTNOTE_FIXTURE, AR_MARKDOWN_FIXTURE } from './fixtures/curriculum';

/**
 * GROUP H — src/utils/documentStructuralAuditor.ts
 *
 * The auditor walks a document in four passes: footnotes (displaced + canonically missing),
 * header hierarchy, numbering, then parasitic repetition / table completion / cut questions.
 *
 * `CANONICAL_TOPIC_FOOTNOTES` and `UNFORMATTED_HEADERS_PATTERNS` are module-private and are not
 * extracted here; the suite pins the module's OBSERVABLE behaviour on fixtures built to trip
 * each branch, which is what a characterization suite is for.
 */

describe('H. documentStructuralAuditor — empty input', () => {
  it('returns the pinned all-clear report and echoes the input back', async () => {
    const result = await documentStructuralAuditor('', 'اسم.pdf');
    expect(result).toMatchInlineSnapshot(`
      {
        "repairedMarkdown": "",
        "report": {
          "analyzedSectionsCount": 0,
          "footnoteIssuesCount": 0,
          "hasStructuralFlaws": false,
          "issues": [],
          "missingHeadersCount": 0,
          "numberingIssuesCount": 0,
          "overallStructuralVerdict": "المستند فارغ.",
          "repairedCount": 0,
          "totalIssuesCount": 0,
        },
      }
    `);
  });

  it('whitespace-only input is also treated as empty', async () => {
    expect(await documentStructuralAuditor('  \n\t ', 'اسم.pdf')).toMatchInlineSnapshot(`
      {
        "repairedMarkdown": "  
      	 ",
        "report": {
          "analyzedSectionsCount": 0,
          "footnoteIssuesCount": 0,
          "hasStructuralFlaws": false,
          "issues": [],
          "missingHeadersCount": 0,
          "numberingIssuesCount": 0,
          "overallStructuralVerdict": "المستند فارغ.",
          "repairedCount": 0,
          "totalIssuesCount": 0,
        },
      }
    `);
  });
});

describe('H. documentStructuralAuditor — the shared footnote/numbering fixture', () => {
  it('pins repairedMarkdown and the full report for AR_FOOTNOTE_FIXTURE', async () => {
    const result = await documentStructuralAuditor(AR_FOOTNOTE_FIXTURE, 'مبادئ-علوم-القرآن.pdf');
    expect(result.repairedMarkdown).toMatchInlineSnapshot(`
      "# مبادئ علوم القرآن الكريم

      ## الموضوع الثالث: أول وآخر ما نزل

      النسخ في القرآن واقع، والتدرج التشريعي ثابت.

      أحقاباً في سورة النبأ، والحميم والغساق معنيان.

      ## الإعراب

      1. أول عنصر
      3. ثالث عنصر
      4. رابع عنصر

      ## الموضوع الثاني: غير منسق

      سؤال: ما الحقب؟

      جواب مطاطي يليه.

      الصفحة 30

      ---

      **الهوامش والحواشي التفسيرية والتوضيحية:**
      [^1]: (1) أي: السنون

      [^2]: (2) مفهوم النسخ في القرآن هو رفع حكم شرعي سابق بدليل شرعي لاحق، وهو يقع في الأحكام العملية دون الاعتقادية أو الأصول الأخلاقية والمنسوخ هو الحكم الأول، والناسخ هو: الحكم الأخير.

      [^3]: (3) أي: السنون، وهو تفسير لكلمة «أحقاباً» في قوله تعالى: ﴿لَّابِثِينَ فِيهَا أَحْقَابًا﴾، والحقب ثمانون سنة كل يوم منها ألف سنة.

      "
    `);
    expect(result.report).toMatchInlineSnapshot(`
      {
        "analyzedSectionsCount": 4,
        "footnoteIssuesCount": 3,
        "hasStructuralFlaws": true,
        "issues": [
          {
            "category": "displaced_footnote",
            "description": "تم رصد هامش تفسيري («(١) أي: السنون») مقحماً داخل سياق النص أو بين الأسئلة بدلاً من موضعه السليم في قاع الصفحة.",
            "fixedSnippet": "تم نقل الهامش إلى قسم الحواشي والتذييل السليم أسفل الصفحة.",
            "foundSnippet": "(١) أي: السنون",
            "id": "footnote-displaced-1",
            "isRepaired": true,
            "severity": "critical",
            "title": "إقحام هامش تفسيري في متن النص بشكل خاطئ",
          },
          {
            "category": "missing_footnote",
            "description": "سقط من ملف الوورد الهامش التوضيحي الأصلي الوارد في ملف الـ PDF: «(١) مفهوم النسخ في القرآن هو رفع حكم شرعي سابق بدليل شرعي لاحق، و...».",
            "fixedSnippet": "(١) مفهوم النسخ في القرآن هو رفع حكم شرعي سابق بدليل شرعي لاحق، وهو يقع في الأحكام العملية دون الاعتقادية أو الأصول الأخلاقية والمنسوخ هو الحكم الأول، والناسخ هو: الحكم الأخير.",
            "foundSnippet": "[مفقود في الوورد]",
            "id": "footnote-missing-2",
            "isRepaired": true,
            "severity": "critical",
            "title": "سقوط هامش الشرح (١): هامش توضيح مفهوم النسخ الشرعي في الموضوع الثالث",
          },
          {
            "category": "missing_footnote",
            "description": "سقط من ملف الوورد الهامش التوضيحي الأصلي الوارد في ملف الـ PDF: «(١) أي: السنون، وهو تفسير لكلمة «أحقاباً» في قوله تعالى: ﴿لَّابِث...».",
            "fixedSnippet": "(١) أي: السنون، وهو تفسير لكلمة «أحقاباً» في قوله تعالى: ﴿لَّابِثِينَ فِيهَا أَحْقَابًا﴾، والحقب ثمانون سنة كل يوم منها ألف سنة.",
            "foundSnippet": "[مفقود في الوورد]",
            "id": "footnote-missing-3",
            "isRepaired": true,
            "severity": "critical",
            "title": "سقوط هامش الشرح (١): هامش تفسير أحقاباً والسنون في سورة النبأ",
          },
          {
            "category": "missing_header",
            "description": "السطر «الموضوع الثالث: أول وآخر ما نزل» كُتب كنص عادي مجرد أو عريض بدون ترويسة Markdown (##).",
            "fixedSnippet": "## الموضوع الثالث: أول وآخر ما نزل",
            "foundSnippet": "الموضوع الثالث: أول وآخر ما نزل",
            "id": "header-unformatted-4",
            "isRepaired": true,
            "severity": "info",
            "title": "تنسيق عنوان (عنوان موضوع دراسي رئيسي) المفقود كترويسة معتمدة",
          },
          {
            "category": "missing_header",
            "description": "السطر «الموضوع الثاني: غير منسق» كُتب كنص عادي مجرد أو عريض بدون ترويسة Markdown (##).",
            "fixedSnippet": "## الموضوع الثاني: غير منسق",
            "foundSnippet": "الموضوع الثاني: غير منسق",
            "id": "header-unformatted-5",
            "isRepaired": true,
            "severity": "info",
            "title": "تنسيق عنوان (عنوان موضوع دراسي رئيسي) المفقود كترويسة معتمدة",
          },
          {
            "category": "mismatched_numbering",
            "description": "تم رصد فجوة في تسلسل الأرقام بين العنصر (1) والعنصر (3) مما قد يشير لسقوط فقرة أو خطأ ترقيمي.",
            "foundSnippet": "3.",
            "id": "numbering-skip-6",
            "isRepaired": false,
            "severity": "warning",
            "title": "قفزة في تسلسل الترقيم الرقمي (من 1 إلى 3)",
          },
        ],
        "missingHeadersCount": 2,
        "numberingIssuesCount": 1,
        "overallStructuralVerdict": "تم الفحص الهيكلي الشامل: ضبط 3 هوامش سفلية، تصحيح 2 ترويسات وعناوين، معايرة 1 تدرجات ترقيم هرمي، استكمال 5 خانات وجمل مبتورة وتطهير تكرارات طفيلية لضمان المطابقة الكاملة لأصل الـ PDF.",
        "repairedCount": 5,
        "totalIssuesCount": 6,
      }
    `);
  });

  it('a DISPLACED footnote is lifted out of the text flow and re-emitted at the bottom', async () => {
    // AR_FOOTNOTE_FIXTURE contains `(١) أي: السنون` sitting between a question and its answer.
    const { report, repairedMarkdown } = await documentStructuralAuditor(
      AR_FOOTNOTE_FIXTURE,
      'مبادئ-علوم-القرآن.pdf',
    );
    const displaced = report.issues.filter(i => i.category === 'displaced_footnote');
    expect(displaced.map(i => ({ id: i.id, found: i.foundSnippet, fixed: i.fixedSnippet }))).toMatchInlineSnapshot(`
      [
        {
          "fixed": "تم نقل الهامش إلى قسم الحواشي والتذييل السليم أسفل الصفحة.",
          "found": "(١) أي: السنون",
          "id": "footnote-displaced-1",
        },
      ]
    `);
    // It is gone from the body…
    expect(repairedMarkdown.split('\n').some(l => l.trim() === '(١) أي: السنون')).toBe(false);
    // … and a footnotes block now exists at the end.
    expect(repairedMarkdown).toContain('**الهوامش والحواشي التفسيرية والتوضيحية:**');
  });

  it('a MISSING canonical footnote is appended only when the topic AND term both appear', async () => {
    const { report } = await documentStructuralAuditor(AR_FOOTNOTE_FIXTURE, 'x.pdf');
    const missing = report.issues.filter(i => i.category === 'missing_footnote');
    expect(missing.map(i => ({ id: i.id, title: i.title }))).toMatchInlineSnapshot(`
      [
        {
          "id": "footnote-missing-2",
          "title": "سقوط هامش الشرح (١): هامش توضيح مفهوم النسخ الشرعي في الموضوع الثالث",
        },
        {
          "id": "footnote-missing-3",
          "title": "سقوط هامش الشرح (١): هامش تفسير أحقاباً والسنون في سورة النبأ",
        },
      ]
    `);
    // The النسخ footnote is added; the التدرج التشريعي one is NOT, because the guard at
    // documentStructuralAuditor.ts:189 treats the body phrase "التدرج التشريعي" as evidence
    // that the footnote is already present. PINNED, NOT FIXED.
    expect(missing.some(i => i.title.includes('مفهوم النسخ'))).toBe(true);
    expect(missing.some(i => i.title.includes('حكمة التدرج'))).toBe(false);
  });

  it('each canonical footnote needs BOTH its topic and its term trigger; dropping one drops that footnote', async () => {
    // Removing the `الموضوع الثالث: …` line kills the علوم-القرآن topic (its `topicTrigger` is
    // `/أول\s+وآخر\s+ما\s+نزل|الموضوع\s+الثالث/i`), but the سورة النبأ topic still fires
    // because "سورة النبأ" appears elsewhere in the fixture. So exactly one of the two
    // missing-footnote issues disappears.
    const topicRemoved = AR_FOOTNOTE_FIXTURE.replace(/^الموضوع الثالث: أول وآخر ما نزل$/m, 'سطر عادي');
    const { report } = await documentStructuralAuditor(topicRemoved, 'x.pdf');
    const missing = report.issues.filter(i => i.category === 'missing_footnote');
    expect(missing.map(i => i.title)).toMatchInlineSnapshot(`
      [
        "سقوط هامش الشرح (١): هامش تفسير أحقاباً والسنون في سورة النبأ",
      ]
    `);
    expect(missing.some(i => i.title.includes('مفهوم النسخ'))).toBe(false);
    expect(missing.some(i => i.title.includes('أحقاباً'))).toBe(true);
  });

  it('the topic AND the term are both required: removing the term alone also suppresses it', async () => {
    const termRemoved = AR_FOOTNOTE_FIXTURE.replace('النسخ في القرآن واقع، والتدرج التشريعي ثابت.', 'نص بلا مصطلحات.');
    const { report } = await documentStructuralAuditor(termRemoved, 'x.pdf');
    expect(report.issues.filter(i => i.category === 'missing_footnote').map(i => i.title)).toMatchInlineSnapshot(`
      [
        "سقوط هامش الشرح (١): هامش تفسير أحقاباً والسنون في سورة النبأ",
      ]
    `);
  });

  it('MISMATCHED NUMBERING: 1, 3, 4 produces exactly one skip warning and is NOT repaired', async () => {
    // AR_FOOTNOTE_FIXTURE has `1.`, `3.`, `4.`. The detector requires >= 3 ordered-list lines
    // and only flags a gap of 2 or 3, so 3->4 is not flagged while 1->3 is.
    const { report } = await documentStructuralAuditor(AR_FOOTNOTE_FIXTURE, 'x.pdf');
    const skips = report.issues.filter(i => i.id.startsWith('numbering-skip-'));
    expect(skips).toMatchInlineSnapshot(`
      [
        {
          "category": "mismatched_numbering",
          "description": "تم رصد فجوة في تسلسل الأرقام بين العنصر (1) والعنصر (3) مما قد يشير لسقوط فقرة أو خطأ ترقيمي.",
          "foundSnippet": "3.",
          "id": "numbering-skip-6",
          "isRepaired": false,
          "severity": "warning",
          "title": "قفزة في تسلسل الترقيم الرقمي (من 1 إلى 3)",
        },
      ]
    `);
    expect(skips[0].isRepaired).toBe(false);
  });

  it('MISSING H1: a document with no level-1 heading gets one synthesised', async () => {
    const noH1 = ['الموضوع الأول: تعريف القرآن', '', 'نص المحتوى هنا.', '', 'الموضوع الثاني: المراتب'].join('\n');
    const { report, repairedMarkdown } = await documentStructuralAuditor(noH1, 'ملف-بلا-عنوان.md');
    expect(repairedMarkdown).toMatchInlineSnapshot(`
      "# الموضوع الأول: تعريف القرآن

      نص المحتوى هنا.

      ## الموضوع الثاني: المراتب"
    `);
    expect(report.issues.filter(i => i.id === 'header-missing-h1')).toMatchInlineSnapshot(`
      [
        {
          "category": "missing_header",
          "description": "المستند يفتقر إلى عنوان رئيسي معتمد بمستوى (#) في بدايته، مما يضعف هيكلية الفهرسة.",
          "fixedSnippet": "# ملف-بلا-عنوان",
          "foundSnippet": "الموضوع الأول: تعريف القرآن",
          "id": "header-missing-h1",
          "isRepaired": true,
          "severity": "warning",
          "title": "غياب العنوان الرئيسي للمستند (Heading 1)",
        },
      ]
    `);
    expect(repairedMarkdown.startsWith('# ')).toBe(true);
  });

  it('MISSING H1 with no filename falls back to the first line as the title', async () => {
    const noH1 = 'سطر أول طويل بما يكفي Becomes the title\n\nمحتوى.';
    const { report, repairedMarkdown } = await documentStructuralAuditor(noH1);
    expect(report.issues.filter(i => i.id === 'header-missing-h1')[0].fixedSnippet).toMatchInlineSnapshot(`"# سطر أول طويل بما يكفي Becomes the title"`);
    expect(repairedMarkdown.split('\n')[0]).toMatchInlineSnapshot(`"# سطر أول طويل بما يكفي Becomes the title"`);
  });

  it('MISSING H1 with a very short first line prepends the filename-derived title instead', async () => {
    // The inline-rewrite branch requires `firstLineMatch[1].length > 5`, otherwise the title is
    // prepended and the original first line is left in place. PINNED, NOT FIXED: this can
    // produce two headings.
    const short = 'قصير.\n\nمحتوى.';
    const { report, repairedMarkdown } = await documentStructuralAuditor(short, 'اسم_الملف_الفريد.md');
    expect(report.issues.filter(i => i.id === 'header-missing-h1')[0].fixedSnippet).toMatchInlineSnapshot(`"# اسم الملف الفريد"`);
    expect(repairedMarkdown).toMatchInlineSnapshot(`
      "# اسم الملف الفريد

      قصير.

      محتوى."
    `);
    expect(report.analyzedSectionsCount).toMatchInlineSnapshot(`1`);
  });

  it('UNFORMATTED HEADINGS: a bare "الموضوع الأول: …" line is promoted to ##', async () => {
    const bare = ['نص', '', 'الموضوع الأول: تفسير السور الطوال', '', 'نص آخر', '', 'سورة النبأ', '', 'معاني المفردات'].join('\n');
    const { report, repairedMarkdown } = await documentStructuralAuditor(bare, 'x.md');
    expect(report.issues.filter(i => i.id.startsWith('header-unformatted-')).map(i => ({
      title: i.title,
      found: i.foundSnippet,
      fixed: i.fixedSnippet,
    }))).toMatchInlineSnapshot(`
      [
        {
          "fixed": "## الموضوع الأول: تفسير السور الطوال",
          "found": "الموضوع الأول: تفسير السور الطوال",
          "title": "تنسيق عنوان (عنوان موضوع دراسي رئيسي) المفقود كترويسة معتمدة",
        },
        {
          "fixed": "## سورة النبأ",
          "found": "سورة النبأ",
          "title": "تنسيق عنوان (عنوان سورة قرآنية كريمة) المفقود كترويسة معتمدة",
        },
        {
          "fixed": "### معاني المفردات",
          "found": "معاني المفردات",
          "title": "تنسيق عنوان (عنوان مبحث فرعي تحليلي) المفقود كترويسة معتمدة",
        },
      ]
    `);
    expect(repairedMarkdown).toMatchInlineSnapshot(`
      "# x

      نص

      ## الموضوع الأول: تفسير السور الطوال

      نص آخر

      ## سورة النبأ

      ### معاني المفردات"
    `);
  });

  it('PARASITIC REPETITION: a doubled page header is collapsed to one', async () => {
    const repeated = ['سلاح الأزهري سلاح الأزهري', '', 'محتوى.'].join('\n');
    const { report, repairedMarkdown } = await documentStructuralAuditor(repeated, 'x.md');
    expect(report.issues.filter(i => i.id.startsWith('header-dedup-'))).toMatchInlineSnapshot(`
      [
        {
          "category": "missing_header",
          "description": "رصد تكرار مشوه لعبارة رأس الصفحة (مثل "سلاح الأزهري") ناتج عن التحويل الآلي، وتم تطهيره بدقة.",
          "fixedSnippet": "العنوان لمرة واحدة منقحة ومضبوطة",
          "foundSnippet": "تكرار العنوان مرتين متتاليتين في الغلاف والرأس",
          "id": "header-dedup-2",
          "isRepaired": true,
          "severity": "warning",
          "title": "إزالة تكرار طفيلي في ترويسة ومطلع الصفحات",
        },
      ]
    `);
    expect(repairedMarkdown).toMatchInlineSnapshot(`
      "# سلاح الأزهري

      محتوى."
    `);
  });

  it('consecutive identical lines are de-duplicated regardless of content', async () => {
    // documentStructuralAuditor.ts:407 — a bare regex with no relation to the header check above.
    const doubled = ['سطر مكرر تماماً هنا', 'سطر مكرر تماماً هنا', '', 'نهاية'].join('\n');
    const { repairedMarkdown } = await documentStructuralAuditor(doubled, 'x.md');
    expect(repairedMarkdown).toMatchInlineSnapshot(`
      "# سطر مكرر تماماً هنا
      سطر مكرر تماماً هنا

      نهاية"
    `);
  });

  it('MISSING H1 does NOT apply when a level-1 heading exists anywhere', async () => {
    const withH1 = ['نص قبل العنوان', '', '# عنوان رئيسي', '', 'نص بعد العنوان'].join('\n');
    const { report } = await documentStructuralAuditor(withH1, 'x.md');
    expect(report.issues.filter(i => i.id === 'header-missing-h1')).toHaveLength(0);
    expect(report.missingHeadersCount).toMatchInlineSnapshot(`0`);
  });

  it('totalIssuesCount equals the issue count, without double-counting sub-categories', async () => {
    // The total used to be `missingHeaders + numberingIssues + footnoteIssues + issues.length`,
    // but every issue is ALREADY in `issues`, so each one was counted twice. The sub-counts
    // are derived from those same pushes, not an independent pass. Now the total is simply
    // the length of the list.
    const { report } = await documentStructuralAuditor(AR_FOOTNOTE_FIXTURE, 'x.pdf');
    expect(report.totalIssuesCount).toBe(report.issues.length);
    expect({
      totalIssuesCount: report.totalIssuesCount,
      issuesArrayLength: report.issues.length,
      missingHeadersCount: report.missingHeadersCount,
      numberingIssuesCount: report.numberingIssuesCount,
      footnoteIssuesCount: report.footnoteIssuesCount,
      sumOfSubCounts: report.missingHeadersCount + report.numberingIssuesCount + report.footnoteIssuesCount,
      hasStructuralFlaws: report.hasStructuralFlaws,
    }).toMatchInlineSnapshot(`
      {
        "footnoteIssuesCount": 3,
        "hasStructuralFlaws": true,
        "issuesArrayLength": 6,
        "missingHeadersCount": 2,
        "numberingIssuesCount": 1,
        "sumOfSubCounts": 6,
        "totalIssuesCount": 6,
      }
    `);
  });

  it('the shared Arabic corpus fixture is pinned end to end', async () => {
    const result = await documentStructuralAuditor(AR_MARKDOWN_FIXTURE, 'سورة الملك.md');
    expect(result.repairedMarkdown).toMatchInlineSnapshot(`
      "# سورة الملك — التفسير

      ## الموضوع الأول: تفسير السور الطوال

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

      س: هل أُسند التدبير للخيل في قوله تعالى ﴿فَالْمُدَبِّرَاتِ أَمْرًا﴾؟
      ج: قيل: المراد الملائكة تدبر أمر العباد بإذن الله، وقيل الأفلاك، وقيل أُسند التدبير للخيل لشدة جريها وعظيم نفعها وتدبيرها في ساحة القتال والجهاد.
      ج: قيل: المراد الملائكة.

      فقط.......ثم...............................

      علوم القرآن هي: مباحث تتعلق بالقرآن الكريم من حيث نزوله وترتيبه وجمعه وكتابته وقراءته وتفسيره وإعجازه وناسخه ومنسوخه ودفع الشبه عنه.

      والمراد من ذلك الجنس الصادق بـ

      الأرقام بالخط الهندي: ٠١٢٣٤٥٦٧٨٩ وبالخط الغربي: 0123456789

      السؤال: هل فهمت؟ الجواب: نعم.

      ---

      146. وحينها

      ---PAGE_BREAK---

      ## سورة النبأ ﴿لَّابِثِينَ فِيهَا أَحْقَابًا﴾

      الفقه الحنفي: بيع الحاضر للبادي

      راوية ابن ماجه والنساء الرجال.

      كفته نيتة.

      مِن تَقُوتُ

      الصفحة 22
      "
    `);
    expect(result.report).toMatchInlineSnapshot(`
      {
        "analyzedSectionsCount": 5,
        "footnoteIssuesCount": 0,
        "hasStructuralFlaws": true,
        "issues": [
          {
            "category": "missing_header",
            "description": "السطر «الموضوع الأول: تفسير السور الطوال» كُتب كنص عادي مجرد أو عريض بدون ترويسة Markdown (##).",
            "fixedSnippet": "## الموضوع الأول: تفسير السور الطوال",
            "foundSnippet": "الموضوع الأول: تفسير السور الطوال",
            "id": "header-unformatted-1",
            "isRepaired": true,
            "severity": "info",
            "title": "تنسيق عنوان (عنوان موضوع دراسي رئيسي) المفقود كترويسة معتمدة",
          },
          {
            "category": "missing_header",
            "description": "السطر «سورة النبأ ﴿لَّابِثِينَ فِيهَا أَحْقَابًا﴾» كُتب كنص عادي مجرد أو عريض بدون ترويسة Markdown (##).",
            "fixedSnippet": "## سورة النبأ ﴿لَّابِثِينَ فِيهَا أَحْقَابًا﴾",
            "foundSnippet": "سورة النبأ ﴿لَّابِثِينَ فِيهَا أَحْقَابًا﴾",
            "id": "header-unformatted-2",
            "isRepaired": true,
            "severity": "info",
            "title": "تنسيق عنوان (عنوان سورة قرآنية كريمة) المفقود كترويسة معتمدة",
          },
          {
            "category": "missing_header",
            "description": "ورد سؤال مبتور بدون تفصيل الجواب الفقهي والتفسيري، وتم استكماله وفق شروح التفسير المعتمدة بالأزهر.",
            "fixedSnippet": "س: هل أُسند التدبير للخيل في قوله تعالى ﴿فَالْمُدَبِّرَاتِ أَمْرًا﴾؟ ...",
            "foundSnippet": "س: ثم أُسند التدبير للخيل؟",
            "id": "question-repair-khayl",
            "isRepaired": true,
            "severity": "critical",
            "title": "استكمال سؤال مبتور حول إسناد التدبير للخيل في سورة النازعات",
          },
          {
            "category": "missing_header",
            "description": "تم رصد نقط مبتورة أكلت تعريف علوم القرآن الكريم، وتم استرجاع التعريف الأزهري المحقق كاملاً.",
            "fixedSnippet": "علوم القرآن هي: مباحث تتعلق بالقرآن الكريم من حيث نزوله وترتيبه وجمعه...",
            "foundSnippet": "علوم القرآن هي .....",
            "id": "definition-repair-ulum-quran",
            "isRepaired": true,
            "severity": "critical",
            "title": "استكمال التعريف المبتور لعلوم القرآن الكريم",
          },
        ],
        "missingHeadersCount": 2,
        "numberingIssuesCount": 0,
        "overallStructuralVerdict": "تم الفحص الهيكلي الشامل: تصحيح 2 ترويسات وعناوين، استكمال 4 خانات وجمل مبتورة وتطهير تكرارات طفيلية لضمان المطابقة الكاملة لأصل الـ PDF.",
        "repairedCount": 4,
        "totalIssuesCount": 4,
      }
    `);
  });
});

describe('H. documentStructuralAuditor — DEAD ALIAS', () => {
  it('runDocumentStructuralAuditor is a re-export nothing imports', async () => {
    const mod = await import('../src/utils/documentStructuralAuditor');
    // `export const runDocumentStructuralAuditor = documentStructuralAuditor;` at
    // documentStructuralAuditor.ts:553. Grepping the repo for the identifier returns only that
    // declaration — no importer and no call site. PINNED, NOT FIXED.
    expect(mod.runDocumentStructuralAuditor).toBe(mod.documentStructuralAuditor);
  });
});