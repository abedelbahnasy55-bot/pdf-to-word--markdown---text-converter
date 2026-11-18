# Arabic & Bilingual Document Studio (PDF to Word, Google Docs & Markdown)

Converts Arabic, English, and bilingual PDF documents, Word files, and scanned images into calibrated Word (`.docx`), Google Docs, Markdown (`.md`), and plain text — featuring a digital-first hybrid extraction pipeline (including vector grammar underline preservation `<u>...</u>`), Uthmani Quranic verification (`﴿...﴾`), KaTeX math rendering, disk-backed background jobs, and a Smart Compilation Studio.

See [`LINKS_GUIDE.md`](./LINKS_GUIDE.md) for the complete map of public user links, supervisor admin access (`/?admin=1`), CLI/MCP endpoints, and GitHub + Republish workflow.

## Requirements

- Node.js 22 or newer
- `GEMINI_API_KEY` (only required for OCR on scanned pages or Smart Compiler AI passes; digital PDFs with an embedded text layer extract with zero API quota)
- Optional: `TEAM_ACCESS_CODE` (configured at runtime via environment variables or the Supervisor Console `/?admin=1`; never placed in `.env.example`)

## Setup

```bash
npm install
cp .env.example .env      # add GEMINI_API_KEY
```

The server reads `.env` via `dotenv.config()`.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Starts Express + Vite middleware server on port `3000` |
| `npm run build` | Builds the client to `dist/` and bundles the server to `dist/server.cjs` |
| `npm start` | Runs the production bundle from `dist/server.cjs` |
| `npm run lint` | Runs `tsc --noEmit` across the TypeScript workspace |
| `npm test` | Executes all Vitest characterization & regression suites once |
| `npm run test:watch` | Runs Vitest in watch mode |
| `npm run goldens` | Verifies live server extraction behavior against `tests/golden/` |

## Public vs. Supervisor Routes

- **Public Workspace (`/`)**: Clean end-user interface for uploading files, importing from Google Drive, tracking persistent server background jobs (`.jobs/`), using the Smart Compilation Studio, previewing results, and exporting to `.docx` or Google Docs.
- **Supervisor Console (`/?admin=1` or `/#admin`)**: Dedicated admin view containing the shareable Links Map, downloadable `LINKS_GUIDE.md`, Team Access Passcode management & session revocation, Live Gemini Free-Tier Model Pool monitor/probe, Project Custom Instructions (EN/AR), Google Workspace connection overview, and CLI/MCP Hub.

## How Conversion Works

1. **Digital-First Extraction (Zero Quota)**: Every PDF is checked locally first via `/api/extract-direct-pdf`. Embedded text and vector underlines (`<u>...</u>` for `"أعرب ما تحته خط"`) are extracted deterministically without calling Gemini.
2. **Dynamic Free-Tier OCR Rotation**: If a document is scanned or image-based, the server/client falls back to scanned OCR batches using `server/modelPool.ts` (`@google/genai` dynamic free-tier list + `buildSafeThinkingConfig`).
3. **Audit & Bilingual Calibration**: Runs normalize Arabic presentation forms, validate Uthmani Quranic verses inside `﴿...﴾`, audit tables/headings/punctuation, and output calibrated RTL/LTR `.docx` (`shared/typographyDocxCore.ts`) and Google Docs files.

## Testing

`tests/` contains the characterization and regression suites (`npm test`) covering cross-file rule parity, extraction anchors, team auth, model pool sanitization & thinking configs, DOCX underline/RTL runs, and server golden fixtures (`npm run goldens`).