# -*- coding: utf-8 -*-
"""اختبارات مدقّق الاقتباسات — تعمل بلا إنترنت وبلا ملفات المصحف الحقيقية."""

import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

import verify_quotes as vq  # noqa: E402


def make_corpus(td: Path) -> Path:
    data = {
        "data": {
            "surahs": [
                {
                    "number": 1,
                    "name": "سُورَةُ الفَاتِحَةِ",
                    "ayahs": [
                        {"numberInSurah": 1, "text": "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ"},
                        {"numberInSurah": 2, "text": "الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ"},
                    ],
                },
                {
                    "number": 112,
                    "name": "سُورَةُ الإِخْلَاصِ",
                    "ayahs": [
                        {"numberInSurah": 1, "text": "قُلْ هُوَ اللَّهُ أَحَدٌ"},
                        {"numberInSurah": 2, "text": "اللَّهُ الصَّمَدُ"},
                    ],
                },
            ]
        }
    }
    (td / "quran-simple.json").write_text(
        json.dumps(data, ensure_ascii=False), encoding="utf-8"
    )
    return td


class NormalizeTests(unittest.TestCase):
    def test_hamza_unified(self):
        self.assertEqual(vq.normalize_letters("أَحَد"), vq.normalize_letters("احد"))

    def test_numeric_tokens_dropped(self):
        self.assertEqual(vq.word_keys("قُلْ (١) هُوَ"), ["قل", "هو"])

    def test_parse_ref_arabic_digits(self):
        self.assertEqual(vq.Checker.parse_ref("البقرة: ٢٥٥"), ("البقرة", 255))

    def test_parse_ref_comma_list(self):
        self.assertEqual(vq.Checker.parse_ref("الحاقة: ٢٨، ٢٩"), ("الحاقة", 28))


class CorpusTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = make_corpus(Path(self.tmp.name))
        self.q = vq.Quran(self.dir)

    def tearDown(self):
        self.tmp.cleanup()

    def test_resolve_surah(self):
        self.assertEqual(self.q.resolve("الإخلاص"), 112)
        self.assertEqual(self.q.resolve("الاخلاص"), 112)

    def test_exact_span(self):
        span, cov = self.q.span(112, 1, vq.word_keys("قُلْ هُوَ اللَّهُ أَحَدٌ"))
        self.assertEqual(cov, 1.0)
        self.assertIn("أَحَدٌ", span)


class CheckerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        d = make_corpus(Path(self.tmp.name))
        self.q = vq.Quran(d)
        self.chk = vq.Checker(self.q, None, fix=False)

    def tearDown(self):
        self.tmp.cleanup()

    def _codes(self, body: str):
        p = Path(self.tmp.name) / "x.md"
        p.write_text(body, encoding="utf-8")
        self.chk.findings.clear()
        self.chk.check_file(p)
        return [f.code for f in self.chk.findings]

    def test_braces_detected(self):
        codes = self._codes("- {قُلْ هُوَ اللَّهُ أَحَدٌ}\n")
        self.assertIn("T001", codes)

    def test_correct_verse_clean(self):
        codes = self._codes("- ﴿قُلْ هُوَ اللَّهُ أَحَدٌ﴾ [الإخلاص: 1]\n")
        self.assertNotIn("Q001", codes)

    def test_wrong_letter_detected(self):
        codes = self._codes("- ﴿قُلْ هُوَ اللَّهُ أَحْمَدُ﴾ [الإخلاص: 1]\n")
        self.assertIn("Q001", codes)

    def test_wrong_tashkeel_detected(self):
        codes = self._codes("- ﴿قُلْ هُوَ اللَّهُ أَحَدُ﴾ [الإخلاص: 1]\n")
        self.assertIn("Q002", codes)

    def test_unbalanced_bold(self):
        codes = self._codes("سطر فيه **نجمة واحدة\n")
        self.assertIn("T006", codes)

    def test_space_before_comma(self):
        codes = self._codes("كلمة ، وكلمة أخرى\n")
        self.assertIn("T004", codes)


if __name__ == "__main__":
    unittest.main()
