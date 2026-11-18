#!/usr/bin/env python3
"""
Standalone Python CLI Batch Runner for PDF & Book Conversion.
Converts massive collections (150+ books, 10+ GB) locally with low RAM footprint,
automatic resumption via resume_state.json, scheduled ZIP packaging every N books,
and direct Google Gemini API mode (runs 24/7 with zero browser dependency).

Usage:
    python batch_runner.py --input="./books" --output="./converted" --bundle-size=15 --api-key="YOUR_KEY"
"""

import os
import sys
import json
import time
import base64
import argparse
import urllib.request
import urllib.error
import zipfile
from datetime import datetime

def parse_arguments():
    parser = argparse.ArgumentParser(description="تحويل دفعات الكتب الضخمة محلياً لملفات Word وحزم ZIP")
    parser.add_argument("--input", "-i", required=True, help="مسار مجلد الكتب (PDF)")
    parser.add_argument("--output", "-o", default="./converted_output", help="مسار مجلد حفظ المخرجات وحزم ZIP")
    parser.add_argument("--bundle-size", "-b", type=int, default=15, help="عدد الكتب في كل حزمة مضغوطة ZIP")
    parser.add_argument("--server", "-s", default=os.getenv("CONVERTER_SERVER_URL", "https://pdf-to-word-markdown-text-converter.ai.studio"), help="رابط سيرفر التحويل (اختياري)")
    parser.add_argument("--team-code", default=os.getenv("TEAM_ACCESS_CODE", ""), help="رمز دخول الفريق في حال تفعيل القفل")
    parser.add_argument("--api-key", "-k", default=os.getenv("GEMINI_API_KEY", ""), help="مفتاح Gemini API للاتصال المباشر 24/7 دون متصفح")
    return parser.parse_args()

FREE_GEMINI_MODELS = [
    "gemini-4-hydrogen",
    "gemini-3.8-flash",
    "gemini-3.7-flash",
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-3.1-flash-lite",
    "gemini-2.5-flash",
]

_TEAM_SESSION_TOKEN = ""

def get_team_auth_headers(server_url, team_code):
    global _TEAM_SESSION_TOKEN
    if not team_code:
        return {}
    if _TEAM_SESSION_TOKEN:
        return {"X-Team-Session": _TEAM_SESSION_TOKEN}
    try:
        req = urllib.request.Request(
            f"{server_url.rstrip('/')}/api/auth/verify",
            data=json.dumps({"code": team_code, "rememberDevice": True}).encode("utf-8"),
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            if data.get("success") and data.get("sessionToken"):
                _TEAM_SESSION_TOKEN = data["sessionToken"]
                return {"X-Team-Session": _TEAM_SESSION_TOKEN}
    except Exception:
        pass
    return {}

def scan_books(folder):
    books = []
    for root, _, files in os.walk(folder):
        for f in files:
            if f.lower().endswith(".pdf"):
                full_path = os.path.join(root, f)
                try:
                    size_mb = os.path.getsize(full_path) / (1024 * 1024)
                    books.append({
                        "name": f,
                        "path": full_path,
                        "size_mb": round(size_mb, 2)
                    })
                except Exception:
                    pass
    return books

def convert_chunk_direct_gemini(b64_str, api_key):
    """Direct Google Gemini REST API call with active free-tier model rotation."""
    clean_b64 = b64_str.replace("data:application/pdf;base64,", "")
    last_err = None
    for model_id in FREE_GEMINI_MODELS:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_id}:generateContent?key={api_key}"
        gen_cfg = {} if model_id.startswith("gemini-4-") else {"temperature": 0.0}
        payload = json.dumps({
            "contents": [
                {
                    "role": "user",
                    "parts": [
                        {"text": "Transcribe this document into 100% VERBATIM high-fidelity markdown with RTL Arabic layout, preserved headers, tables, footnotes, <u>underlined</u> spans, and Quranic verses in authentic Uthmani script inside ﴿...﴾. Do NOT summarize or skip any content."},
                        {
                            "inlineData": {
                                "mimeType": "application/pdf",
                                "data": clean_b64
                            }
                        }
                    ]
                }
            ],
            "generationConfig": gen_cfg
        }).encode("utf-8")

        req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                res_data = json.loads(resp.read().decode("utf-8"))
                candidates = res_data.get("candidates", [])
                if candidates and "content" in candidates[0]:
                    parts = candidates[0]["content"].get("parts", [])
                    if parts and "text" in parts[0]:
                        return parts[0]["text"]
        except Exception as e:
            last_err = e
            continue
    raise RuntimeError(f"Empty or failed response from Gemini free-tier models: {last_err}")

def convert_pdf_file(file_path, server_url, api_key, team_code=""):
    with open(file_path, "rb") as f:
        data = f.read()
    if not data:
        raise ValueError("الملف فارغ (0 بايت)")

    b64_str = base64.b64encode(data).decode("utf-8")
    max_attempts = 5

    for attempt in range(1, max_attempts + 1):
        # 1. Try direct Gemini API if key is available
        if api_key:
            try:
                return convert_chunk_direct_gemini(b64_str, api_key)
            except Exception as e:
                if attempt == max_attempts:
                    raise RuntimeError(f"Direct Gemini API failed: {str(e)}")

        # 2. Try server URL
        if server_url:
            payload = json.dumps({
                "pdfBase64": b64_str,
                "filename": os.path.basename(file_path),
                "options": {"direction": "rtl", "preserveHandwriting": True}
            }).encode("utf-8")

            headers = {"Content-Type": "application/json"}
            headers.update(get_team_auth_headers(server_url, team_code))
            req = urllib.request.Request(
                f"{server_url.rstrip('/')}/api/convert-pdf",
                data=payload,
                headers=headers
            )

            try:
                with urllib.request.urlopen(req, timeout=180) as response:
                    res_data = json.loads(response.read().decode("utf-8"))
                    if res_data.get("success") and res_data.get("data", {}).get("markdown"):
                        return res_data["data"]["markdown"]
            except Exception as e:
                if attempt == max_attempts and not api_key:
                    raise RuntimeError(f"Server conversion failed: {str(e)}")

        wait_sec = min(25, attempt * 4)
        print(f"      ⚠️ تعثر مؤقت. انتظار ({wait_sec} ث) لإعادة المحاولة [{attempt}/{max_attempts}]...")
        time.sleep(wait_sec)

    raise RuntimeError("تعذر معالجة الملف بعد عدة محاولات.")

def main():
    args = parse_arguments()
    print("=" * 65)
    print("   مُشغّل بايثون لتحويل الكتب الضخمة محلياً (Python CLI Batch Runner)")
    print("   وضع الاتصال المباشر - يعمل 24/7 دون متصفح")
    print("=" * 65)
    print(f"📁 مجلد الإدخال:  {args.input}")
    print(f"💾 مجلد المخرجات: {args.output}")
    print(f"📦 حجم حزم ZIP:  كل {args.bundle_size} كتاباً")
    if args.api_key:
        print("⚡ الوضع المباشر:  مفعل عبر Google Gemini API (مستقل 100% عن المتصفح)")
    else:
        print(f"🌐 المحرك الخادم: {args.server}\n")

    if not os.path.exists(args.input):
        print(f"❌ المجلد غير موجود: {args.input}")
        sys.exit(1)

    os.makedirs(args.output, exist_ok=True)
    books = scan_books(args.input)
    if not books:
        print("⚠️ لم يتم العثور على أي ملفات PDF.")
        sys.exit(0)

    print(f"🔍 تم اكتشاف {len(books)} كتاباً.")

    resume_file = os.path.join(args.output, "batch_resume.json")
    completed = set()
    failed = []
    bundle_index = 1

    if os.path.exists(resume_file):
        try:
            with open(resume_file, "r", encoding="utf-8") as rf:
                state = json.load(rf)
                completed = set(state.get("completed", []))
                failed = state.get("failed", [])
                bundle_index = state.get("bundleIndex", 1)
        except Exception:
            pass

    remaining = [b for b in books if b["path"] not in completed]
    print(f"🔄 المتبقي للتحويل: {len(remaining)} كتاباً (تم تخطي {len(completed)} تم تحويلهم مسبقاً).\n")

    current_batch = []

    for idx, book in enumerate(remaining, 1):
        print(f"[{len(completed) + 1}/{len(books)}] جاري تحويل: {book['name']} ({book['size_mb']} MB)...")
        try:
            markdown = convert_pdf_file(book["path"], args.server, args.api_key, args.team_code)
            base_name = os.path.splitext(book["name"])[0]

            md_path = os.path.join(args.output, f"{base_name}.md")
            with open(md_path, "w", encoding="utf-8") as mf:
                mf.write(markdown)

            print(f"   ✅ تم استخراج وحفظ: {base_name}.md\n")
            completed.add(book["path"])
            current_batch.append(md_path)

            with open(resume_file, "w", encoding="utf-8") as rf:
                json.dump({"completed": list(completed), "failed": failed, "bundleIndex": bundle_index}, rf, indent=2)

            # Pacing delay between books to strictly respect 15 RPM
            time.sleep(3.6)

            if len(current_batch) >= args.bundle_size or idx == len(remaining):
                zip_name = f"حزمة_الكتب_المضغوطة_{bundle_index}_عدد_{len(current_batch)}_كتاب.zip"
                zip_path = os.path.join(args.output, zip_name)
                print(f"📦 جاري إنشاء الحزمة المضغوطة: {zip_name}...")

                with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
                    for f_path in current_batch:
                        zf.write(f_path, arcname=os.path.basename(f_path))

                print(f"✨ تم إنشاء الحزمة بنجاح: {zip_name}\n")
                current_batch = []
                bundle_index += 1

                with open(resume_file, "w", encoding="utf-8") as rf:
                    json.dump({"completed": list(completed), "failed": failed, "bundleIndex": bundle_index}, rf, indent=2)

        except Exception as e:
            print(f"❌ تعثر تحويل {book['name']}: {str(e)}\n")
            failed.append({"file": book["path"], "error": str(e), "timestamp": datetime.now().isoformat()})
            with open(resume_file, "w", encoding="utf-8") as rf:
                json.dump({"completed": list(completed), "failed": failed, "bundleIndex": bundle_index}, rf, indent=2)

    print(f"\n🏁 تم اكتمال كافة العمليات وحفظ جميع النتائج في {args.output}")

if __name__ == "__main__":
    main()
