# -*- coding: utf-8 -*-
"""local_ocr.py — OCR محلي سريع عبر Tesseract (بلا إنترنت ولا حصص).

يُستخدم للكتب الممسوحة النصّية (شرعي/عربي/ثقافي) حيث لا توجد معادلات كثيفة.
للكتب الرياضية يبقى `gemini_ocr.py` أدقّ في المعادلات.

الاستخدام:
  python3 local_ocr.py book.pdf --out book.raw.md --dpi 200 --workers 4
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path


def page_text(pdf: str, index: int, dpi: int, lang: str, psm: str) -> tuple[int, str]:
    import fitz  # PyMuPDF

    doc = fitz.open(pdf)
    try:
        pix = doc[index].get_pixmap(dpi=dpi)
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as fh:
            img = Path(fh.name)
        pix.save(img)
        try:
            try:
                r = subprocess.run(
                    ["tesseract", str(img), "stdout", "-l", lang, "--psm", psm],
                    capture_output=True,
                    text=True,
                    timeout=240,
                )
            except subprocess.TimeoutExpired:
                print(f"  ⚠ صفحة {index + 1}: تجاوز المهلة — تُترك فارغة", flush=True)
                return index, ""
            text = r.stdout or ""
            if r.returncode != 0 and not text.strip():
                print(f"  ⚠ صفحة {index + 1}: {r.stderr.strip()[:100]}", flush=True)
            return index, text
        finally:
            img.unlink(missing_ok=True)
    finally:
        doc.close()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", type=Path)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--dpi", type=int, default=200)
    ap.add_argument("--lang", default="ara")
    ap.add_argument("--psm", default="3", help="وضع تقسيم الصفحة في Tesseract")
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--limit-pages", type=int, default=0)
    ap.add_argument(
        "--resume",
        action="store_true",
        help="احفظ الصفحات في <out>.pages.json واستأنف عند إعادة التشغيل",
    )
    args = ap.parse_args()

    if subprocess.run(["which", "tesseract"], capture_output=True).returncode != 0:
        print("⛔ tesseract غير مثبّت", file=sys.stderr)
        return 2

    import fitz

    doc = fitz.open(args.pdf)
    total = doc.page_count
    doc.close()
    if args.limit_pages:
        total = min(total, args.limit_pages)
    print(f"  🔎 OCR محلي: {total} صفحة · dpi {args.dpi} · {args.lang}", flush=True)

    cache_path = args.out.with_suffix(".pages.json")
    pages: dict[int, str] = {}
    if args.resume and cache_path.is_file():
        try:
            pages = {int(k): v for k, v in json.loads(cache_path.read_text(encoding="utf-8")).items()}
            print(f"  ⏩ استئناف: {len(pages)} صفحة محفوظة", flush=True)
        except Exception:
            pages = {}

    todo = [i for i in range(total) if i not in pages]
    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
        futures = {
            pool.submit(page_text, str(args.pdf), i, args.dpi, args.lang, args.psm): i
            for i in todo
        }
        for n, fut in enumerate(futures, 1):
            i, text = fut.result()
            pages[i] = text
            if n % 10 == 0 or n == len(todo):
                print(f"    {n}/{len(todo)}", flush=True)
                if args.resume:
                    cache_path.write_text(
                        json.dumps({str(k): v for k, v in pages.items()}, ensure_ascii=False),
                        encoding="utf-8",
                    )

    parts = [pages.get(i, "").strip() for i in range(total)]
    body = "\n---PAGEBREAK---\n".join(parts).strip() + "\n"
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(body, encoding="utf-8")
    args.out.with_suffix(".source").write_text("local-ocr", encoding="utf-8")
    if args.resume:
        cache_path.unlink(missing_ok=True)
    print(f"  ✅ {args.out.name} · {len(body):,} حرفًا", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
