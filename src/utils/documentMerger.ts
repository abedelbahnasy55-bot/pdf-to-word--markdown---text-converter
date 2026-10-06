import { PDFDocument } from 'pdf-lib';

export interface QueuedDocument {
  id: string;
  file: File;
  type: 'pdf' | 'image' | 'docx';
  name: string;
  size: number;
  pageCount?: number;
  previewUrl?: string;
  status: 'idle' | 'converting' | 'auditing' | 'done' | 'error';
  progressPercentage?: number;
  activeStage?: string;
  result?: any;
  errorMessage?: string;
  savedId?: string;
}

/**
 * Converts any image file (PNG, JPG, BMP, WebP, etc.) into high-res PNG Uint8Array suitable for embedding into a PDF
 */
async function getImageBytesForPdf(
  file: File
): Promise<{ bytes: Uint8Array; isPng: boolean; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = async () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || 800;
        canvas.height = img.naturalHeight || 1100;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('تعذر معالجة بيانات الصورة');

        // Fill clean white background in case source has transparent regions
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);

        canvas.toBlob(async (blob) => {
          URL.revokeObjectURL(url);
          if (!blob) {
            reject(new Error('تعذر استخراج بيانات الصورة المحددة'));
            return;
          }
          const buf = await blob.arrayBuffer();
          resolve({
            bytes: new Uint8Array(buf),
            isPng: true,
            width: canvas.width,
            height: canvas.height,
          });
        }, 'image/png');
      } catch (err) {
        URL.revokeObjectURL(url);
        reject(err);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`تعذر قراءة الصورة "${file.name}"`));
    };

    img.src = url;
  });
}

/**
 * Merges multiple PDF files and images in a specific order into a single unified PDF file
 */
export async function mergeDocumentsAndImagesToPdf(
  documents: QueuedDocument[],
  outputFileName: string = 'ملف_مدمج.pdf'
): Promise<{ mergedFile: File; totalPages: number }> {
  const mergedPdf = await PDFDocument.create();
  let totalPages = 0;

  for (const doc of documents) {
    if (doc.type === 'pdf') {
      try {
        const fileBuffer = await doc.file.arrayBuffer();
        const srcPdf = await PDFDocument.load(fileBuffer, { ignoreEncryption: true });
        const pageIndices = srcPdf.getPageIndices();
        const copiedPages = await mergedPdf.copyPages(srcPdf, pageIndices);
        
        for (const page of copiedPages) {
          mergedPdf.addPage(page);
          totalPages++;
        }
      } catch (err) {
        console.error(`Failed to merge PDF: ${doc.name}`, err);
        throw new Error(`تعذر دمج ملف PDF "${doc.name}": تأكد من أن الملف غير تالف أو محمي بكلمة مرور`);
      }
    } else if (doc.type === 'image') {
      try {
        const { bytes, isPng, width, height } = await getImageBytesForPdf(doc.file);
        
        let embeddedImage;
        if (isPng) {
          embeddedImage = await mergedPdf.embedPng(bytes);
        } else {
          embeddedImage = await mergedPdf.embedJpg(bytes);
        }

        // Standardize max dimensions (keep aspect ratio, standard page fit)
        // Standard A4 at 72 DPI is 595.28 x 841.89
        const pageWidth = Math.max(300, Math.min(width, 1200));
        const scaleFactor = pageWidth / width;
        const pageHeight = height * scaleFactor;

        const page = mergedPdf.addPage([pageWidth, pageHeight]);
        page.drawImage(embeddedImage, {
          x: 0,
          y: 0,
          width: pageWidth,
          height: pageHeight,
        });

        totalPages++;
      } catch (err) {
        console.error(`Failed to embed image: ${doc.name}`, err);
        throw new Error(`تعذر تحويل ودمج الصورة "${doc.name}" إلى PDF`);
      }
    }
  }

  if (totalPages === 0) {
    throw new Error('لم يتم إضافة أي صفحات للملف المدمج');
  }

  const mergedBytes = await mergedPdf.save();
  const mergedFile = new File([mergedBytes], outputFileName, { type: 'application/pdf' });

  return { mergedFile, totalPages };
}

/**
 * Converts a single image to a 1-page PDF file for direct pipeline conversion
 */
export async function convertSingleImageToPdf(
  file: File
): Promise<File> {
  const result = await mergeDocumentsAndImagesToPdf(
    [
      {
        id: 'temp-img-doc',
        file,
        type: 'image',
        name: file.name,
        size: file.size,
        status: 'idle',
      },
    ],
    `${file.name.replace(/\.[^/.]+$/, '')}.pdf`
  );
  return result.mergedFile;
}
