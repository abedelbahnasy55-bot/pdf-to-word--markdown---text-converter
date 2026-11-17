#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""verify_quotes.py — تدقيق الاقتباسات في نصّ عربي: قرآن · حديث · شعر · سلامة نصّية.

الاستخدام:
  python3 verify_quotes.py book.md [book2.md ...] [--json out.json] [--fix] [--no-hadith]

رموز النتائج:
  Q001 نصّ آية مخالف للمصحف (حروف/كلمات)      Q002 تشكيل مخالف
  Q003 مرجع خاطئ                              Q004 بلا مرجع
  Q005 اقتباس يمتدّ آيتين (معلومة)
  H001 حديث غير موجود في البخاري/مسلم          H002 نصّ حديث مخالف
  T001 أقواس معقوفة {}                        T002 أشكال عرضية/حروف فارسية/تطويل
  T003 أقواس غير متوازنة                      T004 مسافة قبل ترقيم
  T005 مسافة مزدوجة                           T006 ** غير متوازن
  T007 جدول بأعمدة مختلفة                     T008 عنوان مكرر
  T009 سطر طويل جدًا                          T010 سطر مكرر (تسرّب ترويسة)

المصادر (تُنزَّل مرة واحدة إلى ~/.cache/ar-verify):
  قرآن: qpc-hafs (تشكيل + وقف) · simple-clean (حروف) · chapters.json
  حديث: ara-bukhari / ara-muslim من fawazahmed0/hadith-api (Unlicense)
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass, field, asdict
from difflib import SequenceMatcher
from pathlib import Path

CACHE = Path.home() / ".cache" / "ar-verify"

MARKS = re.compile(r"[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]")
IGNORE = re.compile(r"[\u0640\u06D6-\u06ED]")
PRESENTATION = re.compile(r"[\uFB50-\uFD3D\uFD40-\uFDFF\uFE70-\uFEFC]")
FARSI = re.compile(r"[پچژگکی]")
AR_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789")
LETTER_MAP = str.maketrans(
    {"أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا", "ى": "ي", "ئ": "ي", "ؤ": "و", "ة": "ه"}
)

LETTER_CACHE: dict[int, str] = {}


def normalize_letters(s: str) -> str:
    """حروف فقط: بلا تشكيل ولا رموز، مع توحيد الهمزات والألف المقصورة."""
    out = []
    for ch in s:
        if ch in "أإآٱ":
            out.append("ا")
        elif ch in "ىئ":
            out.append("ي")
        elif ch == "ؤ":
            out.append("و")
        elif ch == "ة":
            out.append("ه")
        elif MARKS.match(ch) or IGNORE.match(ch):
            continue
        elif ch.isalnum():
            out.append(ch)
        elif ch.isspace():
            out.append(" ")
    return re.sub(r"\s+", "", "".join(out))


NUM_TOKEN = re.compile(r"^[\(\[]?[٠-٩0-9]{1,3}[\)\]]?$")
STOPWORDS = {"يا", "ايها", "ايها"}


def drop_stop(ws: list[str]) -> list[str]:
    """يحذف «يا» المدمجة/المنفصلة لأن OCR يلصقها بالكلمة التالية."""
    return [w for w in ws if w not in STOPWORDS]


def word_keys(s: str) -> list[str]:
    out = []
    for w in s.split():
        k = normalize_letters(w)
        if not k or NUM_TOKEN.match(w.strip()):
            continue
        out.append(k)
    return out


def plain_name(s: str) -> str:
    """اسم سورة بلا تشكيل ولا رموز وقف."""
    return re.sub(r"[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]", "", s).strip()


def cluster_key(s: str) -> str:
    """شكل مقارن للتشكيل: حرف + حركاته مرتّبة (مع توحيد السكون العثماني)."""
    clusters: list[list] = []
    for ch in s:
        if ch == "\u06e1":  # سكون عثماني صغير
            ch = "\u0652"
        if ch == "\u0670":
            continue
        if ch.isspace() or IGNORE.match(ch):
            continue
        if MARKS.match(ch):
            if clusters:
                clusters[-1][1].append(ch)
        else:
            base = ch.translate(LETTER_MAP) if ch in "أإآٱىئؤة" else ch
            clusters.append([base, []])
    return "".join(b + "".join(sorted(m)) for b, m in clusters)


@dataclass
class Finding:
    code: str
    severity: str
    file: str
    line: int
    message: str
    excerpt: str = ""
    suggestion: str = ""
    ordinal: int = -1

    def key(self):
        return (self.file, self.line, self.code)



SEG_NUM = re.compile(r"(?<![\w\u0621-\u064A])\(?\s*([0-9\u0660-\u0669]{1,3})\s*\)?")
AR2EN = str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789")


def split_segments(body: str):
    """يقسم اقتباسًا يحوي أرقام آيات مضمّنة — الرقم يختم الآية التي قبله."""
    marks = list(SEG_NUM.finditer(body))
    if len(marks) < 3:
        return None
    segs, prev = [], 0
    for m in marks:
        num = int(m.group(1).translate(AR2EN))
        txt = body[prev:m.start()].strip(" .،؛\t")
        if txt:
            segs.append((num, txt, m.group(0)))
        prev = m.end()
    return segs if len(segs) >= 3 else None


class Quran:
    def __init__(self, cache: Path):
        self.names: dict[str, int] = {}
        self.by_id: dict[int, list[str]] = {}
        data = json.loads((cache / "quran-simple.json").read_text(encoding="utf-8"))
        self.display: dict[int, str] = {}
        for surah in data["data"]["surahs"]:
            sid = surah["number"]
            name = re.sub(r"^سُورَةُ\s*", "", surah["name"]).strip()
            self.names[normalize_letters(name)] = sid
            self.display[sid] = name
            verses = [a["text"].replace("\ufeff", "") for a in surah["ayahs"]]
            if sid != 1 and verses:
                w = verses[0].split()
                if [normalize_letters(x) for x in w[:4]] == ["بسم", "الله", "الرحمن", "الرحيم"]:
                    verses[0] = " ".join(w[4:])
            self.by_id[sid] = verses
        self.verse_words = {}
        self.orig_words = {}
        for sid, lst in self.by_id.items():
            for idx, txt in enumerate(lst):
                keep = [w for w in txt.split() if normalize_letters(w)]
                self.orig_words[(sid, idx + 1)] = keep
                self.verse_words[(sid, idx + 1)] = [normalize_letters(w) for w in keep]
        self.by_first: dict[str, list[int]] = defaultdict(list)
        self.by_word: dict[str, list[int]] = defaultdict(list)
        self.flat = [
            (sid, idx + 1, txt, word_keys(txt))
            for sid, lst in self.by_id.items()
            for idx, txt in enumerate(lst)
        ]
        for i, (sid, ayah, txt, ws) in enumerate(self.flat):
            if ws:
                self.by_first[ws[0]].append(i)
            for w in set(ws):
                self.by_word[w].append(i)

    def resolve(self, name: str) -> int | None:
        key = normalize_letters(name)
        if key in self.names:
            return self.names[key]
        best = (0.0, None)
        for cand, sid in self.names.items():
            r = SequenceMatcher(None, key, cand).ratio()
            if r > best[0]:
                best = (r, sid)
        return best[1] if best[0] >= 0.72 else None

    def span(self, sid: int, ayah: int, q: list[str]):
        """يعيد (نصّ المقطع، تغطية) لأقرب مقطع في الآية."""
        ws = self.verse_words.get((sid, ayah))
        if not ws:
            return None, 0.0
        sm = SequenceMatcher(None, q, ws, autojunk=False)
        blocks = [b for b in sm.get_matching_blocks() if b.size]
        if not blocks:
            return None, 0.0
        cov = sum(b.size for b in blocks) / len(q)
        b = max(blocks, key=lambda x: x.size)
        start = max(0, min(b.b - b.a, max(0, len(ws) - len(q))))
        words = self.orig_words.get((sid, ayah), [])
        return " ".join(words[start : start + len(q)]), cov

    def best_verse(self, q: list[str]):
        cand: set[int] = set(self.by_first.get(q[0], []))
        if not cand:
            rarest = min(q, key=lambda w: len(self.by_word.get(w, [])))
            cand = set(self.by_word.get(rarest, [])[:4000])
        best = (0.0, None, None)
        for i in list(cand)[:6000]:
            sid, ayah, txt, ws = self.flat[i]
            if not ws:
                continue
            sm = SequenceMatcher(None, q, ws, autojunk=False)
            cov = sum(b.size for b in sm.get_matching_blocks() if b.size) / len(q)
            if cov > best[0]:
                best = (cov, sid, ayah)
                if cov >= 0.999:
                    break
        return best


class Hadith:
    def __init__(self, cache: Path):
        self.items: list[tuple[str, int, str]] = []  # (كتاب, رقم, نصّ)
        for book, fname in (
            ("البخاري", "hadith-bukhari.json"),
            ("مسلم", "hadith-muslim.json"),
        ):
            p = cache / fname
            if not p.is_file():
                continue
            data = json.loads(p.read_text(encoding="utf-8"))
            for h in data["hadiths"]:
                txt = h.get("text", "")
                if len(txt) > 40:
                    self.items.append((book, int(h["hadithnumber"]), txt))
        self.orig = [
            [w for w in t.split() if normalize_letters(w)] for _, _, t in self.items
        ]
        self.keys = [[normalize_letters(w) for w in ws] for ws in self.orig]
        df = Counter()
        for ws in self.keys:
            for w in set(ws):
                df[w] += 1
        self.rare = {w for w, c in df.items() if c <= 400}
        self.index: dict[str, list[int]] = defaultdict(list)
        for i, ws in enumerate(self.keys):
            for w in set(ws) & self.rare:
                self.index[w].append(i)

    def find(self, q: list[str]):
        if not q:
            return None
        rare = sorted(
            (w for w in set(q) if w in self.rare), key=lambda w: len(self.index[w])
        )
        if not rare:
            return None
        cand = set(self.index[rare[0]])
        for w in rare[1:3]:
            cand &= set(self.index[w])
            if not cand:
                break
        if not cand:
            return None
        best = (0.0, None)
        for i in list(cand)[:400]:
            ws = self.keys[i]
            sm = SequenceMatcher(None, q, ws, autojunk=False)
            cov = sum(b.size for b in sm.get_matching_blocks() if b.size) / len(q)
            if cov > best[0]:
                best = (cov, i)
                if cov >= 0.999:
                    break
        return best if best[1] is not None else None


# ─────────────────────────── فاحص النصّ ───────────────────────────
VERSE_RE = re.compile(r"([﴿{])([^﴾}]*)([﴾}])")
REF_RE = re.compile(r"\s*\[([^\]]{2,80})\]")
HADITH_RE = re.compile(r"«([^»]{25,600})»")


class Checker:
    def __init__(self, quran: Quran, hadith: Hadith | None, fix: bool):
        self.quran = quran
        self.hadith = hadith
        self.fix = fix
        self.findings: list[Finding] = []
        self.fixed = 0

    def add(self, code, severity, path, ln, msg, excerpt="", suggestion="", ordinal=-1):
        self.findings.append(
            Finding(code, severity, str(path), ln, msg, excerpt, suggestion, ordinal)
        )

    def check_file(self, path: Path):
        raw = path.read_text(encoding="utf-8", errors="replace")
        lines = raw.split("\n")
        out: list[str] = []
        heading_seen: dict[str, int] = {}
        table_cols: int | None = None
        line_counts = Counter(l.strip() for l in lines if len(l.strip()) > 3)
        repeat_floor = max(5, len(lines) // 60)
        line_para, pid = [], 0
        for l in lines:
            line_para.append(pid)
            if not l.strip():
                pid += 1
        p_open, p_close = Counter(), Counter()
        for i, l in enumerate(lines):
            p_open[line_para[i]] += l.count("«")
            p_close[line_para[i]] += l.count("»")
        bad_para_first: dict[int, int] = {}
        for i, p_ in enumerate(line_para):
            if p_open[p_] != p_close[p_]:
                bad_para_first.setdefault(p_, i + 1)

        for ln, line in enumerate(lines, 1):
            new = line
            # ── اقتباسات قرآنية
            for oi, m in enumerate(VERSE_RE.finditer(line)):
                body, brace = m.group(2).strip(), m.group(1) == "{"
                if brace and len(re.findall(r"[\u0621-\u064A]+", body)) < 4:
                    brace = False
                rest = line[m.end() : m.end() + 60]
                rm = REF_RE.match(rest)
                ref = rm.group(1) if rm else ""
                self.check_verse(path, ln, body, ref, brace, oi)
                if brace and self.fix:
                    new = new.replace(m.group(0), f"﴿{m.group(2)}﴾", 1)
                    self.fixed += 1
            # ── أحاديث
            if self.hadith is not None:
                for m in HADITH_RE.finditer(line):
                    if "﴿" in m.group(0) or any(
                        v in m.group(0) for v in ("قال تعالى",)
                    ):
                        continue
                    self.check_hadith(path, ln, m.group(1))
            # ── سلامة نصّية
            new = self.check_hygiene(path, ln, new, heading_seen, line_counts, repeat_floor,
                                 bad_para_first.get(line_para[ln - 1]) == ln)
            # ── جداول
            if new.strip().startswith("|"):
                cols = len([c for c in new.strip().strip("|").split("|")])
                if not re.fullmatch(r"\|[\s:\-|]+\|", new.strip()):
                    if table_cols is None:
                        table_cols = cols
                    elif cols != table_cols:
                        self.add(
                            "T007",
                            "warn",
                            path,
                            ln,
                            f"جدول بأعمدة {cols} بعد {table_cols}",
                            new.strip()[:120],
                        )
            elif new.strip() == "":
                table_cols = None
            out.append(new)

        if self.fix:
            path.write_text("\n".join(out), encoding="utf-8")

    # ── آية واحدة
    def check_verse(self, path, ln, body, ref, brace, ordinal=0):
        q = word_keys(body)
        if not q:
            return
        if brace:
            self.add("T001", "error", path, ln, "أقواس معقوفة { } بدل ﴿ ﴾", body,
                     f"﴿{body}﴾", ordinal)
        surah_name, ayah = self.parse_ref(ref)
        surah = self.quran.resolve(surah_name) if surah_name else None
        if surah and ayah:
            segs = split_segments(body)
            if segs and segs[0][0] == ayah:
                if self.check_segmented(path, ln, body, surah, segs, ordinal):
                    return
        if not ref:
            if len(q) >= 4:
                self.add("Q004", "info", path, ln, "آية بلا مرجع", body, "", ordinal)
        elif surah is None:
            self.add("Q004", "warn", path, ln, f"مرجع غير مفهوم: {ref}", body, "", ordinal)

        if surah and ayah:
            span, cov = self.quran.span(surah, ayah, q)
            if cov >= 0.50 and span:
                self.compare_verse(path, ln, body, surah, ayah, span, cov, ref, ordinal)
                return
            merged, mcov = self.merge_span(surah, ayah, q)
            if mcov >= 0.95 and mcov > cov + 0.25 and merged:
                self.add("Q005", "info", path, ln,
                         f"اقتباس متعدد الآيات ({surah}:{ayah})", body, "", ordinal)
                self.compare_verse(path, ln, body, surah, ayah, merged, mcov, ref, ordinal)
                return
            cov2, sid, yah = self.quran.best_verse(q)
            if cov2 >= 0.90 and sid:
                span2, _ = self.quran.span(sid, yah, q)
                name = plain_name(self.quran.display.get(sid, str(sid)))
                self.add("Q003", "error", path, ln,
                         f"المرجع الصحيح: {name}: {yah} (المذكور: {ref})",
                         body, f"﴿{span2}﴾ [{name}: {yah}]", ordinal)
            else:
                self.add("Q001", "error", path, ln,
                         f"نصّ لا يطابق {surah}:{ayah} ولا مرجعًا آخر", body, "", ordinal)
            return

        if len(q) >= 3:
            cov, sid, yah = self.quran.best_verse(q)
            if cov >= 0.90 and sid:
                merged, mcov = self.merge_span(sid, yah, q)
                if mcov >= 0.95 and merged:
                    self.add("Q005", "info", path, ln, f"اقتباس متعدد الآيات ({sid}:{yah})", body, "", ordinal)
                    self.compare_verse(path, ln, body, sid, yah, merged, mcov, ref, ordinal)
        elif len(q) >= 4:
            pass

    def check_segmented(self, path, ln, body, sid, segs, ordinal):
        """يتحقق من اقتباس متعدد الآيات بأرقام مضمّنة، ويقترح النصّ الصحيح."""
        fixed, bad, missing = [], 0, 0
        for num, txt, mark in segs:
            q = word_keys(txt)
            if not q:
                return False
            span, cov = self.quran.span(sid, num, q)
            if not span or cov < 0.60:
                missing += 1
                fixed.append((txt, mark, None))
                continue
            fixed.append((txt, mark, span))
            if "".join(word_keys(txt)) != "".join(word_keys(span)):
                bad += 1
        if missing:
            return False
        if bad == 0:
            self.add("Q005", "info", path, ln,
                     f"اقتباس متعدد الآيات سليم ({sid}:{segs[0][0]}–{segs[-1][0]})",
                     body, "", ordinal)
            return True
        rebuilt = " ".join((sp or tx) + " " + mk for tx, mk, sp in fixed).strip()
        self.add("Q005", "warn", path, ln,
                 f"اقتباس متعدد الآيات: {bad} مقطعًا مخالفًا ({sid}:{segs[0][0]}–{segs[-1][0]})",
                 body, "﴿" + rebuilt + "﴾", ordinal)
        return True

    def merge_span(self, sid, ayah, q):
        """مقطع يمتدّ آيتين متتاليتين (أو ثلاثًا)."""
        lst = self.quran.by_id.get(sid, [])
        for extra in (1, 2, 3, 4, 5, 6, 7, 8):
            if ayah - 1 + extra >= len(lst):
                break
            words = []
            for k in range(extra + 1):
                words += [w for w in lst[ayah - 1 + k].split() if normalize_letters(w)]
            keys = [normalize_letters(w) for w in words]
            sm = SequenceMatcher(None, q, keys, autojunk=False)
            blocks = [b for b in sm.get_matching_blocks() if b.size]
            if not blocks:
                continue
            cov = sum(b.size for b in blocks) / len(q)
            if cov >= 0.90:
                b = max(blocks, key=lambda x: x.size)
                start = max(0, min(b.b - b.a, max(0, len(keys) - len(q))))
                return " ".join(words[start:start + len(q)]), cov
        return None, 0.0

    def compare_verse(self, path, ln, body, sid, ayah, span, cov, ref, ordinal=0):
        """يقارن الاقتباس بالمقطع المصحفي: الحروف أولًا ثم التشكيل على المتطابق."""
        if not span:
            return
        q_raw = [w for w in body.split() if word_keys(w)]
        s_raw = [w for w in span.split() if word_keys(w)]
        q = [normalize_letters(w) for w in q_raw]
        sk = [normalize_letters(w) for w in s_raw]
        sm = SequenceMatcher(None, q, sk, autojunk=False)
        replace = [o for o in sm.get_opcodes() if o[0] == "replace"]
        if replace:
            o, i1, i2, j1, j2 = max(replace, key=lambda x: (x[2] - x[1]) + (x[4] - x[3]))
            before = " ".join(q_raw[i1:i2])
            after = " ".join(s_raw[j1:j2])
            self.add("Q001", "error", path, ln, f"نصّ الآية مخالف ({sid}:{ayah}): «{before}» ← «{after}»",
                     body, f"﴿{span}﴾", ordinal)
            return
        diffs = []
        for o, i1, i2, j1, j2 in sm.get_opcodes():
            if o != "equal":
                continue
            for k in range(i2 - i1):
                if cluster_key(q_raw[i1 + k]) != cluster_key(s_raw[j1 + k]):
                    diffs.append((q_raw[i1 + k], s_raw[j1 + k]))
        if diffs:
            before, after = diffs[0]
            self.add("Q002", "warn", path, ln,
                     f"تشكيل مخالف ({sid}:{ayah}): «{before}» ← «{after}» ({len(diffs)} موضعًا)",
                     body, f"﴿{span}﴾", ordinal)

    def check_hadith(self, path, ln, quote):
        q = word_keys(quote)
        if len(q) < 5:
            return
        found = self.hadith.find(q)
        if not found or found[0] < 0.85:
            self.add(
                "H001", "info", path, ln, "حديث غير موجود في البخاري/مسلم", quote[:80]
            )
            return
        cov, idx = found
        book, num, text = self.hadith.items[idx]
        ws = self.hadith.keys[idx]
        sm = SequenceMatcher(None, q, ws, autojunk=False)
        blocks = [b for b in sm.get_matching_blocks() if b.size]
        bb = max(blocks, key=lambda x: x.size)
        start = max(0, min(bb.b - bb.a, len(ws) - len(q)))
        words = self.hadith.orig[idx]
        span = " ".join(words[start : start + len(q)])
        if "".join(word_keys(quote)) != "".join(word_keys(span)):
            self.add(
                "H002",
                "error",
                path,
                ln,
                f"نصّ حديث مخالف ({book} {num})",
                quote[:80],
                span,
            )

    # ── سلامة نصّية
    def check_hygiene(self, path, ln, line, heading_seen, line_counts, repeat_floor, para_bad):
        s = line
        if PRESENTATION.search(s):
            self.add(
                "T002", "error", path, ln, "أشكال عرضية (ﻛ ﻻ …) بدل حروف عادية", s[:90]
            )
            if self.fix:
                s = "".join(
                    chr(ord(c) - 0xFEE0) if 0xFE70 <= ord(c) <= 0xFEFC else c for c in s
                )
        if FARSI.search(s) and not re.search(r"[پچژگ]", s[:0]):
            bad = FARSI.findall(s)
            if bad:
                self.add(
                    "T002",
                    "error",
                    path,
                    ln,
                    f"حروف فارسية: {''.join(sorted(set(bad)))}",
                    s[:90],
                )
        if "\u0640" in s:
            self.add("T002", "warn", path, ln, "تطويل (ـ) داخل النصّ", s[:90])
        if para_bad:
            self.add("T003", "warn", path, ln, "أقواس «» غير متوازنة في الفقرة", s[:90])
        if re.search(r"(?<=[\u0621-\u064A])\s+[،؛؟!]", s) and not s.lstrip().startswith("|"):
            self.add("T004", "warn", path, ln, "مسافة قبل علامة ترقيم", s[:90])
            if self.fix:
                s = re.sub(r"(?<=[\u0621-\u064A])\s+([،؛؟!])", r"\1", s)
        if re.search(r"\S {2,}\S", s) and not s.lstrip().startswith(("|", "```")):
            self.add("T005", "warn", path, ln, "مسافة مزدوجة داخل نصّ", s[:90])
            if self.fix:
                s = re.sub(r"(?<=\S) {2,}(?=\S)", " ", s)
        if s.count("**") % 2 == 1 or s.strip() == "**":
            self.add("T006", "warn", path, ln, "** غير متوازن", s[:90])
        if len(s) > 600 and not s.lstrip().startswith("|"):
            self.add("T009", "info", path, ln, f"سطر طويل ({len(s)} حرفًا)", s[:90])
        m = re.match(r"^(#{2,4})\s+(.*)$", s)
        if m:
            title = m.group(2).strip()
            if title in heading_seen and ln - heading_seen[title] > 5:
                self.add(
                    "T008",
                    "warn",
                    path,
                    ln,
                    f"عنوان مكرر (أول ورود: {heading_seen[title]})",
                    title[:90],
                )
            heading_seen.setdefault(title, ln)
        if (
            line_counts.get(s.strip(), 0) >= repeat_floor
            and 3 < len(s.strip()) < 90
            and not s.strip().endswith((":", "："))
            and not s.strip().startswith(("#", "|", "-"))
            and not re.match(r"^[٠-٩\d]+[-.)]", s.strip())
        ):
            self.add(
                "T010",
                "info",
                path,
                ln,
                f"سطر مكرر {line_counts[s.strip()]} مرة (تسرّب ترويسة؟)",
                s.strip()[:90],
            )
        return s

    @staticmethod
    def parse_ref(ref: str):
        if not ref:
            return None, None
        t = ref.translate(AR_DIGITS).strip()
        m = re.match(r"([^\d:]+?)\s*[:\s]\s*([\d\u060c,\s\-–]+)$", t)
        if not m:
            return None, None
        try:
            ay = int(re.split(r"[\u060c,\-–]", m.group(2))[0])
        except Exception:
            return None, None
        return m.group(1).strip(), ay


def main() -> int:
    ap = argparse.ArgumentParser(description="تدقيق اقتباسات قرآنية/حديثية وسلامة النصّ")
    ap.add_argument("paths", nargs="+", type=Path)
    ap.add_argument("--json", type=Path, default=None)
    ap.add_argument("--fix", action="store_true", help="طبّق الإصلاحات الآمنة")
    ap.add_argument("--no-hadith", action="store_true")
    ap.add_argument("--cache", type=Path, default=CACHE)
    ap.add_argument("--max-print", type=int, default=12)
    args = ap.parse_args()

    if not (args.cache / "quran-simple.json").is_file():
        print(
            f"❌ ملفات المصحف غير موجودة في {args.cache} — شغّل fetch_corpora.sh",
            file=sys.stderr,
        )
        return 2

    quran = Quran(args.cache)
    hadith = None if args.no_hadith else Hadith(args.cache)
    chk = Checker(quran, hadith, args.fix)

    files = []
    for p in args.paths:
        files.extend(sorted(p.rglob("*.md")) if p.is_dir() else [p])

    for f in files:
        chk.check_file(f)

    counts = Counter(x.code for x in chk.findings)
    print(f"📄 {len(files)} ملفًا · 🔎 {len(chk.findings)} ملاحظة")
    for code, n in counts.most_common():
        print(f"  {code}: {n}")
    shown = 0
    for x in sorted(
        chk.findings, key=lambda x: (x.severity != "error", x.file, x.line)
    ):
        if shown >= args.max_print:
            break
        print(
            f"\n[{x.code}] {x.file}:{x.line}\n  {x.message[:120]}\n  ← {x.excerpt[:90]}"
            + (f"\n  ✔ {x.suggestion[:120]}" if x.suggestion else "")
        )
        shown += 1

    if args.json:
        args.json.write_text(
            json.dumps([asdict(x) for x in chk.findings], ensure_ascii=False, indent=1),
            encoding="utf-8",
        )
        print(f"\n💾 {args.json}")
    if args.fix:
        print(f"🛠 إصلاحات مطبّقة: {chk.fixed}")
    return 1 if any(x.severity == "error" for x in chk.findings) else 0


if __name__ == "__main__":
    raise SystemExit(main())
