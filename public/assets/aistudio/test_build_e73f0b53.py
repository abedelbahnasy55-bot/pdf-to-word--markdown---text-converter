# -*- coding: utf-8 -*-
"""اختبار بناء DOCX — يتحقق من الفقرات والجداول والتسطير والاتجاه."""

import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

SAMPLE = """# كتاب تجريبي

## الفصل الأول

هذه فقرة عربية للتجربة، فيها كلمة <u>مسطّرة</u> وأخرى عادية.

| الاسم | القيمة |
|---|---|
| ألف | ١ |
| باء | ٢ |

> بيت من الشعر ... وعجز له
"""


class BuildTests(unittest.TestCase):
    def test_build_docx(self):
        with tempfile.TemporaryDirectory() as td:
            md = Path(td) / "sample.md"
            md.write_text(SAMPLE, encoding="utf-8")
            out = Path(td) / "sample.docx"
            r = subprocess.run(
                [
                    sys.executable,
                    str(ROOT / "scripts" / "build_book.py"),
                    str(md),
                    str(out),
                    "--profile",
                    "booklet",
                    "--title",
                    "كتاب تجريبي",
                ],
                capture_output=True,
                text=True,
                timeout=300,
            )
            self.assertEqual(r.returncode, 0, r.stderr[-300:])
            self.assertTrue(out.is_file())

            from docx import Document

            d = Document(str(out))
            text = "\n".join(p.text for p in d.paragraphs)
            self.assertIn("فقرة عربية", text)
            self.assertGreaterEqual(len(d.tables), 1)
            underlined = [r for p in d.paragraphs for r in p.runs if r.underline]
            self.assertTrue(any("مسطّرة" in r.text for r in underlined))
            self.assertNotIn("<u>", text)


if __name__ == "__main__":
    unittest.main()
