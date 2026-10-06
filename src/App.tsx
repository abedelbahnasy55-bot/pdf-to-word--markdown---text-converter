import { useState, useEffect, useRef } from 'react';
import { Navbar } from './components/Navbar';
import { Dropzone } from './components/Dropzone';
import { ProcessingOverlay } from './components/ProcessingOverlay';
import { OutputViewer } from './components/OutputViewer';
import { HistoryList } from './components/HistoryList';
import { HistoryDrawer } from './components/HistoryDrawer';
import {
  CONVERSION_DEFAULTS,
  ConversionOptions,
  ConversionProgress,
  ConversionResult,
  ConversionResumeState,
  SavedConversion
} from './types';
import { QueuedDocument } from './utils/documentMerger';
import { convertDocumentFile } from './utils/documentConverter';
import { parseDocxFile } from './utils/docxReader';
import { runContextualChecker } from './utils/contextualChecker';
import { runGrammarSyntaxAnalyzer } from './utils/grammarSyntaxAnalyzer';
import { documentStructuralAuditor } from './utils/documentStructuralAuditor';
import { quranicVerificationAgent } from './utils/quranicVerificationAgent';
import { auditAndRestructureLayout } from './utils/layoutIntegrityCore';
import { updateStageList } from './utils/pipelineStages';
import {
  saveToHistory,
  getHistory,
  deleteFromHistory,
  clearHistory,
  markHistoryDownloaded,
  setLastActiveId,
  formatBytes
} from './utils/historyStorage';
import { downloadBatchAsZip } from './utils/batchZipExporter';
import { downloadDocx } from './utils/docxExporter';
import { calculateBatchQueueEta } from './utils/etaCalculator';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileArchive,
  RefreshCw,
  Eye,
  StopCircle,
  FileText,
  Sparkles,
  Plus,
  Clock,
  Layers
} from 'lucide-react';

interface BatchFileItem {
  id: string;
  file: File;
  name: string;
  size: number;
  status: 'pending' | 'processing' | 'done' | 'error';
  progress?: number;
  result?: ConversionResult;
  error?: string;
}

export default function App() {
  const [activeView, setActiveView] = useState<'home' | 'viewer'>('home');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingFileName, setProcessingFileName] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [conversionResult, setConversionResult] = useState<ConversionResult | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState<ConversionProgress | null>(null);
  const [savedItems, setSavedItems] = useState<SavedConversion[]>([]);
  const [isHistoryDrawerOpen, setIsHistoryDrawerOpen] = useState(false);
  const [activeSavedId, setActiveSavedId] = useState<string | null>(null);

  // Unified batch state directly on the home screen
  const [batchQueue, setBatchQueue] = useState<BatchFileItem[] | null>(null);
  const [batchActiveIndex, setBatchActiveIndex] = useState<number>(-1);
  const [isBatchRunning, setIsBatchRunning] = useState<boolean>(false);
  const [isBatchFinished, setIsBatchFinished] = useState<boolean>(false);
  const batchAbortControllerRef = useRef<AbortController | null>(null);
  const batchStartTimeRef = useRef<number | null>(null);
  const [batchElapsedSeconds, setBatchElapsedSeconds] = useState<number>(0);

  // Live timer for batch queue elapsed seconds & real-time ETA countdown
  useEffect(() => {
    let interval: any = null;
    if (isBatchRunning) {
      if (!batchStartTimeRef.current) {
        batchStartTimeRef.current = Date.now();
      }
      interval = setInterval(() => {
        if (batchStartTimeRef.current) {
          setBatchElapsedSeconds(Math.floor((Date.now() - batchStartTimeRef.current) / 1000));
        }
      }, 1000);
    } else {
      batchStartTimeRef.current = null;
      setBatchElapsedSeconds(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isBatchRunning]);

  // Compute live ETA based on remaining files and remaining byte size
  const batchEta = batchQueue && isBatchRunning
    ? calculateBatchQueueEta(batchQueue, batchElapsedSeconds)
    : null;
  const [pausedConversion, setPausedConversion] = useState<{
    file: File;
    error: string;
    isRateLimit: boolean;
    resumeState?: ConversionResumeState;
    partialResult?: ConversionResult;
  } | null>(null);

  const singleFileAbortControllerRef = useRef<AbortController | null>(null);

  /**
   * The single conversion configuration.
   *
   * This was previously user-selectable through a three-way strategy panel. It is
   * now fixed, because the three modes produced visibly different quality and the
   * choice had to be made correctly by someone who could not see the consequence
   * in advance. `direct_text_only` is not the default because it skips the audit
   * pipeline entirely; instead the converter escalates on its own, starting from
   * the cheapest method that can succeed and spending AI quota only where it is
   * actually needed.
   */
  const options: ConversionOptions = CONVERSION_DEFAULTS;

  // Load conversion history on initial mount
  useEffect(() => {
    async function loadSavedHistory() {
      try {
        const items = await getHistory();
        setSavedItems(items);
      } catch (err) {
        console.error('Failed to load history', err);
      }
    }
    loadSavedHistory();
  }, []);

  // Prevent accidental page refresh when there are ongoing processes or uploaded files in queue
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isProcessing || isBatchRunning) {
        e.preventDefault();
        e.returnValue = ''; // Standard way to show warning dialog in modern browsers
      }
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isProcessing, isBatchRunning]);

  const refreshHistoryList = async () => {
    try {
      const items = await getHistory();
      setSavedItems(items);
    } catch (err) {
      console.error('Failed to refresh history', err);
    }
  };

  const handleCancelSingleProcessing = () => {
    if (singleFileAbortControllerRef.current) {
      singleFileAbortControllerRef.current.abort();
      singleFileAbortControllerRef.current = null;
    }
    setPausedConversion(null);
    setIsProcessing(false);
    setProgress(null);
    if (pdfUrl) {
      URL.revokeObjectURL(pdfUrl);
      setPdfUrl(null);
    }
    setErrorMessage(null);
    setActiveView('home');
  };

  const handleResumePausedConversion = () => {
    if (!pausedConversion) return;
    const file = pausedConversion.file;
    const isDocx = file.name.toLowerCase().endsWith('.docx') || file.type.includes('word') || file.type.includes('officedocument');
    if (isDocx) {
      handleDocxSelect(file);
    } else {
      const resume = pausedConversion.resumeState;
      handleFileSelect(file, resume);
    }
  };

  const handleViewPartialResult = () => {
    if (!pausedConversion?.partialResult) return;
    setConversionResult(pausedConversion.partialResult);
    setIsProcessing(false);
    setProgress(null);
    setPausedConversion(null);
    setActiveView('viewer');
  };

  const handleFileSelect = async (file: File, resumeState?: ConversionResumeState) => {
    setErrorMessage(null);
    setPausedConversion(null);
    setIsProcessing(true);
    setProcessingFileName(file.name);

    if (!pdfUrl && (file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf')) {
      const objectUrl = URL.createObjectURL(file);
      setPdfUrl(objectUrl);
    }

    singleFileAbortControllerRef.current = new AbortController();

    try {
      const result = await convertDocumentFile(
        file,
        options,
        (prog) => {
          setProgress(prog);
        },
        singleFileAbortControllerRef.current.signal,
        resumeState
      );

      setConversionResult(result);
      setActiveView('viewer');
      setIsProcessing(false);
      setProgress(null);
      setPausedConversion(null);

      // Save to local persistent database (IndexedDB)
      const saved = await saveToHistory(
        result,
        file.name,
        file.size,
        result.totalPages || 1
      );
      setActiveSavedId(saved.id);
      await refreshHistoryList();
    } catch (err: any) {
      if (err?.name === 'AbortError' || singleFileAbortControllerRef.current?.signal.aborted) {
        console.log('Single file conversion was cancelled by user');
        setIsProcessing(false);
        setProgress(null);
        setPausedConversion(null);
      } else {
        console.error('Conversion paused or failed:', err);
        const isRateLimit = Boolean(
          err?.isRateLimit ||
          err?.message?.includes('Rate limit') ||
          err?.message?.includes('الحد المؤقت')
        );

        let partialRes: ConversionResult | undefined = undefined;
        if (err?.partialMarkdown && err.partialMarkdown.trim()) {
          const isAr = (err.partialMarkdown.match(/[\u0600-\u06FF]/g) || []).length > 20;
          partialRes = {
            title: err.resumeState?.docTitle || file.name.replace(/\.[^/.]+$/, ''),
            detectedLanguage: isAr ? 'العربية' : 'English',
            textDirection: isAr ? 'rtl' : 'ltr',
            hasArabicText: isAr,
            hasMathOrScience: false,
            hasTables: true,
            hasHandwriting: false,
            markdown: err.partialMarkdown,
            plainText: err.partialPlainText || err.partialMarkdown,
            fileName: file.name,
            fileSize: file.size,
            totalPages: err.totalPages || 1,
            totalChunksProcessed: err.lastChunkIndex || 1,
            conversionDurationMs: 0,
            isAutoAudited: false,
          };
        }

        const pausedInfo = {
          file,
          error: err.message || (isRateLimit ? 'تم الوصول إلى الحد المؤقت للطلبات (Rate limit). يرجى الانتظار ثوانٍ قليلة...' : 'حدث توقف مؤقت أثناء المعالجة.'),
          isRateLimit,
          resumeState: err.resumeState,
          partialResult: partialRes,
        };

        setPausedConversion(pausedInfo);
        setProgress((prev) => ({
          currentChunk: err.lastChunkIndex !== undefined ? err.lastChunkIndex + 1 : prev?.currentChunk || 1,
          totalChunks: err.totalChunks || prev?.totalChunks || 1,
          startPage: err.startPage || prev?.startPage || 1,
          endPage: err.endPage || prev?.endPage || 1,
          totalPages: err.totalPages || prev?.totalPages || 1,
          percentage: err.percentage !== undefined ? err.percentage : prev?.percentage || 50,
          phase: 'converting',
          hasPausedError: true,
          pausedErrorMessage: pausedInfo.error,
          processedChunksCount: err.lastChunkIndex !== undefined ? err.lastChunkIndex : prev?.processedChunksCount || 0,
          partialMarkdown: err.partialMarkdown || prev?.partialMarkdown,
        }));
        // Crucial: isProcessing remains TRUE, keeping the user in the overlay with coordinates!
      }
    }
  };

  const playCompletionChime = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.6);
    } catch {}
  };

  const handleStartConversion = (files: File[]) => {
    setErrorMessage(null);
    if (files.length === 0) return;
    if (files.length === 1) {
      const f = files[0];
      const isDocx = f.name.toLowerCase().endsWith('.docx') || f.type.includes('word') || f.type.includes('officedocument');
      if (isDocx) {
        handleDocxSelect(f);
      } else {
        handleFileSelect(f);
      }
    } else {
      handleStartBatchConversion(files);
    }
  };

  const handleStartBatchConversion = async (files: File[]) => {
    setErrorMessage(null);
    const initialItems: BatchFileItem[] = files.map((f, i) => ({
      id: `batch-${Date.now()}-${i}`,
      file: f,
      name: f.name,
      size: f.size,
      status: 'pending',
    }));

    setBatchQueue(initialItems);
    setIsBatchRunning(true);
    setIsBatchFinished(false);
    batchAbortControllerRef.current = new AbortController();

    const completedItems: QueuedDocument[] = [];

    for (let i = 0; i < initialItems.length; i++) {
      if (batchAbortControllerRef.current?.signal.aborted) {
        break;
      }

      setBatchActiveIndex(i);
      setBatchQueue((prev) =>
        prev ? prev.map((item, idx) => (idx === i ? { ...item, status: 'processing', progress: 10 } : item)) : null
      );

      const currentFile = initialItems[i].file;
      const isDocx = currentFile.name.toLowerCase().endsWith('.docx') || currentFile.type.includes('word') || currentFile.type.includes('officedocument');

      try {
        let res: ConversionResult;
        if (isDocx) {
          const parsed = await parseDocxFile(currentFile);
          const contextual = await runContextualChecker(parsed.markdown, currentFile.name);
          const grammar = await runGrammarSyntaxAnalyzer(contextual.correctedMarkdown, currentFile.name);
          const structural = await documentStructuralAuditor(grammar.repairedMarkdown, currentFile.name);
          const quranic = await quranicVerificationAgent(structural.repairedMarkdown);
          const layout = await auditAndRestructureLayout(quranic.verifiedMarkdown);

          res = {
            title: parsed.title || currentFile.name.replace(/\.[^/.]+$/, ''),
            detectedLanguage: 'العربية',
            textDirection: 'rtl',
            hasArabicText: true,
            hasMathOrScience: false,
            hasTables: parsed.tables.length > 0 || layout.restructuredMarkdown.includes('|'),
            hasHandwriting: false,
            markdown: layout.restructuredMarkdown,
            plainText: layout.restructuredMarkdown.replace(/#+\s+/g, ''),
            fileName: currentFile.name,
            fileSize: currentFile.size,
            totalPages: parsed.pageCount || 1,
            totalChunksProcessed: 1,
            conversionDurationMs: 400,
            isAutoAudited: true,
          };
        } else {
          res = await convertDocumentFile(
            currentFile,
            options,
            (prog) => {
              setBatchQueue((prev) =>
                prev ? prev.map((item, idx) => (idx === i ? { ...item, progress: prog.percentage } : item)) : null
              );
            },
            batchAbortControllerRef.current?.signal
          );
        }

        await saveToHistory(res, currentFile.name, currentFile.size, res.totalPages || 1);
        await refreshHistoryList();

        setBatchQueue((prev) =>
          prev ? prev.map((item, idx) => (idx === i ? { ...item, status: 'done', progress: 100, result: res } : item)) : null
        );

        completedItems.push({
          id: initialItems[i].id,
          file: currentFile,
          type: isDocx ? 'docx' : 'pdf',
          name: currentFile.name,
          size: currentFile.size,
          status: 'done',
          result: res,
        });
      } catch (err: any) {
        if (batchAbortControllerRef.current?.signal.aborted) {
          setBatchQueue((prev) =>
            prev ? prev.map((item, idx) => (idx === i ? { ...item, status: 'pending' } : item)) : null
          );
          break;
        }
        console.error(`Batch item error on ${currentFile.name}:`, err);
        setBatchQueue((prev) =>
          prev ? prev.map((item, idx) => (idx === i ? { ...item, status: 'error', error: err?.message || 'تعذر التحويل' } : item)) : null
        );
      }
    }

    setIsBatchRunning(false);
    setIsBatchFinished(true);
    setBatchActiveIndex(-1);

    if (completedItems.length > 0 && !batchAbortControllerRef.current?.signal.aborted) {
      playCompletionChime();
      try {
        await downloadBatchAsZip(completedItems);
      } catch (zipErr) {
        console.warn('Auto zip download warning:', zipErr);
      }
    }
  };

  const handleStopBatch = () => {
    if (batchAbortControllerRef.current) {
      batchAbortControllerRef.current.abort();
      batchAbortControllerRef.current = null;
    }
    setIsBatchRunning(false);
  };

  const handleResetBatch = () => {
    setBatchQueue(null);
    setIsBatchRunning(false);
    setIsBatchFinished(false);
    setBatchActiveIndex(-1);
  };

  const handleDownloadBatchZip = async () => {
    if (!batchQueue) return;
    const completed: QueuedDocument[] = batchQueue
      .filter((item) => item.status === 'done' && item.result)
      .map((item) => ({
        id: item.id,
        file: item.file,
        type: item.file.name.toLowerCase().endsWith('.docx') ? 'docx' : 'pdf',
        name: item.name,
        size: item.size,
        status: 'done',
        result: item.result,
      }));
    if (completed.length > 0) {
      await downloadBatchAsZip(completed);
    }
  };

  const handleDownloadSingleDocx = async (res: ConversionResult, fileName: string) => {
    const isRtl = res.textDirection === 'rtl' || Boolean(res.hasArabicText);
    const baseName = fileName.replace(/\.[^/.]+$/, '');
    await downloadDocx(
      {
        title: res.title || baseName,
        markdown: res.markdown,
        isRtl,
      },
      `${baseName}.docx`
    );
  };

  const handleViewBatchItemResult = (res: ConversionResult) => {
    setConversionResult(res);
    setActiveView('viewer');
  };

  const handleRetryBatchItem = async (itemId: string) => {
    if (!batchQueue) return;
    const targetItem = batchQueue.find((it) => it.id === itemId);
    if (!targetItem) return;

    setBatchQueue((prev) =>
      prev ? prev.map((it) => (it.id === itemId ? { ...it, status: 'processing', progress: 15, error: undefined } : it)) : null
    );

    try {
      const res = await convertDocumentFile(
        targetItem.file,
        options,
        (prog) => {
          setBatchQueue((prev) =>
            prev ? prev.map((it) => (it.id === itemId ? { ...it, progress: prog.percentage } : it)) : null
          );
        }
      );

      setBatchQueue((prev) =>
        prev ? prev.map((it) => (it.id === itemId ? { ...it, status: 'done', progress: 100, result: res } : it)) : null
      );
      await saveToHistory(res, targetItem.name, targetItem.size, res.totalPages || 1);
      await refreshHistoryList();
    } catch (err: any) {
      setBatchQueue((prev) =>
        prev ? prev.map((it) => (it.id === itemId ? { ...it, status: 'error', error: err?.message || 'تعذر التحويل' } : it)) : null
      );
    }
  };

  const handleRetryAllFailed = async () => {
    if (!batchQueue) return;
    const failedItems = batchQueue.filter((it) => it.status === 'error');
    for (const item of failedItems) {
      await handleRetryBatchItem(item.id);
    }
  };

  const handleDocxSelect = async (file: File) => {
    setErrorMessage(null);
    setPausedConversion(null);
    setIsProcessing(true);
    setProcessingFileName(file.name);
    setPdfUrl(null);
    singleFileAbortControllerRef.current = new AbortController();

    setProgress({
      currentChunk: 1,
      totalChunks: 1,
      startPage: 1,
      endPage: 1,
      totalPages: 1,
      percentage: 20,
      phase: 'reading',
      activeStage: 'extraction',
      stages: updateStageList('extraction', 60),
      statusMessage: 'المرحلة 1: جاري قراءة واستخراج المحتوى والجداول بدقة تامة...',
    });

    let currentExtractedMarkdown = '';

    try {
      const extracted = await parseDocxFile(file);
      currentExtractedMarkdown = extracted.markdown;
      if (singleFileAbortControllerRef.current?.signal.aborted) throw new DOMException('تم إلغاء عملية الفحص', 'AbortError');
      
      // Stage 2: AI Contextual Checker (Cross-reference verses and Hadiths against reference canonical corpus)
      setProgress({
        currentChunk: 1,
        totalChunks: 1,
        startPage: 1,
        endPage: 1,
        totalPages: 1,
        percentage: 55,
        phase: 'converting',
        activeStage: 'contextual',
        stages: updateStageList('contextual', 60),
        statusMessage: 'المرحلة 2: الفحص السياقي الذكي للآيات والأحاديث (Contextual Checker)...',
      });

      const contextualResult = await runContextualChecker(extracted.markdown, file.name);
      if (singleFileAbortControllerRef.current?.signal.aborted) throw new DOMException('تم إلغاء عملية الفحص', 'AbortError');

      // Stage 3: Grammar & Syntax Analyzer (التحليل النحوي: فحص الجمل المفتوحة والبتر المفاجئ وتوقع التكملات)
      setProgress({
        currentChunk: 1,
        totalChunks: 1,
        startPage: 1,
        endPage: 1,
        totalPages: 1,
        percentage: 80,
        phase: 'converting',
        activeStage: 'grammar',
        stages: updateStageList('grammar', 65),
        statusMessage: 'المرحلة 3: التحليل النحوي وتوقع الجمل المفتوحة والبتر المفاجئ (Grammar Analyzer)...',
      });

      const grammarAnalysis = await runGrammarSyntaxAnalyzer(contextualResult.correctedMarkdown, file.name);
      if (singleFileAbortControllerRef.current?.signal.aborted) throw new DOMException('تم إلغاء عملية الفحص', 'AbortError');

      // Stage 4: Document Structural Auditor (التدقيق الهيكلي ومطابقة الترقيم والهوامش والعناوين)
      setProgress({
        currentChunk: 1,
        totalChunks: 1,
        startPage: 1,
        endPage: 1,
        totalPages: 1,
        percentage: 88,
        phase: 'converting',
        activeStage: 'structural',
        stages: updateStageList('structural', 85),
        statusMessage: 'المرحلة 4: التدقيق الهيكلي ومطابقة الترقيم والهوامش والعناوين (Structural Auditor)...',
      });

      const structuralAnalysis = await documentStructuralAuditor(grammarAnalysis.repairedMarkdown, file.name);
      if (singleFileAbortControllerRef.current?.signal.aborted) throw new DOMException('تم إلغاء عملية الفحص', 'AbortError');

      // Stage 5: Quranic Verification Agent (التحقق القرآني بالرسم العثماني المعتمد لضمان دقة 100%)
      setProgress({
        currentChunk: 1,
        totalChunks: 1,
        startPage: 1,
        endPage: 1,
        totalPages: 1,
        percentage: 94,
        phase: 'converting',
        activeStage: 'quranic_verification',
        stages: updateStageList('quranic_verification', 92),
        statusMessage: 'المرحلة 5: التحقق القرآني ومطابقة الآيات بالرسم العثماني المعتمد...',
      });

      const quranicVerification = await quranicVerificationAgent(structuralAnalysis.repairedMarkdown);
      if (singleFileAbortControllerRef.current?.signal.aborted) throw new DOMException('تم إلغاء عملية الفحص', 'AbortError');

      // Stage 6: Layout Integrity Engine (معايرة وهيكلة الصفحات والجداول وتثبيت اتجاه RTL)
      setProgress({
        currentChunk: 1,
        totalChunks: 1,
        startPage: 1,
        endPage: 1,
        totalPages: 1,
        percentage: 96,
        phase: 'converting',
        activeStage: 'layout_integrity',
        stages: updateStageList('layout_integrity', 95),
        statusMessage: 'المرحلة 6: معايرة وهيكلة الصفحات والجداول وتثبيت اتجاه RTL (Layout Integrity Engine)...',
      });

      const layoutAnalysis = await auditAndRestructureLayout(quranicVerification.verifiedMarkdown);
      if (singleFileAbortControllerRef.current?.signal.aborted) throw new DOMException('تم إلغاء عملية الفحص', 'AbortError');
      const finalMarkdown = layoutAnalysis.restructuredMarkdown;

      // Stage 7: Finalizing
      setProgress({
        currentChunk: 1,
        totalChunks: 1,
        startPage: 1,
        endPage: 1,
        totalPages: 1,
        percentage: 98,
        phase: 'merging',
        activeStage: 'finalizing',
        stages: updateStageList('finalizing', 98),
        statusMessage: 'المرحلة 7: الضبط النهائي بالمسطرة وتجهيز مستند Word المعتمد للتنزيل...',
      });

      const isArabic = (finalMarkdown.match(/[\u0600-\u06FF]/g) || []).length > 20;

      const cleanPlainText = finalMarkdown
        .replace(/^---\s*$/gm, '\n------------------------\n')
        .replace(/\\text\{([^\}]+)\}/g, '$1')
        .replace(/^#+\s+/gm, '')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/_([^_]+)_/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\$\$?([^\$]+)\$\$?/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/^\s*[-*+]\s+/gm, '• ')
        .trim();

      const result: ConversionResult = {
        title: extracted.title || file.name.replace(/\.docx$/i, ''),
        detectedLanguage: isArabic ? 'العربية' : 'English',
        textDirection: isArabic ? 'rtl' : 'ltr',
        hasArabicText: isArabic,
        hasMathOrScience: false,
        hasTables: extracted.tables.length > 0 || finalMarkdown.includes('|'),
        hasHandwriting: false,
        markdown: finalMarkdown,
        plainText: cleanPlainText,
        fileName: file.name,
        fileSize: file.size,
        totalPages: extracted.pageCount || 1,
        totalChunksProcessed: 1,
        conversionDurationMs: 400,
        isAutoAudited: true,
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

      setConversionResult(result);
      setActiveView('viewer');
      setIsProcessing(false);
      setProgress(null);
      setPausedConversion(null);

      const saved = await saveToHistory(result, file.name, file.size, extracted.pageCount || 1);
      setActiveSavedId(saved.id);
      await refreshHistoryList();
    } catch (err: any) {
      if (err?.name === 'AbortError' || singleFileAbortControllerRef.current?.signal.aborted) {
        console.log('Docx processing was cancelled by user');
        setIsProcessing(false);
        setProgress(null);
        setPausedConversion(null);
      } else {
        console.error('Failed to parse docx or paused:', err);
        const isRateLimit = Boolean(
          err?.isRateLimit ||
          err?.message?.includes('Rate limit') ||
          err?.message?.includes('الحد المؤقت')
        );

        let partialRes: ConversionResult | undefined = undefined;
        if (currentExtractedMarkdown && currentExtractedMarkdown.trim()) {
          const isAr = (currentExtractedMarkdown.match(/[\u0600-\u06FF]/g) || []).length > 20;
          partialRes = {
            title: file.name.replace(/\.[^/.]+$/, ''),
            detectedLanguage: isAr ? 'العربية' : 'English',
            textDirection: isAr ? 'rtl' : 'ltr',
            hasArabicText: isAr,
            hasMathOrScience: false,
            hasTables: true,
            hasHandwriting: false,
            markdown: currentExtractedMarkdown,
            plainText: currentExtractedMarkdown,
            fileName: file.name,
            fileSize: file.size,
            totalPages: 1,
            totalChunksProcessed: 1,
            conversionDurationMs: 0,
            isAutoAudited: false,
          };
        }

        const pausedInfo = {
          file,
          error: err.message || (isRateLimit ? 'تم الوصول إلى الحد المؤقت للطلبات (Rate limit). يرجى الانتظار ثوانٍ قليلة...' : 'حدث توقف مؤقت أثناء فحص ومعالجة ملف الوورد.'),
          isRateLimit,
          partialResult: partialRes,
        };

        setPausedConversion(pausedInfo);
        setProgress((prev) => ({
          currentChunk: 1,
          totalChunks: 1,
          startPage: 1,
          endPage: 1,
          totalPages: 1,
          percentage: prev?.percentage || 50,
          phase: 'converting',
          activeStage: prev?.activeStage || 'contextual',
          hasPausedError: true,
          pausedErrorMessage: pausedInfo.error,
          processedChunksCount: 0,
          partialMarkdown: currentExtractedMarkdown || prev?.partialMarkdown,
          statusMessage: pausedInfo.error,
        }));
        // CRUCIAL: isProcessing remains TRUE, keeping the user in the overlay with coordinates!
      }
    }
  };

  const handleSelectSavedItem = (item: SavedConversion) => {
    setErrorMessage(null);
    setProcessingFileName(item.fileName);
    setConversionResult(item.result);
    setPdfUrl(null);
    setActiveSavedId(item.id);
    setLastActiveId(item.id);
    setActiveView('viewer');
  };

  const handleDeleteSavedItem = async (id: string) => {
    await deleteFromHistory(id);
    if (activeSavedId === id) {
      setActiveSavedId(null);
    }
    await refreshHistoryList();
  };

  const handleClearAllHistory = async () => {
    if (window.confirm('هل أنت متأكد من رغبتك في مسح كافة الملفات المحفوظة من السجل؟')) {
      await clearHistory();
      setActiveSavedId(null);
      await refreshHistoryList();
    }
  };

  const handleMarkDownloaded = async (id: string) => {
    await markHistoryDownloaded(id);
    await refreshHistoryList();
  };

  const handleDownloadSuccess = async () => {
    if (activeSavedId) {
      await markHistoryDownloaded(activeSavedId);
      await refreshHistoryList();
    }
  };

  const handleResetToNew = () => {
    if (pdfUrl) {
      URL.revokeObjectURL(pdfUrl);
    }
    setConversionResult(null);
    setPdfUrl(null);
    setErrorMessage(null);
    setProcessingFileName('');
    setProgress(null);
    setActiveSavedId(null);
    setLastActiveId(null);
    setActiveView('home');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <Navbar
        hasResult={activeView === 'viewer'}
        onReset={handleResetToNew}
        savedCount={savedItems.length}
        onOpenHistory={() => setIsHistoryDrawerOpen(true)}
      />

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-10 flex flex-col justify-center">
        {/* Error message */}
        {errorMessage && (
          <div className="max-w-2xl mx-auto w-full mb-6 p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 flex items-start gap-3 shadow-xs">
            <AlertCircle className="w-5 h-5 shrink-0 text-red-500 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold text-sm">تعذر التحويل</p>
              <p className="text-xs text-red-600 leading-relaxed">{errorMessage}</p>
            </div>
          </div>
        )}

        {/* State 1: Single file Processing Loader */}
        {isProcessing && (
          <ProcessingOverlay
            fileName={processingFileName}
            progress={progress}
            onCancel={handleCancelSingleProcessing}
            isPausedError={Boolean(pausedConversion)}
            pausedErrorMessage={pausedConversion?.error}
            onRetryResume={pausedConversion ? handleResumePausedConversion : undefined}
            onViewPartialResult={pausedConversion?.partialResult ? handleViewPartialResult : undefined}
          />
        )}

        {/* State 2: Conversion Results */}
        {!isProcessing && activeView === 'viewer' && conversionResult && (
          <OutputViewer
            result={conversionResult}
            onUpdateResult={(updated) => {
              setConversionResult(updated);
            }}
            onDownloadSuccess={handleDownloadSuccess}
            onBackToBatch={batchQueue && isBatchFinished ? () => setActiveView('home') : undefined}
            batchCount={batchQueue?.filter((b) => b.status === 'done').length || 0}
          />
        )}

        {/* State 3: Home View (Unified Simple Upload + In-place Batch Status + History) */}
        {!isProcessing && activeView === 'home' && (
          <div className="space-y-6">
            <div className="text-center space-y-1 max-w-xl mx-auto">
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                تفريغ وتحويل PDF والصور إلى Word ونصوص بدقة تامة
              </h2>
              <p className="text-xs sm:text-sm text-slate-500">
                ارفع ملفاً واحداً أو عدة ملفات (2، 5، 10...) لتحويلها بالتتابع إلى مستندات Word منسقة مع اتجاه اليمين لليسار
              </p>
            </div>

            {/* If Batch Queue is active: Render the clean in-place batch status & download card */}
            {batchQueue && (isBatchRunning || isBatchFinished) ? (
              <div className="bg-white border-2 border-blue-500/80 rounded-3xl p-5 sm:p-7 shadow-lg space-y-5 animate-fadeIn">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                  <div>
                    <div className="flex items-center gap-2">
                      {isBatchRunning ? (
                        <span className="px-2.5 py-1 rounded-full bg-blue-100 text-blue-800 text-xs font-bold flex items-center gap-1.5 animate-pulse">
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>جاري التحويل المتتالي ({batchActiveIndex + 1} من {batchQueue.length})</span>
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span>اكتملت معالجة كافة الملفات بنجاح</span>
                        </span>
                      )}
                      <span className="text-xs text-slate-500 font-semibold">
                        {batchQueue.filter((b) => b.status === 'done').length} من {batchQueue.length} مكتمل
                      </span>
                    </div>
                    <h3 className="text-base sm:text-lg font-extrabold text-slate-900 mt-1">
                      {isBatchRunning ? 'المعالجة التلقائية جارية بالتتابع...' : 'ملفات Word الجاهزة للتحميل'}
                    </h3>
                  </div>

                  {isBatchRunning ? (
                    <button
                      type="button"
                      onClick={handleStopBatch}
                      className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 border border-red-200 cursor-pointer self-start sm:self-auto"
                    >
                      <StopCircle className="w-4 h-4" />
                      <span>إلغاء المعالجة</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleResetBatch}
                      className="px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
                    >
                      <Plus className="w-4 h-4" />
                      <span>تحويل ملفات أخرى</span>
                    </button>
                  )}
                </div>

                {/* Overall Batch Progress Bar & Estimated Remaining Time Bar */}
                {isBatchRunning && batchEta && (
                  <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-blue-50/90 via-indigo-50/60 to-slate-50 border border-blue-200 shadow-xs space-y-3 animate-fadeIn">
                    {/* Upper row: Progress percentage on one side, Estimated remaining time bar on the other */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      {/* Left: Overall Progress Info */}
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs shrink-0">
                          <Layers className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-700">شريط التقدم الإجمالي:</span>
                            <span className="text-blue-700 font-black text-sm">{batchEta.overallPercentage}%</span>
                          </div>
                          <p className="text-[11px] text-slate-500 font-medium">
                            أُنجز {batchEta.completedFiles} من أصل {batchEta.totalFiles} ملفات ({formatBytes(batchEta.processedBytes)} من {formatBytes(batchEta.totalBytes)})
                          </p>
                        </div>
                      </div>

                      {/* Right: Estimated Remaining Time (ETA) Indicator */}
                      <div className="flex items-center gap-2 bg-white/95 py-2 px-3.5 rounded-xl border border-blue-200/80 shadow-2xs self-start sm:self-auto">
                        <Clock className="w-4 h-4 text-blue-600 animate-spin shrink-0" />
                        <div className="text-right">
                          <div className="flex items-center gap-1.5 text-xs">
                            <span className="font-bold text-slate-600">الوقت المتوقع المتبقي:</span>
                            <span className="font-black text-blue-900 bg-blue-100/80 px-2 py-0.5 rounded-md font-mono text-xs">
                              {batchEta.formattedEta}
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-400 block font-medium mt-0.5">
                            بناءً على ({batchEta.remainingFiles} ملفات متبقية • {formatBytes(batchEta.remainingBytes)})
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Progress Bar Track */}
                    <div className="space-y-1.5">
                      <div className="w-full bg-slate-200/80 rounded-full h-3.5 overflow-hidden p-0.5 border border-slate-300/70 shadow-inner">
                        <div
                          className="bg-gradient-to-r from-blue-600 via-indigo-600 to-emerald-500 h-full rounded-full transition-all duration-500 ease-out shadow-xs relative"
                          style={{ width: `${Math.max(4, batchEta.overallPercentage)}%` }}
                        >
                          <div className="absolute inset-0 bg-white/25 animate-pulse rounded-full" />
                        </div>
                      </div>

                      {/* Footer stats under bar */}
                      <div className="flex justify-between items-center text-[10px] text-slate-500 font-mono px-0.5">
                        <span>سرعة المعالجة: <strong className="text-slate-700">{batchEta.speedFormatted}</strong></span>
                        <span>الحجم المتبقي في الطابور: <strong className="text-slate-700">{formatBytes(batchEta.remainingBytes)}</strong></span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Big Hero ZIP Download Banner when finished */}
                {isBatchFinished && batchQueue.some((b) => b.status === 'done') && (
                  <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 rounded-2xl p-4 sm:p-5 text-white shadow-md flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="space-y-1 text-center sm:text-right">
                      <div className="flex items-center justify-center sm:justify-start gap-2">
                        <Sparkles className="w-4 h-4 text-emerald-200" />
                        <span className="font-extrabold text-sm sm:text-base">
                          باكدج الـ Word جاهز للتنزيل المباشر
                        </span>
                      </div>
                      <p className="text-xs text-emerald-100">
                        يحتوي الأرشيف على كافة ملفات Word (.docx) منسقة باتجاه RTL مع مطابقة تامة للصفحات والجداول
                      </p>
                    </div>
                    <button
                      id="btn-download-batch-zip-main"
                      type="button"
                      onClick={handleDownloadBatchZip}
                      className="w-full sm:w-auto px-6 py-3 bg-white hover:bg-emerald-50 text-emerald-950 font-black text-xs sm:text-sm rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer shrink-0"
                    >
                      <FileArchive className="w-4 h-4 text-emerald-700" />
                      <span>تنزيل باكدج Word كامل (.ZIP)</span>
                    </button>
                  </div>
                )}

                {/* Retry All Failed Banner */}
                {batchQueue.some((b) => b.status === 'error') && !isBatchRunning && (
                  <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-right flex flex-col sm:flex-row items-center justify-between gap-3 shadow-2xs">
                    <div className="flex items-center gap-2 text-amber-900 text-xs font-bold">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>توجد ملفات لم يكتمل تحويلها. يمكنك إعادة محاولة تحويلها:</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleRetryAllFailed()}
                        className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>إعادة محاولة الكل</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Files List */}
                <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                  {batchQueue.map((item) => (
                    <div
                      key={item.id}
                      className={`p-3.5 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        item.status === 'processing'
                          ? 'bg-blue-50/60 border-blue-300 ring-2 ring-blue-500/20'
                          : item.status === 'done'
                          ? 'bg-emerald-50/40 border-emerald-200'
                          : item.status === 'error'
                          ? 'bg-red-50/40 border-red-200'
                          : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-2xs ${
                            item.status === 'done'
                              ? 'bg-emerald-100 text-emerald-700'
                              : item.status === 'processing'
                              ? 'bg-blue-100 text-blue-700'
                              : item.status === 'error'
                              ? 'bg-red-100 text-red-600'
                              : 'bg-white text-slate-600 border border-slate-200'
                          }`}
                        >
                          {item.status === 'done' ? (
                            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                          ) : item.status === 'processing' ? (
                            <RefreshCw className="w-5 h-5 animate-spin text-blue-600" />
                          ) : (
                            <FileText className="w-5 h-5" />
                          )}
                        </div>

                        <div className="min-w-0">
                          <p className="text-xs sm:text-sm font-bold text-slate-900 truncate" title={item.name}>
                            {item.name}
                          </p>
                          <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                            <span>{formatBytes(item.size)}</span>
                            <span>•</span>
                            {item.status === 'done' && (
                              <span className="text-emerald-700 font-bold">
                                اكتمل ({item.result?.totalPages || 1} صفحة)
                              </span>
                            )}
                            {item.status === 'processing' && (
                              <span className="text-blue-700 font-bold">
                                جاري التحويل... {item.progress ? `(${item.progress}%)` : ''}
                              </span>
                            )}
                            {item.status === 'pending' && <span className="text-slate-400">في الانتظار</span>}
                            {item.status === 'error' && (
                              <span className="text-red-600 font-semibold">{item.error || 'تعذر التحويل'}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Action buttons per file */}
                      {item.status === 'done' && item.result && (
                        <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                          <button
                            type="button"
                            onClick={() => handleDownloadSingleDocx(item.result!, item.name)}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                            title="تنزيل ملف Word منفصل"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>تنزيل Word</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleViewBatchItemResult(item.result!)}
                            className="px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-xl border border-slate-200 transition-colors flex items-center gap-1 cursor-pointer"
                            title="معاينة محتوى المستند"
                          >
                            <Eye className="w-3.5 h-3.5 text-slate-600" />
                            <span>معاينة</span>
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <Dropzone
                onStartConversion={handleStartConversion}
                isProcessing={isProcessing}
              />
            )}

            {/* Previously Saved Files List */}
            <HistoryList
              items={savedItems}
              onSelect={handleSelectSavedItem}
              onDelete={handleDeleteSavedItem}
              onClearAll={handleClearAllHistory}
              onMarkDownloaded={handleMarkDownloaded}
            />
          </div>
        )}
      </main>

      {/* History Drawer Modal */}
      <HistoryDrawer
        isOpen={isHistoryDrawerOpen}
        onClose={() => setIsHistoryDrawerOpen(false)}
        items={savedItems}
        onSelect={handleSelectSavedItem}
        onDelete={handleDeleteSavedItem}
        onClearAll={handleClearAllHistory}
        onMarkDownloaded={handleMarkDownloaded}
      />
    </div>
  );
}

