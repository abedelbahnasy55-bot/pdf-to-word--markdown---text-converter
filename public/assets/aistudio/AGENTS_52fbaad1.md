# AGENTS.md — arabic-pdf-to-book

Arabic PDF → Markdown → DOCX/PDF pipeline with measurable QA gates. Version in `SKILL.md` frontmatter is source of truth (currently `2.9.6`).

## Commands (exact, non-obvious)

```bash
# Tests — no network, 98 tests
bash tests/run_tests.sh          # or: make test
python3 -m unittest discover -s tests -p "test_*.py"   # single-run equivalent

# Inspect / convert / batch (installed wrapper: pdf2book -> scripts/pdf2book_cli.py)
pdf2book inspect book.pdf
pdf2book convert book.pdf --out books/
pdf2book batch <dir> --out <dir>

# Direct (when wrapper not installed)
cd scripts
python3 pdf_inspect.py "/path/book.pdf"
python3 pipeline.py "/path/book.pdf" --out "/path/books"
python3 pipeline.py book.pdf --out out --pages 3          # partial trial
python3 pipeline.py book.pdf --out out --lang en          # English
python3 pipeline.py book.pdf --out out --raw book.raw.md  # skip OCR
python3 pipeline.py math.pdf --out books --math pandoc    # Word OMML for $...$
python3 pipeline.py book.pdf --out out --structure gemini # optional AI structure

# QA — booklets MUST use --reflow (judged by chars/coverage, not page count)
python3 qa_gates.py --reflow --input book.pdf --md clean.md --docx book.docx --pdf-out book.pdf
# Exit: 0 = PASS, 1 = fail, 2 = missing file/usage error

# Quote verification (Qur'an/hadith corpora in ~/.cache/ar-verify, fetched once)
python3 verify_quotes.py <md|dir> --json out.json
pdf2book fetch-corpora
```

Requirements: Python 3.10+, `python-docx`, `pypdf` (`requirements.txt`), `poppler-utils` (`pdftotext`/`pdfinfo`), LibreOffice, Amiri font. Gemini keys live at `~/.config/ocr/gemini_keys` or `GEMINI_API_KEY*` — never commit secrets.

Install: `PDF2BOOK_LOCAL_SRC=$PWD bash install.sh` (local) or curl from `github.com/abedmohamed258/SKILLS` `main` sparse checkout.

## Architecture — only what changes work

- `scripts/pipeline.py` — orchestrator (inspect → OCR → clean → build → QA). Read it first for execution flow.
- `scripts/pdf2book_cli.py` — `pdf2book` entrypoint. `scripts/batch_convert.py` — resumable batch.
- `scripts/clean_md.py` — cleaning + `normalize_punct`/`normalize_hamza`. `scripts/docx_engine.py` — RTL DOCX builder (Amiri, tables, verses, poetry).
- `scripts/qa_gates.py` — QA gate (see below). `scripts/verify_quotes.py` — verse/hadith audit (codes `Q001–Q005`, `H001/H002`, `T001–T010`).
- `scripts/gemini_ocr.py` + `scripts/keypool.py` — OCR + key rotation. `scripts/local_ocr.py` / Tesseract — local fallback.
- `scripts/build_book.py` + `examples/sample.md` — demo: `make demo`.
- `scripts/table_extract.py` — table extraction (largest docx risk). Prefer executable behavior over `SKILL.md` prose if they conflict.

Pipeline thresholds (`SKILL.md` § gates): direct text extraction when ≥120 chars/page and ≥25 words/page (`pdftotext`), else Gemini OCR in 10-page chunks (fallback 6). Default gates: page-ratio ≥85%, chars/page ≥250, short-lines ≤28%, duplicate-pages ≤15%, tables equal columns, DOCX+PDF present and Arabic.

## QA gates — hard fail, not warn

`punct-spacing` (space before `،؛؟.!` or punct glued to next letter), `hamza-forms` (`اي/الي/ان/ابو/احمد/اذا/ازهر` after tashkeel-stripping), `lesson-names` (`الدرس N` / `أسئلة صفحة N` without real name), `tables`, `no-bad-markup`, `no-camscanner`, `no-reversed-parens` are **hard fail**. Whitelist is narrow and codified in `_punct_issues`/`_hamza_issues` in `qa_gates.py` (poetry `..`, standalone `...`, dotted answer blanks `........`, `[؟]`) — do not widen it without a regression test in `tests/test_qa_hard_gates.py`.

Fix pattern for punct-spacing: `re.sub(r"\s+([،؛؟.!])", r"\1", md)` then insert space after punct before Arabic letter. Verify with `python3 scripts/qa_gates.py --reflow ...` — never claim PASS without its exit code and output.

## Gotchas

- `--reflow` is mandatory for rebuilt booklets; without it page-ratio/OCR-coverage falsely fail.
- Quote split pattern in institute Hadith S2: keep `»فَذَلِكَ الْمُسْلِمُ« - »لَهُ ذِمَّةُ اللَّهِ«?` as two separate bracket pairs per original PDF — do not merge into one.
- Arabic MD must not contain bidi isolate/embedding chars `U+2066–U+2069` / `U+202A–U+202E` (breaks rendering silently). Check: `grep -rnP '[\x{2066}-\x{2069}\x{202a}-\x{202e}]' <path>`.
- `.pyc`/`__pycache__` are committed-accidentally present; never edit them. `.gitignore` already covers `__pycache__/`, `*.pyc`, `*.bak`, `.pdf2book_work/`, `.cache/`, `out/`.
- Bumping version requires: `SKILL.md` frontmatter `version:` + `CHANGELOG.md` entry with test count. Do not edit global `~/.config/opencode/AGENTS.md` for repo conventions — put them here.
