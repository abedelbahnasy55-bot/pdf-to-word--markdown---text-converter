/**
 * Tracks how a document's markdown was produced, so later stages know whether an AI
 * correction pass is worth its quota.
 *
 * WHY THIS EXISTS
 * The pipeline converts a document by one of two routes:
 *
 *   - direct extraction, which READS the text layer already embedded in the PDF, or
 *   - AI recognition, which infers text from rendered glyphs and can therefore be
 *     wrong.
 *
 * Only the second route produces OCR damage. The AI contextual checker and grammar
 * analyzer exist to repair that damage, so calling them on a directly-extracted
 * document spends quota to rewrite text that was already exact.
 *
 * The marker travels WITH the markdown as an HTML comment rather than as a side
 * channel, because the document is passed as an opaque string through several
 * functions and through JSON to the server. Carrying the fact alongside the content
 * is the only way it survives all of those hops.
 */

/** Sentinel prefix. An HTML comment so it is inert if it ever reaches the renderer. */
const ORIGIN_MARKER = '<!--ext:direct-->';

/** Marks markdown as read directly from a text layer rather than recognized. */
export function markAsDirectlyExtracted(markdown: string): string {
  if (!markdown || markdown.startsWith(ORIGIN_MARKER)) return markdown;
  return `${ORIGIN_MARKER}\n${markdown}`;
}

/** True when the markdown carries the direct-extraction marker. */
export function isDirectlyExtractedMarkdown(markdown: string): boolean {
  return typeof markdown === 'string' && markdown.startsWith(ORIGIN_MARKER);
}

/**
 * Removes the marker from markdown that is about to be shown, exported, or written
 * to history, so it can never surface in the user's document.
 */
/**
 * Removes the marker from markdown that is about to be shown, exported, or written
 * to history, so it can never surface in the user's document.
 *
 * The marker is matched ANYWHERE on its own line, not only at offset zero. It used to
 * be stripped only when it sat at the very start of the string, which silently failed:
 * documentStructuralAuditor prepends an H1 when the text does not already begin with a
 * heading, so by the time this ran the marker had been pushed to line 3 behind a
 * "# title" line. The strip compared unequal text and returned it unchanged, and the
 * marker then reached the exported .docx as visible literal text, the .md download,
 * the plain-text tab, the saved history, and the batch archive.
 *
 * Stripping is idempotent, so it is safe to call more than once, and it removes every
 * occurrence rather than only the first.
 */
export function stripExtractionMarker(markdown: string): string {
  if (typeof markdown !== 'string') return markdown;
  if (!markdown.includes(ORIGIN_MARKER)) return markdown;
  return markdown
    .split('\n')
    .filter((line) => line.trim() !== ORIGIN_MARKER)
    .join('\n')
    // Removing a marker line leaves the blank lines that surrounded it behind, which
    // would show up as extra vertical gaps in the exported document.
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+/, '');
}