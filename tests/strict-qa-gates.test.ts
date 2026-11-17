import { describe, it, expect } from 'vitest';
import { StrictQAGatesEngine } from '../src/utils/strictQAGatesEngine';
import { StructuralCleaner } from '../src/utils/structuralCleaner';
import { inspectDocumentPreFlight } from '../src/utils/pdfInspectorCore';

describe('StrictQAGatesEngine & Skill v2.9.6 Capabilities', () => {
  it('corrects spacing before punctuation and converts curly braces to Quranic brackets', () => {
    const input = 'قال تعالى : {وآتوا النساء صدقاتهن نحلة} . هذا حكم صريح ،في المسألة .';
    const report = StrictQAGatesEngine.auditAndRepair(input, 'test.md');

    expect(report.repairedText).toContain('﴿وآتوا النساء صدقاتهن نحلة﴾');
    expect(report.repairedText).not.toContain(' .');
    expect(report.repairedText).not.toContain(' ،');
    expect(report.repairedCount).toBeGreaterThan(0);
  });

  it('detects dropped hamzas in core Azhar vocabulary and restores them', () => {
    const input = 'ذهب احمد الي ازهر شريف مع ابو محمد اذا اراد ذلك ان شاء الله';
    const report = StrictQAGatesEngine.auditAndRepair(input, 'azhar.md');

    expect(report.repairedText).toContain('أحمد');
    expect(report.repairedText).toContain('إلى');
    expect(report.repairedText).toContain('أزهر');
    expect(report.repairedText).toContain('أبو');
    expect(report.repairedText).toContain('إذا');
    expect(report.repairedText).toContain('إن');
  });

  it('evaluates all 6 QA gates with accurate Pass/Fail flags', () => {
    const cleanSample = `# كتاب النكاح
## شروط النكاح
| المسألة | الحكم |
| --- | --- |
| شهادة رجل وامرأتين | جائزة |

قال تعالى: ﴿فَانكِحُوا مَا طَابَ لَكُم مِّنَ النِّسَاءِ﴾.
هذا نص متصل ومستقر خالٍ من أي عيوب أو أخطاء في علامات الترقيم.`;

    const report = StrictQAGatesEngine.auditAndRepair(cleanSample, 'clean.md');
    expect(report.overallPassed).toBe(true);
    expect(report.qualityScore).toBeGreaterThanOrEqual(80);
    expect(report.gates.length).toBe(6);
    expect(report.gates.find(g => g.id === 'punct-spacing')?.passed).toBe(true);
  });
});

describe('StructuralCleaner', () => {
  it('explodes single-line multiple choices into separated distinct items', () => {
    const question = 'ما حكم الصيام للمريض؟ -1 واجب -2 مكروه -3 مباح الفطر';
    const exploded = StructuralCleaner.explodeMultipleChoices(question);

    expect(exploded).toContain('- 1 واجب');
    expect(exploded).toContain('- 2 مكروه');
    expect(exploded).toContain('- 3 مباح الفطر');
  });

  it('unwraps fake math equations with Arabic text', () => {
    const fakeMath = 'وفيه قوله: \\text{المسألة الأولى} وقوله $الفقه الشافعي$';
    const unwrapped = StructuralCleaner.unwrapFakeMath(fakeMath);

    expect(unwrapped).toBe('وفيه قوله: المسألة الأولى وقوله الفقه الشافعي');
  });
});

describe('PdfInspectorCore', () => {
  it('correctly inspects image file and tags as scanned requiring 10-page chunking rule', async () => {
    const fakeFile = new File(['fake-image-bytes'], 'book_scan.png', { type: 'image/png' });
    const report = await inspectDocumentPreFlight(fakeFile);

    expect(report.isLikelyScanned).toBe(true);
    expect(report.hasTextLayer).toBe(false);
    expect(report.recommendedChunkSize).toBeGreaterThan(0);
    expect(report.summaryArabic).toContain('ممسوح ضوئياً');
  });
});
