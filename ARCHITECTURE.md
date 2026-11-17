# Architecture & System Map

## 1. Overview
The application is a high-fidelity Arabic PDF & Document to Word/Markdown conversion and audit platform. It enforces strict RTL typesetting, Islamic textual verification (Quran & Hadith), and page-for-page parity.

## 2. Layering Architecture

```mermaid
graph TD
    UI[Web UI Layer: Dropzone, OutputViewer, StrictQAGatesCard, MicroscopicAuditStudio] --> Orchestrator[documentConverter.ts]
    Orchestrator --> PreFlight[pdfInspectorCore.ts]
    Orchestrator --> Chunker[pdfChunker.ts]
    Orchestrator --> Backend[AI Multimodal & Direct Extraction]
    Backend --> StructuralClean[structuralCleaner.ts]
    StructuralClean --> TextProc[textProcessor.ts & textCleanerEngine.ts]
    TextProc --> QuranicVerify[quranicVerificationAgent.ts & quranAuditor.ts]
    QuranicVerify --> LayoutCore[layoutIntegrityCore.ts]
    LayoutCore --> StructAuditor[structuralIntegrityAuditor.ts]
    StructAuditor --> QAGates[strictQAGatesEngine.ts (v2.9.6)]
    QAGates --> DocxExport[docxExporter.ts Heritage Palette]
```

## 3. Core Subsystems

### A. Pre-flight Inspector (`pdfInspectorCore.ts`)
- Analyzes document text layer density.
- Enforces the 10-page chunk rule for Gemini quota safety.

### B. Strict QA Gates Engine (`strictQAGatesEngine.ts`)
- Evaluates 6 hard gates:
  1. `punct-spacing`: 0 violations before punctuation.
  2. `hamza-forms`: Restores lexical hamzas in core vocabulary.
  3. `lesson-names`: Prevents heading skips (e.g. H1 to H3).
  4. `table-integrity`: Column uniformity and non-empty rows.
  5. `quotes-integrity`: Uthmani Quranic bracket verification and quote codes.
  6. `no-fragmentation`: Continuous prose lines.

### C. Heritage Typography DOCX Engine (`docxExporter.ts`)
- Implements design tokens (`#0B4F2C` Royal Green, `#A67C00` Gold, `#F7F2E3` Ivory shading, `#7B1E1E` Maroon questions).
- Strictly preserves RTL table formatting and literal numbering.
