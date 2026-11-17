import { describe, it, expect } from 'vitest';
import {
  extractSourceOutline,
  splitMarkdownIntoSafeChunks,
  buildDeterministicPlan,
  deterministicExtractFromChunk,
  assembleCompilationDocument,
  applyDeterministicRefinement,
  parseIncludeExcludeUnitsFromInstruction,
  isConversationalQuestionIntent,
} from '../shared/smartCompilerCore';

describe('Smart Compiler Core (Multi-File Anthology & Useful Repetition Policy)', () => {
  it('extracts outline headings, question flags, and Western/Arabic-Indic exam years', () => {
    const md = `## الباب الأول: أحكام النكاح
شرح نظري للباب الأول.

---PAGE_BREAK---

## أسئلة كتاب المرشد ٢٠٢٢
س١: ما حكم الزواج بدون ولي؟
س٢: اذكر شروط الصداق.

---PAGE_BREAK---

## امتحان الشهادة الثانوية الأزهرية 2016
س١: بين الحكم الشرعي فيما يلي.`;

    const res = extractSourceOutline(md, 3);
    expect(res.detectedYears).toContain('2016');
    expect(res.detectedYears).toContain('2022');
    expect(res.outline.length).toBeGreaterThanOrEqual(3);
    const questionsSection = res.outline.find((o) => o.heading.includes('المرشد'));
    expect(questionsSection?.hasQuestions).toBe(true);
    expect(questionsSection?.pageNumber).toBe(2);
  });

  it('splits large books into safe chunks preserving page boundaries and running headings', () => {
    const page1 = '## كتاب المرشد — باب الطلاق\nفقرة أولى.\n' + 'كلمة '.repeat(120);
    const page2 = 'س١: عرف الطلاق لغة وشرعا.\n' + 'نص '.repeat(120);
    const full = `${page1}\n\n---PAGE_BREAK---\n\n${page2}`;

    const chunks = splitMarkdownIntoSafeChunks(full, 700);
    expect(chunks.length).toBe(2);
    expect(chunks[0].startPage).toBe(1);
    expect(chunks[1].startPage).toBe(2);
    expect(chunks[1].contextHeader).toContain('باب الطلاق');
  });

  it('parses Arabic compilation intent for Al-Morshed questions + previous years booklet + appendix', () => {
    const catalog = [
      {
        id: 'src-morshed',
        title: 'كتاب المرشد في الفقه',
        fileName: 'كتاب_المرشد.pdf',
        totalPages: 120,
        wordCount: 15000,
        detectedYears: ['2022'],
        outline: [],
        sampleSnippet: '',
      },
      {
        id: 'src-booklet',
        title: 'بوكلت امتحانات الأزهر للسنوات السابقة',
        fileName: 'بوكلت_الأزهر_2016_2022.pdf',
        totalPages: 80,
        wordCount: 9500,
        detectedYears: ['2016', '2021', '2022'],
        outline: [],
        sampleSnippet: '',
      },
    ];

    const plan = buildDeterministicPlan(
      'عايز أسئلة كتاب المرشد فقط مع امتحانات السنين السابقة من البوكلت مرتبة حسب السنة والإجابات في ملحق في الآخر',
      'preserve_across_exams',
      catalog
    );

    expect(plan.organizationMode).toBe('by_exam_year');
    expect(plan.answersPlacement).toBe('appendix');
    expect(plan.effectiveRepetitionPolicy).toBe('preserve_across_exams');
    const morshedDir = plan.sourceDirectives.find((d) => d.sourceId === 'src-morshed');
    const bookletDir = plan.sourceDirectives.find((d) => d.sourceId === 'src-booklet');
    expect(morshedDir?.extractionMode).toBe('questions_only');
    expect(bookletDir?.extractionMode).toBe('exams_only');
  });

  it('selectively extracts questions only without losing Quranic verses', () => {
    const bookChunk = `## الشرح: تعريف النكاح
النكاح في اللغة الضم والجمع.

## أسئلة كتاب المرشد
س١: ما الدليل على مشروعية النكاح من قوله تعالى ﴿فَانكِحُوا مَا طَابَ لَكُم مِّنَ النِّسَاءِ﴾؟`;

    const extracted = deterministicExtractFromChunk(
      bookChunk,
      {
        sourceId: 'src-1',
        sourceTitle: 'المرشد',
        include: true,
        extractionMode: 'questions_only',
        targetKeywords: ['أسئلة'],
        targetYears: [],
        targetUnits: [],
        rationale: '',
      },
      'كتاب المرشد',
      0,
      'أسئلة كتاب المرشد'
    );

    expect(extracted.markdown).toContain('﴿فَانكِحُوا مَا طَابَ لَكُم مِّنَ النِّسَاءِ﴾');
    expect(extracted.markdown).not.toContain('النكاح في اللغة الضم والجمع');
    expect(extracted.itemsCount).toBeGreaterThanOrEqual(1);
  });

  it('preserves useful cross-exam repetitions (e.g. 2016 vs 2022) while still cleaning intra-exam duplicates', () => {
    const catalog = [
      {
        id: 'exam-2022',
        title: 'امتحان الأزهر 2022',
        fileName: 'azhar_2022.pdf',
        totalPages: 4,
        wordCount: 300,
        detectedYears: ['2022'],
        outline: [],
        sampleSnippet: '',
      },
      {
        id: 'exam-2016',
        title: 'امتحان الأزهر 2016',
        fileName: 'azhar_2016.pdf',
        totalPages: 4,
        wordCount: 300,
        detectedYears: ['2016'],
        outline: [],
        sampleSnippet: '',
      },
    ];

    const blocks = [
      {
        sourceId: 'exam-2022',
        sourceTitle: 'امتحان الأزهر 2022',
        chunkIndex: 0,
        sectionLabel: 'امتحان الأزهر الدور الأول 2022',
        yearHint: '2022',
        itemsCount: 2,
        markdown:
          'س١: ما حكم اشتراط الولي في عقد النكاح عند أبي حنيفة؟\nس١: ما حكم اشتراط الولي في عقد النكاح عند أبي حنيفة؟\nس٢: عرف الصداق وبين أقله.\nالإجابة: عند أبي حنيفة ينعقد نكاح البالغة العاقلة.',
      },
      {
        sourceId: 'exam-2016',
        sourceTitle: 'امتحان الأزهر 2016',
        chunkIndex: 0,
        sectionLabel: 'امتحان الأزهر الدور الأول 2016',
        yearHint: '2016',
        itemsCount: 1,
        markdown: 'س١: ما حكم اشتراط الولي في عقد النكاح عند أبي حنيفة؟',
      },
    ];

    // Policy 1: Preserve across exams (default)
    const planPreserve = buildDeterministicPlan('امتحانات 2016 و 2022 والإجابات في ملحق', 'preserve_across_exams', catalog);
    const compiledPreserve = assembleCompilationDocument(planPreserve, blocks);

    // The recurring question MUST appear twice (once in 2022 exam, once in 2016 exam)
    const questionOccurrences = compiledPreserve.markdown.match(/ما حكم اشتراط الولي/g) || [];
    expect(questionOccurrences.length).toBe(2);
    // While the accidental intra-exam duplicate in 2022 WAS removed
    expect(compiledPreserve.repetitionStats.intraSectionDuplicatesRemoved).toBe(1);
    expect(compiledPreserve.repetitionStats.preservedCrossExamRepeats).toBeGreaterThanOrEqual(2);
    // And answers were moved to the Appendix
    expect(compiledPreserve.markdown).toContain('## ملحق الإجابات النموذجية');

    // Policy 2: Frequency note annotation
    const planNote = buildDeterministicPlan('امتحانات مع توثيق سنوات التكرار', 'preserve_with_frequency_note', catalog);
    const compiledNote = assembleCompilationDocument(planNote, blocks);
    expect(compiledNote.markdown).toContain('ملاحظة تكرار مفيدة');

    // Policy 3: Unified bank deduplication when explicitly requested
    const planDedup = buildDeterministicPlan('دمج المكرر لبنك أسئلة موحد', 'deduplicate_bank', catalog);
    const compiledDedup = assembleCompilationDocument(planDedup, blocks);
    const bankOccurrences = compiledDedup.markdown.match(/ما حكم اشتراط الولي/g) || [];
    expect(bankOccurrences.length).toBe(1);
    expect(compiledDedup.repetitionStats.consolidatedBankDuplicatesCount).toBe(1);
  });

  it('supports deterministic structural follow-up edits (sort oldest-first & unify numbering)', () => {
    const sampleDoc = `# تجميعة امتحانات

## امتحان 2022

السؤال الأول: عرف المهر؟

---PAGE_BREAK---

## امتحان 2016

السؤال الثالث: بين شروط الكفاءة؟`;

    const sorted = applyDeterministicRefinement(sampleDoc, 'رتب الامتحانات من الأقدم للأحدث');
    expect(sorted.applied).toBe(true);
    expect(sorted.updatedMarkdown.indexOf('2016')).toBeLessThan(
      sorted.updatedMarkdown.indexOf('2022')
    );

    const unified = applyDeterministicRefinement(sorted.updatedMarkdown, 'وحد ترقيم الأسئلة بالتسلسل');
    expect(unified.applied).toBe(true);
    expect(unified.updatedMarkdown).toContain('**س١:**');
  });

  it('parses Arabic include vs exclude lesson clauses accurately', () => {
    const parsed = parseIncludeExcludeUnitsFromInstruction(
      'هات أسئلة درس النكاح والطلاق وسيب درس الخلع وباب العدة'
    );
    expect(parsed.includeUnits).toEqual(['درس النكاح', 'درس الطلاق']);
    expect(parsed.excludeUnits).toEqual(['درس الخلع', 'باب العدة']);
  });

  it('extracts questions from a single book in canonical TOC order while honoring include and exclude lessons', () => {
    const singleBookChunk = `## الدرس الأول: أحكام النكاح
النكاح لغة الضم والجمع.
### أسئلة الدرس الأول
س١: ما تعريف النكاح شرعاً؟

## الدرس الثاني: أحكام الخلع
الخلع فراق الزوجة بعوض.
### أسئلة الدرس الثاني
س١: ما حكم الخلع إذا تراضى الزوجان؟

## الدرس الثالث: أحكام الطلاق
الطلاق حل رابطة الزوجية.
### أسئلة الدرس الثالث
س١: اذكر أركان الطلاق الثلاثة؟`;

    const outlineMeta = extractSourceOutline(singleBookChunk, 3);
    const catalog = [
      {
        id: 'book-fiqh',
        title: 'كتاب الفقه الشافعي',
        fileName: 'fiqh.pdf',
        totalPages: 3,
        wordCount: 120,
        detectedYears: [],
        outline: outlineMeta.outline,
        sampleSnippet: '',
      },
    ];

    const plan = buildDeterministicPlan(
      'هات أسئلة درس النكاح ودرس الطلاق على حسب ترتيبها في الدروس والفهرس وسيب درس الخلع',
      'preserve_across_exams',
      catalog
    );

    expect(plan.organizationMode).toBe('by_book_order');
    const dir = plan.sourceDirectives[0];
    expect(dir.extractionMode).toBe('questions_only');
    expect(dir.targetUnits.length).toBe(2);
    expect(dir.excludeUnits?.length).toBe(1);

    const extracted = deterministicExtractFromChunk(singleBookChunk, dir, 'كتاب الفقه الشافعي', 0, '');
    expect(extracted.markdown).toContain('ما تعريف النكاح شرعاً؟');
    expect(extracted.markdown).toContain('اذكر أركان الطلاق الثلاثة؟');
    expect(extracted.markdown).not.toContain('ما حكم الخلع');
    expect(extracted.markdown).not.toContain('النكاح لغة الضم والجمع');

    const assembled = assembleCompilationDocument(plan, [extracted]);
    expect(assembled.markdown).toContain('فهرس المحتويات');
    expect(assembled.markdown.indexOf('النكاح')).toBeLessThan(assembled.markdown.indexOf('الطلاق'));
  });

  it('distinguishes conversational document/TOC Q&A queries from action commands', () => {
    expect(isConversationalQuestionIntent('ما هي الدروس الموجودة في الكتاب؟')).toBe(true);
    expect(isConversationalQuestionIntent('اعرض فهرس الأبواب والفصول')).toBe(true);
    expect(isConversationalQuestionIntent('كم عدد السنوات في البوكلت؟')).toBe(true);
    expect(isConversationalQuestionIntent('هات أسئلة الدرس الأول وسيب الدرس الثاني')).toBe(false);
    expect(isConversationalQuestionIntent('اجمع أسئلة المرشد مع البوكلت')).toBe(false);
  });
});
