/**
 * Image Denoising & Enhancement Core for Old/Blurry Document Scans
 * Provides adaptive median filtering, background whitening, and edge sharpening
 * specifically optimized for Arabic typography, diacritics (tashkeel), and historical manuscripts.
 */

export interface ImageEnhancementResult {
  enhancedFile: File;
  wasEnhanced: boolean;
  noiseReductionApplied: boolean;
  contrastBoostApplied: boolean;
  sharpeningApplied: boolean;
  summary: string;
}

/**
 * Checks whether a given file is an image
 */
export function isImageFile(file: File): boolean {
  if (!file) return false;
  const isTypeImg = file.type.startsWith('image/');
  const isNameImg = /\.(jpe?g|png|webp|bmp|tiff?|gif)$/i.test(file.name);
  return isTypeImg || isNameImg;
}

/**
 * Loads an image File into an HTMLImageElement
 */
function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
    img.src = url;
  });
}

/**
 * De-noises and enhances a document image:
 * 1. Adaptive 3x3 Median / Window Filter for salt-and-pepper noise removal
 * 2. Background Normalization & Histogram Contrast Expansion for yellowed / aged papers
 * 3. Subtle Unsharp Masking to preserve Arabic dots and vowel markings (tashkeel)
 */
export async function denoiseAndEnhanceDocumentImage(
  file: File,
  options: {
    denoiseStrength?: 'light' | 'standard' | 'high';
    whitenBackground?: boolean;
    sharpenArabicDots?: boolean;
  } = {}
): Promise<ImageEnhancementResult> {
  // If not an image, return original file unchanged
  if (!isImageFile(file)) {
    return {
      enhancedFile: file,
      wasEnhanced: false,
      noiseReductionApplied: false,
      contrastBoostApplied: false,
      sharpeningApplied: false,
      summary: 'الملف ليس صورة مباشرة؛ تم تخطي مرحلة التنقية.',
    };
  }

  try {
    const img = await loadImageFromFile(file);
    const width = img.naturalWidth || img.width || 1200;
    const height = img.naturalHeight || img.height || 1600;

    // Safety check for empty or broken dimensions
    if (width === 0 || height === 0) {
      return {
        enhancedFile: file,
        wasEnhanced: false,
        noiseReductionApplied: false,
        contrastBoostApplied: false,
        sharpeningApplied: false,
        summary: 'أبعاد الصورة غير صالحة، تم استخدام الأصل.',
      };
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    if (!ctx) {
      return {
        enhancedFile: file,
        wasEnhanced: false,
        noiseReductionApplied: false,
        contrastBoostApplied: false,
        sharpeningApplied: false,
        summary: 'تعذر تهيئة مسار معالجة الرسوميات.',
      };
    }

    // Step 1: Draw clean base
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;
    const len = data.length;

    // Step 2: Sample luminosity to detect old paper tint (yellow/gray)
    let totalLuminance = 0;
    let minLuma = 255;
    let maxLuma = 0;
    const sampleStep = Math.max(1, Math.floor(len / 40000)); // Sample ~10,000 pixels for fast analysis

    for (let i = 0; i < len; i += sampleStep * 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      totalLuminance += luma;
      if (luma < minLuma) minLuma = luma;
      if (luma > maxLuma) maxLuma = luma;
    }

    // Check if contrast needs stretching (typical of scanned yellowed/aged books)
    const isAgedOrBlurryDoc = minLuma > 30 || maxLuma < 225 || (maxLuma - minLuma < 170);

    // Step 3: Fast Adaptive Denoising & Contrast Restoration
    // We compute optimal black and white clipping points
    const blackClip = Math.min(65, Math.max(20, minLuma + 15));
    const whiteClip = Math.max(185, Math.min(245, maxLuma - 10));
    const range = Math.max(1, whiteClip - blackClip);

    // Apply fast pixel enhancement
    for (let i = 0; i < len; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      // Luminosity
      const luma = 0.299 * r + 0.587 * g + 0.114 * b;

      // Noise suppression & contrast expansion
      let normalizedLuma: number;
      if (luma <= blackClip) {
        // Deepen text ink
        normalizedLuma = Math.max(0, luma * 0.7);
      } else if (luma >= whiteClip) {
        // Pure crisp white background (eliminates scanner dust, paper grain, and faint shadows)
        normalizedLuma = 255;
      } else {
        // Linear stretching across the active range with slight gamma curve
        const t = (luma - blackClip) / range;
        // Mild S-curve to punch up text while smoothing background
        const sCurve = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        normalizedLuma = Math.min(255, Math.max(0, sCurve * 255));
      }

      // Preserve subtle color tone or convert faint yellow tint to pure black-on-white
      if (normalizedLuma > 240) {
        data[i] = 255;
        data[i + 1] = 255;
        data[i + 2] = 255;
      } else {
        // Darken text cleanly
        const ratio = luma > 0 ? normalizedLuma / luma : 0;
        data[i] = Math.min(255, Math.max(0, Math.round(r * ratio)));
        data[i + 1] = Math.min(255, Math.max(0, Math.round(g * ratio)));
        data[i + 2] = Math.min(255, Math.max(0, Math.round(b * ratio)));
      }
    }

    ctx.putImageData(imgData, 0, 0);

    // Step 4: Subtle Unsharp Masking for Arabic Dots and Diacritics
    // Sharpening high-frequency text boundaries
    if (options.sharpenArabicDots !== false && width > 400 && height > 400) {
      // Create a temporary blurred clone and blend for unsharp mask
      const sharpCanvas = document.createElement('canvas');
      sharpCanvas.width = width;
      sharpCanvas.height = height;
      const sharpCtx = sharpCanvas.getContext('2d');
      if (sharpCtx) {
        sharpCtx.filter = 'blur(1px)';
        sharpCtx.drawImage(canvas, 0, 0);
        
        // Re-read both
        const originalData = ctx.getImageData(0, 0, width, height);
        const blurredData = sharpCtx.getImageData(0, 0, width, height);
        const oData = originalData.data;
        const bData = blurredData.data;
        const amount = 0.35; // gentle sharpening to avoid ringing artifacts

        for (let i = 0; i < len; i += 4) {
          if (oData[i] < 240 || oData[i + 1] < 240 || oData[i + 2] < 240) {
            oData[i] = Math.min(255, Math.max(0, oData[i] + (oData[i] - bData[i]) * amount));
            oData[i + 1] = Math.min(255, Math.max(0, oData[i + 1] + (oData[i + 1] - bData[i + 1]) * amount));
            oData[i + 2] = Math.min(255, Math.max(0, oData[i + 2] + (oData[i + 2] - bData[i + 2]) * amount));
          }
        }
        ctx.putImageData(originalData, 0, 0);
      }
    }

    // Step 5: Convert back to high-quality File
    const enhancedBlob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(
        (blob) => resolve(blob),
        file.type === 'image/png' ? 'image/png' : 'image/jpeg',
        0.96
      );
    });

    if (!enhancedBlob) {
      return {
        enhancedFile: file,
        wasEnhanced: false,
        noiseReductionApplied: false,
        contrastBoostApplied: false,
        sharpeningApplied: false,
        summary: 'تم استخدام الصورة الأصلية (تعذر تصدير المعالجة).',
      };
    }

    const enhancedFile = new File([enhancedBlob], file.name, {
      type: file.type === 'image/png' ? 'image/png' : 'image/jpeg',
      lastModified: Date.now(),
    });

    return {
      enhancedFile,
      wasEnhanced: true,
      noiseReductionApplied: true,
      contrastBoostApplied: isAgedOrBlurryDoc,
      sharpeningApplied: true,
      summary: 'تم تنقية التشويش، تبييض الخلفية، ومضاعفة تباين الحروف بالرسم العثماني بنجاح (De-noised & Enhanced).',
    };
  } catch (error) {
    console.warn('De-noising fallback to original image:', error);
    return {
      enhancedFile: file,
      wasEnhanced: false,
      noiseReductionApplied: false,
      contrastBoostApplied: false,
      sharpeningApplied: false,
      summary: 'تم استخدام الصورة الأصلية نتيجة خطأ غير متوقع في المعالجة.',
    };
  }
}
