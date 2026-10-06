/**
 * Shared characterization fixtures.
 *
 * The Arabic fixture is an Azhar 2nd-secondary style page containing every
 * construct the duplicated transforms are supposed to touch:
 *   - full tashkeel (حَرَكَات) and tanween
 *   - mushaf brackets ﴿...﴾
 *   - `---PAGE_BREAK---` markers
 *   - ATX markdown headings, pipe tables, footnote refs
 *   - bold / italic / inline code / math
 *   - `.....` dot runs of several lengths
 *   - Arabic-Indic digits (٠١٢٣٤٥٦٧٨٩) and Western digits
 *   - a horizontal rule `---`
 *   - RTL punctuation plus ASCII punctuation
 */

export const AR_MARKDOWN_FIXTURE = `# سورة الملك — التفسير

الموضوع الأول: تفسير السور الطوال

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

الصفحة 22
`;

/** Deliberately malformed English control document: no Arabic at all. */
export const EN_MARKDOWN_FIXTURE = `# Chapter 1 — Extraction Theory

## Heading two

| Term | Meaning | Note |
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

_underscored emphasis_
`;

/** Footnote / header / numbering fixture for documentStructuralAuditor. */
export const AR_FOOTNOTE_FIXTURE = `# مبادئ علوم القرآن الكريم

الموضوع الثالث: أول وآخر ما نزل

النسخ في القرآن واقع، والتدرج التشريعي ثابت.

أحقاباً في سورة النبأ، والحميم والغساق معنيان.

## الإعراب

1. أول عنصر
3. ثالث عنصر
4. رابع عنصر

الموضوع الثاني: غير منسق

سؤال: ما الحقب؟
(١) أي: السنون
جواب مطاطي يليه.

الصفحة 30
`;

/** Inputs for the Dropzone.tsx file-sniffing predicate. */
export const FILE_CANDIDATES = [
  { name: 'lecture-01.pdf', type: 'application/pdf' },
  { name: 'lecture-01.PDF', type: '' },
  { name: 'notes.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  { name: 'notes.doc', type: 'application/msword' },
  { name: 'scan.png', type: 'image/png' },
  { name: 'scan.JPEG', type: '' },
  { name: 'scan.webp', type: '' },
  { name: 'noext', type: 'application/octet-stream' },
  { name: 'notes.txt', type: 'text/plain' },
  { name: 'fake.pdf.txt', type: 'text/plain' },
  { name: 'wordless.docx', type: 'application/msword' },
] as const;

/** Filenames exercising the three competing baseName regexes. */
export const FILENAMES = [
  'ملف الحصة.pdf',
  'ملف الحصة.PDF',
  'ملف الحصة.docx',
  'ملف الحصة.md',
  'ملف الحصة.txt',
  'ملف الحصة.doc',
  'ملف.الحصة.المرحلة.الثانية.pdf',
  'ملف الحصة.final.v2.pdf',
  'archive.tar.gz',
  'no-extension',
  'archive.pdf.pdf',
  '.pdf',
  'v1.2',
  'ملف الحصة',
] as const;
