# -*- coding: utf-8 -*-
"""table_extract.py — استخراج الجداول من PDF مع الحفاظ على الترتيب المنطقي وRTL.

المسار:
  1. PyMuPDF ``Page.find_tables(strategy="text")`` لتحديد هندسة الشبكة (bbox).
  2. نص الخلايا يُبنى من ``get_text("words")`` (ترتيب منطقي + bbox لكل كلمة)
     بتكليس الكلمات داخل خلايا الشبكة — لا من نصوص find_tables المعكوسة.
  3. pdfplumber كمسار احتياطي/مقارنة عند فشل find_tables أو رفض كل مرشّحاته.
  4. كل خلية تمرّ عبر normalize_unicode (NFC + إزالة bidi controls +
     Presentation Forms ← حروف قياسية). الحركات والحروف لا تُمسّ.
  5. اتجاه الأعمدة: كشف auto من خطوط الصفحة (الكلمة الأولى يمين الأخيرة ⇒ RTL)،
     أو فرض --direction. عند الغموض لا تُعاد ترتيب الأعمدة وتُخفَّض الثقة.
  6. حُرّاس صدق: تغطية الكلمات داخل الشبكة ≥ 80%، امتلاء الخلايا ≥ 50%،
     وعمودان+ وصفّان+ — وإلا يُرفض المرشّح (لا تخمين، لا ترحيل إلى Word).
  7. --expect-header "أ,ب,ج": توقيع صف الترويسة — يتحقق من الاتجاه ويُثبّت
     ترتيب الأعمدة. غير موجود ⇒ لا إعادة ترتيب + تخفيض الثقة.

المخرجات:
  <name>.tables.json — كل المرشّحين (حتى المرفوضين) مع الخلايا/bbox/page/confidence.
  <name>.tables.md  — الجداول المقبولة فقط (Markdown بأعمدة متساوية).

رموز الخروج: 0 نجاح (≥ جدول مقبول) · 2 لا جداول · 3 وُجدت لكن رُفضت كلها · 1 خطأ استخدام/IO.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from arabic_nlp import normalize_unicode  # noqa: E402

import pymupdf  # noqa: E402

ARABIC = re.compile(r"[\u0600-\u06FF]")
WORD_LINE_TOL = 4.0  # تسامح y لتجميع كلمات السطر الواحد
COVERAGE_MIN = 0.80  # الشبكة يجب أن تغطي ≥80% من كلمات منطقة الجدول
FILL_MIN = 0.50  # ≥50% من الخلايا غير فارغة
MAX_CELL_CHARS = 300  # خلية أطول من هذا = تسرّب صفحة كاملة


def parse_pages(spec: str, page_count: int) -> list[int]:
    if not spec:
        return list(range(page_count))
    pages: set[int] = set()
    for part in spec.split(","):
        part = part.strip()
        if not part:
            continue
        if "-" in part:
            a, b = part.split("-", 1)
            pages.update(range(int(a), int(b) + 1))
        else:
            pages.add(int(part))
    bad = [p for p in pages if p < 1 or p > page_count]
    if bad:
        raise ValueError(f"صفحات خارج المدى 1..{page_count}: {bad}")
    return sorted(p - 1 for p in pages)


def parse_clip(spec: str | None):
    if not spec:
        return None
    try:
        x0, y0, x1, y1 = (float(v) for v in spec.split(","))
    except ValueError:
        raise ValueError("--clip يجب أن يكون x0,y0,x1,y1 بأرقام (نقاط)")
    if not (x0 < x1 and y0 < y1):
        raise ValueError("--clip: x0<x1 و y0<y1 مطلوبان")
    return pymupdf.Rect(x0, y0, x1, y1)


def page_direction(words: list[tuple]) -> tuple[str, float]:
    """يكشف اتجاه الصفحة من ترتيب الكلمات: أول كلمة يمين آخر كلمة ⇒ rtl."""
    lines: dict[float, list[tuple]] = {}
    for w in words:
        cy = (w[1] + w[3]) / 2
        key = min(lines, key=lambda k: abs(k - cy), default=None)
        if key is not None and abs(key - cy) <= WORD_LINE_TOL:
            lines[key].append(w)
        else:
            lines[cy] = [w]
    rtl = ltr = 0
    for ws in lines.values():
        ws = [w for w in ws if ARABIC.search(w[4])]
        if len(ws) < 3:
            continue
        first, last = ws[0], ws[-1]
        if (first[0] + first[2]) / 2 > (last[0] + last[2]) / 2:
            rtl += 1
        else:
            ltr += 1
    total = rtl + ltr
    if total == 0:
        return "ambiguous", 0.5
    if rtl >= 2 * ltr:
        return "rtl", rtl / total
    if ltr >= 2 * rtl:
        return "ltr", ltr / total
    return "ambiguous", max(rtl, ltr) / total


def cell_text(words: list[tuple], rect, direction: str) -> str:
    """يبني نص الخلية من الكلمات الواقعة داخلها (مركز الكلمة داخل الخلية)."""
    x0, y0, x1, y1 = rect
    ws = [
        w
        for w in words
        if x0 <= (w[0] + w[2]) / 2 <= x1 and y0 <= (w[1] + w[3]) / 2 <= y1
    ]
    if not ws:
        return ""
    lines: list[list[tuple]] = []
    for w in sorted(ws, key=lambda w: (w[1], w[0])):
        for lw in lines:
            if abs((lw[0][1] + lw[0][3]) / 2 - (w[1] + w[3]) / 2) <= WORD_LINE_TOL:
                lw.append(w)
                break
        else:
            lines.append([w])
    lines.sort(key=lambda lw: min(w[1] for w in lw))
    out_lines = []
    for lw in lines:
        key = (
            (lambda w: -(w[0] + w[2]) / 2)
            if direction != "ltr"
            else (lambda w: (w[0] + w[2]) / 2)
        )
        out_lines.append(" ".join(w[4] for w in sorted(lw, key=key)))
    return normalize_unicode(" ".join(out_lines))


def coverage_ratio(words: list[tuple], cells: list[tuple], bbox) -> float:
    """نسبة كلمات منطقة الجدول (bbox) المُسنَدة فعلًا إلى خلايا."""
    x0, y0, x1, y1 = bbox
    inside = [
        w
        for w in words
        if x0 <= (w[0] + w[2]) / 2 <= x1 and y0 <= (w[1] + w[3]) / 2 <= y1
    ]
    if not inside:
        return 0.0
    assigned = 0
    for w in inside:
        cx, cy = (w[0] + w[2]) / 2, (w[1] + w[3]) / 2
        if any(c and c[0] <= cx <= c[2] and c[1] <= cy <= c[3] for c in cells):
            assigned += 1
    return assigned / len(inside)


def grid_from_pymupdf(tab):
    """(cells, row_count, col_count) من مرشّح PyMuPDF — القيم None تُملأ بأصفار."""
    rows, cols = tab.row_count, tab.col_count
    if cols < 1 or rows < 1 or not tab.cells:
        return [], rows, cols
    cells = list(tab.cells)
    if len(cells) != rows * cols:
        return [], rows, cols
    return cells, rows, cols


def grid_from_pdfplumber(tab):
    cells = [c for row in (tab.cells or []) for c in row]
    rows, cols = len(tab.cells or []), (len(tab.cells[0]) if tab.cells else 0)
    if cols < 1 or rows < 1:
        return [], rows, cols
    if len(cells) != rows * cols:
        return [], rows, cols
    return [tuple(c) if c else None for c in cells], rows, cols


def build_table(
    page_no: int,
    words,
    grid,
    bbox,
    direction: str,
    dir_score: float,
    strategy: str,
    expect_header: list[str] | None,
    min_confidence: float,
) -> dict:
    cells, rows, cols = grid
    warnings: list[str] = []
    total = rows * cols
    filled = 0
    matrix: list[list[str]] = []
    for r in range(rows):
        row = []
        for c in range(cols):
            rect = cells[r * cols + c]
            text = cell_text(words, rect, direction) if rect else ""
            row.append(text)
            if text:
                filled += 1
        matrix.append(row)
    fill_ratio = filled / total if total else 0.0
    cov = coverage_ratio(words, cells, bbox)
    arabic_ratio = sum(len(ARABIC.findall(t)) for row in matrix for t in row) / max(
        1, sum(len(t) for row in matrix for t in row)
    )
    avg_cell = sum(len(t) for row in matrix for t in row) / max(1, filled)

    rejected: list[str] = []
    if cols < 2:
        rejected.append("zero_or_one_column")
    if rows < 2:
        rejected.append("single_row")
    if fill_ratio < FILL_MIN:
        rejected.append(f"low_fill_{fill_ratio:.2f}")
    if cov < COVERAGE_MIN:
        rejected.append(f"grid_covers_{cov:.0%}_of_words")
    if avg_cell > MAX_CELL_CHARS:
        rejected.append("cell_bleed_whole_page")

    # ترتيب الأعمدة: RTL ⇒ المنطقي هو المعكوس من ترتيب الشبكة (يسار→يمين)
    col_order = list(range(cols))
    if direction == "rtl":
        col_order.reverse()
    elif direction == "ambiguous":
        warnings.append("direction_ambiguous_columns_not_reordered")

    # توقيع الترويسة (اختياري): يتحقق من الاتجاه ويثبّت الترتيب
    header_status = "not_requested"
    if expect_header:
        sig = [normalize_unicode(h).strip() for h in expect_header]
        first_row = next((row for row in matrix if any(row)), [])
        logical_row = [first_row[i] for i in col_order] if first_row else []
        direct = [c.strip() for c in logical_row]
        rev_ok = [c.strip() for c in reversed(logical_row)]
        if direct == sig:
            header_status = "matched"
        elif rev_ok == sig:
            col_order = list(reversed(col_order))
            header_status = "matched_after_column_flip"
            warnings.append("columns_flipped_to_match_header_signature")
        else:
            header_status = "missing"
            warnings.append("header_signature_missing")

    confidence = round(0.5 * fill_ratio + 0.5 * dir_score, 2)
    if "header_signature_missing" in warnings:
        confidence = round(confidence * 0.6, 2)
    elif header_status == "matched":
        confidence = round(min(1.0, confidence + 0.1), 2)
    if direction == "ambiguous":
        confidence = round(confidence * 0.5, 2)
    if rejected:
        confidence = min(confidence, 0.2)

    status = "ok" if not rejected and confidence >= min_confidence else "rejected"
    if status == "rejected" and not rejected:
        rejected.append(f"confidence_{confidence}_below_{min_confidence}")

    logical_matrix = [[row[i] for i in col_order] for row in matrix]
    out_cells = []
    for r, row in enumerate(logical_matrix):
        for c, text in enumerate(row):
            rect = cells[r * cols + col_order[c]]
            out_cells.append(
                {
                    "page": page_no,
                    "row": r,
                    "col": c,
                    "text": text,
                    "bbox": [round(v, 2) for v in rect] if rect else None,
                }
            )
    return {
        "page": page_no,
        "strategy": strategy,
        "bbox": [round(v, 2) for v in bbox],
        "rows": rows,
        "cols": cols,
        "direction": direction,
        "direction_score": round(dir_score, 2),
        "fill_ratio": round(fill_ratio, 2),
        "coverage": round(cov, 2),
        "arabic_ratio": round(arabic_ratio, 2),
        "header": header_status,
        "confidence": confidence,
        "status": status,
        "rejected_reasons": rejected,
        "warnings": warnings,
        "cells": out_cells,
        "matrix": logical_matrix,
    }


def candidates_pymupdf(page, clip):
    try:
        tabs = page.find_tables(strategy="text", clip=clip)
    except Exception as exc:  # لا نخفي الخطأ — يُبلَّغ كتحذير
        return [], [f"pymupdf_find_tables_failed: {exc}"]
    out = []
    for t in tabs.tables:
        cells, rows, cols = grid_from_pymupdf(t)
        if not cells:
            continue
        out.append((cells, rows, cols, tuple(t.bbox), "pymupdf-text"))
    return out, []


def candidates_pdfplumber(pdf_path: Path, page_no: int, clip, page_height: float):
    try:
        import pdfplumber
    except ImportError:
        return [], ["pdfplumber_not_installed"]
    out = []
    with pdfplumber.open(str(pdf_path)) as pdf:
        pg = pdf.pages[page_no - 1]
        settings = {
            "vertical_strategy": "text",
            "horizontal_strategy": "text",
            "snap_tolerance": 3,
            "join_tolerance": 3,
            "intersection_tolerance": 3,
            "text_tolerance": 3,
        }
        try:
            tables = pg.find_tables(table_settings=settings)
        except Exception as exc:
            return [], [f"pdfplumber_find_tables_failed: {exc}"]
        for t in tables:
            cells, rows, cols = grid_from_pdfplumber(t)
            if not cells:
                continue
            x0, top, x1, bottom = t.bbox
            # pdfplumber: الأصل أعلى اليسار — نحوّل إلى إحداثيات PyMuPDF (أسفل اليسار)
            bbox = (x0, page_height - bottom, x1, page_height - top)
            conv = []
            for c in cells:
                if c is None:
                    conv.append(None)
                else:
                    cx0, ctop, cx1, cbottom = c
                    conv.append((cx0, page_height - cbottom, cx1, page_height - ctop))
            out.append((conv, rows, cols, bbox, "pdfplumber-text"))
    return out, []


def md_escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace("|", "\\|").replace("\n", " ").strip()


def table_to_markdown(t: dict) -> str:
    rows = [[md_escape(c) for c in row] for row in t["matrix"]]
    rows = [r for r in rows if any(r)]
    if len(rows) < 2:
        return ""
    cols = t["cols"]
    rows = [r + [""] * (cols - len(r)) for r in rows]
    lines = [
        f"<!-- table: page={t['page']} rows={len(rows)} cols={cols} "
        f"confidence={t['confidence']} direction={t['direction']} -->",
        "| " + " | ".join(rows[0]) + " |",
        "| " + " | ".join(["---"] * cols) + " |",
    ]
    lines += ["| " + " | ".join(r) + " |" for r in rows[1:]]
    return "\n".join(lines) + "\n"


def main() -> int:
    ap = argparse.ArgumentParser(
        description="استخراج الجداول من PDF (PyMuPDF أولًا، pdfplumber احتياطي) مع RTL/logical order.",
    )
    ap.add_argument("pdf", type=Path)
    ap.add_argument(
        "--pages", default="", help="صفحات 1-based، مثال: 6,14 أو 3-5 (افتراضي: الكل)"
    )
    ap.add_argument(
        "--strategy", choices=("auto", "text", "pdfplumber"), default="auto"
    )
    ap.add_argument("--direction", choices=("auto", "rtl", "ltr"), default="auto")
    ap.add_argument("--clip", default=None, help="x0,y0,x1,y1 بنقاط PDF لحصر الاستخراج")
    ap.add_argument(
        "--expect-header",
        default=None,
        help="توقيع الترويسة مفصولًا بفواصل، مثال: الكلمة,همزتها,حكمها",
    )
    ap.add_argument("--min-confidence", type=float, default=0.6)
    ap.add_argument("--out-dir", type=Path, default=Path.cwd())
    ap.add_argument(
        "--name", default=None, help="اسم أساس المخرجات (افتراضي: اسم الـ PDF)"
    )
    args = ap.parse_args()

    if not args.pdf.is_file():
        print(f"خطأ: ملف غير موجود: {args.pdf}", file=sys.stderr)
        return 1
    try:
        clip = parse_clip(args.clip)
        page_list = parse_pages(args.pages, pymupdf.open(str(args.pdf)).page_count)
    except ValueError as exc:
        print(f"خطأ: {exc}", file=sys.stderr)
        return 1

    expect_header = None
    if args.expect_header:
        expect_header = [h for h in args.expect_header.split(",") if h.strip()]

    doc = pymupdf.open(str(args.pdf))
    results: list[dict] = []
    global_warnings: list[str] = []
    for pno in page_list:
        page = doc[pno]
        words = page.get_text("words")
        if args.direction == "auto":
            direction, dir_score = page_direction(words)
        else:
            direction, dir_score = args.direction, 1.0

        cands: list = []
        warns: list[str] = []
        if args.strategy in ("auto", "text"):
            cands, warns = candidates_pymupdf(page, clip)
        if args.strategy == "pdfplumber" or (args.strategy == "auto" and not cands):
            ph, pw = candidates_pdfplumber(args.pdf, pno + 1, clip, page.rect.height)
            if cands:
                global_warnings.append(
                    f"page {pno + 1}: pymupdf produced candidates; pdfplumber skipped"
                )
            else:
                cands, warns = (ph, warns + pw)
        global_warnings.extend(f"page {pno + 1}: {w}" for w in warns)

        for cells, rows, cols, bbox, strategy in cands:
            results.append(
                build_table(
                    pno + 1,
                    words,
                    (cells, rows, cols),
                    bbox,
                    direction,
                    dir_score,
                    strategy,
                    expect_header,
                    args.min_confidence,
                )
            )

    args.out_dir.mkdir(parents=True, exist_ok=True)
    name = args.name or args.pdf.stem
    json_path = args.out_dir / f"{name}.tables.json"
    ok_tables = [t for t in results if t["status"] == "ok"]
    payload = {
        "source": str(args.pdf),
        "pages": [p + 1 for p in page_list],
        "tables_found": len(results),
        "tables_accepted": len(ok_tables),
        "warnings": global_warnings,
        "tables": [{k: v for k, v in t.items() if k != "matrix"} for t in results],
        "matrices": [t["matrix"] for t in ok_tables],
    }
    json_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    md_path = None
    if ok_tables:
        md_path = args.out_dir / f"{name}.tables.md"
        md_path.write_text(
            "\n".join(filter(None, (table_to_markdown(t) for t in ok_tables))),
            encoding="utf-8",
        )

    summary = {
        "pdf": str(args.pdf),
        "pages": [p + 1 for p in page_list],
        "tables_found": len(results),
        "tables_accepted": len(ok_tables),
        "rejected": [
            {
                "page": t["page"],
                "reasons": t["rejected_reasons"],
                "coverage": t["coverage"],
                "fill_ratio": t["fill_ratio"],
            }
            for t in results
            if t["status"] != "ok"
        ],
        "json": str(json_path),
        "markdown": str(md_path) if md_path else None,
        "warnings": global_warnings,
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))

    if not results:
        return 2
    if not ok_tables:
        return 3
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
