# -*- coding: utf-8 -*-
"""اختبار الرياضيات: توحيد التوافيق/الأرقام وبناء OMML."""

import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import clean_md  # noqa: E402

MD = "# رياضيات\n\n$ح_{ر+١} = {}^{ن}ق_{ر} + س^{٢}$\n\n$$\\frac{١}{٢} = 0.5$$\n\n$$\\begin{vmatrix} ١ & ٢ \\\\ ٣ & ٤ \\end{vmatrix}$$\n"


class MathTests(unittest.TestCase):
    def test_clean_math(self):
        body, _ = clean_md.clean(MD)
        self.assertIn(r"\binom{ن}{ر}", body)
        self.assertIn("س^{2}", body)
        self.assertNotIn("١", body)
        self.assertIn("\\left|\\begin{matrix}", body)

    def test_omml_build(self):
        with tempfile.TemporaryDirectory() as td:
            md = Path(td) / "math.md"
            md.write_text(clean_md.clean(MD)[0], encoding="utf-8")
            out = Path(td) / "math.docx"
            r = subprocess.run(
                [
                    sys.executable,
                    str(ROOT / "scripts" / "build_book.py"),
                    str(md),
                    str(out),
                    "--profile",
                    "booklet",
                    "--math",
                    "pandoc",
                ],
                capture_output=True,
                text=True,
                timeout=300,
            )
            self.assertEqual(r.returncode, 0, r.stderr[-300:])
            xml = zipfile.ZipFile(out).read("word/document.xml").decode("utf-8")
            self.assertIn("<m:oMath", xml)
            self.assertNotIn("$", xml)


if __name__ == "__main__":
    unittest.main()
