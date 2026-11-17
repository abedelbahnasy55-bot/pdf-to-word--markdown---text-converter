# -*- coding: utf-8 -*-
"""build_book.py — بناء Word ثم PDF من Markdown عربي عبر محرّك RTL المرفق.

الاستخدام:
  python3 build_book.py clean.md out.docx --profile book --title "اسم الكتاب" --pdf
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from common import die, run


def engine() -> Path:
    p = Path(__file__).with_name("docx_engine.py")
    if not p.is_file():
        die("محرّك DOCX غير موجود بجوار السكربت (docx_engine.py)")
    return p


def fonts_ok() -> bool:
    r = subprocess.run(["fc-match", "Amiri"], capture_output=True, text=True)
    return "Amiri" in r.stdout


def build_docx(
    md: Path,
    out: Path,
    profile: str,
    title: str | None,
    header: str | None,
    ltr: bool = False,
    math: str = "off",
    toc: bool = False,
) -> None:
    out.unlink(missing_ok=True)
    if math == "pandoc":
        ref = Path(__file__).with_name("reference_rtl.docx")
        if not ref.is_file():
            die("مرجع pandoc غير موجود: scripts/reference_rtl.docx")
        direction = "ltr" if ltr else "rtl"
        lang = "en" if ltr else "ar"
        cmd = [
            "pandoc", str(md), "-o", str(out),
            "-f", "markdown-yaml_metadata_block",
            "--reference-doc", str(ref),
            "-M", f"dir={direction}", "-M", f"lang={lang}",
        ]
        if toc:
            cmd.append("--toc")
        run(cmd, timeout=900)
        try:
            sys.path.insert(0, str(Path(__file__).parent))
            from embed_fonts import embed
            embed(out)
        except Exception as exc:  # noqa: BLE001
            print(f"⚠️ تعذّر تضمين الخط: {exc}")
        print("ℹ️ بُني عبر pandoc (معادلات Word أصلية)")
        return
    cmd = [sys.executable, str(engine()), profile, str(md), str(out)]
    if title:
        cmd += ["--title", title]
    if header:
        cmd += ["--header", header]
    if ltr:
        cmd += ["--ltr"]
    run(cmd, timeout=900)
    if not out.is_file() or out.stat().st_size < 5000:
        die(f"فشل بناء DOCX أو الناتج صغير جدًا: {out}")


def build_pdf(docx: Path, pdf: Path) -> None:
    pdf.unlink(missing_ok=True)
    with tempfile.TemporaryDirectory(prefix="lo-profile-") as prof:
        cmd = [
            "soffice",
            "--headless",
            f"-env:UserInstallation=file://{prof}",
            "--convert-to",
            "pdf",
            "--outdir",
            str(pdf.parent),
            str(docx),
        ]
        run(cmd, timeout=900)
    produced = pdf.parent / (docx.stem + ".pdf")
    if produced != pdf:
        if not produced.is_file():
            die(f"لم يُنتج LibreOffice ملف PDF بجوار: {docx}")
        shutil.move(str(produced), str(pdf))
    if not pdf.is_file() or pdf.stat().st_size < 5000:
        die(f"فشل إنتاج PDF أو الناتج صغير جدًا: {pdf}")
    if pdf.stat().st_mtime < docx.stat().st_mtime - 2:
        die(f"PDF قديم/لم يُحدَّث: {pdf}")


def main() -> int:
    ap = argparse.ArgumentParser(description="بناء Word/PDF عربي من Markdown")
    ap.add_argument("md", type=Path)
    ap.add_argument("docx", type=Path)
    ap.add_argument("--profile", choices=("book", "booklet"), default="book")
    ap.add_argument("--title", default=None)
    ap.add_argument("--header", default=None)
    ap.add_argument("--ltr", action="store_true", help="اتجاه لاتيني (كتب إنجليزية)")
    ap.add_argument("--math", choices=("off", "pandoc"), default="off",
                    help="pandoc = معادلات Word أصلية (OMML)")
    ap.add_argument("--toc", action="store_true", help="فهرس تلقائي (وضع pandoc)")
    ap.add_argument("--pdf", action="store_true", help="أنتج PDF أيضًا")
    ap.add_argument("--pdf-path", type=Path, default=None)
    args = ap.parse_args()

    if not args.md.is_file():
        die(f"ملف Markdown غير موجود: {args.md}")
    if not fonts_ok():
        print(
            "⚠️ خط Amiri غير مُثبّت — قد يختلف العرض. ثبّته: fonts-hosny-amiri",
            file=sys.stderr,
        )

    args.docx.parent.mkdir(parents=True, exist_ok=True)
    build_docx(args.md, args.docx, args.profile, args.title, args.header, args.ltr, args.math, args.toc)
    print(f"✅ DOCX: {args.docx} ({args.docx.stat().st_size // 1024} KB)")

    if args.pdf:
        pdf = args.pdf_path or args.docx.with_suffix(".pdf")
        build_pdf(args.docx, pdf)
        print(f"✅ PDF: {pdf} ({pdf.stat().st_size // 1024} KB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
