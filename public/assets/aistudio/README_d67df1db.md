# Arabic PDF → Book

Convert any Arabic PDF — scanned or digital — into a clean, RTL-typeset **Word (.docx)** and **PDF**, then **verify every Qur'anic verse, hadith and quotation** against local corpora, and repair the document's structure. Built for large Azhar-style curricula, usable for any Arabic book.

```
PDF ──▶ Markdown ──▶ DOCX ──▶ PDF
          │
          ├─ verify_quotes  → Qur'an · hadith · orthography
          ├─ fix_quotes     → apply verified corrections
          └─ clean_structure→ headers · bold · tables · long lines
```

## Why

OCR of Arabic books fails in ways English OCR does not: letters glue together, tashkeel is dropped or misplaced, verse references drift, page headers leak into the body, and `{…}` replaces `﴿…﴾`. This skill treats those as **measurable gates**, not surprises.

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/abedmohamed258/SKILLS/main/arabic-pdf-to-book/install.sh | bash
pdf2book version
```

Local checkout: `PDF2BOOK_LOCAL_SRC=$PWD bash install.sh`.

Requirements: Python 3.10+ · `python-docx` `pypdf` · poppler-utils · LibreOffice · Amiri font.
Optional: Tesseract (`ara`) for unlimited local OCR · a Gemini key for cloud OCR.

## Commands

| Command | Purpose |
|---|---|
| `pdf2book inspect book.pdf` | pre-flight: text layer? pages? chunk size? |
| `pdf2book convert book.pdf --out books/` | full pipeline (OCR → clean → build → QA) |
| `pdf2book batch <dir> --out <dir>` | whole library, resumable |
| `pdf2book verify <md\|dir> --json out.json` | **Qur'an / hadith / text-integrity audit** |
| `pdf2book fix-quotes out.json` | apply verified fixes, then re-verify |
| `pdf2book clean-structure <dir>` | header leaks · stray `**` · tables · long lines |
| `pdf2book keys` | Gemini key/quota capacity for the day |
| `pdf2book report <dir>` | success/failure report |

## Quota strategy (free tier)

Gemini free tier = **20 requests/day per model**, ≤10 pages per request.

| Setup | Pages/day |
|---|---:|
| 1 key × 1 model | 200 |
| 1 key × 8 models | 1,600 |
| 5 keys × 8 models | **8,000** |
| + Tesseract fallback | unlimited |

`keypool.py` rotates across (key × model) fairly, persists an atomic daily counter, distinguishes **429 quota** (switch slot) from **403 invalid key** (quarantine), and never wastes a request on a single page.

```bash
export GEMINI_API_KEY_1=...   # or ~/.config/ocr/gemini_keys (one per line)
pdf2book keys
```

## Verification corpora

| Corpus | Content | License |
|---|---|---|
| `quran-simple` | 6,236 verses, full tashkeel (authoritative for letters + marks) | Tanzil |
| `qpc-hafs` | Uthmani script + waqf marks (waqf checks only) | Quranpedia |
| `hadith-bukhari` / `-muslim` | 7,589 + 7,563 hadiths | Unlicense |

`pdf2book fetch-corpora` downloads ~20 MB to `~/.cache/ar-verify`.

### Finding codes

`Q001` verse text · `Q002` tashkeel · `Q003` wrong reference · `Q004` missing reference · `Q005` multi-verse quote (info) · `H001/H002` hadith · `T001`–`T010` structure (braces, presentation forms, guillemets, spacing, bold, tables, duplicate headings, long/repeated lines).

## Quality gates

Pages ratio ≥85% · chars/page ≥250 · short lines ≤28% · duplicate pages ≤15% · leaked markup = 0 · table columns consistent · DOCX+PDF present and Arabic.

## Real results

- Sarf booklet (3rd secondary): 250 verses audited, 31 corrupted words repaired, 112 glued option-lines split, 43 pages rebuilt.
- Materials sweep (59 files, 167k lines): **19,340 → 14,316** findings; 1,278 tashkeel errors → 3; 21 wrong references → 0; 1,005 `{…}` → 0.

## Tests

```bash
bash tests/run_tests.sh     # 98 tests, no network
```

## License

MIT — see [LICENSE](LICENSE).
