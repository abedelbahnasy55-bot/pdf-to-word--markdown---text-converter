# -*- coding: utf-8 -*-
"""اختبارات البوابات الصلبة: ترقيم + وصل/قطع + أسماء الدروس + جداول.

تغطي هدف P1: مسافات الترقيم وهمزة الوصل/القطع وأسماء الدروس فحوص صلبة
تفشل الاعتماد على مدخلات معيبة، مع قائمة بيضاء ضيقة (شعر/حذف/فراغات)
لا تكسر البوكليتات السليمة، والفولباك البصري غير الصامت.
"""

import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

from clean_md import normalize_hamza, normalize_punct  # noqa: E402
from docx_engine import render_booklet, split_numbered  # noqa: E402
from qa_gates import md_metrics, table_problems  # noqa: E402

QA = ROOT / "scripts" / "qa_gates.py"

LONG_A = (
    "هذه فقرة عربية طويلة للتجربة، فيها شرح مفصل للنحو العربي "
    "ونماذج تطبيقية على القواعد مع أمثلة من الحياة اليومية "
    "التي تساعد الطالب على فهم الدرس واستيعابه بشكل كامل."
)
LONG_B = (
    "وهذه فقرة ثانية مكملة للتجربة، تتضمن تدريبات متنوعة على البلاغة "
    "والصرف مع أسئلة اختيار من متعدد وإعراب كامل للجمل "
    "والعبارات المعقدة في المنهج الدراسي المعتمد."
)


def _clean_md(defect: str = "") -> str:
    extra = f"\n\n{defect}" if defect else ""
    return (
        "# كتاب تجريبي\n\n## الفصل الأول\n\n"
        + LONG_A
        + "\n\n"
        + LONG_B
        + extra
        + "\n\n| الاسم | القيمة |\n|---|---|\n| ألف | ١ |\n| باء | ٢ |\n"
    )


def _run_qa(md_text: str):
    with tempfile.TemporaryDirectory() as td:
        base = Path(td)
        md = base / "book.md"
        md.write_text(md_text, encoding="utf-8")
        dummy = base / "input.pdf"
        dummy.write_bytes(b"%PDF-1.4 dummy")
        r = subprocess.run(
            [
                sys.executable,
                str(QA),
                "--input",
                str(dummy),
                "--md",
                str(md),
                "--input-pages",
                "1",
                "--output-pages",
                "1",
            ],
            capture_output=True,
            text=True,
            timeout=120,
        )
        return r.returncode, r.stdout + r.stderr


class StrictNumberingTests(unittest.TestCase):
    def test_two_digit_and_dash_first(self):
        self.assertEqual(split_numbered("10- هات المثال")[0], "10")
        self.assertEqual(split_numbered("-3 عَلِّل لما يأتي:")[0], "3")
        self.assertEqual(split_numbered("١- عرّف الحقيقة")[0], "١")

    def test_verse_reference_is_not_a_number(self):
        self.assertIsNone(split_numbered("﴿قُلْ هُوَ اللَّهُ أَحَدٌ﴾ [الإخلاص: 1]"))


class HamzaTests(unittest.TestCase):
    def test_fixes_and_protects(self):
        self.assertIn("إلى", normalize_hamza("ذهب الي المدرسة"))
        self.assertIn("إذا", normalize_hamza("ذهب اذا وصل"))
        self.assertIn("الشيطان", normalize_hamza("الشيطان حاضر"))
        self.assertIn("اليمن", normalize_hamza("اليمن بلاد عربية"))

    def test_cleaner_fixes_punct_and_hamza(self):
        fixed = normalize_punct("ذهب الي المدرسة ،وقال ان فيه خلافا .")
        self.assertEqual(fixed, "ذهب إلى المدرسة، وقال إن فيه خلافا.")
        self.assertEqual(md_metrics(fixed)["punct_issues"], 0)
        self.assertEqual(md_metrics(fixed)["hamza_issues"], 0)


class LessonNamesTests(unittest.TestCase):
    def test_real_names_pass_placeholder_zero(self):
        md = "## 1. السيوطي في البلاغة\n\n## 2. النحو والصرف\n"
        self.assertEqual(md_metrics(md)["placeholder_headings"], 0)

    def test_placeholder_headings_detected(self):
        md = "## 1. الدرس 1\n\n## 2. أسئلة صفحة 12\n"
        self.assertEqual(md_metrics(md)["placeholder_headings"], 2)


class TableProblemsTests(unittest.TestCase):
    def test_unequal_and_empty_rows_fail(self):
        bad = "| أ | ب |\n|---|---|\n| ج |\n"
        self.assertTrue(table_problems(bad))
        empty = "| أ | ب |\n|---|---|\n| | |\n"
        self.assertTrue(table_problems(empty))

    def test_clean_table_passes(self):
        good = "| الاسم | القيمة |\n|---|---|\n| ألف | ١ |\n| باء | ٢ |\n"
        self.assertEqual(table_problems(good), [])


class PunctWhitelistTests(unittest.TestCase):
    def test_ellipsis_and_poetry_and_blanks_not_violations(self):
        self.assertEqual(md_metrics("صدر البيت .. عجز البيت")["punct_issues"], 0)
        self.assertEqual(md_metrics("> بيت من الشعر ... وعجز له")["punct_issues"], 0)
        self.assertEqual(md_metrics("اكتب .................... هنا")["punct_issues"], 0)

    def test_real_violation_still_counted(self):
        self.assertGreater(md_metrics("خلافا .")["punct_issues"], 0)
        self.assertGreater(md_metrics("الجملة ،والخبر هنا.")["punct_issues"], 0)


class HardGateE2ETests(unittest.TestCase):
    def test_clean_md_passes(self):
        code, out = _run_qa(_clean_md())
        self.assertEqual(code, 0, out[-500:])

    def test_punct_defect_fails_hard(self):
        code, out = _run_qa(_clean_md("الجملة ،كلمة مخالفة."))
        self.assertEqual(code, 1, out[-500:])
        self.assertIn("punct-spacing", out)

    def test_hamza_defect_fails_hard(self):
        code, out = _run_qa(_clean_md("ذهب الي المدرسة."))
        self.assertEqual(code, 1, out[-500:])
        self.assertIn("hamza-forms", out)

    def test_placeholder_defect_fails_hard(self):
        code, out = _run_qa(_clean_md("## 9. الدرس 9"))
        self.assertEqual(code, 1, out[-500:])
        self.assertIn("lesson-names", out)


class FallbackVisibleTests(unittest.TestCase):
    def _section_text(self, md: str) -> str:
        from docx import Document

        with tempfile.TemporaryDirectory() as td:
            src = Path(td) / "t.md"
            out = Path(td) / "t.docx"
            src.write_text(md, encoding="utf-8")
            render_booklet(src, out)
            return "\n".join(
                p.text for p in Document(out).paragraphs if p.style.name == "ArSection"
            )

    def test_fallback_is_visible_not_silent(self):
        text = self._section_text("## 1. الدرس 1\n\nسؤال تجريبي.\n")
        self.assertIn("الدرس الأول", text)
        self.assertIn("غير موثَّق", text)

    def test_real_lesson_name_no_suffix(self):
        text = self._section_text("## 1. السيوطي في البلاغة\n\nسؤال تجريبي.\n")
        self.assertIn("السيوطي", text)
        self.assertNotIn("غير موثَّق", text)


if __name__ == "__main__":
    unittest.main()
