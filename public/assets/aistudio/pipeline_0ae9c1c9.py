# -*- coding: utf-8 -*-
"""pipeline.py — المسار الكامل: PDF ← OCR/نصّ ← تنظيف ← Word/PDF ← بوابة جودة.

الاستخدام:
  python3 pipeline.py book.pdf --out books/            # كتاب واحد
  python3 pipeline.py pdfs/ --out books/               # مجلد كامل
  python3 pipeline.py book.pdf --out books/ --pages 3  # تجربة على 3 صفحات
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from pathlib import Path

from common import die, pdf_pages, run

HERE = Path(__file__).resolve().parent


def script(name: str) -> str:
    return str(HERE / name)


def collect(path: Path) -> list[Path]:
    if path.is_file():
        return [path]
    if path.is_dir():
        return sorted(p for p in path.rglob("*.pdf") if p.is_file())
    die(f"مسار غير موجود: {path}")


def text_layer_weak(pdf: Path) -> bool:
    """طبقة نصّ رقيقة (نصّ قليل مقابل صور) ⇒ OCR أدقّ."""
    r = run(
        ["pdftotext", "-f", "1", "-l", "5", "-layout", str(pdf), "-"],
        timeout=60,
        check=False,
    )
    text = r.stdout or ""
    letters = len(re.findall(r"[A-Za-z\u0600-\u06FF]", text))
    return letters / 5 < 500


def detect_lang(pdf: Path) -> str:
    """يخمّن لغة الكتاب من أول 3 صفحات إن كان لها طبقة نصّ."""
    r = run(["pdftotext", "-f", "1", "-l", "3", "-layout", str(pdf), "-"],
            timeout=60, check=False)
    text = r.stdout or ""
    letters = len(re.findall(r"[A-Za-z\u0600-\u06FF]", text))
    arabic = len(re.findall(r"[\u0600-\u06FF]", text))
    latin = len(re.findall(r"[A-Za-z]", text))
    if letters and arabic / letters < 0.5 and latin > 0.2:
        return "en"
    return "ar"


ITEM_LINE = re.compile(r"(?m)^\s*(?:[\u0660-\u0669\d]{1,3}\s*[.)\-]|\u0623-\u064a\s*[.)])")


def write_txt(md: Path, out: Path) -> None:
    """نصّ صافٍ من Markdown (بلا وسوم) للفهرسة والبحث."""
    text = md.read_text(encoding="utf-8", errors="ignore")
    text = re.sub(r"^#{1,6}\s*", "", text, flags=re.M)
    text = re.sub(r"\*\*(.+?)\*\*", r"\1", text)
    text = re.sub(r"^\s*[-*]\s+", "• ", text, flags=re.M)
    out.write_text(text, encoding="utf-8")


def choose_profile(pages: int, md: Path) -> str:
    """booklet للبوكليتات ذات أسئلة مرقّمة، وإلا book (كتب/قوائم/جداول)."""
    if pages > 20:
        return "book"
    text = md.read_text(encoding="utf-8", errors="ignore") if md.is_file() else ""
    return "booklet" if len(ITEM_LINE.findall(text)) >= 8 else "book"


def one(pdf: Path, out_root: Path, args) -> dict:
    t0 = time.time()
    pages = pdf_pages(pdf)
    dest = out_root / pdf.stem
    dest.mkdir(parents=True, exist_ok=True)
    raw = Path(args.raw) if args.raw else dest / f"{pdf.stem}.raw.md"
    clean = dest / f"{pdf.stem}.md"
    clean_report = dest / "clean.json"
    docx = dest / f"{pdf.stem}.docx"
    pdf_out = dest / f"{pdf.stem}.pdf"
    qa_json = dest / "qa.json"

    if args.ocr_engine is None:
        args.ocr_engine = "gemini"
    lang = detect_lang(pdf) if args.lang == "auto" else args.lang
    profile = args.profile
    if profile == "auto":
        profile = "book" if pages > 20 else "booklet"

    # 1) استخراج
    if args.raw is None and (not raw.is_file() or args.force_ocr):
        if args.ocr_engine == "local":
            cmd = [
                sys.executable,
                script("local_ocr.py"),
                str(pdf),
                "--out",
                str(raw),
                "--dpi",
                str(args.dpi or 200),
                "--workers",
                str(args.ocr_workers),
                "--resume",
                "--lang",
                "eng" if lang == "en" else "ara",
            ]
        else:
            cmd = [
                sys.executable,
                script("gemini_ocr.py"),
                str(pdf),
                "--out",
                str(raw),
                "--mode",
                args.mode,
                "--chunk",
                str(args.chunk),
                "--models",
                args.models,
                "--work",
                str(dest / "work"),
            ]
        if args.pages:
            cmd += ["--limit-pages", str(args.pages)]
        if args.dpi and args.ocr_engine != "local":
            cmd += ["--dpi", str(args.dpi)]
        if args.key_file:
            cmd += ["--key-file", args.key_file]
        if args.force_ocr:
            cmd += ["--force"]
        run(cmd, timeout=3600)
    else:
        print(f"  ⏭ استخراج موجود: {raw.name}", flush=True)

    clean_source = raw
    if args.figures != "off":
        fig = dest / f"{pdf.stem}.fig.md"
        run(
            [
                sys.executable,
                script("insert_figures.py"),
                str(raw),
                str(pdf),
                str(fig),
                "--images",
                str(dest / "images"),
                "--mode",
                args.figures,
            ],
            timeout=900,
        )
        clean_source = fig

    # 2) تنظيف
    run(
        [
            sys.executable,
            script("clean_md.py"),
            str(clean_source),
            str(clean),
            "--report",
            str(clean_report),
        ],
        timeout=600,
    )

    if args.profile == "auto":
        profile = choose_profile(pages, clean)
    build_md = clean
    if args.structure == "gemini":
        structured = dest / f"{pdf.stem}.structured.md"
        scmd = [sys.executable, script("structure.py"), str(clean), str(structured)]
        if args.key_file:
            scmd += ["--key-file", args.key_file]
        run(scmd, timeout=1800)
        build_md = structured

    # 3) بناء
    math_mode = args.math
    if math_mode == "auto":
        needs = args.figures != "off" or bool(
            re.search(r"\$[^$]+\$", build_md.read_text(encoding="utf-8"))
        )
        math_mode = "pandoc" if needs else "off"
    cmd = [
        sys.executable,
        script("build_book.py"),
        str(build_md),
        str(docx),
        "--profile",
        profile,
        "--title",
        args.title or pdf.stem,
        "--pdf",
        "--pdf-path",
        str(pdf_out),
    ]
    if args.header:
        cmd += ["--header", args.header]
    if lang == "en":
        cmd += ["--ltr"]
    cmd += ["--math", math_mode]
    if args.toc:
        cmd.append("--toc")
    run(cmd, timeout=1800)

    # 4) بوابة
    seen_pages = min(pages, args.pages) if args.pages else pages
    cmd = [
        sys.executable,
        script("qa_gates.py"),
        "--input",
        str(pdf),
        "--input-pages",
        str(seen_pages),
        "--md",
        str(build_md),
        "--raw",
        str(raw),
        "--lang",
        lang,
        "--docx",
        str(docx),
        "--pdf-out",
        str(pdf_out),
        "--clean-report",
        str(clean_report),
        "--json",
        str(qa_json),
    ]
    if args.ocr_engine == "local":
        cmd += ["--max-short", "0.45"]
    if args.figures == "all":
        cmd += ["--visual"]
    if args.require_headings:
        cmd.append("--require-headings")
    r = run(cmd, timeout=600, check=False)
    passed = r.returncode == 0
    print(r.stdout.strip())
    if r.returncode not in (0, 1):
        die(f"بوابة الجودة انهارت: {r.stderr[-300:]}")

    # 5) إعادة محاولة تلقائية بقطع أصغر إذا فشلت الجودة وكان المصدر OCR
    source = dest / f"{pdf.stem}.raw.source"
    used_ocr = args.raw is None and (
        (not source.is_file()) or source.read_text(encoding="utf-8").strip() == "ocr"
    )
    if (
        not passed
        and args.raw is None
        and args.mode != "text"
        and args.ocr_engine != "local"
        and not args.no_retry
        and (used_ocr or text_layer_weak(pdf))
    ):
        print("  🔁 إعادة OCR بقطع 6 صفحات ثم إعادة البناء…", flush=True)
        raw.unlink(missing_ok=True)
        cmd = [
            sys.executable,
            script("gemini_ocr.py"),
            str(pdf),
            "--out",
            str(raw),
            "--mode",
            "ocr",
            "--chunk",
            "6",
            "--models",
            args.models,
            "--work",
            str(dest / "work"),
            "--force",
        ]
        if args.pages:
            cmd += ["--limit-pages", str(args.pages)]
        if args.dpi and args.ocr_engine != "local":
            cmd += ["--dpi", str(args.dpi)]
        run(cmd, timeout=5400)
        source.write_text("ocr", encoding="utf-8")
        clean_source = raw
        if args.figures != "off":
            fig = dest / f"{pdf.stem}.fig.md"
            run(
                [
                    sys.executable,
                    script("insert_figures.py"),
                    str(raw),
                    str(pdf),
                    str(fig),
                    "--images",
                    str(dest / "images"),
                    "--mode",
                    args.figures,
                ],
                timeout=900,
            )
            clean_source = fig
        run(
            [
                sys.executable,
                script("clean_md.py"),
                str(clean_source),
                str(clean),
                "--report",
                str(clean_report),
            ],
            timeout=600,
        )
        build_md = clean
        if args.structure == "gemini":
            structured = dest / f"{pdf.stem}.structured.md"
            scmd = [sys.executable, script("structure.py"), str(clean), str(structured)]
            if args.key_file:
                scmd += ["--key-file", args.key_file]
            run(scmd, timeout=1800)
            build_md = structured
        bmath = args.math
        if bmath == "auto":
            bneeds = args.figures != "off" or bool(
                re.search(r"\$[^$]+\$", build_md.read_text(encoding="utf-8"))
            )
            bmath = "pandoc" if bneeds else "off"
        bcmd = [
            sys.executable,
            script("build_book.py"),
            str(build_md),
            str(docx),
            "--profile",
            profile,
            "--title",
            args.title or pdf.stem,
            "--pdf",
            "--pdf-path",
            str(pdf_out),
        ]
        if args.header:
            bcmd += ["--header", args.header]
        if lang == "en":
            bcmd += ["--ltr"]
        bcmd += ["--math", bmath]
        if args.toc:
            bcmd.append("--toc")
        run(bcmd, timeout=1800)
        r2 = run(
            cmd := [
                sys.executable,
                script("qa_gates.py"),
                "--input",
                str(pdf),
                "--input-pages",
                str(min(pages, args.pages) if args.pages else pages),
                "--md",
                str(build_md),
                "--raw",
                str(raw),
                "--lang",
                lang,
                "--docx",
                str(docx),
                "--pdf-out",
                str(pdf_out),
                "--clean-report",
                str(clean_report),
                "--json",
                str(qa_json),
            ]
            + (["--require-headings"] if args.require_headings else []),
            timeout=600,
            check=False,
        )
        print(r2.stdout.strip())
        passed = r2.returncode == 0

    txt = dest / f"{pdf.stem}.txt"
    try:
        write_txt(build_md, txt)
    except Exception as exc:  # noqa: BLE001 - التقرير يوضّح الفشل
        print(f"  ⚠ txt: {exc}")

    report = {
        "pdf": str(pdf),
        "pages": pages,
        "profile": profile,
        "passed": passed,
        "seconds": round(time.time() - t0, 1),
        "md": str(clean),
        "docx": str(docx),
        "pdf_out": str(pdf_out),
    }
    (dest / "report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8"
    )
    return report


def main() -> int:
    ap = argparse.ArgumentParser(
        description="تحويل PDF عربي إلى كتاب Word/PDF مع بوابة جودة"
    )
    ap.add_argument("input", type=Path)
    ap.add_argument("--out", type=Path, default=None)
    ap.add_argument("--mode", choices=("auto", "ocr", "text"), default="auto")
    ap.add_argument("--profile", choices=("auto", "book", "booklet"), default="auto")
    ap.add_argument("--title", default=None)
    ap.add_argument("--header", default=None)
    ap.add_argument(
        "--models",
        default=(
            "gemini-3.5-flash-lite,gemini-3.1-flash-lite,gemini-flash-lite-latest,"
            "gemini-3.5-flash,gemini-flash-latest,gemini-3-flash-preview,"
            "gemini-3.6-flash,gemini-3.7-flash"
        ),
    )
    ap.add_argument("--chunk", type=int, default=10)
    ap.add_argument(
        "--dpi", type=int, default=0, help="إعادة تصدير الصفحات بدقة أعلى (مثل 300)"
    )
    ap.add_argument("--pages", type=int, default=0, help="أول N صفحات للتجربة")
    ap.add_argument("--key-file", default=None)
    ap.add_argument("--force-ocr", action="store_true")
    ap.add_argument("--no-retry", action="store_true", help="لا تُعد OCR عند فشل الجودة")
    ap.add_argument("--require-headings", action="store_true")
    ap.add_argument("--inspect", action="store_true", help="تشخيص فقط ثم الخروج")
    ap.add_argument(
        "--raw",
        type=Path,
        default=None,
        help="Markdown خام جاهز (تجاوز OCR) — لملف واحد",
    )
    ap.add_argument(
        "--structure",
        choices=("heuristic", "gemini", "off"),
        default="heuristic",
        help="طريقة إضافة العناوين (heuristic الافتراضي)",
    )
    ap.add_argument("--lang", choices=("ar", "en", "auto"), default="auto")
    ap.add_argument("--ocr-workers", type=int, default=4, help="توازي OCR المحلي")
    ap.add_argument(
        "--ocr-engine",
        choices=("gemini", "local"),
        default=None,
        help="gemini: أدقّ للمعادلات · local: Tesseract بلا حصص",
    )
    ap.add_argument(
        "--figures",
        choices=("off", "page", "math", "all"),
        default="off",
        help="page: صورة عند وجود رسم · math: صورة للصفحات التي فيها معادلات",
    )
    ap.add_argument(
        "--toc",
        action="store_true",
        help="فهرس تلقائي في وضع pandoc",
    )
    ap.add_argument(
        "--math",
        choices=("auto", "pandoc", "off"),
        default="auto",
        help="auto: pandoc عند وجود $...$ (معادلات Word)",
    )
    args = ap.parse_args()

    files = collect(args.input)
    if not files:
        die("لا ملفات PDF في المسار المحدد")
    if not args.inspect and args.out is None:
        die("--out مطلوب إلا مع --inspect")
    if args.raw and len(files) > 1:
        die("--raw يعمل مع ملف PDF واحد فقط")
    if args.inspect:
        for pdf in files:
            try:
                run([sys.executable, script("pdf_inspect.py"), str(pdf)], timeout=300)
            except SystemExit:
                print(f"⚠️ تعذّر فحص: {pdf.name}", flush=True)
        return 0
    args.out.mkdir(parents=True, exist_ok=True)
    results = []
    for i, pdf in enumerate(files, 1):
        print(f"\n[{i}/{len(files)}] {pdf.name}", flush=True)
        try:
            results.append(one(pdf, args.out, args))
        except SystemExit as exc:
            print(f"  ❌ فشل الملف: {pdf.name} (exit {exc.code})", flush=True)
            results.append(
                {"pdf": str(pdf), "passed": False, "error": f"exit {exc.code}"}
            )
            continue
        except Exception as exc:  # noqa: BLE001
            print(f"  ❌ {type(exc).__name__}: {exc}", flush=True)
            results.append({"pdf": str(pdf), "passed": False, "error": str(exc)})
    ok = sum(1 for r in results if r.get("passed"))
    (args.out / "summary.json").write_text(
        json.dumps(results, ensure_ascii=False, indent=1), encoding="utf-8"
    )
    print(f"\n🏁 نجح {ok}/{len(results)}")
    return 0 if ok == len(results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
