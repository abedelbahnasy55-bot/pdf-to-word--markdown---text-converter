#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""keypool.py — إدارة مفاتيح Gemini وحصصها لتحويل آلاف الصفحات يوميًا مجانًا.

الفكرة: الحصة المجانية 20 طلبًا/يوم/**لكل موديل**، والطلب ≤10 صفحات.
    20 × 10 = 200 صفحة/موديل/مفتاح. مع 8 موديلات = 1,600 صفحة/مفتاح/يوم.
    ومع 5 مفاتيح = 8,000 صفحة/يوم. الباقي يُحوَّل بـTesseract محليًا (بلا حصة).

الاستخدام:
    from keypool import KeyPool
    pool = KeyPool(models=[...], keys=[...])
    for attempt in pool.plan():           # (key, model) صالح اليوم
        ...
        pool.consume(key, model, pages=10)

المفاتيح: GEMINI_API_KEY_1..N أو ملف ~/.config/ocr/gemini_keys (سطر لكل مفتاح).
الحالة: ~/.cache/pdf2book/keypool.json (ذرّية، تُصفَّر يوميًا).
"""
from __future__ import annotations

import json, os, time
from dataclasses import dataclass
from datetime import date
from pathlib import Path

STATE = Path.home() / ".cache" / "pdf2book" / "keypool.json"
LIMIT = int(os.environ.get("GEMINI_DAILY_LIMIT", "20"))     # طلب/موديل/يوم
PAGES = int(os.environ.get("GEMINI_PAGES_PER_REQ", "10"))   # صفحة/طلب


def load_keys() -> list[str]:
    keys = [v for k, v in sorted(os.environ.items()) if k.startswith("GEMINI_API_KEY_") and v]
    f = Path.home() / ".config" / "ocr" / "gemini_keys"
    if f.is_file():
        keys += [l.strip() for l in f.read_text(encoding="utf-8").splitlines() if l.strip() and not l.startswith("#")]
    single = os.environ.get("GEMINI_API_KEY") or ""
    if single:
        keys.append(single)
    old = Path.home() / ".config" / "ocr" / "gemini_key"
    if old.is_file():
        keys.append(old.read_text(encoding="utf-8").strip())
    seen, out = set(), []
    for k in keys:
        if k and k not in seen:
            seen.add(k); out.append(k)
    return out


@dataclass
class Slot:
    key: str
    model: str
    used: int = 0

    @property
    def left(self) -> int:
        return max(0, LIMIT - self.used)


class KeyPool:
    def __init__(self, models: list[str], keys: list[str] | None = None, state: Path = STATE):
        self.models = models
        self.keys = keys if keys is not None else load_keys()
        self.state = state
        self.data = self._load()

    def _load(self) -> dict:
        today = date.today().isoformat()
        try:
            d = json.loads(self.state.read_text(encoding="utf-8"))
        except Exception:
            d = {}
        if d.get("day") != today:
            d = {"day": today, "used": {}}
        return d

    def _save(self) -> None:
        self.state.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.state.with_suffix(".tmp")
        tmp.write_text(json.dumps(self.data, ensure_ascii=False), encoding="utf-8")
        os.replace(tmp, self.state)

    def _k(self, key: str, model: str) -> str:
        return f"{key[-6:]}:{model}"

    def plan(self) -> list[Slot]:
        """كل الخانات المتاحة اليوم، الأقل استهلاكًا أولًا (توزيع عادل)."""
        slots = []
        for key in self.keys:
            for model in self.models:
                used = self.data["used"].get(self._k(key, model), 0)
                if used < LIMIT:
                    slots.append(Slot(key, model, used))
        slots.sort(key=lambda s: s.used)
        return slots

    def consume(self, key: str, model: str, pages: int = PAGES) -> None:
        k = self._k(key, model)
        self.data["used"][k] = self.data["used"].get(k, 0) + 1
        self._save()

    def capacity(self) -> dict:
        slots = self.plan()
        reqs = sum(s.left for s in slots)
        return {
            "keys": len(self.keys),
            "models": len(self.models),
            "requests_left": reqs,
            "pages_left": reqs * PAGES,
            "per_key_per_day": LIMIT * PAGES * len(self.models),
        }

    @staticmethod
    def is_quota_error(err: Exception | str) -> bool:
        s = str(err).lower()
        return any(x in s for x in ("429", "resource_exhausted", "quota", "exceeded"))

    @staticmethod
    def is_key_error(err: Exception | str) -> bool:
        s = str(err).lower()
        return any(x in s for x in ("403", "api key", "permission", "invalid key", "401"))
