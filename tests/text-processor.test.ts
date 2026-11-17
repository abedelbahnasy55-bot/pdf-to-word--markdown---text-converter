import { describe, it, expect } from 'vitest';
import { TextProcessor } from '../src/utils/textProcessor';

describe('TextProcessor Module', () => {
  it('1) Removes false-positive table noise like "ا" separators', () => {
    const raw = 'خطة القسم الأدبياالفترة الزمنيةاالموضوعات\nالفهرساالموضوعارقم الصفحة\nالرأياالحكماالتعليل';
    const cleaned = TextProcessor.process(raw, { removeTableNoise: true });

    expect(cleaned).toContain('| خطة القسم الأدبي | الفترة الزمنية | الموضوعات |');
    expect(cleaned).toContain('| الفهرس | الموضوع | رقم الصفحة |');
    expect(cleaned).toContain('| الرأي | الحكم | التعليل |');
  });

  it('2) Purges specific scanner artifacts like the word "شمخ"', () => {
    const raw = 'زيد بن ثابت شمخ أفتى بالفرائض.\nعثمان وطلحة ٩ شمخ في القضاء.';
    const cleaned = TextProcessor.process(raw, { purgeArtifacts: true });

    expect(cleaned).not.toContain('شمخ');
    expect(cleaned).toContain('زيد بن ثابت');
  });

  it('3) Applies regex-based lookup for known error patterns like "بأنًّا" to "باتًّا" and "تريق" to "تفريق"', () => {
    const raw = 'الثمن إذا كان بأنًّا نافذاً.\nأحكام تريق الصفقة والبيعي والوزني.';
    const cleaned = TextProcessor.process(raw, { applyKnownPatternFixes: true });

    expect(cleaned).toContain('باتًّا');
    expect(cleaned).toContain('تفريق الصفقة');
    expect(cleaned).toContain('الكيلي والوزني');
  });

  it('returns detailed metrics when calling .clean()', () => {
    const raw = 'خطة القسم الأدبياالفترة الزمنيةاالموضوعات\nزيد بن ثابت شمخ أفتى.\nالثمن بأنًّا، وتريق الصفقة.';
    const processor = new TextProcessor();
    const result = processor.clean(raw);

    expect(result.tableNoiseFixes).toBeGreaterThanOrEqual(1);
    expect(result.artifactsPurged).toBeGreaterThanOrEqual(1);
    expect(result.patternFixesApplied).toBeGreaterThanOrEqual(2);
    expect(result.replacementsCount).toBeGreaterThanOrEqual(4);
    expect(result.processedText).toContain('باتًّا');
    expect(result.processedText).toContain('تفريق الصفقة');
    expect(result.processedText).not.toContain('شمخ');
  });

  it('5) Restructures Azhar textbook glued tables and converts tab-delimited cells to Markdown tables', () => {
    const raw = 'سلاح الأزهراصاحبااالرأياالحكماالتعليلااوالتعليل\n• أبو حنيفة.\t• ينقلب العقد جائزًا.\t١. أن المفسد لم يتصل بالعقد\nالمطلوباالتوضيح\nركنه:\tالإيجاب والقبول';
    const cleaned = TextProcessor.process(raw);

    expect(cleaned).toContain('| صاحب الرأي | الحكم | التعليل |');
    expect(cleaned).toContain('| • أبو حنيفة. | • ينقلب العقد جائزًا. | ١. أن المفسد لم يتصل بالعقد |');
    expect(cleaned).toContain('| المطلوب | التوضيح |');
    expect(cleaned).toContain('| ركنه: | الإيجاب والقبول |');
  });

  it('6) Purges repeating running headers (الصف الثاني الثانوي / الفصل الدراسي الأول / سلاح الأزهر)', () => {
    const raw = 'نص فقهي معتبر.\nالصف الثاني الثانوي\nالفصل الدراسي الأول\n٢٦\nتكملة النص الفقهي.';
    const cleaned = TextProcessor.process(raw);

    expect(cleaned).not.toContain('الصف الثاني الثانوي');
    expect(cleaned).not.toContain('الفصل الدراسي الأول');
    expect(cleaned).toContain('نص فقهي معتبر.');
    expect(cleaned).toContain('تكملة النص الفقهي.');
  });

  it('7) Normalizes question and answer prefixes (س:١, س : ١, س 1: -> س١: / ج:١ -> ج١:)', () => {
    const raw = 'س:١ ما تعريف البلاغة؟\nج:١ البلاغة هي مطابقة الكلام لمقتضى الحال.\nس : ٢ اذكر شروط الفصاحة.\nج : 2 ثلاثة شروط.\nس 3: ما الاستعارة؟';
    const cleaned = TextProcessor.process(raw);

    expect(cleaned).toContain('س١: ما تعريف البلاغة؟');
    expect(cleaned).toContain('ج١: البلاغة هي مطابقة الكلام لمقتضى الحال.');
    expect(cleaned).toContain('س٢: اذكر شروط الفصاحة.');
    expect(cleaned).toContain('ج2: ثلاثة شروط.');
    expect(cleaned).toContain('س3: ما الاستعارة؟');
  });

  it('8) Collapses duplicate page breaks and removes leaked markers in list items and tables', () => {
    const raw = '---PAGE_BREAK---\n\n---PAGE_BREAK---\n\nنص الصفحة الأولى\n- نقطة أولى ---PAGE_BREAK--- تكملة النقطة\n| عمود ١ | عمود ٢ ---PAGE_BREAK--- |\n\n---PAGE_BREAK---\n\n---PAGE_BREAK---\n\nنص الصفحة الثانية\n\n---PAGE_BREAK---';
    const cleaned = TextProcessor.process(raw);

    // Should not have multiple consecutive page breaks
    expect(cleaned).not.toMatch(/(?:---PAGE_BREAK---\s*){2,}/);
    // Should have stripped page break leaked inside bullet item
    expect(cleaned).toContain('- نقطة أولى  تكملة النقطة');
    // Should preserve clean structural page break between page 1 and page 2
    expect(cleaned).toContain('نص الصفحة الأولى\n- نقطة أولى  تكملة النقطة\n| عمود ١ | عمود ٢  |\n\n---PAGE_BREAK---\n\nنص الصفحة الثانية');
  });
});
