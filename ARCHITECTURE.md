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

### D. Dynamic Free-Tier Model Pool (`server/modelPool.ts`)
- Dynamically lists active `@google/genai` models via `ai.models.list()`, strips paid/specialty variants (`carbon`, `argon`, `image`, `lyria`, `omni`, `embedding`, `decision`, `-tts`, `-live`, standalone `pro`), rotates through active free-tier text models (`gemini-4-hydrogen`, `gemini-3.8-flash`, `gemini-3.7-flash`, `gemini-3.6-flash`, `gemini-3.5-flash`, `gemini-3.1-flash-lite`, `gemini-2.5-flash`), and enforces `buildSafeThinkingConfig(modelId)` (`LOW`, `MINIMAL`, or omitted on pre-3 models).

### E. Calibrated Bilingual DOCX Engine (`shared/typographyDocxCore.js`, `/api/export-docx`)
- Generates RTL/LTR schema-valid Word documents with `<w:bidi/>`, Arabic presentation-form normalization, KaTeX math support, Heritage/Publication typography profiles, and real underline runs (`<u>...</u>`) without requiring any external user login.

### F. Idle Resilience & Team Access Gate (`server/teamAuth.ts`, `src/utils/apiClient.ts`, `src/utils/connectionKeepAlive.ts`)
- `index.html` freezes `window.fetch`; internal app calls route through `apiFetch()` (automatically retrying `502`/`503`/`504` and attaching `X-Team-Session`).
- Server configures `keepAliveTimeout = 620s` and `GET /api/ping`, paired with client wake-sync without jarring `window.location.reload()`.
