import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import type { ConversionResult, SavedConversion } from '../types';
import type { BatchQueueLightItem, ChatMessage, UnitFilterEntry } from '../model/compiler';
import {
  downloadDocx,
  downloadTextFile,
  TYPOGRAPHY_PROFILES,
  type FontProfileId,
} from '../utils/docxExporter';
import {
  type CompilerSourceItem,
  type CompilerPipelineProgress,
  type CompiledAnthologyResult,
  mergeAvailableSources,
  runSmartCompilationPipeline,
  refineCompilationDocument,
  askAssistantAboutSources,
  runSemanticSearchAcrossSources,
} from '../utils/smartCompilerEngine';
import { runMicroscopicFinalizationPipeline } from '../utils/documentConverter';
import {
  isConversationalQuestionIntent,
  type OrganizationMode,
  type RepetitionPolicy,
} from '../../shared/smartCompilerCore';
import type {
  SemanticKindFilter,
  SemanticSearchResponse,
  SemanticSearchResultItem,
} from '../../shared/semanticSearchCore';

interface UseSmartCompilerParams {
  batchQueue: BatchQueueLightItem[] | null;
  savedItems: SavedConversion[];
  onSaveConvertedFile?: (res: ConversionResult, file: File) => Promise<void>;
  onSaveCompiledResult: (res: ConversionResult) => Promise<void>;
}

const INITIAL_WELCOME_MESSAGE: ChatMessage = {
  id: 'welcome-1',
  role: 'assistant',
  timestamp: Date.now(),
  text: 'مرحباً بك في استوديو التحرير والتجميع. حدّد كتاباً أو عدة ملفات من القائمة الجانبية، ثم اكتب طلب الاستخراج أو الترتيب أو اطلب فحص الفهرس قبل التصدير إلى Word أو Markdown.',
};

export function useSmartCompiler({
  batchQueue,
  savedItems,
  onSaveConvertedFile,
  onSaveCompiledResult,
}: UseSmartCompilerParams) {
  // Direct uploads inside Studio
  const [uploadedSources, setUploadedSources] = useState<CompilerSourceItem[]>([]);
  const availableSources = useMemo(
    () => mergeAvailableSources(batchQueue, savedItems, uploadedSources),
    [batchQueue, savedItems, uploadedSources]
  );

  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>(() =>
    availableSources.map((s) => s.id)
  );
  const [sourceSearch, setSourceSearch] = useState('');
  const [repetitionPolicy, setRepetitionPolicy] =
    useState<RepetitionPolicy>('preserve_across_exams');
  const [organizationModeOverride, setOrganizationModeOverride] =
    useState<OrganizationMode | 'auto'>('auto');
  const [expandedSourceOutlineId, setExpandedSourceOutlineId] = useState<string | null>(null);
  const [manualUnitFilters, setManualUnitFilters] = useState<Record<string, UnitFilterEntry>>({});
  const [chatActionMode, setChatActionMode] = useState<'auto' | 'ask'>('auto');
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Studio responsive & collapsible layout states
  const [isSourcesDrawerOpen, setIsSourcesDrawerOpen] = useState(true);
  const [mobilePane, setMobilePane] = useState<'sources' | 'chat' | 'canvas'>('chat');

  // Sync newly added studio/batch sources cleanly into selection
  const prevSourceIdsRef = useRef<Set<string>>(new Set(selectedSourceIds));
  useEffect(() => {
    const newIds: string[] = [];
    for (const s of availableSources) {
      if (!prevSourceIdsRef.current.has(s.id)) {
        prevSourceIdsRef.current.add(s.id);
        newIds.push(s.id);
      }
    }
    if (newIds.length > 0) {
      setSelectedSourceIds((prev) => Array.from(new Set([...prev, ...newIds])));
    }
  }, [availableSources]);

  // Chat & Pipeline State
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_WELCOME_MESSAGE]);
  const [chatInput, setChatInput] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [pipelineProgress, setPipelineProgress] = useState<CompilerPipelineProgress | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string, durationMs = 4000) => {
    setToastMessage(msg);
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = setTimeout(() => {
      setToastMessage(null);
      toastTimerRef.current = null;
    }, durationMs);
  }, []);

  // Compiled Output & Undo Stack
  const [compiledAnthology, setCompiledAnthology] = useState<CompiledAnthologyResult | null>(null);
  const [draftHistory, setDraftHistory] = useState<ConversionResult[]>([]);
  const [activeOutputTab, setActiveOutputTab] = useState<'preview' | 'audit' | 'edit'>('preview');
  const [manualMarkdown, setManualMarkdown] = useState('');
  const [fontProfile, setFontProfile] = useState<FontProfileId>('bilingual_publication');
  const [isExportingDocx, setIsExportingDocx] = useState(false);
  const [isSavingToHistory, setIsSavingToHistory] = useState(false);
  const [copiedOutput, setCopiedOutput] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  // Semantic Search State
  const [semanticQuery, setSemanticQuery] = useState('');
  const [semanticKindFilter, setSemanticKindFilter] = useState<SemanticKindFilter>('all');
  const [semanticScope, setSemanticScope] = useState<'all' | 'selected'>('all');
  const [isSearchingSemantic, setIsSearchingSemantic] = useState(false);
  const [semanticStatusText, setSemanticStatusText] = useState<string | null>(null);
  const [semanticError, setSemanticError] = useState<string | null>(null);
  const [semanticResponse, setSemanticResponse] = useState<SemanticSearchResponse | null>(null);
  const [isSearchPanelOpen, setIsSearchPanelOpen] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, pipelineProgress]);

  useEffect(() => {
    if (compiledAnthology?.result.markdown) {
      setManualMarkdown(compiledAnthology.result.markdown);
    }
  }, [compiledAnthology?.result.markdown]);

  const filteredSources = useMemo(() => {
    const q = sourceSearch.trim().toLowerCase();
    if (!q) return availableSources;
    return availableSources.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.fileName.toLowerCase().includes(q) ||
        s.detectedYears.some((y) => y.includes(q))
    );
  }, [availableSources, sourceSearch]);

  const selectedSources = useMemo(
    () => availableSources.filter((s) => selectedSourceIds.includes(s.id)),
    [availableSources, selectedSourceIds]
  );

  const handleFilesAdded = useCallback(
    (files: FileList | File[]) => {
      const arr = Array.from(files);
      const valid = arr.filter((f) => {
        const lower = f.name.toLowerCase();
        return (
          lower.endsWith('.pdf') ||
          lower.endsWith('.docx') ||
          lower.endsWith('.doc') ||
          f.type.startsWith('image/') ||
          /\.(png|jpe?g|bmp|webp)$/i.test(lower)
        );
      });
      if (valid.length === 0) {
        setErrorBanner('يرجى رفع ملفات صالحة (PDF أو Word أو صور).');
        return;
      }
      setErrorBanner(null);
      const newItems: CompilerSourceItem[] = valid.map((f, idx) => ({
        id: `upload-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
        origin: 'upload',
        title: f.name.replace(/\.[^/.]+$/, ''),
        fileName: f.name,
        fileSize: f.size,
        status: 'pending_conversion',
        file: f,
        totalPages: 0,
        detectedYears: [],
        outlineCount: 0,
        outline: [],
      }));
      setUploadedSources((prev) => [...newItems, ...prev]);
      setSelectedSourceIds((prev) => [...newItems.map((n) => n.id), ...prev]);
      showToast(`تمت إضافة ${valid.length} ملف إلى قائمة المصادر (سيُحوَّل تلقائياً عند التنفيذ).`);
    },
    [showToast]
  );

  const toggleLessonUnitState = useCallback(
    (sourceId: string, heading: string, mode: 'include' | 'exclude') => {
      setManualUnitFilters((prev) => {
        const current = prev[sourceId] || { includeUnits: [], excludeUnits: [] };
        const inInclude = current.includeUnits.includes(heading);
        const inExclude = current.excludeUnits.includes(heading);
        let nextInclude = [...current.includeUnits];
        let nextExclude = [...current.excludeUnits];

        if (mode === 'include') {
          nextExclude = nextExclude.filter((h) => h !== heading);
          nextInclude = inInclude
            ? nextInclude.filter((h) => h !== heading)
            : [...nextInclude, heading];
        } else {
          nextInclude = nextInclude.filter((h) => h !== heading);
          nextExclude = inExclude
            ? nextExclude.filter((h) => h !== heading)
            : [...nextExclude, heading];
        }

        return {
          ...prev,
          [sourceId]: {
            includeUnits: nextInclude,
            excludeUnits: nextExclude,
          },
        };
      });
    },
    []
  );

  const resetSourceUnitFilter = useCallback((sourceId: string) => {
    setManualUnitFilters((prev) => ({
      ...prev,
      [sourceId]: { includeUnits: [], excludeUnits: [] },
    }));
  }, []);

  const toggleSource = useCallback((id: string) => {
    setSelectedSourceIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }, []);

  const removeUploadedSource = useCallback((sourceId: string) => {
    setUploadedSources((prev) => prev.filter((p) => p.id !== sourceId));
    setSelectedSourceIds((prev) => prev.filter((id) => id !== sourceId));
  }, []);

  const handleSourceUpdated = useCallback((updated: CompilerSourceItem) => {
    setUploadedSources((prev) => {
      const idx = prev.findIndex((p) => p.id === updated.id);
      if (idx === -1) return prev;
      const copy = [...prev];
      copy[idx] = updated;
      return copy;
    });
  }, []);

  const appendMessage = useCallback((msg: Omit<ChatMessage, 'id' | 'timestamp'>) => {
    setMessages((prev) => [
      ...prev,
      {
        ...msg,
        id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: Date.now(),
      },
    ]);
  }, []);

  const runAskQuery = useCallback(
    async (prompt: string) => {
      if (selectedSources.length === 0) {
        setErrorBanner('يرجى تحديد مصدر واحد على الأقل من قائمة المصادر للإجابة عن سؤالك.');
        return;
      }

      appendMessage({ role: 'user', text: prompt });
      setIsRunning(true);
      setPipelineProgress({
        stage: 'planning',
        stageLabel: 'فحص فهارس المصادر والإجابة عن السؤال',
        detailMessage: `جاري تحليل ${selectedSources.length} مصادر للإجابة بدقة...`,
        percentage: 45,
        currentStepIndex: 1,
        totalSteps: 1,
      });

      try {
        const res = await askAssistantAboutSources({
          question: prompt,
          sources: selectedSources,
          onProgress: setPipelineProgress,
          onSourceUpdated: handleSourceUpdated,
          onNewlyConvertedSave: onSaveConvertedFile,
        });
        appendMessage({
          role: 'assistant',
          text: res.answer,
          metaSummary: `استجابة تحليلية من فهارس ${selectedSources.length} مصادر`,
        });
      } catch (err: any) {
        setErrorBanner(err?.message || 'تعذر الإجابة عن السؤال.');
        appendMessage({
          role: 'assistant',
          text: `تعذر تحليل المصادر للإجابة: ${err?.message || 'خطأ غير متوقع'}.`,
        });
      } finally {
        setIsRunning(false);
        setPipelineProgress(null);
      }
    },
    [appendMessage, handleSourceUpdated, onSaveConvertedFile, selectedSources]
  );

  const runAnthologyRefinement = useCallback(
    async (prompt: string, anthology: CompiledAnthologyResult) => {
      appendMessage({ role: 'user', text: prompt });
      setIsRunning(true);
      setPipelineProgress({
        stage: 'auditing',
        stageLabel: 'تطبيق التعديل وإعادة التدقيق المجهري',
        detailMessage: `جاري تنفيذ: «${prompt}»...`,
        percentage: 55,
        currentStepIndex: 1,
        totalSteps: 1,
      });

      try {
        const prevSnapshot = anthology.result;
        const { updatedResult, assistantReply } = await refineCompilationDocument({
          currentResult: anthology.result,
          editRequest: prompt,
          referenceSourceText: anthology.combinedReferenceSourceText,
        });

        setDraftHistory((prev) => [...prev, prevSnapshot]);
        setCompiledAnthology((prev) => (prev ? { ...prev, result: updatedResult } : prev));
        setMobilePane('canvas');
        appendMessage({
          role: 'assistant',
          text: assistantReply,
          metaSummary: `التطابق المجهري: ${
            updatedResult.microscopicAuditReport?.summary.wordFidelityRatio ?? 100
          }% · ${updatedResult.totalPages || 1} صفحة`,
        });
      } catch (err: any) {
        setErrorBanner(err?.message || 'تعذر تنفيذ التعديل التفاعلي.');
        appendMessage({
          role: 'assistant',
          text: `حدث تعذر أثناء التعديل: ${err?.message || 'خطأ غير متوقع'}. لم يتم المساس بالنسخة الحالية.`,
        });
      } finally {
        setIsRunning(false);
        setPipelineProgress(null);
      }
    },
    [appendMessage]
  );

  const runFreshCompilation = useCallback(
    async (prompt: string) => {
      if (selectedSources.length === 0) {
        setErrorBanner('يرجى تحديد مصدر واحد على الأقل من قائمة المصادر أو رفع ملف جديد.');
        return;
      }

      appendMessage({ role: 'user', text: prompt });
      setIsRunning(true);

      try {
        const output = await runSmartCompilationPipeline({
          instruction: prompt,
          repetitionPolicy,
          sources: selectedSources,
          organizationModeOverride,
          manualUnitFilters,
          onProgress: setPipelineProgress,
          onSourceUpdated: handleSourceUpdated,
          onNewlyConvertedSave: onSaveConvertedFile,
        });

        setCompiledAnthology(output);
        setDraftHistory([]);
        setActiveOutputTab('preview');
        setMobilePane('canvas');

        const auditSum = output.result.microscopicAuditReport?.summary;
        const rep = output.repetitionStats;

        appendMessage({
          role: 'assistant',
          text: `${output.plan.assistantSummary}\n\nاكتمل الاستخراج والتجميع من (${output.sourceTitles.length}) مصادر في (${output.sectionCount}) قسماً، وتم تمرير المستند تلقائياً على بوابات التنظيف والتدقيق المجهري والقرآني.`,
          metaSummary: `الأسئلة المرصودة: ${rep.totalQuestionsDetected} · التكرارات المحفوظة: ${
            rep.preservedCrossExamRepeats
          } · التطابق المجهري: ${auditSum?.wordFidelityRatio ?? 100}% · الرسم العثماني: ${
            auditSum?.quranicUthmaniCompliance ?? 100
          }%`,
        });
      } catch (err: any) {
        setErrorBanner(err?.message || 'تعذر إتمام عملية التجميع.');
        appendMessage({
          role: 'assistant',
          text: `تعذر إكمال التجميع: ${err?.message || 'خطأ غير متوقع'}. راجع اختيار المصادر وحاول مجدداً.`,
        });
      } finally {
        setIsRunning(false);
        setPipelineProgress(null);
      }
    },
    [
      appendMessage,
      handleSourceUpdated,
      manualUnitFilters,
      onSaveConvertedFile,
      organizationModeOverride,
      repetitionPolicy,
      selectedSources,
    ]
  );

  const handleSendChat = useCallback(
    async (overrideText?: string) => {
      const prompt = (overrideText ?? chatInput).trim();
      if (!prompt || isRunning) return;

      setErrorBanner(null);
      if (!overrideText) setChatInput('');

      const isAskQuery =
        chatActionMode === 'ask' ||
        (!compiledAnthology && isConversationalQuestionIntent(prompt));

      if (isAskQuery) {
        await runAskQuery(prompt);
        return;
      }

      if (compiledAnthology) {
        await runAnthologyRefinement(prompt, compiledAnthology);
        return;
      }

      await runFreshCompilation(prompt);
    },
    [
      chatActionMode,
      chatInput,
      compiledAnthology,
      isRunning,
      runAnthologyRefinement,
      runAskQuery,
      runFreshCompilation,
    ]
  );

  const handleUndoDraft = useCallback(() => {
    if (draftHistory.length === 0 || !compiledAnthology) return;
    const previous = draftHistory[draftHistory.length - 1];
    setDraftHistory((prev) => prev.slice(0, -1));
    setCompiledAnthology({ ...compiledAnthology, result: previous });
    appendMessage({
      role: 'assistant',
      text: 'تم التراجع للنسخة السابقة من التجميعة بنجاح.',
    });
  }, [appendMessage, compiledAnthology, draftHistory]);

  const handleStartFreshCompilation = useCallback(() => {
    setCompiledAnthology(null);
    setDraftHistory([]);
    setPipelineProgress(null);
    setErrorBanner(null);
    setMobilePane('chat');
    appendMessage({
      role: 'system',
      text: 'تم فتح جلسة تجميع جديدة. عدّل المصادر المختارة أو اكتب تعليمات التجميع الجديدة.',
    });
  }, [appendMessage]);

  const handleApplyManualEdit = useCallback(() => {
    if (!compiledAnthology) return;
    const prevSnapshot = compiledAnthology.result;
    const finalized = runMicroscopicFinalizationPipeline(
      compiledAnthology.combinedReferenceSourceText || manualMarkdown,
      manualMarkdown,
      compiledAnthology.result.fileName || 'compiled.docx'
    );
    const totalPagesEstimate = Math.max(
      1,
      finalized.finalMarkdown.split(/---PAGE_BREAK---/).filter((p) => p.trim().length > 0).length
    );

    setDraftHistory((prev) => [...prev, prevSnapshot]);
    setCompiledAnthology({
      ...compiledAnthology,
      result: {
        ...compiledAnthology.result,
        markdown: finalized.finalMarkdown,
        plainText: finalized.plainText,
        sourceExtractText: finalized.sourceExtractText,
        totalPages: totalPagesEstimate,
        textCleanerReport: finalized.textCleanerReport,
        microscopicAuditReport: finalized.microscopicAuditReport,
        strictQAReport: finalized.strictQAResult,
      },
    });
    setActiveOutputTab('preview');
    showToast('تم حفظ التعديلات اليدوية وإعادة تشغيل التدقيق المجهري والقرآني.');
  }, [compiledAnthology, manualMarkdown, showToast]);

  const handleApplyAuditUpdate = useCallback(
    (payload: {
      markdown: string;
      plainText: string;
      microscopicAuditReport: ConversionResult['microscopicAuditReport'];
      textCleanerReport: ConversionResult['textCleanerReport'];
    }) => {
      setCompiledAnthology((prev) =>
        prev
          ? {
              ...prev,
              result: {
                ...prev.result,
                markdown: payload.markdown,
                plainText: payload.plainText,
                microscopicAuditReport: payload.microscopicAuditReport,
                textCleanerReport: payload.textCleanerReport,
              },
            }
          : prev
      );
    },
    []
  );

  const handleExportWord = useCallback(async () => {
    if (!compiledAnthology) return;
    setIsExportingDocx(true);
    try {
      const r = compiledAnthology.result;
      const safeName = (r.title || 'تجميعة_منسقة').replace(/[\\/:*?"<>|]/g, '_').slice(0, 75);
      await downloadDocx(
        {
          title: r.title,
          markdown: r.markdown,
          isRtl: r.textDirection === 'rtl' || Boolean(r.hasArabicText),
          fontProfile,
        },
        `${safeName}.docx`
      );
      showToast(
        `تم تصدير ملف Word "${safeName}.docx" بنجاح بمعايير ${TYPOGRAPHY_PROFILES[fontProfile].labelArabic}.`,
        5000
      );
    } catch (err: any) {
      setErrorBanner(err?.message || 'حدث خطأ أثناء توليد ملف Word.');
    } finally {
      setIsExportingDocx(false);
    }
  }, [compiledAnthology, fontProfile, showToast]);

  const handleExportMarkdown = useCallback(() => {
    if (!compiledAnthology) return;
    const r = compiledAnthology.result;
    const safeName = (r.title || 'تجميعة_منسقة').replace(/[\\/:*?"<>|]/g, '_').slice(0, 75);
    downloadTextFile(r.markdown, `${safeName}.md`, 'text/markdown;charset=utf-8');
    showToast(`تم تنزيل ملف Markdown "${safeName}.md" بنجاح.`);
  }, [compiledAnthology, showToast]);

  const handleExportPlainText = useCallback(() => {
    if (!compiledAnthology) return;
    const r = compiledAnthology.result;
    const safeName = (r.title || 'تجميعة_منسقة').replace(/[\\/:*?"<>|]/g, '_').slice(0, 75);
    downloadTextFile(r.plainText, `${safeName}.txt`, 'text/plain;charset=utf-8');
    showToast(`تم تنزيل الملف النصي "${safeName}.txt" بنجاح.`);
  }, [compiledAnthology, showToast]);

  const handleCopyOutput = useCallback(async () => {
    if (!compiledAnthology) return;
    try {
      await navigator.clipboard.writeText(compiledAnthology.result.markdown);
      setCopiedOutput(true);
      showToast('تم نسخ التجميعة الكاملة بصيغة Markdown إلى الحافظة.', 3000);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => {
        setCopiedOutput(false);
        copyTimerRef.current = null;
      }, 3000);
    } catch {
      setErrorBanner('تعذر النسخ التلقائي إلى الحافظة.');
    }
  }, [compiledAnthology, showToast]);

  const handleSaveAnthologyToHistory = useCallback(async () => {
    if (!compiledAnthology) return;
    setIsSavingToHistory(true);
    try {
      await onSaveCompiledResult(compiledAnthology.result);
      showToast('تم حفظ التجميعة النهائية في السجل الدائم بنجاح.');
    } finally {
      setIsSavingToHistory(false);
    }
  }, [compiledAnthology, onSaveCompiledResult, showToast]);

  const handleRunSemanticSearch = useCallback(
    async (e?: React.FormEvent) => {
      if (e) e.preventDefault();
      const q = semanticQuery.trim();
      if (!q || isSearchingSemantic) return;

      setSemanticError(null);
      setIsSearchPanelOpen(true);
      setIsSearchingSemantic(true);
      setSemanticStatusText('تجهيز المصادر وفحص المقاطع للبحث الدلالي...');

      try {
        const response = await runSemanticSearchAcrossSources({
          query: q,
          sources: availableSources,
          kindFilter: semanticKindFilter,
          scopeMode: semanticScope,
          selectedSourceIds,
          topK: 12,
          onStatusMessage: setSemanticStatusText,
          onSourceUpdated: handleSourceUpdated,
          onNewlyConvertedSave: onSaveConvertedFile,
        });
        setSemanticResponse(response);
      } catch (err: any) {
        setSemanticError(err?.message || 'تعذر إتمام البحث الدلالي عبر الملفات.');
        setSemanticResponse(null);
      } finally {
        setIsSearchingSemantic(false);
        setSemanticStatusText(null);
      }
    },
    [
      availableSources,
      handleSourceUpdated,
      isSearchingSemantic,
      onSaveConvertedFile,
      selectedSourceIds,
      semanticKindFilter,
      semanticQuery,
      semanticScope,
    ]
  );

  const handleClearSemanticSearch = useCallback(() => {
    setSemanticQuery('');
    setSemanticResponse(null);
    setSemanticError(null);
    setSemanticStatusText(null);
    setIsSearchPanelOpen(false);
  }, []);

  const handleInsertSearchHitIntoPrompt = useCallback(
    (hit: SemanticSearchResultItem) => {
      setSelectedSourceIds((prev) => (prev.includes(hit.sourceId) ? prev : [hit.sourceId, ...prev]));
      setChatActionMode('auto');
      const cleanExcerpt = hit.snippet
        .replace(/<\/?[^>]+>/g, '')
        .replace(/[*#_`]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 90);
      const suggestedPrompt = compiledAnthology
        ? `تأكد من تضمين وتنسيق القسم الخاص بـ «${hit.heading}» من «${hit.sourceTitle}» (ص ${hit.pageNumber}) حول: «${cleanExcerpt}» مع الحفاظ على التسطير والنصوص.`
        : `استخرج من «${hit.sourceTitle}» قسم «${hit.heading}» (صفحة ${hit.pageNumber}) والأسئلة والمحتوى المرتبط بـ: «${cleanExcerpt}» بالترتيب الأصلي مع الحفاظ على الكلمات المسطّر تحتها والآيات.`;
      setChatInput(suggestedPrompt);
      setMobilePane('chat');
      showToast(`تم تحديد «${hit.sourceTitle}» وإدراج توجيه القسم في صندوق المحادثة.`);
    },
    [compiledAnthology, showToast]
  );

  const handleInspectSearchHitSource = useCallback(
    (hit: SemanticSearchResultItem) => {
      setSelectedSourceIds((prev) => (prev.includes(hit.sourceId) ? prev : [hit.sourceId, ...prev]));
      setExpandedSourceOutlineId(hit.sourceId);
      setIsSourcesDrawerOpen(true);
      setMobilePane('sources');
      showToast(`تم تحديد «${hit.sourceTitle}» وفتح فهرس الدروس في قائمة المصادر.`, 3500);
    },
    [showToast]
  );

  const renderedPages = useMemo(() => {
    const md = compiledAnthology?.result.markdown || '';
    if (!md) return [];
    return md.split(/\n*---PAGE_BREAK---\n*/).filter((p) => p.trim().length > 0);
  }, [compiledAnthology?.result.markdown]);

  return {
    availableSources,
    filteredSources,
    selectedSources,
    selectedSourceIds,
    setSelectedSourceIds,
    sourceSearch,
    setSourceSearch,
    repetitionPolicy,
    setRepetitionPolicy,
    organizationModeOverride,
    setOrganizationModeOverride,
    expandedSourceOutlineId,
    setExpandedSourceOutlineId,
    manualUnitFilters,
    chatActionMode,
    setChatActionMode,
    isDragOver,
    setIsDragOver,
    fileInputRef,
    isSourcesDrawerOpen,
    setIsSourcesDrawerOpen,
    mobilePane,
    setMobilePane,
    messages,
    chatInput,
    setChatInput,
    isRunning,
    pipelineProgress,
    errorBanner,
    setErrorBanner,
    toastMessage,
    compiledAnthology,
    draftHistory,
    activeOutputTab,
    setActiveOutputTab,
    manualMarkdown,
    setManualMarkdown,
    fontProfile,
    setFontProfile,
    isExportingDocx,
    isSavingToHistory,
    copiedOutput,
    semanticQuery,
    setSemanticQuery,
    semanticKindFilter,
    setSemanticKindFilter,
    semanticScope,
    setSemanticScope,
    isSearchingSemantic,
    semanticStatusText,
    semanticError,
    semanticResponse,
    isSearchPanelOpen,
    setIsSearchPanelOpen,
    chatEndRef,
    renderedPages,
    handleFilesAdded,
    toggleLessonUnitState,
    resetSourceUnitFilter,
    toggleSource,
    removeUploadedSource,
    handleSendChat,
    handleUndoDraft,
    handleStartFreshCompilation,
    handleApplyManualEdit,
    handleApplyAuditUpdate,
    handleExportWord,
    handleExportMarkdown,
    handleExportPlainText,
    handleCopyOutput,
    handleSaveAnthologyToHistory,
    handleRunSemanticSearch,
    handleClearSemanticSearch,
    handleInsertSearchHitIntoPrompt,
    handleInspectSearchHitSource,
  };
}
