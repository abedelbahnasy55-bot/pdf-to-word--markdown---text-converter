# -*- coding: utf-8 -*-
"""arabic_nlp.py — تطبيع Unicode آمن للنص العربي (بلا تصحيح إملائي).

القاعدة: لا تصحيح إملائي، لا إعادة ترتيب للحروف، لا تخمين.
المسموح فقط:
  1. إزالة محارف التحكم في الاتجاه المعزولة (U+202A–U+202E, U+2066–U+2069,
     U+200E, U+200F).
  2. تحويل Arabic Presentation Forms (A/B) إلى حروف قياسية عبر NFKC لكل محرف.
  3. تطبيع Unicode إلى NFC.
الحركات (tashkeel) والحروف تُحفظ كما هي.
"""

from __future__ import annotations

import re
import unicodedata

# محارف التحكم في bidi المعزولة — تُزال فقط (لا تُستبدل بشيء).
BIDI_CONTROLS = re.compile(r"[\u202a-\u202e\u2066-\u2069\u200e\u200f]")

# Arabic Presentation Forms-A (FB50–FDFF) و Forms-B (FE70–FEFF).
PRESENTATION_FORMS = re.compile(r"[\ufb50-\ufdff\ufe70-\ufeff]")


def strip_bidi_controls(text: str) -> str:
    """يزيل محارف التحكم في الاتجاه المعزولة فقط."""
    return BIDI_CONTROLS.sub("", text)


def unify_presentation_forms(text: str) -> str:
    """يحوّل Arabic Presentation Forms إلى الحروف القياسية (NFKC لكل محرف)."""
    return PRESENTATION_FORMS.sub(
        lambda m: unicodedata.normalize("NFKC", m.group()), text
    )


def normalize_unicode(text: str) -> str:
    """يزيل bidi controls + يحوّل Presentation Forms + يطبّع إلى NFC."""
    text = strip_bidi_controls(text)
    text = unify_presentation_forms(text)
    return unicodedata.normalize("NFC", text)


def word_count(text: str) -> int:
    return len(re.findall(r"\S+", text))


def retention_ratio(raw: str, clean: str) -> float:
    """نسبة الاحتفاظ بالكلمات (raw→clean) — كشف حذف البيانات."""
    rw = word_count(raw)
    if rw == 0:
        return 1.0
    return word_count(clean) / rw


if __name__ == "__main__":
    import sys

    data = sys.stdin.read()
    sys.stdout.write(normalize_unicode(data))
