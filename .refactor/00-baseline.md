# Refactor Baseline (Phase 0)

- Date: 2026-11-08
- Stack: React 18, Vite, TypeScript, Tailwind CSS, Vitest, Express server (Node.js)
- Build: `npm run build` -> Succeeded (0 errors)
- Typecheck: `tsc --noEmit` -> Succeeded (0 errors)
- Tests: `npx vitest run tests/strict-qa-gates.test.ts` -> 6/6 passed (100%)
- Pre-existing note: snapshots in formatters-divergence test depend on test run date (October vs November snapshot expectation).
- Core Source Directories:
  - `src/utils/`: 25 utility, engine, and export modules
  - `src/components/`: 11 core UI components
  - `src/types.ts`: Domain models and conversion types
  - `shared/`: Cross-environment arabicText and sanitizers
