# -*- coding: utf-8 -*-
"""batch_convert.py — تحويل دفعة PDF إلى MD/TXT/DOCX/PDF مع استئناف وتقرير.

الاستخدام:
  python3 batch_convert.py /path/Grade_12 --out /path/Grade_12/_converted \
      --limit 5 --text-only
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
PIPE = HERE / "pipeline.py"


def text_ok(pdf: Path) -> bool:
    try:
        r = subprocess.run(
            ["pdftotext", "-f", "1", "-l", "5", "-layout", str(pdf), "-"],
            capture_output=True,
            text=True,
            timeout=30,
        )
        letters = len(re.findall(r"[A-Za-z\u0600-\u06FF]", r.stdout))
        return letters / 5 >= 500
    except Exception:
        return False


def pages(pdf: Path) -> int:
    r = subprocess.run(["pdfinfo", str(pdf)], capture_output=True, text=True)
    for line in r.stdout.splitlines():
        if line.startswith("Pages:"):
            return int(line.split()[-1])
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("root", type=Path)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--text-only", action="store_true")
    ap.add_argument(
        "--scans-only", action="store_true", help="الممسوح فقط (لا طبقة نصّ)"
    )
    ap.add_argument(
        "--ocr-engine", choices=("gemini", "local"), default="gemini"
    )
    ap.add_argument("--require-headings", action="store_true")
    ap.add_argument(
        "--exclude", action="append", default=[], help="نمط مسار يُستبعد (متكرر)"
    )
    ap.add_argument("--nice", action="store_true", help="أولوية منخفضة للمعالج")
    ap.add_argument(
        "--order", choices=("path", "pages"), default="path", help="ترتيب المعالجة"
    )
    ap.add_argument("--no-retry", action="store_true", help="بلا إعادة OCR عبر Gemini")
    ap.add_argument(
        "--fallback-gemini-pages",
        type=int,
        default=0,
        help="إن فشل OCR المحلي لكتاب ≤ هذا العدد من الصفحات، أعد بـGemini",
    )
    ap.add_argument(
        "--rebuild",
        action="store_true",
        help="أعد بناء الكتب الناجحة (بلا OCR) لتطبيق تحسينات التنظيف",
    )
    ap.add_argument("--min-pages", type=int, default=5)
    args = ap.parse_args()

    pdfs = sorted(p for p in args.root.rglob("*.pdf") if p.is_file())
    if args.exclude:
        pdfs = [p for p in pdfs if not any(x in str(p) for x in args.exclude)]
    if args.order == "pages":
        pdfs.sort(key=lambda p: (pages(p), str(p)))
    done = failed = skipped = 0
    results = []
    for pdf in pdfs:
        if pages(pdf) < args.min_pages:
            skipped += 1
            continue
        has_text = text_ok(pdf)
        if args.text_only and not has_text:
            skipped += 1
            continue
        if args.scans_only and has_text:
            skipped += 1
            continue
        rel = pdf.relative_to(args.root).with_suffix("")
        dest = args.out / rel
        book = dest / pdf.stem
        if not args.rebuild and (book / f"{pdf.stem}.md").is_file() and (book / "qa.json").is_file():
            try:
                if json.loads((book / "qa.json").read_text(encoding="utf-8")).get(
                    "pass"
                ):
                    skipped += 1
                    continue
            except Exception:
                pass
        dest.mkdir(parents=True, exist_ok=True)
        t0 = time.time()
        r = subprocess.run(
            [
                sys.executable,
                str(PIPE),
                str(pdf),
                "--out",
                str(dest),
                "--lang",
                "auto",
                "--ocr-engine",
                args.ocr_engine if not has_text else "gemini",
            ]
            + (["--require-headings"] if args.require_headings else [])
            + (["--no-retry"] if args.no_retry else []),
            capture_output=True,
            text=True,
            timeout=7200,
        )
        ok = r.returncode == 0
        if (
            not ok
            and args.ocr_engine == "local"
            and 0 < args.fallback_gemini_pages
            and pages(pdf) <= args.fallback_gemini_pages
        ):
            print(f"  🔁 Gemini للكتاب الصغير: {pdf.name[:50]}", flush=True)
            r = subprocess.run(
                [
                    sys.executable,
                    str(PIPE),
                    str(pdf),
                    "--out",
                    str(dest),
                    "--lang",
                    "auto",
                    "--ocr-engine",
                    "gemini",
                    "--force-ocr",
                ],
                capture_output=True,
                text=True,
                timeout=7200,
            )
            ok = r.returncode == 0
        results.append({"pdf": str(pdf), "ok": ok, "sec": round(time.time() - t0, 1)})
        if ok:
            done += 1
            print(f"✅ {pdf.name[:60]}", flush=True)
        else:
            failed += 1
            print(f"❌ {pdf.name[:60]} :: {(r.stdout + r.stderr)[-160:]}", flush=True)
        if args.limit and done + failed >= args.limit:
            break

    (args.out / "_batch_report.json").write_text(
        json.dumps(results, ensure_ascii=False, indent=1), encoding="utf-8"
    )
    print(f"done={done} failed={failed} skipped={skipped}")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
