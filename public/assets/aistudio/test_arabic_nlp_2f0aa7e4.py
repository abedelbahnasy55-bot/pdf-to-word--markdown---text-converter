# -*- coding: utf-8 -*-
"""اختبار التطبيع الآمن: إزالة bidi controls، presentation forms، حفظ الترتيب."""

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

from arabic_nlp import (  # noqa: E402
    normalize_unicode,
    retention_ratio,
    strip_bidi_controls,
    unify_presentation_forms,
)


class NormalizeUnicodeTests(unittest.TestCase):
    def test_bidi_controls_removed(self):
        raw = "كلمة\u202a مرتبة\u202c ونهاية\u2066 هنا\u2069 يسار\u200e وآخر\u200f."
        self.assertEqual(
            strip_bidi_controls(raw),
            "كلمة مرتبة ونهاية هنا يسار وآخر.",
        )

    def test_lro_rlo_removed(self):
        self.assertEqual(strip_bidi_controls("أ\u202dب\u202eج"), "أبج")

    def test_presentation_forms_become_standard(self):
        # U+FEE3 = presentation form لـ «م»
        self.assertEqual(unify_presentation_forms("\ufee3\ufee5"), "من")

    def test_logical_order_preserved(self):
        s = "قال: همزة الوصل في أول الكلمة."
        self.assertEqual(normalize_unicode(s), s)

    def test_diacritics_preserved(self):
        s = "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ"
        self.assertEqual(normalize_unicode(s), s)

    def test_letters_not_reordered(self):
        s = "لما يأتي بعد الهمزة"
        self.assertEqual(normalize_unicode(s), s)

    def test_nfc_applied(self):
        import unicodedata

        s = "لا بأس"
        self.assertEqual(normalize_unicode(s), unicodedata.normalize("NFC", s))

    def test_mixed_bidi_and_forms(self):
        raw = "\u202b\ufee3\ufee5\u202c"
        self.assertEqual(normalize_unicode(raw), "من")

    def test_retention_ratio(self):
        self.assertAlmostEqual(retention_ratio("a b c d", "a b c"), 0.75)
        self.assertEqual(retention_ratio("", ""), 1.0)


if __name__ == "__main__":
    unittest.main()
