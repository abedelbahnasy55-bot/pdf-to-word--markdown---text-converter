import { describe, it, expect } from 'vitest';
import { TextCleanerEngine, cleanTextWithEngine, DEFAULT_CLEANER_RULES } from '../shared/textCleanerEngine';

describe('TextCleanerEngine Unit Tests', () => {
  it('correctly repairs glued table headers with "ا" column separators', () => {
    const raw = 'خطة القسم الأدبياالفترة الزمنيةاالموضوعات\nالفهرساالموضوعارقم الصفحة\nالفقه الحنفيانوع الدليلاالتوضيح';
    const report = cleanTextWithEngine(raw);

    expect(report.cleanedText).toContain('| خطة القسم الأدبي | الفترة الزمنية | الموضوعات |');
    expect(report.cleanedText).toContain('| الفهرس | الموضوع | رقم الصفحة |');
    expect(report.cleanedText).toContain('| الفقه الحنفي | نوع الدليل | التوضيح |');
    expect(report.tableHeadersFixed).toBeGreaterThanOrEqual(3);
  });

  it('purges margin scanner noise "شمخ" and broken footnote artifacts', () => {
    const raw = 'زيد بن ثابت شمخ أفتى بالفرائض.\nأبي بن كعب شمخ اقرأ الأمة.\nعثمان وطلحة ٩ شمخ في مجلس القضاء.';
    const report = cleanTextWithEngine(raw);

    expect(report.cleanedText).not.toContain('شمخ');
    expect(report.cleanedText).toContain('زيد بن ثابت');
    expect(report.cleanedText).toContain('أبي بن كعب');
    expect(report.noisePurged).toBeGreaterThanOrEqual(3);
  });

  it('replaces common Fiqh and spelling typos based on updatable dictionary', () => {
    const raw = 'الثمن إذا كان بأنًّا نافذاً.\nالحكم في البيعي والوزني.\nبيع الدار مع الكتيف.\nشراء الزعْر والثمار.\nاحكام تريق الصفقة والسففل مع أجرة الصيغ في أكتوبرامن ومصوغهما ومصوغهما.';
    const report = cleanTextWithEngine(raw);

    expect(report.cleanedText).toContain('باتًّا');
    expect(report.cleanedText).toContain('الكيلي والوزني');
    expect(report.cleanedText).toContain('الكنيف');
    expect(report.cleanedText).toContain('الزرع');
    expect(report.cleanedText).toContain('تفريق الصفقة');
    expect(report.cleanedText).toContain('السُّفْل');
    expect(report.cleanedText).toContain('أجرة الصَّبْغ');
    expect(report.cleanedText).toContain('أكتوبر من');
    expect(report.cleanedText).toContain('ومصوغهما');
    expect(report.cleanedText).not.toContain('ومصوغهما ومصوغهما');
    expect(report.typosCorrected).toBeGreaterThanOrEqual(8);
  });

  it('supports adding and toggling custom cleaning rules dynamically', () => {
    const engine = new TextCleanerEngine([...DEFAULT_CLEANER_RULES]);
    
    // Add custom rule
    const customRule = engine.addRule({
      patternStr: 'اختبار_خطأ',
      flags: 'g',
      replacement: 'اختبار_صحيح',
      category: 'custom',
      subject: 'اختبار',
      description: 'قاعدة تجريبية',
      enabled: true,
    });

    const testText = 'هذا نص يحتوي على اختبار_خطأ ينبغي تصحيحه.';
    const report1 = engine.cleanText(testText);
    expect(report1.cleanedText).toContain('اختبار_صحيح');
    expect(report1.totalReplacements).toBeGreaterThanOrEqual(1);

    // Disable custom rule
    engine.toggleRule(customRule.id, false);
    const report2 = engine.cleanText(testText);
    expect(report2.cleanedText).toContain('اختبار_خطأ');
  });

  it('transforms tab-separated values into standard Markdown table rows', () => {
    const raw = 'صاحباالرأياالحكماالتعليل\nأبو حنيفة:\tجاز في قفيز واحد.\tلأنه تعذر الصرف للجهالة\nأبو يوسف:\tيجوز في الكل.\tلزوال المانع';
    const report = cleanTextWithEngine(raw);

    expect(report.cleanedText).toContain('| صاحب الرأي | الحكم | التعليل |');
    expect(report.cleanedText).toContain('| أبو حنيفة: | جاز في قفيز واحد. | لأنه تعذر الصرف للجهالة |');
    expect(report.cleanedText).toContain('| أبو يوسف: | يجوز في الكل. | لزوال المانع |');
    expect(report.tableHeadersFixed).toBeGreaterThanOrEqual(3);
  });
});
