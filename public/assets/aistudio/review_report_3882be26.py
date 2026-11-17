# -*- coding: utf-8 -*-
"""review_report.py — تقرير مراجعة لكل كتاب محوَّل (MD/TXT/DOCX/PDF + بوابة الجودة).

الاستخدام:
  python3 review_report.py /path/_converted [--json report.json] [--md report.md]
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path


def book_dirs(root: Path) -> list[Path]:
    """مجلدات الكتب = مجلدات فيها qa.json."""
    return sorted({p.parent for p in root.rglob("qa.json")})


def omml_count(docx: Path) -> int:
    try:
        from docx import Document

        xml = Document(docx).element.xml
        return len(re.findall(r"<m:oMath[ >]", xml))
    except Exception:
        return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("root", type=Path)
    ap.add_argument("--json", type=Path, default=None)
    ap.add_argument("--md", type=Path, default=None)
    args = ap.parse_args()

    rows = []
    for d in book_dirs(args.root):
        qa = json.loads((d / "qa.json").read_text(encoding="utf-8"))
        md = next((p for p in d.glob("*.md") if not p.name.endswith(".raw.md")), None)
        docx = next(d.glob("*.docx"), None)
        pdf = next((p for p in d.glob("*.pdf") if p.parent == d), None)
        txt = next(d.glob("*.txt"), None)
        out_pages = qa.get("output_pages")
        if isinstance(out_pages, list):
            out_pages = len(out_pages)
        bad = [
            f"{c['name']}: {c['detail']}"
            for c in qa.get("checks", [])
            if not c.get("ok") and not c.get("warn")
        ]
        rows.append(
            {
                "book": d.name,
                "path": str(d),
                "pass": bool(qa.get("pass")),
                "source_pages": qa.get("input_pages"),
                "output_pages": out_pages,
                "chars": len(md.read_text(encoding="utf-8")) if md else 0,
                "omml": omml_count(docx) if docx else 0,
                "has_txt": bool(txt),
                "failures": bad,
            }
        )

    ok = [r for r in rows if r["pass"]]
    print(f"books={len(rows)} pass={len(ok)} fail={len(rows) - len(ok)}")
    for r in rows:
        if not r["pass"]:
            print(f"  ✗ {r['book'][:60]} :: {'; '.join(r['failures'])[:100]}")
    if args.json:
        args.json.write_text(
            json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8"
        )
    if args.md:
        lines = [
            "# تقرير مراجعة التحويل",
            "",
            f"- الكتب: **{len(rows)}** · ناجح: **{len(ok)}** · فاشل: **{len(rows) - len(ok)}**",
            "",
            "| الكتاب | صفحات الأصل | صفحات PDF | أحرف | معادلات | TXT | الحكم |",
            "|---|---|---|---|---|---|---|",
        ]
        for r in rows:
            lines.append(
                f"| {r['book'][:50]} | {r['source_pages']} | {r['output_pages']} "
                f"| {r['chars']:,} | {r['omml']} | {'✓' if r['has_txt'] else '—'} "
                f"| {'✅' if r['pass'] else '❌ ' + '; '.join(r['failures'])[:60]} |"
            )
        args.md.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
