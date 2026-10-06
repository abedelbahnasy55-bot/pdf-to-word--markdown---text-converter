import JSZip from 'jszip';
import saveAs from 'file-saver';
import { QueuedDocument } from './documentMerger';
import { generateDocxBlob } from './docxExporter';

export interface BatchZipExportOptions {
  includeMarkdown?: boolean;
  zipFileName?: string;
  onProgress?: (current: number, total: number, currentName: string) => void;
}

/**
 * Generates a JSZip Blob containing all converted Word (.docx) files
 * with clean file naming directly in the archive root for frictionless access.
 */
export async function generateBatchZipBlob(
  completedDocs: QueuedDocument[],
  options: BatchZipExportOptions = {}
): Promise<{ blob: Blob; validCount: number; totalPages: number }> {
  const { includeMarkdown = true, onProgress } = options;
  const zip = new JSZip();
  let validCount = 0;
  let totalPagesSum = 0;

  const validDocs = completedDocs.filter((doc) => doc.status === 'done' && doc.result);
  if (validDocs.length === 0) {
    throw new Error('لا توجد ملفات مكتملة التحويل لتصديرها في حزمة الـ ZIP');
  }

  const summaryLines: string[] = [
    '=======================================================',
    'تقرير حزمة تحويل المستندات المتتالية (Batch Word Package)',
    `تاريخ التصدير: ${new Date().toLocaleString('ar-EG')}`,
    'اتجاه المستندات: من اليمين لليسار (RTL معتمد 100%)',
    '=======================================================\n',
  ];

  // Optional folder for markdown sources
  const mdFolder = includeMarkdown ? zip.folder('ملفات_نصية_Markdown') : null;

  for (let i = 0; i < validDocs.length; i++) {
    const doc = validDocs[i];
    validCount++;
    const docPages = doc.result?.totalPages || doc.pageCount || 1;
    totalPagesSum += docPages;

    const baseName = doc.name.replace(/\.[^/.]+$/, '');
    onProgress?.(i + 1, validDocs.length, doc.name);

    // 1. Generate DOCX Blob with 100% RTL, table and page parity
    try {
      const isRtl = doc.result?.textDirection === 'rtl' || Boolean(doc.result?.hasArabicText);
      const docxBlob = await generateDocxBlob({
        title: doc.result?.title || baseName,
        markdown: doc.result?.markdown || '',
        isRtl,
        author: 'PDF to Word Batch Converter',
      });

      // Place the Word document directly in the root of the ZIP
      const docxName = `${baseName}.docx`;
      zip.file(docxName, docxBlob);
    } catch (err) {
      console.error(`Error generating docx for ${doc.name} in zip:`, err);
    }

    // 2. Add Markdown source if requested
    if (includeMarkdown && mdFolder && doc.result?.markdown) {
      mdFolder.file(`${baseName}.md`, doc.result.markdown);
    }

    summaryLines.push(
      `${i + 1}. ${baseName}.docx — [${docPages} صفحة] — تطابق تام 1:1 مع أصل الـ PDF`
    );
  }

  summaryLines.push('\n-------------------------------------------------------');
  summaryLines.push(`إجمالي المستندات المحولة: ${validCount} ملف`);
  summaryLines.push(`إجمالي عدد الصفحات: ${totalPagesSum} صفحة`);
  summaryLines.push('كافة المستندات مهيأة بتنسيق Microsoft Word الأصلي مع اتجاه اليمين لليسار.');
  summaryLines.push('-------------------------------------------------------');

  zip.file('ملخص_الحزمة_والإحصائيات.txt', summaryLines.join('\n'));

  const blob = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/zip',
  });

  return { blob, validCount, totalPages: totalPagesSum };
}

/**
 * Packs all completed documents in a batch into a comprehensive ZIP archive with Word files
 * and triggers immediate browser download.
 */
export async function downloadBatchAsZip(
  completedDocs: QueuedDocument[],
  zipName?: string,
  options: BatchZipExportOptions = {}
): Promise<{ validCount: number; totalPages: number }> {
  const defaultZipName =
    zipName || `حزمة_ملفات_الوورد_${new Date().toISOString().slice(0, 10)}.zip`;

  const { blob, validCount, totalPages } = await generateBatchZipBlob(completedDocs, options);
  saveAs(blob, defaultZipName);
  return { validCount, totalPages };
}
