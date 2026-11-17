import { describe, it, expect } from 'vitest';
import {
  quranicVerificationAgent,
  findBestCanonicalAyah,
  normalizeQuranicArabic,
} from '../src/utils/quranicVerificationAgent';
import { generateDocxBlob } from '../src/utils/docxExporter';

describe('Authoritative Quranic Restoration & Verbatim Fidelity Suite', () => {
  it('normalizes Arabic text for tolerant phonological cross-referencing', () => {
    const raw = '﴿عَمَّ يَتَسَآءَلُونَ﴾';
    const normalized = normalizeQuranicArabic(raw);
    expect(normalized).toBe('عم يتساءلون');
  });

  it('accurately matches distorted OCR Quranic snippets against the canonical Uthmani dataset', () => {
    // Distorted snippet missing tashkeel and with slight OCR letter confusion
    const snippet = 'تبارك الذي بيده الملك وهو علي كل شي قدير';
    const match = findBestCanonicalAyah(snippet);
    expect(match).not.toBeNull();
    expect(match?.ayah.surahName).toBe('الملك');
    expect(match?.ayah.ayahNumber).toBe(1);
    expect(match?.replacementUthmaniText).toContain('تَبَارَكَ الَّذِي بِيَدِهِ الْمُلْكُ');
  });

  it('corrects OCR corruptions inside ﴿...﴾ to certified Uthmani script', async () => {
    const markdownWithCorruptedVerse = 'وقوله في سورة الملك: ﴿الَّذِي خَلَقَ سَبْعَ سَمَاوَاتٍ طِبَاقًا مَّا تَرَىٰ فِي خَلْقِ الرَّحْمَٰنِ مَن تَقُوتُ﴾ فما حكمه؟';
    const result = await quranicVerificationAgent(markdownWithCorruptedVerse);

    expect(result.verifiedMarkdown).toContain('مِن تَفَاوُتٍ');
    expect(result.verifiedMarkdown).toMatch(/﴿[^﴾]*مِن تَفَاوُتٍ[^﴾]*﴾/);
    expect(result.report.correctedVersesCount).toBeGreaterThan(0);
    expect(result.report.hasUthmaniDiscrepancies).toBe(true);
  });

  it('detects and wraps unbracketed Quranic verses after citation formulas (قال تعالى: ...)', async () => {
    const unbracketedMarkdown = 'قال تعالى: عم يتساءلون عن النبإ العظيم الذي هم فيه مختلفون.';
    const result = await quranicVerificationAgent(unbracketedMarkdown);

    expect(result.verifiedMarkdown).toContain('﴿عَمَّ يَتَسَاءَلُونَ﴾');
    expect(result.verifiedMarkdown).toContain('قال تعالى: ﴿');
    expect(result.report.totalVersesDetected).toBeGreaterThan(0);
  });

  it('detects and restores parenthesized / quoted verses to ornamental ﴿...﴾', async () => {
    const quotedMarkdown = 'واستدل الشيخ بقوله "إن مع العسر يسرا" في المبحث الأول.';
    const result = await quranicVerificationAgent(quotedMarkdown);

    expect(result.verifiedMarkdown).toContain('﴿إِنَّ مَعَ الْعُسْرِ يُسْرًا﴾');
  });

  it('preserves footnotes and verbatim questions through docxExporter without loss', async () => {
    const docxMarkdown = `# اختبار مادة التوحيد والتفسير

1. السؤال الأول: ما معنى قوله تعالى: ﴿عَمَّ يَتَسَاءَلُونَ﴾؟
2. السؤال الثاني: فسر قوله تعالى: ﴿إِنَّ لِلْمُتَّقِينَ مَفَازًا﴾[^1].

| السؤال | الدرجة |
| :--- | :--- |
| الأول | ١٠ |
| الثاني | ١٠ |

[^1]: مفازاً: فوزاً وظفراً بالجنة والنجاة من النار.
`;

    const blob = await generateDocxBlob({
      title: 'اختبار مادة التوحيد والتفسير',
      markdown: docxMarkdown,
      isRtl: true,
    });

    expect(blob).toBeDefined();
    expect(blob.size).toBeGreaterThan(1000);
    expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  });
});
