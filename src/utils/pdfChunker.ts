import { PDFDocument } from 'pdf-lib';

export interface PDFChunk {
  chunkIndex: number;
  totalChunks: number;
  startPage: number;
  endPage: number;
  base64: string;
}

export interface PDFPageRange {
  startPage: number;
  endPage: number;
}

export type QuotaOptimizationMode = 'maximum_savings' | 'balanced' | 'high_fidelity';

/**
 * Returns recommended pages per chunk based on total document length and quota optimization mode.
 * - 'maximum_savings': Up to 15 pages per chunk for huge books. Converts 500 pages in only ~35 calls (15x quota savings).
 * - 'balanced': 4 to 10 pages per chunk. Ideal balance for large secondary books (المعاصر، العمالقة).
 * - 'high_fidelity': 1 to 3 pages per chunk for rare ancient manuscripts.
 */
export function getRecommendedPagesPerChunk(
  totalPages: number,
  mode: QuotaOptimizationMode = 'balanced'
): number {
  if (mode === 'maximum_savings') {
    if (totalPages <= 3) return 1;
    if (totalPages <= 10) return 2;
    if (totalPages <= 30) return 5;
    if (totalPages <= 80) return 8;
    if (totalPages <= 200) return 12;
    return 15; // 15 pages per chunk: converts 450 pages in 30 calls!
  }

  if (mode === 'high_fidelity') {
    if (totalPages <= 6) return 1;
    if (totalPages <= 30) return 2;
    return 3;
  }

  // 'balanced' (Default):
  if (totalPages <= 4) return 1;
  if (totalPages <= 12) return 2;
  if (totalPages <= 40) return 4;
  if (totalPages <= 100) return 6;
  if (totalPages <= 250) return 8;
  return 10; // 10 pages per chunk for 250+ page textbooks (e.g. المعاصر 300 pages = 30 calls)
}

/**
 * Quick inspection helper to get page count of a PDF file
 */
export async function getPdfInfo(pdfBytes: ArrayBuffer): Promise<{ totalPages: number }> {
  try {
    const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    return { totalPages: doc.getPageCount() };
  } catch (err) {
    console.warn('Failed to get PDF info:', err);
    return { totalPages: 1 };
  }
}

/**
 * Splits a PDF ArrayBuffer into multiple chunks of at most `maxPagesPerChunk` pages.
 * Supports optional `pageRange` for processing specific chapters or subsets of massive books.
 */
export async function splitPDFIntoChunks(
  pdfBytes: ArrayBuffer,
  maxPagesPerChunk?: number,
  pageRange?: PDFPageRange
): Promise<{ totalPages: number; chunks: PDFChunk[]; effectiveStartPage: number; effectiveEndPage: number }> {
  const srcDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const totalPages = srcDoc.getPageCount();

  // Determine effective range (1-indexed)
  let effectiveStartPage = 1;
  let effectiveEndPage = totalPages;

  if (pageRange && pageRange.startPage > 0) {
    effectiveStartPage = Math.max(1, Math.min(pageRange.startPage, totalPages));
    effectiveEndPage = Math.max(effectiveStartPage, Math.min(pageRange.endPage, totalPages));
  }

  const pagesToProcess = effectiveEndPage - effectiveStartPage + 1;
  const chunkCapacity = maxPagesPerChunk || 1; // Strict 1 page per chunk by default to maintain 1:1 page parity

  // If entire document or range fits within 1 chunk
  if (pagesToProcess <= chunkCapacity && effectiveStartPage === 1 && effectiveEndPage === totalPages) {
    const base64 = await srcDoc.saveAsBase64({ dataUri: true });
    return {
      totalPages,
      chunks: [
        {
          chunkIndex: 0,
          totalChunks: 1,
          startPage: 1,
          endPage: totalPages,
          base64,
        },
      ],
      effectiveStartPage,
      effectiveEndPage,
    };
  }

  const chunks: PDFChunk[] = [];
  const totalChunks = Math.ceil(pagesToProcess / chunkCapacity);

  // Zero-based index bounds
  const zeroBasedStart = effectiveStartPage - 1;
  const zeroBasedEnd = effectiveEndPage; // non-inclusive

  let chunkIdx = 0;
  for (let i = zeroBasedStart; i < zeroBasedEnd; i += chunkCapacity) {
    const chunkStart = i;
    const chunkEnd = Math.min(i + chunkCapacity, zeroBasedEnd);
    const chunkDoc = await PDFDocument.create();

    const pageIndices: number[] = [];
    for (let p = chunkStart; p < chunkEnd; p++) {
      pageIndices.push(p);
    }

    const copiedPages = await chunkDoc.copyPages(srcDoc, pageIndices);
    for (const page of copiedPages) {
      chunkDoc.addPage(page);
    }

    const chunkBase64 = await chunkDoc.saveAsBase64({ dataUri: true });

    chunks.push({
      chunkIndex: chunkIdx++,
      totalChunks,
      startPage: chunkStart + 1,
      endPage: chunkEnd,
      base64: chunkBase64,
    });
  }

  return {
    totalPages,
    chunks,
    effectiveStartPage,
    effectiveEndPage,
  };
}
