import { describe, it, expect } from 'vitest';
import {
  runMicroscopicAudit,
  auditQuranicVerses,
  auditFiqhTerms,
  generateAutoHealedMarkdown
} from '../src/utils/microscopicAuditEngine';
import {
  ALL_CANONICAL_AYAHS
} from '../src/utils/quranicVerificationAgent';

describe('Microscopic Audit & Forensic Diff Studio for Hanafi Fiqh', () => {
  const samplePdfSource = `كتاب النكاح
تعريف النكاح: لغة: الضم والجمع والتداخل. وشرعاً: عقد يفيد ملك المتعة قصداً.
ركن النكاح: الإيجاب والقبول. فالإيجاب: ما صدر أولاً من أحد المتعاقدين، والقبول: ما صدر ثانياً من الآخر بأي لفظ يعبر عن الرضا.
شروط صحة النكاح:
١. أهلية العاقدين بالعقل والبلوغ.
٢. حضور شاهدين حرين عاقلين بالغين مسلمين، أو رجل وامرأتين.
قال تعالى: فانكحوا ما طاب لكم من النساء مثنى وثلاث ورباع.
وقال تعالى: وآتوا النساء صدقاتهن نحلة.
المحرمات من النساء:
تحرم من النسب: الأمهات، والبنات، والأخوات، والعمات، والخالات، وبنات الأخ، وبنات الأخت.
وتحرم بالرضاع ما يحرم بالنسب لقول النبي صلى الله عليه وسلم: «يحرم من الرضاع ما يحرم من النسب».
مدة الرضاع:
حولان كاملان عند الصاحبين (أبي يوسف ومحمد بن الحسن)، وقال الإمام أبو حنيفة: ثلاثون شهراً.
قال تعالى: والوالدات يرضعن أولادهن حولين كاملين لمن أراد أن يتم الرضاعة.

أسئلة وتطبيقات:
(١) ما أركان عقد النكاح في الفقه الحنفي؟
(٢) بين حكم شهادة رجل وامرأتين في النكاح مع التعليل.`;

  const sampleWordConverted = `# كتاب النكاح

**تعريف النكاح:**
- **لغةً:** الضم والجمع والتداخل.
- **شرعاً:** عقد يفيد ملك المتعة قصداً.

### ركن النكاح:
الإيجاب والقبول؛ فالإيجاب ما صدر أولاً من أحد المتعاقدين، والقبول ما صدر ثانياً من الآخر بأي لفظ يعبر عن الرضا.

### شروط صحة النكاح:
١. أهلية العاقدين بالعقل والبلوغ.  
٢. حضور شاهدين حُرَّين عاقلين بالغين مسلمين، أو رجل وامرأتين.  

قال تعالى: ﴿فَانكِحُوا مَا طَابَ لَكُم مِّنَ النِّسَاءِ مَثْنَىٰ وَثُلَاثَ وَرُبَاعَ﴾.  
وقال تعالى: ﴿وَآتُوا النِّسَاءَ صَدُقَاتِهِنَّ نِحْلَةً﴾.  

---

### المحرمات من النساء:
- تحرم من النسب: الأمهات، والبنات، والأخوات، والعمات، والخالات، وبنات الأخ، وبنات الأخت.
- ويحرم من الرضاع ما يحرم من النسب لقول النبي ﷺ: «يحرم من الرضاع ما يحرم من النسب».

### مدة الرضاع:
حولان كاملان عند الصاحبين (أبي يوسف ومحمد بن الحسن)، وقال الإمام أبو حنيفة: ثلاثون شهراً.  
قال تعالى: ﴿وَالْوَالِدَاتُ يُرْضِعْنَ أَوْلَادَهُنَّ حَوْلَيْنِ كَامِلَيْنِ ۖ لِمَنْ أَرَادَ أَن يُتِمَّ الرَّضَاعَةَ﴾.  

---

### أسئلة وتطبيقات:
(١) ما أركان عقد النكاح في الفقه الحنفي؟  
(٢) بين حكم شهادة رجل وامرأتين في النكاح مع التعليل.`;

  it('detects and verifies canonical Quranic verses in Hanafi Fiqh curriculum', () => {
    const quranReport = auditQuranicVerses(samplePdfSource, sampleWordConverted);

    expect(quranReport.length).toBeGreaterThanOrEqual(3);

    // Verify Surah An-Nisa: 3
    const nisa3 = quranReport.find(q => q.surahName === 'النساء' && q.ayahNumber === 3);
    expect(nisa3).toBeDefined();
    expect(nisa3?.hasOrnamentalBrackets).toBe(true);
    expect(nisa3?.targetSnippet).toContain('﴿فَانكِحُوا مَا طَابَ لَكُم مِّنَ النِّسَاءِ مَثْنَىٰ وَثُلَاثَ وَرُبَاعَ﴾');

    // Verify Surah An-Nisa: 4
    const nisa4 = quranReport.find(q => q.surahName === 'النساء' && q.ayahNumber === 4);
    expect(nisa4).toBeDefined();
    expect(nisa4?.targetSnippet).toContain('﴿وَآتُوا النِّسَاءَ صَدُقَاتِهِنَّ نِحْلَةً﴾');

    // Verify Surah Al-Baqarah: 233
    const baqarah233 = quranReport.find(q => q.surahName === 'البقرة' && q.ayahNumber === 233);
    expect(baqarah233).toBeDefined();
    expect(baqarah233?.hasOrnamentalBrackets).toBe(true);
  });

  it('tracks Hanafi Fiqh technical terminology with zero semantic loss', () => {
    const fiqhReport = auditFiqhTerms(samplePdfSource, sampleWordConverted);

    const termsFound = fiqhReport.map(f => f.term);
    expect(termsFound).toContain('النكاح');
    expect(termsFound).toContain('الإيجاب');
    expect(termsFound).toContain('القبول');
    expect(termsFound).toContain('صدقات');
    expect(termsFound).toContain('الرضاع');
    expect(termsFound).toContain('أبو حنيفة');
    expect(termsFound).toContain('الصاحبين');

    // Ensure no crucial term is flagged as completely omitted
    const omitted = fiqhReport.filter(f => f.status === 'omission_detected');
    expect(omitted.length).toBe(0);
  });

  it('runs the comprehensive microscopic audit and produces high-fidelity verdict', () => {
    const result = runMicroscopicAudit(samplePdfSource, sampleWordConverted);

    expect(result.summary.wordFidelityRatio).toBeGreaterThanOrEqual(94);
    expect(result.summary.quranicUthmaniCompliance).toBe(100);
    expect(result.summary.missingParagraphsCount).toBe(0);
    expect(result.summary.questionsPreservedInTarget).toBeGreaterThanOrEqual(2);
    expect(result.summary.overallVerdict).toBe('تطابق حرفي ممتاز');
  });

  it('generates an auto-healed markdown with ornamental brackets around unbracketed verses', () => {
    const rawUnbracketedText = 'قال تعالى: فانكحوا ما طاب لكم من النساء مثنى وثلاث ورباع في كتاب النكاح';
    const healed = generateAutoHealedMarkdown(rawUnbracketedText);

    expect(healed).toContain('﴿فَانكِحُوا مَا طَابَ لَكُم مِّنَ النِّسَاءِ مَثْنَىٰ وَثُلَاثَ وَرُبَاعَ ۖ فَإِنْ خِفْتُمْ أَلَّا تَعْدِلُوا فَوَاحِدَةً﴾');
  });

  it('ensures Talaq and Khul ayahs in ALL_CANONICAL_AYAHS match authentically', () => {
    const talaqAyah = ALL_CANONICAL_AYAHS.find(a => a.surahName === 'البقرة' && a.ayahNumber === 229);
    expect(talaqAyah).toBeDefined();
    expect(talaqAyah?.uthmaniText).toContain('الطَّلَاقُ مَرَّتَانِ ۖ فَإِمْسَاكٌ بِمَعْرُوفٍ أَوْ تَسْرِيحٌ بِإِحْسَانٍ');

    const iddahAyah = ALL_CANONICAL_AYAHS.find(a => a.surahName === 'الطلاق' && a.ayahNumber === 4);
    expect(iddahAyah).toBeDefined();
    expect(iddahAyah?.uthmaniText).toContain('وَاللَّائِي يَئِسْنَ مِنَ الْمَحِيضِ');
  });
});
