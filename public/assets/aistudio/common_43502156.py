# -*- coding: utf-8 -*-
"""أدوات مشتركة: قراءة/كتابة آمنة، تشغيل أوامر، وطباعة أخطاء موحّدة."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path


def eprint(*args, **kwargs) -> None:
    print(*args, file=sys.stderr, **kwargs)


def die(msg: str, code: int = 2) -> "NoReturn":  # noqa: F821
    eprint(f"⛔ {msg}")
    raise SystemExit(code)


def run(
    cmd: list[str], *, timeout: int = 600, check: bool = True
) -> subprocess.CompletedProcess:
    """يشغّل أمرًا ويعيد النتيجة؛ يرفع خطأً واضحًا عند الفشل."""
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    except FileNotFoundError as exc:
        die(f"الأمر غير موجود: {cmd[0]} ({exc})")
    if check and r.returncode != 0:
        tail = (r.stdout + r.stderr).strip()[-400:]
        die(f"فشل الأمر: {' '.join(cmd[:3])} …\n{tail}", code=1)
    return r


def atomic_write(path: str | Path, text: str) -> None:
    """كتابة ذرّية: ملف مؤقت ثم os.replace — لا تفقد الحالة عند الانقطاع."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=path.name + ".", dir=str(path.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(text)
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


def write_json(path: str | Path, data) -> None:
    atomic_write(path, json.dumps(data, ensure_ascii=False, indent=1))


def read_json(path: str | Path, default=None):
    p = Path(path)
    if not p.is_file():
        return default
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return default


def pdf_pages(pdf: str | Path) -> int:
    """عدد صفحات PDF عبر pdfinfo."""
    r = run(["pdfinfo", str(pdf)], timeout=60, check=False)
    if r.returncode != 0:
        die(f"تعذّر قراءة PDF: {pdf}")
    for line in r.stdout.splitlines():
        if line.startswith("Pages:"):
            return int(line.split()[-1])
    die(f"لا يوجد عدد صفحات في: {pdf}")


def resolve_key(cli_key_file: str | None = None) -> str:
    """مفتاح Gemini: --key-file ← GEMINI_API_KEY ← ~/.config/ocr/gemini_key."""
    if cli_key_file:
        p = Path(cli_key_file).expanduser()
        if p.is_file():
            return p.read_text(encoding="utf-8").strip()
        die(f"ملف المفتاح غير موجود: {p}")
    env = os.environ.get("GEMINI_API_KEY", "").strip()
    if env:
        return env
    default = Path("~/.config/ocr/gemini_key").expanduser()
    if default.is_file():
        return default.read_text(encoding="utf-8").strip()
    die(
        "لا يوجد مفتاح Gemini. ضع المفتاح في ~/.config/ocr/gemini_key "
        "أو صدّر GEMINI_API_KEY أو استخدم --key-file."
    )
