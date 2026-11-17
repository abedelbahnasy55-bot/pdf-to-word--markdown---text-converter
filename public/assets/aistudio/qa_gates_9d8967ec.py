# -*- coding: utf-8 -*-
"""qa_gates.py — بوابة جودة قابلة للقياس قبل اعتماد أي كتاب.

الحكم = رمز الخروج:
  0  نجحت كل البوابات
  1  فشل بند واحد أو أكثر (التفاصيل في التقرير)
  2  خطأ استعمال/ملف مفقود

الاستخدام:
  python3 qa_gates.py --input book.pdf --md clean.md --docx book.docx \
      --clean-report clean.json --pdf-out book.pdf --json qa.json
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

PAGEBREAK_LEAK = re.compile(r"-{2,}\s*PAGE[\s_]?BREAK\s*-{1,3}>?", re.I)
REV_PAREN = re.compile(r"\)[^\s()\[\]{}«»]{1,40}\(")
_REV_LETTER = re.compile(r"[\u0600-\u06FFA-Za-z]")
BAD_MARKUP = re.compile(r"(```|<br\s*/?>)", re.I)
CAM = re.compile(r"CamScanner", re.I)
ARABIC = re.compile(r"[\u0600-\u06FF]")


def load_json(path: Path | None) -> dict:
    if not path:
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def _heading_jumps(lines: list[str]) -> int:
    levels = [len(l) - len(l.lstrip("#")) for l in lines if l.startswith("#")]
    return sum(1 for a, b in zip(levels, levels[1:]) if b > a + 1)


def _strip_tashkeel(s: str) -> str:
    return re.sub(r"[\u064B-\u065F\u0670\u06D6-\u06ED]", "", s)


def _hamza_issues(s: str) -> int:
    plain = _strip_tashkeel(s)
    return len(
        re.findall(
            r"(?<![A-Za-z\u0590-\u06FF\u064B-\u065F])(اي|الي|ان|ابو|احمد|اذا|ازهر)(?![A-Za-z\u0590-\u06FF\u064B-\u065F])",
            plain,
        )
    )


def _punct_issues(s: str) -> int:
    # قائمة بيضاء ضيقة (تُفشل البوابة على غيرها): فواصل الشعر « .. »، نقاط
    # الحذف «...»/«....» المستقلة (يُبقيها normalize_punct عمدًا)، وفراغات
    # الإجابة المنقّطة الطويلة (8+ نقاط) ليست مخالفات ترقيم. تُستبدل برقم 0
    # حتى لا يخلق الاستبدال مسافة وهمية قبل الفاصلة التالية، ولا يُقرأ الرقم
    # كحرف لاتيني بعد النقطتين. مواضع الشك [؟ ؟] المقصودة من الـOCR ليست
    # مخالفات ترقيم.
    cleaned = re.sub(r"(?<!\S)\.{2,}(?!\S)", "0", s)
    cleaned = re.sub(r"\.{8,}", "0", cleaned)
    # مواضع الشك [؟ ؟] المقصودة من الـOCR ليست مخالفات ترقيم
    cleaned = re.sub(r"\[[؟\s]*\]", "0", cleaned)
    return len(re.findall(r"\s[،؛؟.!]|([،؛:؟])(?=[A-Za-z\u0600-\u066F])", cleaned))


def md_metrics(md: str) -> dict:
    lines = [l.rstrip() for l in md.split("\n")]
    nonempty = [l for l in lines if l.strip()]
    eligible = [
        l
        for l in nonempty
        if len(l) >= 40
        and len(re.findall(r"[A-Za-z\u0590-\u06FF\u064B-\u065F]", l)) >= 15
        and not l.startswith("|")
        and not re.search(r"\s{2,}", l)
    ]
    counts: dict[str, int] = {}
    for line in eligible:
        counts[line] = counts.get(line, 0) + 1
    dup = sum(v - 1 for v in counts.values() if v > 1)
    return {
        "lines": len(nonempty),
        "chars": len(md),
        "headings": sum(1 for l in nonempty if l.startswith("#")),
        "pages": len(
            [p for p in re.split(r"---PAGEBREAK---", md) if len(p.strip()) > 40]
        )
        or 0,
        "duplicate_lines": dup,
        "duplicate_ratio": round(dup / max(1, len(eligible)), 3),
        "pagebreak_leak": bool(PAGEBREAK_LEAK.search(md)),
        "bad_markup": bool(BAD_MARKUP.search(md)),
        "camscanner": bool(CAM.search(md)),
        "arabic_ratio": round(
            len(ARABIC.findall(md)) / max(1, len(re.sub(r"\s", "", md))), 3
        ),
        "placeholders": len(re.findall(r"\[؟\]", md)),
        "latin_ratio": round(
            len(re.findall(r"[A-Za-z]", md)) / max(1, len(re.sub(r"\s", "", md))), 3
        ),
        "punct_issues": _punct_issues(md),
        "hamza_issues": _hamza_issues(md),
        "heading_jumps": _heading_jumps(nonempty),
        "placeholder_headings": len(
            re.findall(
                r"^##\s+\d+\.\s+(الدرس\s+\d+|أسئلة صفحة\s+\d+)\s*$",
                md,
                flags=re.M,
            )
        ),
    }


def table_problems(md: str) -> list[str]:
    """جداول Markdown غير متساوية الأعمدة أو فيها صفوف فارغة."""
    problems, block = [], []
    for line in md.split("\n") + [""]:
        if line.strip().startswith("|"):
            block.append(line)
            continue
        for row in block:
            cells = [c.strip() for c in row.strip().strip("|").split("|")]
            if cells and all(c == "" for c in cells):
                problems.append("صف جدول فارغ تمامًا")
        if len(block) >= 2:
            cols = {
                len([c for c in row.strip().strip("|").split("|")]) for row in block
            }
            if len(cols) > 1:
                problems.append(
                    f"جدول بأعمدة متفاوتة: {sorted(cols)} — أول سطر: {block[0][:40]}"
                )
        block = []
    return problems


def docx_metrics(path: Path) -> dict:
    try:
        from docx import Document
    except ImportError:
        return {"error": "python-docx غير مثبّت"}
    d = Document(str(path))
    paras = [p.text for p in d.paragraphs if p.text.strip()]
    text = "\n".join(paras)
    return {
        "paragraphs": len(paras),
        "chars": len(text),
        "arabic": len(ARABIC.findall(text)) > 0,
        "bad_markup": bool(BAD_MARKUP.search(text)),
    }


def pdf_pages(path: Path) -> int:
    r = __import__("subprocess").run(
        ["pdfinfo", str(path)], capture_output=True, text=True
    )
    for line in r.stdout.splitlines():
        if line.startswith("Pages:"):
            return int(line.split()[-1])
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="بوابة جودة تحويل PDF → كتاب")
    ap.add_argument("--input", type=Path, required=True, help="PDF الأصلي")
    ap.add_argument("--md", type=Path, required=True, help="Markdown المنظّف")
    ap.add_argument("--docx", type=Path, default=None)
    ap.add_argument("--pdf-out", type=Path, default=None)
    ap.add_argument("--clean-report", type=Path, default=None)
    ap.add_argument(
        "--output-pages",
        type=int,
        default=0,
        help="عدد صفحات الناتج إن لم يوجد تقرير تنظيف",
    )
    ap.add_argument(
        "--raw", type=Path, default=None, help="Markdown الخام (لفحص تكرار الصفحات)"
    )
    ap.add_argument("--lang", choices=("ar", "en"), default="ar")
    ap.add_argument("--json", type=Path, default=None)
    ap.add_argument(
        "--input-pages",
        type=int,
        default=0,
        help="عدد صفحات الأصل الفعلي (للتجربة الجزئية)",
    )
    ap.add_argument("--min-cpp", type=float, default=250)
    ap.add_argument("--max-short", type=float, default=0.28)
    ap.add_argument("--max-solo", type=int, default=20)
    ap.add_argument(
        "--min-page-ratio", type=float, default=0.85, help="تغطية النصّ مقابل الأصل"
    )
    ap.add_argument(
        "--min-output-ratio", type=float, default=0.5, help="حد أدنى لصفحات PDF الناتج"
    )
    ap.add_argument(
        "--reflow",
        action="store_true",
        help="الناتج معاد تدفقه (بوكليت): تُحكم الجودة بالحروف/التغطية لا بعدّ الصفحات",
    )
    ap.add_argument("--max-dup", type=float, default=0.20)
    ap.add_argument("--require-headings", action="store_true")
    ap.add_argument(
        "--visual",
        action="store_true",
        help="الكتاب مبني بصور الصفحات: نقص النصّ تحذير لا فشل",
    )
    args = ap.parse_args()

    for p in (args.input, args.md):
        if not p.is_file():
            print(f"⛔ ملف مفقود: {p}", file=sys.stderr)
            return 2
    md = args.md.read_text(encoding="utf-8")
    m = md_metrics(md)
    clean = load_json(args.clean_report)
    in_pages = args.input_pages or pdf_pages(args.input)
    out_pages_real = (
        pdf_pages(args.pdf_out) if (args.pdf_out and args.pdf_out.is_file()) else 0
    )
    pages = (
        out_pages_real or args.output_pages or clean.get("pages") or m.get("pages") or 0
    )

    # التغطية: كم صفحة من الأصل دخلت فعليًّا في النصّ المستخرج.
    # البوابة كانت تُتجاهل حين لا يحمل تقرير التنظيف مفتاح pages، فمرّ كتاب
    # مبني على 32 صفحة من 209 دون إنذار. تُقاس الآن من الخام أولًا، ثم من
    # التقرير، ثم من علامات الفواصل داخل الـ md — ولا تُسقط البوابة أبدًا.
    raw_txt = (
        args.raw.read_text(encoding="utf-8")
        if (args.raw and args.raw.is_file())
        else ""
    )

    def _paged_blocks(text: str) -> int:
        return len(
            [p for p in re.split(r"---PAGEBREAK---", text) if len(p.strip()) > 40]
        )

    src_pages = _paged_blocks(raw_txt) or clean.get("pages") or _paged_blocks(md) or 0
    coverage = src_pages / max(1, in_pages)

    checks: list[dict] = []

    def check(name: str, ok: bool, detail: str, *, warn: bool = False):
        checks.append({"name": name, "ok": bool(ok), "detail": detail, "warn": warn})

    if args.reflow:
        check(
            "page-ratio",
            True,
            f"إعادة تدفق بوكليت: {pages}/{in_pages} صفحة — تُحكم بالحروف/التغطية لا بعدّ الصفحات",
        )
    else:
        check(
            "page-ratio",
            pages >= in_pages * args.min_output_ratio,
            f"صفحات الناتج {pages} / الأصل {in_pages} (≥ {args.min_output_ratio:.0%})",
        )
    if args.reflow:
        # بوكليت معاد بناؤه من Markdown: لا فواصل صفحات أصلية — الحكم بالحروف/صفحة
        check(
            "ocr-coverage",
            True,
            f"إعادة تدفق بوكليت من Markdown: {m['chars']} حرفًا و{m['headings']} عنوانًا — لا تغطية OCR مطلوبة",
        )
    elif not src_pages:
        check(
            "ocr-coverage",
            False,
            f"لا يمكن إثبات التغطية: لا علامات صفحات في الخام ولا في التقرير "
            f"(الأصل {in_pages} صفحة) — حدّد --raw أو أعد التصيير",
            warn=args.visual,
        )
    else:
        check(
            "ocr-coverage",
            coverage >= args.min_page_ratio,
            f"صفحات النصّ {src_pages} / الأصل {in_pages} = {coverage:.0%} "
            f"(≥ {args.min_page_ratio:.0%})",
            warn=args.visual,
        )
    # طبقة نصّ مقلوبة الحروف: «الصرف» ← «الرصف» من Khroma/InDesign CMap
    try:
        from gemini_ocr import lam_swap_rate

        garble = lam_swap_rate(raw_txt or md)
    except Exception:
        garble = None
    if garble is not None:
        check(
            "no-garbled-layer",
            garble < 6.0,
            f"كلمات «ا+حرف+ل» المقلوبة {garble:.1f}% (منها الله وأولاً وأصل — "
            "السليم أقل من 4%)",
        )

    cpp = clean.get("chars_per_page") or (m["chars"] // max(1, pages))
    check(
        "chars-per-page",
        cpp >= args.min_cpp,
        f"{cpp} حرفًا/صفحة (≥ {args.min_cpp:.0f})",
        warn=args.visual,
    )
    short = clean.get("short_line_ratio")
    if short is not None:
        small = (clean.get("lines") or m["lines"]) < 50 or in_pages < 12
        limit = 0.45 if args.lang == "en" else args.max_short
        rows = clean.get("row_ratio") or 0
        check(
            "short-lines",
            small or rows > 0.3 or short <= limit,
            f"نسبة الأسطر القصيرة {short:.2%} (≤ {limit:.0%})",
            warn=small or rows > 0.3,
        )
    solo = clean.get("solo_diacritics")
    if solo is not None:
        check(
            "solo-diacritics", solo <= args.max_solo, f"{solo} سطرًا (≤ {args.max_solo})"
        )
    check("no-pagebreak-leak", not m["pagebreak_leak"], "لا فواصل صفحات متسرّبة")
    rev = sum(1 for m in REV_PAREN.finditer(md) if _REV_LETTER.search(m.group(0)[1:-1]))
    check("no-reversed-parens", rev == 0, f"{rev} قوسًا معكوسًا من نوع «)أ(»")
    check("no-bad-markup", not m["bad_markup"], "لا وسوم تقنية متسرّبة")
    check("no-camscanner", not m["camscanner"], "لا آثار ماسح")
    if "بوكليت" in str(getattr(args, "md", "") or ""):
        solved = md.count("نماذج محلولة") + len(
            [
                m
                for m in re.finditer(r"جواب\s*:", md)
                if not re.match(r"جواب\s*:\s*[\.…]", m.group(0))
            ]
        )
        check(
            "no-answers-in-booklet",
            solved == 0,
            f"{solved} موضع إجابة محلولة في بوكليت (نماذج محلولة/الجواب:)",
        )
    # مسافات الترقيم وهمزة الوصل/القطع بوابات صلبة (fail لا warn).
    check(
        "punct-spacing",
        m["punct_issues"] == 0,
        f"{m['punct_issues']} مسافة ترقيم مخالفة (قبل ،؛؟.! أو ملتصقة بعدها)",
    )
    check(
        "hamza-forms",
        m["hamza_issues"] == 0,
        f"{m['hamza_issues']} كلمة بلا همزة وصل/قطع (أي/إلى/إن/إذا/أبو/أحمد/أزهر)",
    )
    check(
        "heading-levels",
        m["heading_jumps"] == 0,
        f"{m['heading_jumps']} قفزة مستوى عنوان (## ← ####)",
        warn=True,
    )
    # أسماء الدروس على التدريبات بوابة صلبة: عنوان «الدرس N» بلا اسم حقيقي يُفشل الاعتماد.
    check(
        "lesson-names",
        m["placeholder_headings"] == 0,
        f"{m['placeholder_headings']} عنوان تدريبات بلا اسم درس («الدرس N» أو «أسئلة صفحة N»)",
    )
    check(
        "duplicates",
        m["duplicate_ratio"] <= args.max_dup,
        f"تكرار {m['duplicate_ratio']:.2%} (≤ {args.max_dup:.0%})",
    )
    if args.require_headings:
        check("headings", m["headings"] > 0, f"{m['headings']} عنوانًا")
    else:
        check("headings", m["headings"] > 0, f"{m['headings']} عنوانًا", warn=True)
    if m["placeholders"] > 0:
        check(
            "placeholders",
            m["placeholders"] <= max(5, m["lines"] // 100),
            f"{m['placeholders']} موضع «[؟]»",
            warn=True,
        )
    if args.lang == "ar" and m["latin_ratio"] > 0.15:
        check("latin-ratio", False, f"حروف لاتينية {m['latin_ratio']:.0%}", warn=True)

    # تكرار الصفحات الكامل (إن توفّر الخام)
    if args.raw and args.raw.is_file():
        raw = args.raw.read_text(encoding="utf-8")
        pages = [
            re.sub(r"\s+", " ", p).strip() for p in re.split(r"---PAGEBREAK---", raw)
        ]
        pages = [p for p in pages if len(p) > 80]
        seen: dict[str, int] = {}
        for pg in pages:
            key = pg[:200]
            seen[key] = seen.get(key, 0) + 1
        dup_pages = sum(v - 1 for v in seen.values() if v > 1)
        ratio = dup_pages / max(1, len(pages))
        check(
            "duplicate-pages",
            ratio <= 0.10,
            f"{dup_pages} صفحة مكرّرة ({ratio:.0%})",
            warn=in_pages <= 16,
        )
    math_spans = len(re.findall(r"\$[^$]+\$", md))
    omath = 0
    if args.docx and args.docx.is_file():
        import zipfile

        try:
            xml = (
                zipfile.ZipFile(args.docx)
                .read("word/document.xml")
                .decode("utf-8", "ignore")
            )
            omath = xml.count("<m:oMath")
        except Exception:
            omath = 0
    if math_spans:
        check(
            "equations",
            omath > 0,
            f"{math_spans} تعبيرًا · {omath} معادلة Word",
            warn=math_spans < 3,
        )
        if omath and omath < math_spans * 0.95:
            check(
                "equations-count",
                False,
                f"OMML {omath} أقل من 95% من {math_spans}",
                warn=True,
            )
    tp = table_problems(md)
    check("tables", not tp, f"{len(tp)} مشكلة جدول" + (f" — {tp[0]}" if tp else ""))

    if args.docx:
        if not args.docx.is_file():
            check("docx", False, "ملف DOCX مفقود")
        else:
            dm = docx_metrics(args.docx)
            ok = bool(
                dm.get("paragraphs", 0) >= 5
                and (dm.get("arabic") or args.lang == "en")
                and not dm.get("bad_markup")
            )
            check(
                "docx",
                ok,
                f"فقرات {dm.get('paragraphs')} · عربي {dm.get('arabic')} · وسوم {dm.get('bad_markup')}",
            )
    if args.pdf_out:
        if not args.pdf_out.is_file():
            check("pdf", False, "ملف PDF الناتج مفقود")
        else:
            out_pages = pdf_pages(args.pdf_out)
            check("pdf", out_pages > 0, f"{out_pages} صفحة")
    else:
        check("pdf", True, "لم يُطلب PDF", warn=True)

    failed = [c for c in checks if not c["ok"] and not c["warn"]]
    report = {
        "pass": not failed,
        "input_pages": in_pages,
        "output_pages": pages,
        "chars_per_page": cpp,
        "metrics": m,
        "checks": checks,
    }
    if args.json:
        args.json.write_text(
            json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8"
        )

    for c in checks:
        mark = "✅" if c["ok"] else ("⚠️" if c["warn"] else "❌")
        print(f"{mark} {c['name']}: {c['detail']}")
    print(f"\n{'PASS' if report['pass'] else 'FAIL'} — {len(failed)} فشل")
    return 0 if report["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
