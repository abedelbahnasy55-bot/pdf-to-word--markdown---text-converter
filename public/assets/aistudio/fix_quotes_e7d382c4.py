#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""fix_quotes.py — يطبّق مخرجات verify_quotes.py على الملفات (إصلاح جذري مُتحقَّق).

الاستخدام:
  python3 fix_quotes.py audit.json [--dry-run] [--only Q001,Q003,T001,T002,T004] [--limit N]

الضمانات:
  1) لا يلمس إلا الأسطر المذكورة في التقرير.
  2) كل استبدال يُتحقّق منه بتحرير السطر ومقارنة النصّ قبل/بعد.
  3) بعد التطبيق يعيد التشغيل الذاتي (verify) ويطبع الفرق.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
VERSE_RE = re.compile(r"([﴿{])([^﴾}]*)([﴾}])")
SAFE = {"Q001", "Q002", "Q003", "Q005", "T001", "T002", "T004"}


def verse_matches(line: str):
    return list(VERSE_RE.finditer(line))


def apply_finding(line: str, f: dict) -> tuple[str, bool]:
    code = f["code"]
    idx = f.get("ordinal", -1)
    body = f.get("excerpt", "")
    sug = f.get("suggestion", "")

    if code in ("Q001", "Q002", "Q003", "Q005", "T001"):
        matches = verse_matches(line)
        if idx < 0 or idx >= len(matches):
            # احتياط: أول مقطع مطابق نصًّا
            for k, m in enumerate(matches):
                if m.group(2).strip() == body:
                    idx = k
                    break
            else:
                return line, False
        m = matches[idx]
        if m.group(2).strip() != body:
            return line, False
        if not sug:
            return line, False
        sm = re.match(r"([﴿{][^﴾}]*[﴾}])\s*(\[[^\]]*\])?\s*$", sug.strip())
        new_verse = sm.group(1) if sm else sug.strip()
        new_ref = sm.group(2) if sm else None
        rest = line[m.end():]
        tail_ref = re.match(r"\s*(\[[^\]]*\])?", rest)
        if tail_ref and tail_ref.group(1):
            rest = rest[tail_ref.end():]
            rest = " " + (new_ref if code in ("Q001", "Q003") and new_ref else tail_ref.group(1)) + rest
        elif new_ref and code in ("Q001", "Q003"):
            rest = " " + new_ref + rest
        return line[:m.start()] + new_verse + rest, True

    if code == "T002":
        new = unicodedata.normalize("NFKC", line)
        new = new.replace("ی", "ي").replace("ک", "ك").replace("ـ", "")
        return new, new != line

    if code == "T004":
        new = re.sub(r"(?<=[\u0621-\u064A])\s+([،؛؟!])", r"\1", line)
        return new, new != line

    return line, False


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("audit", type=Path)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--only", default=",".join(sorted(SAFE)))
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--no-verify", action="store_true")
    args = ap.parse_args()

    codes = {c.strip() for c in args.only.split(",") if c.strip()}
    data = json.loads(args.audit.read_text(encoding="utf-8"))
    by_file: dict[str, list[dict]] = defaultdict(list)
    for f in data:
        if f["code"] in codes:
            by_file[f["file"]].append(f)

    total = 0
    touched: list[Path] = []
    for path, items in by_file.items():
        p = Path(path)
        if not p.is_file():
            continue
        lines = p.read_text(encoding="utf-8").split("\n")
        per_line: dict[int, list[dict]] = defaultdict(list)
        for it in items:
            per_line[it["line"]].append(it)
        changed = 0
        for ln, group in sorted(per_line.items(), reverse=True):
            if ln - 1 >= len(lines):
                continue
            line = lines[ln - 1]
            # الآيات أولًا (Q) ثم التنسيق
            for it in sorted(
                group,
                key=lambda x: (x["code"] not in ("Q001", "Q003"), x.get("ordinal", 0)),
                reverse=True,
            ):
                new, ok = apply_finding(line, it)
                if ok:
                    line = new
                    changed += 1
            if line != lines[ln - 1]:
                lines[ln - 1] = line
        if changed:
            total += changed
            touched.append(p)
            if not args.dry_run:
                p.write_text("\n".join(lines), encoding="utf-8")

    print(
        f"{'[معاينة] ' if args.dry_run else ''}أُصلح {total} موضعًا في {len(touched)} ملفًا"
    )
    for t in touched[:20]:
        print("  ·", t.name)

    if touched and not args.dry_run and not args.no_verify:
        print("\n— تحقّق بعد الإصلاح —")
        r = subprocess.run(
            [
                sys.executable,
                str(HERE / "verify_quotes.py"),
                *[str(t) for t in touched],
                "--max-print",
                "0",
            ],
            capture_output=True,
            text=True,
        )
        tail = [l for l in r.stdout.splitlines() if l.strip()][:12]
        print("\n".join(tail))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
