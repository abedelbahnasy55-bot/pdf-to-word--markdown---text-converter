# PDF to Word, Markdown & Text Converter

Converts PDF documents and scanned images into Word (`.docx`), Markdown (`.md`) and plain
text, with a seven-stage Arabic-focused audit pipeline: contextual verification, grammar
analysis, structural auditing, Uthmani Quranic verification, layout integrity, and final
calibration.

Upload one file or several, press convert, download. There is one conversion path and no
settings to choose — see [How conversion works](#how-conversion-works).

## Requirements

- Node.js 22 or newer
- A Gemini API key, **only** if you need AI recognition of scanned pages. PDFs that
  already contain a text layer are converted with no key and no quota.

## Setup

```bash
npm install
cp .env.example .env      # then put your GEMINI_API_KEY in it
```

The server reads `.env` (not `.env.local`) via `dotenv.config()`.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Server with Vite dev middleware and HMR |
| `npm run build` | Builds the client to `dist/` and bundles the server to `dist/server.cjs` |
| `npm start` | Runs the **bundled** server from `dist/` (run `npm run build` first) |
| `npm run lint` | Type-checks with `tsc --noEmit`; also the dead-code gate |
| `npm test` | Runs the test suite once |
| `npm run test:watch` | Runs the test suite in watch mode |
| `npm run goldens` | Re-checks server behavior against `tests/golden/` |

`npm run dev` accepts `--port <n>` and `--host <addr>`, falling back to the `PORT` and
`HOST` environment variables, then to `3000` and `0.0.0.0`.

## How conversion works

Conversion escalates on its own. There is no mode selector, because the available modes
produced visibly different output quality and nothing in the UI let you judge that in
advance.

1. **Direct extraction (free, and the accurate one).** Every PDF is first read directly
   from its own embedded text layer. Reading is both free and strictly more faithful than
   OCR, which can only infer words from rendered glyphs and can therefore invent text.
2. **AI recognition, only where it is genuinely needed.** If fewer than 60% of pages yield
   text, the file is treated as an image-only scan and the AI is asked to recognize it,
   12–15 pages per request.
3. **Audit.** Directly-read documents skip the two AI correction passes, because both exist
   to repair OCR damage that reading cannot produce. All local audit stages run either way,
   and the four audit reports are attached to the result so the reports panel is populated.

Consequences worth knowing:

- A book with a text layer costs **zero** API quota at any length.
- A scanned book costs roughly one request per 12–15 pages, plus two audit requests.
- A scanned book where a few pages happen to carry a stray text layer is correctly detected
  as a scan rather than silently converted to a handful of pages.

## Arabic and right-to-left output

The exporter normalizes Arabic presentation forms to standard Arabic, splits mixed
Arabic/Latin/digit lines into per-script runs so numbers and Latin words are not reordered,
tags runs with the Arabic language, and writes `<w:bidi/>` in schema-valid positions.

Arabic presentation forms matter more than any other detail here: they look like Arabic but
are pre-shaped, isolated glyphs, so a shaping engine cannot reshape them and the bidi
algorithm treats each as a neutral character rather than a letter. Converted text left in
that state renders as disconnected fragments with misordered digits. On this project's own
test document, 149 of 212 Arabic characters arrived in presentation form before
normalization.

## Testing

`tests/` is a **characterization** suite: it pins the current output of the transforms that
are duplicated across the codebase, so later structural changes can be proven
output-identical rather than merely type-checked.

Several pinned transforms are inline `.replace()` chains that cannot be imported — the
server starts a listener on import and two components pull in the DOM/JSZip/canvas graph —
so the harness reads the real source text and compiles it. The snapshots therefore break if
the actual expressions change, not if they merely move.

Chains are located by **content anchor, never by line number**, because an unrelated edit
above a chain shifts every later line and would fail a test for a reason unrelated to
behavior. If you see a provenance test fail on line numbers, that invariant has been broken.

Divergent copies are recorded as divergent rather than reconciled, because reconciling them
changes observable output and is a separate decision.

Server behavior that needs no API key is pinned in `tests/golden/server-extraction.json`
and checked by `npm run goldens`.

## Known limitations

- **Visual word order in some PDFs.** Arabic presentation forms are normalized, but if a
  PDF stores its text in visual order rather than logical order, the words come out
  reversed even though the letters are correct. Fixing this requires positional extraction
  from `pdf-parse`, not text normalization.
- **The four AI-backed endpoints are untested.** They require `GEMINI_API_KEY`; no key was
  available while this suite was written, so only the zero-quota path is pinned.
- **Scanned documents need the AI key and quota.** There is no offline OCR.