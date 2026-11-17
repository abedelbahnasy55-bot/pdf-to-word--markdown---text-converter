# -*- coding: utf-8 -*-
"""clean_md.py — تنظيف نص OCR/PDF وتجهيزه لبناء كتاب عربي.

يدخل ملف Markdown خام (بفواصل صفحات) ويخرج:
  • Markdown منظّف بعناوين # و## حيث تُعرَف بنية الكتاب.
  • تقرير JSON بكل ما أُزيل (ترويسات/تذييلات/أرقام صفحات/تكرار).

الاستخدام:
  python3 clean_md.py raw.md clean.md --report report.json
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from collections import defaultdict
from difflib import SequenceMatcher
from pathlib import Path

PAGE_MARKERS = re.compile(
    r"^\s*(?:-{2,}\s*PAGE[\s_]?BREAK\s*-{1,3}>?|<!--\s*page\s*:?\s*(\d+)\s*-->)\s*$", re.I
)
PAGE_NUMBER = re.compile(
    r"^\s*[-–—(]?\s*(?:صفحة\s*)?"
    r"(?:[٠-٩0-9]{1,3}\s*[-–]\s*[٠-٩0-9]{1,3}|[٠-٩0-9]{1,4})"
    r"\s*[-–—)]?\s*$"
)
FOOTER = re.compile(
    r"^\s*(?:[٠-٩\d]{1,3}\s+)?الصف\s+.{2,25}\s+[-–]\s+كتاب\s+.{2,20}\s*$"
)
ARTIFACT = re.compile(
    r"(CamScanner|PAGE\s*BREAK|Screenshot|تم\s*المسح|ماسح\s*ضوئي|"
    r"^\s*(?:watermark|www\.|https?://)\S*\s*$)",
    re.I,
)
LIST_ITEM = re.compile(
    r"^\s*(?:[٠-٩0-9]{1,3}\s*[.)\-ـ]|[أ-يa-zA-Z]\s*[.)]|[•*\-–—]\s)\s*\S"
)
HEAD_STRONG = re.compile(
    r"^\s*(?:ال)?(الباب|الفصل|المبحث|الدرس|الوحدة|المقدمة|الخاتمة|التمهيد)\b"
)
HEAD_NUM = re.compile(r"^\s*[#]{1,3}\s+\S")
HEAD_ORD = re.compile(r"^\s*(?:أول|ثان|ثالث|رابع|خامس|سادس|سابع|ثامن|تاسع|عاشر)(?:ًا|اً|ا|ة)?\s*[:：]")
POETRY = re.compile(r"(…|\.\.\.|\*\s*$)")
TABLE = re.compile(r"\|")
SENT_END = re.compile(r"[.!؟:؛»)\]\}]\s*$")
DIACRITICS = re.compile(r"^[\u064B-\u0652\u0670\u0640\s]+$")
BIDI = re.compile(r"[\u202a-\u202e\u2066-\u2069\u200e\u200f]")
ARABIC = re.compile(r"[\u0600-\u06FF]")

HEADING_MAP = {
    "الباب": "#",
    "الفصل": "##",
    "المبحث": "##",
    "الدرس": "##",
    "الوحدة": "##",
    "المقدمة": "##",
    "الخاتمة": "##",
    "التمهيد": "##",
}


_LETTER_FOLD = str.maketrans(
    {"أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا", "ى": "ي", "ة": "ه", "ؤ": "و", "ئ": "ي"}
)


def norm_key(line: str) -> str:
    """مفتاح لمقارنة الترويسات: حروف عربية فقط، موحّد الحروف، بلا أرقام ولا تشكيل.

    يُزيل أرقام الصفحات (اللاتنية والعربية-الهندية) والتشكيل، ويوحّد الهمزات
    و«ة/ه» و«ى/ي» — لأن OCR يكتب نفس الترويسة بأشكال مختلفة من صفحة لأخرى،
    فتفشل المطابقة الحرفية وتتسرّب الترويسة إلى متن الكتاب.
    """
    s = re.sub(r"[٠-٩0-9]", "", line)
    s = re.sub(r"[\u064B-\u0652\u0670\u0640]", "", s)
    s = re.sub(r"[^\u0600-\u06FF]+", "", s)
    return s.translate(_LETTER_FOLD).strip()


def _cluster(keys: list[str], ratio: float = 0.72) -> dict[str, str]:
    """يربط كل مفتاح بتمثيل عنقوده المتقارب، من الأطول إلى الأقصر.

    «الصرف الميسر للصف الثالث الثانوي» و«الرصف امليرس للصف الثالث الثانوي»
    ترويسة واحدة في المسح؛ بلا تجميع لا تبلغ أيّتاها حدّ التكرار فتبقى
    الترويسة داخل المتن.
    """
    roots: list[str] = []
    owner: dict[str, str] = {}
    for k in sorted(set(keys), key=len, reverse=True):
        best = k
        for r in roots:
            if SequenceMatcher(None, k, r).ratio() >= ratio:
                best = r
                break
        if best == k:
            roots.append(k)
        owner[k] = best
    return owner


def split_pages(text: str) -> list[list[str]]:
    pages: list[list[str]] = []
    cur: list[str] = []
    for raw in text.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        if PAGE_MARKERS.match(raw):
            pages.append(cur)
            cur = []
            continue
        cur.append(raw)
    pages.append(cur)
    return pages


def drop_running_heads(pages: list[list[str]]) -> tuple[list[list[str]], dict]:
    """يحذف الترويسات/التذييلات المتكررة في أعلى/أسفل الصفحات.

    الاعتماد على مطابقة حرفية وحده يُبقي ترويسة المسح الرديء: كل صفحة تكتبها
    برسم مختلف، فلا يبلغ أيّ رسم حدّ التكرار. لذلك تُطوي المفاتيح في عناقيد
    متقاربة ثم يُقارن عدد الصفحات لكل عنقود.
    """
    if len(pages) < 4:
        return pages, {"removed": 0}
    counts: dict[str, set[int]] = defaultdict(set)
    positions: list[tuple[int, int, str]] = []
    keys: list[str] = []
    for pi, lines in enumerate(pages):
        nonempty = [i for i, l in enumerate(lines) if l.strip()]
        edge = set(nonempty[:3] + nonempty[-3:])
        for li in edge:
            if "![" in lines[li] or "](" in lines[li]:
                continue
            key = norm_key(lines[li])
            if 4 <= len(key) <= 80:
                keys.append(key)
                positions.append((pi, li, key))
    owner = _cluster(keys)
    for pi, li, key in positions:
        counts[owner[key]].add(pi)
    limit = max(3, int(len(pages) * 0.3))
    bad = {c for c, v in counts.items() if len(v) >= limit}
    removed = 0
    seen_pos: set[tuple[int, int]] = set()
    for pi, li, key in positions:
        if owner[key] in bad and (pi, li) not in seen_pos:
            seen_pos.add((pi, li))
            pages[pi][li] = ""
            removed += 1
    return pages, {"removed": removed, "patterns": sorted(bad)[:10]}


def strip_noise(lines: list[str]) -> tuple[list[str], dict]:
    out, stats = [], {"page_numbers": 0, "artifacts": 0, "empty": 0}
    for line in lines:
        s = line.rstrip()
        if PAGE_NUMBER.match(s):
            stats["page_numbers"] += 1
            continue
        if ARTIFACT.search(s):
            stats["artifacts"] += 1
            continue
        if not s.strip():
            stats["empty"] += 1
            out.append("")
            continue
        out.append(s)
    return out, stats


ICON = re.compile(r"\[\s*صورة\s*:\s*أيقونة\s*([^\]]*)\]\s*(?:\1)?")
BOOKHEAD = re.compile(r"^\s*(?:[٠-٩\d]{1,3}\s+)?كتاب\s+.{3,50}\s+[-–]\s+.{1,25}\s*$")
PRES = re.compile(r"[\uFB50-\uFEFF]")
ROW = re.compile(r"\s{3,}")


EXTRA_LETTERS = str.maketrans(
    {"\u06cc": "\u064a", "\u06a9": "\u0643", "\u06be": "\u0647", "\u06c1": "\u0647", "\u06d2": "\u064a"}
)


def unify_letters(s: str) -> str:
    """يحوّل الأشكال العرضية والحروف الفارسية إلى حروف عربية قياسية."""
    s = PRES.sub(lambda m: unicodedata.normalize("NFKC", m.group()), s)
    return s.translate(EXTRA_LETTERS)


def classify(line: str) -> str:
    s = line.strip()
    if HEAD_NUM.match(s):
        return "heading"
    if HEAD_STRONG.match(s) and len(s) <= 80:
        return "heading"
    if HEAD_ORD.match(s) and len(s) <= 80:
        return "heading"
    if TABLE.search(s):
        return "table"
    if LIST_ITEM.match(s):
        return "list"
    if POETRY.search(s):
        return "poetry"
    if s.startswith(">"):
        return "quote"
    if not s.startswith("$") and ROW.search(s):
        return "row"
    return "prose"


def merge_wrapped(lines: list[str]) -> list[str]:
    """يدمج الأسطر المكسورة من OCR مع الحفاظ على العناوين/القوائم/الشعر/الجداول."""
    out: list[str] = []
    for line in lines:
        s = line.rstrip()
        if not s.strip():
            if out and out[-1] != "":
                out.append("")
            continue
        if not out or out[-1] == "":
            out.append(s)
            if classify(s) == "row":
                out.append("")
            continue
        prev = out[-1]
        pc, cc = classify(prev), classify(s)
        if cc == "row":
            out.append(s)
            out.append("")
            continue
        poetry_prev = bool(POETRY.search(prev)) or prev.lstrip().startswith(">")
        if (
            pc in ("prose", "list")
            and cc == "prose"
            and not poetry_prev
            and not SENT_END.search(prev)
        ):
            out[-1] = prev + " " + s
        else:
            out.append(s)
    while out and out[-1] == "":
        out.pop()
    return out


# عنوان الدرس في كتب المعاهد الأزهرية: سطرٌ اسمي قصير يفتتح الدرس ويعقبه
# «أهداف الدرس». دون هذا الرابط تُدمَج العناوين في المتن، فينساب الدرس إلى
# الدرس الذي يليه بلا فاصل — وهو بالضبط ما يشتكي منه القارئ.
GOALS = re.compile(
    r"(أهداف\s+الدرس|الأهداف\s+التربوية|الهدف\s+التربوي|بنهاية\s+الدرس|"
    r"نحو\s+تحقيق\s+الهدف)"
)
NOT_A_TITLE = re.compile(
    r"^(?:[-•*|>#!٠-٩0-9(（\[«»]|قال|قالَ|يقول|مثال|أمثلة|التدريبات|تمرين|"
    r"اختر|علل|عرّف|اذكر|أجب|ضع|بيّن|هات|متى|ما\s|من\s|كيف|لماذا|أين)"
)
# These open their own page with their own «أهداف الدرس» block, but they are
# subdivisions of a chapter (موضع within الإبدال), not chapters themselves.
SUBTOPIC = re.compile(
    r"^(?:الموضع|المواضع|الصورة|الصور|الحالة|الحالات|النوع|الأنواع|القاعدة|الفرع)\b"
)


def _topic_line(s: str) -> bool:
    """سطر اسمي قصير يصلح عنوانًا لدرس أو باب."""
    if not s or len(s) > 45 or NOT_A_TITLE.match(s):
        return False
    if s.rstrip().endswith(("،", "۔", ":", "：")) or len(s.split()) > 6:
        return False
    if GOALS.search(s):  # «أهداف الدرس» نفسه ليس عنوان درس
        return False
    return bool(re.search(r"[\u0600-\u06FF]", s))


def split_glued_title(s: str) -> tuple[str, str] | None:
    """«الإبدال والإعلال أهداف الدرس …» → (العنوان، بقية السطر)."""
    m = GOALS.search(s)
    if not m or m.start() < 3:
        return None
    head, tail = s[: m.start()].strip(), s[m.start() :].strip()
    if not _topic_line(head) or len(tail) < 4:
        return None
    return head, tail


def promote_headings(lines: list[str]) -> tuple[list[str], int]:
    out, count = [], 0
    src = [l.strip() for l in lines]
    for i, line in enumerate(lines):
        s = line.strip()
        if not s or HEAD_NUM.match(s):
            out.append(line)
            continue
        s2 = re.sub(r"^[><\s]+", "", s)

        # (أ) عنوان ملتصق بمتن الأهداف
        glued = split_glued_title(s2)
        if glued:
            out.append(f"{'##' if SUBTOPIC.match(glued[0]) else '#'} {glued[0]}")
            out.append(f"## {glued[1]}")
            count += 2
            continue

        m = HEAD_STRONG.match(s2)
        if m and len(s2) <= 80:
            level = HEADING_MAP.get(m.group(1), "##")
            out.append(f"{level} {s2}")
            count += 1
        elif HEAD_ORD.match(s2) and len(s2) <= 80:
            out.append("## " + s2)
            count += 1
        elif _topic_line(s2) and any(
            GOALS.search(n) for n in src[i + 1 : i + 6] if n
        ):
            # عنوان يفتتح صفحة وله «أهداف الدرس»: بابٌ إن كان اسم موضوع،
            # وقسمٌ داخلي إن كان «الموضع/الصورة/الحالة» داخل الباب
            level = "##" if SUBTOPIC.match(s2) else "#"
            out.append(f"{level} {s2}")
            count += 1
        else:
            out.append(line)
    return out, count


LATEX_SYMBOLS = {
    "$\\checkmark$": "✓",
    "$\\times$": "✗",
    "$(\\checkmark)$": "✓",
    "$(\\times)$": "✗",
    "$(\\quad)$": "( )",
    "$\\quad$": " ",
    "$\\qquad$": " ",
}


def latex_clean(s: str) -> str:
    """ينظّف النصّ خارج الرياضيات فقط؛ لا يمسّ $...$ أو $$...$$ الحقيقية."""
    # OCR/Gemini يضاعف الشرطة المائلة: $\\checkmark$ ← $\checkmark$
    s = re.sub(r"\\\\(checkmark|times|quad|qquad|text|left|right|langle|rangle|stackrel)",
               r"\\\1", s)
    # مراجع الحواشي ليست رياضيات: $^{(1)}$ و${}^{(1)}$ ← (1)
    s = re.sub(r"\$\{\s*\}\^\(\s*(\d{1,3})\s*\)\$", r" (\1)", s)
    # $_{ْ}$ أثر تشكيل مفصول — يُحذف
    s = re.sub(r"\$_\{[^{}]*\}\$", "", s)
    # $\text{...}$ تسمية نصية لا معادلة
    s = re.sub(r"\$\\text\{([^{}]*)\}\$", r"\1", s)
    # رياضيات وهمية من OCR عربي: $\left\langle\text{آية}\right\rangle$
    # و$\stackrel{َ}{\text{كلمة}}$ — Gemini يغلّف الآيات والكلمات المُشكّلة
    # بـ$...$ ظنًّا أنها معادلات. تُفكّ إلى النصّ وحده (﴿﴾ للآيات).
    def _unwrap(m: "re.Match") -> str:
        inner = m.group(1)
        if "¿" in inner:
            return m.group(0)  # رياضيات مشوّهة: تُزال في سطر لاحق
        # رياضيات حقيقية برقم/رمز رياضي: تُترك كما هي ($س^2$، $\vec{أ}$)
        if re.search(r"[\^_+=<>]|\\(?:vec|frac|sqrt|binom|begin|end|sum|int|lim)\b", inner):
            return m.group(0)
        texts = re.findall(r"\\text\{([^{}]*)\}", inner)
        if texts:
            body = " ".join(texts).strip()
            if r"\langle" in inner:
                return "﴿" + body + "﴾"
            return body
        if r"\langle" in inner or r"\stackrel" in inner:
            plain = re.sub(r"\\[a-zA-Z]+\s*\{([^{}]*)\}", r"\1", inner)
            plain = re.sub(r"\\[a-zA-Z]+", "", plain).strip(" {}")
            if re.search(r"[؀-ۿ]", plain):
                return plain
        return m.group(0)

    s = re.sub(r"\$([^$]{1,400})\$", _unwrap, s)
    for src, dst in LATEX_SYMBOLS.items():
        s = s.replace(src, dst)

    s = re.sub(r"\$[^$]*¿[^$]*\$", "", s)  # رياضيات مشوّهة

    def clean_text(part: str) -> str:
        part = part.replace("\\quad", " ").replace("\\qquad", " ")
        part = re.sub(r"\\[a-zA-Z]+\s*", " ", part)
        return part

    parts = re.split(r"(\$\$.+?\$\$|\$[^$]+\$)", s, flags=re.S)
    out = []
    for i, part in enumerate(parts):
        out.append(part if i % 2 else clean_text(part))
    return "".join(out)


AR_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789")


def normalize_math(s: str) -> str:
    """يوحّد الرياضيات: أرقام غربية + تدوين التوافيق إلى \\binom (يمنع مربعات OMML)."""
    def fix(inner: str) -> str:
        for cmd, ch in (("\\،", "،"), ("\\؛", "؛"), ("\\؟", "؟"), ("\\٪", "٪")):
            inner = inner.replace(cmd, ch)
        inner = re.sub(r"\\(?=\s)", " ", inner)
        inner = inner.translate(AR_DIGITS)
        # ^{ح}_7 ⇒ ح_7 (إزالة القاعدة الفارغة)
        inner = re.sub(r"\^\s*\{?([\u0600-\u06FF])\}?\s*_", r"\1_", inner)
        # \text{ن} ⇒ ن (لتعمل قاعدة التوافيق)
        inner = re.sub(r"\\text\{([\u0600-\u06FF])\}", r"\1", inner)
        # _{22}\text{Ti} ⇒ \text{Ti}_{22} (منع المربع الفارغ)
        inner = re.sub(r"^\s*_\{([^{}]*)\}\s*(\\text\{[^{}]*\}|[A-Za-z]+)",
                       lambda m: m.group(2) + "_{" + m.group(1) + "}", inner)
        inner = re.sub(r"^\s*_([A-Za-z0-9]+)\s*(\\text\{[^{}]*\}|[A-Za-z]+)",
                       lambda m: m.group(2) + "_{" + m.group(1) + "}", inner)
        inner = inner.replace("\\begin{vmatrix}", "\\left|\\begin{matrix}")
        inner = inner.replace("\\end{vmatrix}", "\\end{matrix}\\right|")
        inner = inner.replace("\\begin{Vmatrix}", "\\left\\|\\begin{matrix}")
        inner = inner.replace("\\end{Vmatrix}", "\\end{matrix}\\right\\|")
        inner = inner.replace("\\begin{bmatrix}", "\\left[\\begin{matrix}")
        inner = inner.replace("\\end{bmatrix}", "\\end{matrix}\\right]")
        inner = inner.replace("\\begin{pmatrix}", "\\left(\\begin{matrix}")
        inner = inner.replace("\\end{pmatrix}", "\\end{matrix}\\right)")
        inner = re.sub(r"\{\}\^\{([^{}]*)\}\s*ق_(\{[^{}]*\}|[^\s{}])",
                       lambda m: "\\binom{" + m.group(1).strip() + "}{" + m.group(2).strip("{} ") + "}",
                       inner)
        inner = re.sub(r"\^\{([^{}]*)\}\s*ق_(\{[^{}]*\}|[^\s{}])",
                       lambda m: "\\binom{" + m.group(1).strip() + "}{" + m.group(2).strip("{} ") + "}",
                       inner)
        return inner

    s = re.sub(r"\$\$(.+?)\$\$", lambda m: "$$" + fix(m.group(1)) + "$$", s, flags=re.S)
    s = re.sub(r"\$([^$]+)\$", lambda m: "$" + fix(m.group(1)) + "$", s)
    return s


def normalize_hamza(s: str) -> str:
    """يصلح سقوط همزة القطع في كلمات محفوظة لا لبس فيها.

    هذا إصلاح OCR/تحرير معجمي ضيق، لا إعادة تشكيل لغوية عامة. تُترك
    «ان» وحدها إلا في سياقات شائعة واضحة حتى لا تُبدَّل أن/إن بمجرد حدس.
    """

    replacements = {
        "اي": "أي",
        "الي": "إلى",
        "اليه": "إليه",
        "اذا": "إذا",
        "احمد": "أحمد",
        "ابو": "أبو",
        "ازهر": "الأزهر",
        "اسلام": "إسلام",
        "ادب": "أدب",
        "اهل": "أهل",
        "اهم": "أهم",
        "اول": "أول",
        "او": "أو",
        "اكل": "أكل",
    }
    for bare, fixed in replacements.items():
        s = re.sub(
            rf"(?<![A-Za-z\u0590-\u06FF\u064B-\u065F]){bare}(?![A-Za-z\u0590-\u06FF\u064B-\u065F])",
            fixed,
            s,
        )

    s = re.sub(r"(?<![A-Za-z\u0590-\u06FF\u064B-\u065F])ان\s+[\u064B-\u065F]\s+الحق", "إنّ الحق", s)
    s = re.sub(r"(?<![A-Za-z\u0590-\u06FF\u064B-\u065F])ان ان\b", "إن إن", s)
    s = re.sub(r"(?<![A-Za-z\u0590-\u06FF\u064B-\u065F])ان ما\b", "إن ما", s)
    s = re.sub(r"(?<![A-Za-z\u0590-\u06FF\u064B-\u065F])إلا ان\b", "إلا أن", s)
    s = re.sub(r"(?<![A-Za-z\u0590-\u06FF\u064B-\u065F])ان الجنة\b", "أن الجنة", s)
    # «ان» الملتبسة: تُصلح فقط حيث السياق شبه محسوم.
    s = re.sub(r"(?<![A-Za-z\u0590-\u06FF\u064B-\u065F])ان فيه\b", "إن فيه", s)
    s = re.sub(r"(?<![A-Za-z\u0590-\u06FF\u064B-\u065F])ان كان\b", "إن كان", s)
    s = re.sub(r"(?<![A-Za-z\u0590-\u06FF\u064B-\u065F])ان هذه\b", "إن هذه", s)
    s = re.sub(r"(?<![A-Za-z\u0590-\u06FF\u064B-\u065F])ان هذا\b", "إن هذا", s)
    s = re.sub(r"(?<![A-Za-z\u0590-\u06FF\u064B-\u065F])ان الله\b", "إن الله", s)
    s = re.sub(r"(?<![A-Za-z\u0590-\u06FF\u064B-\u065F])ان محمد\b", "إن محمد", s)
    s = re.sub(r"(?<![A-Za-z\u0590-\u06FF\u064B-\u065F])ان هو\b", "إن هو", s)
    s = re.sub(r"(?<![A-Za-z\u0590-\u06FF\u064B-\u065F])ان هي\b", "إن هي", s)
    s = re.sub(r"(?<![A-Za-z\u0590-\u06FF\u064B-\u065F])ان هم\b", "إن هم", s)
    s = re.sub(r"(?<![A-Za-z\u0590-\u06FF\u064B-\u065F])ان هن\b", "إن هن", s)
    s = re.sub(r"(?<![A-Za-z\u0590-\u06FF\u064B-\u065F])(قال|قيل|ظن|زعم|علم|عرف|فهم|رأى|سمع|وجد|بدا|بان|تبين|اتضح|ذكر|بين|دل|اشار|صرح|اكد|اثبت|اظهر|اخبر|حدث|روى|جاء|ورد|ثبت|صح|جاز|وجب|امكن|تعين|لزم|يلزم|يحسن|يصح|ينبغي|يجوز)\s+ان\b", r"\1 أن", s)
    # سياقات مصدرية شائعة: «ان» بعد أفعال/أسماء تقتضي المصدر أو قبل فعل
    s = re.sub(r"(?<![A-Za-z\u0590-\u06FF\u064B-\u065F])ان\s+(?=[يتأن][^\s]*(\s|$))", "أن ", s)
    s = re.sub(r"(?<![A-Za-z\u0590-\u06FF\u064B-\u065F])ان\s+(لا|لم|لن|ما|من|كان|كانت|كانوا|كانو|يكون|شاء|وقع|حدث|ثبت)\b", "أن \1", s)
    s = re.sub(r"(?<![A-Za-z\u0590-\u06FF\u064B-\u065F])(الصواب|الصحيح|يرى|يُرى|بيان|اتبع ذلك ببيان|أوحى إليه|بعدما|قبل|اشترط|لها|له|علي|عليه|عند|لدى|صحت|لم تصح|يستحب|يرجح|الراجح|شرط|حكم|مسألة|سؤال|جواب)\s+ان\b", r"\1 أن", s)
    s = re.sub(r"(?<![A-Za-z\u0590-\u06FF\u064B-\u065F])ان\s+-\s+ان\b", "أن - أن", s)
    s = re.sub(r"\(ان\)", "(إن)", s)
    s = re.sub(r"(?<![A-Za-z\u0590-\u06FF\u064B-\u065F])ان ما\b", "إن ما", s)
    # «ان لم» الشرطية في أول الجملة/بعد ترقيم: «٥ ان لم يصلوا» → «إن»
    s = re.sub(r"(^|\n|\s)([٠-٩0-9]+)\s+ان لم\b", r"\1\2 إن لم", s)
    s = re.sub(r"(^|\n)ان لم\b", r"\1إن لم", s)
    return s


def normalize_punct(s: str) -> str:
    """يصحّح علامات الترقيم العربية: مسافة قبلها ممنوعة، ومسافة بعدها لازمة عند اللزوم.

    القواعد (آمنة على النصوص المدرسية + الآيات + الشعر):
    - حذف المسافة قبل: ، ؛ : ؟ . ! ، (بما فيها «؟.» بدل «؟ .» و«؛ ،» بدل « ؛»)
    - إضافة مسافة بعد ، ؛ : ؟ . ! إذا تلاها حرف/رقم (لا بعدها إذا تلاها قوس
      أو قوس معقوف أو علامة اقتباس أو نهاية السطر)
    - توحيد النقاط المكررة في نهاية الجملة خارج الفراغات المقصودة:
      «..» (شعر) تبقى كما هي — فاصل الشطرين في المدارس — لكن «...» ثلاث
      نقاط متتالية تبقى نقاط حذف، أما «....» (أربع+) فتُقصَّر إلى «...»
    - إزالة مسافة زائدة قبل القوس الختامي/القوس المعقوف/علامة الاقتباس
    - طيّ المسافات المتعددة (عدا صفوف الجداول)
    """
    if not s.strip():
        return ""
    s = normalize_hamza(s)
    # أثر OCR: سطر يبدأ بنقطة زائدة «. نص» — تُحذف النقطة البادئة
    s = re.sub(r"^\s*\.\s+", "", s)
    # حماية فراغات الإجابة المنقّطة الطويلة (..........) من تقصير النقاط: تُستبدل
    # برمز مؤقت ثم تُعاد كما هي بعد قواعد الترقيم.
    blanks: list[str] = []

    def _stash_blank(m: re.Match[str]) -> str:
        blanks.append(m.group(0))
        return f"\uE000{len(blanks) - 1}\uE001"

    s = re.sub(r"\.{8,}", _stash_blank, s)
    # فاصل الشعر « .. » يُحفظ كفاصل مستقل لا كعلامة ترقيم ملتصقة
    poetry: list[str] = []

    def _stash_poetry(m: re.Match[str]) -> str:
        poetry.append(m.group(0))
        return f"\uE002{len(poetry) - 1}\uE003"

    s = re.sub(r"(?<!\S)\.\.(?!\S)", _stash_poetry, s)
    # مسافة قبل علامة ترقيم = خطأ طباعي
    s = re.sub(r"\s+([،؛:؟.!])", r"\1", s)
    # مسافة بعد العلامة إذا تلاها حرف/رقم (وليس قوسًا/اقتباسًا/نهاية،
    # ولا علامة ترقيم أخرى مثل «؟» بعد نقطة)
    s = re.sub(r"([،؛:؟.!])(?=[A-Za-z\u0600-\u066F0-9])(?![،؛:؟.!])", r"\1 ", s)
    # لا مسافة قبل قوس ختامي فقط؛ لا نمسّ علامات الاقتباس لأن موضعها يختلف
    # بين الفتح والغلق في المخطوطات والمسح الضوئي.
    s = re.sub(r"\s+([)\]﴾])", r"\1", s)
    # تقصير سلسلة نقاط متوسطة (4-7)؛ الطويلة المحفوظة أعلاه لا تُمسّ
    s = re.sub(r"\.{4,7}", "...", s)
    # حذف علامة نقطة زائدة بعد علامة إنهاء أخرى: «؟.» / «!.» / «؛.» → تبقى الأولى
    s = re.sub(r"([؟!؛])\.(?=[\s\)\]\}]|$)", r"\1", s)
    # فاصلة زائدة بعد علامة إنهاء: «؟،» / «!،» → تبقى علامة الإنهاء
    s = re.sub(r"([؟!])،", r"\1", s)
    if not ROW.search(s):
        s = re.sub(r"[ \t]{2,}", " ", s)
    s = re.sub(r"\uE000(\d+)\uE001", lambda m: blanks[int(m.group(1))], s)
    s = re.sub(r"\uE002(\d+)\uE003", lambda m: poetry[int(m.group(1))], s)
    return s.strip()


def _row_cols(line: str) -> int:
    return len([c for c in line.strip().strip("|").split("|")])


NOISE_LINE = re.compile(
    r"^\s*(?:[٠-٩0-9]{1,4}|[-–—_.•*]{1,6}|PAGE\s*BREAK.*|---+)\s*$", re.I
)


def normalize_tables(lines: list[str]) -> list[str]:
    """يوحّد صفوف الجداول: نفس عدد الأعمدة لكل صف، مع الحفاظ على الفاصل.

    الجدول الواحد يتمدّد على صفحتين في المسح الضوئي، فيفصل بينهما فاصل فارغ
    أو سطر ترويسة/رقم صفحة. لو اعتُبر ذلك نهاية الجدول نشأ جدولٌ برأس فقط
    (صفّ واحد) وجسمٌ بلا رأس — وهو عطل «الجدول فيه خلية واحدة وبقية الكلام
    مش موجود». لذلك يبقى الجدول مفتوحًا عبر الفجوات الصغيرة ما دامت الأعمدة
    متطابقة.
    """
    out, block = [], []

    def flush() -> None:
        if not block:
            return
        if len(block) < 2:
            out.extend(block)
            block.clear()
            return
        rows = []
        for line in block:
            cells = [c.strip() for c in line.strip().strip("|").split("|")]
            rows.append(cells)
        cols = max(len(r) for r in rows)
        for r in rows:
            r += [""] * (cols - len(r))
            if all(re.fullmatch(r":?-{3,}:?", c) or c == "" for c in r):
                r[:] = ["---"] * cols
        out.extend("| " + " | ".join(r) + " |" for r in rows)
        block.clear()

    i, n = 0, len(lines)
    while i < n:
        s = lines[i].rstrip()
        if s.strip().startswith("|") and s.count("|") >= 2:
            block.append(s)
            i += 1
            continue
        # فجوة محتملة داخل جدول ممتدّ على صفحتين
        resume = i
        if block:
            cols, j, noise = _row_cols(block[-1]), i, 0
            while j < n and noise < 3:
                t = lines[j].strip()
                if t.startswith("|") and t.count("|") >= 2:
                    break
                if t == "" or NOISE_LINE.match(t):
                    noise += 1
                    j += 1
                    continue
                j = n
                break
            if i < j < n and _row_cols(lines[j]) == cols:
                resume = j
        if resume > i:
            i = resume
            continue
        flush()
        if s.strip() in ("<", ">"):
            i += 1
            continue
        out.append(re.sub(r"^<\s+", "", s))
        i += 1
    flush()
    return out


DIAC_ONLY = re.compile(r"^[\u064B-\u0652\u0670\u06D6-\u06ED\u0640\s]+$")
MATHISH = re.compile(r"[\\^_{}=]|[\u0600-\u06FF]")


def escape_fake_math(s: str) -> str:
    """يهرب $ العملات/النصّ العادي حتى لا تُحسب رياضيات وهمية."""
    parts = re.split(r"(\$\$.+?\$\$)", s, flags=re.S)
    out = []
    for i, part in enumerate(parts):
        if i % 2:
            out.append(part)
            continue
        patched = re.sub(
            r"(?<!\$)\$([^$\n]{1,120})\$(?!\$)",
            lambda m: m.group(0)
            if MATHISH.search(m.group(1))
            else "&#36;" + m.group(1) + "&#36;",
            part,
        )
        if patched.count("$") % 2:
            patched = patched.replace("$", "&#36;")
        out.append(patched)
    return "".join(out)


_REV_PAREN = re.compile(r"\)([^\s()\[\]{}«»]{1,40})\(")
_REV_LETTER = re.compile(r"[\u0600-\u06FFA-Za-z]")


def fix_reversed_parens(text: str) -> str:
    """يعيد ترتيب الأقواس المقلوبة من طبقة نصّ InDesign: «)أ(» ← «(أ)».

    بشرط أن يحمل الوسط حرفًا عربيًا/لاتينيًا؛ يستثني الوسائط الرقمية
    («)3(») ووسوم Markdown («)ï» و«)x(» الطبقية) وحالات أزواج الطباق
    والأقواس المشروعة «)(» حيث يتناوب قفل وفتح مختلفان.
    """
    return _REV_PAREN.sub(
        lambda m: f"({m.group(1)})" if _REV_LETTER.search(m.group(1)) else m.group(0),
        text,
    )


def clean(text: str) -> tuple[str, dict]:
    text = fix_reversed_parens(text)
    text = BIDI.sub("", text.replace("\u200b", ""))
    text = text.replace("\ufeff", "").replace("\u061c", "")
    text = unify_letters(text)
    text = re.sub(r"```+", "", text)
    text = re.sub(r"<br\s*/?>", " ", text, flags=re.I)
    pages = split_pages(text)
    pages, heads = drop_running_heads(pages)

    cleaned_pages, stats = [], defaultdict(int)
    for lines in pages:
        lines, st = strip_noise(lines)
        for k, v in st.items():
            stats[k] += v
        lines = [normalize_punct(latex_clean(normalize_math(line))) for line in lines]
        lines = [
            escape_fake_math(
                FOOTER.sub(
                    "", BOOKHEAD.sub("", ICON.sub(lambda m: f"**{m.group(1).strip()}**", l))
                )
            ).strip()
            for l in lines
        ]
        kept = []
        for l in lines:
            if l.strip() and DIAC_ONLY.match(l):
                stats["solo_diacritics_removed"] += 1
                continue
            kept.append(l)
        lines = kept
        lines = normalize_tables(lines)
        lines = merge_wrapped(lines)
        lines = [escape_fake_math(l) for l in lines]
        lines, n_head = promote_headings(lines)
        stats["headings"] += n_head
        if any(l.strip() for l in lines):
            cleaned_pages.append(lines)

    body = "\n\n".join("\n".join(p) for p in cleaned_pages)
    body = re.sub(r"\n{3,}", "\n\n", body).strip() + "\n"

    # مقاييس إضافية
    lines = [l for l in body.split("\n") if l.strip()]
    report = {
        "pages": len(pages),
        "content_pages": len(cleaned_pages),
        "lines": len(lines),
        "chars": len(body),
        "chars_per_page": round(len(body) / max(1, len(cleaned_pages))),
        "heading_lines": sum(1 for l in lines if l.startswith("#")),
        "row_ratio": round(
            sum(1 for l in lines if re.search(r"\s{3,}", l)) / max(1, len(lines)), 3
        ),
        "short_line_ratio": round(
            sum(1 for l in lines if len(l.strip()) < 15) / max(1, len(lines)), 3
        ),
        "solo_diacritics": sum(1 for l in lines if DIACRITICS.match(l.strip())),
        "arabic_ratio": round(
            len(ARABIC.findall(body)) / max(1, len(re.sub(r"\s", "", body))), 3
        ),
        **heads,
        **stats,
    }
    return body, report


def main() -> int:
    ap = argparse.ArgumentParser(description="تنظيف Markdown عربي خارج من OCR/PDF")
    ap.add_argument("src", type=Path)
    ap.add_argument("dst", type=Path)
    ap.add_argument("--report", type=Path, default=None)
    args = ap.parse_args()
    raw = args.src.read_text(encoding="utf-8")
    body, report = clean(raw)
    args.dst.parent.mkdir(parents=True, exist_ok=True)
    args.dst.write_text(body, encoding="utf-8")
    if args.report:
        args.report.write_text(
            json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8"
        )
    print(json.dumps(report, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
