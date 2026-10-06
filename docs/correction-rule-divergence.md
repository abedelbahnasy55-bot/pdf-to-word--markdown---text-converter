# Correction Rule Divergence

These rules are implemented in **three separate places** that were never unified:

| Source | File | Form |
| --- | --- | --- |
| **A** | `src/utils/quranAuditor.ts` | `AZHAR_CORRECTION_RULES` table (the pipeline's canonical owner) |
| **B** | `src/utils/quranicVerificationAgent.ts` | `KNOWN_OCR_CANONICAL_TARGETS` table |
| **C** | `server.ts` | inline `.replace()` chain inside `cleanMarkdown` |

## Why this is not auto-unified

For several Quranic and hadith corrections the three sources spell the **replacement text
differently**, not just the pattern. For example, for `يَعْمَوْا عَمَهًا`:

- **A** produces `سَمِعُوا لَهَا شَهِيقًا`
- **B** produces `﴿سَمِعُوا لَهَا شَهِيقًا وَهِيَ تَفُورُ﴾` (the longer, complete ayah)
- **C** produces `سَمِعُوا لَهَا شَهِيقًا`

Choosing one silently would change what a reader sees in the corrected output. That is a
decision about **which wording is canonically correct** for a given curriculum — not a
refactor. It is deliberately left unmerged until that call is made explicitly.

The full, test-pinned divergence table lives in
`tests/cross-file-rule-divergence.test.ts`. It compares, per shared rule, each source's
pattern and replacement, and asserts where they agree and where they do not. **Treat that
test as the source of truth** for the current divergence state; this file is only the
orientation.

## What was unified, and what it means

Two defects were fixed without touching any replacement string, because they were matching
bugs rather than wording differences:

- **Haraka order.** Several patterns placed the shadda before the vowel — a sequence NFC
  Arabic never produces — so they could not match at all. Fixed by making diacritics
  optional (`shared/arabicPattern.ts`), letters still exact.
- **Dot-flood reachability.** The runaway-dot rule ran after a compression pass that had
  already normalised the corruption it detects. Fixed by reordering.

In both cases the **replacement text is byte-identical to before**; only matching changed.

## To unify (when authorized)

1. Pick the canonical replacement per divergent rule. This is a content decision.
2. Replace the server's inline `cleanMarkdown` chain and the
   `KNOWN_OCR_CANONICAL_TARGETS` table with imports from the single
   `AZHAR_CORRECTION_RULES` owner (or a new shared table both sides import), so there is
   one definition per correction.
3. Re-record the divergence test to assert full agreement, and delete the inline copies.

Until then the divergence is **pinned as-is** by the test suite, so it cannot drift
further and cannot regress silently.