import { useState, useEffect, useRef, useCallback } from 'react';
import { safeDownloadText } from './utils/fileDownloader';
import { Navbar } from './components/Navbar';
import { Dropzone } from './components/Dropzone';
import { ProcessingOverlay } from './components/ProcessingOverlay';
import { OutputViewer } from './components/OutputViewer';
import { HistoryList } from './components/HistoryList';
import { HistoryDrawer } from './components/HistoryDrawer';
import { AgentCliHubPage } from './components/AgentCliHubPage';
import { SmartCompilerWorkspace } from './components/SmartCompilerWorkspace';
import { TeamAccessGate } from './components/TeamAccessGate';
import { TeamShareModal, type TeamAuthStatusState } from './components/TeamShareModal';
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
import {
  saveToHistory,
  getHistory,
  deleteFromHistory,
  clearHistory,
  markHistoryDownloaded,
  setLastActiveId,
  formatBytes,
  saveBatchSession,
  getBatchSession,
  clearBatchSession,
  markBatchItemDownloadedInSession
} from './utils/historyStorage';
import { downloadBatchAsZip } from './utils/batchZipExporter';
import { downloadDocx } from './utils/docxExporter';
import { useTheme } from './utils/theme';
import { apiFetch } from './utils/apiClient';
import { useConnectionKeepAlive } from './utils/connectionKeepAlive';
import {
  BatchEtaInfo,
  StableBatchEtaState,
  calculateStableBatchEta,
  formatEtaArabic,
} from './utils/etaCalculator';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  RefreshCw,
  Eye,
  StopCircle,
  FileText,
  Plus,
  Clock,
  Layers,
  Trash2,
  X,
  UploadCloud,
  ArrowDownToLine,
  Check,
  Search,
  Play,
  Pause,
  FolderDown
} from 'lucide-react';

interface ServerJobMeta {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  status: 'queued' | 'running' | 'completed' | 'paused' | 'failed';
  createdAt: number;
  updatedAt: number;
  startedAt?: number;
  completedAt?: number;
  totalPages: number;
  completedPages: number;
  digitalPages: number;
  ocrPages: number;
  currentPageRange?: string;
  completedBatches: number;
  totalBatches: number;
  currentPhaseLabel: string;
  percentage: number;
  etaSeconds: number | null;
  errorMessage?: string;
  direction: 'auto' | 'rtl' | 'ltr';
  title: string;
}

interface BatchFileItem {
  id: string;
  file: File;
  name: string;
  size: number;
  status: 'pending' | 'processing' | 'done' | 'error';
  progress?: number;
  result?: ConversionResult;
  error?: string;
  retryCount?: number;
  resumeState?: ConversionResumeState;
  options?: ConversionOptions;
  statusMessage?: string;
  isDownloaded?: boolean;
  lastUpdatedAt?: number;
}

function formatRelativeTime(timestamp?: number, now: number = Date.now()): string {
  if (!timestamp) return 'منذ لحظات';
  const diffSec = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (diffSec < 10) return 'منذ لحظات';
  if (diffSec < 60) return `منذ ${diffSec} ثانية`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin === 1) return 'منذ دقيقة واحدة';
  if (diffMin === 2) return 'منذ دقيقتين';
  if (diffMin >= 3 && diffMin <= 10) return `منذ ${diffMin} دقائق`;
  if (diffMin < 60) return `منذ ${diffMin} دقيقة`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours === 1) return 'منذ ساعة';
  if (diffHours === 2) return 'منذ ساعتين';
  if (diffHours >= 3 && diffHours <= 10) return `منذ ${diffHours} ساعات`;
  if (diffHours < 24) return `منذ ${diffHours} ساعة`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'منذ يوم';
  if (diffDays === 2) return 'منذ يومين';
  if (diffDays >= 3 && diffDays <= 10) return `منذ ${diffDays} أيام`;
  return `منذ ${diffDays} يوماً`;
}

export default function App() {
  const { theme, toggleTheme } = useTheme();
  const [activeView, setActiveView] = useState<'home' | 'viewer' | 'agent-hub' | 'compiler'>('home');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingFileName, setProcessingFileName] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [conversionResult, setConversionResult] = useState<ConversionResult | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState<ConversionProgress | null>(null);
  const [savedItems, setSavedItems] = useState<SavedConversion[]>([]);
  const [isHistoryDrawerOpen, setIsHistoryDrawerOpen] = useState(false);
  const [activeSavedId, setActiveSavedId] = useState<string | null>(null);

  // Team Access Lock & Public Share state
  const [authStatus, setAuthStatus] = useState<TeamAuthStatusState | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isTeamShareOpen, setIsTeamShareOpen] = useState(false);

  // Server-side persistent background jobs (continue even when tab/browser/device closes)
  const [serverJobs, setServerJobs] = useState<ServerJobMeta[]>([]);
  const [loadingServerJobId, setLoadingServerJobId] = useState<string | null>(null);
  const syncedServerJobIdsRef = useRef<Set<string>>(
    (() => {
      try {
        const raw = localStorage.getItem('synced_server_job_ids');
        return new Set<string>(raw ? JSON.parse(raw) : []);
      } catch {
        return new Set<string>();
      }
    })()
  );

  // Unified batch state directly on the home screen
  const [batchQueue, setBatchQueue] = useState<BatchFileItem[] | null>(null);
  const [isBatchRunning, setIsBatchRunning] = useState<boolean>(false);
  const [isBatchFinished, setIsBatchFinished] = useState<boolean>(false);
  const [autoRetryBatch, setAutoRetryBatch] = useState<boolean>(true);
  const autoRetryBatchRef = useRef<boolean>(true);
  useEffect(() => {
    autoRetryBatchRef.current = autoRetryBatch;
  }, [autoRetryBatch]);

  // Queue references for concurrent/dynamic file additions while converting
  const queuePendingItemsRef = useRef<BatchFileItem[]>([]);
  const queueCompletedItemsRef = useRef<QueuedDocument[]>([]);
  const isQueueProcessingRef = useRef<boolean>(false);
  const addMoreFilesInputRef = useRef<HTMLInputElement>(null);
  const [isBatchDragOver, setIsBatchDragOver] = useState(false);
  const [justAddedCount, setJustAddedCount] = useState<number | null>(null);
  const [notificationMessage, setNotificationMessage] = useState<string | null>(null);
  const [batchFilterTab, setBatchFilterTab] = useState<'all' | 'done' | 'undownloaded' | 'pending' | 'error'>('all');
  const [batchSearchQuery, setBatchSearchQuery] = useState<string>('');
  const [zipIncludeSources, setZipIncludeSources] = useState<boolean>(true);

  const batchAbortControllerRef = useRef<AbortController | null>(null);
  const batchStartTimeRef = useRef<number | null>(null);
  const [batchElapsedSeconds, setBatchElapsedSeconds] = useState<number>(0);

  // Live clock state to keep relative time badges updated every 10 seconds
  const [nowTimestamp, setNowTimestamp] = useState<number>(Date.now());
  useEffect(() => {
    const timer = setInterval(() => {
      setNowTimestamp(Date.now());
    }, 10000);
    return () => clearInterval(timer);
  }, []);

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

  // Debounce saving batch session to IndexedDB so rapid progress updates never choke memory
  const lastSavedSignatureRef = useRef<string>('');
  useEffect(() => {
    if (!batchQueue || batchQueue.length === 0) return;

    // Detect structural status changes vs minor progress percent ticks
    const signature = batchQueue.map((it) => `${it.id}:${it.status}:${it.isDownloaded ? 1 : 0}`).join('|');
    const isStatusTransition = signature !== lastSavedSignatureRef.current;
    if (!isStatusTransition) {
      return;
    }

    const timer = setTimeout(() => {
      lastSavedSignatureRef.current = signature;
      saveBatchSession(batchQueue).catch(() => {});
    }, 400);

    return () => clearTimeout(timer);
  }, [batchQueue]);

  // Compute live smoothed & monotonic ETA based on remaining files, byte size, and observed progress
  const stableEtaStateRef = useRef<StableBatchEtaState | null>(null);
  const [batchEta, setBatchEta] = useState<BatchEtaInfo | null>(null);

  useEffect(() => {
    if (!isBatchRunning || !batchQueue || batchQueue.length === 0) {
      stableEtaStateRef.current = null;
      setBatchEta(null);
      return;
    }
    const { eta, nextState } = calculateStableBatchEta(
      batchQueue,
      batchElapsedSeconds,
      stableEtaStateRef.current
    );
    stableEtaStateRef.current = nextState;
    setBatchEta(eta);
  }, [batchQueue, batchElapsedSeconds, isBatchRunning]);
  const [pausedConversion, setPausedConversion] = useState<{
    file: File;
    error: string;
    isRateLimit: boolean;
    resumeState?: ConversionResumeState;
    partialResult?: ConversionResult;
  } | null>(null);

  const singleFileAbortControllerRef = useRef<AbortController | null>(null);
  const retryFileInputRef = useRef<HTMLInputElement | null>(null);
  const [retryTargetItemId, setRetryTargetItemId] = useState<string | null>(null);

  const options: ConversionOptions = CONVERSION_DEFAULTS;

  // Load conversion history on initial mount & seamlessly restore any active or previous session
  useEffect(() => {
    async function initStorageAndSession() {
      try {
        const items = await getHistory();
        setSavedItems(items);

        // Check if there was an active or saved batch session in IndexedDB
        const persistedBatch = await getBatchSession();
        if (persistedBatch && persistedBatch.length > 0) {
          const reconstructed: BatchFileItem[] = persistedBatch.map((it) => {
            let fileObj: File;
            if (it.fileBlob) {
              fileObj = new File([it.fileBlob], it.name, { type: it.fileType || 'application/pdf' });
            } else {
              fileObj = new File([], it.name, { type: 'application/pdf' });
            }
            // If the user closed the tab days ago while an item was in 'processing',
            // reset it to 'pending' so it never falsely displays as actively spinning or stuck
            const normalizedStatus = it.status === 'processing' ? 'pending' : it.status;
            return {
              id: it.id,
              file: fileObj,
              name: it.name,
              size: it.size,
              status: normalizedStatus,
              progress: normalizedStatus === 'pending' ? 0 : it.progress,
              result: it.result,
              error: it.error,
              retryCount: it.retryCount,
              isDownloaded: Boolean(it.isDownloaded),
              statusMessage: normalizedStatus === 'pending' ? 'في الانتظار' : it.statusMessage,
              lastUpdatedAt: it.lastUpdatedAt || Date.now(),
            };
          });

          setBatchQueue(reconstructed);
          const allDone = reconstructed.every((it) => it.status === 'done');
          setIsBatchFinished(allDone);
          setIsBatchRunning(false);
          const pending = reconstructed.filter((it) => it.status === 'pending');
          queuePendingItemsRef.current = pending;
        } else if (items.length > 0) {
          // If no active session was saved, but history has previously converted books (e.g. user's ~40 books!),
          // automatically reconstruct them so they land directly back on the batch view with full download access!
          const restoredFromHistory: BatchFileItem[] = items.map((item) => ({
            id: item.id,
            file: new File([], item.fileName, { type: 'application/pdf' }),
            name: item.fileName,
            size: item.fileSize || 1024,
            status: 'done',
            progress: 100,
            result: item.result,
            isDownloaded: Boolean(item.isDownloaded),
            lastUpdatedAt: item.timestamp,
          }));
          setBatchQueue(restoredFromHistory);
          setIsBatchFinished(true);
          setIsBatchRunning(false);
        }
      } catch (err) {
        console.error('Failed to load history or restore session', err);
      }
    }
    initStorageAndSession();
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

  const refreshHistoryList = useCallback(async () => {
    try {
      const items = await getHistory();
      setSavedItems(items);
    } catch (err) {
      console.error('Failed to refresh history', err);
    }
  }, []);

  const refreshAuthStatus = useCallback(async () => {
    try {
      const resp = await apiFetch('/api/auth/status', { method: 'GET', cache: 'no-store' });
      if (resp.ok) {
        const data = await resp.json();
        setAuthStatus({
          lockEnabled: Boolean(data.lockEnabled),
          authenticated: Boolean(data.authenticated),
          envManaged: Boolean(data.envManaged),
          hasPasscodeConfigured: Boolean(data.hasPasscodeConfigured),
          currentOrigin: String(data.currentOrigin || ''),
          sharedPublicOrigin: String(data.sharedPublicOrigin || ''),
          isDevPreviewHost: Boolean(data.isDevPreviewHost),
        });
      }
    } catch {
      // Keep prior state or allow offline work without blocking
    } finally {
      setIsCheckingAuth(false);
    }
  }, []);

  useEffect(() => {
    void refreshAuthStatus();
  }, [refreshAuthStatus]);

  const isTeamAccessAllowed =
    !isCheckingAuth && (!authStatus?.lockEnabled || Boolean(authStatus?.authenticated));

  const syncCompletedServerJobToHistory = useCallback(
    async (jobMeta: ServerJobMeta) => {
      if (syncedServerJobIdsRef.current.has(jobMeta.id)) return;
      try {
        const resp = await apiFetch(`/api/jobs/${encodeURIComponent(jobMeta.id)}`);
        if (!resp.ok) return;
        const data = await resp.json();
        if (data?.success && data?.result) {
          syncedServerJobIdsRef.current.add(jobMeta.id);
          try {
            localStorage.setItem(
              'synced_server_job_ids',
              JSON.stringify(Array.from(syncedServerJobIdsRef.current))
            );
          } catch {}
          await saveToHistory(
            data.result,
            jobMeta.fileName,
            jobMeta.fileSize,
            data.result.totalPages || jobMeta.totalPages || 1
          );
          await refreshHistoryList();
        }
      } catch {}
    },
    [refreshHistoryList]
  );

  const fetchServerJobs = useCallback(async () => {
    if (!isTeamAccessAllowed) return;
    try {
      const resp = await apiFetch('/api/jobs', { cache: 'no-store' });
      if (!resp.ok) return;
      const data = await resp.json();
      if (data?.success && Array.isArray(data.jobs)) {
        const jobs = data.jobs as ServerJobMeta[];
        setServerJobs(jobs);
        for (const job of jobs) {
          if (job.status === 'completed' && !syncedServerJobIdsRef.current.has(job.id)) {
            syncCompletedServerJobToHistory(job);
          }
        }
      }
    } catch {}
  }, [isTeamAccessAllowed, syncCompletedServerJobToHistory]);

  useEffect(() => {
    if (isTeamAccessAllowed) {
      void fetchServerJobs();
    }
  }, [isTeamAccessAllowed, fetchServerJobs]);

  useConnectionKeepAlive({
    enabled: isTeamAccessAllowed,
    onWakeSync: async () => {
      await refreshAuthStatus();
      await fetchServerJobs();
    },
    onAuthRequired: () => {
      void refreshAuthStatus();
    },
  });

  const hasActiveServerJobs = serverJobs.some(
    (j) => j.status === 'queued' || j.status === 'running'
  );

  useEffect(() => {
    if (!hasActiveServerJobs || !isTeamAccessAllowed) return;
    const timer = setInterval(() => {
      void fetchServerJobs();
    }, 2500);
    return () => clearInterval(timer);
  }, [hasActiveServerJobs, isTeamAccessAllowed, fetchServerJobs]);

  const activeServerJobsCount = serverJobs.filter(
    (j) => j.status === 'queued' || j.status === 'running'
  ).length;

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
      handleFileSelect(file, resume, (pausedConversion as any).options);
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

  const handleFileSelect = async (file: File, resumeState?: ConversionResumeState, customOptions?: ConversionOptions) => {
    setErrorMessage(null);
    setPausedConversion(null);
    setIsProcessing(true);
    setProcessingFileName(file.name);
    const activeOpts = customOptions || options;

    if (!pdfUrl && (file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf')) {
      if (file.size <= 25 * 1024 * 1024) {
        const objectUrl = URL.createObjectURL(file);
        setPdfUrl(objectUrl);
      }
    }

    singleFileAbortControllerRef.current = new AbortController();

    try {
      const result = await convertDocumentFile(
        file,
        activeOpts,
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
          options: activeOpts,
        };

        setPausedConversion(pausedInfo as any);
        if (!isRateLimit) {
          setErrorMessage(err.message || 'حدث خطأ أثناء فحص ومعالجة المستند');
        }
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

  const handleStartConversion = (files: File[], customOptions?: ConversionOptions) => {
    setErrorMessage(null);
    if (!files || files.length === 0) return;
    handleAddFilesToQueue(files, customOptions);
  };

  const submitFilesToServerBackgroundJobs = async (
    files: File[],
    customOptions?: ConversionOptions
  ) => {
    let submitted = 0;
    const failedFiles: string[] = [];

    for (const file of files) {
      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('direction', 'auto');
        void customOptions;

        const resp = await apiFetch('/api/jobs', {
          method: 'POST',
          body: formData,
        });
        const data = await resp.json().catch(() => null);
        if (resp.ok && data?.success) {
          submitted++;
        } else {
          failedFiles.push(`${file.name}: ${data?.error || 'خطأ في الرفع'}`);
        }
      } catch (err: any) {
        failedFiles.push(`${file.name}: ${err?.message || 'تعذر الاتصال بالخادم'}`);
      }
    }

    await fetchServerJobs();

    if (submitted > 0) {
      setNotificationMessage(
        submitted === 1
          ? 'تم إرسال الملف للمعالجة المستمرة على الخادم — يتابع العمل حتى إذا أغلقت المتصفح أو التبويب.'
          : `تم إرسال ${submitted} ملفات للمعالجة المستمرة على الخادم — تستمر دون انقطاع حتى عند إغلاق المتصفح.`
      );
      setTimeout(() => setNotificationMessage(null), 6500);
    }
    if (failedFiles.length > 0) {
      setErrorMessage(failedFiles.join(' · '));
    }
  };

  const handlePauseServerJob = async (jobId: string) => {
    try {
      await apiFetch(`/api/jobs/${encodeURIComponent(jobId)}/cancel`, { method: 'POST' });
      await fetchServerJobs();
    } catch {}
  };

  const handleResumeServerJob = async (jobId: string) => {
    try {
      await apiFetch(`/api/jobs/${encodeURIComponent(jobId)}/resume`, { method: 'POST' });
      await fetchServerJobs();
    } catch {}
  };

  const handleDeleteServerJob = async (jobId: string) => {
    try {
      await apiFetch(`/api/jobs/${encodeURIComponent(jobId)}`, { method: 'DELETE' });
      await fetchServerJobs();
    } catch {}
  };

  const handleClearFinishedServerJobs = async () => {
    const finished = serverJobs.filter((j) => j.status === 'completed' || j.status === 'failed');
    for (const j of finished) {
      await apiFetch(`/api/jobs/${encodeURIComponent(j.id)}`, { method: 'DELETE' }).catch(() => {});
    }
    await fetchServerJobs();
  };

  const handleOpenServerJobResult = async (job: ServerJobMeta) => {
    setLoadingServerJobId(job.id);
    setErrorMessage(null);
    try {
      const resp = await apiFetch(`/api/jobs/${encodeURIComponent(job.id)}`);
      const data = await resp.json();
      if (!resp.ok || !data?.success) {
        throw new Error(data?.error || 'تعذر تحميل نتيجة المهمة من الخادم.');
      }

      if (data.result) {
        setConversionResult(data.result);
        setPdfUrl(null);
        setActiveView('viewer');
      } else if (data.partialMarkdown && String(data.partialMarkdown).trim()) {
        const isAr = (String(data.partialMarkdown).match(/[\u0600-\u06FF]/g) || []).length > 20;
        const partialRes: ConversionResult = {
          title: job.title || job.fileName.replace(/\.[^/.]+$/, ''),
          detectedLanguage: isAr ? 'العربية' : 'English',
          textDirection: isAr ? 'rtl' : 'ltr',
          hasArabicText: isAr,
          hasTables: true,
          hasMathOrScience: false,
          hasHandwriting: false,
          markdown: data.partialMarkdown,
          plainText: String(data.partialMarkdown).replace(/---PAGE_BREAK---/g, '\n'),
          fileName: job.fileName,
          fileSize: job.fileSize,
          totalPages: job.totalPages || 1,
          totalChunksProcessed: job.completedPages || 1,
          conversionDurationMs: 0,
          isAutoAudited: false,
        };
        setConversionResult(partialRes);
        setPdfUrl(null);
        setActiveView('viewer');
      } else {
        setErrorMessage('لا تتوفر صفحات منجزة للمعاينة في هذه المهمة بعد.');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'تعذر فتح نتيجة المهمة.');
    } finally {
      setLoadingServerJobId(null);
    }
  };

  const handleDownloadServerJobDocx = async (job: ServerJobMeta) => {
    setLoadingServerJobId(job.id);
    setErrorMessage(null);
    try {
      const resp = await apiFetch(`/api/jobs/${encodeURIComponent(job.id)}/download-docx`);
      if (!resp.ok) {
        const errJson = await resp.json().catch(() => null);
        throw new Error(errJson?.error || 'تعذر إنشاء ملف Word لهذه المهمة.');
      }
      const blob = await resp.blob();
      const baseName = (job.title || job.fileName).replace(/\.[^/.]+$/, '').replace(/[\\/:*?"<>|]/g, '_');
      const finalFileName = `${baseName}.docx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = finalFileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      setNotificationMessage(`تم تنزيل مستند Word "${finalFileName}" بنجاح.`);
      setTimeout(() => setNotificationMessage(null), 4000);
    } catch (err: any) {
      setErrorMessage(err?.message || 'تعذر تنزيل ملف Word من الخادم.');
    } finally {
      setLoadingServerJobId(null);
    }
  };

  const handleAddFilesToQueue = (files: File[], customOptions?: ConversionOptions) => {
    if (!files || files.length === 0) return;
    setErrorMessage(null);

    const serverEligibleFiles: File[] = [];
    const clientFiles: File[] = [];
    const hasCustomPageRange = Boolean(customOptions?.pageRange?.enabled);

    for (const f of files) {
      const lower = f.name.toLowerCase();
      const isPdf = lower.endsWith('.pdf') || f.type === 'application/pdf';
      const isDocx =
        lower.endsWith('.docx') ||
        lower.endsWith('.doc') ||
        f.type.includes('word') ||
        f.type.includes('officedocument');
      const isImg =
        f.type.startsWith('image/') ||
        Boolean(f.name.match(/\.(png|jpe?g|bmp|webp|gif|svg)$/i));

      if (isPdf || isImg) {
        if (hasCustomPageRange) {
          clientFiles.push(f);
        } else {
          serverEligibleFiles.push(f);
        }
      } else if (isDocx) {
        clientFiles.push(f);
      }
    }

    if (serverEligibleFiles.length === 0 && clientFiles.length === 0) {
      setErrorMessage('يرجى اختيار ملفات PDF أو مستندات Word (.docx) أو صور صالحة.');
      return;
    }

    if (serverEligibleFiles.length > 0) {
      submitFilesToServerBackgroundJobs(serverEligibleFiles, customOptions);
    }

    if (clientFiles.length === 0) {
      return;
    }

    const newItems: BatchFileItem[] = clientFiles.map((f, i) => ({
      id: `batch-${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${i}`,
      file: f,
      name: f.name,
      size: f.size,
      status: 'pending',
      retryCount: 0,
      options: customOptions,
      lastUpdatedAt: Date.now(),
    }));

    setBatchQueue((prev) => (prev ? [...prev, ...newItems] : newItems));
    queuePendingItemsRef.current.push(...newItems);

    setJustAddedCount(clientFiles.length);
    setTimeout(() => {
      setJustAddedCount(null);
    }, 4500);

    // If batch was idle or finished, re-launch runner
    if (!isQueueProcessingRef.current) {
      startQueueRunner();
    }
  };

  const startQueueRunner = async () => {
    if (isQueueProcessingRef.current) return;
    isQueueProcessingRef.current = true;
    setIsBatchRunning(true);
    setIsBatchFinished(false);

    if (!batchAbortControllerRef.current || batchAbortControllerRef.current.signal.aborted) {
      batchAbortControllerRef.current = new AbortController();
    }

    while (queuePendingItemsRef.current.length > 0) {
      if (batchAbortControllerRef.current?.signal.aborted) {
        break;
      }

      const currentItem = queuePendingItemsRef.current.shift()!;
      setProcessingFileName(currentItem.name);

      setBatchQueue((prev) =>
        prev
          ? prev.map((item) =>
              item.id === currentItem.id
                ? { ...item, status: 'processing', progress: 5, error: undefined, lastUpdatedAt: Date.now() }
                : item
            )
          : null
      );

      const currentFile = currentItem.file;
      const isDocx =
        currentFile.name.toLowerCase().endsWith('.docx') ||
        currentFile.name.toLowerCase().endsWith('.doc') ||
        currentFile.type.includes('word') ||
        currentFile.type.includes('officedocument');

      const activeOpts = currentItem.options || options;

      try {
        if (!currentFile || currentFile.size === 0) {
          throw new Error('الملف غير متوفر في الذاكرة المؤقتة. اضغط على "إعادة رفع الملف" لاختياره وتحويله مباشرة.');
        }

        const res = await convertDocumentFile(
          currentFile,
          activeOpts,
          (prog) => {
            setProgress(prog);
            setBatchQueue((prev) =>
              prev
                ? prev.map((item) =>
                    item.id === currentItem.id
                      ? {
                          ...item,
                          progress: Math.max(item.progress || 0, prog.percentage),
                          statusMessage: prog.statusMessage || prog.phase,
                          lastUpdatedAt: Date.now(),
                        }
                      : item
                  )
                : null
            );
          },
          batchAbortControllerRef.current?.signal,
          currentItem.resumeState
        );

        await saveToHistory(res, currentFile.name, currentFile.size, res.totalPages || 1);
        await refreshHistoryList();

        setBatchQueue((prev) =>
          prev
            ? prev.map((item) =>
                item.id === currentItem.id
                  ? { ...item, status: 'done', progress: 100, result: res, error: undefined, lastUpdatedAt: Date.now() }
                  : item
              )
            : null
        );

        queueCompletedItemsRef.current.push({
          id: currentItem.id,
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
            prev
              ? prev.map((item) =>
                  item.id === currentItem.id ? { ...item, status: 'pending', lastUpdatedAt: Date.now() } : item
                )
              : null
          );
          break;
        }
        console.error(`Batch item error on ${currentFile.name}:`, err);

        const currentRetries = currentItem.retryCount || 0;
        const maxRetries = 2;
        if (autoRetryBatchRef.current && currentRetries < maxRetries) {
          const nextRetry = currentRetries + 1;
          setBatchQueue((prev) =>
            prev
              ? prev.map((item) =>
                  item.id === currentItem.id
                    ? {
                        ...item,
                        status: 'pending',
                        progress: 0,
                        error: `جاري إعادة المحاولة التلقائية بعد قليل (${nextRetry}/${maxRetries})...`,
                        retryCount: nextRetry,
                        lastUpdatedAt: Date.now(),
                      }
                    : item
                )
              : null
          );

          await new Promise((r) => setTimeout(r, 2000));

          if (!batchAbortControllerRef.current?.signal.aborted) {
            queuePendingItemsRef.current.push({
              ...currentItem,
              status: 'pending',
              progress: 0,
              retryCount: nextRetry,
              lastUpdatedAt: Date.now(),
            });
          }
        } else {
          setBatchQueue((prev) =>
            prev
              ? prev.map((item) =>
                  item.id === currentItem.id
                    ? { ...item, status: 'error', error: err?.message || 'تعذر التحويل', lastUpdatedAt: Date.now() }
                    : item
                )
              : null
          );
        }
      }
    }

    isQueueProcessingRef.current = false;
    setIsBatchRunning(false);
    setIsBatchFinished(true);

    if (queueCompletedItemsRef.current.length > 0 && !batchAbortControllerRef.current?.signal.aborted) {
      playCompletionChime();
      const count = queueCompletedItemsRef.current.length;
      setNotificationMessage(
        count === 1
          ? 'اكتمل تحويل المستند بنجاح! يمكنك الآن تنزيله أو معاينته.'
          : `اكتمل تحويل كافة الكتب والمستندات (${count} مستندات) بنجاح! يمكنك الآن تنزيل كل ملف Word أو تحميل الحزمة الكاملة.`
      );
      setTimeout(() => setNotificationMessage(null), 7000);
    }
  };

  const handleRemoveQueueItem = (itemId: string) => {
    queuePendingItemsRef.current = queuePendingItemsRef.current.filter((it) => it.id !== itemId);
    setBatchQueue((prev) => (prev ? prev.filter((it) => it.id !== itemId) : null));
  };

  const handleStopBatch = () => {
    if (batchAbortControllerRef.current) {
      batchAbortControllerRef.current.abort();
      batchAbortControllerRef.current = null;
    }
    queuePendingItemsRef.current = [];
    isQueueProcessingRef.current = false;
    setIsBatchRunning(false);
  };

  const handleResetBatch = () => {
    if (batchAbortControllerRef.current) {
      batchAbortControllerRef.current.abort();
      batchAbortControllerRef.current = null;
    }
    queuePendingItemsRef.current = [];
    queueCompletedItemsRef.current = [];
    isQueueProcessingRef.current = false;
    setBatchQueue(null);
    setIsBatchRunning(false);
    setIsBatchFinished(false);
    setJustAddedCount(null);
    clearBatchSession();
  };

  /**
   * Helper to persist downloaded state to IndexedDB for specified item IDs
   */
  const markItemsAsDownloaded = async (itemIds: string[]) => {
    for (const id of itemIds) {
      await markBatchItemDownloadedInSession(id);
      await markHistoryDownloaded(id);
    }
    await refreshHistoryList();
  };

  /**
   * Downloads only what has completed so far into a ZIP without stopping
   * ongoing conversions. Marks downloaded books so they are not re-downloaded later.
   */
  const handleDownloadCompletedSoFar = async () => {
    if (!batchQueue) return;
    const completed = batchQueue.filter((it) => it.status === 'done' && it.result);
    if (completed.length === 0) {
      setErrorMessage('لا توجد ملفات مكتملة التحويل حتى الآن لتنزيلها.');
      return;
    }

    const docsToDownload: QueuedDocument[] = completed.map((it) => ({
      id: it.id,
      file: it.file,
      type: it.name.toLowerCase().endsWith('.docx') ? 'docx' : 'pdf',
      name: it.name,
      size: it.size,
      status: 'done',
      result: it.result,
    }));

    await downloadBatchAsZip(
      docsToDownload,
      `الكتب_المنجزة_حتى_الآن_${completed.length}_ملف.zip`,
      {
        includeMarkdown: zipIncludeSources,
        includeText: zipIncludeSources,
        onlyWord: !zipIncludeSources,
      }
    );

    // Mark these items as downloaded in state and persistent storage
    const downloadedIds = docsToDownload.map((d) => d.id);
    setBatchQueue((prev) =>
      prev
        ? prev.map((it) =>
            downloadedIds.includes(it.id) ? { ...it, isDownloaded: true } : it
          )
        : null
    );
    await markItemsAsDownloaded(downloadedIds);

    setNotificationMessage(`تم تنزيل ${completed.length} كتاب/ملف منجز بنجاح كحزمة ZIP! المعالجة مستمرة لباقي الملفات.`);
    setTimeout(() => setNotificationMessage(null), 5000);
  };

  /**
   * Downloads only the remaining books that have completed but have NOT yet been downloaded,
   * avoiding duplicate downloads.
   */
  const handleDownloadRemainingUnDownloaded = async () => {
    if (!batchQueue) return;
    const unDownloaded = batchQueue.filter(
      (it) => it.status === 'done' && it.result && !it.isDownloaded
    );

    if (unDownloaded.length === 0) {
      setErrorMessage('تم تنزيل كافة الكتب المكتملة مسبقاً! يمكنك تنزيل المجلد كاملاً إذا رغبت.');
      return;
    }

    const docsToDownload: QueuedDocument[] = unDownloaded.map((it) => ({
      id: it.id,
      file: it.file,
      type: it.name.toLowerCase().endsWith('.docx') ? 'docx' : 'pdf',
      name: it.name,
      size: it.size,
      status: 'done',
      result: it.result,
    }));

    await downloadBatchAsZip(
      docsToDownload,
      `الجزء_المتبقي_الذي_لم_يحمل_${unDownloaded.length}_ملف.zip`,
      {
        includeMarkdown: zipIncludeSources,
        includeText: zipIncludeSources,
        onlyWord: !zipIncludeSources,
      }
    );

    const downloadedIds = docsToDownload.map((d) => d.id);
    setBatchQueue((prev) =>
      prev
        ? prev.map((it) =>
            downloadedIds.includes(it.id) ? { ...it, isDownloaded: true } : it
          )
        : null
    );
    await markItemsAsDownloaded(downloadedIds);

    setNotificationMessage(`تم تنزيل الجزء المتبقي الجديد (${unDownloaded.length} كتاب) بنجاح!`);
    setTimeout(() => setNotificationMessage(null), 5000);
  };

  /**
   * Downloads the entire batch archive containing all completed books in one master ZIP.
   */
  const handleDownloadFullBatchZip = async () => {
    if (!batchQueue) return;
    const completed = batchQueue.filter((it) => it.status === 'done' && it.result);
    if (completed.length === 0) return;

    const docsToDownload: QueuedDocument[] = completed.map((it) => ({
      id: it.id,
      file: it.file,
      type: it.name.toLowerCase().endsWith('.docx') ? 'docx' : 'pdf',
      name: it.name,
      size: it.size,
      status: 'done',
      result: it.result,
    }));

    await downloadBatchAsZip(
      docsToDownload,
      `المجلد_الكامل_${completed.length}_ملف_Word.zip`,
      {
        includeMarkdown: zipIncludeSources,
        includeText: zipIncludeSources,
        onlyWord: !zipIncludeSources,
      }
    );

    const downloadedIds = docsToDownload.map((d) => d.id);
    setBatchQueue((prev) =>
      prev
        ? prev.map((it) =>
            downloadedIds.includes(it.id) ? { ...it, isDownloaded: true } : it
          )
        : null
    );
    await markItemsAsDownloaded(downloadedIds);

    setNotificationMessage(`تم تنزيل المجلد الكامل (${completed.length} كتاب) بنجاح!`);
    setTimeout(() => setNotificationMessage(null), 5000);
  };

  /**
   * Exports a manifest text report of all books that are still pending or in progress in the queue.
   */
  const handleExportRemainingQueueManifest = () => {
    if (!batchQueue) return;
    const remaining = batchQueue.filter(
      (it) => it.status === 'pending' || it.status === 'processing' || it.status === 'error'
    );

    if (remaining.length === 0) {
      setErrorMessage('لا توجد ملفات متبقية في الطابور، كل الملفات مكتملة التحويل.');
      return;
    }

    const lines: string[] = [
      '=======================================================',
      'كشف المستندات والكتب المتبقية في طابور التحويل (لم تكتمل بعد)',
      `تاريخ الاستخراج: ${new Date().toLocaleString('ar-EG')}`,
      `إجمالي الملفات المتبقية: ${remaining.length} ملف`,
      '=======================================================\n',
    ];

    remaining.forEach((it, idx) => {
      const statusArabic =
        it.status === 'processing'
          ? `جاري تحويله الآن (${it.progress || 0}%)`
          : it.status === 'error'
          ? `تعثر التحويل (${it.error || 'خطأ'})`
          : 'في قائمة الانتظار';
      lines.push(`${idx + 1}. ${it.name} [${formatBytes(it.size)}] — الحالة: ${statusArabic}`);
    });

    lines.push('\n-------------------------------------------------------');
    lines.push('يمكنك استئناف تحويل هذه الملفات مباشرة في أي وقت دون إعادة رفعها.');

    safeDownloadText(lines.join('\n'), `كشف_الكتب_المتبقية_${remaining.length}_ملف.txt`);

    setNotificationMessage(`تم استخراج كشف الكتب المتبقية (${remaining.length} ملف) بنجاح!`);
    setTimeout(() => setNotificationMessage(null), 5000);
  };

  /**
   * Resumes converting pending books in the batch queue (e.g. after a page reload or pause).
   */
  const handleResumeRemainingBatch = () => {
    if (!batchQueue) return;
    const pendingItems = batchQueue.filter((it) => it.status === 'pending');
    if (pendingItems.length === 0) {
      setErrorMessage('لا توجد ملفات في قائمة الانتظار للبدء بتحويلها.');
      return;
    }
    queuePendingItemsRef.current = [...pendingItems];
    if (!isQueueProcessingRef.current) {
      startQueueRunner();
    }
  };

  /**
   * Restores all previously completed books from persistent history (IndexedDB)
   * into the active batch screen so the user can download or preview them all together.
   */
  const handleRestoreSavedHistoryToBatch = () => {
    if (savedItems.length === 0) {
      setErrorMessage('لا توجد ملفات محفوظة في السجل لاستعادتها.');
      return;
    }

    const restoredItems: BatchFileItem[] = savedItems.map((item) => ({
      id: item.id,
      file: new File([], item.fileName, { type: 'application/pdf' }),
      name: item.fileName,
      size: item.fileSize || 1024,
      status: 'done',
      progress: 100,
      result: item.result,
      isDownloaded: Boolean(item.isDownloaded),
    }));

    setBatchQueue(restoredItems);
    setIsBatchFinished(true);
    setIsBatchRunning(false);
    queuePendingItemsRef.current = [];
    setActiveView('home');
    setNotificationMessage(`تمت استعادة ${restoredItems.length} كتب ومستندات سابقة إلى صفحة التحويل بنجاح!`);
    setTimeout(() => setNotificationMessage(null), 5000);
  };

  /**
   * Downloads all history items directly as a full ZIP archive.
   */
  const handleDownloadAllHistoryZip = async () => {
    if (savedItems.length === 0) return;
    const docsToDownload: QueuedDocument[] = savedItems.map((item) => ({
      id: item.id,
      file: new File([], item.fileName, { type: 'application/pdf' }),
      type: item.fileName.toLowerCase().endsWith('.docx') ? 'docx' : 'pdf',
      name: item.fileName,
      size: item.fileSize || 1024,
      status: 'done',
      result: item.result,
    }));
    await downloadBatchAsZip(
      docsToDownload,
      `حزمة_كافة_الكتب_المحفوظة_${savedItems.length}_كتاب.zip`
    );
  };

  const handleDownloadSingleDocx = async (res: ConversionResult, fileName: string, itemId?: string) => {
    try {
      const isRtl = res.textDirection === 'rtl' || Boolean(res.hasArabicText);
      const baseName = fileName.replace(/\.[^/.]+$/, '');
      await downloadDocx(
        {
          title: res.title || baseName,
          markdown: res.markdown || res.plainText || '',
          isRtl,
        },
        `${baseName}.docx`
      );

      if (itemId) {
        setBatchQueue((prev) =>
          prev ? prev.map((it) => (it.id === itemId ? { ...it, isDownloaded: true } : it)) : null
        );
        markBatchItemDownloadedInSession(itemId);
        markHistoryDownloaded(itemId);
      }
      setNotificationMessage(`تم تنزيل مستند "${baseName}.docx" بنجاح!`);
      setTimeout(() => setNotificationMessage(null), 4000);
    } catch (err: any) {
      console.error('Download single docx error:', err);
      setErrorMessage(`تعذر إنشاء ملف Word (.docx): ${err?.message || 'خطأ أثناء تجهيز الملف'}`);
    }
  };

  const handleViewBatchItemResult = (res: ConversionResult) => {
    setConversionResult(res);
    setActiveView('viewer');
  };

  const handleRetryBatchItem = async (itemId: string) => {
    if (!batchQueue) return;
    const targetItem = batchQueue.find((it) => it.id === itemId);
    if (!targetItem) return;

    // If the file is 0 bytes (e.g. browser cleared the in-memory File on refresh), trigger file reselection
    if (!targetItem.file || targetItem.file.size === 0) {
      setRetryTargetItemId(itemId);
      setNotificationMessage(`يرجى اختيار ملف "${targetItem.name}" من جهازك لإعادة تحويله مباشرة.`);
      if (retryFileInputRef.current) {
        retryFileInputRef.current.value = '';
        retryFileInputRef.current.click();
      }
      return;
    }

    targetItem.retryCount = 0;
    targetItem.status = 'pending';
    targetItem.error = undefined;
    targetItem.lastUpdatedAt = Date.now();

    setBatchQueue((prev) =>
      prev
        ? prev.map((it) =>
            it.id === itemId ? { ...it, status: 'pending', progress: 0, error: undefined, lastUpdatedAt: Date.now() } : it
          )
        : null
    );

    queuePendingItemsRef.current.push(targetItem);
    setNotificationMessage(`تمت إضافة "${targetItem.name}" إلى طابور المعالجة وجاري البدء...`);
    setTimeout(() => setNotificationMessage(null), 3000);

    if (!isQueueProcessingRef.current) {
      startQueueRunner();
    }
  };

  const handleRetryFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !retryTargetItemId) return;

    const targetId = retryTargetItemId;
    let foundItem: BatchFileItem | undefined;

    setBatchQueue((prev) =>
      prev
        ? prev.map((it) => {
            if (it.id === targetId) {
              const updated: BatchFileItem = {
                ...it,
                file,
                size: file.size,
                name: it.name || file.name,
                status: 'pending',
                progress: 0,
                error: undefined,
                retryCount: 0,
                lastUpdatedAt: Date.now(),
              };
              foundItem = updated;
              return updated;
            }
            return it;
          })
        : null
    );

    if (foundItem) {
      queuePendingItemsRef.current.push(foundItem);
      setNotificationMessage(`تم ربط ملف "${file.name}" بنجاح وجاري استئناف التحويل...`);
      setTimeout(() => setNotificationMessage(null), 4000);
      if (!isQueueProcessingRef.current) {
        startQueueRunner();
      }
    }
    setRetryTargetItemId(null);
  };

  const handleRetryAllFailed = async () => {
    if (!batchQueue) return;
    const failedItems = batchQueue.filter((it) => it.status === 'error');
    if (failedItems.length === 0) return;

    const needsReupload = failedItems.find((it) => !it.file || it.file.size === 0);
    if (needsReupload) {
      setNotificationMessage(`الملف "${needsReupload.name}" يتطلب إعادة اختياره من جهازك لأن المتصفح مسح نسخته المؤقتة.`);
      handleRetryBatchItem(needsReupload.id);
      return;
    }

    for (const item of failedItems) {
      item.retryCount = 0;
      item.status = 'pending';
      item.error = undefined;
      queuePendingItemsRef.current.push(item);
    }
    setBatchQueue((prev) =>
      prev
        ? prev.map((it) =>
            it.status === 'error' ? { ...it, status: 'pending', progress: 0, error: undefined } : it
          )
        : null
    );
    if (!isQueueProcessingRef.current) {
      startQueueRunner();
    }
  };

  const handleDocxSelect = async (file: File) => {
    return handleFileSelect(file);
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

  if (isCheckingAuth) {
    return (
      <div
        dir="rtl"
        className="min-h-screen bg-[#FBFBF9] dark:bg-[#0B0D12] text-slate-600 dark:text-slate-300 flex items-center justify-center text-sm font-medium"
      >
        جاري تهيئة مساحة العمل...
      </div>
    );
  }

  if (authStatus?.lockEnabled && !authStatus.authenticated) {
    return (
      <TeamAccessGate
        theme={theme}
        onToggleTheme={toggleTheme}
        onAuthenticated={async () => {
          await refreshAuthStatus();
          await fetchServerJobs();
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#FBFBF9] dark:bg-[#0B0D12] text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors">
      <Navbar
        hasResult={activeView === 'viewer'}
        onReset={handleResetToNew}
        savedCount={savedItems.length}
        onOpenHistory={() => setIsHistoryDrawerOpen(true)}
        batchCount={batchQueue?.length || 0}
        onOpenBatch={() => setActiveView('home')}
        isShowingBatch={activeView === 'home' && Boolean(batchQueue && batchQueue.length > 0)}
        onRestorePreviousBatch={handleRestoreSavedHistoryToBatch}
        onOpenAgentCliHub={() => setActiveView(activeView === 'agent-hub' ? 'home' : 'agent-hub')}
        isShowingAgentHub={activeView === 'agent-hub'}
        onOpenSmartCompiler={() => setActiveView(activeView === 'compiler' ? 'home' : 'compiler')}
        isShowingSmartCompiler={activeView === 'compiler'}
        theme={theme}
        onToggleTheme={toggleTheme}
        activeServerJobsCount={activeServerJobsCount}
        onOpenTeamShare={() => setIsTeamShareOpen(true)}
        isTeamLocked={Boolean(authStatus?.lockEnabled)}
      />

      <main
        className={
          activeView === 'compiler'
            ? 'flex-1 w-full'
            : 'flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-10 flex flex-col justify-center'
        }
      >
        {/* Notification message */}
        {notificationMessage && (
          <div className="max-w-2xl mx-auto w-full mb-6 p-4 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 text-emerald-900 dark:text-emerald-200 flex items-center justify-between gap-3 shadow-xs animate-fadeIn">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <p className="font-bold text-xs sm:text-sm">{notificationMessage}</p>
            </div>
            <button
              type="button"
              onClick={() => setNotificationMessage(null)}
              className="text-emerald-700 dark:text-emerald-300 hover:text-emerald-900 dark:hover:text-emerald-100 p-1 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Error message */}
        {errorMessage && (
          <div className="max-w-2xl mx-auto w-full mb-6 p-4 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300 flex items-start justify-between gap-3 shadow-xs">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 shrink-0 text-red-500 dark:text-red-400 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold text-sm">تعذر التحويل</p>
                <p className="text-xs text-red-600 dark:text-red-300 leading-relaxed">{errorMessage}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              className="text-red-600 dark:text-red-300 hover:underline text-xs font-bold cursor-pointer shrink-0"
            >
              إغلاق
            </button>
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
            onAddFiles={handleAddFilesToQueue}
            queueItems={
              batchQueue?.map((item) => ({
                id: item.id,
                name: item.name,
                size: item.size,
                status: item.status,
                progress: item.progress,
              })) || undefined
            }
          />
        )}

        {/* State 1.5: Dedicated Single-Page Automation & CLI Hub */}
        {!isProcessing && activeView === 'agent-hub' && (
          <AgentCliHubPage onBack={() => setActiveView('home')} />
        )}

        {/* State 1.75: Editorial Compilation Studio & Semantic Search */}
        {!isProcessing && activeView === 'compiler' && (
          <SmartCompilerWorkspace
            batchQueue={batchQueue}
            savedItems={savedItems}
            onSaveConvertedFile={async (res, file) => {
              await saveToHistory(res, file.name, file.size, res.totalPages || 1);
              await refreshHistoryList();
            }}
            onSaveCompiledResult={async (res) => {
              const saved = await saveToHistory(
                res,
                res.fileName || `${res.title}.docx`,
                res.fileSize || 2048,
                res.totalPages || 1
              );
              setActiveSavedId(saved.id);
              await refreshHistoryList();
            }}
            onOpenInFullViewer={(res) => {
              setConversionResult(res);
              setActiveView('viewer');
            }}
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
            onBackToBatch={() => setActiveView('home')}
            batchCount={
              (batchQueue?.filter((b) => b.status === 'done').length || 0) +
              serverJobs.filter((j) => j.status === 'completed').length
            }
          />
        )}

        {/* State 3: Home View */}
        {!isProcessing && activeView === 'home' && (
          <div className="space-y-6">
            <div className="text-center space-y-1.5 max-w-xl mx-auto">
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
                تحويل وتفريغ المستندات إلى Word
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                استخراج عالي الدقة لملفات PDF والصور إلى مستندات Word منسقة — يستمر في الخلفية على الخادم دون انقطاع
              </p>
            </div>

            {/* Persistent Server Background Jobs Tracker */}
            {serverJobs.length > 0 && (
              <section
                aria-label="المهام الخلفية المستمرة على الخادم"
                className="bg-white dark:bg-[#141720] border border-slate-200 dark:border-[#232938] rounded-2xl p-4 sm:p-5 shadow-xs space-y-4 transition-colors"
              >
                <div className="flex flex-wrap items-center justify-between gap-2.5 pb-3 border-b border-slate-100 dark:border-[#232938]">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-500/15 border border-blue-200 dark:border-blue-500/30 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
                      <Layers className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-extrabold text-slate-900 dark:text-slate-100">
                        المهام الخلفية المستمرة على الخادم ({serverJobs.length})
                      </h3>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        تستمر المعالجة حتى عند إغلاق المتصفح أو التبويب، ويمكنك العودة ومتابعة النسبة والتنزيل في أي وقت.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={fetchServerJobs}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#2A3142] bg-white dark:bg-[#1B202C] hover:bg-slate-50 dark:hover:bg-[#232938] text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${hasActiveServerJobs ? 'animate-spin text-blue-600 dark:text-blue-400' : ''}`} />
                      <span>تحديث</span>
                    </button>
                    {serverJobs.some((j) => j.status === 'completed' || j.status === 'failed') && (
                      <button
                        type="button"
                        onClick={handleClearFinishedServerJobs}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#2A3142] bg-slate-50 dark:bg-[#1B202C] hover:bg-slate-100 dark:hover:bg-[#232938] text-slate-600 dark:text-slate-300 text-xs font-semibold cursor-pointer"
                      >
                        تنظيف المكتمل
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-2.5 max-h-[380px] overflow-y-auto">
                  {serverJobs.map((job) => {
                    const isRunningOrQueued = job.status === 'running' || job.status === 'queued';
                    const isBusy = loadingServerJobId === job.id;

                    return (
                      <div
                        key={job.id}
                        className={`p-3.5 rounded-xl border transition-colors flex flex-col md:flex-row md:items-center justify-between gap-3 ${
                          job.status === 'running'
                            ? 'bg-blue-50/50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/30'
                            : job.status === 'completed'
                            ? 'bg-emerald-50/40 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30'
                            : job.status === 'failed'
                            ? 'bg-red-50/40 dark:bg-red-500/10 border-red-200 dark:border-red-500/30'
                            : 'bg-slate-50 dark:bg-[#171B26] border-slate-200 dark:border-[#232938]'
                        }`}
                      >
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                job.status === 'completed'
                                  ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300'
                                  : job.status === 'running'
                                  ? 'bg-blue-100 dark:bg-blue-500/20 text-blue-800 dark:text-blue-300'
                                  : job.status === 'queued'
                                  ? 'bg-slate-200 dark:bg-[#232938] text-slate-700 dark:text-slate-300'
                                  : job.status === 'paused'
                                  ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300'
                                  : 'bg-red-100 dark:bg-red-500/20 text-red-800 dark:text-red-300'
                              }`}
                            >
                              {job.status === 'completed'
                                ? 'مكتمل'
                                : job.status === 'running'
                                ? 'قيد المعالجة'
                                : job.status === 'queued'
                                ? 'في الطابور'
                                : job.status === 'paused'
                                ? 'متوقف مؤقتاً'
                                : 'تعثر'}
                            </span>

                            <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 truncate" title={job.fileName}>
                              {job.fileName}
                            </p>

                            <span className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                              {formatBytes(job.fileSize)}
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600 dark:text-slate-400 tabular-nums">
                            <span className="font-bold text-slate-900 dark:text-slate-200">
                              {job.completedPages} / {job.totalPages || '؟'} صفحة ({job.percentage}%)
                            </span>
                            {(job.digitalPages > 0 || job.ocrPages > 0) && (
                              <>
                                <span className="text-slate-300 dark:text-slate-600">·</span>
                                <span>
                                  {job.digitalPages} رقمية فورية · {job.ocrPages} ضوئية
                                </span>
                              </>
                            )}
                            {job.etaSeconds !== null && isRunningOrQueued && (
                              <>
                                <span className="text-slate-300 dark:text-slate-600">·</span>
                                <span className="text-blue-700 dark:text-blue-300 font-semibold">
                                  المتبقي تقريباً: {formatEtaArabic(job.etaSeconds)}
                                </span>
                              </>
                            )}
                            {job.currentPhaseLabel && (
                              <>
                                <span className="text-slate-300 dark:text-slate-600">·</span>
                                <span className="truncate max-w-[300px]">{job.currentPhaseLabel}</span>
                              </>
                            )}
                          </div>

                          {job.errorMessage && (
                            <p className="text-[11px] text-red-700 dark:text-red-300 font-semibold">
                              {job.errorMessage}
                            </p>
                          )}

                          {isRunningOrQueued && (
                            <div dir="rtl" className="w-full max-w-lg bg-slate-200 dark:bg-[#232938] rounded-full h-1.5 overflow-hidden flex">
                              <div
                                className="bg-blue-600 dark:bg-blue-400 h-full rounded-full transition-all duration-300"
                                style={{ width: `${Math.max(4, job.percentage)}%` }}
                              />
                            </div>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                          {job.status === 'completed' && (
                            <>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => handleDownloadServerJobDocx(job)}
                                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                              >
                                <Download className="w-3.5 h-3.5" />
                                <span>تنزيل Word (.docx)</span>
                              </button>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => handleOpenServerJobResult(job)}
                                className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#2A3142] bg-white dark:bg-[#1B202C] hover:bg-slate-50 dark:hover:bg-[#232938] text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>معاينة</span>
                              </button>
                            </>
                          )}

                          {(job.status === 'running' || job.status === 'paused') && job.completedPages > 0 && (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleOpenServerJobResult(job)}
                              className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#2A3142] bg-white dark:bg-[#1B202C] hover:bg-slate-50 dark:hover:bg-[#232938] text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>معاينة المنجز</span>
                            </button>
                          )}

                          {isRunningOrQueued && (
                            <button
                              type="button"
                              onClick={() => handlePauseServerJob(job.id)}
                              className="px-2.5 py-1.5 rounded-lg border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/15 hover:bg-amber-100 dark:hover:bg-amber-500/25 text-amber-800 dark:text-amber-300 text-xs font-bold flex items-center gap-1 cursor-pointer"
                            >
                              <Pause className="w-3.5 h-3.5" />
                              <span>إيقاف مؤقت</span>
                            </button>
                          )}

                          {(job.status === 'paused' || job.status === 'failed') && (
                            <button
                              type="button"
                              onClick={() => handleResumeServerJob(job.id)}
                              className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
                            >
                              <Play className="w-3.5 h-3.5" />
                              <span>استئناف من صفحة {job.completedPages + 1}</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => handleDeleteServerJob(job.id)}
                            className="p-1.5 rounded-lg border border-transparent hover:border-red-200 dark:hover:border-red-500/30 hover:bg-red-50 dark:hover:bg-red-500/15 text-slate-400 hover:text-red-600 dark:hover:text-red-400 cursor-pointer"
                            title="حذف هذه المهمة"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Compute batch statistics for conditional download UI */}
            {(() => {
              const batchTotalCount = batchQueue ? batchQueue.length : 0;
              const batchDoneCount = batchQueue ? batchQueue.filter((b) => b.status === 'done').length : 0;
              const batchUndownloadedCount = batchQueue ? batchQueue.filter((b) => b.status === 'done' && !b.isDownloaded).length : 0;
              const batchPendingCount = batchQueue ? batchQueue.filter((b) => b.status === 'pending').length : 0;
              const batchProcessingCount = batchQueue ? batchQueue.filter((b) => b.status === 'processing').length : 0;
              const batchErrorCount = batchQueue ? batchQueue.filter((b) => b.status === 'error').length : 0;
              const batchRemainingCount = batchPendingCount + batchProcessingCount + batchErrorCount;

              const filteredBatchQueue = batchQueue ? batchQueue.filter((item) => {
                if (batchSearchQuery.trim() && !item.name.toLowerCase().includes(batchSearchQuery.trim().toLowerCase())) {
                  return false;
                }
                if (batchFilterTab === 'done') return item.status === 'done';
                if (batchFilterTab === 'undownloaded') return item.status === 'done' && !item.isDownloaded;
                if (batchFilterTab === 'pending') return item.status === 'pending' || item.status === 'processing';
                if (batchFilterTab === 'error') return item.status === 'error';
                return true;
              }) : [];

              return (
                <>
                  {/* Recovery Banner when user has saved books from history and batchQueue is not active */}
                  {savedItems.length > 0 && (!batchQueue || batchQueue.length === 0) && (
                    <div className="bg-slate-900 dark:bg-[#141720] text-white p-4 sm:p-5 rounded-2xl shadow-sm border border-slate-800 dark:border-[#232938] flex flex-col sm:flex-row items-center justify-between gap-4 animate-fadeIn">
                      <div className="flex items-center gap-3 text-center sm:text-right">
                        <div className="w-10 h-10 rounded-xl bg-slate-800 dark:bg-[#1B202C] flex items-center justify-center shrink-0">
                          <Layers className="w-5 h-5 text-blue-400" />
                        </div>
                        <div>
                          <h4 className="font-bold text-sm sm:text-base">
                            ملفاتك السابقة محفوظة ({savedItems.length} ملف)
                          </h4>
                          <p className="text-xs text-slate-400 mt-0.5">
                            نتائج التحويل محفوظة محلياً في متصفحك.
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2.5 w-full sm:w-auto justify-center sm:justify-end shrink-0">
                        <button
                          type="button"
                          onClick={handleRestoreSavedHistoryToBatch}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs sm:text-sm rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-2"
                        >
                          <Layers className="w-4 h-4" />
                          <span>عرض الملفات ({savedItems.length})</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleDownloadAllHistoryZip}
                          className="px-4 py-2.5 bg-white/15 hover:bg-white/25 text-white font-bold text-xs sm:text-sm rounded-xl border border-white/20 transition-all cursor-pointer flex items-center gap-1.5"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>تنزيل الكل ZIP</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Main Batch Queue View (always show Dropzone cleanly above or when queue empty) */}
                  {serverJobs.length > 0 && (
                    <Dropzone
                      onStartConversion={handleStartConversion}
                      isProcessing={isProcessing}
                    />
                  )}

                  {batchQueue && batchQueue.length > 0 ? (
                    <div
                      onDragEnter={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setIsBatchDragOver(true);
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setIsBatchDragOver(true);
                      }}
                      onDragLeave={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setIsBatchDragOver(false);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setIsBatchDragOver(false);
                        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                          handleAddFilesToQueue(Array.from(e.dataTransfer.files));
                        }
                      }}
                      className={`relative bg-white dark:bg-[#141720] border rounded-2xl p-5 sm:p-6 shadow-sm space-y-5 animate-fadeIn transition-colors ${
                        isBatchDragOver
                          ? 'border-blue-500 ring-4 ring-blue-500/20 bg-blue-50/20 dark:bg-blue-500/10'
                          : 'border-slate-200 dark:border-[#232938]'
                      }`}
                    >
                      {/* Drag over overlay */}
                      {isBatchDragOver && (
                        <div className="absolute inset-0 bg-blue-600/90 text-white rounded-2xl z-30 flex flex-col items-center justify-center gap-2 backdrop-blur-2xs animate-fadeIn pointer-events-none">
                          <UploadCloud className="w-12 h-12 text-white" />
                          <h4 className="text-base sm:text-lg font-black">أفلت الملفات هنا لإضافتها للمعالجة</h4>
                          <p className="text-xs text-blue-100 font-medium">سيتم إدراجها فوراً وتحويلها بالتتابع</p>
                        </div>
                      )}

                      {/* Header bar */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-[#232938]">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            {isBatchRunning ? (
                              <span className="px-2.5 py-1 rounded-lg bg-blue-100 dark:bg-blue-500/20 text-blue-800 dark:text-blue-300 text-xs font-bold flex items-center gap-1.5 tabular-nums">
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                <span>
                                  جاري التحويل (
                                  {batchQueue.findIndex((b) => b.status === 'processing') !== -1
                                    ? batchQueue.findIndex((b) => b.status === 'processing') + 1
                                    : batchDoneCount + 1}{' '}
                                  من {batchTotalCount})
                                </span>
                              </span>
                            ) : (isBatchFinished || (batchDoneCount === batchTotalCount && batchTotalCount > 0)) ? (
                              <span className="px-2.5 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 text-xs font-bold flex items-center gap-1.5">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                                <span>اكتملت معالجة كافة الكتب بنجاح</span>
                              </span>
                            ) : (
                              <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-[#1B202C] text-slate-700 dark:text-slate-300 text-xs font-bold flex items-center gap-1.5 tabular-nums">
                                <Layers className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                                <span>دفعة الكتب المحفوظة ({batchTotalCount})</span>
                              </span>
                            )}
                            <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold tabular-nums">
                              {batchDoneCount} من {batchTotalCount} مكتمل • {batchUndownloadedCount} لم يُحمَّل بعد
                            </span>
                          </div>
                          <h3 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-slate-100 mt-1">
                            {isBatchRunning ? 'المعالجة جارية بالتتابع...' : 'ملفات وكتب Word الجاهزة للتحميل والتفريغ'}
                          </h3>
                        </div>

                        <div className="flex flex-wrap items-center gap-2.5">
                          <label
                            htmlFor="batch-auto-retry"
                            className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-[#1B202C] hover:bg-slate-100 dark:hover:bg-[#232938] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[#2A3142] cursor-pointer select-none transition-colors"
                            title="إعادة إدراج الملفات المتعثرة تلقائياً"
                          >
                            <input
                              type="checkbox"
                              id="batch-auto-retry"
                              checked={autoRetryBatch}
                              onChange={(e) => setAutoRetryBatch(e.target.checked)}
                              className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 accent-blue-600 cursor-pointer"
                            />
                            <span>إعادة المحاولة التلقائية</span>
                          </label>

                          {isBatchRunning ? (
                            <button
                              type="button"
                              onClick={handleStopBatch}
                              className="px-4 py-2 bg-red-50 dark:bg-red-500/15 hover:bg-red-100 dark:hover:bg-red-500/25 text-red-600 dark:text-red-300 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 border border-red-200 dark:border-red-500/30 cursor-pointer"
                            >
                              <StopCircle className="w-4 h-4" />
                              <span>إلغاء المعالجة</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={handleResetBatch}
                              className="px-4 py-2 bg-slate-100 dark:bg-[#1B202C] hover:bg-slate-200 dark:hover:bg-[#232938] text-slate-700 dark:text-slate-200 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                              title="بدء دفعة جديدة وتفريغ الطابور الحالي"
                            >
                              <Plus className="w-4 h-4" />
                              <span>دفعة جديدة</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Newly Added Files Toast Banner */}
                      {justAddedCount && (
                        <div className="p-3 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-300 text-xs font-bold rounded-xl flex items-center justify-between gap-2 animate-fadeIn">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                            <span>
                              تمت إضافة {justAddedCount} {justAddedCount === 1 ? 'ملف جديد' : justAddedCount === 2 ? 'ملفان جديدان' : 'ملفات جديدة'} إلى طابور التحويل بنجاح!
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setJustAddedCount(null)}
                            className="text-emerald-600 dark:text-emerald-400 hover:text-emerald-800 p-1 cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}

                      {/* Overall Batch Progress Bar & Estimated Remaining Time */}
                      {isBatchRunning && batchEta && (
                        <div className="p-4 sm:p-5 rounded-xl bg-blue-50/70 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 space-y-3 animate-fadeIn">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0">
                                <Layers className="w-4 h-4" />
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">شريط التقدم الإجمالي:</span>
                                  <span className="text-blue-700 dark:text-blue-400 font-black text-sm tabular-nums">{batchEta.overallPercentage}%</span>
                                </div>
                                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium tabular-nums">
                                  أُنجز {batchEta.completedFiles} من أصل {batchEta.totalFiles} ملفات ({formatBytes(batchEta.processedBytes)} من {formatBytes(batchEta.totalBytes)})
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 bg-white dark:bg-[#141720] py-2 px-3.5 rounded-lg border border-blue-200/80 dark:border-[#232938] self-start sm:self-auto">
                              <Clock className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                              <div className="text-right">
                                <div className="flex items-center gap-1.5 text-xs">
                                  <span className="font-bold text-slate-600 dark:text-slate-400">الوقت المتوقع المتبقي:</span>
                                  <span className="font-black text-blue-900 dark:text-blue-300 bg-blue-100/80 dark:bg-blue-500/20 px-2 py-0.5 rounded font-mono text-xs tabular-nums">
                                    {batchEta.formattedEta}
                                  </span>
                                </div>
                                <span className="text-[10px] text-slate-400 dark:text-slate-500 block font-medium mt-0.5 tabular-nums">
                                  بناءً على ({batchEta.remainingFiles} ملفات متبقية • {formatBytes(batchEta.remainingBytes)})
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <div dir="rtl" className="w-full bg-slate-200 dark:bg-[#232938] rounded-full h-2 overflow-hidden flex">
                              <div
                                className="bg-blue-600 dark:bg-blue-400 h-full rounded-full transition-all duration-300"
                                style={{ width: `${Math.max(4, batchEta.overallPercentage)}%` }}
                              />
                            </div>

                            <div className="flex justify-between items-center text-[10px] text-slate-500 dark:text-slate-400 font-mono px-0.5 tabular-nums">
                              <span>سرعة المعالجة: <strong className="text-slate-700 dark:text-slate-200">{batchEta.speedFormatted}</strong></span>
                              <span>الحجم المتبقي: <strong className="text-slate-700 dark:text-slate-200">{formatBytes(batchEta.remainingBytes)}</strong></span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Scenario 1: Download Completed So Far */}
                      {isBatchRunning && batchDoneCount > 0 && (
                        <div className="bg-slate-100 dark:bg-[#171B26] border border-slate-200 dark:border-[#232938] rounded-xl p-4 sm:p-5 flex flex-col md:flex-row items-center justify-between gap-4 animate-fadeIn">
                          <div className="space-y-1 text-center md:text-right">
                            <span className="font-bold text-sm sm:text-base text-slate-900 dark:text-slate-100 tabular-nums">
                              أُنجز {batchDoneCount} من أصل {batchTotalCount} ملف
                            </span>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              يمكنك تحميل الجزء المُنجز الآن كملف ZIP دون إيقاف المعالجة.
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto justify-center md:justify-end">
                            <button
                              type="button"
                              id="btn-download-completed-so-far"
                              onClick={handleDownloadCompletedSoFar}
                              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs sm:text-sm rounded-lg shadow-xs transition-all flex items-center gap-2 cursor-pointer"
                            >
                              <Download className="w-4 h-4 text-white" />
                              <span>تحميل المنجز حتى الآن ({batchDoneCount}) (.ZIP)</span>
                            </button>

                            <button
                              type="button"
                              onClick={handleExportRemainingQueueManifest}
                              className="px-3.5 py-2 bg-white dark:bg-[#1B202C] hover:bg-slate-50 dark:hover:bg-[#232938] text-slate-700 dark:text-slate-200 font-semibold text-xs rounded-lg border border-slate-200 dark:border-[#2A3142] flex items-center gap-1.5 transition-all cursor-pointer"
                            >
                              <FileText className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                              <span>كشف المتبقي ({batchRemainingCount})</span>
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Scenario 2: Download Station */}
                      {!isBatchRunning && batchDoneCount > 0 && (
                        <div className="bg-slate-50 dark:bg-[#171B26] border border-slate-200 dark:border-[#232938] rounded-xl p-4 sm:p-5 space-y-4 animate-fadeIn">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-[#232938]">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <h4 className="font-bold text-sm sm:text-base text-slate-900 dark:text-slate-100">
                                  تحميل الملفات المكتملة
                                </h4>
                                <span className="px-2 py-0.5 rounded bg-slate-200 dark:bg-[#232938] text-slate-700 dark:text-slate-300 text-xs font-semibold tabular-nums">
                                  {batchDoneCount} مكتمل
                                </span>
                              </div>
                              <p className="text-xs text-slate-500 dark:text-slate-400">
                                اختر تحميل ما لم يتم تحميله بعد، أو تحميل المجلد كاملاً.
                              </p>
                            </div>

                            <div className="flex items-center gap-2 bg-white dark:bg-[#141720] p-1.5 rounded-lg border border-slate-200 dark:border-[#2A3142] text-xs self-start sm:self-auto">
                              <label className="flex items-center gap-2 cursor-pointer select-none px-2 py-1 rounded">
                                <input
                                  type="checkbox"
                                  checked={zipIncludeSources}
                                  onChange={(e) => setZipIncludeSources(e.target.checked)}
                                  className="w-3.5 h-3.5 rounded text-blue-600 accent-blue-600 cursor-pointer"
                                />
                                <span className="text-slate-700 dark:text-slate-300 font-medium">
                                  تضمين Markdown ونصوص Text في الـ ZIP
                                </span>
                              </label>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <button
                              type="button"
                              id="btn-download-undownloaded-zip"
                              onClick={handleDownloadRemainingUnDownloaded}
                              disabled={batchUndownloadedCount === 0}
                              className={`p-3.5 rounded-xl font-bold text-xs sm:text-sm flex flex-col justify-between gap-2 transition-all text-right border ${
                                batchUndownloadedCount > 0
                                  ? 'bg-blue-600 hover:bg-blue-700 text-white border-blue-600 cursor-pointer shadow-xs'
                                  : 'bg-slate-100 dark:bg-[#141720] text-slate-400 dark:text-slate-600 border-slate-200 dark:border-[#232938] cursor-not-allowed'
                              }`}
                            >
                              <div className="flex items-center justify-between w-full">
                                <div className="flex items-center gap-2">
                                  <ArrowDownToLine className={`w-4 h-4 ${batchUndownloadedCount > 0 ? 'text-white' : 'text-slate-400 dark:text-slate-600'}`} />
                                  <span className="font-bold text-sm">
                                    تحميل الجزء الباقي (الذي لم يُحمَّل بعد)
                                  </span>
                                </div>
                                <span className={`px-2 py-0.5 rounded text-xs font-mono font-bold tabular-nums ${
                                  batchUndownloadedCount > 0 ? 'bg-white text-blue-700' : 'bg-slate-200 dark:bg-[#232938] text-slate-500'
                                }`}>
                                  {batchUndownloadedCount} ملف
                                </span>
                              </div>
                              <p className="text-[11px] leading-relaxed opacity-90">
                                {batchUndownloadedCount > 0
                                  ? `يحمّل فقط الملفات (${batchUndownloadedCount}) التي لم تسبق تنزيلها.`
                                  : 'تم تحميل كافة الملفات المكتملة مسبقاً.'}
                              </p>
                            </button>

                            <button
                              type="button"
                              id="btn-download-master-archive-zip"
                              onClick={handleDownloadFullBatchZip}
                              disabled={batchDoneCount === 0}
                              className="p-3.5 rounded-xl bg-slate-800 dark:bg-[#1E2433] hover:bg-slate-900 dark:hover:bg-[#262E42] text-white font-bold text-xs sm:text-sm flex flex-col justify-between gap-2 transition-all text-right border border-slate-800 dark:border-[#2E364D] cursor-pointer shadow-xs"
                            >
                              <div className="flex items-center justify-between w-full">
                                <div className="flex items-center gap-2">
                                  <FolderDown className="w-4 h-4 text-slate-300" />
                                  <span className="font-bold text-sm">
                                    تحميل الكل ZIP (كافة الملفات)
                                  </span>
                                </div>
                                <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-slate-700 text-white tabular-nums">
                                  {batchDoneCount} ملف
                                </span>
                              </div>
                              <p className="text-[11px] leading-relaxed opacity-80">
                                تنزيل أرشيف شامل لكافة الملفات المنجزة.
                              </p>
                            </button>
                          </div>

                          {(batchPendingCount > 0 || batchErrorCount > 0) && (
                            <div className="flex flex-wrap items-center justify-between gap-2.5 pt-3 border-t border-slate-200 dark:border-[#232938] text-xs">
                              <div className="text-slate-600 dark:text-slate-400 flex items-center gap-2">
                                <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                                <span>
                                  يوجد {batchPendingCount > 0 ? `${batchPendingCount} في قائمة الانتظار` : ''}
                                  {batchPendingCount > 0 && batchErrorCount > 0 ? ' و ' : ''}
                                  {batchErrorCount > 0 ? `${batchErrorCount} تعثر تحويلها` : ''}
                                </span>
                              </div>

                              <div className="flex flex-wrap items-center gap-2">
                                {batchPendingCount > 0 && (
                                  <button
                                    type="button"
                                    onClick={handleResumeRemainingBatch}
                                    className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                                  >
                                    <Play className="w-3.5 h-3.5" />
                                    <span>استئناف تحويل الملفات المتبقية ({batchPendingCount})</span>
                                  </button>
                                )}
                                {batchErrorCount > 0 && (
                                  <button
                                    type="button"
                                    onClick={handleRetryAllFailed}
                                    className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                                  >
                                    <RefreshCw className="w-3.5 h-3.5" />
                                    <span>إعادة محاولة المتعثرة ({batchErrorCount})</span>
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={handleExportRemainingQueueManifest}
                                  className="px-3 py-1.5 bg-white dark:bg-[#1B202C] hover:bg-slate-100 dark:hover:bg-[#232938] text-slate-700 dark:text-slate-200 font-medium rounded-lg border border-slate-200 dark:border-[#2A3142] transition-all flex items-center gap-1.5 cursor-pointer"
                                >
                                  <FileText className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                                  <span>كشف الملفات المتبقية</span>
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Add More Files Area */}
                      <div
                        onClick={() => addMoreFilesInputRef.current?.click()}
                        className="p-4 rounded-xl border-2 border-dashed border-blue-200 dark:border-blue-500/30 hover:border-blue-400 bg-blue-50/40 dark:bg-blue-500/5 hover:bg-blue-50/80 dark:hover:bg-blue-500/10 transition-all flex flex-col sm:flex-row items-center justify-between gap-3 cursor-pointer group"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-lg bg-blue-600 group-hover:bg-blue-700 text-white flex items-center justify-center shrink-0 transition-colors">
                            <Plus className="w-5 h-5" />
                          </div>
                          <div>
                            <h4 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-slate-100">
                              + إضافة ملفات أخرى للتحويل المستمر في الخلفية
                            </h4>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">
                              اسحب وأفلت ملفات PDF أو Word أو صوراً — تُرفع وتُعالج تلقائياً مع متابعة التقدم حتى إذا أغلقت المتصفح
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
                          <span className="px-3.5 py-2 bg-white dark:bg-[#1B202C] group-hover:bg-blue-600 text-blue-700 dark:text-blue-300 group-hover:text-white border border-blue-200 dark:border-[#2A3142] group-hover:border-blue-600 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5">
                            <UploadCloud className="w-3.5 h-3.5" />
                            <span>اختيار ملفات إضافية</span>
                          </span>
                          <input
                            ref={addMoreFilesInputRef}
                            type="file"
                            multiple
                            accept=".pdf,.docx,.doc,image/*,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                            onChange={(e) => {
                              if (e.target.files && e.target.files.length > 0) {
                                handleAddFilesToQueue(Array.from(e.target.files));
                                e.target.value = '';
                              }
                            }}
                            className="hidden"
                          />
                        </div>
                      </div>

                      {/* Filter Tabs & Search Bar */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                        <div className="flex flex-wrap items-center gap-1.5 text-xs tabular-nums">
                          <button
                            type="button"
                            onClick={() => setBatchFilterTab('all')}
                            className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                              batchFilterTab === 'all'
                                ? 'bg-blue-600 text-white'
                                : 'bg-slate-100 dark:bg-[#1B202C] hover:bg-slate-200 dark:hover:bg-[#232938] text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            الكل ({batchTotalCount})
                          </button>
                          <button
                            type="button"
                            onClick={() => setBatchFilterTab('done')}
                            className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                              batchFilterTab === 'done'
                                ? 'bg-emerald-600 text-white'
                                : 'bg-emerald-50 dark:bg-emerald-500/15 hover:bg-emerald-100 text-emerald-800 dark:text-emerald-300'
                            }`}
                          >
                            المكتملة ({batchDoneCount})
                          </button>
                          <button
                            type="button"
                            onClick={() => setBatchFilterTab('undownloaded')}
                            className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                              batchFilterTab === 'undownloaded'
                                ? 'bg-indigo-600 text-white'
                                : 'bg-indigo-50 dark:bg-indigo-500/15 hover:bg-indigo-100 text-indigo-800 dark:text-indigo-300'
                            }`}
                          >
                            لم تُحمَّل بعد ({batchUndownloadedCount})
                          </button>
                          {batchPendingCount > 0 && (
                            <button
                              type="button"
                              onClick={() => setBatchFilterTab('pending')}
                              className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                                batchFilterTab === 'pending'
                                  ? 'bg-amber-600 text-white'
                                  : 'bg-amber-50 dark:bg-amber-500/15 hover:bg-amber-100 text-amber-800 dark:text-amber-300'
                              }`}
                            >
                              في الانتظار ({batchPendingCount})
                            </button>
                          )}
                          {batchErrorCount > 0 && (
                            <button
                              type="button"
                              onClick={() => setBatchFilterTab('error')}
                              className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                                batchFilterTab === 'error'
                                  ? 'bg-red-600 text-white'
                                  : 'bg-red-50 dark:bg-red-500/15 hover:bg-red-100 text-red-800 dark:text-red-300'
                              }`}
                            >
                              تعثرت ({batchErrorCount})
                            </button>
                          )}
                        </div>

                        {batchTotalCount > 4 && (
                          <div className="relative min-w-[200px]">
                            <input
                              type="text"
                              value={batchSearchQuery}
                              onChange={(e) => setBatchSearchQuery(e.target.value)}
                              placeholder="بحث باسم الكتاب..."
                              className="w-full text-xs px-3 py-1.5 pr-8 pl-8 rounded-lg border border-slate-200 dark:border-[#2A3142] bg-white dark:bg-[#10131C] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2.5" />
                            {batchSearchQuery && (
                              <button
                                type="button"
                                onClick={() => setBatchSearchQuery('')}
                                className="absolute left-2.5 top-2 text-slate-400 hover:text-slate-600"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Files List */}
                      <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
                        {filteredBatchQueue.length === 0 ? (
                          <div className="text-center py-8 text-slate-400 dark:text-slate-500 text-xs">
                            لا توجد ملفات مطابقة للفلتر المحدد
                          </div>
                        ) : (
                          filteredBatchQueue.map((item, idx) => (
                            <div
                              key={item.id}
                              className={`p-3.5 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                                item.status === 'processing'
                                  ? 'bg-blue-50/60 dark:bg-blue-500/10 border-blue-300 dark:border-blue-500/30'
                                  : item.status === 'done'
                                  ? 'bg-emerald-50/40 dark:bg-emerald-500/5 border-emerald-200 dark:border-emerald-500/20'
                                  : item.status === 'error'
                                  ? 'bg-red-50/40 dark:bg-red-500/10 border-red-200 dark:border-red-500/30'
                                  : 'bg-slate-50 dark:bg-[#171B26] border-slate-200 dark:border-[#232938]'
                              }`}
                            >
                              <div className="flex items-center gap-3 min-w-0 flex-1">
                                <div
                                  className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                                    item.status === 'done'
                                      ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400'
                                      : item.status === 'processing'
                                      ? 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400'
                                      : item.status === 'error'
                                      ? 'bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400'
                                      : 'bg-white dark:bg-[#1B202C] text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-[#2A3142]'
                                  }`}
                                >
                                  {item.status === 'done' ? (
                                    <CheckCircle2 className="w-5 h-5" />
                                  ) : item.status === 'processing' ? (
                                    <RefreshCw className="w-5 h-5 animate-spin" />
                                  ) : (
                                    <FileText className="w-5 h-5" />
                                  )}
                                </div>

                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-[#1B202C] px-1.5 py-0.5 rounded tabular-nums">
                                      #{idx + 1}
                                    </span>
                                    <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 truncate" title={item.name}>
                                      {item.name}
                                    </p>
                                    {item.status === 'done' && (
                                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 ${
                                        item.isDownloaded
                                          ? 'bg-slate-100 dark:bg-[#1B202C] text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-[#2A3142]'
                                          : 'bg-blue-100 dark:bg-blue-500/20 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-500/30'
                                      }`}>
                                        {item.isDownloaded ? (
                                          <>
                                            <Check className="w-3 h-3" />
                                            <span>تم التحميل</span>
                                          </>
                                        ) : (
                                          <>
                                            <Download className="w-3 h-3" />
                                            <span>جاهز للتحميل</span>
                                          </>
                                        )}
                                      </span>
                                    )}
                                  </div>

                                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                                    <span>{formatBytes(item.size)}</span>
                                    <span>•</span>
                                    {item.status === 'done' && (
                                      <span className="text-emerald-700 dark:text-emerald-400 font-bold">
                                        اكتمل ({item.result?.totalPages || 1} صفحة)
                                      </span>
                                    )}
                                    {item.status === 'processing' && (
                                      <span className="text-blue-700 dark:text-blue-400 font-bold">
                                        جاري التحويل... {item.progress ? `(${item.progress}%)` : ''}
                                      </span>
                                    )}
                                    {item.status === 'pending' && <span className="text-slate-400 dark:text-slate-500">في الانتظار (في الطابور)</span>}
                                    {item.status === 'error' && (
                                      <span className="text-red-600 dark:text-red-400 font-semibold">{item.error || 'تعذر التحويل'}</span>
                                    )}
                                    <span>•</span>
                                    <span
                                      className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-[#1B202C] px-2 py-0.5 rounded"
                                      title={item.lastUpdatedAt ? new Date(item.lastUpdatedAt).toLocaleTimeString('ar-EG') : undefined}
                                    >
                                      <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                                      <span>آخر تحديث: {formatRelativeTime(item.lastUpdatedAt, nowTimestamp)}</span>
                                    </span>
                                  </div>

                                  {item.status === 'processing' && (
                                    <div className="space-y-1 mt-1.5 max-w-md">
                                      {item.statusMessage && (
                                        <p className="text-[10px] text-blue-800 dark:text-blue-300 font-medium truncate">
                                          {item.statusMessage}
                                        </p>
                                      )}
                                      <div dir="rtl" className="w-full bg-blue-100 dark:bg-[#232938] rounded-full h-1.5 overflow-hidden flex">
                                        <div
                                          className="bg-blue-600 dark:bg-blue-400 h-full rounded-full transition-all duration-300"
                                          style={{ width: `${Math.max(6, item.progress || 10)}%` }}
                                        />
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Action buttons per file */}
                              <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                                {item.status === 'pending' && (
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveQueueItem(item.id)}
                                    className="p-1.5 hover:bg-red-50 dark:hover:bg-red-500/15 text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded-lg transition-colors cursor-pointer"
                                    title="إزالة هذا الملف من قائمة الانتظار"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}

                                {item.status === 'done' && item.result && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => handleDownloadSingleDocx(item.result!, item.name, item.id)}
                                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer"
                                      title="تنزيل ملف Word منفصل"
                                    >
                                      <Download className="w-3.5 h-3.5" />
                                      <span>تنزيل Word</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleViewBatchItemResult(item.result!)}
                                      className="px-2.5 py-1.5 bg-white dark:bg-[#1B202C] hover:bg-slate-100 dark:hover:bg-[#232938] text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-lg border border-slate-200 dark:border-[#2A3142] transition-colors flex items-center gap-1 cursor-pointer"
                                      title="معاينة محتوى المستند"
                                    >
                                      <Eye className="w-3.5 h-3.5" />
                                      <span>معاينة</span>
                                    </button>
                                  </>
                                )}

                                {item.status === 'error' && (
                                  <button
                                    type="button"
                                    onClick={() => handleRetryBatchItem(item.id)}
                                    className="px-2.5 py-1.5 bg-amber-50 dark:bg-amber-500/15 hover:bg-amber-100 dark:hover:bg-amber-500/25 text-amber-800 dark:text-amber-300 text-xs font-bold rounded-lg border border-amber-200 dark:border-amber-500/30 transition-colors flex items-center gap-1 cursor-pointer"
                                  >
                                    {(!item.file || item.file.size === 0) ? (
                                      <>
                                        <UploadCloud className="w-3.5 h-3.5" />
                                        <span>إعادة رفع الملف</span>
                                      </>
                                    ) : (
                                      <>
                                        <RefreshCw className="w-3.5 h-3.5" />
                                        <span>إعادة محاولة</span>
                                      </>
                                    )}
                                  </button>
                                )}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  ) : (
                    serverJobs.length === 0 && (
                      <Dropzone
                        onStartConversion={handleStartConversion}
                        isProcessing={isProcessing}
                      />
                    )
                  )}
                </>
              );
            })()}

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

      {/* Hidden file input for re-attaching files when browser memory is cleared */}
      <input
        type="file"
        ref={retryFileInputRef}
        onChange={handleRetryFileSelected}
        accept=".pdf,.docx,.doc,image/*"
        className="hidden"
      />

      {/* Team Public Link, Passcode & Active Free-Tier Models Modal */}
      <TeamShareModal
        isOpen={isTeamShareOpen}
        onClose={() => setIsTeamShareOpen(false)}
        authStatus={authStatus}
        onAuthStatusUpdated={refreshAuthStatus}
      />
    </div>
  );
}

