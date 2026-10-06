import { describe, it, expect } from 'vitest';
import {
  markAsDirectlyExtracted,
  isDirectlyExtractedMarkdown,
  stripExtractionMarker,
} from '../src/utils/extractionOrigin';
import { documentStructuralAuditor } from '../src/utils/documentStructuralAuditor';
import { quranicVerificationAgent } from '../src/utils/quranicVerificationAgent';
import { auditAndRestructureLayout } from '../src/utils/layoutIntegrityCore';
import { countRecoveredPages } from '../src/utils/documentConverter';

/**
 * These cover the extraction-origin marker, which decides whether the AI audit calls
 * are skipped. It was introduced to make direct extraction free of quota, but it
 * travels INSIDE the markdown as an HTML comment, so anything that reorders or
 * prepends text can strand it where the strip will not find it — and a stranded
 * marker reaches the user as literal text in the exported document.
 */
describe('extraction origin marker', () => {
  it('round-trips: mark then strip returns the original', () => {
    const md = '# عنوان\n\nنص عربي.\n';
    expect(stripExtractionMarker(markAsDirectlyExtracted(md))).toBe(md);
  });

  it('is recognized only when it was applied', () => {
    expect(isDirectlyExtractedMarkdown(markAsDirectlyExtracted('نص'))).toBe(true);
    expect(isDirectlyExtractedMarkdown('نص')).toBe(false);
  });

  it('does not double-mark when applied twice', () => {
    const once = markAsDirectlyExtracted('نص');
    expect(markAsDirectlyExtracted(once)).toBe(once);
  });

  // The bug this pins: strip only handled the marker at offset zero, so once the
  // structural auditor prepended an H1 above it the strip silently did nothing.
  it('strips the marker even when it is no longer the first thing in the document', () => {
    const stranded = '# مُستَنتَج\n\n<!--ext:direct-->\n\nنص عربي.';
    expect(strandExtractionMarkerIsPresent(stranded)).toBe(true);
    expect(stripExtractionMarker(stranded)).toBe('# مُستَنتَج\n\nنص عربي.');
  });

  it('strips every occurrence, not just the first', () => {
    const twice = '<!--ext:direct-->\nنص\n\n<!--ext:direct-->\nنص أكثر';
    expect(stripExtractionMarker(twice)).toBe('نص\n\nنص أكثر');
  });

  it('is idempotent', () => {
    const md = markAsDirectlyExtracted('# ت\n\nنص');
    expect(stripExtractionMarker(stripExtractionMarker(md))).toBe(stripExtractionMarker(md));
  });

  it('leaves unmarked markdown untouched, byte for byte', () => {
    const md = '# عنوان\n\n<!-- this is a real user comment -->\n\nنص.';
    expect(stripExtractionMarker(md)).toBe(md);
  });

  it('survives the full audit pipeline, then is removed from the result', async () => {
    // Text with NO leading heading, which is what forces the auditor to prepend one.
    const marked = markAsDirectlyExtracted(
      'قال ابن عباس رضي الله عنهما في قوله تعالى ﴿تَبَارَكَ الَّذِي بِيَدِهِ الْمُلْكُ﴾: الملك التام.',
    );

    const structural = await documentStructuralAuditor(marked, 'test');
    const quranic = await quranicVerificationAgent(structural.repairedMarkdown);
    const layout = await auditAndRestructureLayout(quranic.verifiedMarkdown);
    const final = stripExtractionMarker(layout.restructuredMarkdown);

    expect(final).not.toContain('ext:direct');
    // The derived plain text is produced from the same string, so it must be clean too.
    expect(final.replace(/^#+\s+/gm, '')).not.toContain('ext:direct');
    // The marker must still have been recognizable mid-pipeline, or the AI
    // short-circuit would never have fired.
    expect(layout.restructuredMarkdown).toContain('ext:direct');
  });
});

function strandExtractionMarkerIsPresent(md: string): boolean {
  return md.includes('<!--ext:direct-->');
}

describe('recovered-page coverage', () => {
  // Guards C2: a scanned book with one stray text layer used to be accepted as a
  // successful conversion holding one page of text, advertised as N pages.
  it('counts pages that carry text, ignoring empty segments', () => {
    expect(countRecoveredPages('صفحة أولى\n\n---PAGE_BREAK---\n\nصفحة ثانية')).toBe(2);
    expect(countRecoveredPages('صفحة\n\n---PAGE_BREAK---\n\n\n\n---PAGE_BREAK---\n\nص')).toBe(2);
    expect(countRecoveredPages('')).toBe(0);
    expect(countRecoveredPages('\n\n---PAGE_BREAK---\n\n   ')).toBe(0);
  });

  it('reports the coverage ratio the converter uses to decide on escalation', () => {
    const oneOfFive = 'نص\n\n---PAGE_BREAK---\n\n\n\n---PAGE_BREAK---\n\n\n\n---PAGE_BREAK---\n\n\n\n---PAGE_BREAK---';
    expect(countRecoveredPages(oneOfFive) / 5).toBeLessThan(0.6); // escalate to AI
    const allOfFive = Array(5).fill('نص').join('\n\n---PAGE_BREAK---\n\n');
    expect(countRecoveredPages(allOfFive) / 5).toBeGreaterThanOrEqual(0.6); // accept
  });
});