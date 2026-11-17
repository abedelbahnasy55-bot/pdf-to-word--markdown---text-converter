# Architectural Decisions Log

## D001: Unified Design Tokens & Heritage Azhari Palette
- **Context**: The app exports Word files and renders UI components with differing hex codes for green, gold, and navy.
- **Decision**: Centralize all design tokens into `src/tokens/designTokens.ts` using the v2.9.6 palette:
  - Royal Green: `#0B4F2C`
  - Heritage Gold: `#A67C00`
  - Warm Ivory Shading: `#F7F2E3`
  - Deep Navy: `#1F3864`
  - Question Maroon: `#7B1E1E`
- **Consequences**: Consistent visual hierarchy across the web UI, preview panels, and exported DOCX documents.

## D002: Modular Clean Architecture
- **Context**: Large monolithic modules in `src/utils/` mix domain rules with transport and rendering.
- **Decision**: Structure domain models, services, and UI into distinct, single-responsibility layers while maintaining backward-compatible facade exports in `src/utils/`.
- **Consequences**: No circular dependencies, testable pure functions, zero code duplication.
