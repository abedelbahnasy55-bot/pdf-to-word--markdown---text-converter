import * as docx from 'docx';
import JSZip from 'jszip';
import { safeDownloadBlob, safeDownloadText } from './fileDownloader';
import {
  buildDocxBinary,
  DOCX_MIME,
  TYPOGRAPHY_PROFILES,
  segmentByScript,
  resolveParagraphDirection,
  type TypographyOptions,
  type FontProfileId,
  type ScriptSegment,
} from '../../shared/typographyDocxCore';
import { polishBilingualBoundariesCore } from '../../shared/arabicPipelineCore';
import { exportDocxRequest } from '../api/conversionApi';

export type { TypographyOptions, FontProfileId, ScriptSegment };
export { TYPOGRAPHY_PROFILES, segmentByScript, resolveParagraphDirection };

export interface DocxExportOptions {
  title: string;
  markdown: string;
  isRtl?: boolean;
  author?: string;
  typography?: TypographyOptions;
  fontProfile?: FontProfileId;
  arabicFont?: string;
  englishFont?: string;
  arabicSizePt?: number;
  englishSizePt?: number;
}

/**
 * Parses markdown text and converts it into native docx document paragraphs, tables, and runs.
 * Uses calibrated dual-script font sizing (Arabic szCs vs Latin sz), true mixed-script LTR/RTL
 * isolation ("الكلام المتداخل"), and strict RTL/page parity.
 * Automatically falls back to server-side binary generation if browser assembly encounters constraints.
 */
export async function generateDocxBlob(options: DocxExportOptions): Promise<Blob> {
  const polishedMarkdown = polishBilingualBoundariesCore(options.markdown || '');
  const payload = {
    ...options,
    markdown: polishedMarkdown,
  };

  try {
    const uint8 = await buildDocxBinary(payload, { docx, JSZip });
    const buffer = uint8.buffer.slice(uint8.byteOffset, uint8.byteOffset + uint8.byteLength) as ArrayBuffer;
    return new Blob([buffer], { type: DOCX_MIME });
  } catch (clientErr) {
    console.warn('[docxExporter] Client-side DOCX build failed, routing to server /api/export-docx:', clientErr);
    const arrayBuf = await exportDocxRequest(payload);
    return new Blob([arrayBuf], { type: DOCX_MIME });
  }
}

/**
 * Triggers browser download of generated DOCX file using resilient download.
 */
export async function downloadDocx(options: DocxExportOptions, filename: string): Promise<void> {
  const blob = await generateDocxBlob(options);
  const base = filename.replace(/\.docx$/i, '').trim() || 'document';
  const docxFilename = `${base}.docx`;
  safeDownloadBlob(blob, docxFilename);
}

/**
 * Triggers browser download of text or markdown using resilient download.
 */
export function downloadTextFile(
  content: string,
  filename: string,
  mimeType: string = 'text/plain;charset=utf-8'
): void {
  safeDownloadText(content, filename, mimeType);
}
