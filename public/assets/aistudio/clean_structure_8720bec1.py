#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""clean_structure.py — إصلاح المشاكل البنيوية المتكررة في ملفات Markdown العربية.

  python3 clean_structure.py FILE... [--dry-run]

الإصلاحات (آمنة، تُطبَّق فقط عند تحقّق الشرط):
  S1  سطر ترويسة متسرّب: سطر قصير (<40) يتكرر ≥20 مرة وليس عنوانًا/بندًا → يُبقى أول ورود.
  S2  `**` مفرد: سطر محتواه `**` فقط، أو `**` زائدة في نهاية عنوان.
  S3  مسافات بادئة/لاحقة في العناوين.
  S4  سطران متطابقان متتاليان (تكرار فوري).
"""

from __future__ import annotations

import argparse
import re
from collections import Counter
from pathlib import Path


def clean(lines: list[str]) -> tuple[list[str], dict[str, int]]:
    stats = Counter()
    counts = Counter(l.strip() for l in lines if l.strip())

    def header_leak(s: str) -> bool:
        t = s.strip()
        return (
            counts.get(t, 0) >= 20
            and 3 < len(t) < 40
            and not t.startswith(("#", "|", "-", "*", ">"))
            and not t.endswith((":", "："))
            and not re.match(r"^[٠-٩\d]+[-.)]", t)
            and not re.search(r"[.!؟]$", t)
        )

    out: list[str] = []
    seen_leak: set[str] = set()
    prev = None
    table_cols = None
    for line in lines:
        st = line.strip()
        # S7: توحيد أعمدة الجدول على عدد رأس الجدول
        if st.startswith("|"):
            cells = st.strip("|").split("|")
            if table_cols is None:
                table_cols = len(cells)
            elif not re.fullmatch(r"\|[:\-\s|]+\|", st) and len(cells) != table_cols:
                if len(cells) < table_cols:
                    cells += [""] * (table_cols - len(cells))
                else:
                    cells = cells[: table_cols - 1] + [" ".join(cells[table_cols - 1 :])]
                line = "|" + "|".join(cells) + "|"
                stats["S7"] += 1
        else:
            table_cols = None
        # S8: تقسيم الأسطر الطويلة جدًا عند حدود الجُمل
        if len(line) > 600 and not st.startswith(("|", "```")):
            parts = re.split(r"(?<=[.؟!۔])\s+", line)
            buf = ""
            chunks = []
            for seg in parts:
                if len(buf) + len(seg) > 500 and buf:
                    chunks.append(buf.strip())
                    buf = seg
                else:
                    buf = (buf + " " + seg).strip()
            if buf:
                chunks.append(buf)
            if len(chunks) > 1:
                out.extend(chunks)
                stats["S8"] += 1
                prev = chunks[-1].strip()
                continue
        # S5: ** مفرد داخل السطر
        if st.count("**") % 2 == 1:
            line = line.replace("**", "")
            stats["S5"] += 1
        # S6: «» غير متوازنة داخل السطر
        if line.count("«") > line.count("»"):
            line = line + "»" * (line.count("«") - line.count("»"))
            stats["S6"] += 1
        elif line.count("»") > line.count("«"):
            line = "«" * (line.count("»") - line.count("«")) + line
            stats["S6"] += 1
        s = line.strip()
        if s and header_leak(s):
            if s in seen_leak:
                stats["S1"] += 1
                continue
            seen_leak.add(s)
        if s == "**":
            stats["S2"] += 1
            continue
        if re.match(r"^#{1,6}\s", line):
            fixed = re.sub(r"\s+$", "", line)
            fixed = re.sub(r"\*\*\s*$", "", fixed)
            if fixed != line:
                stats["S3"] += 1
                line = fixed
        if s and s == prev:
            stats["S4"] += 1
            continue
        out.append(line)
        prev = s
    return out, dict(stats)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("paths", nargs="+", type=Path)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    files: list[Path] = []
    for p in args.paths:
        files.extend(sorted(p.rglob("*.md")) if p.is_dir() else [p])
    total = Counter()
    for f in files:
        lines = f.read_text(encoding="utf-8").split("\n")
        new, st = clean(lines)
        if not st:
            continue
        total.update(st)
        if not args.dry_run:
            f.write_text("\n".join(new), encoding="utf-8")
        print(f"{f.name}: {st}")
    print(f"\n{'[معاينة] ' if args.dry_run else ''}الإجمالي: {dict(total)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
