# -*- coding: utf-8 -*-
"""structure.py — إضافة عناوين Markdown تلقائيًا (Gemini) مع تحقق صارم.

القاعدة: لا يتغير حرف من النص؛ يُضاف فقط `#` في بداية أسطر العناوين.
إن اختلف الناتج عن الأصل بأكثر من 0.5% ⇒ يُرفض ويُعاد الأصل.

الاستخدام:
  python3 structure.py clean.md structured.md [--model gemini-3.5-flash-lite]
"""

from __future__ import annotations

import argparse
import difflib
import json
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

from common import atomic_write, die, resolve_key

BASE = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
PROMPT = """أنت محرّر بنية فقط. أمامك نصّ كتاب عربي منظّف.

المهمة: أضف عناوين Markdown (`#` للباب/الجزء، `##` للفصل/المبحث، `###` للدرس/الفرع)
في بداية الأسطر التي هي عناوين فعلية، اعتمادًا على الخطّ الأصلي والسياق.

قيود صارمة:
1. لا تغيّر أي كلمة أو حرف أو ترقيم أو ترتيب.
2. لا تحذف ولا تضف نصًّا؛ الإضافة الوحيدة المسموحة هي `#` ومسافة في بداية سطر عنوان.
3. لا تحوّل فقرة عادية إلى عنوان إن لم تكن عنوانًا واضحًا.
4. أعد النصّ كاملًا كما هو مع العناوين فقط.
5. لا مقدمات ولا تعليقات.

النصّ:
---
{text}
---
"""


def call_gemini(text: str, key: str, model: str, timeout: int = 600) -> str:
    body = {
        "contents": [{"parts": [{"text": PROMPT.format(text=text)}]}],
        "generationConfig": {"temperature": 0.0, "maxOutputTokens": 65536},
    }
    req = urllib.request.Request(
        BASE.format(model=model),
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json", "x-goog-api-key": key},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            data = json.loads(r.read())
    except urllib.error.HTTPError as e:
        die(f"Gemini HTTP {e.code}: {e.read()[:160]!r}", 1)
    parts = ((data.get("candidates") or [{}])[0].get("content") or {}).get(
        "parts"
    ) or []
    out = "".join(p.get("text", "") for p in parts).strip()
    if not out:
        die("رد فارغ من النموذج", 1)
    return out


def strip_headings(text: str) -> str:
    """يزيل علامات العناوين لمقارنة المحتوى."""
    lines = []
    for line in text.split("\n"):
        lines.append(re.sub(r"^#{1,6}\s+", "", line))
    return re.sub(r"\s+", " ", "\n".join(lines)).strip()


def validate(original: str, structured: str) -> tuple[bool, float, str]:
    a, b = strip_headings(original), strip_headings(structured)
    ratio = difflib.SequenceMatcher(None, a, b).ratio()
    added = structured.count("\n#") - original.count("\n#")
    return ratio >= 0.995, ratio, f"تشابه {ratio:.4%} · عناوين مضافة ~{added}"


def split_chunks(text: str, limit: int) -> list[str]:
    """تقسيم آمن إلى قطع ≤ limit حرفًا على حدود الأسطر."""
    if len(text) <= limit:
        return [text]
    chunks, cur, size = [], [], 0
    for line in text.split("\n"):
        if cur and size + len(line) + 1 > limit:
            chunks.append("\n".join(cur))
            cur, size = [], 0
        cur.append(line)
        size += len(line) + 1
    if cur:
        chunks.append("\n".join(cur))
    return chunks


def main() -> int:
    ap = argparse.ArgumentParser(description="إضافة عناوين Markdown تلقائيًا مع تحقق")
    ap.add_argument("src", type=Path)
    ap.add_argument("dst", type=Path)
    ap.add_argument("--model", default="gemini-3.5-flash-lite")
    ap.add_argument("--key-file", default=None)
    ap.add_argument("--report", type=Path, default=None)
    ap.add_argument("--max-chars", type=int, default=120000)
    args = ap.parse_args()

    if not args.src.is_file():
        die(f"ملف مفقود: {args.src}")
    text = args.src.read_text(encoding="utf-8")
    chunks = split_chunks(text, args.max_chars)
    key = resolve_key(args.key_file)
    outs, details = [], []
    for ch in chunks:
        s = call_gemini(ch, key, args.model)
        ok, ratio, detail = validate(ch, s)
        if not ok:
            atomic_write(args.dst, text)
            print(f"⚠️ رفض قطعة ({detail}) — استُخدم الأصل دون تغيير.", file=sys.stderr)
            return 3
        outs.append(s)
        details.append(detail)
    structured = "\n".join(outs)
    ok, ratio, detail = validate(text, structured)
    rep = {"ok": ok, "ratio": ratio, "detail": detail, "model": args.model, "chunks": len(chunks)}
    if args.report:
        atomic_write(args.report, json.dumps(rep, ensure_ascii=False, indent=1))
    if not ok:
        atomic_write(args.dst, text)
        print(f"⚠️ رفض البنية ({detail}) — استُخدم الأصل دون تغيير.", file=sys.stderr)
        return 3
    atomic_write(args.dst, structured + ("\n" if not structured.endswith("\n") else ""))
    print(f"✅ بنية مقبولة: {detail}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
