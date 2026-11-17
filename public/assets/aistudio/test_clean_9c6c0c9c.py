# -*- coding: utf-8 -*-
"""اختبارات التنظيف — لا تحتاج شبكة ولا OCR."""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import clean_md  # noqa: E402


RAW = """ترويسة الكتاب
---PAGEBREAK---
ترويسة الكتاب
١٢
هذا سطر طويل في أول فقرة ويجب أن يبقى كما هو تقريبًا.
وهذا سطر مكسور من
العملية السابقة يجب أن يُدمج مع ما قبله.

---PAGEBREAK---
ترويسة الكتاب
١٣
## عنوان موجود
الباب الأول
هذا نصّ عادي يستمر هنا.

١٢٣
---PAGEBREAK---
ترويسة الكتاب
١٤
| العمود الأول | العمود الثاني |
|---|---|
| أ | ب |
"""


class CleanTests(unittest.TestCase):
    def test_running_headers_and_page_numbers_removed(self):
        body, rep = clean_md.clean(RAW)
        self.assertNotIn("ترويسة الكتاب", body)
        self.assertNotIn("\n١٢\n", body)
        self.assertGreaterEqual(rep["removed"], 1)

    def test_merge_wrapped_lines(self):
        body, _ = clean_md.clean(RAW)
        self.assertIn("وهذا سطر مكسور من العملية السابقة", body)

    def test_heading_promotion(self):
        body, rep = clean_md.clean(RAW)
        self.assertIn("# الباب الأول", body)
        self.assertIn("## عنوان موجود", body)
        self.assertGreaterEqual(rep["headings"], 1)

    def test_table_kept(self):
        body, _ = clean_md.clean(RAW)
        self.assertIn("| العمود الأول | العمود الثاني |", body)

    def test_metrics(self):
        _, rep = clean_md.clean(RAW)
        self.assertEqual(rep["pages"], 4)
        self.assertGreater(rep["chars"], 50)
        self.assertLessEqual(rep["chars_per_page"], 2000)


class LatexTests(unittest.TestCase):
    def test_symbols_and_noise(self):
        raw = "ضع علامة $\\checkmark$ و$\\times$ هنا $\\quad$ وبعدها.\n$: \\text{¿?¿?}$\n"
        body, _ = clean_md.clean(raw)
        self.assertIn("✓", body)
        self.assertIn("✗", body)
        self.assertNotIn("quad", body)
        self.assertNotIn("¿", body)

    def test_punctuation_spacing(self):
        body, _ = clean_md.clean("الجملة ،والخبر هنا.\n")
        self.assertIn("الجملة، والخبر", body)

    def test_hamza_and_punct_normalization(self):
        self.assertEqual(
            clean_md.normalize_punct("ذهب الي المدرسة ،وقال ان فيه خلافا ."),
            "ذهب إلى المدرسة، وقال إن فيه خلافا.",
        )
        # فراغات الإجابة الطويلة لا تُقصَّر إلى نقاط حذف
        self.assertIn("....................", clean_md.normalize_punct("اكتب .................... هنا"))
        # فواصل الشعر القصيرة تبقى
        self.assertIn(" .. ", clean_md.normalize_punct("صدر البيت .. عجز البيت"))

    def test_icon_noise_removed(self):
        raw = "[صورة: أيقونة مثال] مثال\n3 من مفكوك $(س + 1)^8$\n"
        body, _ = clean_md.clean(raw)
        self.assertNotIn("أيقونة", body)
        self.assertNotIn("[صورة", body)
        self.assertIn("**مثال**", body)

    def test_row_lines_kept_separate(self):
        raw = "Reduce /decrease        يقلل من        Challenge\nProve                  يثبت\n"
        body, _ = clean_md.clean(raw)
        self.assertIn("Reduce /decrease", body)
        self.assertNotIn("Challenge Prove", body)
        self.assertGreaterEqual(len([p for p in body.split("\n\n") if p.strip()]), 2)

    def test_math_arabic_comma_repaired(self):
        raw = "$\\vec{أ} \\، \\ \\vec{ب}$\n"
        body, _ = clean_md.clean(raw)
        self.assertNotIn("\\،", body)
        self.assertIn("vec{أ}", body)

    def test_presentation_forms_unified(self):
        body, _ = clean_md.clean("ﯾﻘﻠﻞ ﻣﻦ\n")
        self.assertIn("يقلل", body)

    def test_code_fence_with_text_removed(self):
        body, _ = clean_md.clean("```textسطر\nنصّ عادي\n")
        self.assertNotIn("```", body)

    def test_solo_diacritics_dropped(self):
        body, _ = clean_md.clean("\u064e\u0650\u064f\nسطر عادي\n")
        self.assertIn("سطر عادي", body)
        self.assertNotIn("\u064e\u0650\u064f", body)

    def test_currency_dollars_escaped(self):
        body, _ = clean_md.clean("سعرها $77 million in 1972 to $ هنا\n")
        self.assertNotIn("$77 million in 1972 to $", body)
        self.assertIn("&#36;77", body)

    def test_real_math_kept(self):
        body, _ = clean_md.clean("المعادلة $س^2 + 1$ صحيحة\n")
        self.assertIn("$س^2 + 1$", body)

    def test_repeated_image_lines_survive(self):
        raw = "\n---PAGEBREAK---\n".join(
            f"نص صفحة {i}\n![صفحة {i}](images/page-{i}.png)" for i in range(1, 7)
        )
        body, _ = clean_md.clean(raw)
        self.assertEqual(body.count("!["), 6)

    def test_currency_split_across_lines_escaped(self):
        body, _ = clean_md.clean("سعرها $77 million in 1972 to\n$60,000 in lieu\n")
        self.assertNotIn("$77", body)
        self.assertIn("&#36;77", body)

    def test_unbalanced_dollar_escaped(self):
        body, _ = clean_md.clean("سطر فيه $ فقط\n")
        self.assertNotIn("$", body)
        self.assertIn("&#36;", body)


if __name__ == "__main__":
    unittest.main()
