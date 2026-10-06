import { describe, it, expect } from 'vitest';
import { extractChain } from './helpers/sourceExtract';
import { AR_MARKDOWN_FIXTURE, EN_MARKDOWN_FIXTURE } from './fixtures/curriculum';

/**
 * The markdown -> plainText transform is duplicated across five live sites. Each copy
 * is pinned SEPARATELY, even where the source looks identical, because the whole point
 * of this suite is to detect whether the copies actually agree. If two of these
 * snapshots are byte-identical for the same input, the chains are equivalent and can
 * be merged safely. If any two differ, merging them is a BEHAVIOR CHANGE and must be
 * authorized, not folded into a refactor.
 *
 * Located by content anchor rather than line number so unrelated edits elsewhere in
 * these files do not masquerade as behavior changes.
 */
const A = extractChain('src/utils/documentConverter.ts', 'mergedPlainText = mergedMarkdown');
const B = extractChain('src/App.tsx', 'const cleanPlainText = finalMarkdown');
const C = extractChain('src/App.tsx', 'const cleanPlainText = finalMarkdown', 'const');
const D = extractChain('src/components/OutputViewer.tsx', 'plainText: editedMarkdown', 'prop');
const E = extractChain('server.ts', 'const plainText = markdownContent');

/** The two App.tsx occurrences of the same variable name, disambiguated by ordinal. */
const B_at711 = B;
void B_at711;

describe('1. markdown -> plainText: exact current output per site', () => {
  it('A. documentConverter.ts (const mergedPlainText) — Arabic', () => {
    expect(A.fn(AR_MARKDOWN_FIXTURE)).toMatchInlineSnapshot(`
      "سورة الملك — التفسير

      الموضوع الأول: تفسير السور الطوال

      قال ابن عباس رضي الله عنهما في قوله تعالى ﴿تَبَارَكَ الَّذِي بِيَدِهِ الْمُلْكُ﴾: الملك التام بلا نقص.

      وجوه الإعراب في سورة الملك

      | الكلمة | الإعراب | العلة |
      | مَا تَرَىٰ | اسم مبتدأ | ــ |
      | تَفَاوُتٍ | مجرور | مِن زائدة |
      • مَن تَقُوتُ تصحيح شائع والصواب مِن تَفَاوُتٍ.
      • نص برمجي: codesample = "تفاوت".
      • معادلة: E = mc^2 و a^2 + b^2 = c^2.
      • رابط: المصحف للمراجعة.

      مِدَاد

      [^1]

      تمرين

      س: ثم أُسند التدبير للخيل

      ج: قيل: المراد الملائكة.

      فقط.......ثم...............................

      علوم القرآن هي .....

      والمراد من ذلك الجنس الصادق بـ

      الأرقام بالخط الهندي: ٠١٢٣٤٥٦٧٨٩ وبالخط الغربي: 0123456789

      السؤال: هل فهمت؟ الجواب: نعم.


      ------------------------

      146. وحينها

      ---PAGEBREAK---

      سورة النبأ ﴿لَّابِثِينَ فِيهَا أَحْقَابًا﴾

      الفقه الحنفي: بيع الحاضر للبادي

      راوية ابن ماجه والنساء الرجال.

      كفته نيتة.

      مِن تَقُوتُ

      الصفحة 22"
    `);
  });
  it('A. documentConverter.ts (const mergedPlainText) — English', () => {
    expect(A.fn(EN_MARKDOWN_FIXTURE)).toMatchInlineSnapshot(`
      "Chapter 1 — Extraction Theory

      Heading two

      | Term | Meaning | Note |
      | core | the inner part | ــ |
      | shell | the outer part | ــ |
      • bold item and italic item.
      • Inline code: const x = 1;.
      • Formula: E = mc^2 and a^2 + b^2 = c^2.
      • Link: Spec.

      [^1]: A footnote that belongs at the bottom.

      Exercise

      Question: what is the core?
      Answer: it is the inner part.

      Dots..............more...............dots


      ------------------------

      Page separator follows.

      ---PAGEBREAK---

      Chapter 2 — The Shell Layer

      1. first item
      2. second item
      4. fourth item

      underscored emphasis_"
    `);
  });
  it('B. App.tsx first site (docx branch) — Arabic', () => {
    expect(B.fn(AR_MARKDOWN_FIXTURE)).toMatchInlineSnapshot(`
      "سورة الملك — التفسير

      الموضوع الأول: تفسير السور الطوال

      قال ابن عباس رضي الله عنهما في قوله تعالى ﴿تَبَارَكَ الَّذِي بِيَدِهِ الْمُلْكُ﴾: الملك التام بلا نقص.

      وجوه الإعراب في سورة الملك

      | الكلمة | الإعراب | العلة |
      | مَا تَرَىٰ | اسم مبتدأ | ــ |
      | تَفَاوُتٍ | مجرور | مِن زائدة |
      • مَن تَقُوتُ تصحيح شائع والصواب مِن تَفَاوُتٍ.
      • نص برمجي: codesample = "تفاوت".
      • معادلة: E = mc^2 و a^2 + b^2 = c^2.
      • رابط: المصحف للمراجعة.

      مِدَاد

      [^1]

      تمرين

      س: ثم أُسند التدبير للخيل

      ج: قيل: المراد الملائكة.

      فقط.......ثم...............................

      علوم القرآن هي .....

      والمراد من ذلك الجنس الصادق بـ

      الأرقام بالخط الهندي: ٠١٢٣٤٥٦٧٨٩ وبالخط الغربي: 0123456789

      السؤال: هل فهمت؟ الجواب: نعم.


      ------------------------

      146. وحينها

      ---PAGEBREAK---

      سورة النبأ ﴿لَّابِثِينَ فِيهَا أَحْقَابًا﴾

      الفقه الحنفي: بيع الحاضر للبادي

      راوية ابن ماجه والنساء الرجال.

      كفته نيتة.

      مِن تَقُوتُ

      الصفحة 22"
    `);
  });
  it('B. App.tsx first site (docx branch) — English', () => {
    expect(B.fn(EN_MARKDOWN_FIXTURE)).toMatchInlineSnapshot(`
      "Chapter 1 — Extraction Theory

      Heading two

      | Term | Meaning | Note |
      | core | the inner part | ــ |
      | shell | the outer part | ــ |
      • bold item and italic item.
      • Inline code: const x = 1;.
      • Formula: E = mc^2 and a^2 + b^2 = c^2.
      • Link: Spec.

      [^1]: A footnote that belongs at the bottom.

      Exercise

      Question: what is the core?
      Answer: it is the inner part.

      Dots..............more...............dots


      ------------------------

      Page separator follows.

      ---PAGEBREAK---

      Chapter 2 — The Shell Layer

      1. first item
      2. second item
      4. fourth item

      underscored emphasis_"
    `);
  });
  it('C. App.tsx second site (sample branch) — Arabic', () => {
    expect(C.fn(AR_MARKDOWN_FIXTURE)).toMatchInlineSnapshot(`
      "سورة الملك — التفسير

      الموضوع الأول: تفسير السور الطوال

      قال ابن عباس رضي الله عنهما في قوله تعالى ﴿تَبَارَكَ الَّذِي بِيَدِهِ الْمُلْكُ﴾: الملك التام بلا نقص.

      وجوه الإعراب في سورة الملك

      | الكلمة | الإعراب | العلة |
      | مَا تَرَىٰ | اسم مبتدأ | ــ |
      | تَفَاوُتٍ | مجرور | مِن زائدة |
      • مَن تَقُوتُ تصحيح شائع والصواب مِن تَفَاوُتٍ.
      • نص برمجي: codesample = "تفاوت".
      • معادلة: E = mc^2 و a^2 + b^2 = c^2.
      • رابط: المصحف للمراجعة.

      مِدَاد

      [^1]

      تمرين

      س: ثم أُسند التدبير للخيل

      ج: قيل: المراد الملائكة.

      فقط.......ثم...............................

      علوم القرآن هي .....

      والمراد من ذلك الجنس الصادق بـ

      الأرقام بالخط الهندي: ٠١٢٣٤٥٦٧٨٩ وبالخط الغربي: 0123456789

      السؤال: هل فهمت؟ الجواب: نعم.


      ------------------------

      146. وحينها

      ---PAGEBREAK---

      سورة النبأ ﴿لَّابِثِينَ فِيهَا أَحْقَابًا﴾

      الفقه الحنفي: بيع الحاضر للبادي

      راوية ابن ماجه والنساء الرجال.

      كفته نيتة.

      مِن تَقُوتُ

      الصفحة 22"
    `);
  });
  it('D. OutputViewer.tsx (prop form) — Arabic', () => {
    expect(D.fn(AR_MARKDOWN_FIXTURE)).toMatchInlineSnapshot(`
      "سورة الملك — التفسير

      الموضوع الأول: تفسير السور الطوال

      قال ابن عباس رضي الله عنهما في قوله تعالى ﴿تَبَارَكَ الَّذِي بِيَدِهِ الْمُلْكُ﴾: الملك التام بلا نقص.

      وجوه الإعراب في سورة الملك

      | الكلمة | الإعراب | العلة |
      | مَا تَرَىٰ | اسم مبتدأ | ــ |
      | تَفَاوُتٍ | مجرور | مِن زائدة |

      - مَن تَقُوتُ تصحيح شائع والصواب مِن تَفَاوُتٍ.
      - نص برمجي: .
      - معادلة: E = mc^2 و a^2 + b^2 = c^2.
      - رابط: [المصحف](https://quran.com) للمراجعة.

      مِدَاد

      [^1]

      تمرين

      س: ثم أُسند التدبير للخيل

      ج: قيل: المراد الملائكة.

      فقط.......ثم...............................

      علوم القرآن هي .....

      والمراد من ذلك الجنس الصادق بـ

      الأرقام بالخط الهندي: ٠١٢٣٤٥٦٧٨٩ وبالخط الغربي: 0123456789

      السؤال: هل فهمت؟ الجواب: نعم.


      ------------------------

      146. وحينها

      ---PAGE_BREAK---

      سورة النبأ ﴿لَّابِثِينَ فِيهَا أَحْقَابًا﴾

      الفقه الحنفي: بيع الحاضر للبادي

      راوية ابن ماجه والنساء الرجال.

      كفته نيتة.

      مِن تَقُوتُ

      الصفحة 22
      "
    `);
  });
  it('E. server.ts (const plainText) — Arabic', () => {
    expect(E.fn(AR_MARKDOWN_FIXTURE)).toMatchInlineSnapshot(`
      "سورة الملك — التفسير

      الموضوع الأول: تفسير السور الطوال

      قال ابن عباس رضي الله عنهما في قوله تعالى ﴿تَبَارَكَ الَّذِي بِيَدِهِ الْمُلْكُ﴾: الملك التام بلا نقص.

      وجوه الإعراب في سورة الملك

      | الكلمة | الإعراب | العلة |
      | مَا تَرَىٰ | اسم مبتدأ | ــ |
      | تَفَاوُتٍ | مجرور | مِن زائدة |
      • مَن تَقُوتُ تصحيح شائع والصواب مِن تَفَاوُتٍ.
      • نص برمجي: codesample = "تفاوت".
      • معادلة: E = mc^2 و a^2 + b^2 = c^2.
      • رابط: المصحف للمراجعة.

      مِدَاد

      [^1]

      تمرين

      س: ثم أُسند التدبير للخيل

      ج: قيل: المراد الملائكة.

      فقط.......ثم...............................

      علوم القرآن هي .....

      والمراد من ذلك الجنس الصادق بـ

      الأرقام بالخط الهندي: ٠١٢٣٤٥٦٧٨٩ وبالخط الغربي: 0123456789

      السؤال: هل فهمت؟ الجواب: نعم.


      ------------------------

      146. وحينها

      ---PAGEBREAK---

      سورة النبأ ﴿لَّابِثِينَ فِيهَا أَحْقَابًا﴾

      الفقه الحنفي: بيع الحاضر للبادي

      راوية ابن ماجه والنساء الرجال.

      كفته نيتة.

      مِن تَقُوتُ

      الصفحة 22"
    `);
  });
  it('E. server.ts (const plainText) — English', () => {
    expect(E.fn(EN_MARKDOWN_FIXTURE)).toMatchInlineSnapshot(`
      "Chapter 1 — Extraction Theory

      Heading two

      | Term | Meaning | Note |
      | core | the inner part | ــ |
      | shell | the outer part | ــ |
      • bold item and italic item.
      • Inline code: const x = 1;.
      • Formula: E = mc^2 and a^2 + b^2 = c^2.
      • Link: Spec.

      [^1]: A footnote that belongs at the bottom.

      Exercise

      Question: what is the core?
      Answer: it is the inner part.

      Dots..............more...............dots


      ------------------------

      Page separator follows.

      ---PAGEBREAK---

      Chapter 2 — The Shell Layer

      1. first item
      2. second item
      4. fourth item

      underscored emphasis_"
    `);
  });
});

describe('1b. do the five copies agree? (decides whether merging is a behavior change)', () => {
  it('A === B on Arabic', () => {
    expect(A.fn(AR_MARKDOWN_FIXTURE)).toBe(B.fn(AR_MARKDOWN_FIXTURE));
  });
  it('A === E on Arabic — the server chain agrees with the client chain', () => {
    expect(A.fn(AR_MARKDOWN_FIXTURE)).toBe(E.fn(AR_MARKDOWN_FIXTURE));
  });

  // OutputViewer is NOT a copy of the converter chain. It is a different transform
  // that happens to be spelled similarly, so it must never be merged into the shared
  // owner without an explicit, separately authorized decision. Pinned as divergent.
  it('A !== D on Arabic — OutputViewer DIVERGES (pinned, not fixed)', () => {
    expect(A.fn(AR_MARKDOWN_FIXTURE)).not.toBe(D.fn(AR_MARKDOWN_FIXTURE));
  });

  it('records precisely how A and D diverge', () => {
    const input = [
      '# عنوان',
      'نص مع **عريض** و *مائل* و _شرطة_ و `كود` و $x^2$',
      '- عنصر قائمة',
      '```',
      'block',
      '```',
    ].join('\n');
    expect({ input, A: A.fn(input), D: D.fn(input) }).toMatchInlineSnapshot(`
      {
        "A": "عنوان
      نص مع عريض و مائل و شرطة و كود و x^2
      • عنصر قائمة
      \`\`
      block
      \`\`",
        "D": "عنوان
      نص مع عريض و مائل و _شرطة_ و  و x^2
      - عنصر قائمة

      block
      ",
        "input": "# عنوان
      نص مع **عريض** و *مائل* و _شرطة_ و \`كود\` و $x^2$
      - عنصر قائمة
      \`\`\`
      block
      \`\`\`",
      }
    `);
  });
});

describe('1c. source provenance', () => {
  // Line numbers are deliberately NOT pinned here.
  //
  // An earlier version of this test recorded the start/end line of each extracted
  // chain. It failed on every unrelated edit above the chain, which is the exact
  // failure mode this harness exists to avoid: a line-keyed expectation reports a
  // problem for a structural move that changed nothing about the transform. It was
  // refreshed more than once for pure line drift. The chains are located by content
  // anchor, so the anchors above are the real provenance; these bounds are asserted
  // only as a sanity check that the slice is non-degenerate.
  it('extracts a non-degenerate slice for each copy', () => {
    for (const chain of [A, B, C, D, E]) {
      expect(chain.endLine).toBeGreaterThanOrEqual(chain.startLine);
      expect(chain.source).toContain('.replace(');
      expect(chain.fn('نص `كود`')).not.toBe(chain.fn(''));
    }
  });

});