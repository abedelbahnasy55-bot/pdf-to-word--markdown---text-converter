#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""embed_fonts.py — تضمين خط Amiri داخل ملفات DOCX (OOXML font embedding).

يطبّق مواصفة ECMA-376 (§17.8.1): تشويب أول ٣٢ بايت من ملف الخط بمفتاح GUID،
ثم ربطه في word/fontTable.xml + word/fonts/*.odttf + settings.xml.

الاستخدام:
    python3 embed_fonts.py <file.docx> [<file2.docx> ...]
    python3 embed_fonts.py --all <root_dir>
"""

from __future__ import annotations

import argparse
import shutil
import sys
import tempfile
import uuid
import zipfile
from pathlib import Path

FONT_REGULAR = Path("/usr/share/fonts/opentype/fonts-hosny-amiri/Amiri-Regular.ttf")
FONT_BOLD = Path("/usr/share/fonts/opentype/fonts-hosny-amiri/Amiri-Bold.ttf")

CT_FONT = "application/vnd.openxmlformats-officedocument.obfuscatedFont"
CT_FONTTABLE = (
    "application/vnd.openxmlformats-officedocument.wordprocessingml.fontTable+xml"
)
REL_FONT = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/font"
REL_FONTTABLE = (
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships/fontTable"
)


def obfuscate(data: bytes, key: uuid.UUID) -> bytes:
    """يشوّب أول ٣٢ بايت بمفتاح GUID (ترتيب OOXML)."""
    k = key.bytes
    kb = k[3::-1] + k[5:3:-1] + k[7:5:-1] + k[8:]
    out = bytearray(data)
    for i in range(min(32, len(out))):
        out[i] ^= kb[i % 16]
    return bytes(out)


def embed(docx: Path, regular=FONT_REGULAR, bold=FONT_BOLD) -> bool:
    if not regular.is_file():
        raise SystemExit(f"خط غير موجود: {regular}")
    key_r, key_b = uuid.uuid4(), uuid.uuid4()
    parts: dict[str, bytes] = {}
    with zipfile.ZipFile(docx) as z:
        names = z.namelist()
        for n in names:
            parts[n] = z.read(n)

    # ① ملفات الخطوط
    parts["word/fonts/font1.odttf"] = obfuscate(regular.read_bytes(), key_r)
    if bold.is_file():
        parts["word/fonts/font2.odttf"] = obfuscate(bold.read_bytes(), key_b)

    # ② fontTable.xml
    ft = parts.get("word/fontTable.xml", b"").decode("utf-8")
    if not ft:
        ft = (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
            '<w:fonts xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '
            'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            "</w:fonts>"
        )
    embeds = (
        f'<w:embedRegular r:id="rIdFont1" w:fontKey="{{{str(key_r).upper()}}}"/>'
        f'<w:embedBold r:id="rIdFont2" w:fontKey="{{{str(key_b).upper()}}}"/>'
    )
    if 'w:name="Amiri"' in ft:
        # أدخل عناصر التضمين داخل عنصر Amiri
        i = ft.index('w:name="Amiri"')
        j = ft.index("</w:font>", i)
        ft = ft[:j] + embeds + ft[j:]
    else:
        ft = ft.replace(
            "</w:fonts>", f'<w:font w:name="Amiri">{embeds}</w:font></w:fonts>'
        )
    parts["word/fontTable.xml"] = ft.encode("utf-8")

    # ③ علاقات fontTable
    rels_name = "word/_rels/fontTable.xml.rels"
    rels = parts.get(rels_name, b"").decode("utf-8")
    if not rels:
        rels = (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            "</Relationships>"
        )
    rels = rels.replace(
        "</Relationships>",
        f'<Relationship Id="rIdFont1" Type="{REL_FONT}" Target="fonts/font1.odttf"/>'
        f'<Relationship Id="rIdFont2" Type="{REL_FONT}" Target="fonts/font2.odttf"/>'
        "</Relationships>",
    )
    parts[rels_name] = rels.encode("utf-8")

    # ④ علاقة document → fontTable (إن لم توجد)
    drels_name = "word/_rels/document.xml.rels"
    drels = parts[drels_name].decode("utf-8")
    if REL_FONTTABLE not in drels:
        drels = drels.replace(
            "</Relationships>",
            f'<Relationship Id="rIdFontTable" Type="{REL_FONTTABLE}" '
            'Target="fontTable.xml"/></Relationships>',
        )
        parts[drels_name] = drels.encode("utf-8")

    # ⑤ Content Types
    ct = parts["[Content_Types].xml"].decode("utf-8")
    if 'Extension="odttf"' not in ct:
        ct = ct.replace(
            "<Default ",
            f'<Default Extension="odttf" ContentType="{CT_FONT}"/><Default ',
            1,
        )
    if "/word/fontTable.xml" not in ct:
        ct = ct.replace(
            "</Types>",
            f'<Override PartName="/word/fontTable.xml" ContentType="{CT_FONTTABLE}"/></Types>',
        )
    parts["[Content_Types].xml"] = ct.encode("utf-8")

    # ⑥ settings.xml
    st = parts["word/settings.xml"].decode("utf-8")
    if "embedTrueTypeFonts" not in st:
        add = "<w:embedTrueTypeFonts/><w:saveSubsetFonts/>"
        if "<w:defaultTabStop" in st:
            st = st.replace("<w:defaultTabStop", add + "<w:defaultTabStop", 1)
        else:
            st = st.replace("</w:settings>", add + "</w:settings>")
        parts["word/settings.xml"] = st.encode("utf-8")

    # ⑦ إعادة الكتابة
    tmp = Path(tempfile.mkstemp(suffix=".docx", dir=str(docx.parent))[1])
    with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as z:
        for n, data in parts.items():
            z.writestr(n, data)
    shutil.move(str(tmp), str(docx))
    return True


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("paths", nargs="+")
    ap.add_argument("--all", action="store_true")
    a = ap.parse_args()
    files: list[Path] = []
    for p in a.paths:
        pp = Path(p)
        if pp.is_dir():
            files += [f for f in pp.rglob("*.docx") if "BACKUP" not in str(f)]
        else:
            files.append(pp)
    ok = 0
    for f in files:
        try:
            embed(f)
            ok += 1
            print(f"  ✅ {f.name} ({f.stat().st_size // 1024}K)")
        except Exception as e:
            print(f"  ⛔ {f.name}: {e}")
    print(f"\n  🏁 {ok}/{len(files)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
