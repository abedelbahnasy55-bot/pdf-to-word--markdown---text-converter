#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""pdf2book — منفذ واحد للمهارة: inspect · convert · batch · report · test · version."""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
VERSION = "2.8.0"


def run(script: str, args: list[str]) -> int:
    return subprocess.call([sys.executable, str(HERE / script)] + args)


def main() -> int:
    args = sys.argv[1:]
    if not args or args[0] in ("-h", "--help", "help"):
        print("pdf2book — تحويل PDF عربي إلى Word/PDF")
        print("  pdf2book inspect book.pdf")
        print(
            "  pdf2book convert book.pdf --out books/ [--structure gemini] [--lang en]"
        )
        print("  pdf2book batch <dir> --out <dir> [--text-only|--scans-only] [--ocr-engine local]")
        print("  pdf2book report <dir> [--md report.md]")
        print("  pdf2book verify <md|dir> [--json out.json] [--fix]")
        print("  pdf2book fetch-corpora")
        print("  pdf2book keys            # سعة المفاتيح والحصص اليومية")
        print("  pdf2book test")
        print("  pdf2book version")
        return 0
    cmd, rest = args[0], args[1:]
    if cmd == "version":
        print(VERSION)
        return 0
    if cmd == "inspect":
        return run("pdf_inspect.py", rest)
    if cmd in ("convert", "run"):
        return run("pipeline.py", rest)
    if cmd == "batch":
        return run("batch_convert.py", rest)
    if cmd == "report":
        return run("review_report.py", rest)
    if cmd == "verify":
        return run("verify_quotes.py", rest)
    if cmd == "fix-quotes":
        return run("fix_quotes.py", rest)
    if cmd == "clean-structure":
        return run("clean_structure.py", rest)
    if cmd == "keys":
        from keypool import KeyPool
        pool = KeyPool(models=os.environ.get("GEMINI_MODELS", "gemini-3.5-flash-lite,gemini-3.6-flash,gemini-3.7-flash,gemini-3.8-flash").split(","))
        c = pool.capacity()
        print(f"مفاتيح: {c['keys']} · موديلات: {c['models']} · طلبات متاحة: {c['requests_left']:,}")
        print(f"صفحات اليوم: {c['pages_left']:,} · لكل مفتاح: {c['per_key_per_day']:,}")
        return 0
    if cmd == "fetch-corpora":
        return subprocess.call(["bash", str(HERE / "fetch_corpora.sh")])
    if cmd == "test":
        return subprocess.call(["bash", str(HERE.parent / "tests" / "run_tests.sh")])
    print(f"⛔ أمر غير معروف: {cmd}", file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
