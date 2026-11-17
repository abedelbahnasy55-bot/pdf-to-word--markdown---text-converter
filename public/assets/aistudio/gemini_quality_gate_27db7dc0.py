# -*- coding: utf-8 -*-
"""gemini_quality_gate.py — مراجعة Gemini إلزامية على النص النهائي.

لا يعيد كتابة الكتاب. يطلب من Gemini **أخطاء لغوية حتمية فقط**، ويطبّقها
بشكل آمن: كل تصحيح يجب أن يطابق سطرًا معيّنًا حرفيًا، وإلا يُرفض ولا يُمس النص.

الاستخدام:
  python3 gemini_quality_gate.py book.md --dry-run --report qa-gemini.json
  python3 gemini_quality_gate.py book.md --apply --report qa-gemini.json
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import os
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import atomic_write, die, read_json, resolve_key, write_json  # noqa: E402
from keypool import KeyPool  # noqa: E402

BASE = "https://generativelanguage.googleapis.com"
GEN = BASE + "/v1beta/models/{model}:generateContent"
QUALITY_MODELS = (
    "gemini-3.8-flash,gemini-3.7-flash,gemini-3.5-flash,gemini-flash-latest"
)

PROMPT = """أنت محرر لغوي صرفي عربي أكاديمي. لديك النص التالي مرقّمًا بأسطر ابتداءً من السطر {start_line}.
اكتشف فقط الأخطاء اللغوية والإملائية والصرفية **الحتمية** (مثل حرف زائد/ناقص، عبارة مشوّهة لغويًا).
ممنوع منعًا باتًا إعادة صياغة الجمل أو تغيير الأسلوب أو تغيير الأرقام أو التشكيل أو بنية Markdown أو الأقواس أو الاصطلاح الصرفي المقصود في الأمثلة.
أعد JSON فقط بالشكل:
{{"corrections":[{{"line":123,"old":"النص الحرفي من السطر نفسه","new":"التصحيح فقط","reason":"سبب قصير"}}]}}
القواعد الصارمة:
- لا تُرجع أكثر من {max_corrections} تصحيحًا.
- old يجب أن تكون موجودة حرفيًا في السطر line المذكور.
- new يجب أن تغير الخطأ فقط ولا تمس باقي السطر.
- أي تصحيح غير مؤكد أو أسلوبي أو تجميلي احذفه.
- لا تُرجع شرحًا خارج JSON.

النص:
{numbered_text}"""


def split_chunks(text: str, max_lines: int = 350) -> list[tuple[int, list[str]]]:
    lines = text.splitlines(True)
    chunks: list[tuple[int, list[str]]] = []
    for start in range(0, len(lines), max_lines):
        chunks.append((start + 1, lines[start : start + max_lines]))
    return chunks


def parse_response(text: str) -> list[dict]:
    """يقبل JSON إما وحده أو داخل markdown code fence، ويعيد قائمة التصحيحات."""
    candidate = text.strip()
    fence = re.search(r"```(?:json)?\s*(.*?)```", candidate, re.S | re.I)
    if fence:
        candidate = fence.group(1).strip()
    if candidate.count("{") > 1:
        start, end = candidate.find("{"), candidate.rfind("}")
        candidate = candidate[start : end + 1]
    try:
        data = json.loads(candidate)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Gemini لم يُرجع JSON صالحًا: {exc}") from exc
    corrections = data.get("corrections", []) if isinstance(data, dict) else []
    out: list[dict] = []
    for item in corrections:
        if not isinstance(item, dict):
            continue
        try:
            line = int(item["line"])
        except (KeyError, TypeError, ValueError):
            continue
        old, new, reason = (
            item.get("old", ""),
            item.get("new", ""),
            item.get("reason", ""),
        )
        if isinstance(old, str) and isinstance(new, str) and old and new and old != new:
            out.append(
                {
                    "line": line,
                    "old": old,
                    "new": new,
                    "reason": str(reason)[:200],
                }
            )
    return out


def validate_and_apply(
    text: str, corrections: list[dict]
) -> tuple[str, list[dict], list[dict]]:
    """يطبق التصحيحات الآمنة ويُرجع (النص، المطبَّق، المرفوض)."""
    lines = text.splitlines(True)
    applied: list[dict] = []
    rejected: list[dict] = []
    for item in corrections:
        line_number = int(item["line"])
        if line_number < 1 or line_number > len(lines):
            rejected.append({**item, "reason": "سطر خارج النطاق"})
            continue
        line = lines[line_number - 1]
        if line.count(item["old"]) != 1:
            rejected.append({**item, "reason": "old غير فريدة في السطر"})
            continue
        if len(item["new"]) > max(3 * len(item["old"]), len(item["old"]) + 40):
            rejected.append({**item, "reason": "التصحيح أوسع من الحد المسموح"})
            continue
        lines[line_number - 1] = line.replace(item["old"], item["new"], 1)
        applied.append(item)
    return "".join(lines), applied, rejected


def call_model(
    key: str, model: str, prompt: str, max_output_tokens: int = 4096
) -> tuple[str, dict]:
    body = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.1,
            "maxOutputTokens": max_output_tokens,
            "responseMimeType": "application/json",
        },
    }
    req = urllib.request.Request(
        GEN.format(model=model),
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json", "x-goog-api-key": key},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=300) as response:
        payload = json.loads(response.read())
    candidate = (payload.get("candidates") or [{}])[0]
    text = "".join(
        part.get("text", "")
        for part in ((candidate.get("content") or {}).get("parts") or [])
    )
    return text, payload


def run_quality_gate(
    md_path: Path,
    *,
    apply: bool,
    max_lines: int,
    max_corrections: int,
    models: list[str],
    key_file: str | None,
) -> dict:
    original = md_path.read_text(encoding="utf-8")
    if key_file:
        os.environ["GEMINI_API_KEY"] = resolve_key(key_file)
    pool = KeyPool(models=models)
    chunks = split_chunks(original, max_lines=max_lines)
    all_corrections: list[dict] = []
    errors: list[str] = []

    for start_line, chunk_lines in chunks:
        numbered = "".join(
            f"{start_line + index:4d}| {line}" for index, line in enumerate(chunk_lines)
        )
        prompt = PROMPT.format(
            start_line=start_line,
            max_corrections=max_corrections,
            numbered_text=numbered,
        )
        chosen = None
        last_error = ""
        for slot in pool.plan():
            if slot.model not in models:
                continue
            try:
                text, _ = call_model(slot.key, slot.model, prompt)
                pool.consume(slot.key, slot.model, pages=1)
                chosen = parse_response(text)
                errors.append(f"{slot.model}: ok")
                break
            except urllib.error.HTTPError as exc:
                detail = exc.read()[:300].decode("utf-8", "ignore")
                last_error = f"{slot.model}: HTTP {exc.code} {detail[:120]}"
                if exc.code == 429:
                    continue
                # نموذج غير يدعم responseMimeType أو prompt كبير: جرّب التالي فقط عند 400/422
                if exc.code not in (400, 422):
                    raise RuntimeError(last_error) from exc
            except Exception as exc:  # noqa: BLE001 - ندوّر على النماذج بدل كسر الحارس
                last_error = f"{slot.model}: {type(exc).__name__}: {exc}"
        if chosen is None:
            raise RuntimeError(f"تعذرت مراجعة القطعة {start_line}: {last_error}")
        all_corrections.extend(chosen[: max_corrections - len(all_corrections)])

    updated, applied, rejected = validate_and_apply(original, all_corrections)
    if apply and applied:
        atomic_write(md_path, updated)
    return {
        "input": str(md_path),
        "chunks": len(chunks),
        "corrections_found": len(all_corrections),
        "applied": len(applied),
        "rejected": len(rejected),
        "changes_written": bool(apply and applied),
        "report": {"applied": applied, "rejected": rejected},
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="بوابة Gemini لغوية إلزامية قبل اعتماد النص"
    )
    parser.add_argument("md", type=Path)
    parser.add_argument(
        "--apply", action="store_true", help="اكتب التصحيحات المقبولة فقط"
    )
    parser.add_argument("--report", type=Path, default=None)
    parser.add_argument("--max-lines", type=int, default=350)
    parser.add_argument("--max-corrections", type=int, default=50)
    parser.add_argument("--models", default=QUALITY_MODELS)
    parser.add_argument("--key-file", default=None)
    args = parser.parse_args()
    if not args.md.is_file():
        die(f"الملف غير موجود: {args.md}", 2)
    models = [m.strip() for m in args.models.split(",") if m.strip()]
    try:
        report = run_quality_gate(
            args.md,
            apply=args.apply,
            max_lines=args.max_lines,
            max_corrections=args.max_corrections,
            models=models,
            key_file=args.key_file,
        )
    except RuntimeError as exc:
        if args.report:
            write_json(args.report, {"error": str(exc)})
        die(str(exc), 3)
    if args.report:
        write_json(args.report, report)
    print(json.dumps(report, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
