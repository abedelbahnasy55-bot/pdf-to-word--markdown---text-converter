# -*- coding: utf-8 -*-
"""اختبار فصل الخيارات المدمجة — يمنع عودة عطل «الاختيارات اللازقة»."""

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

from docx_engine import explode  # noqa: E402


class ExplodeTests(unittest.TestCase):
    def test_dash_before_digit(self):
        """نمط الكتب المصرية: -١ … -٢ … داخل سطر واحد."""
        s = "-١ ﴿قُلْ هُوَ اللَّهُ أَحَدٌ﴾ [الإخلاص: 1]. -٢ ﴿قُلْ أَعُوذُ بِرَبِّ الْفَلَقِ﴾ [الفلق: 1]."
        out = explode(s)
        self.assertEqual(len(out), 2, out)
        self.assertTrue(out[0].startswith("١- "), out[0])
        self.assertTrue(out[1].startswith("٢- "), out[1])
        self.assertTrue(out[0].endswith("]"), out[0])

    def test_digit_before_dash(self):
        s = "1- جائز 2- واجب 3- كثير 4- ممتنع."
        out = explode(s)
        self.assertEqual(len(out), 4, out)
        self.assertEqual([x.split("-")[0] for x in out], ["1", "2", "3", "4"])

    def test_letters_options_untouched(self):
        s = "(أ) الآية المشتملة على كلمتين، قوله تعالى:"
        self.assertEqual(explode(s), [s])

    def test_single_option_untouched(self):
        s = "٢- ضع علامة (✓) أمام العبارة الصحيحة."
        self.assertEqual(explode(s), [s])
