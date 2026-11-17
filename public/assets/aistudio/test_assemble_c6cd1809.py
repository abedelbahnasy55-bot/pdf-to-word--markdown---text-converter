# -*- coding: utf-8 -*-
"""اختبار تجميع raw من state (بلا OCR ولا شبكة)."""

import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import assemble_raw  # noqa: E402


class AssembleTests(unittest.TestCase):
    def test_parse_state_pages(self):
        state = {
            "chunks": {
                "book_p0001-0002.pdf": {
                    "text": "==Start of OCR for page 1==\nنصّ الأولى\n"
                    "==Start of OCR for page 2==\nنصّ الثانية\n"
                },
                "book_p0003-0003.pdf": {"text": "==Start of OCR for page 3==\nنصّ الثالثة"},
            }
        }
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "s.json"
            p.write_text(json.dumps(state, ensure_ascii=False), encoding="utf-8")
            pages, done = assemble_raw.parse_state(p)
        self.assertEqual(sorted(pages), [1, 2, 3])
        self.assertIn("الأولى", pages[1])
        self.assertEqual(len(done), 2)


if __name__ == "__main__":
    unittest.main()
