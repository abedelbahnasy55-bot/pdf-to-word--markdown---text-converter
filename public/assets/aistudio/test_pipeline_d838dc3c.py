# -*- coding: utf-8 -*-
"""اختبار تكاملي بلا شبكة: بناء PDF تجريبي ثم تشغيل pipeline عبر --raw."""

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SAMPLE = """# كتاب تجريبي

## الفصل الأول

هذه فقرة عربية طويلة للتجربة، فيها كلمة <u>مسطّرة</u> وأخرى عادية،
وهذا سطر مكمل للفقرة السابقة.

| الاسم | القيمة |
|---|---|
| ألف | ١ |
| باء | ٢ |

> بيت من الشعر ... وعجز له

ثانيًا: أسئلة

(١) سؤال تجريبي؟ (٢) سؤال آخر.
"""


class PipelineTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.td = tempfile.TemporaryDirectory()
        cls.base = Path(cls.td.name)
        cls.md = cls.base / "sample.md"
        cls.md.write_text(SAMPLE, encoding="utf-8")
        cls.docx = cls.base / "sample.docx"
        cls.pdf = cls.base / "sample.pdf"
        r = subprocess.run(
            [
                sys.executable,
                str(ROOT / "scripts" / "build_book.py"),
                str(cls.md),
                str(cls.docx),
                "--profile",
                "booklet",
                "--title",
                "كتاب تجريبي",
                "--pdf",
            ],
            capture_output=True,
            text=True,
            timeout=300,
        )
        assert r.returncode == 0, r.stderr[-400:]

    @classmethod
    def tearDownClass(cls):
        cls.td.cleanup()

    def test_qa_passes(self):
        qa = self.base / "qa.json"
        r = subprocess.run(
            [
                sys.executable,
                str(ROOT / "scripts" / "qa_gates.py"),
                "--input",
                str(self.pdf),
                "--md",
                str(self.md),
                "--docx",
                str(self.docx),
                "--pdf-out",
                str(self.pdf),
                "--output-pages",
                "1",
                "--json",
                str(qa),
            ],
            capture_output=True,
            text=True,
            timeout=300,
        )
        self.assertEqual(r.returncode, 0, r.stdout[-500:])
        self.assertTrue(json.loads(qa.read_text(encoding="utf-8"))["pass"])

    def test_pipeline_with_raw(self):
        out = self.base / "out"
        r = subprocess.run(
            [
                sys.executable,
                str(ROOT / "scripts" / "pipeline.py"),
                str(self.pdf),
                "--out",
                str(out),
                "--raw",
                str(self.md),
            ],
            capture_output=True,
            text=True,
            timeout=600,
        )
        self.assertEqual(r.returncode, 0, (r.stdout + r.stderr)[-700:])
        rep = json.loads((out / "sample" / "report.json").read_text(encoding="utf-8"))
        self.assertTrue(rep["passed"])
        self.assertTrue((out / "sample" / "sample.docx").is_file())
        self.assertTrue((out / "sample" / "sample.pdf").is_file())


if __name__ == "__main__":
    unittest.main()
