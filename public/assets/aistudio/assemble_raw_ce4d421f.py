# -*- coding: utf-8 -*-
"""assemble_raw.py — يجمع نصّ OCR المكتمل من state.json ويُكمل الصفحات الناقصة محليًا.

يُستخدم عند نفاد حصة Gemini في منتصف كتاب: لا نُهدر الأجزاء المكتملة،
ونُكمل الباقي بـTesseract، ثم نبني الكتاب من raw.md الناتج.

الاستخدام:
  python3 assemble_raw.py book.pdf --state work/book.state.json --out book.raw.md
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

PAGE_RE = re.compile(r"==\s*Start of OCR for page\s+(\d+)\s*==", re.I)
RANGE_RE = re.compile(r"_p(\d{4})-(\d{4})\.pdf$")


def parse_state(state: Path) -> tuple[dict[int, str], list[tuple[int, int]]]:
    data = json.loads(state.read_text(encoding="utf-8"))
    pages: dict[int, str] = {}
    done: list[tuple[int, int]] = []
    for name, chunk in (data.get("chunks") or {}).items():
        text = chunk.get("text") if isinstance(chunk, dict) else str(chunk)
        m = RANGE_RE.search(name)
        if not text or not m:
            continue
        start, end = int(m.group(1)), int(m.group(2))
        done.append((start, end))
        hits = list(PAGE_RE.finditer(text))
        for i, hit in enumerate(hits):
            page_no = int(hit.group(1))
            body = text[hit.end() : hits[i + 1].start() if i + 1 < len(hits) else None]
            body = body.strip()
            if body:
                pages[page_no] = body
    return pages, sorted(done)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", type=Path)
    ap.add_argument("--state", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--dpi", type=int, default=200)
    ap.add_argument("--lang", default="ara")
    args = ap.parse_args()

    import fitz

    doc = fitz.open(args.pdf)
    total = doc.page_count
    doc.close()

    pages, done = parse_state(args.state)
    missing = [p for p in range(1, total + 1) if p not in pages]
    print(
        f"  📦 مكتمل من Gemini: {len(pages)}/{total} صفحة "
        f"({len(done)} مقطعًا) · ناقص: {len(missing)}",
        flush=True,
    )

    if missing:
        from local_ocr import page_text

        for n, p in enumerate(missing, 1):
            _, text = page_text(str(args.pdf), p - 1, args.dpi, args.lang, "3")
            if text.strip():
                pages[p] = text.strip()
            if n % 10 == 0 or n == len(missing):
                print(f"    محلي {n}/{len(missing)}", flush=True)

    body = "\n---PAGEBREAK---\n".join(pages.get(p, "") for p in range(1, total + 1))
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(body.strip() + "\n", encoding="utf-8")
    args.out.with_suffix(".source").write_text("mixed-ocr", encoding="utf-8")
    print(
        f"  ✅ {args.out.name} · {len(body):,} حرفًا · {len(pages)}/{total} صفحة",
        flush=True,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
