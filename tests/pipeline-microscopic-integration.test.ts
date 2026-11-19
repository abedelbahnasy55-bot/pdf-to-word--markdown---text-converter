import { describe, it, expect } from 'vitest';
import { TextProcessor } from '../shared/textProcessor';
import { DEFAULT_CLEANER_RULES } from '../shared/textCleanerEngine';
import {
  generateAutoHealedMarkdown,
  runMicroscopicAudit,
} from '../src/utils/microscopicAuditEngine';
import {
  auditTextFidelityCore,
  runFullRefinementPipeline,
} from '../shared/arabicPipelineCore';

describe('Pipeline Microscopic Audit & Cleaner Integration', () => {
  it('executes custom dictionary rules passed to TextProcessor engine automatically', () => {
    const customRules = [
      ...DEFAULT_CLEANER_RULES,
      {
        id: 'custom-pipeline-1',
        patternStr: 'عبارة_مكسورة',
        flags: 'g',
        replacement: 'عبارة_محققة',
        category: 'custom' as const,
        subject: 'اختبار',
        description: 'قاعدة اختبارية مدمجة بالمسار',
        enabled: true,
        isCustom: true,
      },
    ];
    const processor = new TextProcessor(customRules);
    const cleaned = processor.clean('نص يحتوي على عبارة_مكسورة مع بأنًّا.');

    expect(cleaned.processedText).toContain('عبارة_محققة');
    expect(cleaned.processedText).toContain('باتًّا');
    expect(cleaned.patternFixesApplied).toBeGreaterThanOrEqual(2);
  });

  it('auto-heals unbracketed Quranic verses without double-wrapping already formatted Uthmani ayahs', () => {
    const mixed =
      'قال تعالى: ﴿فَانكِحُوا مَا طَابَ لَكُم مِّنَ النِّسَاءِ مَثْنَىٰ وَثُلَاثَ وَرُبَاعَ ۖ فَإِنْ خِفْتُمْ أَلَّا تَعْدِلُوا فَوَاحِدَةً﴾.\n' +
      'وقال تعالى: وآتوا النساء صدقاتهن نحلة\n' +
      '| العمود | البيان |\n| --- | --- |\n| ﴿وَالْوَالِدَاتُ﴾ | شاهد |';

    const healed = generateAutoHealedMarkdown(mixed);

    expect(healed).not.toContain('﴿﴿');
    expect(healed).not.toContain('﴾﴾');
    expect(healed).toContain('﴿وَآتُوا النِّسَاءَ صَدُقَاتِهِنَّ نِحْلَةً ۚ فَإِن طِبْنَ لَكُمْ عَن شَيْءٍ مِّنْهُ نَفْسًا فَكُلُوهُ هَنِيئًا مَّرِيئًا﴾');
    expect(healed).not.toContain('﴾ نحلة');
    expect(healed).toContain('| ﴿وَالْوَالِدَاتُ﴾ | شاهد |');
  });

  it('produces shared fidelitySummary inside runFullRefinementPipeline for MCP/CLI offline parity', () => {
    const sample =
      'تعريف النكاح: عقد يفيد ملك المتعة.\n' +
      'قال تعالى: ﴿فَانكِحُوا مَا طَابَ لَكُم مِّنَ النِّسَاءِ مَثْنَىٰ وَثُلَاثَ وَرُبَاعَ﴾.\n' +
      'س: ١ ما حكم الصداق؟';

    const pipelineResult = runFullRefinementPipeline(sample);
    const fidelity = auditTextFidelityCore(sample, pipelineResult.markdown);

    expect(pipelineResult.markdown).toContain('س١: ما حكم الصداق؟');
    expect(pipelineResult.fidelitySummary?.wordFidelityRatio).toBeGreaterThanOrEqual(90);
    expect(fidelity.quranicVersesCount).toBe(1);
    expect(runMicroscopicAudit(sample, pipelineResult.markdown).summary.wordFidelityRatio).toBeGreaterThanOrEqual(90);
  });
});
