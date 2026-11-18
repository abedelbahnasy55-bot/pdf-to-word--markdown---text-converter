import React, { useState, useMemo, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { remarkInlineHtmlPlugin } from '../utils/remarkInlineHtmlPlugin';
import {
  Send,
  UploadCloud,
  CheckSquare,
  Square,
  RefreshCw,
  Download,
  ShieldCheck,
  Edit3,
  Eye,
  Undo2,
  BookmarkPlus,
  Maximize2,
  CheckCircle2,
  AlertCircle,
  Search,
  Trash2,
  Layers,
  BookOpen,
  RotateCcw,
  Copy,
  Check,
  FileText,
  FileCode,
  ChevronDown,
  ChevronUp,
  ListTree,
  MessageSquareText,
  PanelRightClose,
  PanelRightOpen,
} from 'lucide-react';
import { ConversionResult, SavedConversion } from '../types';
import { formatBytes } from '../utils/historyStorage';
import {
  downloadDocx,
  downloadTextFile,
  TYPOGRAPHY_PROFILES,
  FontProfileId,
} from '../utils/docxExporter';
import { EmbeddedMicroscopicAuditPanel } from './EmbeddedMicroscopicAuditPanel';
import { ErrorBoundary } from './ErrorBoundary';
import { CustomSelect, CustomSelectOption } from './ui/CustomSelect';
import {
  CompilerSourceItem,
  CompilerPipelineProgress,
  CompiledAnthologyResult,
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

interface BatchQueueLightItem {
  id: string;
  name: string;
  size: number;
  status: string;
  result?: ConversionResult;
  file?: File;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  timestamp: number;
  metaSummary?: string;
}

interface SmartCompilerWorkspaceProps {
  batchQueue: BatchQueueLightItem[] | null;
  savedItems: SavedConversion[];
  onSaveConvertedFile?: (res: ConversionResult, file: File) => Promise<void>;
  onSaveCompiledResult: (res: ConversionResult) => Promise<void>;
  onOpenInFullViewer: (res: ConversionResult) => void;
}

const PROMPT_PRESETS = [
  {
    label: 'أسئلة كتاب مرتبة بالفهرس',
    text: 'استخرج كافة الأسئلة والتدريبات من الكتاب المحدد فقط دون الشرح النظري، مرتبة على حسب ترتيبها الأصلي في الدروس والفهرس، مع إبقاء الإجابات إن وجدت وتوحيد ترقيم الأسئلة س١، س٢.',
  },
  {
    label: 'انتقاء دروس واستبعاد أخرى',
    text: 'هات أسئلة وتدريبات الدرس الأول والدرس الثاني فقط على حسب ترتيب الفهرس، وسيب الدرس الثالث دون استخراجه.',
  },
  {
    label: 'فحص فهرس الدروس والسنوات',
    text: 'ما هي الدروس والأبواب والأقسام الموجودة في المصادر المحددة وما هي السنوات المرصودة؟ اعرض الفهرس الكامل.',
  },
  {
    label: 'تجميع امتحانات مع حفظ التكرار',
    text: 'اجمع أسئلة وتدريبات كتاب الشرح مع امتحانات السنوات السابقة كاملة، ورتبها حسب السنة، واحتفظ بالأسئلة المتكررة بين السنوات داخل كل امتحان دون حذف.',
  },
  {
    label: 'امتحانات + ملحق إجابات ختامي',
    text: 'اجمع جميع الامتحانات المتاحة من أحدث سنة إلى أقدم سنة، وانقل الإجابات النموذجية إلى ملحق مستقل في نهاية الملف، مع توحيد ترقيم الأسئلة س١، س٢.',
  },
];

const QUICK_REFINEMENTS = [
  'انقل الإجابات في ملحق في الآخر',
  'رتب الامتحانات من الأحدث للأقدم',
  'وحّد ترقيم الأسئلة (س١، س٢)',
  'اجعل العناوين الرئيسية أوضح وأضف مقدمة موجزة',
];

const PIPELINE_STEPS_ORDER: Array<{ id: CompilerPipelineProgress['stage']; label: string }> = [
  { id: 'converting_sources', label: 'تجهيز المصادر' },
  { id: 'planning', label: 'خطة الهيكلة' },
  { id: 'extracting', label: 'الاستخلاص' },
  { id: 'assembling', label: 'الدمج' },
  { id: 'auditing', label: 'التدقيق والختم' },
];

const ORGANIZATION_OPTIONS: Array<CustomSelectOption<OrganizationMode | 'auto'>> = [
  { value: 'auto', label: 'تلقائي حسب صياغة الطلب', description: 'يستنتج الترتيب الأنسب من أوامرك' },
  { value: 'by_book_order', label: 'ترتيب الدروس والفهرس الأصلي', description: 'يلتزم بتسلسل الكتاب الأصلي' },
  { value: 'by_exam_year', label: 'ترتيب زمني بسنوات الامتحانات', description: 'يفصل كل سنة امتحانية على حدة' },
  { value: 'by_source', label: 'مجمّع حسب كل كتاب ومصدر', description: 'باب مستقل لكل مصدر مختار' },
  { value: 'unified_bank', label: 'بنك أسئلة موحّد', description: 'يدمج البنود المتقاربة موضوعياً' },
];

const FONT_PROFILE_OPTIONS: Array<CustomSelectOption<FontProfileId>> = Object.values(
  TYPOGRAPHY_PROFILES
).map((p) => ({
  value: p.id,
  label: `${p.labelArabic} (${p.arabicFont} ${p.arabicBodyPt}pt)`,
}));

export const SmartCompilerWorkspace: React.FC<SmartCompilerWorkspaceProps> = ({
  batchQueue,
  savedItems,
  onSaveConvertedFile,
  onSaveCompiledResult,
  onOpenInFullViewer,
}) => {
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
  const [manualUnitFilters, setManualUnitFilters] = useState<
    Record<string, { includeUnits: string[]; excludeUnits: string[] }>
  >({});
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
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome-1',
      role: 'assistant',
      timestamp: Date.now(),
      text: 'مرحباً بك في استوديو التحرير والتجميع. حدّد كتاباً أو عدة ملفات من القائمة الجانبية، ثم اكتب طلب الاستخراج أو الترتيب أو اطلب فحص الفهرس قبل التصدير إلى Word أو Markdown.',
    },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [pipelineProgress, setPipelineProgress] = useState<CompilerPipelineProgress | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Compiled Output & Undo Stack
  const [compiledAnthology, setCompiledAnthology] = useState<CompiledAnthologyResult | null>(null);
  const [draftHistory, setDraftHistory] = useState<ConversionResult[]>([]);
  const [activeOutputTab, setActiveOutputTab] = useState<'preview' | 'audit' | 'edit'>('preview');
  const [manualMarkdown, setManualMarkdown] = useState('');
  const [fontProfile, setFontProfile] = useState<FontProfileId>('bilingual_publication');
  const [isExportingDocx, setIsExportingDocx] = useState(false);
  const [isSavingToHistory, setIsSavingToHistory] = useState(false);
  const [copiedOutput, setCopiedOutput] = useState(false);

  // Semantic Search State (Vector Embeddings across uploaded & converted files)
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

  const handleFilesAdded = (files: FileList | File[]) => {
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
    setToastMessage(`تمت إضافة ${valid.length} ملف إلى قائمة المصادر (سيُحوَّل تلقائياً عند التنفيذ).`);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const toggleLessonUnitState = (
    sourceId: string,
    heading: string,
    mode: 'include' | 'exclude'
  ) => {
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
  };

  const toggleSource = (id: string) => {
    setSelectedSourceIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSourceUpdated = (updated: CompilerSourceItem) => {
    setUploadedSources((prev) => {
      const idx = prev.findIndex((p) => p.id === updated.id);
      if (idx === -1) return prev;
      const copy = [...prev];
      copy[idx] = updated;
      return copy;
    });
  };

  const appendMessage = (msg: Omit<ChatMessage, 'id' | 'timestamp'>) => {
    setMessages((prev) => [
      ...prev,
      {
        ...msg,
        id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: Date.now(),
      },
    ]);
  };

  const handleSendChat = async (overrideText?: string) => {
    const prompt = (overrideText ?? chatInput).trim();
    if (!prompt || isRunning) return;

    setErrorBanner(null);
    if (!overrideText) setChatInput('');

    const isAskQuery =
      chatActionMode === 'ask' ||
      (!compiledAnthology && isConversationalQuestionIntent(prompt));

    if (isAskQuery) {
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
      return;
    }

    if (compiledAnthology) {
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
        const prevSnapshot = compiledAnthology.result;
        const { updatedResult, assistantReply } = await refineCompilationDocument({
          currentResult: compiledAnthology.result,
          editRequest: prompt,
          referenceSourceText: compiledAnthology.combinedReferenceSourceText,
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
      return;
    }

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
  };

  const handleUndoDraft = () => {
    if (draftHistory.length === 0 || !compiledAnthology) return;
    const previous = draftHistory[draftHistory.length - 1];
    setDraftHistory((prev) => prev.slice(0, -1));
    setCompiledAnthology({ ...compiledAnthology, result: previous });
    appendMessage({
      role: 'assistant',
      text: 'تم التراجع للنسخة السابقة من التجميعة بنجاح.',
    });
  };

  const handleStartFreshCompilation = () => {
    setCompiledAnthology(null);
    setDraftHistory([]);
    setPipelineProgress(null);
    setErrorBanner(null);
    setMobilePane('chat');
    appendMessage({
      role: 'system',
      text: 'تم فتح جلسة تجميع جديدة. عدّل المصادر المختارة أو اكتب تعليمات التجميع الجديدة.',
    });
  };

  const handleApplyManualEdit = () => {
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
    setToastMessage('تم حفظ التعديلات اليدوية وإعادة تشغيل التدقيق المجهري والقرآني.');
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleExportWord = async () => {
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
      setToastMessage(
        `تم تصدير ملف Word "${safeName}.docx" بنجاح بمعايير ${TYPOGRAPHY_PROFILES[fontProfile].labelArabic}.`
      );
      setTimeout(() => setToastMessage(null), 5000);
    } catch (err: any) {
      setErrorBanner(err?.message || 'حدث خطأ أثناء توليد ملف Word.');
    } finally {
      setIsExportingDocx(false);
    }
  };

  const handleExportMarkdown = () => {
    if (!compiledAnthology) return;
    const r = compiledAnthology.result;
    const safeName = (r.title || 'تجميعة_منسقة').replace(/[\\/:*?"<>|]/g, '_').slice(0, 75);
    downloadTextFile(r.markdown, `${safeName}.md`, 'text/markdown;charset=utf-8');
    setToastMessage(`تم تنزيل ملف Markdown "${safeName}.md" بنجاح.`);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleExportPlainText = () => {
    if (!compiledAnthology) return;
    const r = compiledAnthology.result;
    const safeName = (r.title || 'تجميعة_منسقة').replace(/[\\/:*?"<>|]/g, '_').slice(0, 75);
    downloadTextFile(r.plainText, `${safeName}.txt`, 'text/plain;charset=utf-8');
    setToastMessage(`تم تنزيل الملف النصي "${safeName}.txt" بنجاح.`);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleCopyOutput = async () => {
    if (!compiledAnthology) return;
    try {
      await navigator.clipboard.writeText(compiledAnthology.result.markdown);
      setCopiedOutput(true);
      setToastMessage('تم نسخ التجميعة الكاملة بصيغة Markdown إلى الحافظة.');
      setTimeout(() => {
        setCopiedOutput(false);
        setToastMessage(null);
      }, 3000);
    } catch {
      setErrorBanner('تعذر النسخ التلقائي إلى الحافظة.');
    }
  };

  const handleSaveAnthologyToHistory = async () => {
    if (!compiledAnthology) return;
    setIsSavingToHistory(true);
    try {
      await onSaveCompiledResult(compiledAnthology.result);
      setToastMessage('تم حفظ التجميعة النهائية في السجل الدائم بنجاح.');
      setTimeout(() => setToastMessage(null), 4000);
    } finally {
      setIsSavingToHistory(false);
    }
  };

  const handleRunSemanticSearch = async (e?: React.FormEvent) => {
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
  };

  const handleClearSemanticSearch = () => {
    setSemanticQuery('');
    setSemanticResponse(null);
    setSemanticError(null);
    setSemanticStatusText(null);
    setIsSearchPanelOpen(false);
  };

  const handleInsertSearchHitIntoPrompt = (hit: SemanticSearchResultItem) => {
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
    setToastMessage(`تم تحديد «${hit.sourceTitle}» وإدراج توجيه القسم في صندوق المحادثة.`);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleInspectSearchHitSource = (hit: SemanticSearchResultItem) => {
    setSelectedSourceIds((prev) => (prev.includes(hit.sourceId) ? prev : [hit.sourceId, ...prev]));
    setExpandedSourceOutlineId(hit.sourceId);
    setIsSourcesDrawerOpen(true);
    setMobilePane('sources');
    setToastMessage(`تم تحديد «${hit.sourceTitle}» وفتح فهرس الدروس في قائمة المصادر.`);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const renderedPages = useMemo(() => {
    const md = compiledAnthology?.result.markdown || '';
    if (!md) return [];
    return md.split(/\n*---PAGE_BREAK---\n*/).filter((p) => p.trim().length > 0);
  }, [compiledAnthology?.result.markdown]);

  const auditSummary = compiledAnthology?.result.microscopicAuditReport?.summary;

  return (
    <div dir="rtl" className="max-w-[1680px] mx-auto px-3 sm:px-5 py-3.5 space-y-3 flex flex-col lg:min-h-[calc(100dvh-3.75rem)]">
      {/* Compact Editorial Studio Bar */}
      <header className="bg-white dark:bg-[#141720] border border-slate-200 dark:border-[#232938] rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shrink-0 transition-colors">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => setIsSourcesDrawerOpen((prev) => !prev)}
            className="hidden lg:inline-flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 dark:border-[#2A3142] bg-slate-50 dark:bg-[#1B202C] hover:bg-slate-100 dark:hover:bg-[#232938] text-slate-700 dark:text-slate-200 cursor-pointer transition-colors shrink-0"
            title={isSourcesDrawerOpen ? 'طي قائمة المصادر لتوسيع مساحة التحرير' : 'إظهار قائمة المصادر'}
            aria-label={isSourcesDrawerOpen ? 'طي قائمة المصادر' : 'إظهار قائمة المصادر'}
          >
            {isSourcesDrawerOpen ? (
              <PanelRightClose className="w-4 h-4" />
            ) : (
              <PanelRightOpen className="w-4 h-4" />
            )}
          </button>

          <div className="w-8 h-8 rounded-lg bg-slate-900 dark:bg-blue-600 text-white flex items-center justify-center shrink-0">
            <BookOpen className="w-4 h-4" />
          </div>

          <div className="min-w-0">
            <h1 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-slate-100 truncate">
              استوديو التحرير والتجميع والمقارنة
            </h1>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate hidden sm:block">
              استخراج انتقائي من الكتب · حماية التكرارات المفيدة بين الامتحانات · تدقيق مجهري وقرآني · تصدير Word معياري
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 text-xs text-slate-600 dark:text-slate-400 tabular-nums shrink-0">
          <span>
            المصادر: <strong className="text-slate-900 dark:text-slate-100">{availableSources.length}</strong>
          </span>
          <span className="text-slate-300 dark:text-slate-600">·</span>
          <span>
            المحدد: <strong className="text-blue-600 dark:text-blue-400">{selectedSources.length}</strong>
          </span>
          {compiledAnthology && (
            <>
              <span className="text-slate-300 dark:text-slate-600">·</span>
              <button
                type="button"
                onClick={handleStartFreshCompilation}
                className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-[#2A3142] bg-white dark:bg-[#1B202C] hover:bg-slate-50 dark:hover:bg-[#232938] text-slate-700 dark:text-slate-200 font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>تجميعة جديدة</span>
              </button>
            </>
          )}
        </div>
      </header>

      {/* Semantic Vector Search Bar across Uploaded & Converted PDFs/DOCX */}
      <section
        aria-label="البحث الدلالي في المصادر بالمتجهات"
        className="bg-white dark:bg-[#141720] border border-slate-200 dark:border-[#232938] rounded-xl p-3 space-y-2.5 shrink-0 transition-colors"
      >
        <form
          onSubmit={handleRunSemanticSearch}
          className="flex flex-col lg:flex-row lg:items-center gap-2"
        >
          <div className="relative flex-1 min-w-0">
            <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={semanticQuery}
              onChange={(e) => setSemanticQuery(e.target.value)}
              placeholder="ابحث بالمعنى عن سؤال، قاعدة إعراب، آية، أو درس عبر كل الملفات المرفوعة والمحوّلة..."
              className="w-full text-xs sm:text-sm pr-9 pl-3 py-2 rounded-lg border border-slate-300 dark:border-[#2A3142] bg-white dark:bg-[#10131C] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {/* Kind Filter Segmented Control */}
            <div
              role="group"
              aria-label="تصنيف نتائج البحث"
              className="flex items-center gap-0.5 bg-slate-100 dark:bg-[#1B202C] p-0.5 rounded-lg text-[11px]"
            >
              {(
                [
                  { id: 'all', label: 'الكل' },
                  { id: 'question', label: 'الأسئلة فقط' },
                  { id: 'topic_lesson', label: 'الدروس والمواضيع' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setSemanticKindFilter(opt.id)}
                  className={`px-2.5 py-1.5 rounded-md font-semibold cursor-pointer transition-colors ${
                    semanticKindFilter === opt.id
                      ? 'bg-white dark:bg-[#141720] text-slate-900 dark:text-slate-100 shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Scope Segmented Control */}
            <div
              role="group"
              aria-label="نطاق ملفات البحث"
              className="flex items-center gap-0.5 bg-slate-100 dark:bg-[#1B202C] p-0.5 rounded-lg text-[11px] tabular-nums"
            >
              <button
                type="button"
                onClick={() => setSemanticScope('all')}
                className={`px-2.5 py-1.5 rounded-md font-semibold cursor-pointer transition-colors ${
                  semanticScope === 'all'
                    ? 'bg-white dark:bg-[#141720] text-slate-900 dark:text-slate-100 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                كل الملفات ({availableSources.length})
              </button>
              <button
                type="button"
                onClick={() => setSemanticScope('selected')}
                className={`px-2.5 py-1.5 rounded-md font-semibold cursor-pointer transition-colors ${
                  semanticScope === 'selected'
                    ? 'bg-white dark:bg-[#141720] text-slate-900 dark:text-slate-100 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                المحددة فقط ({selectedSources.length})
              </button>
            </div>

            <button
              type="submit"
              disabled={isSearchingSemantic || !semanticQuery.trim()}
              className="px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              {isSearchingSemantic ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Search className="w-3.5 h-3.5" />
              )}
              <span>بحث دلالي</span>
            </button>

            {(semanticQuery.trim() || isSearchPanelOpen) && (
              <button
                type="button"
                onClick={handleClearSemanticSearch}
                className="px-2.5 py-2 rounded-lg border border-slate-200 dark:border-[#2A3142] bg-white dark:bg-[#1B202C] hover:bg-slate-50 dark:hover:bg-[#232938] text-slate-600 dark:text-slate-300 text-xs font-semibold cursor-pointer"
              >
                مسح
              </button>
            )}
          </div>
        </form>

        {/* Expandable Semantic Search Results Panel */}
        {isSearchPanelOpen && (
          <div className="border-t border-slate-200 dark:border-[#232938] pt-3 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600 dark:text-slate-400 tabular-nums">
              <div className="flex flex-wrap items-center gap-1.5">
                {isSearchingSemantic ? (
                  <span className="text-blue-700 dark:text-blue-400 font-semibold flex items-center gap-1.5">
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    <span>{semanticStatusText || 'جاري البحث الدلالي بالمتجهات...'}</span>
                  </span>
                ) : semanticResponse ? (
                  <>
                    <span className="font-bold text-slate-900 dark:text-slate-100">
                      النتائج المطابقة: {semanticResponse.results.length}
                    </span>
                    <span className="text-slate-300 dark:text-slate-600">·</span>
                    <span>المقاطع المفحوصة: {semanticResponse.totalSearched}</span>
                    <span className="text-slate-300 dark:text-slate-600">·</span>
                    <span>
                      {semanticResponse.mode === 'vector-embedding'
                        ? 'محرك المتجهات الدلالية'
                        : 'وضع المطابقة المعجمية السريعة'}
                    </span>
                  </>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setIsSearchPanelOpen(false)}
                className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 font-semibold flex items-center gap-1 cursor-pointer"
              >
                <ChevronUp className="w-3.5 h-3.5" />
                <span>إخفاء النتائج</span>
              </button>
            </div>

            {isSearchingSemantic && (
              <div className="space-y-2" aria-busy="true">
                {[0, 1, 2].map((idx) => (
                  <div
                    key={idx}
                    className="rounded-lg border border-slate-200 dark:border-[#232938] bg-slate-50/70 dark:bg-[#171B26] p-3 space-y-2"
                  >
                    <div className="h-3 bg-slate-200 dark:bg-[#232938] rounded w-1/3" />
                    <div className="h-3 bg-slate-200 dark:bg-[#232938] rounded w-5/6" />
                    <div className="h-3 bg-slate-200 dark:bg-[#232938] rounded w-2/3" />
                  </div>
                ))}
              </div>
            )}

            {!isSearchingSemantic && semanticError && (
              <div className="rounded-lg border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 px-3 py-2.5 text-xs text-red-800 dark:text-red-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
                <span>{semanticError}</span>
              </div>
            )}

            {!isSearchingSemantic && !semanticError && semanticResponse?.results.length === 0 && (
              <div className="rounded-lg border border-slate-200 dark:border-[#232938] bg-slate-50 dark:bg-[#171B26] px-4 py-4 text-center text-xs text-slate-600 dark:text-slate-400">
                لم يتم العثور على مقاطع مطابقة دلالياً لعبارة «{semanticQuery}». جرّب توسيع النطاق إلى «كل الملفات» أو استخدام صياغة أكثر عمومية.
              </div>
            )}

            {!isSearchingSemantic && !semanticError && semanticResponse && semanticResponse.results.length > 0 && (
              <div className="divide-y divide-slate-200 dark:divide-[#232938] border border-slate-200 dark:border-[#232938] rounded-lg max-h-[280px] overflow-y-auto bg-white dark:bg-[#10131C]">
                {semanticResponse.results.map((hit) => {
                  const kindLabel =
                    hit.kind === 'question'
                      ? 'سؤال'
                      : hit.kind === 'lesson'
                      ? 'درس'
                      : 'موضوع';

                  return (
                    <div
                      key={hit.passageId}
                      className="p-3 hover:bg-slate-50/70 dark:hover:bg-[#171B26] transition-colors flex flex-col md:flex-row md:items-start justify-between gap-3"
                    >
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-400 tabular-nums">
                          <span className="font-extrabold text-blue-700 dark:text-blue-400">
                            تطابق {hit.matchPercent}%
                          </span>
                          <span className="text-slate-300 dark:text-slate-600">·</span>
                          <span className="font-bold text-slate-800 dark:text-slate-200">{kindLabel}</span>
                          <span className="text-slate-300 dark:text-slate-600">·</span>
                          <span className="font-bold text-slate-900 dark:text-slate-100 truncate max-w-[220px]">
                            {hit.sourceTitle}
                          </span>
                          <span className="text-slate-300 dark:text-slate-600">·</span>
                          <span>ص {hit.pageNumber}</span>
                          {hit.heading && hit.heading !== hit.sourceTitle && (
                            <>
                              <span className="text-slate-300 dark:text-slate-600">·</span>
                              <span className="text-slate-700 dark:text-slate-300 font-semibold truncate max-w-[240px]">
                                {hit.heading}
                              </span>
                            </>
                          )}
                          <span className="text-slate-300 dark:text-slate-600">·</span>
                          <span className="text-slate-500 dark:text-slate-400">{hit.matchReason}</span>
                        </div>

                        <div className="prose-custom text-xs leading-relaxed text-slate-800 dark:text-slate-200 font-arabic">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm, remarkMath, remarkInlineHtmlPlugin]}
                            rehypePlugins={[rehypeKatex]}
                          >
                            {hit.snippet}
                          </ReactMarkdown>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleInsertSearchHitIntoPrompt(hit)}
                          className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          <Check className="w-3 h-3" />
                          <span>تحديد وإدراج في الأمر</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleInspectSearchHitSource(hit)}
                          className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#2A3142] bg-white dark:bg-[#1B202C] hover:bg-slate-50 dark:hover:bg-[#232938] text-slate-700 dark:text-slate-200 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                        >
                          <ListTree className="w-3 h-3 text-slate-600 dark:text-slate-400" />
                          <span>فهرس المصدر</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Banners */}
      {errorBanner && (
        <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-xl px-4 py-2.5 flex items-center justify-between gap-3 text-xs text-red-800 dark:text-red-300 shrink-0">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
            <span>{errorBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorBanner(null)}
            className="text-red-700 dark:text-red-300 font-bold hover:underline cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      )}

      {toastMessage && (
        <div className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 rounded-xl px-4 py-2.5 flex items-center gap-2 text-xs text-emerald-800 dark:text-emerald-300 font-medium shrink-0">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Mobile & Tablet Workspace Pane Switcher (< lg) */}
      <div className="lg:hidden grid grid-cols-3 gap-1 bg-slate-200/70 dark:bg-[#171B26] p-1 rounded-xl shrink-0 text-xs">
        <button
          type="button"
          onClick={() => setMobilePane('sources')}
          className={`py-2 px-2 rounded-lg font-bold transition-colors cursor-pointer tabular-nums ${
            mobilePane === 'sources'
              ? 'bg-white dark:bg-[#141720] text-slate-900 dark:text-slate-100 shadow-2xs'
              : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          المصادر ({selectedSources.length})
        </button>
        <button
          type="button"
          onClick={() => setMobilePane('chat')}
          className={`py-2 px-2 rounded-lg font-bold transition-colors cursor-pointer ${
            mobilePane === 'chat'
              ? 'bg-white dark:bg-[#141720] text-slate-900 dark:text-slate-100 shadow-2xs'
              : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          المحادثة والأوامر
        </button>
        <button
          type="button"
          onClick={() => setMobilePane('canvas')}
          className={`py-2 px-2 rounded-lg font-bold transition-colors cursor-pointer flex items-center justify-center gap-1 ${
            mobilePane === 'canvas'
              ? 'bg-white dark:bg-[#141720] text-slate-900 dark:text-slate-100 shadow-2xs'
              : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          <span>معاينة المستند</span>
          {compiledAnthology && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
        </button>
      </div>

      {/* Main Editorial Workspace Split Canvas (Anthropic Artifacts + OpenAI Canvas pattern) */}
      <div className="flex-1 flex flex-col lg:flex-row gap-3.5 min-h-[560px] lg:h-[calc(100dvh-13.25rem)] lg:min-h-[580px]">
        {/* Pane 1: Collapsible Sources & Settings Rail */}
        <aside
          className={`${
            mobilePane === 'sources' ? 'flex' : 'hidden'
          } ${
            isSourcesDrawerOpen ? 'lg:flex lg:w-[300px] xl:w-[320px] shrink-0' : 'lg:hidden'
          } bg-white dark:bg-[#141720] border border-slate-200 dark:border-[#232938] rounded-xl overflow-hidden flex-col lg:h-full transition-colors`}
        >
          <div className="px-3.5 py-2.5 border-b border-slate-200 dark:border-[#232938] bg-slate-50/70 dark:bg-[#171B26] flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <h2 className="text-xs font-bold text-slate-900 dark:text-slate-100">المصادر والملفات</h2>
            </div>
            <div className="flex items-center gap-2 text-[11px]">
              <button
                type="button"
                onClick={() => setSelectedSourceIds(availableSources.map((s) => s.id))}
                className="text-blue-600 dark:text-blue-400 hover:underline font-semibold cursor-pointer"
              >
                تحديد الكل
              </button>
              <span className="text-slate-300 dark:text-slate-600">·</span>
              <button
                type="button"
                onClick={() => setSelectedSourceIds([])}
                className="text-slate-500 dark:text-slate-400 hover:underline cursor-pointer"
              >
                تفريغ
              </button>
            </div>
          </div>

          {/* Direct File Dropzone inside Studio */}
          <div className="p-3 border-b border-slate-100 dark:border-[#232938] shrink-0">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragOver(true);
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragOver(false);
                if (e.dataTransfer.files?.length) handleFilesAdded(e.dataTransfer.files);
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`border border-dashed rounded-lg px-3 py-2.5 text-center cursor-pointer transition-colors ${
                isDragOver
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/15'
                  : 'border-slate-300 dark:border-[#2A3142] hover:border-blue-400 dark:hover:border-blue-500 bg-slate-50/60 dark:bg-[#10131C]'
              }`}
            >
              <UploadCloud className="w-4 h-4 text-blue-600 dark:text-blue-400 mx-auto mb-1" />
              <p className="text-[11px] font-bold text-slate-800 dark:text-slate-200">
                رفع ملفات PDF / Word / صور جديدة
              </p>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">
                تُحوَّل تلقائياً قبل التجميع وتُضاف للسجل
              </p>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.docx,.doc,image/*"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) {
                    handleFilesAdded(e.target.files);
                    e.target.value = '';
                  }
                }}
              />
            </div>

            {availableSources.length > 3 && (
              <div className="relative mt-2.5">
                <input
                  type="text"
                  value={sourceSearch}
                  onChange={(e) => setSourceSearch(e.target.value)}
                  placeholder="بحث باسم الكتاب أو السنة..."
                  className="w-full text-xs pr-7 pl-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#2A3142] bg-white dark:bg-[#10131C] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2 top-2" />
              </div>
            )}
          </div>

          {/* Sources List (scrollable flex-1) */}
          <div className="divide-y divide-slate-100 dark:divide-[#232938] flex-1 overflow-y-auto min-h-[180px]">
            {filteredSources.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400 dark:text-slate-500">
                لا توجد مصادر بعد. ارفع ملفاً أعلاه أو حوّل ملفات من الشاشة الرئيسية.
              </div>
            ) : (
              filteredSources.map((src) => {
                const isSelected = selectedSourceIds.includes(src.id);
                const isOutlineOpen = expandedSourceOutlineId === src.id;
                const unitFilter = manualUnitFilters[src.id] || {
                  includeUnits: [],
                  excludeUnits: [],
                };
                const activeFilterCount =
                  unitFilter.includeUnits.length + unitFilter.excludeUnits.length;

                return (
                  <div
                    key={src.id}
                    className={`transition-colors ${
                      isSelected
                        ? 'bg-blue-50/50 dark:bg-blue-500/10'
                        : 'hover:bg-slate-50/80 dark:hover:bg-[#171B26]'
                    }`}
                  >
                    <div
                      onClick={() => toggleSource(src.id)}
                      className="px-3 py-2.5 flex items-start gap-2.5 cursor-pointer"
                    >
                      <button
                        type="button"
                        className="mt-0.5 text-blue-600 dark:text-blue-400 shrink-0 cursor-pointer"
                        aria-label={src.title}
                      >
                        {isSelected ? (
                          <CheckSquare className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                        )}
                      </button>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate" title={src.fileName}>
                            {src.title}
                          </p>
                          {src.origin === 'upload' && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setUploadedSources((prev) => prev.filter((p) => p.id !== src.id));
                                setSelectedSourceIds((prev) => prev.filter((id) => id !== src.id));
                              }}
                              className="text-slate-400 hover:text-red-600 dark:hover:text-red-400 p-0.5 cursor-pointer"
                              title="إزالة الملف المرفوع"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>

                        <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 flex flex-wrap items-center gap-1 tabular-nums">
                          <span>
                            {src.origin === 'batch'
                              ? 'دفعة حالية'
                              : src.origin === 'history'
                              ? 'السجل المحفوظ'
                              : 'مرفوع حديثاً'}
                          </span>
                          <span>·</span>
                          <span>{formatBytes(src.fileSize)}</span>
                          {src.totalPages > 0 && (
                            <>
                              <span>·</span>
                              <span>{src.totalPages} صفحة</span>
                            </>
                          )}
                        </div>

                        <div className="text-[10px] mt-1 flex flex-wrap items-center gap-1.5">
                          {src.status === 'ready' && (
                            <span className="text-emerald-700 dark:text-emerald-400 font-semibold">جاهز</span>
                          )}
                          {src.status === 'pending_conversion' && (
                            <span className="text-amber-700 dark:text-amber-400 font-semibold">بانتظار التحويل الآلي</span>
                          )}
                          {src.status === 'converting' && (
                            <span className="text-blue-700 dark:text-blue-400 font-semibold flex items-center gap-1">
                              <RefreshCw className="w-3 h-3 animate-spin" />
                              جاري التحويل...
                            </span>
                          )}
                          {src.status === 'error' && (
                            <span className="text-red-600 dark:text-red-400 font-semibold">{src.error || 'تعذر التحويل'}</span>
                          )}
                          {src.detectedYears.length > 0 && (
                            <span className="text-slate-400 dark:text-slate-500 truncate tabular-nums">
                              · سنوات: {src.detectedYears.slice(0, 3).join('، ')}
                            </span>
                          )}

                          {src.status === 'ready' && src.outline.length > 0 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedSourceOutlineId((prev) =>
                                  prev === src.id ? null : src.id
                                );
                              }}
                              className={`mr-auto inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-bold cursor-pointer ${
                                activeFilterCount > 0
                                  ? 'bg-blue-600 text-white border-blue-600'
                                  : 'bg-white dark:bg-[#1B202C] text-slate-700 dark:text-slate-200 border-slate-200 dark:border-[#2A3142] hover:border-blue-400'
                              }`}
                              title="استعراض فهرس الدروس لتحديد أو استبعاد دروس معينة"
                            >
                              <ListTree className="w-3 h-3" />
                              <span>
                                الفهرس ({src.outline.length})
                                {activeFilterCount > 0 ? ` · ${activeFilterCount}` : ''}
                              </span>
                              {isOutlineOpen ? (
                                <ChevronUp className="w-3 h-3" />
                              ) : (
                                <ChevronDown className="w-3 h-3" />
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Interactive TOC Lesson / Chapter Filter Drawer */}
                    {isOutlineOpen && src.outline.length > 0 && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="mx-3 mb-2.5 p-2 rounded-lg bg-slate-50 dark:bg-[#10131C] border border-slate-200 dark:border-[#232938] space-y-1.5"
                      >
                        <div className="flex items-center justify-between text-[10px] text-slate-600 dark:text-slate-400 pb-1 border-b border-slate-200 dark:border-[#232938]">
                          <span className="font-bold">انتقاء أو استبعاد الدروس:</span>
                          {activeFilterCount > 0 && (
                            <button
                              type="button"
                              onClick={() =>
                                setManualUnitFilters((prev) => ({
                                  ...prev,
                                  [src.id]: { includeUnits: [], excludeUnits: [] },
                                }))
                              }
                              className="text-blue-600 dark:text-blue-400 hover:underline font-semibold cursor-pointer"
                            >
                              إعادة ضبط
                            </button>
                          )}
                        </div>
                        <div className="max-h-36 overflow-y-auto space-y-1">
                          {src.outline.slice(0, 35).map((entry, idx) => {
                            const isIncluded = unitFilter.includeUnits.includes(entry.heading);
                            const isExcluded = unitFilter.excludeUnits.includes(entry.heading);
                            return (
                              <div
                                key={`${entry.heading}-${idx}`}
                                className="flex items-center justify-between gap-1.5 text-[10px] py-0.5 border-b border-slate-100 dark:border-[#1E2433] last:border-0"
                              >
                                <span
                                  className={`truncate flex-1 ${
                                    isExcluded
                                      ? 'line-through text-slate-400 dark:text-slate-600'
                                      : isIncluded
                                      ? 'font-bold text-blue-700 dark:text-blue-400'
                                      : 'text-slate-700 dark:text-slate-300'
                                  }`}
                                  title={entry.heading}
                                >
                                  {entry.heading}
                                  <span className="text-slate-400 dark:text-slate-500 mr-1 tabular-nums">
                                    (ص {entry.pageNumber})
                                  </span>
                                </span>
                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      toggleLessonUnitState(src.id, entry.heading, 'include')
                                    }
                                    className={`px-1.5 py-0.5 rounded font-bold cursor-pointer ${
                                      isIncluded
                                        ? 'bg-emerald-600 text-white'
                                        : 'bg-white dark:bg-[#1B202C] border border-slate-200 dark:border-[#2A3142] text-slate-600 dark:text-slate-300 hover:border-emerald-400'
                                    }`}
                                    title="تضمين هذا الدرس"
                                  >
                                    ✓
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      toggleLessonUnitState(src.id, entry.heading, 'exclude')
                                    }
                                    className={`px-1.5 py-0.5 rounded font-bold cursor-pointer ${
                                      isExcluded
                                        ? 'bg-red-600 text-white'
                                        : 'bg-white dark:bg-[#1B202C] border border-slate-200 dark:border-[#2A3142] text-slate-600 dark:text-slate-300 hover:border-red-400'
                                    }`}
                                    title="استبعاد هذا الدرس"
                                  >
                                    ✕
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Organization Mode & Repetition Policy */}
          <div className="p-3 border-t border-slate-200 dark:border-[#232938] bg-slate-50/70 dark:bg-[#171B26] space-y-3 shrink-0">
            <div className="space-y-1">
              <span className="block text-[11px] font-bold text-slate-800 dark:text-slate-200">
                نمط الترتيب والهيكلة:
              </span>
              <CustomSelect<OrganizationMode | 'auto'>
                value={organizationModeOverride}
                onChange={setOrganizationModeOverride}
                options={ORGANIZATION_OPTIONS}
                ariaLabel="نمط الترتيب والهيكلة"
                menuPlacement="top"
                size="sm"
                className="w-full"
              />
            </div>

            <div className="space-y-1.5">
              <p className="text-[11px] font-bold text-slate-800 dark:text-slate-200">
                سياسة الأسئلة المتكررة:
              </p>
              <div className="space-y-1.5 text-[11px]">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="repPolicy"
                    checked={repetitionPolicy === 'preserve_across_exams'}
                    onChange={() => setRepetitionPolicy('preserve_across_exams')}
                    className="mt-0.5 accent-blue-600"
                  />
                  <span className="text-slate-600 dark:text-slate-400 leading-snug">
                    <strong className="text-slate-900 dark:text-slate-100">حماية التكرار المفيد:</strong> إبقاء كل امتحان بسياقه دون حذف المشترك.
                  </span>
                </label>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="repPolicy"
                    checked={repetitionPolicy === 'preserve_with_frequency_note'}
                    onChange={() => setRepetitionPolicy('preserve_with_frequency_note')}
                    className="mt-0.5 accent-blue-600"
                  />
                  <span className="text-slate-600 dark:text-slate-400 leading-snug">
                    <strong className="text-slate-900 dark:text-slate-100">حماية مع التوثيق:</strong> الإبقاء مع تدوين سنوات الورود.
                  </span>
                </label>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="repPolicy"
                    checked={repetitionPolicy === 'deduplicate_bank'}
                    onChange={() => setRepetitionPolicy('deduplicate_bank')}
                    className="mt-0.5 accent-blue-600"
                  />
                  <span className="text-slate-600 dark:text-slate-400 leading-snug">
                    <strong className="text-slate-900 dark:text-slate-100">بنك أسئلة موحد:</strong> دمج التكرار المتطابق وجمع المصادر تحته.
                  </span>
                </label>
              </div>
            </div>
          </div>
        </aside>

        {/* Pane 2: Editorial Command & Conversation Thread (44% split on Desktop) */}
        <section
          className={`${
            mobilePane === 'chat' ? 'flex' : 'hidden lg:flex'
          } flex-1 lg:flex-[0.9] min-w-0 bg-white dark:bg-[#141720] border border-slate-200 dark:border-[#232938] rounded-xl flex-col h-[660px] lg:h-full transition-colors overflow-hidden`}
        >
          <div className="px-4 py-2.5 border-b border-slate-200 dark:border-[#232938] bg-slate-50/70 dark:bg-[#171B26] flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <MessageSquareText className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
              <h2 className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                {compiledAnthology ? 'محادثة التحرير والتعديل على المستند' : 'محادثة أوامر الاستخلاص والتجميع'}
              </h2>
            </div>
            {draftHistory.length > 0 && (
              <button
                type="button"
                onClick={handleUndoDraft}
                disabled={isRunning}
                className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 flex items-center gap-1 cursor-pointer disabled:opacity-50 shrink-0"
              >
                <Undo2 className="w-3.5 h-3.5" />
                <span>تراجع ({draftHistory.length})</span>
              </button>
            )}
          </div>

          {/* Messages Stream */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex flex-col ${
                  m.role === 'user' ? 'items-start' : m.role === 'system' ? 'items-center' : 'items-end'
                }`}
              >
                <div
                  className={`max-w-[92%] rounded-xl px-3.5 py-2.5 text-xs sm:text-[13px] leading-relaxed whitespace-pre-wrap ${
                    m.role === 'user'
                      ? 'bg-slate-900 dark:bg-blue-600 text-white'
                      : m.role === 'system'
                      ? 'bg-slate-100 dark:bg-[#1B202C] text-slate-600 dark:text-slate-400 text-[11px] text-center'
                      : 'bg-slate-50 dark:bg-[#171B26] border border-slate-200 dark:border-[#232938] text-slate-800 dark:text-slate-200'
                  }`}
                >
                  {m.text}
                  {m.metaSummary && (
                    <div className="mt-2 pt-2 border-t border-slate-200/80 dark:border-[#2A3142] text-[11px] text-slate-600 dark:text-slate-400 font-semibold tabular-nums">
                      {m.metaSummary}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Live Pipeline Stepper while running */}
            {isRunning && pipelineProgress && (
              <div className="border border-blue-200 dark:border-blue-500/30 bg-blue-50/50 dark:bg-blue-500/10 rounded-xl p-3 space-y-2.5">
                <div className="flex items-center justify-between text-xs font-bold text-blue-900 dark:text-blue-200 tabular-nums">
                  <span className="flex items-center gap-1.5">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600 dark:text-blue-400" />
                    <span>{pipelineProgress.stageLabel}</span>
                  </span>
                  <span>{pipelineProgress.percentage}%</span>
                </div>
                <div className="w-full bg-blue-100 dark:bg-blue-950/60 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-blue-600 dark:bg-blue-400 h-full transition-all duration-300"
                    style={{ width: `${Math.max(5, pipelineProgress.percentage)}%` }}
                  />
                </div>
                <p className="text-[11px] text-blue-800 dark:text-blue-300 leading-relaxed">
                  {pipelineProgress.detailMessage}
                </p>

                <div className="grid grid-cols-5 gap-1 pt-1">
                  {PIPELINE_STEPS_ORDER.map((step, i) => {
                    const currentIdx = PIPELINE_STEPS_ORDER.findIndex(
                      (s) => s.id === pipelineProgress.stage
                    );
                    const done = i < currentIdx;
                    const active = i === currentIdx;
                    return (
                      <div
                        key={step.id}
                        className={`text-center py-1 px-1 rounded text-[9px] font-bold truncate ${
                          done
                            ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300'
                            : active
                            ? 'bg-blue-600 text-white'
                            : 'bg-white dark:bg-[#141720] text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-[#232938]'
                        }`}
                        title={step.label}
                      >
                        {step.label}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Preset Chips + Chat Mode Toggle + Composer */}
          <div className="p-3 border-t border-slate-200 dark:border-[#232938] bg-slate-50/70 dark:bg-[#171B26] space-y-2.5 shrink-0">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1 bg-slate-200/70 dark:bg-[#10131C] p-0.5 rounded-lg text-[10px]">
                <button
                  type="button"
                  onClick={() => setChatActionMode('auto')}
                  className={`px-2.5 py-1 rounded-md font-bold cursor-pointer transition-colors ${
                    chatActionMode === 'auto'
                      ? 'bg-white dark:bg-[#1E2433] text-slate-900 dark:text-slate-100 shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {compiledAnthology ? 'تعديل المخرج' : 'أمر استخراج / تجميع'}
                </button>
                <button
                  type="button"
                  onClick={() => setChatActionMode('ask')}
                  className={`px-2.5 py-1 rounded-md font-bold flex items-center gap-1 cursor-pointer transition-colors ${
                    chatActionMode === 'ask'
                      ? 'bg-white dark:bg-[#1E2433] text-blue-700 dark:text-blue-400 shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  <MessageSquareText className="w-3 h-3" />
                  <span>سؤال عن الفهرس / الملفات</span>
                </button>
              </div>
            </div>

            {!compiledAnthology ? (
              <div className="flex flex-wrap gap-1.5">
                {PROMPT_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    disabled={isRunning}
                    onClick={() => setChatInput(preset.text)}
                    className="text-[10px] font-semibold px-2 py-1 rounded-md bg-white dark:bg-[#141720] border border-slate-200 dark:border-[#2A3142] hover:border-blue-400 dark:hover:border-blue-500 hover:text-blue-700 dark:hover:text-blue-400 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {QUICK_REFINEMENTS.map((cmd) => (
                  <button
                    key={cmd}
                    type="button"
                    disabled={isRunning}
                    onClick={() => handleSendChat(cmd)}
                    className="text-[10px] font-semibold px-2 py-1 rounded-md bg-white dark:bg-[#141720] border border-slate-200 dark:border-[#2A3142] hover:border-blue-400 dark:hover:border-blue-500 hover:text-blue-700 dark:hover:text-blue-400 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
                  >
                    {cmd}
                  </button>
                ))}
              </div>
            )}

            <div className="flex gap-2 items-end">
              <textarea
                rows={2}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendChat();
                  }
                }}
                disabled={isRunning}
                placeholder={
                  chatActionMode === 'ask'
                    ? 'اسأل عن فهرس الدروس، عدد الأسئلة، أو محتوى أي ملف محدد...'
                    : compiledAnthology
                    ? 'اطلب أي تعديل (مثلاً: انقل الإجابات في ملحق، رتب حسب السنة...)'
                    : 'اكتب طلبك (مثلاً: هات أسئلة الكتاب حسب ترتيب الدروس، أو اجمع أسئلة دروس محددة وسيب أخرى)...'
                }
                className="flex-1 text-xs sm:text-[13px] p-2.5 rounded-lg border border-slate-300 dark:border-[#2A3142] bg-white dark:bg-[#10131C] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none leading-relaxed"
              />
              <button
                type="button"
                disabled={isRunning || !chatInput.trim()}
                onClick={() => handleSendChat()}
                className="px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-colors shrink-0 h-[56px]"
              >
                <Send className="w-3.5 h-3.5" />
                <span>
                  {chatActionMode === 'ask' ? 'اسأل' : compiledAnthology ? 'تعديل' : 'تنفيذ'}
                </span>
              </button>
            </div>
          </div>
        </section>

        {/* Pane 3: Live Editorial Document Artifact Canvas (56% split on Desktop) */}
        <section
          className={`${
            mobilePane === 'canvas' ? 'flex' : 'hidden lg:flex'
          } flex-1 lg:flex-[1.2] min-w-0 bg-white dark:bg-[#141720] border border-slate-200 dark:border-[#232938] rounded-xl flex-col h-[660px] lg:h-full transition-colors overflow-hidden`}
        >
          {!compiledAnthology ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-3 bg-slate-50/40 dark:bg-[#10131C]">
              <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-[#1B202C] text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-[#232938] flex items-center justify-center">
                <BookOpen className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                منصة المعاينة والتحرير النهائي
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md leading-relaxed">
                بمجرد إرسال أمر التجميع أو الاستخراج في المحادثة، سيظهر هنا المستند المنسق بالكامل مع تقرير التطابق المجهري وسلامة الرسم العثماني، مع إمكانية التعديل المباشر والتصدير إلى Word و Markdown.
              </p>
            </div>
          ) : (
            <>
              {/* Sticky Artifact Canvas Header + Metrics Strip */}
              <div className="px-4 py-3 border-b border-slate-200 dark:border-[#232938] bg-slate-50/70 dark:bg-[#171B26] space-y-2.5 shrink-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-slate-100 truncate">
                      {compiledAnthology.result.title}
                    </h2>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-1.5 mt-0.5 tabular-nums">
                      <span>{compiledAnthology.sectionCount} قسم</span>
                      <span>·</span>
                      <span>{compiledAnthology.result.totalPages || 1} صفحة</span>
                      <span>·</span>
                      <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                        تطابق مجهري {auditSummary?.wordFidelityRatio ?? 100}%
                      </span>
                      <span>·</span>
                      <span className="text-blue-700 dark:text-blue-400 font-semibold">
                        عثماني {auditSummary?.quranicUthmaniCompliance ?? 100}%
                      </span>
                      {compiledAnthology.repetitionStats.preservedCrossExamRepeats > 0 && (
                        <>
                          <span>·</span>
                          <span>
                            تكرار مفيد محفوظ: {compiledAnthology.repetitionStats.preservedCrossExamRepeats}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Sub-tabs + Secondary Quick Actions */}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1 bg-slate-200/70 dark:bg-[#10131C] p-0.5 rounded-lg text-[11px]">
                    <button
                      type="button"
                      onClick={() => setActiveOutputTab('preview')}
                      className={`px-2.5 py-1 rounded-md font-bold flex items-center gap-1 cursor-pointer transition-colors ${
                        activeOutputTab === 'preview'
                          ? 'bg-white dark:bg-[#1E2433] text-slate-900 dark:text-slate-100 shadow-2xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                      }`}
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>المعاينة المنسقة</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveOutputTab('audit')}
                      className={`px-2.5 py-1 rounded-md font-bold flex items-center gap-1 cursor-pointer transition-colors ${
                        activeOutputTab === 'audit'
                          ? 'bg-white dark:bg-[#1E2433] text-slate-900 dark:text-slate-100 shadow-2xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                      }`}
                    >
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>التدقيق المجهري</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveOutputTab('edit')}
                      className={`px-2.5 py-1 rounded-md font-bold flex items-center gap-1 cursor-pointer transition-colors ${
                        activeOutputTab === 'edit'
                          ? 'bg-white dark:bg-[#1E2433] text-slate-900 dark:text-slate-100 shadow-2xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                      }`}
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>تحرير المصدر</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleSaveAnthologyToHistory}
                      disabled={isSavingToHistory}
                      className="px-2.5 py-1 text-[11px] font-semibold rounded-lg border border-slate-200 dark:border-[#2A3142] bg-white dark:bg-[#1B202C] hover:bg-slate-50 dark:hover:bg-[#232938] text-slate-700 dark:text-slate-200 flex items-center gap-1 cursor-pointer transition-colors"
                      title="حفظ التجميعة في السجل الدائم"
                    >
                      <BookmarkPlus className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                      <span>حفظ</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenInFullViewer(compiledAnthology.result)}
                      className="px-2.5 py-1 text-[11px] font-semibold rounded-lg border border-slate-200 dark:border-[#2A3142] bg-white dark:bg-[#1B202C] hover:bg-slate-50 dark:hover:bg-[#232938] text-slate-700 dark:text-slate-200 flex items-center gap-1 cursor-pointer transition-colors"
                      title="فتح في شاشة العرض الكاملة"
                    >
                      <Maximize2 className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
                      <span>ملء الشاشة</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Output Reading / Editing Body */}
              <div className="flex-1 overflow-y-auto p-5 sm:p-6 bg-[#FCFCFA] dark:bg-[#10131C]">
                {activeOutputTab === 'preview' && (
                  <ErrorBoundary>
                    <article
                      dir={compiledAnthology.result.textDirection}
                      className="prose-custom max-w-[76ch] mx-auto space-y-4 text-sm sm:text-[15px] leading-relaxed font-arabic text-slate-800 dark:text-slate-200"
                    >
                      {renderedPages.map((page, idx) => (
                        <React.Fragment key={idx}>
                          {idx > 0 && (
                            <div className="my-5 flex items-center gap-2 text-[10px] text-slate-400 dark:text-slate-500 font-semibold tabular-nums">
                              <div className="flex-1 h-px bg-slate-200 dark:bg-[#232938]" />
                              <span>فاصل صفحة {idx + 1}</span>
                              <div className="flex-1 h-px bg-slate-200 dark:bg-[#232938]" />
                            </div>
                          )}
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm, remarkMath, remarkInlineHtmlPlugin]}
                            rehypePlugins={[rehypeKatex]}
                          >
                            {page}
                          </ReactMarkdown>
                        </React.Fragment>
                      ))}
                    </article>
                  </ErrorBoundary>
                )}

                {activeOutputTab === 'audit' && (
                  <EmbeddedMicroscopicAuditPanel
                    result={compiledAnthology.result}
                    onApplyMarkdownUpdate={(payload) => {
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
                    }}
                  />
                )}

                {activeOutputTab === 'edit' && (
                  <div className="space-y-3 h-full flex flex-col">
                    <textarea
                      value={manualMarkdown}
                      onChange={(e) => setManualMarkdown(e.target.value)}
                      dir="auto"
                      className="flex-1 min-h-[380px] w-full p-3.5 text-xs font-mono-code rounded-lg border border-slate-300 dark:border-[#2A3142] bg-white dark:bg-[#141720] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 leading-relaxed"
                    />
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={handleApplyManualEdit}
                        className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold cursor-pointer transition-colors"
                      >
                        حفظ التعديل وإعادة التدقيق المجهري
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Publication Export Footer Bar with CustomSelect */}
              <div className="px-4 py-2.5 border-t border-slate-200 dark:border-[#232938] bg-slate-50/80 dark:bg-[#171B26] flex flex-wrap items-center justify-between gap-2 shrink-0">
                <CustomSelect<FontProfileId>
                  value={fontProfile}
                  onChange={setFontProfile}
                  options={FONT_PROFILE_OPTIONS}
                  ariaLabel="نمط الخطوط والطباعة لملف Word"
                  menuPlacement="top"
                  size="sm"
                  className="w-56"
                />

                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleCopyOutput}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#2A3142] bg-white dark:bg-[#1B202C] hover:bg-slate-100 dark:hover:bg-[#232938] text-slate-700 dark:text-slate-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
                    title="نسخ المخرج بصيغة Markdown"
                  >
                    {copiedOutput ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
                    )}
                    <span>{copiedOutput ? 'تم النسخ' : 'نسخ'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleExportPlainText}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#2A3142] bg-white dark:bg-[#1B202C] hover:bg-slate-100 dark:hover:bg-[#232938] text-slate-700 dark:text-slate-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
                    title="تنزيل بصيغة نص عادي (.txt)"
                  >
                    <FileText className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
                    <span>TXT</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleExportMarkdown}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#2A3142] bg-white dark:bg-[#1B202C] hover:bg-slate-100 dark:hover:bg-[#232938] text-slate-700 dark:text-slate-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
                    title="تنزيل بصيغة Markdown (.md)"
                  >
                    <FileCode className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    <span>MD</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleExportWord}
                    disabled={isExportingDocx}
                    className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-400 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    {isExportingDocx ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Download className="w-3.5 h-3.5" />
                    )}
                    <span>Word (.docx)</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
};
