# -*- coding: utf-8 -*-
"""اختبار Gemini Quality Gate بلا شبكة: parser + تحقق التصحيحات."""

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

import gemini_quality_gate as gate  # noqa: E402


class QualityGateTests(unittest.TestCase):
    def test_parse_json_fence(self):
        raw = '```json\n{"corrections":[{"line":2,"old":"مهزة","new":"همزة","reason":"خطأ"}]}\n```'
        out = gate.parse_response(raw)
        self.assertEqual(
            out, [{"line": 2, "old": "مهزة", "new": "همزة", "reason": "خطأ"}]
        )

    def test_parse_unfenced_json_with_noise(self):
        raw = 'prefix {"corrections":[{"line":1,"old":"X","new":"Y"}]} suffix'
        out = gate.parse_response(raw)
        self.assertEqual(out[0]["new"], "Y")

    def test_parse_invalid_raises(self):
        with self.assertRaises(ValueError):
            gate.parse_response("not json")

    def test_validate_applies_only_exact_unique_match(self):
        text = "سطر صحيح\nهذا مهزة ويجب تصحيحها\n"
        out, applied, rejected = gate.validate_and_apply(
            text, [{"line": 2, "old": "مهزة", "new": "همزة", "reason": "خطأ"}]
        )
        self.assertIn("همزة", out)
        self.assertEqual(len(applied), 1)
        self.assertEqual(rejected, [])

    def test_validate_rejects_text_drift(self):
        text = "سطر\nمهزة مهزة\n"
        _, applied, rejected = gate.validate_and_apply(
            text, [{"line": 2, "old": "مهزة", "new": "همزة", "reason": "خطأ"}]
        )
        self.assertEqual(len(applied), 0)
        self.assertEqual(len(rejected), 1)

    def test_validate_rejects_huge_rewrite(self):
        text = "هذا سطر قصير\n"
        _, applied, rejected = gate.validate_and_apply(
            text,
            [{"line": 1, "old": "قصير", "new": "كلمة أطول بكثير " * 5, "reason": "x"}],
        )
        self.assertEqual(len(applied), 0)
        self.assertEqual(len(rejected), 1)


if __name__ == "__main__":
    unittest.main()
