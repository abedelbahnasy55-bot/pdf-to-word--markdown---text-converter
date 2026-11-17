import { describe, it, expect } from 'vitest';
import * as docx from 'docx';
import JSZip from 'jszip';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import {
  unwrapFakeMathCore,
  polishBilingualBoundariesCore,
  markdownToPlainTextCore,
} from '../shared/arabicPipelineCore.js';
import { StructuralCleaner } from '../src/utils/structuralCleaner';
import {
  markdownToPlainTextSafe,
  preserveUnderlineFormattingMarkers,
  restoreLostUnderlinesFromSource,
  runMicroscopicFinalizationPipeline,
} from '../src/utils/documentConverter';
import {
  detectPdfUnderlines,
  applyVerifiedUnderlinesToMarkdown,
} from '../server/pdfUnderlineExtractor';
import { buildDocxBinary, TYPOGRAPHY_PROFILES } from '../shared/typographyDocxCore.js';
import {
  buildSearchablePassages,
  cosineSimilarity,
  normalizeArabicForSearch,
  computeArabicLexicalScore,
  rankSemanticPassagesHybrid,
} from '../shared/semanticSearchCore.js';

describe('Pipeline Underline ("أعرب ما تحته خط") & Typographical Formatting', () => {
  it('converts LaTeX \\underline{...} to <u>...</u> in both core and StructuralCleaner', () => {
    const raw = 'أعرب ما تحته خط: إن $\\underline{العلم}$ نورٌ، و$\\underline{الجهل}$ ظلامٌ.';
    const coreOut = unwrapFakeMathCore(raw);
    const cleanerOut = StructuralCleaner.unwrapFakeMath(raw);

    expect(coreOut).toContain('<u>العلم</u>');
    expect(coreOut).toContain('<u>الجهل</u>');
    expect(coreOut).not.toContain('\\underline');

    expect(cleanerOut).toContain('<u>العلم</u>');
    expect(cleanerOut).toContain('<u>الجهل</u>');
  });

  it('protects <u>, <mark>, <sup>, <sub>, <s> tags during bilingual boundary polishing', () => {
    const input = 'أعرب كلمة <u>Active</u> و<u>المجتهد</u> في الجملة.';
    const polished = polishBilingualBoundariesCore(input);
    expect(polished).toContain('<u>Active</u>');
    expect(polished).toContain('<u>المجتهد</u>');
    expect(polished).not.toContain('< u >');
  });

  it('strips inline formatting tags cleanly to plainText while preserving fill-in-the-blank underscores (___)', () => {
    const md =
      'س١: أعرب ما تحته خط: إن <u>**المؤمنين**</u> صادقون، وصحح ~~الخطأ~~، وأكمل الفراغ: يتكون الاسم من ___ و ___.';
    const plainCore = markdownToPlainTextCore(md);
    const plainSafe = markdownToPlainTextSafe(md);

    for (const plain of [plainCore, plainSafe]) {
      expect(plain).toContain('المؤمنين');
      expect(plain).toContain('الخطأ');
      expect(plain).toContain('___');
      expect(plain).not.toContain('<u>');
      expect(plain).not.toContain('</u>');
      expect(plain).not.toContain('~~');
    }
  });

  it('exports native DOCX OOXML with single underline, strike, nested bold+underline, Amiri & Plus Jakarta Sans 14pt, and 1.5 line spacing', async () => {
    const markdown =
      '# امتحان النحو 2022\n\n' +
      'اقرأ الفقرة ثم أعرب ما تحته خط: إن <u>**العلم**</u> ركيزة التقدم، ولا تكرر ~~الوهم~~، ويدعم نظام `SDK` الحديث.';

    const buffer = await buildDocxBinary(
      {
        title: 'اختبار النحو',
        markdown,
        isRtl: true,
        fontProfile: 'bilingual_publication',
      },
      { docx, JSZip }
    );

    const zip = await JSZip.loadAsync(buffer);
    const docXml = await zip.file('word/document.xml')?.async('text');
    expect(docXml).toBeTruthy();

    // Verify underline OOXML tag
    expect(docXml).toContain('<w:u w:val="single"');
    // Verify strikethrough OOXML tag
    expect(docXml).toContain('<w:strike');
    // Verify nested bold + underline on العلم
    expect(docXml).toMatch(/<w:b[^>]*\/>[\s\S]{0,180}<w:u w:val="single"/);
    // Verify Amiri + Plus Jakarta Sans 14pt (28 half-pt) + 1.5 spacing (360)
    expect(TYPOGRAPHY_PROFILES.bilingual_publication.arabicFont).toBe('Amiri');
    expect(TYPOGRAPHY_PROFILES.bilingual_publication.englishFont).toBe('Plus Jakarta Sans');
    expect(docXml).toContain('Amiri');
    expect(docXml).toContain('Plus Jakarta Sans');
    expect(docXml).toContain('w:sz w:val="28"');
    expect(docXml).toContain('w:line="360"');
  });

  it('normalizes <ins>, CSS underline spans, CriticMarkup ++...++, and Unicode combining low-lines across pipeline and DOCX', async () => {
    const raw =
      'أعرب كلمة ++المجتهد++ وك\u0332ل\u0332م\u0332ة\u0332 <span style="text-decoration: underline">الصدق</span> وك\u0332\u064eت\u064e\u0332ب\u0332 و<ins>الإخلاص</ins>.';
    const normalized = preserveUnderlineFormattingMarkers(raw);

    expect(normalized).toContain('<u>المجتهد</u>');
    expect(normalized).toContain('<u>كلمة</u>');
    expect(normalized).toContain('<u>الصدق</u>');
    expect(normalized).toContain('<u>كَتَب</u>');
    expect(normalized).toContain('<ins>الإخلاص</ins>');

    const polished = polishBilingualBoundariesCore(normalized);
    expect(polished).toContain('<ins>الإخلاص</ins>');

    const plainCore = markdownToPlainTextCore(normalized);
    const plainSafe = markdownToPlainTextSafe(normalized);
    for (const plain of [plainCore, plainSafe]) {
      expect(plain).toContain('الإخلاص');
      expect(plain).toContain('كلمة');
      expect(plain).not.toContain('<ins>');
      expect(plain).not.toContain('</ins>');
      expect(plain).not.toContain('<u>');
    }

    const buffer = await buildDocxBinary(
      { title: 'اختبار ins', markdown: normalized, isRtl: true },
      { docx, JSZip }
    );
    const zip = await JSZip.loadAsync(buffer);
    const docXml = await zip.file('word/document.xml')?.async('text');
    expect(docXml).toContain('<w:u w:val="single"');
    expect(docXml).toContain('الإخلاص');
  });

  it('detects border-bottom, \\uline, \\u0331, and overstrike cues and restores lost underlines in finalization pipeline', () => {
    const rich =
      'أعرب <span style="border-bottom: 1px solid #000">الفاعل</span> و\\uline{المفعول} و_\u0008ا_\u0008ل_\u0008م_\u0008ب_\u0008ت_\u0008د_\u0008أ وس\u0331ا\u0331ر\u0331ع\u0331.';
    const normalized = preserveUnderlineFormattingMarkers(rich);
    expect(normalized).toContain('<u>الفاعل</u>');
    expect(normalized).toContain('<u>المفعول</u>');
    expect(normalized).toContain('<u>المبتدأ</u>');
    expect(normalized).toContain('<u>سارع</u>');

    const source = 'س١: أعرب ما تحته خط: إن <u>العلم</u> <ins>نور</ins>.';
    const strippedCandidate = 'س١: أعرب ما تحته خط: إن العلم نور.';
    const restored = restoreLostUnderlinesFromSource(source, strippedCandidate);
    expect(restored).toContain('<u>العلم</u>');
    expect(restored).toContain('<ins>نور</ins>');

    const finalized = runMicroscopicFinalizationPipeline(source, strippedCandidate, 'exam.pdf');
    expect(finalized.finalMarkdown).toContain('<u>العلم</u>');
    expect(finalized.finalMarkdown).toContain('<ins>نور</ins>');
    expect(finalized.plainText).not.toContain('<u>');
    expect(finalized.plainText).not.toContain('<ins>');
  });

  it('detects vector stroke lines and thin rectangles under text in real PDFs and preserves them as <u>...</u>', async () => {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595, 842]);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const fontSize = 14;
    const textY = 700;
    const prefix = 'Explain ';
    const target1 = 'Knowledge';
    const mid = ' and ';
    const target2 = 'Wisdom';
    const suffix = ' carefully in this exam passage.';

    const x0 = 60;
    page.drawText(`${prefix}${target1}${mid}${target2}${suffix}`, {
      x: x0,
      y: textY,
      size: fontSize,
      font,
      color: rgb(0, 0, 0),
    });

    // Vector line underline under "Knowledge"
    const t1X = x0 + font.widthOfTextAtSize(prefix, fontSize);
    const t1W = font.widthOfTextAtSize(target1, fontSize);
    page.drawLine({
      start: { x: t1X, y: textY - 2.5 },
      end: { x: t1X + t1W, y: textY - 2.5 },
      thickness: 1.2,
      color: rgb(0, 0, 0),
    });

    // Thin filled rectangle underline under "Wisdom"
    const t2X = x0 + font.widthOfTextAtSize(`${prefix}${target1}${mid}`, fontSize);
    const t2W = font.widthOfTextAtSize(target2, fontSize);
    page.drawRectangle({
      x: t2X,
      y: textY - 3,
      width: t2W,
      height: 1.2,
      color: rgb(0, 0, 0),
    });

    const pdfBytes = await pdfDoc.save();
    const detection = await detectPdfUnderlines(Buffer.from(pdfBytes));

    expect(detection.totalUnderlines).toBeGreaterThanOrEqual(2);
    expect(detection.pages[0]?.underlinedPhrases).toEqual(
      expect.arrayContaining(['Knowledge', 'Wisdom'])
    );

    const rawMd = 'Explain Knowledge and Wisdom carefully in this underlined question. Already <ins>Wisdom</ins>!';
    const applied = applyVerifiedUnderlinesToMarkdown(rawMd, detection.pages, true);
    expect(applied).toContain('<u>Knowledge</u>');
    // Must not double-wrap existing <ins>Wisdom</ins>
    expect(applied).toContain('<ins>Wisdom</ins>');
    expect(applied).not.toContain('<u><ins>');
  });
});

describe('Semantic Vector Search Core & Hybrid Ranking', () => {
  const sampleSources = [
    {
      id: 'src-nahw',
      title: 'بوكلت النحو 2022',
      markdown: [
        '## درس النداء والمنادى',
        'ينقسم المنادى إلى معرب ومبني.',
        'س١: أعرب ما تحته خط: يا <u>طالبَ</u> العلم اجتهد.',
        '---PAGE_BREAK---',
        '## درس الممنوع من الصرف',
        'س٢: علل منع كلمة «مصابيح» من الصرف في الجملة الآتية.',
      ].join('\n\n'),
    },
    {
      id: 'src-fiqh',
      title: 'كتاب المرشد في الفقه',
      markdown: [
        '## باب أحكام الزكاة',
        'تجب الزكاة في المال إذا بلغ النصاب وحال عليه الحول.',
        'س١: ما شروط وجوب زكاة الزروع والثمار؟',
      ].join('\n\n'),
    },
  ];

  it('extracts structured question, lesson, and topic passages across pages while preserving underlines', () => {
    const allPassages = buildSearchablePassages(sampleSources, 'all');
    expect(allPassages.length).toBeGreaterThanOrEqual(4);

    const nahwQ1 = allPassages.find((p) => p.snippet.includes('<u>طالبَ</u>'));
    expect(nahwQ1).toBeDefined();
    expect(nahwQ1?.kind).toBe('question');
    expect(nahwQ1?.pageNumber).toBe(1);
    expect(nahwQ1?.heading).toContain('النداء');

    const page2Q = allPassages.find((p) => p.snippet.includes('مصابيح'));
    expect(page2Q).toBeDefined();
    expect(page2Q?.pageNumber).toBe(2);

    const questionsOnly = buildSearchablePassages(sampleSources, 'question');
    expect(questionsOnly.every((p) => p.kind === 'question')).toBe(true);

    const lessonsOnly = buildSearchablePassages(sampleSources, 'topic_lesson');
    expect(lessonsOnly.every((p) => p.kind === 'lesson' || p.kind === 'topic')).toBe(true);
  });

  it('ranks relevant passages first in both vector-embedding mode and Arabic lexical-fallback mode', () => {
    const passages = buildSearchablePassages(sampleSources, 'all');
    const zakatPassage = passages.find((p) => p.text.includes('الزكاة'))!;
    const nahwPassage = passages.find((p) => p.text.includes('طالب'))!;

    expect(zakatPassage).toBeDefined();
    expect(nahwPassage).toBeDefined();

    // Cosine similarity sanity
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1, 5);
    expect(cosineSimilarity([1, 0, 0], [0, 1, 0])).toBeCloseTo(0, 5);

    // Vector embedding hybrid ranking test
    const queryVec = [0.95, 0.25, 0.0];
    const passageVectors = new Map<string, number[]>();
    for (const p of passages) {
      if (p.id === zakatPassage.id) {
        passageVectors.set(p.textHash, [0.94, 0.28, 0.0]);
      } else {
        passageVectors.set(p.textHash, [0.05, 0.1, 0.99]);
      }
    }

    const vectorResults = rankSemanticPassagesHybrid({
      query: 'نصاب زكاة المحاصيل والثمار',
      passages,
      queryVector: queryVec,
      passageVectors,
      topK: 5,
      minScore: 0.18,
      mode: 'vector-embedding',
    });

    expect(vectorResults.length).toBeGreaterThanOrEqual(1);
    expect(vectorResults[0].passageId).toBe(zakatPassage.id);
    expect(vectorResults[0].matchPercent).toBeGreaterThan(70);

    // Arabic lexical fallback ranking test
    expect(normalizeArabicForSearch('أَعْرِبْ مَا تَحْتَهُ خَطّ')).toBe('اعرب ما تحته خط');
    expect(computeArabicLexicalScore('إعراب المنادى', nahwPassage.text + ' ' + nahwPassage.heading)).toBeGreaterThan(0.25);

    const lexicalResults = rankSemanticPassagesHybrid({
      query: 'مصابيح الممنوع من الصرف',
      passages,
      mode: 'lexical-fallback',
      topK: 5,
    });
    expect(lexicalResults.length).toBeGreaterThanOrEqual(1);
    expect(lexicalResults[0].sourceId).toBe('src-nahw');
    expect(lexicalResults[0].snippet).toContain('مصابيح');
  });
});
