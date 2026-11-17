# -*- coding: utf-8 -*-
"""inspect.py — تشخيص PDF قبل التحويل: طبقة نصّ؟ حجم؟ توصية بالمسار والقطع.

الاستخدام:
  python3 inspect.py book.pdf [--json report.json]
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

from common import pdf_pages, run

ARABIC = re.compile(r"[\u0600-\u06FF]")
REPLACEMENT = re.compile(r"[\uFFFD]")


def analyze(pdf: Path) -> dict:
    pages = pdf_pages(pdf)
    r = run(
        ["pdftotext", "-layout", "-enc", "UTF-8", str(pdf), "-"],
        timeout=300,
        check=False,
    )
    text = r.stdout if r.returncode == 0 else ""
    chunks = [p for p in text.split("\f") if p.strip()]
    chars = sum(len(p) for p in chunks)
    words = sum(len(p.split()) for p in chunks)
    n = max(1, pages)
    arabic = len(ARABIC.findall(text))
    letters = len(re.sub(r"\s", "", text))
    text_ok = chars / n >= 120 and words / n >= 25
    return {
        "file": str(pdf),
        "pages": pages,
        "size_mb": round(pdf.stat().st_size / 1e6, 2),
        "text_pages": len(chunks),
        "chars": chars,
        "words": words,
        "chars_per_page": round(chars / n),
        "words_per_page": round(words / n),
        "arabic_ratio": round(arabic / max(1, letters), 3),
        "replacement_chars": len(REPLACEMENT.findall(text)),
        "text_layer_ok": text_ok,
        "recommended_mode": "text" if text_ok else "ocr",
        "recommended_chunk": 10,
        "estimated_requests": max(1, (pages + 9) // 10),
        "recommended_profile": "book" if pages > 20 else "booklet",
        "warnings": [
            *([] if text_ok else ["لا طبقة نصّ سليمة ⇒ OCR"]),
            *(["حجم كبير (>100MB)"] if pdf.stat().st_size > 100e6 else []),
            *(["نسبة الاستبدال عالية"] if len(REPLACEMENT.findall(text)) > 50 else []),
        ],
    }


def main() -> int:
    ap = argparse.ArgumentParser(description="تشخيص PDF قبل التحويل")
    ap.add_argument("pdf", type=Path)
    ap.add_argument("--json", type=Path, default=None)
    args = ap.parse_args()
    if not args.pdf.is_file():
        print(f"⛔ غير موجود: {args.pdf}", file=sys.stderr)
        return 2
    rep = analyze(args.pdf)
    if args.json:
        args.json.write_text(
            json.dumps(rep, ensure_ascii=False, indent=1), encoding="utf-8"
        )
    print(f"📄 {args.pdf.name}")
    print(f"  الصفحات: {rep['pages']} · الحجم: {rep['size_mb']}MB")
    print(
        f"  نصّ: {rep['chars']} حرف · {rep['words']} كلمة · {rep['chars_per_page']}/صفحة"
    )
    print(f"  عربي: {rep['arabic_ratio']:.0%} · استبدال: {rep['replacement_chars']}")
    print(
        f"  المسار المقترح: {rep['recommended_mode']} · القطع: {rep['recommended_chunk']} · الطلبات: {rep['estimated_requests']}"
    )
    print(f"  التنسيق: {rep['recommended_profile']}")
    for w in rep["warnings"]:
        print(f"  ⚠️ {w}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
