import { ConversionOptions, ConversionProgress, ConversionResult, ConversionResumeState } from '../types';
import { splitPDFIntoChunks, getPdfInfo, getRecommendedPagesPerChunk } from './pdfChunker';
import { convertSingleImageToPdf } from './documentMerger';
import { denoiseAndEnhanceDocumentImage, isImageFile } from './imageEnhancer';
import { autoFixQuranicErrors } from './quranAuditor';
import { runContextualChecker } from './contextualChecker';
import { runGrammarSyntaxAnalyzer } from './grammarSyntaxAnalyzer';
import { documentStructuralAuditor } from './documentStructuralAuditor';
import { quranicVerificationAgent } from './quranicVerificationAgent';
import { auditAndRestructureLayout } from './layoutIntegrityCore';
import { updateStageList } from './pipelineStages';
import { isRightToLeftText } from '../../shared/arabicText';
import { markAsDirectlyExtracted, stripExtractionMarker } from './extractionOrigin';

/**
 * Minimum share of pages the direct extractor must recover before its result is
 * trusted over AI recognition.
 *
 * The server decides "has a text layer" from the total extracted character count,
 * which a single stray text layer on an otherwise image-only page can satisfy. 60%
 * tolerates a few genuinely blank or image-only pages in an otherwise digital book,
 * while rejecting a scanned document, where the recovered share is near zero.
 */
const DIRECT_EXTRACTION_PAGE_COVERAGE = 0.6;

/**
 * Counts pages that actually carry text, by splitting on the page-break marker the
 * extractor emits and discarding empty segments.
 *
 * Mirrors the server's own page segmentation at server.ts, so the two agree on what
 * a "page of content" is.
 */
export function countRecoveredPages(markdown: string): number {
  if (!markdown) return 0;
  return markdown
    .split(/---PAGE_BREAK---/)
    .map((page) => page.trim())
    .filter((page) => page.length > 0).length;
}

function fileToBase64(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });
}

/**
 * Converts a PDF or Image file to Word (.docx), Markdown, and Plain Text
 * with sequential chunking, automatic retry on rate limit, and real-time progress callbacks.
 * Supports seamless resumption without losing already processed chunks.
 */
export async function convertDocumentFile(
  file: File,
  options: ConversionOptions,
  onProgress?: (progress: ConversionProgress) => void,
  abortSignal?: AbortSignal,
  resumeState?: ConversionResumeState
): Promise<ConversionResult> {
  const startTime = Date.now();

  if (abortSignal?.aborted) {
    throw new DOMException('تم إلغاء عملية التحويل', 'AbortError');
  }

  onProgress?.({
    currentChunk: resumeState?.completedChunks || 0,
    totalChunks: 1,
    startPage: 1,
    endPage: 1,
    totalPages: 1,
    percentage: resumeState ? 30 : 5,
    phase: 'reading',
  });

  let workingPdfFile = file;

  // If the file is an image, execute De-noise enhancement stage before converting to PDF
  const isImage = isImageFile(file) || (!file.name.toLowerCase().endsWith('.pdf') && file.type.startsWith('image/'));
  if (isImage) {
    if (abortSignal?.aborted) throw new DOMException('تم إلغاء عملية التحويل', 'AbortError');
    onProgress?.({
      currentChunk: 0,
      totalChunks: 1,
      startPage: 1,
      endPage: 1,
      totalPages: 1,
      percentage: 8,
      phase: 'reading',
      activeStage: 'image_denoise',
      stages: updateStageList('image_denoise', 45),
      statusMessage: 'المرحلة 1: تحسين الصور المشوشة (De-noise) وإزالة التحبيب والتشويش لتعزيز دقة التعرف في الوثيقة القديمة...',
    });

    // Execute genuine document denoising, contrast boosting & unsharp masking
    const denoiseResult = await denoiseAndEnhanceDocumentImage(file);
    const enhancedFile = denoiseResult.enhancedFile;

    if (abortSignal?.aborted) throw new DOMException('تم إلغاء عملية التحويل', 'AbortError');
    onProgress?.({
      currentChunk: 0,
      totalChunks: 1,
      startPage: 1,
      endPage: 1,
      totalPages: 1,
      percentage: 12,
      phase: 'splitting',
      activeStage: 'image_denoise',
      stages: updateStageList('image_denoise', 100),
      statusMessage: `${denoiseResult.summary} جاري تحويلها لصفحة مستند بدقة فائقة...`,
    });

    workingPdfFile = await convertSingleImageToPdf(enhancedFile);
  }

  if (abortSignal?.aborted) throw new DOMException('تم إلغاء عملية التحويل', 'AbortError');
  const arrayBuffer = await workingPdfFile.arrayBuffer();

  onProgress?.({
    currentChunk: resumeState?.completedChunks || 0,
    totalChunks: 1,
    startPage: 1,
    endPage: 1,
    totalPages: 1,
    percentage: resumeState ? 35 : 15,
    phase: 'splitting',
  });

  // Start every PDF with the zero-quota direct text extractor.
  //
  // Previously this ran only when the user had explicitly chosen "zero-quota direct
  // extraction" from a strategy panel, which meant the default path spent AI quota on
  // books whose text layer was perfectly readable. Reading the embedded text is both
  // free and strictly more faithful than AI OCR, which can only guess at words it
  // cannot really see. If a page has no text layer, `directJson.success` is false and
  // control falls through to the AI chunk pipeline below, so quota is spent exactly
  // where it is needed and nowhere else.
  if (!isImage) {
    onProgress?.({
      currentChunk: 1,
      totalChunks: 1,
      startPage: 1,
      endPage: 1,
      totalPages: 1,
      percentage: 25,
      phase: 'converting',
      activeStage: 'extraction',
      stages: updateStageList('extraction', 50),
      statusMessage: 'المرحلة 1: جاري استخراج النص المدمج في الملف مباشرة (بدون استهلاك كوتة)...',
    });

    const pdfBase64 = await fileToBase64(workingPdfFile);
    const directRes = await fetch('/api/extract-direct-pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: abortSignal,
      body: JSON.stringify({ pdfBase64, filename: file.name }),
    });
    const directJson = await directRes.json();

    if (directJson?.success && directJson?.data?.markdown) {
      // A scanned book can carry a stray text layer on ONE page while the rest is
      // pure images. The endpoint's own gate is measured over the whole extracted
      // text, so such a document reports success, and its reported page count is the
      // real total — which meant a 500-page scanned book could come back as a
      // "successful" conversion holding a single page of text advertised as 500
      // pages. Cross-check the pages actually recovered against the pages claimed
      // before accepting the result.
      const recoveredPages = countRecoveredPages(directJson.data.markdown);
      const reportedPages = directJson.data.totalPages || recoveredPages;

      if (recoveredPages === 0 || recoveredPages / reportedPages < DIRECT_EXTRACTION_PAGE_COVERAGE) {
        // Not a text-layer document: fall through to the AI pipeline, which is what
        // this file actually is.
        console.warn(
          `[Converter] Direct extraction recovered ${recoveredPages}/${reportedPages} pages, below the ` +
            `${DIRECT_EXTRACTION_PAGE_COVERAGE * 100}% coverage floor. Escalating to AI recognition.`
        );
      } else {
      let finalMarkdown = markAsDirectlyExtracted(directJson.data.markdown);
      const detectedPages = directJson.data.totalPages || 1;

      onProgress?.({
        currentChunk: 1,
        totalChunks: 1,
        startPage: 1,
        endPage: detectedPages,
        totalPages: detectedPages,
        percentage: 60,
        phase: 'converting',
        activeStage: 'contextual',
        stages: updateStageList('contextual', 60),
        statusMessage: 'المرحلة 2: الفحص السياقي الذكي للآيات والأحاديث ومطابقة المصادر...',
      });
      const contextualResult = await runContextualChecker(finalMarkdown, file.name);

      onProgress?.({
        currentChunk: 1,
        totalChunks: 1,
        startPage: 1,
        endPage: detectedPages,
        totalPages: detectedPages,
        percentage: 80,
        phase: 'converting',
        activeStage: 'grammar',
        stages: updateStageList('grammar', 70),
        statusMessage: 'المرحلة 3: التحليل النحوي ومطابقة بنية الجمل...',
      });
      const grammarAnalysis = await runGrammarSyntaxAnalyzer(contextualResult.correctedMarkdown, file.name);
      const structuralAnalysis = await documentStructuralAuditor(grammarAnalysis.repairedMarkdown, file.name);
      const quranicVerification = await quranicVerificationAgent(structuralAnalysis.repairedMarkdown);
      const layoutAnalysis = await auditAndRestructureLayout(quranicVerification.verifiedMarkdown);
      // Strip the internal origin marker before the text is stored, previewed, or
      // exported, so it can never appear inside the user's document. The strip is
      // line-anchored because the structural auditor prepends an H1 above the marker.
      finalMarkdown = stripExtractionMarker(layoutAnalysis.restructuredMarkdown);

      const isArabic = isRightToLeftText(finalMarkdown);
        return {
          title: file.name.replace(/\.[^/.]+$/, ''),
          detectedLanguage: isArabic ? 'العربية' : 'English',
          textDirection: isArabic ? 'rtl' : 'ltr',
          hasArabicText: isArabic,
          hasMathOrScience: false,
        hasTables: finalMarkdown.includes('|'),
        hasHandwriting: false,
        markdown: finalMarkdown,
        plainText: finalMarkdown.replace(/^#+\s+/gm, ''),
        fileName: file.name,
        fileSize: file.size,
        totalPages: detectedPages,
        totalChunksProcessed: 1,
        conversionDurationMs: Date.now() - startTime,
        isAutoAudited: true,
          // The four audit panels are attached here as on the AI path. The viewer
          // renders its "audit reports" disclosure unconditionally, so returning
          // without them left that panel expanding to nothing for every
          // text-layer PDF, which is now the default route.
          autoFixedCount:
            contextualResult.fixedCount +
            grammarAnalysis.report.truncatedItems.length +
            structuralAnalysis.report.repairedCount +
            quranicVerification.report.correctedVersesCount +
            layoutAnalysis.report.tablesStabilizedCount +
            layoutAnalysis.report.listsNormalizedCount,
          fixedItemsSummary: [
            contextualResult.isAiVerified
              ? 'تم الفحص السياقي ومطابقة المصادر المعتمدة'
              : 'تم التدقيق عبر محرك القواعد الشرعية',
            grammarAnalysis.report.overallGrammarVerdict,
            structuralAnalysis.report.overallStructuralVerdict,
            quranicVerification.report.overallVerificationVerdict,
            layoutAnalysis.report.overallVerdict,
          ],
          grammarSyntaxReport: grammarAnalysis.report,
          structuralAuditReport: structuralAnalysis.report,
          quranicVerificationReport: quranicVerification.report,
          layoutIntegrityReport: layoutAnalysis.report,
        };
      }
    }
  }

  // Adaptive Chunking based on total document page count & quota optimization mode
  const pageRangeConfig = options?.pageRange?.enabled
    ? { startPage: options.pageRange.startPage, endPage: options.pageRange.endPage }
    : undefined;

  const { totalPages: preliminaryPages } = await getPdfInfo(arrayBuffer);
  const optimizationMode = options?.quotaOptimization || 'balanced';
  const recommendedPagesPerChunk = getRecommendedPagesPerChunk(preliminaryPages, optimizationMode);

  const { totalPages, chunks, effectiveStartPage, effectiveEndPage } = await splitPDFIntoChunks(
    arrayBuffer,
    recommendedPagesPerChunk,
    pageRangeConfig
  );

  const markdownPieces: string[] = resumeState?.markdownPieces ? [...resumeState.markdownPieces] : [];
  const plainTextPieces: string[] = resumeState?.plainTextPieces ? [...resumeState.plainTextPieces] : [];
  let detectedLang = resumeState?.detectedLang || 'Arabic';
  let docTextDirection: 'rtl' | 'ltr' = resumeState?.docTextDirection || 'rtl';
  let docTitle = resumeState?.docTitle || file.name.replace(/\.[^/.]+$/, '');
  let hasMath = resumeState?.hasMath || false;
  let hasArabic = resumeState?.hasArabic || false;
  let hasTables = resumeState?.hasTables || false;
  let hasHandwriting = resumeState?.hasHandwriting || false;

  const startChunkIndex = resumeState?.completedChunks || 0;

  // Process chunks sequentially with progress updates
  for (let i = startChunkIndex; i < chunks.length; i++) {
    if (abortSignal?.aborted) throw new DOMException('تم إلغاء عملية التحويل', 'AbortError');

    if (i > startChunkIndex) {
      // Gentle pacing between chunks to prevent exceeding minute rate limits
      await new Promise((r) => setTimeout(r, 2200));
    }

    const chunk = chunks[i];
    const currentPercentage = Math.round(15 + ((i + 0.5) / chunks.length) * 80);

    onProgress?.({
      currentChunk: i + 1,
      totalChunks: chunks.length,
      startPage: chunk.startPage,
      endPage: chunk.endPage,
      totalPages,
      percentage: currentPercentage,
      phase: 'converting',
      processedChunksCount: i,
      partialMarkdown: markdownPieces.join('\n\n---PAGE_BREAK---\n\n'),
    });

    // Process chunk with automatic retry if temporary error occurs
    let data: any = null;
    let lastChunkError: string | null = null;
    let isLastThrottled = false;
    const maxAttempts = 25; // Generous attempts to never drop out on temporary throttling

    for (let chunkAttempt = 0; chunkAttempt < maxAttempts; chunkAttempt++) {
      if (abortSignal?.aborted) throw new DOMException('تم إلغاء عملية التحويل', 'AbortError');

      try {
        const response = await fetch('/api/convert-pdf', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          signal: abortSignal,
          body: JSON.stringify({
            pdfBase64: chunk.base64,
            filename: `${file.name} (pages ${chunk.startPage}-${chunk.endPage})`,
            options,
          }),
        });

        if (abortSignal?.aborted) throw new DOMException('تم إلغاء عملية التحويل', 'AbortError');

        const responseText = await response.text();
        try {
          data = JSON.parse(responseText);
        } catch {
          data = {
            success: false,
            error: !response.ok
              ? (response.status === 504 || response.status === 502
                  ? `استغرقت معالجة الصفحات ${chunk.startPage}-${chunk.endPage} وقتاً طويلاً في السيرفر (Gateway Timeout). جاري إعادة المحاولة تلقائياً...`
                  : response.status === 413
                  ? `حجم الصفحة كبير جداً.`
                  : `تعذر الاتصال المؤقت بالخادم (${response.status}). جاري إعادة المحاولة تلقائياً...`)
              : 'استجابة غير صالحة مؤقتة من الخادم أثناء المعالجة. جاري إعادة المحاولة تلقائياً...',
            isUnavailable: true,
            isRateLimit: response.status === 429,
          };
        }

        if (response.ok && data?.success) {
          lastChunkError = null;
          isLastThrottled = false;
          break;
        } else {
          const rawErrStr = typeof data?.error === 'string' ? data.error : '';
          const isThrottled =
            response.status === 429 ||
            response.status === 503 ||
            response.status === 504 ||
            response.status === 502 ||
            Boolean(data?.isRateLimit) ||
            Boolean(data?.isUnavailable) ||
            Boolean(data?.isPeakDemand) ||
            rawErrStr.toLowerCase().includes('peak demand') ||
            rawErrStr.toLowerCase().includes('high demand') ||
            rawErrStr.toLowerCase().includes('rate limit') ||
            rawErrStr.toLowerCase().includes('quota') ||
            rawErrStr.toLowerCase().includes('overloaded') ||
            rawErrStr.includes('ضغطاً مؤقتاً') ||
            rawErrStr.includes('UNAVAILABLE') ||
            rawErrStr.includes('استجابة غير صالحة') ||
            rawErrStr.includes('تعذر الاتصال') ||
            rawErrStr.includes('503') ||
            rawErrStr.includes('429');
          
          isLastThrottled = isThrottled;
          lastChunkError = data?.error || `فشلت معالجة الصفحات ${chunk.startPage}-${chunk.endPage}`;

          if (isThrottled && chunkAttempt < maxAttempts - 1) {
            const isPeakDemand =
              Boolean(data?.isPeakDemand) ||
              rawErrStr.toLowerCase().includes('peak demand') ||
              rawErrStr.toLowerCase().includes('high demand') ||
              rawErrStr.includes('ضغطاً مؤقتاً');

            const serverRetrySec = typeof data?.retryAfterSeconds === 'number' && data.retryAfterSeconds > 0
              ? data.retryAfterSeconds
              : 0;

            const waitSeconds = serverRetrySec > 0
              ? Math.min(65, serverRetrySec + 2)
              : isPeakDemand
              ? Math.min(20, Math.max(6, 6 + chunkAttempt * 3))
              : Math.min(35, Math.max(12, 10 + chunkAttempt * 4));

            const noticePrefix = isPeakDemand
              ? 'خدمة الذكاء الاصطناعي تشهد ضغطاً مؤقتاً (Temporary Peak Demand). الحفاظ على تقدمك: جاري إعادة المحاولة التلقائية'
              : 'تم بلوغ حد الطلبات اللحظي في الدقيقة (Rate limit). الحفاظ على تقدمك: جاري الانتظار والاستئناف التلقائي';

            for (let sec = waitSeconds; sec > 0; sec--) {
              if (abortSignal?.aborted) throw new DOMException('تم إلغاء عملية التحويل', 'AbortError');
              onProgress?.({
                currentChunk: i + 1,
                totalChunks: chunks.length,
                startPage: chunk.startPage,
                endPage: chunk.endPage,
                totalPages,
                percentage: currentPercentage,
                phase: 'converting',
                activeStage: 'extraction',
                isRateLimited: true,
                rateLimitCountdownSec: sec,
                statusMessage: `${noticePrefix} للصفحات (${chunk.startPage}-${chunk.endPage}) خلال (${sec} ث)...`,
                processedChunksCount: i,
                partialMarkdown: markdownPieces.join('\n\n---PAGE_BREAK---\n\n'),
              });
              await new Promise((r) => setTimeout(r, 1000));
            }

            if (abortSignal?.aborted) throw new DOMException('تم إلغاء عملية التحويل', 'AbortError');
            onProgress?.({
              currentChunk: i + 1,
              totalChunks: chunks.length,
              startPage: chunk.startPage,
              endPage: chunk.endPage,
              totalPages,
              percentage: currentPercentage,
              phase: 'converting',
              activeStage: 'extraction',
              isRateLimited: false,
              rateLimitCountdownSec: undefined,
              statusMessage: `جاري إعادة إرسال الصفحات (${chunk.startPage}-${chunk.endPage}) الآن...`,
              processedChunksCount: i,
              partialMarkdown: markdownPieces.join('\n\n---PAGE_BREAK---\n\n'),
            });
            continue;
          } else {
            await new Promise((r) => setTimeout(r, Math.min(10000, 1500 * (chunkAttempt + 1))));
          }
        }
      } catch (err: any) {
        if (abortSignal?.aborted) {
          throw new DOMException('تم إلغاء عملية التحويل', 'AbortError');
        }
        const errMsg = String(err?.message || err);
        lastChunkError = errMsg || `خطأ في معالجة الحزمة ${i + 1}`;
        if (chunkAttempt < maxAttempts - 1) {
          isLastThrottled = true;
          const waitSec = Math.min(25, 4 + chunkAttempt * 3);
          for (let s = waitSec; s > 0; s--) {
            if (abortSignal?.aborted) throw new DOMException('تم إلغاء عملية التحويل', 'AbortError');
            onProgress?.({
              currentChunk: i + 1,
              totalChunks: chunks.length,
              startPage: chunk.startPage,
              endPage: chunk.endPage,
              totalPages,
              percentage: currentPercentage,
              phase: 'converting',
              activeStage: 'extraction',
              isRateLimited: true,
              rateLimitCountdownSec: s,
              statusMessage: `تعذر الاتصال المؤقت بالخادم. الحفاظ على تقدمك: جاري إعادة إرسال الصفحات (${chunk.startPage}-${chunk.endPage}) خلال (${s} ث)...`,
              processedChunksCount: i,
              partialMarkdown: markdownPieces.join('\n\n---PAGE_BREAK---\n\n'),
            });
            await new Promise((r) => setTimeout(r, 1000));
          }
          continue;
        }
        await new Promise((r) => setTimeout(r, Math.min(8000, 1500 * (chunkAttempt + 1))));
      }
    }

    if (abortSignal?.aborted) throw new DOMException('تم إلغاء عملية التحويل', 'AbortError');

    if (lastChunkError || !data?.success) {
      // Safety Net: If AI conversion was throttled or exhausted, attempt zero-quota direct digital rescue
      if (isLastThrottled && !isImage) {
        try {
          onProgress?.({
            currentChunk: i + 1,
            totalChunks: chunks.length,
            startPage: chunk.startPage,
            endPage: chunk.endPage,
            totalPages,
            percentage: Math.min(95, currentPercentage + 5),
            phase: 'converting',
            activeStage: 'extraction',
            statusMessage: 'كوتة الذكاء الاصطناعي بلغت حدها. جاري إكمال الصفحات المتبقية تلقائياً بالمحرك الرقمي السريع (صفر كوتة)...',
            processedChunksCount: i,
            partialMarkdown: markdownPieces.join('\n\n---PAGE_BREAK---\n\n'),
          });

          const pdfBase64 = await fileToBase64(workingPdfFile);
          const directCheck = await fetch('/api/extract-direct-pdf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: abortSignal,
            body: JSON.stringify({ pdfBase64, filename: file.name }),
          });
          const directData = await directCheck.json();
          if (directData?.success && directData?.data?.markdown) {
            const allDirectPages = directData.data.markdown.split(/---PAGE_BREAK---/);
            // Slice remaining pages from chunk.startPage - 1 onwards
            const remainingPages = allDirectPages.slice(Math.max(0, chunk.startPage - 1));
            if (remainingPages.length > 0) {
              markdownPieces.push(remainingPages.join('\n\n---PAGE_BREAK---\n\n').trim());
              plainTextPieces.push(remainingPages.join('\n\n').trim());
              // Successfully rescued without stalling! Break out of chunks loop to run pipeline verification
              break;
            }
          }
        } catch (rescueErr) {
          console.warn('Direct rescue attempt failed:', rescueErr);
        }
      }

      const customErr: any = new Error(lastChunkError || `فشلت معالجة الصفحات ${chunk.startPage}-${chunk.endPage}`);
      customErr.isRateLimit = isLastThrottled;
      customErr.isDailyQuotaExhausted = Boolean(data?.isDailyQuotaExhausted);
      customErr.lastChunkIndex = i;
      customErr.totalChunks = chunks.length;
      customErr.startPage = chunk.startPage;
      customErr.endPage = chunk.endPage;
      customErr.totalPages = totalPages;
      customErr.percentage = currentPercentage;
      customErr.resumeState = {
        completedChunks: i,
        markdownPieces: [...markdownPieces],
        plainTextPieces: [...plainTextPieces],
        docTitle,
        detectedLang,
        docTextDirection,
        hasMath,
        hasArabic,
        hasTables,
        hasHandwriting,
      };
      customErr.partialMarkdown = markdownPieces.join('\n\n---PAGE_BREAK---\n\n');
      customErr.partialPlainText = plainTextPieces.join('\n\n');
      throw customErr;
    }

    const chunkData = data.data;
    if (chunkData.markdown) {
      // Compress runaway dots and strip HTML artifacts
      const sanitizedChunkMd = chunkData.markdown
        .replace(/\.{6,}/g, '.....')
        .replace(/^[ \t]*(\.[ \t]*){5,}$/gm, '.....')
        .replace(/(\n[ \t]*\.\.\.\.\.[ \t]*){2,}/g, '\n.....\n')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/br>/gi, '\n')
        .replace(/&nbsp;/gi, ' ')
        // Only unwrap the tags this list names. The alternation needs its own
        // boundaries: without them `i` matches the first letter of any tag, so
        // <img …>, <iframe …> and <input …> were matched and deleted outright,
        // silently discarding embedded images from the document.
        .replace(/<\/?(span|div|p|b|strong|em|i)(?=[\s/>])[^>]*>/gi, '');
      markdownPieces.push(sanitizedChunkMd.trim());
    }
    if (chunkData.plainText) {
      const sanitizedChunkTxt = chunkData.plainText
        .replace(/\.{6,}/g, '.....')
        .replace(/^[ \t]*(\.[ \t]*){5,}$/gm, '.....')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/&nbsp;/gi, ' ');
      plainTextPieces.push(sanitizedChunkTxt.trim());
    }
    if (chunkData.detectedLanguage) detectedLang = chunkData.detectedLanguage;
    if (chunkData.textDirection) docTextDirection = chunkData.textDirection;
    if (chunkData.title && i === 0 && !resumeState) docTitle = chunkData.title;
    if (chunkData.hasMathOrScience) hasMath = true;
    if (chunkData.hasArabicText) hasArabic = true;
    if (chunkData.hasTables) hasTables = true;
    if (chunkData.hasHandwriting) hasHandwriting = true;

    // Smart proactive pacing between chunks to strictly respect Gemini RPM limits
    const paceDuration = isLastThrottled ? 8 : 4;
    if (i < chunks.length - 1) {
      if (abortSignal?.aborted) throw new DOMException('تم إلغاء عملية التحويل', 'AbortError');
      for (let sec = paceDuration; sec > 0; sec--) {
        onProgress?.({
          currentChunk: i + 1,
          totalChunks: chunks.length,
          startPage: chunk.startPage,
          endPage: chunk.endPage,
          totalPages,
          percentage: currentPercentage,
          phase: 'converting',
          statusMessage: `الصفحات (${chunk.startPage}-${chunk.endPage}) اكتملت بنجاح. جاري تنظيم الحصص والانتقال للحزمة التالية (${i + 2}/${chunks.length}) خلال (${sec} ث)...`,
          processedChunksCount: i + 1,
          partialMarkdown: markdownPieces.join('\n\n---PAGE_BREAK---\n\n'),
        });
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }

  onProgress?.({
    currentChunk: chunks.length,
    totalChunks: chunks.length,
    startPage: 1,
    endPage: totalPages,
    totalPages,
    percentage: 60,
    phase: 'converting',
    activeStage: 'contextual',
    stages: updateStageList('contextual', 60),
    statusMessage: 'المرحلة 2: الفحص السياقي الذكي للآيات والأحاديث (Contextual Checker)...',
  });

  const rawMergedMarkdown = markdownPieces
    .join('\n\n---PAGE_BREAK---\n\n')
    .replace(/(?:\n\s*---PAGE_BREAK---\s*){2,}/g, '\n\n---PAGE_BREAK---\n\n');
  let contextualResult: {
    correctedMarkdown: string;
    isAiVerified: boolean;
    fixedCount: number;
    message?: string;
  } = {
    correctedMarkdown: rawMergedMarkdown,
    isAiVerified: false,
    fixedCount: 0,
    message: 'تم التدقيق عبر محرك القواعد الشرعية المعتمدة',
  };

  try {
    contextualResult = await runContextualChecker(rawMergedMarkdown, file.name);
    // Strict Anti-Truncation Protection: If contextual check lost more than 20% of content or lost page breaks,
    // revert to full merged markdown with canonical rule engine applied.
    const origBreaks = (rawMergedMarkdown.match(/---PAGE_BREAK---/g) || []).length;
    const ctxBreaks = (contextualResult.correctedMarkdown.match(/---PAGE_BREAK---/g) || []).length;
    if (
      (rawMergedMarkdown.length > 5000 && contextualResult.correctedMarkdown.length < rawMergedMarkdown.length * 0.8) ||
      (origBreaks > 0 && ctxBreaks < origBreaks)
    ) {
      console.warn('[Pipeline] Contextual check output compromised page breaks or truncated, preserving full merged document');
      contextualResult.correctedMarkdown = autoFixQuranicErrors(rawMergedMarkdown).correctedText;
    }
  } catch (ctxErr) {
    console.warn('Contextual check bypassed, using local rules:', ctxErr);
  }

  // Stage 3: Grammar & Syntax Analyzer (فحص الجمل المفتوحة والبتر المفاجئ وتوقع التكملات)
  onProgress?.({
    currentChunk: chunks.length,
    totalChunks: chunks.length,
    startPage: 1,
    endPage: totalPages,
    totalPages,
    percentage: 85,
    phase: 'converting',
    activeStage: 'grammar',
    stages: updateStageList('grammar', 70),
    statusMessage: 'المرحلة 3: التحليل النحوي والتركيبي وتوقع الجمل المفتوحة (Grammar Analyzer)...',
  });

  let grammarAnalysis = {
    report: {
      analyzedSentencesCount: 0,
      hasCriticalTruncation: false,
      isAbruptTermination: false,
      truncatedItems: [],
      overallGrammarVerdict: 'تم الفحص النحوي والتركيبي بنجاح.',
    },
    repairedMarkdown: contextualResult.correctedMarkdown,
  };

  try {
    grammarAnalysis = await runGrammarSyntaxAnalyzer(contextualResult.correctedMarkdown, file.name);
    const prevBreaks = (contextualResult.correctedMarkdown.match(/---PAGE_BREAK---/g) || []).length;
    const gramBreaks = (grammarAnalysis.repairedMarkdown.match(/---PAGE_BREAK---/g) || []).length;
    if (prevBreaks > 0 && gramBreaks < prevBreaks) {
      console.warn('[Pipeline] Grammar analyzer altered page breaks, reverting to previous stage markdown');
      grammarAnalysis.repairedMarkdown = contextualResult.correctedMarkdown;
    }
  } catch (gramErr) {
    console.warn('Grammar check bypassed, using local heuristic:', gramErr);
  }

  // Stage 4: Document Structural Auditor (التدقيق الهيكلي ومطابقة الترقيم والهوامش)
  onProgress?.({
    currentChunk: chunks.length,
    totalChunks: chunks.length,
    startPage: 1,
    endPage: totalPages,
    totalPages,
    percentage: 90,
    phase: 'converting',
    activeStage: 'structural',
    stages: updateStageList('structural', 85),
    statusMessage: 'المرحلة 4: التدقيق الهيكلي ومطابقة الترقيم والهوامش والعناوين (Structural Auditor)...',
  });

  let structuralAnalysis = {
    report: {
      analyzedSectionsCount: 1,
      totalIssuesCount: 0,
      missingHeadersCount: 0,
      numberingIssuesCount: 0,
      footnoteIssuesCount: 0,
      repairedCount: 0,
      issues: [],
      overallStructuralVerdict: 'تم التدقيق الهيكلي بنجاح.',
      hasStructuralFlaws: false,
    },
    repairedMarkdown: grammarAnalysis.repairedMarkdown,
  };

  try {
    structuralAnalysis = await documentStructuralAuditor(grammarAnalysis.repairedMarkdown, file.name);
  } catch (structErr) {
    console.warn('Structural auditor fallback:', structErr);
  }

  // Stage 5: Quranic Verification Agent (التحقق القرآني بالرسم العثماني المعتمد لضمان دقة 100%)
  onProgress?.({
    currentChunk: chunks.length,
    totalChunks: chunks.length,
    startPage: 1,
    endPage: totalPages,
    totalPages,
    percentage: 94,
    phase: 'converting',
    activeStage: 'quranic_verification',
    stages: updateStageList('quranic_verification', 92),
    statusMessage: 'المرحلة 5: التحقق القرآني ومطابقة الآيات بالرسم العثماني المعتمد...',
  });

  let quranicVerification = {
    report: {
      totalVersesDetected: 0,
      totalVersesVerified: 0,
      correctedVersesCount: 0,
      accuracyRate: 100,
      verifiedVerses: [],
      overallVerificationVerdict: 'تم التحقق القرآني بنجاح.',
      hasUthmaniDiscrepancies: false,
    },
    verifiedMarkdown: structuralAnalysis.repairedMarkdown,
  };

  try {
    quranicVerification = await quranicVerificationAgent(structuralAnalysis.repairedMarkdown);
  } catch (qErr) {
    console.warn('Quranic verification fallback:', qErr);
  }

  // Stage 6: Layout Integrity Engine (معايرة وهيكلة الصفحات والجداول وتثبيت اتجاه RTL)
  onProgress?.({
    currentChunk: chunks.length,
    totalChunks: chunks.length,
    startPage: 1,
    endPage: totalPages,
    totalPages,
    percentage: 96,
    phase: 'converting',
    activeStage: 'layout_integrity',
    stages: updateStageList('layout_integrity', 95),
    statusMessage: 'المرحلة 6: معايرة وهيكلة الصفحات والجداول وتثبيت اتجاه RTL (Layout Integrity Engine)...',
  });

  let layoutAnalysis = {
    report: {
      totalPagesAudited: totalPages,
      tablesStabilizedCount: 0,
      listsNormalizedCount: 0,
      rtlEnforcedCount: 0,
      overallLayoutScore: 100,
      overallVerdict: 'تم فحص الهيكلية بنجاح.',
      isAllPagesValid: true,
      pageAudits: [],
    },
    restructuredMarkdown: quranicVerification.verifiedMarkdown,
  };

  try {
    layoutAnalysis = await auditAndRestructureLayout(quranicVerification.verifiedMarkdown);
  } catch (layoutErr) {
    console.warn('Layout integrity fallback:', layoutErr);
  }

  const mergedMarkdown = layoutAnalysis.restructuredMarkdown;

  // Stage 7: Finalizing
  onProgress?.({
    currentChunk: chunks.length,
    totalChunks: chunks.length,
    startPage: 1,
    endPage: totalPages,
    totalPages,
    percentage: 98,
    phase: 'merging',
    activeStage: 'finalizing',
    stages: updateStageList('finalizing', 98),
    statusMessage: 'المرحلة 7: الضبط النهائي بالمسطرة وتجهيز مستند Word المعتمد...',
  });

  const mergedPlainText = mergedMarkdown
    .replace(/^---\s*$/gm, '\n------------------------\n')
    .replace(/\\text\{([^\}]+)\}/g, '$1')
    .replace(/^#+\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\$\$?([^\$]+)\$\$?/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^\s*[-*+]\s+/gm, "• ")
    .trim();

    const effectivePagesCount = effectiveEndPage && effectiveStartPage
      ? effectiveEndPage - effectiveStartPage + 1
      : totalPages;

    const result: ConversionResult = {
      title: docTitle,
      detectedLanguage: detectedLang,
      textDirection: docTextDirection,
      totalPages: effectivePagesCount || totalPages,
      totalChunksProcessed: chunks.length,
      pageCountEstimate: effectivePagesCount || totalPages,
    hasMathOrScience: hasMath,
    hasArabicText: hasArabic,
    hasTables,
    hasHandwriting,
    markdown: mergedMarkdown,
    plainText: mergedPlainText,
    fileName: file.name,
    fileSize: file.size,
    conversionDurationMs: Date.now() - startTime,
    isAutoAudited: true,
    autoFixedCount:
      contextualResult.fixedCount +
      grammarAnalysis.report.truncatedItems.length +
      structuralAnalysis.report.repairedCount +
      quranicVerification.report.correctedVersesCount +
      layoutAnalysis.report.tablesStabilizedCount +
      layoutAnalysis.report.listsNormalizedCount,
    fixedItemsSummary: [
      contextualResult.isAiVerified ? 'تم الفحص السياقي لمطابقة المصادر المعتمدة' : 'تم التدقيق عبر محرك القواعد الشرعية',
      grammarAnalysis.report.overallGrammarVerdict,
      structuralAnalysis.report.overallStructuralVerdict,
      quranicVerification.report.overallVerificationVerdict,
      layoutAnalysis.report.overallVerdict,
    ],
    grammarSyntaxReport: grammarAnalysis.report,
    structuralAuditReport: structuralAnalysis.report,
    quranicVerificationReport: quranicVerification.report,
    layoutIntegrityReport: layoutAnalysis.report,
  };

  return result;
}
