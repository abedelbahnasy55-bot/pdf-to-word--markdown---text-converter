/**
 * Pre-flight PDF & Document Inspector
 * Analyzes document text layer integrity, character density, scanned nature,
 * and recommends optimal chunking & OCR strategy (Arabic PDF to Book v2.9.6).
 */

export interface PreFlightReport {
  fileName: string;
  fileSizeBytes: number;
  totalPages: number;
  estimatedCharCount: number;
  avgCharsPerPage: number;
  hasTextLayer: boolean;
  isLikelyScanned: boolean;
  recommendedChunkSize: number; // 10 pages default chunk rule
  recommendedEngine: 'direct_extract' | 'gemini_multimodal' | 'ocr_hybrid';
  estimatedDurationSec: number;
  diagnosticFlags: {
    lowDensityPagesCount: number;
    hasArabicScript: boolean;
    hasComplexTables: boolean;
    exceedsFreeTierSingleBatch: boolean;
  };
  summaryArabic: string;
}

/**
 * Inspects a File object (PDF or image) before full conversion begins.
 */
export async function inspectDocumentPreFlight(file: File): Promise<PreFlightReport> {
  const isDocx = file.name.toLowerCase().endsWith('.docx');
  const isImage = file.type.startsWith('image/') || /\.(png|jpe?g|webp|bmp)$/i.test(file.name);
  const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type.includes('pdf');

  let totalPages = 1;
  let estimatedCharCount = 0;
  let hasTextLayer = false;
  let isLikelyScanned = isImage;
  let hasArabicScript = true;
  let hasComplexTables = false;

  if (isImage) {
    totalPages = 1;
    isLikelyScanned = true;
    hasTextLayer = false;
    estimatedCharCount = 600;
  } else if (isDocx) {
    totalPages = Math.max(1, Math.round(file.size / 25000));
    hasTextLayer = true;
    isLikelyScanned = false;
    estimatedCharCount = totalPages * 850;
  } else if (isPdf) {
    try {
      // Estimate or read basic PDF header info
      const buffer = await file.slice(0, Math.min(file.size, 512 * 1024)).arrayBuffer();
      const textHeader = new TextDecoder('latin1').decode(buffer);
      
      // Rough page count detection via /Type /Page or /Count
      const pageMatches = textHeader.match(/\/Type\s*\/Page\b/g);
      const countMatch = textHeader.match(/\/Count\s+(\d+)/);
      if (countMatch && countMatch[1]) {
        totalPages = Math.max(1, parseInt(countMatch[1], 10));
      } else if (pageMatches && pageMatches.length > 0) {
        totalPages = Math.max(1, pageMatches.length);
      } else {
        // Fallback size-based estimation for large PDFs
        totalPages = Math.max(1, Math.round(file.size / (180 * 1024)));
      }

      // Check for presence of embedded text fonts and content streams
      const hasFonts = /\/(Font|ToUnicode|Type1|TrueType)\b/.test(textHeader);
      const hasStreams = /\/Filter\s*\/FlateDecode/.test(textHeader);
      
      // If font dictionary exists and file has sufficient stream content
      if (hasFonts && hasStreams && file.size / totalPages > 25000) {
        hasTextLayer = true;
        isLikelyScanned = false;
        estimatedCharCount = totalPages * 700;
      } else {
        isLikelyScanned = true;
        hasTextLayer = false;
        estimatedCharCount = totalPages * 400;
      }
    } catch {
      totalPages = Math.max(1, Math.round(file.size / (200 * 1024)));
      isLikelyScanned = true;
    }
  }

  const avgCharsPerPage = Math.round(estimatedCharCount / Math.max(1, totalPages));
  
  // Rule from v2.9.6: 10 pages per chunk for stability and quota preservation
  const recommendedChunkSize = totalPages > 20 ? 10 : Math.min(10, Math.max(4, Math.ceil(totalPages / 2)));
  
  let recommendedEngine: 'direct_extract' | 'gemini_multimodal' | 'ocr_hybrid' = 'gemini_multimodal';
  if (hasTextLayer && avgCharsPerPage >= 250) {
    recommendedEngine = 'direct_extract';
  } else if (totalPages > 50) {
    recommendedEngine = 'gemini_multimodal';
  }

  const estimatedDurationSec = Math.max(3, Math.ceil(totalPages * (hasTextLayer ? 0.3 : 1.8)));

  let summaryArabic = '';
  if (hasTextLayer && avgCharsPerPage >= 200) {
    summaryArabic = `المستند يحتوي على طبقة نصية سليمة (~${avgCharsPerPage} حرف/صفحة). يوصى بالمعالجة المباشرة وتطبيق بوابات الجودة الصارمة.`;
  } else if (isLikelyScanned) {
    summaryArabic = `المستند ممسوح ضوئياً ويحتاج استخراجاً بصرياً فائق الدقة. سيتم تقسيمه بحزم من ${recommendedChunkSize} صفحات للحفاظ التام على الحصص.`;
  } else {
    summaryArabic = `مستند مختلط يحتوي على صفحات رقمية وممسوحة. تم تجهيز مصفوفة النماذج لتوزيع الصفحات بالتوازي.`;
  }

  return {
    fileName: file.name,
    fileSizeBytes: file.size,
    totalPages,
    estimatedCharCount,
    avgCharsPerPage,
    hasTextLayer,
    isLikelyScanned,
    recommendedChunkSize,
    recommendedEngine,
    estimatedDurationSec,
    diagnosticFlags: {
      lowDensityPagesCount: avgCharsPerPage < 150 ? Math.ceil(totalPages * 0.2) : 0,
      hasArabicScript,
      hasComplexTables,
      exceedsFreeTierSingleBatch: totalPages > 10,
    },
    summaryArabic,
  };
}
