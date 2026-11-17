#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""arabic_docx.py — مولّد Word عربي احترافي (RTL) — بديل pandoc.

المشاكل التي يحلّها من جذرها:
  ① الكشيدة المطاطية: لا يستخدم «ضبط» (justify) إطلاقًا ⇒ محاذاة يمين فقط.
  ② دمج الأسطر: يبني كل سطر كفقرة/فاصل سطر صلب صريح.
  ③ الاتجاه: w:bidi + w:jc=right + w:rtl على كل فقرة/مقطع.
  ④ الهيكل: أنماط Word حقيقية (عنوان · عنوان فرعي · سؤال · خيار · تعليل).
  ⑤ التذييلات/الترويسات: صفحة مرقّمة + ترويسة كتاب.

الاستخدام:
    python3 arabic_docx.py booklet <input.md> <output.docx> [--title ...]
    python3 arabic_docx.py book    <input.md> <output.docx> [--title ...]
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.style import WD_STYLE_TYPE
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

# ─────────────────────────── ثوابت التنسيق ───────────────────────────
LTR_MODE = False
FONT_BODY = "Amiri"  # خط النسخ الأساسي (مثبّت ومتوفر)
FONT_HEAD = "Amiri"
FONT_LTR = "Calibri"  # العناوين بنفس العائلة لاتساق بصري
NAVY = RGBColor(0x1F, 0x38, 0x64)
GOLD = RGBColor(0xA6, 0x7C, 0x00)
GRAY = RGBColor(0x5A, 0x5A, 0x5A)
LIGHT = RGBColor(0x77, 0x77, 0x77)
# لون الفرع: أغمق من الخيار وأفتح من الرئيسية — طبقة وسطى مقروءة في التدرّج
INK_SUB = RGBColor(0x2E, 0x4B, 0x73)
GREEN = RGBColor(0x0B, 0x4F, 0x2C)  # الآيات
MAROON = RGBColor(0x7B, 0x1E, 0x1E)  # الأحاديث

# ترتيب عناصر pPr/rPr/sectPr حسب مخطط OOXML (Word صارم في الترتيب)
PPR_ORDER = [
    "pStyle",
    "keepNext",
    "keepLines",
    "pageBreakBefore",
    "framePr",
    "widowControl",
    "numPr",
    "suppressLineNumbers",
    "pBdr",
    "shd",
    "tabs",
    "suppressAutoHyphens",
    "kinsoku",
    "wordWrap",
    "overflowPunct",
    "topLinePunct",
    "autoSpaceDE",
    "autoSpaceDN",
    "bidi",
    "adjustRightInd",
    "snapToGrid",
    "spacing",
    "ind",
    "contextualSpacing",
    "mirrorIndents",
    "suppressOverlap",
    "jc",
    "textDirection",
    "textAlignment",
    "textboxTightWrap",
    "outlineLvl",
    "divId",
    "cnfStyle",
    "rPr",
    "sectPr",
    "pPrChange",
]
RPR_ORDER = [
    "rStyle",
    "rFonts",
    "b",
    "bCs",
    "i",
    "iCs",
    "caps",
    "smallCaps",
    "strike",
    "dstrike",
    "outline",
    "shadow",
    "emboss",
    "imprint",
    "noProof",
    "snapToGrid",
    "vanish",
    "webHidden",
    "color",
    "spacing",
    "w",
    "kern",
    "position",
    "sz",
    "szCs",
    "highlight",
    "u",
    "effect",
    "bdr",
    "shd",
    "fitText",
    "vertAlign",
    "rtl",
    "cs",
    "em",
    "lang",
    "eastAsianLayout",
    "specVanish",
    "oMath",
]
SECT_ORDER = [
    "footnotePr",
    "endnotePr",
    "type",
    "pgSz",
    "pgMar",
    "paperSrc",
    "pgBorders",
    "lnNumType",
    "pgNumType",
    "cols",
    "formProt",
    "vAlign",
    "noEndnote",
    "titlePg",
    "textDirection",
    "bidi",
    "rtlGutter",
    "docGrid",
    "printerSettings",
]


def _w(tag: str, **attrs) -> OxmlElement:
    el = OxmlElement("w:" + tag)
    for k, v in attrs.items():
        el.set(qn("w:" + k), str(v))
    return el


# في فقرة RTL تكون القيم منطقية: left = البداية (يمين)، right = النهاية (يسار)
JC_MAP = {
    "right": "left",
    "start": "left",
    "left": "right",
    "end": "right",
    "center": "center",
    "both": "both",
}


def jc(logical: str) -> str:
    return JC_MAP.get(logical, "left")


def _bidi(pPr):
    """يضيف w:bidi فقط في الوضع العربي."""
    if not LTR_MODE:
        el = OxmlElement("w:bidi")
        pPr.append(el)


def _reorder(parent, order) -> None:
    """يعيد ترتيب أبناء عنصر حسب مخطط OOXML (يمنع ملفات تالفة)."""
    if parent is None:
        return
    idx = {name: i for i, name in enumerate(order)}
    children = list(parent)
    children.sort(key=lambda e: idx.get(e.tag.split("}")[-1], 999))
    for child in children:
        parent.remove(child)
    for child in children:
        parent.append(child)


# ─────────────────────────── بناء الأنماط ───────────────────────────
def _style_font(style, name=FONT_BODY, size=13, bold=False, color=None, italic=False):
    if LTR_MODE:
        name = FONT_LTR
    rPr = style.element.get_or_add_rPr()
    rFonts = rPr.find(qn("w:rFonts"))
    if rFonts is None:
        rFonts = _w("rFonts")
        rPr.append(rFonts)
    for attr in ("ascii", "hAnsi", "cs", "eastAsia"):
        rFonts.set(qn("w:" + attr), name)
    rPr.append(_w("sz", val=int(size * 2)))
    rPr.append(_w("szCs", val=int(size * 2)))
    if bold:
        rPr.append(_w("b"))
        rPr.append(_w("bCs"))
    if italic:
        rPr.append(_w("i"))
        rPr.append(_w("iCs"))
    if color is not None:
        rPr.append(_w("color", val=str(color)))
    if not LTR_MODE:
        rPr.append(_w("rtl"))
    _reorder(rPr, RPR_ORDER)


def _style_para(
    style,
    align="right",
    before=0,
    after=4,
    line=1.4,
    right_indent=0,
    first_indent=0,
    keep_next=False,
    keep_lines=False,
    page_break=False,
    base=13,
):
    pPr = style.element.get_or_add_pPr()
    if keep_next:
        pPr.append(_w("keepNext"))
    if keep_lines:
        pPr.append(_w("keepLines"))
    if page_break:
        pPr.append(_w("pageBreakBefore"))
    if not LTR_MODE:
        _bidi(pPr)
    pPr.append(
        _w(
            "spacing",
            before=int(before * 20),
            after=int(after * 20),
            line=int(base * line * 20),
            lineRule="atLeast",
        )
    )
    if right_indent or first_indent:
        attrs = {}
        if right_indent:
            # في RTL: left = جهة البداية (اليمين)
            attrs["left"] = int(right_indent * 567)
        if first_indent:
            attrs["hanging"] = int(abs(first_indent) * 567) if first_indent < 0 else 0
            if first_indent > 0:
                attrs["firstLine"] = int(first_indent * 567)
        pPr.append(_w("ind", **attrs))
    pPr.append(_w("jc", val=jc(align)))
    _reorder(pPr, PPR_ORDER)


def build_styles(doc, profile: str):
    st = doc.styles

    normal = st["Normal"]
    _style_font(normal, size=13)
    _style_para(
        normal,
        after=6 if profile == "book" else 4,
        line=1.55 if profile == "book" else 1.4,
        base=13,
    )

    def add(name, base="Normal"):
        try:
            return st[name]
        except KeyError:
            s = st.add_style(name, WD_STYLE_TYPE.PARAGRAPH)
            s.base_style = st[base]
            return s

    s = add("ArTitle")
    _style_font(s, FONT_HEAD, 26, bold=True, color=NAVY)
    _style_para(s, align="center", before=0, after=6, line=1.2, keep_next=True, base=26)

    s = add("ArSubtitle")
    _style_font(s, FONT_BODY, 11.5, color=GRAY)
    _style_para(
        s, align="center", before=0, after=10, line=1.35, keep_next=True, base=11.5
    )

    s = add("ArSection")
    _style_font(s, FONT_HEAD, 18, bold=True, color=NAVY)
    _style_para(
        s, align="right", before=22, after=8, line=1.25, keep_next=True, base=18
    )

    s = add("ArH1")
    _style_font(s, FONT_HEAD, 22, bold=True, color=GREEN)
    _style_para(
        s,
        align="center",
        before=10,
        after=16,
        line=1.25,
        keep_next=True,
        page_break=True,
        base=22,
    )
    # عنوان الدرس/الفصل: إطار سفلي ذهبي + خلفية دافئة — تمييز فوري عن الجسم
    _pPr1 = s.element.get_or_add_pPr()
    _pBdr = _w("pBdr")
    _pBdr.append(_w("bottom", val="single", sz="12", space="1", color="A67C00"))
    _pPr1.append(_pBdr)
    _pPr1.append(_w("shd", val="clear", color="auto", fill="F7F2E3"))
    _reorder(_pPr1, PPR_ORDER)

    s = add("ArH2")
    _style_font(s, FONT_HEAD, 17, bold=True, color=NAVY)
    _style_para(s, align="right", before=14, after=8, line=1.3, keep_next=True, base=17)

    s = add("ArH3")
    _style_font(s, FONT_HEAD, 15, bold=True, color=GOLD)
    _style_para(s, align="right", before=10, after=6, line=1.3, keep_next=True, base=15)

    s = add("ArInstruction")
    _style_font(s, FONT_HEAD, 13.5, bold=True, color=NAVY)
    _style_para(
        s, align="right", before=12, after=4, line=1.35, keep_next=True, base=13.5
    )

    s = add("ArQuestion")
    _style_font(s, FONT_HEAD, 14, bold=True, color=MAROON)
    _style_para(
        s,
        align="right",
        before=14,
        after=3,
        line=1.45,
        keep_lines=True,
        keep_next=False,
        base=14,
    )

    s = add("ArSubHead")
    _style_font(s, FONT_HEAD, 13.5, bold=True, color=INK_SUB)
    _style_para(
        s,
        align="right",
        before=12,
        after=4,
        line=1.35,
        right_indent=0.25,
        keep_next=True,
        base=13.5,
    )

    s = add("ArItem")
    _style_font(s, FONT_BODY, 13)
    _style_para(
        s,
        align="right",
        before=7,
        after=1,
        line=1.45,
        right_indent=1.05,
        first_indent=-0.55,
        keep_lines=True,
        base=13,
    )

    # الفرع داخل السؤال الرئيسي: إزاحة أكبر + تمييز لوني، حتى لا يختلط بالرئيسي
    s = add("ArSub")
    _style_font(s, FONT_BODY, 12.8, color=INK_SUB)
    _style_para(
        s,
        align="right",
        before=5,
        after=1,
        line=1.45,
        right_indent=1.6,
        first_indent=-0.5,
        keep_lines=True,
        base=12.8,
    )

    s = add("ArOption")
    _style_font(s, FONT_BODY, 12.5, color=LIGHT)
    _style_para(
        s,
        align="right",
        before=2,
        after=1,
        line=1.4,
        right_indent=2.15,
        keep_lines=True,
        base=12.5,
    )

    s = add("ArAnswer")
    _style_font(s, FONT_BODY, 11.5, color=LIGHT)
    _style_para(
        s,
        align="right",
        before=2,
        after=4,
        line=1.35,
        right_indent=1.65,
        keep_lines=True,
        base=11.5,
    )

    s = add("ArBody")
    _style_font(s, FONT_BODY, 13.5 if profile == "book" else 13)
    _style_para(
        s,
        align="right",
        before=0,
        after=4,
        line=1.7 if profile == "book" else 1.45,
        base=13.5,
    )

    s = add("ArQuote")
    _style_font(s, FONT_BODY, 12.5, color=GRAY)
    _style_para(
        s, align="right", before=4, after=6, line=1.45, right_indent=1.0, base=12.5
    )

    s = add("ArList")
    _style_font(s, FONT_BODY, 13)
    _style_para(
        s, align="right", before=0, after=3, line=1.5, right_indent=0.8, base=13
    )


# ─────────────────────────── أدوات الفقرة ───────────────────────────
INLINE_BOLD = re.compile(r"\*\*(.+?)\*\*")
QURAN = re.compile(r"(﴿[^﴾]*﴾)")
HADITH = re.compile(r"(«[^»]*»)")


def _clean(t: str) -> str:
    t = re.sub(r"<!--.*?-->", "", t, flags=re.S)
    t = re.sub(r"[\u200b\u200e\u200f\ufeff\u061c]", "", t)
    t = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\ud800-\udfff]", "", t)
    t = re.sub(r"[ \t]{2,}", " ", t)
    # strip بـ" \t" فقط: strip() العادي يحذف NBSP فيسقط الفاصل عن التسميات «س١: »
    return t.strip(" \t\r\n")


MATH_MAP = [
    (r"\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}", r"\1/\2"),
    (r"\\sqrt\s*\{([^{}]*)\}", r"√(\1)"),
    (r"\\wedge\b", "∧"),
    (r"\\vee\b", "∨"),
    (r"\\times\b", "×"),
    (r"\\div\b", "÷"),
    (r"\\pm\b", "±"),
    (r"\\leq\b", "≤"),
    (r"\\geq\b", "≥"),
    (r"\\neq\b", "≠"),
    (r"\\approx\b", "≈"),
    (r"\\equiv\b", "≡"),
    (r"\\left|\\right|\\quad|\\qquad|\\,|\\;|\\!", " "),
    (r"\\vphantom\s*\{[^{}]*\}", ""),
    (r"\\text\s*\{([^{}]*)\}", r"\1"),
    (r"\\mathrm\s*\{([^{}]*)\}", r"\1"),
    (r"\\[a-zA-Z]+\s*", ""),
]
ARTIFACT = re.compile(
    r"\[[^\]\n]*(?:شعار|صورة|زخرفة|غلاف|فارغة|شريط|إطار|مربع|مستطيل|صفحة|رسم|جدول|رقمنة|اسم|رقم|أسفل|أعلى|توقيع)[^\]\n]*\]?"
)
PBREAK = re.compile(r"-{2,}\s*PAGEBREAK\s*-{2,}", re.I)


def clean_math(t: str) -> str:
    for pat, rep in MATH_MAP:
        t = re.sub(pat, rep, t)
    return t


MARKER = re.compile(r"==+[^=\n]{0,80}==+")
HTMLBR = re.compile(r"<br\s*/?>", re.I)
LATEXDOTS = re.compile(r"\\dots\b|\\ldots\b|\\cdots\b")
MDHASH = re.compile(r"(?m)^\s*#{2,6}\s*")


def sanitize_light(t: str) -> str:
    """تنظيف أولي على النصّ الكامل (قبل تقسيمه إلى مقاطع)."""
    t = re.sub(r"^[٠-٩\d]{1,3}\s+للصف\s+الثالث\s+الثانوي\s*", "", t)
    t = re.sub(r"^[٠-٩\d]{1,3}\s+د/\s*\S+\s*", "", t)
    t = re.sub(r"^د/\s*[^\n]{0,40}$", "", t)
    t = re.sub(
        r"^[٠-٩\d]{1,3}\s+(?:المختار|تيسير|شرح|الوجيز|تاريخ|الصرف|البلاغة|المطالعة|الفقه|التوحيد|الحديث|التفسير)\b[^\n]{0,40}$",
        "",
        t,
    )
    # أوصاف لقطات الشاشة: نُبقي النصّ ونحذف الغلاف
    t = re.sub(r"\[Screenshot for page \d+\s*(?::\s*)?([^\]]*)\]", r" \1 ", t)
    t = re.sub(r"\barrow\b", "→", t)
    t = re.sub(r"CamScanner", " ", t)
    t = re.sub(r"PAGE\s*BREAK", " ", t, flags=re.I)
    t = re.sub(r"^[\d٠-٩]{1,3}\s*[Xx×]\s*", "", t)  # «3 X» أثر مسح
    t = re.sub(r"[\u0671-\u0673\u067B-\u067D\u067F-\u0680]", "", t)  # حروف زخرفية
    t = re.sub(r"^\s*للصف\s+الثالث\s+الثانوي\s*", "", t)
    t = re.sub(r"^\s*\d{4}\s*هـ?\s*[\d\s\-–/]+\s*م?\s*$", "", t)  # سطر تاريخ الغلاف
    t = t.replace("==", " ")
    t = MARKER.sub(" ", t)
    t = HTMLBR.sub(" ", t)
    t = LATEXDOTS.sub("…", t)
    t = MDHASH.sub("", t)
    t = re.sub(r"</?(?!u\b)[a-zA-Z][^>]{0,40}>", " ", t)  # وسوم HTML (نُبقي <u>)
    t = PBREAK.sub(" ", t)
    t = ARTIFACT.sub(" ", t)
    t = re.sub(r"-{3,}", " ", t)
    return t


def sanitize(t: str) -> str:
    """ينظّف أي أثر تقني/OCR من النصّ قبل كتابته."""
    t = sanitize_light(t)
    t = re.sub(r"\$([^$]{0,80})\$", lambda m: clean_math(m.group(1)), t)
    t = t.replace("$", "").replace("**", "").replace("*", "")
    t = clean_math(t)
    t = re.sub(r"-{3,}", " ", t)  # خطوط فاصلة طويلة
    t = re.sub(r"(?<!-)--(?!-)", "—", t)
    t = re.sub(r"[ \t]{2,}", " ", t)
    return t.strip()


def add_runs(
    p, text: str, base_size=None, base_bold=False, base_color=None, quran_color=True
):
    """يضيف نصًّا مع دعم **العريض** و<u>التسطير</u> وتلوين الآيات والأحاديث."""
    text = sanitize_light(_clean(text))
    if not text:
        return
    tokens = re.split(r"(\*\*.+?\*\*|﴿[^﴾]*﴾|«[^»]*»)", text)
    for tok in tokens:
        if not tok:
            continue
        bold, color = base_bold, base_color
        if tok.startswith("**") and tok.endswith("**") and len(tok) > 4:
            tok = tok[2:-2]
            bold = True
        if quran_color and tok.startswith("﴿"):
            color = GREEN
        elif quran_color and tok.startswith("«"):
            color = MAROON
        # التسطير قد يقع داخل آية أو اقتباس: نُقسّم المقطع إلى أجزاء
        for part in re.split(r"(<u>.*?</u>)", tok):
            if not part:
                continue
            under = False
            if part.startswith("<u>") and part.endswith("</u>") and len(part) > 7:
                part = part[3:-4]
                under = True
            part = sanitize(part)
            if not part:
                continue
            run = p.add_run(part)
            run.font.name = FONT_LTR if LTR_MODE else FONT_BODY
            run._element.get_or_add_rPr().append(
                _w("rFonts", ascii=FONT_BODY, hAnsi=FONT_BODY, cs=FONT_BODY)
            )
            size = base_size or 13
            run.font.size = Pt(size)
            rPr = run._element.get_or_add_rPr()
            rPr.append(_w("szCs", val=int(size * 2)))
            if bold:
                run.bold = True
                rPr.append(_w("bCs"))
            if under:
                run.underline = True
            if color is not None:
                run.font.color.rgb = color
            if not LTR_MODE:
                rPr.append(_w("rtl"))
            _reorder(rPr, RPR_ORDER)


def add_para(
    doc,
    text="",
    style="ArBody",
    size=None,
    bold=False,
    color=None,
    align=None,
    quran_color=True,
    border_bottom=False,
):
    p = doc.add_paragraph(style=style)
    pPr = p._p.get_or_add_pPr()
    if not LTR_MODE:
        _bidi(pPr)
    if align:
        p.alignment = {
            "right": WD_ALIGN_PARAGRAPH.RIGHT,
            "center": WD_ALIGN_PARAGRAPH.CENTER,
            "justify": WD_ALIGN_PARAGRAPH.JUSTIFY,
        }[align]
    if text:
        add_runs(
            p,
            text,
            base_size=size,
            base_bold=bold,
            base_color=color,
            quran_color=quran_color,
        )
    if border_bottom:
        pPr.append(_w("pBdr"))
        bdr = pPr.find(qn("w:pBdr"))
        bdr.append(_w("bottom", val="single", sz=8, space=6, color="A67C00"))
    _reorder(pPr, PPR_ORDER)
    return p


def add_rule(doc, color="A67C00", sz=12):
    p = doc.add_paragraph()
    pPr = p._p.get_or_add_pPr()
    _bidi(pPr)
    pPr.append(_w("pBdr"))
    bdr = pPr.find(qn("w:pBdr"))
    bdr.append(_w("bottom", val="single", sz=sz, space=2, color=color))
    pPr.append(_w("spacing", before="0", after="260", line="20", lineRule="exact"))
    _reorder(pPr, PPR_ORDER)
    r = p.add_run("")
    r.font.size = Pt(1)


def page_break(doc):
    p = doc.add_paragraph()
    pPr = p._p.get_or_add_pPr()
    _bidi(pPr)
    _reorder(pPr, PPR_ORDER)
    p.add_run().add_break(WD_BREAK.PAGE)


# ─────────────────────────── الترويسة والتذييل ───────────────────────────
def setup_page(doc, header_text: str = "", margins=(2.0, 1.8, 2.2, 2.0)):
    sec = doc.sections[0]
    sec.page_width, sec.page_height = Cm(21), Cm(29.7)
    top, bottom, right, left = margins
    sec.top_margin, sec.bottom_margin = Cm(top), Cm(bottom)
    sec.right_margin, sec.left_margin = Cm(right), Cm(left)
    sec.header_distance, sec.footer_distance = Cm(1.0), Cm(0.9)
    sectPr = sec._sectPr
    if not LTR_MODE:
        _bidi(sectPr)
    _reorder(sectPr, SECT_ORDER)

    # تذييل: رقم الصفحة
    footer = sec.footer
    fp = footer.paragraphs[0]
    fpPr = fp._p.get_or_add_pPr()
    _bidi(fpPr)
    fpPr.append(_w("jc", val="center"))
    _reorder(fpPr, PPR_ORDER)
    run = fp.add_run()
    run.font.name = FONT_BODY
    run.font.size = Pt(10)
    run.font.color.rgb = GRAY
    rPr = run._element.get_or_add_rPr()
    rPr.append(_w("rFonts", ascii=FONT_BODY, hAnsi=FONT_BODY, cs=FONT_BODY))
    rPr.append(_w("rtl"))
    fld = _w("fldSimple", instr=" PAGE ")
    r = OxmlElement("w:r")
    t = OxmlElement("w:t")
    t.text = "1"
    r.append(t)
    fld.append(r)
    fp._p.append(fld)

    # ترويسة
    if header_text:
        head = sec.header
        hp = head.paragraphs[0]
        hpPr = hp._p.get_or_add_pPr()
        if not LTR_MODE:
            _bidi(hpPr)
        hpPr.append(_w("jc", val="left"))
        hpPr.append(_w("pBdr"))
        hpPr.find(qn("w:pBdr")).append(
            _w("bottom", val="single", sz=4, space=4, color="BFBFBF")
        )
        _reorder(hpPr, PPR_ORDER)
        hr = hp.add_run(header_text)
        hr.font.name = FONT_BODY
        hr.font.size = Pt(9.5)
        hr.font.color.rgb = LIGHT
        hrPr = hr._element.get_or_add_rPr()
        hrPr.append(_w("rFonts", ascii=FONT_BODY, hAnsi=FONT_BODY, cs=FONT_BODY))
        hrPr.append(_w("rtl"))
        _reorder(hrPr, RPR_ORDER)


def set_core(doc, title: str):
    cp = doc.core_properties
    cp.title = title
    cp.author = "pdf2book"
    cp.language = "ar-SA"
    cp.comments = ""


# ─────────────────────────── تحليل Markdown ───────────────────────────
AR_DIGITS = str.maketrans("0123456789", "٠١٢٣٤٥٦٧٨٩")
LATIN_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789")
LETTERS = "أبجدهوزحطيكلمنسعفصقرشتثخذضظغ"


def ar_num(n: int) -> str:
    return str(n).translate(AR_DIGITS)


def is_instruction(line: str) -> bool:
    s = re.sub(r"[\u064B-\u0652\u0670]", "", line.strip())
    return bool(
        re.match(
            r"^(?:أولا|ثانيا|ثالثا|رابعا|خامسا|سادسا|سابعا|ثامنا|تاسعا|عاشرا|"
            r"النشاط|نشاط)(?:\s*\([٠-٩\d]+\))?\s*[:：]",
            s,
        )
    )


def is_question(line: str) -> bool:
    s = line.strip()
    return bool(re.match(r"^(?:س\s*[٠-٩\d]+|السؤال\s+[٠-٩\d]+)\s*[:：.\-]", s))


# أرقام البنود في الكتب المصرية: «٣- نص» و«-٣ نص» و«٣. نص» و«٣) نص»
NUM_TAIL = re.compile(r"^\s*([٠-٩\d]{1,2})\s*(?:[-–—]|[.)])\s*(\S.*)$")
NUM_HEAD = re.compile(r"^\s*[-–—]\s*([٠-٩\d]{1,2})\s+(\S.*)$")

# أفعال التكليف: السطر الذي يبدأ بها سؤالٌ رئيسي وليس خيارًا.
# تُقارَن بعد تجريد التشكيل، لذا تُكتب هنا بلا حركات.
COMMAND = re.compile(
    r"^(?:اختر|ختر|تخير|ضع|علل|علم|عين|اذكر|هات|ماذا|متى|أين|كيف|لماذا|ما|من|"
    r"بين|عرف|أكمل|اكمل|أجب|اجب|استخرج|صحح|صوب|فسر|اشرح|قارن|ميز|حدد|ارسم|"
    r"أعد|اعد|صوغ|حول|صل|ناقش|علق|استنتج|استخلص|وضح|ادرس|بيّن|ميّز|حدّد|علّم|"
    r"أدخل|ادخل|اجمع|قال|يقال|يا|مثل|صف|صغ|أسند|اقرأ|اكتب|لخص|طبق|حل|أجب|أعرب|"
    r"عيّن|دلل|استدل|أورد|أذكر|أحضر|قم|صمم|انقل|ترجم|أتم)"
)
# السطر الذي يبدأ بنص مقتبس (آية/حديث) هو خيار، لا سؤال
QUOTED = re.compile(r"^\s*[«﴿\[({]")


def split_numbered(line: str):
    """يفكّ ترقيم البند: يعيد (الرقم، النص) أو None لأي سطر غير مرقّم."""
    m = NUM_TAIL.match(line) or NUM_HEAD.match(line)
    return (m.group(1), m.group(2).strip()) if m else None


def is_main_question(body: str) -> bool:
    """الفرق بين السؤال الرئيسي وخيار البند في البوكليتات المرقّمة «١- ٢- ٣-».

    المصدر لا يكتب «س1:» بل رقمًا مجردًا، لذا يُستدل بأفعال التكليف وعلامة
    السؤال والنقطتين الرأسية، ويُستبعد ما يبدأ بمقتبس لأنه خيار.
    """
    b = re.sub(r"[\u064B-\u0652\u0670]", "", body).strip()
    if not b:
        return False
    # سؤال رئيسي قد يبدأ بكلمة بين قوسين: «(حَلَّ - رَدَّ):»
    if b.endswith(("؟", "?", ":", "：")):
        return True
    if QUOTED.match(b):
        return False
    return bool(COMMAND.match(b))


def is_option(line: str) -> bool:
    s = line.strip()
    if re.match(r"^[\(\{]?\s*[" + LETTERS + r"]\s*[\)\.\-]\s", s):
        return True
    if re.match(r"^[-•]\s", s):
        return True
    return False


def is_numbered_option(line: str) -> bool:
    return bool(re.match(r"^[٠-٩\d]{1,2}\s*-\s", line.strip()))


def is_answer(line: str) -> bool:
    s = line.strip()
    return bool(
        re.match(r"^(?:التعليل|الليل|القائل|الإجابة|الجواب|الدليل)\b", s)
    ) or bool(re.match(r"^(?:التعليل|القائل|الإجابة)\s*(?:إن وجد)?\s*[:：]", s))


# ─────────────────────────── ملف البوكليت ───────────────────────────
ORDINALS = [
    "",
    "الأول",
    "الثاني",
    "الثالث",
    "الرابع",
    "الخامس",
    "السادس",
    "السابع",
    "الثامن",
    "التاسع",
    "العاشر",
    "الحادي عشر",
    "الثاني عشر",
    "الثالث عشر",
    "الرابع عشر",
    "الخامس عشر",
    "السادس عشر",
    "السابع عشر",
    "الثامن عشر",
    "التاسع عشر",
    "العشرون",
]


def to_ar_digits(t: str) -> str:
    return re.sub(
        r"(?<![A-Za-z٠-٩])[0-9]+(?![A-Za-z])",
        lambda m: m.group(0).translate(AR_DIGITS),
        t,
    )


def add_label_run(p, label: str, size: float, color=NAVY):
    r = p.add_run(label)
    r.font.name = FONT_BODY
    r.font.size = Pt(size)
    r.bold = True
    r.font.color.rgb = color
    rPr = r._element.get_or_add_rPr()
    rPr.append(_w("rFonts", ascii=FONT_BODY, hAnsi=FONT_BODY, cs=FONT_BODY))
    rPr.append(_w("bCs"))
    rPr.append(_w("szCs", val=int(size * 2)))
    rPr.append(_w("rtl"))
    _reorder(rPr, RPR_ORDER)


def add_answer_line(doc, text: str):
    """سطر إجابة بنقاط منتظمة (طول ثابت) بلون رمادي فاتح."""
    text = re.sub(r"[\s.·…]{3,}$", "", text).strip()
    p = doc.add_paragraph(style="ArAnswer")
    pPr = p._p.get_or_add_pPr()
    _bidi(pPr)
    _reorder(pPr, PPR_ORDER)
    add_runs(p, text + " ", base_size=11.5, base_color=LIGHT)
    dots = p.add_run("…" * 16)
    dots.font.name = FONT_BODY
    dots.font.size = Pt(11.5)
    dots.font.color.rgb = RGBColor(0xB0, 0xB0, 0xB0)
    rPr = dots._element.get_or_add_rPr()
    rPr.append(_w("rFonts", ascii=FONT_BODY, hAnsi=FONT_BODY, cs=FONT_BODY))
    rPr.append(_w("szCs", val=23))
    rPr.append(_w("rtl"))
    _reorder(rPr, RPR_ORDER)


OPT_MARK = re.compile(r"(?:^|(?<=[\s.،]))(?:-\s*([٠-٩\d]{1,2})|([٠-٩\d]{1,2})\s*-)\s+")


def explode(s: str) -> list[str]:
    """يفصل الخيارات المدمجة داخل سطر واحد إلى أسطر مستقلّة.

    يدعم النمطين: «١- …» و«-١ …» (نمط الكتب المصرية)، وأيضًا «(خيار - خيار)».
    """
    s = s.strip()
    # (خيار - خيار - خيار).
    m = re.fullmatch(r"\((.*?)\)\s*\.?", s)
    if m and " - " in m.group(1):
        parts = [x.strip() for x in m.group(1).split(" - ") if x.strip()]
        if len(parts) >= 2:
            return [f"- {x}" for x in parts]
    # «١- … -٢ …» أو «1- … 2- …» مدمجة — أيّ نمط وأيّ ترتيب
    marks = list(OPT_MARK.finditer(s))
    if len(marks) >= 2:
        parts = []
        for k, mk in enumerate(marks):
            end = marks[k + 1].start() if k + 1 < len(marks) else len(s)
            body = s[mk.end() : end].strip(" .،\t")
            num = mk.group(1) or mk.group(2)
            parts.append(f"{num}- {body}" if num else body)
        return [p for p in parts if p]
    return [s]


def _label(p, text, size, color=NAVY):
    add_label_run(p, text, size, color)


def render_booklet(md_path: Path, out_path: Path, title=None, header=None):
    text = md_path.read_text(encoding="utf-8", errors="ignore")
    lines = [l.rstrip() for l in text.splitlines()]

    doc = Document()
    setup_page(doc, header_text=(header or ""))
    build_styles(doc, "booklet")

    # ── العنوان والمصدر
    doc_title = title
    source = ""
    body_start = 0
    for i, l in enumerate(lines):
        s = l.strip()
        if not s:
            continue
        if s.startswith("# "):
            if not doc_title:
                doc_title = s[2:].strip()
            body_start = i + 1
            continue
        if s.startswith("> "):
            source = re.sub(r"\*\*", "", s[2:].strip())
            body_start = i + 1
            continue
        if s in ("---", "***"):
            body_start = i + 1
            continue
        body_start = i
        break
    doc_title = doc_title or md_path.stem.replace("_", " ")
    set_core(doc, doc_title)
    if source:
        source = to_ar_digits(source)

    add_para(doc, doc_title, style="ArTitle")
    if source:
        add_para(doc, source, style="ArSubtitle")
    add_rule(doc)

    st = {
        "kind": None,
        "main": 0,
        "item": 0,
        "opt": 0,
        "stem": False,
        "s_main": False,
        "last": None,
        "last_size": 13.0,
    }

    def indent(p, right, hanging=0.0):
        pPr = p._p.get_or_add_pPr()
        _bidi(pPr)
        attrs = {"left": int(right * 567)}
        if hanging:
            attrs["hanging"] = int(hanging * 567)
        pPr.append(_w("ind", **attrs))
        _reorder(pPr, PPR_ORDER)

    TERM = re.compile(r"[.،؛:!؟»﴾\)\]]\s*$")

    def continuation(txt: str):
        p = st["last"]
        prev = p.text.strip() if p is not None else ""
        if p is None or (TERM.search(prev) and not prev.endswith(("،", "؛", ":"))):
            add_para(doc, txt, style="ArBody")
            st["last"] = doc.paragraphs[-1]
            st["kind"] = "body"
            return
        if False:
            add_para(doc, txt, style="ArBody")
            st["last"] = doc.paragraphs[-1]
            st["kind"] = "body"
            return
        sp = p.add_run(" ")
        sp.font.name = FONT_BODY
        sp.font.size = Pt(st["last_size"])
        rPr = sp._element.get_or_add_rPr()
        rPr.append(_w("rFonts", ascii=FONT_BODY, hAnsi=FONT_BODY, cs=FONT_BODY))
        rPr.append(_w("rtl"))
        _reorder(rPr, RPR_ORDER)
        add_runs(p, txt, base_size=st["last_size"])

    def new_main(txt: str):
        st["main"] += 1
        st["item"] = 0
        st["opt"] = 0
        st["stem"] = False
        p = doc.add_paragraph(style="ArQuestion")
        indent(p, 0.9, 0.9)
        _label(p, f"س{ar_num(st['main'])}:\u00a0", 13.5)
        add_runs(p, txt, base_size=13.5)
        st.update(kind="main", last=p, last_size=13.5)

    def new_item(txt: str):
        st["item"] += 1
        st["opt"] = 0
        st["stem"] = False
        p = doc.add_paragraph(style="ArItem")
        indent(p, 1.05, 0.55)
        _label(p, f"{ar_num(st['item'])}-\u00a0", 12.8)
        add_runs(p, txt, base_size=12.8)
        st.update(kind="item", last=p, last_size=12.8)

    def new_option(txt: str, label: str | None = None):
        if label is None:
            st["opt"] += 1
            n = st["opt"]
            label = LETTERS[n - 1] if n <= len(LETTERS) else str(n)
        elif len(label) <= 2 and label.translate(LATIN_DIGITS).isdigit():
            # الخيار مرقّم في المصدر: يُبقي رقمه ويزامن العدّاد، فلو تركناه
            # للحروف لالتبس برقم السؤال الفرعي (أ) (ب) …
            st["opt"] = int(label.translate(LATIN_DIGITS))
            label = ar_num(st["opt"])
        p = doc.add_paragraph(style="ArOption")
        pPr = p._p.get_or_add_pPr()
        _bidi(pPr)
        _reorder(pPr, PPR_ORDER)
        _label(p, f"{label})\u00a0", 12.5)
        add_runs(p, txt, base_size=12.5)
        st.update(kind="option", last=p, last_size=12.5)

    def new_stem(txt: str):
        # فرع داخل سؤال رئيسي: ArSub لا ArItem — وإلا امتزج الرئيسي بالفرعي
        st["stem"] = True
        st["opt"] = 0
        p = doc.add_paragraph(style="ArSub")
        add_runs(p, txt, base_size=12.8)
        st.update(kind="sub", last=p, last_size=12.8)

    def new_subhead(txt: str):
        st["item"] = 0
        st["opt"] = 0
        # رأس الفرع يتبعه خيارات مرقّمة ⇒ ننتظر خيارات
        st["stem"] = True
        p = doc.add_paragraph(style="ArSubHead")
        pPr = p._p.get_or_add_pPr()
        _bidi(pPr)
        pPr.append(_w("jc", val="left"))
        _reorder(pPr, PPR_ORDER)
        add_runs(p, txt, base_size=13.5)
        st.update(kind="subhead", last=p, last_size=13.5)

    def handle(raw: str):
        s = clean_math(raw)
        s = s.strip()
        # فجوة بين نهاية الآية ومرجعها: ﴾[البقرة: 2] ← ﴾ [البقرة: 2]
        s = re.sub(r"﴾(?=\[)", "﴾ ", s)
        s = re.sub(r"\](?=﴿)", "] ", s)

        if s.startswith("## "):
            head = s[3:].strip()
            m = re.match(r"^(\d+)[\.\)]\s*(.*)$", head)
            if m:
                n = int(m.group(1))
                rest = m.group(2).strip()
                if re.fullmatch(r"الدرس\s*[٠-٩\d]*", rest):
                    # فولباك مرئي لا صامت: الأسلوب المطلوب اسم درس حقيقي على
                    # كل تمرين؛ يُقبل الترقيم الترتيبي فقط عند غياب حقيقي مع
                    # توثيق بصري أن المصدر لم يذكر اسمًا.
                    head = (
                        f"الدرس {ORDINALS[n] if 0 < n < len(ORDINALS) else ar_num(n)}"
                        " (اسم الدرس غير موثَّق في المصدر)"
                    )
                elif rest:
                    head = rest
            add_para(doc, to_ar_digits(head), style="ArSection", border_bottom=True)
            st.update(
                kind="section",
                stem=False,
                s_main=False,
                main=0,
                item=0,
                opt=0,
                last=None,
            )
            return
        if s.startswith("### "):
            add_para(doc, to_ar_digits(s[4:].strip()), style="ArH3")
            st.update(kind="section", last=None)
            return
        if is_instruction(s):
            add_para(doc, to_ar_digits(s), style="ArInstruction")
            st.update(kind="instruction", stem=False, s_main=False, last=None)
            return
        if is_question(s):
            body = re.sub(r"^[^:：]*[:：]\s*", "", s, count=1)
            body = re.sub(r"^[\(\[]?\s*[" + LETTERS + r"]\s*[\)\]]\s*", "", body)
            new_main(to_ar_digits(body))
            # سؤال موسوم بـ«س٢:» في المصدر: البنود المرقّمة التي بعده بنوده،
            # لا أسئلة رئيسية جديدة (وإلا انقلب كل بند فعلَ تكليف سؤالًا رئيسيًا)
            st["s_main"] = True
            return
        # فرع بين قوسين (أ) (ب) (ج): كلها بنفس الأسلوب ArSub — أول فرع
        # وآخره سواء، وإلا بدا الأول عنوانًا والباقي فروعًا (شكوى القارئ).
        if re.match(r"^[\(\[]\s*[" + LETTERS + r"]ـ?\s*[\)\]]", s):
            new_stem(to_ar_digits(s))
            return
        if is_answer(s):
            add_answer_line(doc, to_ar_digits(s))
            st.update(kind="answer", stem=False, last=None)
            return
        # عبارات صح/خطأ: أ- ب- ج- (فروع، لا بنود رئيسية)
        if re.match(r"^[" + LETTERS + r"]ـ?\s*[-–]\s+", s):
            body = re.sub(r"^[" + LETTERS + r"]ـ?\s*[-–]\s+", "", s)
            new_stem(to_ar_digits(body))
            return
        # عنوان فرعي ب) …: (بلا قوس افتتاحي)
        if re.match(r"^[" + LETTERS + r"]ـ?\s*[\)\]]\s*", s) and s.endswith(
            (":", "：")
        ):
            new_stem(to_ar_digits(s))
            return
        # خيارات حرفية أ) ب) ج)
        m = re.match(r"^[\(\{]?\s*([" + LETTERS + r"]ـ?)\s*[\)]\s+(.*)$", s)
        if m and st["kind"] in ("main", "item", "option", "stem", "sub", "subhead"):
            new_option(to_ar_digits(m.group(2)), m.group(1))
            return
        # بند مرقّم ١- ٢- أو -١ -٢ (نمط الكتب المصرية)
        split = split_numbered(s)
        if split:
            body = to_ar_digits(split[1])
            if st.get("s_main"):
                # داخل سؤال «س٢:»: البند المرقّم فرع/خيار له
                if st["stem"] and st["kind"] in ("stem", "option", "sub", "subhead"):
                    new_option(body, split[0])
                else:
                    new_item(body)
            elif is_main_question(split[1]):
                new_main(body)
            elif st["stem"] and st["kind"] in ("stem", "option", "sub", "subhead"):
                new_option(body, split[0])
            else:
                new_item(body)
            return
        # شرطة
        if re.match(r"^[-•]\s+", s):
            body = re.sub(r"^[-•]\s+", "", s)
            num = re.match(r"^([٠-٩\d]{1,2})\s*-\s+", body)
            label = num.group(1) if num else None
            body = re.sub(r"^[٠-٩\d]{1,2}\s*-\s+", "", body)
            body = to_ar_digits(body)
            short = len(body) < 75 and not body.rstrip().endswith(("؟", "?"))
            if st["stem"] and st["kind"] in ("stem", "option", "sub", "subhead"):
                new_option(body, label)
            elif st["kind"] in ("item", "main", "option") and short:
                new_option(body, label)
            else:
                new_item(body)
            return
        # تكملة
        continuation(to_ar_digits(s))

    table_rows: list[str] = []

    def flush_table():
        nonlocal table_rows
        if table_rows:
            add_table(doc, "\n".join(table_rows))
            table_rows = []

    for raw in lines[body_start:]:
        s = raw.strip()
        if not s or s in ("---", "***", "___", "-") or "PAGEBREAK" in s.upper():
            flush_table()
            continue
        if re.fullmatch(r"[٠-٩\d]{1,3}", s):
            continue
        if "|" in s:
            table_rows.append(s)
            continue
        flush_table()
        for piece in explode(s):
            handle(piece)
    flush_table()

    post_clean(doc)
    trim_tail(doc)
    doc.save(str(out_path))
    return out_path


# ─────────────────────────── ملف الكتاب ───────────────────────────
TERMINAL = re.compile(r"[.،؛:!؟»﴾)\]…]$")
SKIP_ART = re.compile(
    r"^\[[^\]]{0,50}(?:شعار|صورة|زخرفة|غلاف|فارغة|شريط|إطار|مربع|مستطيل|صفحة|رسم|جدول|رقمنة|اسم|رقم|أسفل|أعلى|توقيع)[^\]]{0,50}\]\s*$"
)


HEAD_TERM = re.compile(r"[.،؛:!؟»﴾)\]…]$")
RUNNING = re.compile(
    r"^(?:-{0,3}\s*)?(?:الفصل\s+الدراسي|الصف\s+\S+|المادة|الوحدة|القسم)\b|"
    r"\|\s*[٠-٩\d]{1,4}\s*$|"
    r"^(?:ال)?(?:تفسير|حديث|فقه|توحيد|نحو|صرف|بلاغة|أدب|مطالعة|وجيز|مختار|تيسير|شرح)\b[^\n]*\|"
    r"|\|[^\n]*(?:ياسر|القباني|القُباني|الأزهر)\b"
    r"|^[٠-٩\d]{1,3}\s+د/\s"
    r"|^د/\s*(?:ياسر|القباني)"
    r"|^[٠-٩\d]{1,3}\s+(?:للصف|تفسير|حديث|فقه|توحيد|نحو|صرف|بلاغة|أدب|مطالعة)"
)
HEAD_JUNK = re.compile(r"حقوق الطبع|إعداد|فهرس|\||@|http|www")
HEAD_MAJOR = re.compile(
    r"^(?:الباب|الفصل|المبحث|المقدمة|الخاتمة|تمهيد|التمهيد|"
    r"كِتَابُ|كتاب|القسم|الجزء)\b"
)


def _is_heading(lines: list[str], i: int) -> bool:
    s = lines[i].strip()
    if not (4 <= len(s) <= 42):
        return False
    if HEAD_TERM.search(s) or HEAD_JUNK.search(s):
        return False
    if re.match(r"^[\d\-•(]", s):
        return False
    prev = lines[i - 1].strip() if i else ""
    nxt = lines[i + 1].strip() if i + 1 < len(lines) else ""
    if prev or not nxt:
        return False
    # كلمة واحدة: تُقبل فقط إذا بدأت بـ«ال» أو كانت عنوانًا معروفًا
    if " " not in s and not s.startswith("ال") and len(s) < 8:
        return False
    if "﴿" in s or "«" in s:
        return False
    return True


def reflow_book(text: str) -> list[tuple[str, str]]:
    """يعيد بناء فقرات الكتاب من أسطر OCR المكسورة + يكتشف العناوين."""
    raw_lines = text.splitlines()
    blocks: list[tuple[str, str]] = []
    buf: list[str] = []
    table: list[str] = []

    def flush():
        nonlocal buf
        if buf:
            blocks.append(("para", " ".join(x.strip() for x in buf)))
            buf = []

    def flush_table():
        nonlocal table
        if table:
            blocks.append(("table", "\n".join(table)))
            table = []

    for i, line in enumerate(raw_lines):
        s = line.strip()
        if not s:
            flush()
            flush_table()
            continue
        if "PAGEBREAK" in s.upper():
            flush()
            flush_table()
            blocks.append(("pagebreak", ""))
            continue
        if re.fullmatch(r"[-–—_=*.\s]{3,}", s):
            flush()
            flush_table()
            continue
        if SKIP_ART.match(s):
            continue
        if RUNNING.search(s):  # ترويسة/تذييل الكتاب المطبوع
            continue
        if "|" in s:
            flush()
            table.append(s)
            continue
        flush_table()
        if s.startswith("### "):
            flush()
            blocks.append(("h3", s[4:].strip()))
            continue
        if s.startswith("## "):
            flush()
            blocks.append(("h2", s[3:].strip()))
            continue
        if s.startswith("# "):
            flush()
            blocks.append(("h1", s[2:].strip()))
            continue
        if s.startswith("> "):
            flush()
            blocks.append(("quote", s[2:].strip()))
            continue
        if re.match(r"^[-*•]\s+", s):
            flush()
            blocks.append(("list", re.sub(r"^[-*•]\s+", "", s)))
            continue
        if re.match(r"^[٠-٩\d]{1,2}[.)]\s+", s) and len(s) < 120:
            flush()
            blocks.append(("numlist", s))
            continue
        if _is_heading(raw_lines, i):
            flush()
            blocks.append(("h1" if HEAD_MAJOR.match(s) else "h2", s))
            continue
        buf.append(s)
        if HEAD_TERM.search(s) and len(s) > 30:
            flush()
    flush()
    flush_table()
    return blocks


def render_book(md_path: Path, out_path: Path, title=None, header=None, subtitle=None):
    text = md_path.read_text(encoding="utf-8", errors="ignore")
    blocks = reflow_book(text)

    doc = Document()
    setup_page(
        doc, header_text=header or title or md_path.stem, margins=(2.2, 2.0, 2.4, 2.2)
    )
    build_styles(doc, "book")
    book_title = title or md_path.stem.replace("_", " ")
    set_core(doc, book_title)

    # ── صفحة العنوان (بلا ترويسة/تذييل)
    doc.sections[0].different_first_page_header_footer = True
    for _ in range(9):
        add_para(doc, "", style="ArBody")
    if LTR_MODE:
        add_para(doc, header or "", style="ArSubtitle")
        add_para(doc, book_title, style="ArTitle")
        add_rule(doc, sz=18)
        add_para(doc, subtitle or "", style="ArSubtitle")
    else:
        add_para(doc, header or "", style="ArSubtitle")
        add_para(doc, book_title, style="ArTitle")
        add_rule(doc, sz=18)
        add_para(doc, subtitle or "", style="ArSubtitle")

    # كتلة بنود قصيرة (٢–١٢ بندًا متتاليًا) تبقى كاملةً في صفحة واحدة
    _NUMSTART = re.compile(r"^[٠-٩\d]{1,2}\s+\S")

    def _is_item(kind, body):
        if kind in ("list", "numlist"):
            return True
        if kind in ("para", "body"):
            return bool(_NUMSTART.match(_clean(body).strip()))
        return False

    keep_idx = set()
    _i = 0
    while _i < len(blocks):
        if _is_item(*blocks[_i]):
            _j = _i
            while _j < len(blocks) and _is_item(*blocks[_j]):
                _j += 1
            if 2 <= _j - _i <= 6:
                keep_idx.update(range(_i, _j - 1))
            _i = _j
        else:
            _i += 1

    def mark_keep(par, idx):
        if idx in keep_idx:
            pPr = par._p.get_or_add_pPr()
            pPr.append(_w("keepNext"))
            _reorder(pPr, PPR_ORDER)

    pending = {"brk": True}

    def apply_break(par):
        if pending["brk"]:
            pPr = par._p.get_or_add_pPr()
            pPr.append(_w("pageBreakBefore"))
            _reorder(pPr, PPR_ORDER)
            pending["brk"] = False
        return par

    first_heading = True
    started = False
    for idx, (kind, body) in enumerate(blocks):
        if kind == "pagebreak":
            if started:
                pending["brk"] = True
            continue
        cleaned = _clean(sanitize_light(body))
        if kind not in ("h1", "table") and (
            not cleaned
            or re.fullmatch(r"[٠-٩\d\s./–-]{0,6}", cleaned)
            or re.fullmatch(r"(?:د/\s*)?(?:ياسر\s+)?القبان[ىي]", cleaned)
            or re.fullmatch(r"[٠-٩\d]{1,3}\s*", cleaned)
        ):
            continue  # فقرة أصبحت فارغة/تذييلًا بعد التنظيف
        started = True
        if kind == "h1":
            if first_heading:
                first_heading = False
                if cleaned.strip() == book_title.strip():
                    # الغلاف يحمل العنوان أصلًا: لا تكرره، وابدأ المتن صفحةً جديدة
                    pending["brk"] = True
                    continue
                # أول عنوان قسم يبدأ صفحةً جديدة بنمط ArH1 نفسه (الغلاف مستقل)
                add_para(doc, body, style="ArH1")
                pending["brk"] = False
                continue
            par = add_para(doc, body, style="ArH1")
            pending["brk"] = False  # نمط H1 يبدأ صفحة جديدة أصلًا
        elif kind == "h2":
            apply_break(add_para(doc, body, style="ArH2"))
        elif kind == "h3":
            apply_break(add_para(doc, body, style="ArH3"))
        elif kind == "quote":
            apply_break(add_para(doc, body, style="ArQuote"))
        elif kind == "list":
            _par = apply_break(add_para(doc, "• " + body, style="ArList"))
            mark_keep(_par, idx)
        elif kind == "numlist":
            _par = apply_break(add_para(doc, body, style="ArList"))
            mark_keep(_par, idx)
        elif kind == "table":
            pending["brk"] = False  # لا تكسر الصفحة قبل الجدول (يُنتج صفحة بيضاء)
            add_table(doc, body)
        else:
            _par = apply_break(add_para(doc, body, style="ArBody"))
            mark_keep(_par, idx)

    post_clean(doc)
    trim_tail(doc)
    doc.save(str(out_path))
    return out_path


def add_table(doc, raw: str):
    """جدول RTL. صفوف OCR تسقط منها خلايا فارغة في النهاية، فتُكمَّل بلا
    أن تُهدم الجدولة كلها — وإلا انقلب الجدول إلى فقرة متدفقة ويضيع التناسق."""
    rows = []
    for line in raw.splitlines():
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        # سطر الفصل: «:---:» أو «: ---» (OCR يفصل النقطتين) — يُتجاهل، لا يُعد صفًّا
        if all(re.fullmatch(r"[\s:|]*-{2,}[\s:|]*", c) for c in cells if c):
            continue
        nonempty = [c for c in cells if c]
        if not nonempty:
            continue
        if all(RUNNING.search(c) for c in nonempty):
            continue
        rows.append(cells)
    if not rows:
        return

    ncols = max(len(r) for r in rows)
    counts = [len(r) for r in rows]
    # جدول مقبول: عامودان على الأقل، وأغلب الصفوف بالعرض الكامل أو أقصر منه
    # بخلية أو اثنتين (خلال فارغة مسقطة)، لا صفوف مقطوعة نصفين.
    full = sum(1 for c in counts if c == ncols)
    regular = ncols >= 2 and len(rows) >= 2 and full >= max(2, len(rows) * 0.5)
    if regular:
        rows = [r + [""] * (ncols - len(r)) for r in rows]

    if not regular:
        # فقرات: كل صفّ سطر، والخلايا مفصولة بفاصل
        for i, row in enumerate(rows):
            txt = "  ·  ".join(c for c in row if c)
            if not txt or re.fullmatch(
                r"(?:د/\s*)?(?:ياسر\s+)?القبان[ىي]", txt.strip()
            ):
                continue
            p = add_para(doc, txt, style="ArBody")
            if i == 0:
                pPr = p._p.get_or_add_pPr()
                pPr.append(_w("shd", val="clear", fill="F2F2F2"))
                _reorder(pPr, PPR_ORDER)
        return

    ncols = len(rows[0])
    table = doc.add_table(rows=len(rows), cols=ncols)
    table.style = "Table Grid"
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    tblPr = table._tbl.tblPr
    if not LTR_MODE:
        tblPr.append(_w("bidiVisual"))
    for i, row in enumerate(rows):
        for j in range(ncols):
            cell = table.cell(i, j)
            cell.text = ""
            p = cell.paragraphs[0]
            pPr = p._p.get_or_add_pPr()
            _bidi(pPr)
            pPr.append(_w("jc", val="left"))
            pPr.append(
                _w("spacing", before="30", after="30", line="260", lineRule="atLeast")
            )
            _reorder(pPr, PPR_ORDER)
            add_runs(p, row[j], base_size=11.5, base_bold=(i == 0))

    # جدول صغير ⇒ يبقى كاملًا في صفحة واحدة (لا يُشقّ صفًّا أو نصف جدول)
    small = len(rows) <= 8 and sum(len(c) for r in rows for c in r) < 900
    if small and len(rows) > 1:
        prev = table._tbl.getprevious()
        if prev is not None and prev.tag == qn("w:p"):
            cap = "".join(prev.itertext()).strip()
            if 0 < len(cap) <= 90:
                pPr = prev.find(qn("w:pPr"))
                if pPr is None:
                    pPr = OxmlElement("w:pPr")
                    prev.insert(0, pPr)
                pPr.append(_w("keepNext"))
                _reorder(pPr, PPR_ORDER)
    small = len(rows) <= 8 and sum(len(c) for r in rows for c in r) < 900
    if small and len(rows) > 1:
        for i in range(len(rows) - 1):
            for j in range(ncols):
                p = table.cell(i, j).paragraphs[0]
                pPr = p._p.get_or_add_pPr()
                pPr.append(_w("keepNext"))
                _reorder(pPr, PPR_ORDER)
        for tr in table._tbl.findall(qn("w:tr")):
            trPr = tr.find(qn("w:trPr"))
            if trPr is None:
                trPr = OxmlElement("w:trPr")
                tr.insert(0, trPr)
            trPr.append(_w("cantSplit"))


def post_clean(doc):
    """تمريرة أخيرة: تنظيف كل نصّ في المستند (ضمان نهائي)."""
    body = doc.element.body
    for p in body.iter(qn("w:p")):
        for t in p.iter(qn("w:t")):
            if not t.text:
                continue
            new = _clean(sanitize_light(t.text))
            if new != t.text:
                t.text = new
    # «==» قد تكون موزّعة على عدّة runs ⇒ تنظيف على مستوى الفقرة
    for p in body.iter(qn("w:p")):
        ts = list(p.iter(qn("w:t")))
        if not ts:
            continue
        full = "".join(t.text or "" for t in ts)
        if "==" in full:
            ts[0].text = full.replace("==", " ")
            for t in ts[1:]:
                t.text = ""

    # فقرات التذييل المطبوع (اسم المؤلف/رقم صفحة) تُحذف نهائيًا
    JUNK_P = re.compile(r"(?:د/\s*)?(?:ياسر\s+)?القبان[ىي]")
    for p in list(body.iter(qn("w:p"))):
        txt = _clean("".join(p.itertext()))
        if txt and JUNK_P.fullmatch(txt) and p.getparent() is body:
            body.remove(p)

    # فقرة فارغة تحمل كسر صفحة ⇒ كسر بلا محتوى (صفحة بيضاء)
    for p in body.iter(qn("w:p")):
        if "".join(p.itertext()).strip():
            continue
        pPr = p.find(qn("w:pPr"))
        if pPr is None:
            continue
        brk = pPr.find(qn("w:pageBreakBefore"))
        if brk is not None:
            pPr.remove(brk)


def trim_tail(doc):
    """يحذف الفقرات الفارغة في النهاية (تمنع صفحة بيضاء)."""
    body = doc.element.body
    for el in list(body)[::-1]:
        if el.tag.endswith("}sectPr"):
            continue
        if el.tag.endswith("}p") and not "".join(el.itertext()).strip():
            body.remove(el)
            continue
        break


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("profile", choices=["booklet", "book"])
    ap.add_argument("src")
    ap.add_argument("dst")
    ap.add_argument("--title", default=None)
    ap.add_argument("--header", default=None)
    ap.add_argument("--subtitle", default=None)
    ap.add_argument("--ltr", action="store_true")
    a = ap.parse_args()
    src, dst = Path(a.src), Path(a.dst)
    dst.parent.mkdir(parents=True, exist_ok=True)
    global LTR_MODE
    LTR_MODE = bool(a.ltr)
    # --subtitle يخصّ صفحة غلاف render_book فقط؛ render_booklet لا يقبله.
    if a.profile == "book":
        render_book(src, dst, a.title, a.header, subtitle=a.subtitle)
    else:
        render_booklet(src, dst, a.title, a.header)
    # تضمين خط Amiri داخل الملف (حتى يظهر بشكل صحيح على أي جهاز)
    try:
        sys.path.insert(0, str(Path(__file__).parent))
        from embed_fonts import embed

        embed(dst)
    except Exception as e:
        print(f"  ⚠️ تعذّر تضمين الخط: {e}")
    print(f"  ✅ {dst.name} ({dst.stat().st_size // 1024}K)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
