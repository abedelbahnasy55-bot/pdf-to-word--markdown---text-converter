# -*- coding: utf-8 -*-
"""اختبار تراتب الأسئلة في البوكليت — يمنع عودة عطل «الرئيسي والفرعي معجونان».

البوكليتات المصرية ترقّم الأسئلة «١- ٢- ٣-» ولا تكتب «س1:»، فلم يكن يُلتقط
أيّ سؤال رئيسي، فتنزل كل البنود بأسلوب ArItem واحد بلا تراتب مرئي.
"""

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

from clean_md import PAGE_MARKERS, _cluster, fix_reversed_parens, latex_clean, norm_key  # noqa: E402
from docx_engine import explode, is_main_question, split_numbered  # noqa: E402


class SplitNumberedTests(unittest.TestCase):
    def test_digit_then_dash(self):
        self.assertEqual(split_numbered("1- تخير الإجابة")[0], "1")

    def test_arabic_indic(self):
        self.assertEqual(split_numbered("٣- علّل لما يأتي")[0], "٣")

    def test_dash_before_digit_with_space(self):
        """النمط «-3 علّل» كان يسقط في continuum ويلتصق بالفقرة السابقة."""
        self.assertEqual(split_numbered("-3 عَلِّل لما يأتي:"), ("3", "عَلِّل لما يأتي:"))

    def test_dot_and_paren_delimiters(self):
        self.assertIsNotNone(split_numbered("4. اذكر الحكم"))
        self.assertIsNotNone(split_numbered("5) هات المثال"))

    def test_verse_without_number_is_not_a_item(self):
        self.assertIsNone(split_numbered("﴿قُلْ هُوَ اللَّهُ أَحَدٌ﴾ [الإخلاص: 1]"))


class MainQuestionTests(unittest.TestCase):
    def test_command_verb_is_main(self):
        for s in (
            "تخير الإجابة الصحيحة مما يأتي:",
            "ضع علامة (✓) أمام العبارة الصحيحة:",
            "عَلِّل لما يأتي:",
            "اذكر الحكم الصرفي لما يأتي مع التمثيل:",
            "قال الشاعر صالح بن عبد القدوس:",
        ):
            self.assertTrue(is_main_question(s), s)

    def test_question_mark_is_main(self):
        self.assertTrue(is_main_question("متى يكون الإدغام واجبًا؟"))

    def test_verse_option_is_not_main(self):
        self.assertFalse(is_main_question("﴿قُلْ هُوَ اللَّهُ أَحَدٌ﴾ [الإخلاص: 1]"))

    def test_hadith_option_is_not_main(self):
        self.assertFalse(is_main_question("«لا يدخل الجنة قتات»"))

    def test_parenthesised_example_is_not_main(self):
        self.assertFalse(is_main_question("(يُصَام - يُصَدَّق - يَكْتُب)"))

    def test_bare_answer_word_is_not_main(self):
        self.assertFalse(is_main_question("جائز"))

    def test_more_command_verbs_are_main(self):
        for s in (
            "مَثِّل لما يأتي في جمل مفيدة:",
            "أدخل همزة الاستفهام على الجمل الآتية:",
            "اجمع الكلمات الآتية على صيغة منتهى الجموع:",
            "عَيِّن الشاهد ووضحه في قول الشاعر:",
            "يا بني، اعلم أن الإسلام رفض التبعية.",
            "أسند الأفعال الآتية إلى ضمائر الرفع المتحركة.",
            "يقال: من يحسن الجوانب التطبيقية يصل إلى الفهم.",
            "صِف ما يحدث في الكلمات الآتية.",
        ):
            self.assertTrue(is_main_question(s), s)

    def test_parenthesised_stem_with_colon_is_main(self):
        self.assertTrue(is_main_question("(حَلَّ - رَدَّ):"))


class ReversedParensTests(unittest.TestCase):
    def test_single_letter(self):
        self.assertEqual(fix_reversed_parens(")أ( قلب الواو"), "(أ) قلب الواو")

    def test_word(self):
        self.assertEqual(
            fix_reversed_parens("في: )اصطفاءات(، وصحتها"), "في: (اصطفاءات)، وصحتها"
        )

    def test_correct_parens_unchanged(self):
        s = "(أ) لا تدخل همزة الوصل في الحروف. ( )"
        self.assertEqual(fix_reversed_parens(s), s)

    def test_malformed_pagebreak_marker(self):
        self.assertTrue(PAGE_MARKERS.match("---PAGEBREAK->"))
        self.assertTrue(PAGE_MARKERS.match("---PAGEBREAK---"))


class ExplodeTests(unittest.TestCase):
    def test_two_choices_one_line(self):
        out = explode("1- ﴿آ﴾ [أ: 1] 2- ﴿ب﴾ [ب: 2]")
        self.assertEqual(len(out), 2)

    def test_dash_number_choices(self):
        out = explode("-1 جائز -2 واجب -3 كثير -4 ممتنع.")
        self.assertEqual(len(out), 4)


class FakeMathTests(unittest.TestCase):
    def test_verse_wrapped_as_math_unwrapped(self):
        s = r"$\left\langle\text{لَمْ يَلِدْ}\right\rangle$"
        self.assertEqual(latex_clean(s), "﴿لَمْ يَلِدْ﴾")

    def test_real_math_kept(self):
        self.assertIn("$س^2 + 1$", latex_clean("المعادلة $س^2 + 1$ صحيحة"))


class RunningHeaderClusterTests(unittest.TestCase):
    def test_page_number_is_stripped_from_key(self):
        a = norm_key("الصرف الميسر للصف الثالث الثانوي 165")
        b = norm_key("١٢٨ الصرف الميسر للصف الثالث الثانوي")
        self.assertEqual(a, b)

    def test_ocr_variant_clusters_with_correct_spelling(self):
        """«الرصف امليرس» رسمٌ خاطئ لنفس الترويسة؛ يجب أن يُعدّ معها."""
        good = norm_key("الصرف الميسر للصف الثالث الثانوي")
        bad = norm_key("الرصف امليرس للصف الثالث الثانوي")
        owner = _cluster([good, bad])
        self.assertEqual(owner[good], owner[bad])

    def test_unrelated_lines_do_not_cluster(self):
        a = norm_key("تخير الإجابة الصحيحة مما يأتي")
        b = norm_key("علّل لما يأتي")
        owner = _cluster([a, b])
        self.assertNotEqual(owner[a], owner[b])


if __name__ == "__main__":
    unittest.main()


class SMainRenderTests(unittest.TestCase):
    def test_numbered_items_under_s_label_are_not_mains(self):
        import tempfile
        from docx import Document
        from docx_engine import render_booklet
        md = "# بوكليت تجريبي\n\n## 1. الدرس 1\n\nس١: أجب عن الأسئلة الآتية:\n١- عرّف الحقيقة اللغوية.\n٢- اذكر شروط النقل.\nس٢: بين المجاز فيما يلي:\n١- قوله تعالى: ﴿آية﴾.\n١٠- قول الشاعر:\nبيت شعر هنا.\n"
        with tempfile.TemporaryDirectory() as td:
            src = Path(td) / "t.md"
            out = Path(td) / "t.docx"
            src.write_text(md, encoding="utf-8")
            render_booklet(src, out)
            paras = Document(out).paragraphs
            mains = [p.text for p in paras if p.style.name == "ArQuestion"]
            self.assertEqual(len(mains), 2, mains)
            items = [p.text for p in paras if p.style.name == "ArItem"]
            self.assertTrue(any("عرّف الحقيقة" in t for t in items), items)
            self.assertTrue(any("قول الشاعر" in t for t in items), items)

    def test_explode_spaced_dash_options(self):
        # OCR يكتب «1 - … 2 - …» بمسافات حول الشرطة
        from docx_engine import explode
        parts = explode("1 - كُن للقرآن الكريم تاليًا. 2 - اعتَنِ بالسنة النبوية مُتَدَبِّرًا. 3 - تأمل من الشعر العربي نصًّا هادفًا. 4 - كَتَبَ التاريخ الإسلامي حافلة بالبطولات.")
        self.assertEqual(len(parts), 4, parts)
        self.assertIn("كُن للقرآن", parts[0])
        self.assertIn("حافلة بالبطولات", parts[3])
