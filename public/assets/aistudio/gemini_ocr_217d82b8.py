# -*- coding: utf-8 -*-
"""gemini_ocr.py — PDF عربي (ممسوح أو رقمي) ← Markdown بالنسخ الحرفي.

المبادئ المثبتة عمليًّا:
  • القطعة 10 صفحات (وليس 60) ثم 6 عند الفشل — 36 صفحة تُنهي الجودة.
  • موديلات lite أولًا للسرعة، وتدوير عند نفاد الحصة (20 طلبًا/يوم/موديل).
  • رد فارغ عابر يُعاد 3 مرات قبل الحكم على الموديل بالموت.
  • استئناف على مستوى القطعة + كتابة حالة ذرّية.
  • إن كان للـPDF طبقة نصّ سليمة، لا داعي لـOCR أصلًا.

الاستخدام:
  python3 gemini_ocr.py book.pdf --out out/ --mode auto --chunk 10
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

from common import atomic_write, die, pdf_pages, read_json, resolve_key, run, write_json

BASE = "https://generativelanguage.googleapis.com"
UPLOAD = BASE + "/upload/v1beta/files"
GEN = BASE + "/v1beta/models/{model}:generateContent"
DEFAULT_MODELS = (
    "gemini-3.5-flash-lite,gemini-3.1-flash-lite,gemini-flash-lite-latest,"
    "gemini-3.5-flash,gemini-flash-latest,gemini-3-flash-preview,"
    "gemini-3.6-flash,gemini-3.7-flash"
)
_PAGES_HINT = [10]


def prompt_text() -> str:
    p = Path(__file__).resolve().parent.parent / "assets" / "prompt_ocr.txt"
    if p.is_file():
        return p.read_text(encoding="utf-8")
    return (
        "انسخ هذا المستند الممسوح إلى Markdown حرفيًّا. ضع ---PAGEBREAK--- بين كل صفحتين."
    )


def _req(
    url: str,
    data: bytes | None = None,
    headers: dict | None = None,
    method: str = "GET",
    timeout: int = 600,
) -> dict:
    req = urllib.request.Request(url, data=data, method=method, headers=headers or {})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw = r.read()
        hdr = dict(r.headers)
    try:
        out = json.loads(raw) if raw else {}
    except json.JSONDecodeError:
        out = {}
    if isinstance(out, dict):
        out["_headers"] = hdr
    return out


def upload(path: Path, key: str, tries: int = 4) -> str:
    data = path.read_bytes()
    size = len(data)
    last = ""
    for attempt in range(tries):
        try:
            meta = {"file": {"display_name": path.name, "mime_type": "application/pdf"}}
            h = {
                "X-Goog-Upload-Protocol": "resumable",
                "X-Goog-Upload-Command": "start",
                "X-Goog-Upload-Header-Content-Length": str(size),
                "X-Goog-Upload-Header-Content-Type": "application/pdf",
                "Content-Type": "application/json; charset=UTF-8",
            }
            h["x-goog-api-key"] = key
            r = _req(UPLOAD, json.dumps(meta).encode(), h, "POST", 120)
            up = (
                r.get("uploadUrl")
                or (r.get("_headers") or {}).get("X-Goog-Upload-URL")
                or (r.get("_headers") or {}).get("x-goog-upload-url")
            )
            if not up:
                raise RuntimeError(f"لا رابط رفع · body={str(r)[:120]}")
            r2 = _req(
                up,
                data,
                {
                    "Content-Length": str(size),
                    "Content-Type": "application/pdf",
                    "X-Goog-Upload-Offset": "0",
                    "X-Goog-Upload-Command": "upload, finalize",
                },
                "POST",
                900,
            )
            uri = (r2.get("file") or {}).get("uri")
            if not uri:
                raise RuntimeError(str(r2)[:200])
            return uri
        except urllib.error.HTTPError as e:
            last = f"HTTP {e.code}"
            if e.code in (429, 500, 502, 503, 504):
                time.sleep(min(120, 10 * (2**attempt)))
                continue
            raise RuntimeError(last) from e
        except Exception as e:  # noqa: BLE001
            last = f"{type(e).__name__}: {e}"
            time.sleep(min(60, 8 * (2**attempt)))
    raise RuntimeError(last)


def wait_active(uri: str, key: str, timeout: int = 300) -> None:
    t0 = time.time()
    url = uri
    while time.time() - t0 < timeout:
        r = _req(url, headers={"x-goog-api-key": key}, timeout=60)
        st = r.get("state") or r.get("status")
        if st in ("ACTIVE", "STATE_UNSPECIFIED"):
            return
        if st == "FAILED":
            raise RuntimeError(str(r)[:200])
        time.sleep(5)
    raise TimeoutError(f"لم يجهز الملف خلال {timeout}ث")


class QuotaExhausted(RuntimeError):
    pass


def quota_dead(body: str) -> bool:
    """429: نفاد حصة أم تجاوز معدل؟ (rate له retryDelay/RATE_LIMIT)."""
    low = body.lower()
    if "rate_limit" in low or "retrydelay" in low or "retry-after" in low:
        return False
    return "quota" in low or "resource_exhausted" in low


def generate(uri: str, key: str, model: str, tries: int = 5) -> str:
    body = {
        "contents": [
            {
                "parts": [
                    {"file_data": {"mime_type": "application/pdf", "file_uri": uri}},
                    {"text": prompt_text()},
                ]
            }
        ],
        "generationConfig": {"maxOutputTokens": 65536, "temperature": 0.1},
    }
    last = ""
    for attempt in range(tries):
        try:
            r = _req(
                GEN.format(model=model),
                json.dumps(body).encode(),
                {"Content-Type": "application/json", "x-goog-api-key": key},
                "POST",
                1200,
            )
            cands = r.get("candidates") or []
            if not cands:
                raise RuntimeError(str(r)[:200])
            finish = (cands[0] or {}).get("finishReason", "")
            if finish not in ("", "STOP"):
                raise RuntimeError(f"finishReason={finish}")
            txt = "".join(
                p.get("text", "")
                for p in ((cands[0].get("content") or {}).get("parts") or [])
            )
            if txt.strip():
                if len(txt) > 12_000 * max(1, _PAGES_HINT[0]):
                    raise RuntimeError("حلقة تكرار")
                return txt
            raise RuntimeError("نصّ فارغ")
        except urllib.error.HTTPError as e:
            body_txt = e.read()[:400].decode("utf-8", "replace")
            last = f"HTTP {e.code}: {body_txt[:120]}"
            if e.code == 429 and quota_dead(body_txt):
                raise QuotaExhausted(model)
            if e.code in (500, 502, 503, 504):
                time.sleep(min(120, 10 * (2**attempt)))
                continue
            raise RuntimeError(last) from e
        except Exception as e:  # noqa: BLE001
            last = f"{type(e).__name__}: {e}"
            time.sleep(min(60, 8 * (2**attempt)))
    raise RuntimeError(last)


def split_pdf(
    src: Path, chunk: int, work: Path, dpi: int = 0
) -> list[tuple[Path, int, int]]:
    """يقسّم PDF إلى قطع؛ مع dpi>0 يُعيد تصدير الصفحات كصور بدقة أعلى."""
    work.mkdir(parents=True, exist_ok=True)
    if dpi:
        import fitz
        from PIL import Image

        doc = fitz.open(str(src))
        n = len(doc)
        out = []
        for start in range(0, n, chunk):
            end = min(n, start + chunk)
            images = []
            for i in range(start, end):
                pix = doc[i].get_pixmap(
                    matrix=fitz.Matrix(dpi / 72, dpi / 72), alpha=False
                )
                images.append(
                    Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
                )
            path = work / f"{src.stem}_p{start + 1:04d}-{end:04d}_dpi{dpi}.pdf"
            images[0].save(
                path, save_all=True, append_images=images[1:], resolution=dpi
            )
            out.append((path, start + 1, end))
        doc.close()
        return out

    from pypdf import PdfReader, PdfWriter

    reader = PdfReader(str(src))
    n = len(reader.pages)
    out = []
    for start in range(0, n, chunk):
        end = min(n, start + chunk)
        writer = PdfWriter()
        for page in reader.pages[start:end]:
            writer.add_page(page)
        path = work / f"{src.stem}_p{start + 1:04d}-{end:04d}.pdf"
        with open(path, "wb") as fh:
            writer.write(fh)
        out.append((path, start + 1, end))
    return out


_GARBLED = re.compile(r"^[اأإآ]([^\u064B-\u0652])ل")


def lam_swap_rate(text: str) -> float | None:
    """نسبة الكلمات التي تبدأ بـ«ا + حرف + ل».

    طبقة النصّ في بعض ملفات InDesign تُخرِج اللام مقلوبة مع الحرف التاليها،
    فتظهر «الصرف» بصيغة «الرصف» و«الحذف» بصيغة «احلذف». في النصّ السليم لا
    تتجاوز النسبة 4% (كلّها كلمات حقيقية: الله، أولاً، أصل، أطلق)، بينما
    تقفز في الطبقة المقلوبة إلى الضعف تقريبًا. تُعيد None لعينة أصغر من
    أن يُحكم عليها.
    """
    words = re.findall(r"[؀-ۿ]{3,}", text)
    if len(words) < 1500:
        return None
    hits = sum(1 for w in words if _GARBLED.match(w))
    return 100.0 * hits / len(words)


def text_layer(src: Path) -> str | None:
    """يستخرج طبقة النصّ إن كانت سليمة بدرجة كافية."""
    r = run(
        ["pdftotext", "-layout", "-enc", "UTF-8", str(src), "-"],
        timeout=300,
        check=False,
    )
    if r.returncode != 0 or not r.stdout.strip():
        return None
    pages = r.stdout.split("\f")
    if pages and not pages[-1].strip():
        pages = pages[:-1]
    n = len(pages) or 1
    chars = sum(len(p) for p in pages)
    avg_words = sum(len(p.split()) for p in pages) / n
    if chars / n < 120 or avg_words < 25:
        return None
    rate = lam_swap_rate(r.stdout)
    if rate is not None and rate >= 6.0:
        print(
            f"⚠️ طبقة النصّ مقلوبة الحروف ({rate:.1f}% من الكلمات) — "
            "تُستبعد ويُعتمد OCR",
            flush=True,
        )
        return None
    return "\n---PAGEBREAK---\n".join(p.strip() for p in pages if p.strip())


def ocr_pdf(
    src: Path,
    out: Path,
    work: Path,
    key: str,
    models: list[str],
    chunk: int,
    limit_pages: int = 0,
    dpi: int = 0,
) -> dict:
    state_path = work / f"{src.stem}.state.json"
    state = read_json(state_path, {}) or {}
    state.setdefault("chunks", {})
    dm = state.setdefault("dead_models", {})
    if isinstance(dm, list):
        dm = {m: time.time() for m in dm}
    state["dead_models"] = dm

    pages_total = pdf_pages(src)
    if limit_pages:
        chunk = min(chunk, limit_pages) if limit_pages < chunk else chunk
    pieces = split_pdf(src, chunk, work, dpi)
    if limit_pages:
        pieces = pieces[: max(1, (limit_pages + chunk - 1) // chunk)]

    now = time.time()
    alive = [m for m in models if now - float(dm.get(m, 0)) >= 86400]
    if not alive:
        die("كل الموديلات نفدت حصتها. أضف موديلًا جديدًا أو انتظر تجديد الحصة.", 1)

    parts: list[str] = []
    mi = 0
    for idx, (piece, p1, p2) in enumerate(pieces, 1):
        rec = state["chunks"].get(piece.name)
        if rec and rec.get("text"):
            if len(rec["text"]) <= 12_000 * (p2 - p1 + 1):
                parts.append(rec["text"])
                print(f"  ⏭ قطعة {idx}/{len(pieces)} محفوظة", flush=True)
                continue
        _PAGES_HINT[0] = p2 - p1 + 1
        text = None
        last_err = ""
        uri = upload(piece, key)
        wait_active(uri, key)
        for _ in range(len(alive) + 1):
            model = alive[mi % len(alive)]
            try:
                text = generate(uri, key, model)
                print(
                    f"  ✅ قطعة {idx}/{len(pieces)} · {len(text)} حرف · {model}",
                    flush=True,
                )
                break
            except QuotaExhausted:
                dm[model] = time.time()
                state["dead_models"] = dm
                now = time.time()
                alive = [m for m in models if now - float(dm.get(m, 0)) >= 86400]
                mi += 1
                if not alive:
                    write_json(state_path, state)
                    die("نفدت حصة كل الموديلات المتاحة.", 1)
                print(f"  🔄 حصة {model} نفدت ⇒ تبديل", flush=True)
            except RuntimeError as e:
                last_err = str(e)
                print(f"  ⚠️ {model}: {last_err[:100]}", flush=True)
                if "نصّ فارغ" in last_err:
                    # رد فارغ عابر: أعد المحاولة قبل الحكم بالموت
                    time.sleep(6)
                    continue
                time.sleep(8)
        if text is None:
            write_json(state_path, state)
            die(f"فشل تحويل القطعة {idx}/{len(pieces)}: {last_err}", 1)
        state["chunks"][piece.name] = {"text": text, "at": time.time(), "model": model}
        write_json(state_path, state)
        parts.append(text)

    full = "\n---PAGEBREAK---\n".join(parts)
    out.parent.mkdir(parents=True, exist_ok=True)
    atomic_write(out, full)
    atomic_write(out.with_suffix(".txt"), full)
    atomic_write(out.with_suffix(".source"), "ocr\n")
    return {"pages": pages_total, "chars": len(full), "chunks": len(pieces)}


def main() -> int:
    ap = argparse.ArgumentParser(
        description="PDF عربي ← Markdown بالنسخ الحرفي (Gemini)"
    )
    ap.add_argument("pdf", type=Path)
    ap.add_argument("--out", type=Path, default=None, help="مجلد أو ملف .md")
    ap.add_argument("--work", type=Path, default=None)
    ap.add_argument("--mode", choices=("auto", "ocr", "text"), default="auto")
    ap.add_argument("--models", default=DEFAULT_MODELS)
    ap.add_argument("--chunk", type=int, default=10)
    ap.add_argument(
        "--limit-pages", type=int, default=0, help="لتجربة سريعة على أول صفحات"
    )
    ap.add_argument(
        "--dpi", type=int, default=0, help="إعادة تصدير الصفحات بدقة أعلى (مثل 300)"
    )
    ap.add_argument("--key-file", default=None)
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    src = args.pdf.resolve()
    if not src.is_file():
        die(f"PDF غير موجود: {src}")
    out = args.out or (src.parent / f"{src.stem}.md")
    if out.suffix != ".md":
        out = out / f"{src.stem}.md"
    work = args.work or (Path.home() / ".cache" / "pdf2book" / src.stem)
    work.mkdir(parents=True, exist_ok=True)

    if out.is_file() and out.stat().st_size > 500 and not args.force:
        print(f"⏭ موجود: {out} (استخدم --force للإعادة)", flush=True)
        return 0

    if args.mode in ("auto", "text"):
        txt = text_layer(src)
        if txt:
            if args.limit_pages:
                txt = "\n---PAGEBREAK---\n".join(
                    txt.split("\n---PAGEBREAK---\n")[: args.limit_pages]
                )
            atomic_write(out, txt)
            atomic_write(out.with_suffix(".txt"), txt)
            atomic_write(out.with_suffix(".source"), "text\n")
            print(f"✅ طبقة نصّ سليمة — استُخرجت دون OCR: {out}", flush=True)
            return 0
        if args.mode == "text":
            die("لا توجد طبقة نصّ سليمة، والوضع text يمنع OCR.", 1)
        print("ℹ️ لا طبقة نصّ سليمة ⇒ OCR عبر Gemini", flush=True)

    key = resolve_key(args.key_file)
    models = [m.strip() for m in args.models.split(",") if m.strip()]
    stats = ocr_pdf(src, out, work, key, models, args.chunk, args.limit_pages, args.dpi)
    print(f"✅ {out} · {stats['chars']} حرف · {stats['chunks']} قطعة", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
