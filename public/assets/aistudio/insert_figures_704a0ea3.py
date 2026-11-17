# -*- coding: utf-8 -*-
"""insert_figures.py — يُدرج صور الصفحات التي فيها رسوم/مخططات داخل Markdown.

الفكرة: OCR يصف الشكل نصًّا `[شكل …]`؛ وللحفاظ على الرسم نفسه نُدرج صورة الصفحة
كامجة بعد نصّها. اختياري: `--figures page` في pipeline.

الاستخدام:
  python3 insert_figures.py raw.md book.pdf out.md --images images/ --dpi 130
"""

from __future__ import annotations

import argparse
import re
import subprocess
from pathlib import Path

FIG = re.compile(r"\[(?:شكل|صورة|مخطط|رسم|خريطة|توضيح)[^\]]*\]", re.I)
MARK = "\n---PAGEBREAK---\n"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("raw", type=Path)
    ap.add_argument("pdf", type=Path)
    ap.add_argument("out", type=Path)
    ap.add_argument("--images", type=Path, required=True)
    ap.add_argument("--dpi", type=int, default=130)
    ap.add_argument("--mode", choices=("page", "math", "all"), default="page")
    args = ap.parse_args()

    text = args.raw.read_text(encoding="utf-8")
    pages = re.split(r"---+\s*PAGE[\s_]?BREAK\s*---+", text, flags=re.I)
    args.images.mkdir(parents=True, exist_ok=True)
    out_pages, n = [], 0
    for i, page in enumerate(pages, 1):
        body = page.strip()
        if args.mode == "all":
            trigger = True
        elif args.mode == "page":
            trigger = FIG.search(body)
        else:
            trigger = re.search(r"\$[^$]+\$", body)
        if trigger and (body or args.mode == "all"):
            prefix = args.images / f"page-{i:03d}"
            subprocess.run(
                [
                    "pdftoppm",
                    "-f",
                    str(i),
                    "-l",
                    str(i),
                    "-r",
                    str(args.dpi),
                    "-png",
                    "-singlefile",
                    str(args.pdf),
                    str(prefix),
                ],
                check=False,
                timeout=120,
            )
            png = prefix.with_suffix(".png")
            if png.is_file():
                body += f"\n\n![صفحة {i}]({png.resolve()})\n"
                n += 1
        out_pages.append(body)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(MARK.join(out_pages), encoding="utf-8")
    print(f"🖼 أُدرجت {n} صورة صفحة")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
