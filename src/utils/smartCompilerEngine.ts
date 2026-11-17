import {
  CONVERSION_DEFAULTS,
  ConversionResult,
  SavedConversion,
} from '../types';
import { convertDocumentFile, runMicroscopicFinalizationPipeline } from './documentConverter';
import { isRightToLeftText } from '../../shared/arabicText';
import { apiFetch } from './apiClient';
import {
  assembleCompilationDocument,
  buildDeterministicPlan,
  deterministicExtractFromChunk,
  extractSourceOutline,
  splitMarkdownIntoSafeChunks,
  type CompilationPlan,
  type CompilerSourceCatalogItem,
  type ExtractedSourceBlock,
  type OrganizationMode,
  type RepetitionPolicy,
  type RepetitionStats,
  type SourceOutlineEntry,
} from '../../shared/smartCompilerCore';
import {
  buildSearchablePassages,
  type SemanticKindFilter,
  type SemanticSearchResponse,
} from '../../shared/semanticSearchCore';

export type CompilerStageId =
  | 'converting_sources'
  | 'planning'
  | 'extracting'
  | 'assembling'
  | 'auditing';

export interface CompilerSourceItem {
  id: string;
  origin: 'batch' | 'history' | 'upload';
  title: string;
  fileName: string;
  fileSize: number;
  status: 'ready' | 'pending_conversion' | 'converting' | 'error';
  file?: File;
  result?: ConversionResult;
  error?: string;
  totalPages: number;
  detectedYears: string[];
  outlineCount: number;
  outline: SourceOutlineEntry[];
}

export interface CompilerPipelineProgress {
  stage: CompilerStageId;
  stageLabel: string;
  detailMessage: string;
  percentage: number;
  currentStepIndex: number;
  totalSteps: number;
}

export interface CompiledAnthologyResult {
  plan: CompilationPlan;
  result: ConversionResult;
  repetitionStats: RepetitionStats;
  answersMovedCount: number;
  sectionCount: number;
  sourceTitles: string[];
  combinedReferenceSourceText: string;
}

export function buildSourceItemFromConversion(
  id: string,
  origin: 'batch' | 'history' | 'upload',
  fileName: string,
  fileSize: number,
  result: ConversionResult,
  file?: File
): CompilerSourceItem {
  const md = result.markdown || result.plainText || '';
  const { outline, detectedYears } = extractSourceOutline(md, result.totalPages);
  return {
    id,
    origin,
    title: result.title || fileName.replace(/\.[^/.]+$/, ''),
    fileName,
    fileSize,
    status: 'ready',
    file,
    result,
    totalPages: result.totalPages || Math.max(1, md.split(/---PAGE_BREAK---/).length),
    detectedYears,
    outlineCount: outline.length,
    outline,
  };
}

export function mergeAvailableSources(
  batchItems: Array<{
    id: string;
    name: string;
    size: number;
    status: string;
    result?: ConversionResult;
    file?: File;
  }> | null,
  historyItems: SavedConversion[],
  uploadedStudioSources: CompilerSourceItem[]
): CompilerSourceItem[] {
  const seenKeys = new Set<string>();
  const combined: CompilerSourceItem[] = [];

  // 1. Studio direct uploads first so newly dropped books appear right at top
  for (const up of uploadedStudioSources) {
    seenKeys.add(up.id);
    seenKeys.add(`name:${up.fileName.toLowerCase()}`);
    combined.push(up);
  }

  // 2. Active Batch Session items that are converted
  if (batchItems) {
    for (const b of batchItems) {
      if (b.status === 'done' && b.result) {
        const key = `name:${b.name.toLowerCase()}`;
        if (!seenKeys.has(b.id) && !seenKeys.has(key)) {
          seenKeys.add(b.id);
          seenKeys.add(key);
          combined.push(
            buildSourceItemFromConversion(b.id, 'batch', b.name, b.size, b.result, b.file)
          );
        }
      }
    }
  }

  // 3. Saved History items
  for (const h of historyItems) {
    const key = `name:${h.fileName.toLowerCase()}`;
    if (!seenKeys.has(h.id) && !seenKeys.has(key)) {
      seenKeys.add(h.id);
      seenKeys.add(key);
      combined.push(
        buildSourceItemFromConversion(
          h.id,
          'history',
          h.fileName,
          h.fileSize || 1024,
          h.result
        )
      );
    }
  }

  return combined;
}

async function postJsonWithTimeout<T>(url: string, body: unknown, timeoutMs = 45000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await apiFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const json = await response.json();
    if (!response.ok || !json?.success) {
      throw new Error(json?.error || `HTTP ${response.status}`);
    }
    return json.data as T;
  } finally {
    clearTimeout(timer);
  }
}

export async function runSmartCompilationPipeline(params: {
  instruction: string;
  repetitionPolicy: RepetitionPolicy;
  sources: CompilerSourceItem[];
  organizationModeOverride?: OrganizationMode | 'auto';
  manualUnitFilters?: Record<string, { includeUnits: string[]; excludeUnits: string[] }>;
  onProgress: (prog: CompilerPipelineProgress) => void;
  onSourceUpdated: (updatedSource: CompilerSourceItem) => void;
  onNewlyConvertedSave?: (res: ConversionResult, file: File) => Promise<void>;
}): Promise<CompiledAnthologyResult> {
  const {
    instruction,
    repetitionPolicy,
    sources,
    organizationModeOverride = 'auto',
    manualUnitFilters = {},
    onProgress,
    onSourceUpdated,
    onNewlyConvertedSave,
  } = params;

  const startedAt = Date.now();
  const resolvedSources: CompilerSourceItem[] = [];

  // Stage 1: Automatically convert any pending uploaded sources via the full pipeline
  const pendingConversions = sources.filter((s) => s.status !== 'ready' || !s.result);
  let convertedCount = 0;

  for (const src of sources) {
    if (src.status === 'ready' && src.result) {
      resolvedSources.push(src);
      continue;
    }

    if (!src.file || src.file.size === 0) {
      onSourceUpdated({
        ...src,
        status: 'error',
        error: 'الملف غير متاح للتحويل التلقائي.',
      });
      continue;
    }

    convertedCount++;
    onSourceUpdated({ ...src, status: 'converting' });
    onProgress({
      stage: 'converting_sources',
      stageLabel: 'تحويل المصادر المرفوعة تلقائياً',
      detailMessage: `جاري تحويل «${src.fileName}» (${convertedCount} من ${pendingConversions.length}) عبر مسار التحويل والتدقيق الموحد...`,
      percentage: Math.min(28, 6 + Math.round((convertedCount / Math.max(1, pendingConversions.length)) * 20)),
      currentStepIndex: convertedCount,
      totalSteps: pendingConversions.length,
    });

    try {
      const convRes = await convertDocumentFile(src.file, CONVERSION_DEFAULTS, (prog) => {
        onProgress({
          stage: 'converting_sources',
          stageLabel: 'تحويل المصادر المرفوعة تلقائياً',
          detailMessage: `«${src.fileName}»: ${prog.statusMessage || `${prog.percentage}%`}`,
          percentage: Math.min(
            28,
            6 + Math.round(((convertedCount - 1 + prog.percentage / 100) / Math.max(1, pendingConversions.length)) * 22)
          ),
          currentStepIndex: convertedCount,
          totalSteps: pendingConversions.length,
        });
      });

      if (onNewlyConvertedSave) {
        await onNewlyConvertedSave(convRes, src.file).catch(() => {});
      }

      const readyItem = buildSourceItemFromConversion(
        src.id,
        src.origin,
        src.fileName,
        src.fileSize,
        convRes,
        src.file
      );
      onSourceUpdated(readyItem);
      resolvedSources.push(readyItem);
    } catch (err: any) {
      onSourceUpdated({
        ...src,
        status: 'error',
        error: err?.message || 'تعذر تحويل الملف',
      });
    }
  }

  if (resolvedSources.length === 0) {
    throw new Error('لم تتوفر أي مصادر جاهزة للتجميع. تأكد من نجاح تحويل مصدر واحد على الأقل.');
  }

  // Build compact catalog with outlines for the AI Planner
  onProgress({
    stage: 'planning',
    stageLabel: 'تحليل الطلب وبناء خطة التجميع',
    detailMessage: `تحليل فهارس ${resolvedSources.length} مصادر واستنتاج قواعد الفلترة والترتيب...`,
    percentage: 34,
    currentStepIndex: 1,
    totalSteps: 1,
  });

  const catalog: CompilerSourceCatalogItem[] = resolvedSources.map((src) => {
    const md = src.result?.markdown || src.result?.plainText || '';
    const { outline, detectedYears, wordCount, sampleSnippet } = extractSourceOutline(
      md,
      src.totalPages
    );
    return {
      id: src.id,
      title: src.title,
      fileName: src.fileName,
      totalPages: src.totalPages,
      wordCount,
      detectedYears,
      outline,
      sampleSnippet,
    };
  });

  let plan: CompilationPlan;
  try {
    plan = await postJsonWithTimeout<CompilationPlan>(
      '/api/compiler/plan',
      {
        instruction,
        repetitionPolicy,
        sources: catalog,
      },
      30000
    );
  } catch {
    plan = buildDeterministicPlan(instruction, repetitionPolicy, catalog);
  }

  // Apply explicit UI organization mode override & per-source Lesson Inspector filters
  if (organizationModeOverride && organizationModeOverride !== 'auto') {
    plan.organizationMode = organizationModeOverride;
  }

  plan.sourceDirectives = plan.sourceDirectives.map((dir) => {
    const manual = manualUnitFilters[dir.sourceId];
    if (!manual) return dir;
    const mergedInclude = Array.from(
      new Set([...(dir.targetUnits || []), ...(manual.includeUnits || [])])
    );
    const mergedExclude = Array.from(
      new Set([...(dir.excludeUnits || []), ...(manual.excludeUnits || [])])
    );
    return {
      ...dir,
      targetUnits: mergedInclude,
      excludeUnits: mergedExclude,
    };
  });

  // Stage 3: Map chunks across each included source and selectively extract verbatim matching blocks
  const directiveBySource = new Map(plan.sourceDirectives.map((d) => [d.sourceId, d]));
  const chunkJobs: Array<{
    source: CompilerSourceItem;
    directive: (typeof plan.sourceDirectives)[number];
    chunk: ReturnType<typeof splitMarkdownIntoSafeChunks>[number];
  }> = [];

  for (const src of resolvedSources) {
    const directive = directiveBySource.get(src.id);
    if (!directive || !directive.include) continue;
    const md = src.result?.markdown || src.result?.plainText || '';
    const chunks = splitMarkdownIntoSafeChunks(md, 18000);
    for (const chunk of chunks) {
      chunkJobs.push({ source: src, directive, chunk });
    }
  }

  const extractedBlocks: ExtractedSourceBlock[] = [];
  for (let i = 0; i < chunkJobs.length; i++) {
    const job = chunkJobs[i];
    const pct = 40 + Math.round(((i + 1) / Math.max(1, chunkJobs.length)) * 35);
    onProgress({
      stage: 'extracting',
      stageLabel: 'الاستخراج الانتقائي المقسم من المصادر',
      detailMessage: `استخلاص «${job.source.title}» — الجزء ${job.chunk.chunkIndex + 1} من ${job.chunk.totalChunks} (${job.chunk.contextHeader})`,
      percentage: pct,
      currentStepIndex: i + 1,
      totalSteps: Math.max(1, chunkJobs.length),
    });

    try {
      const block = await postJsonWithTimeout<ExtractedSourceBlock>(
        '/api/compiler/extract',
        {
          sourceId: job.source.id,
          sourceTitle: job.source.title,
          chunkIndex: job.chunk.chunkIndex,
          contextHeader: job.chunk.contextHeader,
          chunkMarkdown: job.chunk.markdown,
          directive: job.directive,
          instruction,
        },
        40000
      );
      if (block.markdown && block.markdown.trim().length > 0) {
        extractedBlocks.push(block);
      }
    } catch {
      const fallbackBlock = deterministicExtractFromChunk(
        job.chunk.markdown,
        job.directive,
        job.source.title,
        job.chunk.chunkIndex,
        job.chunk.contextHeader
      );
      if (fallbackBlock.markdown && fallbackBlock.markdown.trim().length > 0) {
        extractedBlocks.push(fallbackBlock);
      }
    }
  }

  // Stage 4: Intelligent merge & publication formatting (respecting useful repetitions)
  onProgress({
    stage: 'assembling',
    stageLabel: 'الدمج الذكي والتنسيق الأكاديمي',
    detailMessage: 'تنظيم الأقسام والفهرس، حفظ التكرارات المفيدة بين الامتحانات، وتنسيق الجداول والترقيم...',
    percentage: 82,
    currentStepIndex: 1,
    totalSteps: 1,
  });

  const assembly = assembleCompilationDocument(plan, extractedBlocks);
  const combinedReferenceSourceText = extractedBlocks
    .map((b) => `## ${b.sourceTitle} (${b.sectionLabel})\n${b.markdown}`)
    .join('\n\n---PAGE_BREAK---\n\n');

  // Stage 5: Mandatory Microscopic Audit + Quranic Uthmani + TextCleaner + Strict QA
  onProgress({
    stage: 'auditing',
    stageLabel: 'التدقيق المجهري والقرآني وبوابات الجودة',
    detailMessage: 'تطهير النصوص، التحقق من الرسم العثماني للآيات ﴿...﴾، وضبط التداخل العربي/الإنجليزي...',
    percentage: 94,
    currentStepIndex: 1,
    totalSteps: 1,
  });

  const virtualFileName = `${plan.compilationTitle.replace(/[\\/:*?"<>|]/g, '_').slice(0, 60)}.docx`;
  const finalized = runMicroscopicFinalizationPipeline(
    combinedReferenceSourceText || assembly.markdown,
    assembly.markdown,
    virtualFileName
  );

  const isRtl = isRightToLeftText(finalized.finalMarkdown);
  const totalPagesEstimate = Math.max(
    1,
    finalized.finalMarkdown.split(/---PAGE_BREAK---/).filter((p) => p.trim().length > 0).length
  );

  const result: ConversionResult = {
    title: plan.compilationTitle,
    detectedLanguage: isRtl ? 'العربية' : 'English',
    textDirection: isRtl ? 'rtl' : 'ltr',
    hasArabicText: isRtl,
    hasTables: finalized.finalMarkdown.includes('|'),
    hasMathOrScience: finalized.finalMarkdown.includes('$'),
    totalPages: totalPagesEstimate,
    pageCountEstimate: totalPagesEstimate,
    totalChunksProcessed: chunkJobs.length,
    markdown: finalized.finalMarkdown,
    plainText: finalized.plainText,
    sourceExtractText: finalized.sourceExtractText,
    fileName: virtualFileName,
    fileSize: new Blob([finalized.finalMarkdown]).size,
    conversionDurationMs: Date.now() - startedAt,
    isAutoAudited: true,
    autoFixedCount:
      (finalized.textCleanerReport.totalReplacements || 0) +
      (finalized.strictQAResult.repairedCount || 0),
    fixedItemsSummary: [
      `تجميع ذكي من (${resolvedSources.length}) مصادر`,
      `التطابق المجهري: ${finalized.microscopicAuditReport.summary.wordFidelityRatio}%`,
      ...(finalized.strictQAResult.verdictArabic ? [finalized.strictQAResult.verdictArabic] : []),
    ],
    textCleanerReport: finalized.textCleanerReport,
    microscopicAuditReport: finalized.microscopicAuditReport,
    strictQAReport: finalized.strictQAResult,
  };

  onProgress({
    stage: 'auditing',
    stageLabel: 'اكتمل التجميع والتدقيق المجهري بنجاح',
    detailMessage: 'التجميعة جاهزة للمعاينة والتعديل التفاعلي وتصدير Word.',
    percentage: 100,
    currentStepIndex: 1,
    totalSteps: 1,
  });

  return {
    plan,
    result,
    repetitionStats: assembly.repetitionStats,
    answersMovedCount: assembly.answersMovedCount,
    sectionCount: assembly.sectionCount,
    sourceTitles: resolvedSources.map((s) => s.title),
    combinedReferenceSourceText,
  };
}

export async function refineCompilationDocument(params: {
  currentResult: ConversionResult;
  editRequest: string;
  referenceSourceText: string;
}): Promise<{ updatedResult: ConversionResult; assistantReply: string; mode: string }> {
  const { currentResult, editRequest, referenceSourceText } = params;
  const currentMarkdown = currentResult.markdown || currentResult.plainText || '';

  const refineResponse = await postJsonWithTimeout<{
    updatedMarkdown: string;
    assistantReply: string;
    mode: string;
  }>(
    '/api/compiler/refine',
    {
      currentMarkdown,
      editRequest,
      compilationTitle: currentResult.title,
    },
    60000
  );

  // Re-run Microscopic + Cleaner + Strict QA on every interactive refinement!
  const finalized = runMicroscopicFinalizationPipeline(
    referenceSourceText || currentResult.sourceExtractText || refineResponse.updatedMarkdown,
    refineResponse.updatedMarkdown,
    currentResult.fileName || `${currentResult.title}.docx`
  );

  const isRtl = isRightToLeftText(finalized.finalMarkdown);
  const totalPagesEstimate = Math.max(
    1,
    finalized.finalMarkdown.split(/---PAGE_BREAK---/).filter((p) => p.trim().length > 0).length
  );

  return {
    updatedResult: {
      ...currentResult,
      markdown: finalized.finalMarkdown,
      plainText: finalized.plainText,
      sourceExtractText: finalized.sourceExtractText,
      textDirection: isRtl ? 'rtl' : 'ltr',
      hasArabicText: isRtl,
      totalPages: totalPagesEstimate,
      pageCountEstimate: totalPagesEstimate,
      microscopicAuditReport: finalized.microscopicAuditReport,
      textCleanerReport: finalized.textCleanerReport,
      strictQAReport: finalized.strictQAResult,
      isAutoAudited: true,
    },
    assistantReply: refineResponse.assistantReply,
    mode: refineResponse.mode,
  };
}

export async function askAssistantAboutSources(params: {
  question: string;
  sources: CompilerSourceItem[];
  onProgress?: (prog: CompilerPipelineProgress) => void;
  onSourceUpdated?: (updatedSource: CompilerSourceItem) => void;
  onNewlyConvertedSave?: (res: ConversionResult, file: File) => Promise<void>;
}): Promise<{ answer: string; modelUsed: string }> {
  const { question, sources, onProgress, onSourceUpdated, onNewlyConvertedSave } = params;
  const readySources: CompilerSourceItem[] = [];

  for (const src of sources) {
    if (src.status === 'ready' && src.result) {
      readySources.push(src);
      continue;
    }
    if (src.file && src.file.size > 0) {
      onSourceUpdated?.({ ...src, status: 'converting' });
      onProgress?.({
        stage: 'converting_sources',
        stageLabel: 'قراءة وفهرسة الملف قبل الإجابة',
        detailMessage: `تحويل وفهرسة «${src.fileName}»...`,
        percentage: 25,
        currentStepIndex: 1,
        totalSteps: 1,
      });
      try {
        const convRes = await convertDocumentFile(src.file, CONVERSION_DEFAULTS);
        await onNewlyConvertedSave?.(convRes, src.file).catch(() => {});
        const ready = buildSourceItemFromConversion(
          src.id,
          src.origin,
          src.fileName,
          src.fileSize,
          convRes,
          src.file
        );
        onSourceUpdated?.(ready);
        readySources.push(ready);
      } catch (err: any) {
        onSourceUpdated?.({
          ...src,
          status: 'error',
          error: err?.message || 'تعذر قراءة الملف',
        });
      }
    }
  }

  if (readySources.length === 0) {
    throw new Error('يرجى تحديد مصدر جاهز واحد على الأقل للإجابة عن سؤالك.');
  }

  const payloadSources = readySources.map((s) => {
    const md = s.result?.markdown || s.result?.plainText || '';
    const { outline, detectedYears, wordCount, sampleSnippet } = extractSourceOutline(
      md,
      s.totalPages
    );
    return {
      id: s.id,
      title: s.title,
      totalPages: s.totalPages,
      wordCount,
      detectedYears,
      outline: outline.slice(0, 40),
      relevantExcerpts: `${sampleSnippet}\n...\n${md.slice(0, 3000)}`,
    };
  });

  const data = await postJsonWithTimeout<{ answer: string; modelUsed: string }>(
    '/api/compiler/ask',
    {
      question,
      sources: payloadSources,
    },
    30000
  );

  return data;
}

export async function runSemanticSearchAcrossSources(params: {
  query: string;
  sources: CompilerSourceItem[];
  kindFilter: SemanticKindFilter;
  scopeMode: 'all' | 'selected';
  selectedSourceIds: string[];
  topK?: number;
  onStatusMessage?: (msg: string) => void;
  onSourceUpdated?: (updatedSource: CompilerSourceItem) => void;
  onNewlyConvertedSave?: (res: ConversionResult, file: File) => Promise<void>;
}): Promise<SemanticSearchResponse> {
  const {
    query,
    sources,
    kindFilter,
    scopeMode,
    selectedSourceIds,
    topK = 12,
    onStatusMessage,
    onSourceUpdated,
    onNewlyConvertedSave,
  } = params;

  const cleanQuery = query.trim();
  if (!cleanQuery) {
    throw new Error('يرجى كتابة كلمة أو سؤال أو موضوع للبحث الدلالي.');
  }

  const scopedSources =
    scopeMode === 'selected'
      ? sources.filter((s) => selectedSourceIds.includes(s.id))
      : sources;

  if (scopedSources.length === 0) {
    throw new Error(
      scopeMode === 'selected'
        ? 'لا توجد مصادر محددة حالياً للبحث فيها. حدد مصدراً أو اختر «كل الملفات».'
        : 'لا توجد ملفات مرفوعة أو محولة متاحة للبحث بعد.'
    );
  }

  const readySources: Array<{ id: string; title: string; markdown: string }> = [];
  const pendingCount = scopedSources.filter((s) => s.status !== 'ready' || !s.result).length;
  let convertedIdx = 0;

  for (const src of scopedSources) {
    if (src.status === 'ready' && src.result) {
      readySources.push({
        id: src.id,
        title: src.title,
        markdown: src.result.markdown || src.result.plainText || '',
      });
      continue;
    }

    if (src.file && src.file.size > 0) {
      convertedIdx++;
      onSourceUpdated?.({ ...src, status: 'converting' });
      onStatusMessage?.(
        `جاري تحويل وفهرسة «${src.fileName}» (${convertedIdx} من ${pendingCount}) للبحث الدلالي...`
      );
      try {
        const convRes = await convertDocumentFile(src.file, CONVERSION_DEFAULTS);
        await onNewlyConvertedSave?.(convRes, src.file).catch(() => {});
        const readyItem = buildSourceItemFromConversion(
          src.id,
          src.origin,
          src.fileName,
          src.fileSize,
          convRes,
          src.file
        );
        onSourceUpdated?.(readyItem);
        readySources.push({
          id: readyItem.id,
          title: readyItem.title,
          markdown: convRes.markdown || convRes.plainText || '',
        });
      } catch (err: any) {
        onSourceUpdated?.({
          ...src,
          status: 'error',
          error: err?.message || 'تعذر قراءة الملف',
        });
      }
    }
  }

  if (readySources.length === 0) {
    throw new Error('تعذر تجهيز أي ملف صالح للبحث الدلالي. تأكد من سلامة الملفات المرفوعة.');
  }

  onStatusMessage?.(`تحليل وتضمين مقاطع ${readySources.length} مصادر بالمتجهات الدلالية...`);
  const passages = buildSearchablePassages(readySources, kindFilter);
  if (passages.length === 0) {
    return {
      results: [],
      totalSearched: 0,
      mode: 'vector-embedding',
      cachedHits: 0,
      embeddedCount: 0,
    };
  }

  // Cap payload evenly across sources to stay well within server 300-passage limit
  const MAX_PASSAGES = 260;
  let boundedPassages = passages;
  if (passages.length > MAX_PASSAGES) {
    const perSourceCap = Math.max(15, Math.floor(MAX_PASSAGES / readySources.length));
    const perSourceCounts = new Map<string, number>();
    boundedPassages = passages.filter((p) => {
      const count = perSourceCounts.get(p.sourceId) || 0;
      if (count >= perSourceCap) return false;
      perSourceCounts.set(p.sourceId, count + 1);
      return true;
    });
  }

  return await postJsonWithTimeout<SemanticSearchResponse>(
    '/api/compiler/semantic-search',
    {
      query: cleanQuery,
      passages: boundedPassages,
      topK,
      minScore: 0.18,
    },
    35000
  );
}
