# Architecture & System Map

## 1. Overview
**PDF Converter** is a full-stack bilingual (Arabic/English) PDF, image, and Word conversion, auditing, and smart compilation platform. It guarantees verbatim extraction fidelity, Uthmani Quranic script validation (`﴿...﴾`), vector underline preservation (`<u>...</u>` for grammar/exam spans), calibrated RTL `.docx` output, and zero-interruption server-side job persistence.

---

## 2. Layering & Routing Architecture

```mermaid
graph TD
    PublicUI[Public Workspace / — Dropzone, Batch Queue, OutputViewer, SmartCompilerWorkspace] --> ClientOrch[documentConverter.ts + apiFetch]
    AdminUI[Supervisor Console /?admin=1 — Links, Team Auth, Model Pool, CLI Hub, Custom Instructions] --> ServerAPI[Express server.ts]
    ClientOrch --> PreFlight[pdfInspectorCore.ts]
    ClientOrch --> DigitalExtract[POST /api/extract-direct-pdf + pdfUnderlineExtractor.ts]
    ClientOrch --> ServerOCR[POST /api/convert-pdf + server/modelPool.ts]
    ClientOrch --> BgJobs[POST /api/jobs + server/backgroundJobManager.ts (.jobs/)]
    ServerOCR --> SharedAudit[Structural, Quranic ﴿...﴾, Grammar Underline <u>, Layout & QA Gates]
    SharedAudit --> DocxEngine[shared/typographyDocxCore.js + POST /api/export-docx]
```

---

## 3. Core Subsystems

### A. Public vs. Supervisor Separation (`/src/App.tsx`, `/src/components/Navbar.tsx`, `/src/components/AdminConsolePage.tsx`)
- **Public Route (`/`)**: Focused workspace for end users with Dropzone, Server Background Jobs tracker, Batch Queue, Output Viewer, and Smart Compiler Studio — completely free of CLI, model telemetry, or deployment clutter.
- **Supervisor Route (`/?admin=1` or `/#admin`)**: Protected `AdminConsolePage` consolidating the Links Reference (`LINKS_GUIDE.md` download), Team Passcode & HMAC-SHA256 session revocation, Live Gemini Free-Tier Model Pool monitor/probe, Project Custom Instructions (EN/AR), and Automation CLI/MCP Hub.

### B. Digital-First Hybrid PDF & Underline Extraction (`server/pdfUnderlineExtractor.ts`, `/api/extract-direct-pdf`)
- Inspects PDFs digitally first (`CONVERSION_DEFAULTS.quotaOptimization = 'maximum_savings'`), extracting embedded text and geometric vector underline segments (`<u>...</u>`) before ever invoking OCR batches.
- Scanned documents fall back cleanly to chunked AI OCR batches on either the client runner or persistent disk-backed server jobs.

### C. Disk-Backed Background Jobs (`server/backgroundJobManager.ts`)
- Persists uploads, metadata, partial markdown pages, and completed `.docx` builds inside `.jobs/`.
- Survives closed tabs, browser restarts, and long idle periods; exposes pause, resume from exact page, preview partial results, and calibrated Word (`.docx`) export.

### D. Dynamic Free-Tier Model Pool & Shared Client (`server/modelPool.ts`, `server/clients/geminiClient.ts`)
- Dynamically lists active `@google/genai` models via `ai.models.list()`, strips paid/specialty variants (`carbon`, `argon`, `image`, `lyria`, `omni`, `embedding`, `decision`, `-tts`, `-live`, standalone `pro`), rotates through active free-tier text models (`gemini-4-hydrogen`, `gemini-3.8-flash`, `gemini-3.7-flash`, `gemini-3.6-flash`, `gemini-3.5-flash`, `gemini-3.1-flash-lite`, `gemini-2.5-flash`), and enforces `buildSafeThinkingConfig(modelId)` (`LOW`, `MINIMAL`, or omitted on pre-3 models).
- Centralizes Gemini execution retries, timeouts, and error classification (`executeWithModelPool`, `classifyGeminiHttpError`) in `server/clients/geminiClient.ts`.

### E. Calibrated Bilingual DOCX Engine (`shared/typographyDocxCore.js`, `server/controllers/exportRoutes.ts`)
- Generates RTL/LTR schema-valid Word documents with `<w:bidi/>`, Arabic presentation-form normalization, KaTeX math support, Heritage/Publication typography profiles, and real underline runs (`<u>...</u>`) without requiring any external user login.

### F. Idle Resilience, Hardening & Team Access Gate (`server/teamAuth.ts`, `server/middleware/errorHandlers.ts`, `src/utils/apiClient.ts`, `src/utils/connectionKeepAlive.ts`)
- `index.html` freezes `window.fetch`; internal app calls route through `apiFetch()` (automatically retrying `502`/`503`/`504`, attaching `X-Team-Session`, `X-Client-Id`, and `X-Client-Device`).
- Server configures `keepAliveTimeout = 620s` and `GET /api/ping`, paired with client wake-sync without jarring `window.location.reload()`.
- Security hardening sets baseline headers (`X-Content-Type-Options: nosniff`, `Referrer-Policy`, `X-Frame-Options: SAMEORIGIN`), reflects request `Origin` with `Vary: Origin` + `Access-Control-Allow-Credentials: true` on CORS requests, validates strict job IDs against path traversal, and protects `/api/info` when Team Lock is enabled.

### G. User Activity Governance, Quotas & Granular Controls (`server/governanceManager.ts`, `.jobs/governance.json`)
- Tracks visitors cleanly via persistent client identity (`X-Client-Id` + `X-Client-Device` + IP), per-file conversion logs (`started`, `processing`, `completed`, `paused`, `failed`, `blocked`), exact page/word/char counts, extraction method, duration, and error/block reasons.
- Enforces global controls (full site lock with custom maintenance message, global conversion pause with custom message, top announcement banner, feature toggles for OCR/Background Jobs/Smart Compiler/DOCX export, and daily/size/page quotas) as well as per-user granular modes (`allow`, `block_conversions`, `block_site`, optional `blockMatchingIpToo`, custom user messages, and custom daily page limits).
- All enforcement runs server-side with HTTP `403` and custom admin messages while keeping `/?admin=1` (`#admin`) and `/api/admin/*` routes reachable so the supervisor is never locked out.

### H. Project Directory Map
- `server/` — Express controllers (`controllers/`), `governanceManager.ts`, `backgroundJobManager.ts`, `modelPool.ts`, `clients/geminiClient.ts`, `middleware/errorHandlers.ts`, `config/runtimeConfig.ts`, `teamAuth.ts`, `smartCompilerRoutes.ts`, `pdfUnderlineExtractor.ts`
- `shared/` — Cross-runtime Arabic, Quranic, semantic search, compilation, and DOCX OOXML core modules shared across frontend, backend, and CLI scripts
- `src/` — Typed React SPA with extracted `api/`, `hooks/`, `model/`, `config/`, `utils/`, and accessible UI components under `components/` (including `components/admin/` for `AdminUsersTab`, `AdminLogsTab`, `AdminControlsTab`, and `AccessBlockedScreen`)
- `scripts/` — Standalone Node.js CLI batch runner, MCP v2.0 stdio server, and Python batch runner
- `tests/` — Vitest characterization and regression suites (`npm test`) and golden fixtures (`tests/golden/`)

