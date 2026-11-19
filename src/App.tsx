import { useState, useEffect, useRef, useCallback } from 'react';
import { Navbar } from './components/Navbar';
import { Dropzone } from './components/Dropzone';
import { ProcessingOverlay } from './components/ProcessingOverlay';
import { OutputViewer } from './components/OutputViewer';
import { HistoryList } from './components/HistoryList';
import { HistoryDrawer } from './components/HistoryDrawer';
import { SmartCompilerWorkspace } from './components/SmartCompilerWorkspace';
import { TeamAccessGate } from './components/TeamAccessGate';
import { AdminConsolePage } from './components/AdminConsolePage';
import { ServerJobsPanel } from './components/ServerJobsPanel';
import { HistoryRecoveryBanner } from './components/HistoryRecoveryBanner';
import { BatchQueuePanel } from './components/BatchQueuePanel';
import {
  CONVERSION_DEFAULTS,
  ConversionOptions,
  ConversionProgress,
  ConversionResult,
  ConversionResumeState,
  SavedConversion,
} from './types';
import type { ServerJobMeta } from './model/jobs';
import { fetchServerJobDetail, fetchServerJobDocxBlob } from './api/serverJobsApi';
import { convertDocumentFile } from './utils/documentConverter';
import {
  saveToHistory,
  getHistory,
  deleteFromHistory,
  clearHistory,
  markHistoryDownloaded,
  setLastActiveId,
  getBatchSession,
  markBatchItemDownloadedInSession,
} from './utils/historyStorage';
import { downloadDocx } from './utils/docxExporter';
import { useTheme } from './utils/theme';
import { useConnectionKeepAlive } from './utils/connectionKeepAlive';
import { useTeamAuth } from './hooks/useTeamAuth';
import { useServerJobs } from './hooks/useServerJobs';
import { useBatchQueue } from './hooks/useBatchQueue';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';

export default function App() {
  const { theme, toggleTheme } = useTheme();
  const [activeView, setActiveView] = useState<'home' | 'viewer' | 'compiler'>('home');

  const {
    isAdminMode,
    authStatus,
    isCheckingAuth,
    isTeamAccessAllowed,
    refreshAuthStatus,
    handleExitAdminMode,
  } = useTeamAuth(useCallback(() => setActiveView('home'), []));

  const [isProcessing, setIsProcessing] = useState(false);
  const [processingFileName, setProcessingFileName] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [conversionResult, setConversionResult] = useState<ConversionResult | null>(null);
  const [progress, setProgress] = useState<ConversionProgress | null>(null);
  const [savedItems, setSavedItems] = useState<SavedConversion[]>([]);
  const [isHistoryDrawerOpen, setIsHistoryDrawerOpen] = useState(false);
  const [activeSavedId, setActiveSavedId] = useState<string | null>(null);
  const [notificationMessage, setNotificationMessage] = useState<string | null>(null);
  const notificationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [pausedConversion, setPausedConversion] = useState<{
    file: File;
    error: string;
    isRateLimit: boolean;
    resumeState?: ConversionResumeState;
    partialResult?: ConversionResult;
    options?: ConversionOptions;
  } | null>(null);

  const singleFileAbortControllerRef = useRef<AbortController | null>(null);
  const options: ConversionOptions = CONVERSION_DEFAULTS;

  useEffect(() => {
    return () => {
      if (notificationTimerRef.current) {
        clearTimeout(notificationTimerRef.current);
      }
    };
  }, []);

  const notify = useCallback((msg: string, durationMs = 5000) => {
    setNotificationMessage(msg);
    if (notificationTimerRef.current) {
      clearTimeout(notificationTimerRef.current);
    }
    notificationTimerRef.current = setTimeout(() => {
      setNotificationMessage(null);
      notificationTimerRef.current = null;
    }, durationMs);
  }, []);

  const refreshHistoryList = useCallback(async () => {
    try {
      const items = await getHistory();
      setSavedItems(items);
    } catch (err) {
      console.error('Failed to refresh history', err);
    }
  }, []);

  const handleServerJobError = useCallback((msg: string) => {
    setErrorMessage(msg);
  }, []);

  const {
    serverJobs,
    hasActiveServerJobs,
    activeServerJobsCount,
    loadingServerJobId,
    setLoadingServerJobId,
    fetchServerJobs,
    submitFilesToServerBackgroundJobs,
    handlePauseServerJob,
    handleResumeServerJob,
    handleDeleteServerJob,
    handleClearFinishedServerJobs,
  } = useServerJobs({
    isTeamAccessAllowed,
    refreshHistoryList,
    notify,
    onError: handleServerJobError,
  });

  const {
    batchQueue,
    setBatchQueue,
    isBatchRunning,
    isBatchFinished,
    autoRetryBatch,
    setAutoRetryBatch,
    batchEta,
    batchFilterTab,
    setBatchFilterTab,
    batchSearchQuery,
    setBatchSearchQuery,
    zipIncludeSources,
    setZipIncludeSources,
    isBatchDragOver,
    setIsBatchDragOver,
    justAddedCount,
    setJustAddedCount,
    nowTimestamp,
    addMoreFilesInputRef,
    retryFileInputRef,
    hydrateFromPersistence,
    handleAddFilesToQueue,
    handleRemoveQueueItem,
    handleStopBatch,
    handleResetBatch,
    handleDownloadCompletedSoFar,
    handleDownloadRemainingUnDownloaded,
    handleDownloadFullBatchZip,
    handleExportRemainingQueueManifest,
    handleResumeRemainingBatch,
    handleRestoreSavedHistoryToBatch,
    handleDownloadAllHistoryZip,
    handleRetryBatchItem,
    handleRetryFileSelected,
    handleRetryAllFailed,
  } = useBatchQueue({
    refreshHistoryList,
    onProgressUpdate: setProgress,
    onProcessingFileName: setProcessingFileName,
    submitFilesToServerBackgroundJobs,
    notify,
    onError: setErrorMessage,
  });

  // Load conversion history on initial mount & restore any active/previous session
  useEffect(() => {
    async function initStorageAndSession() {
      try {
        const items = await getHistory();
        setSavedItems(items);
        const persistedBatch = await getBatchSession();
        hydrateFromPersistence(items, persistedBatch);
      } catch (err) {
        console.error('Failed to load history or restore session', err);
      }
    }
    void initStorageAndSession();
  }, [hydrateFromPersistence]);

  // Prevent accidental page refresh when there are ongoing processes or uploaded files in queue
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isProcessing || isBatchRunning) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isProcessing, isBatchRunning]);

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

  const handleCancelSingleProcessing = () => {
    if (singleFileAbortControllerRef.current) {
      singleFileAbortControllerRef.current.abort();
      singleFileAbortControllerRef.current = null;
    }
    setPausedConversion(null);
    setIsProcessing(false);
    setProgress(null);
    setErrorMessage(null);
    setActiveView('home');
  };

  const handleResumePausedConversion = () => {
    if (!pausedConversion) return;
    const file = pausedConversion.file;
    const isDocx =
      file.name.toLowerCase().endsWith('.docx') ||
      file.type.includes('word') ||
      file.type.includes('officedocument');
    if (isDocx) {
      void handleDocxSelect(file);
    } else {
      void handleFileSelect(file, pausedConversion.resumeState, pausedConversion.options);
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

  const handleFileSelect = async (
    file: File,
    resumeState?: ConversionResumeState,
    customOptions?: ConversionOptions
  ) => {
    setErrorMessage(null);
    setPausedConversion(null);
    setIsProcessing(true);
    setProcessingFileName(file.name);
    const activeOpts = customOptions || options;

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
          error:
            err.message ||
            (isRateLimit
              ? 'تم الوصول إلى الحد المؤقت للطلبات (Rate limit). يرجى الانتظار ثوانٍ قليلة...'
              : 'حدث توقف مؤقت أثناء المعالجة.'),
          isRateLimit,
          resumeState: err.resumeState,
          partialResult: partialRes,
          options: activeOpts,
        };

        setPausedConversion(pausedInfo);
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
      }
    }
  };

  const handleStartConversion = (files: File[], customOptions?: ConversionOptions) => {
    setErrorMessage(null);
    if (!files || files.length === 0) return;
    handleAddFilesToQueue(files, customOptions);
  };

  const handleOpenServerJobResult = async (job: ServerJobMeta) => {
    setLoadingServerJobId(job.id);
    setErrorMessage(null);
    try {
      const { ok, data } = await fetchServerJobDetail(job.id);
      if (!ok || !data?.success) {
        throw new Error(data?.error || 'تعذر تحميل نتيجة المهمة من الخادم.');
      }

      if (data.result) {
        setConversionResult(data.result);
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
      const blob = await fetchServerJobDocxBlob(job.id);
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
      notify(`تم تنزيل مستند Word "${finalFileName}" بنجاح.`, 4000);
    } catch (err: any) {
      setErrorMessage(err?.message || 'تعذر تنزيل ملف Word من الخادم.');
    } finally {
      setLoadingServerJobId(null);
    }
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
        void markBatchItemDownloadedInSession(itemId);
        void markHistoryDownloaded(itemId);
      }
      notify(`تم تنزيل مستند "${baseName}.docx" بنجاح!`, 4000);
    } catch (err: any) {
      console.error('Download single docx error:', err);
      setErrorMessage(`تعذر إنشاء ملف Word (.docx): ${err?.message || 'خطأ أثناء تجهيز الملف'}`);
    }
  };

  const handleViewBatchItemResult = (res: ConversionResult) => {
    setConversionResult(res);
    setActiveView('viewer');
  };

  const handleDocxSelect = async (file: File) => {
    return handleFileSelect(file);
  };

  const handleSelectSavedItem = (item: SavedConversion) => {
    setErrorMessage(null);
    setProcessingFileName(item.fileName);
    setConversionResult(item.result);
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
    setConversionResult(null);
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
        onRestorePreviousBatch={() => {
          handleRestoreSavedHistoryToBatch(savedItems);
          if (savedItems.length > 0) setActiveView('home');
        }}
        onOpenSmartCompiler={() => setActiveView(activeView === 'compiler' ? 'home' : 'compiler')}
        isShowingSmartCompiler={activeView === 'compiler'}
        theme={theme}
        onToggleTheme={toggleTheme}
        activeServerJobsCount={activeServerJobsCount}
        isAdminMode={isAdminMode}
        onExitAdmin={handleExitAdminMode}
      />

      <main
        className={
          !isAdminMode && activeView === 'compiler'
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

        {/* Dedicated Supervisor / Admin Link View (?admin=1 or #admin) */}
        {isAdminMode && (
          <AdminConsolePage
            authStatus={authStatus}
            onAuthStatusUpdated={refreshAuthStatus}
            onExitAdmin={handleExitAdminMode}
          />
        )}

        {/* State 1: Single file Processing Loader */}
        {!isAdminMode && isProcessing && (
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

        {/* State 1.75: Editorial Compilation Studio & Semantic Search */}
        {!isAdminMode && !isProcessing && activeView === 'compiler' && (
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
        {!isAdminMode && !isProcessing && activeView === 'viewer' && conversionResult && (
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
        {!isAdminMode && !isProcessing && activeView === 'home' && (
          <div className="space-y-6">
            <div className="text-center space-y-1.5 max-w-xl mx-auto">
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
                تحويل وتفريغ المستندات إلى Word
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                استخراج عالي الدقة لملفات PDF والصور إلى مستندات Word منسقة — يستمر في الخلفية على الخادم دون انقطاع
              </p>
            </div>

            <ServerJobsPanel
              serverJobs={serverJobs}
              hasActiveServerJobs={hasActiveServerJobs}
              loadingServerJobId={loadingServerJobId}
              onRefresh={() => void fetchServerJobs()}
              onClearFinished={() => void handleClearFinishedServerJobs()}
              onDownloadDocx={(job) => void handleDownloadServerJobDocx(job)}
              onOpenResult={(job) => void handleOpenServerJobResult(job)}
              onPause={(jobId) => void handlePauseServerJob(jobId)}
              onResume={(jobId) => void handleResumeServerJob(jobId)}
              onDelete={(jobId) => void handleDeleteServerJob(jobId)}
            />

            {(!batchQueue || batchQueue.length === 0) && (
              <HistoryRecoveryBanner
                savedCount={savedItems.length}
                onRestoreToBatch={() => {
                  handleRestoreSavedHistoryToBatch(savedItems);
                  setActiveView('home');
                }}
                onDownloadAllZip={() => void handleDownloadAllHistoryZip(savedItems)}
              />
            )}

            {serverJobs.length > 0 && (
              <Dropzone
                onStartConversion={handleStartConversion}
                isProcessing={isProcessing}
              />
            )}

            {batchQueue && batchQueue.length > 0 ? (
              <BatchQueuePanel
                batchQueue={batchQueue}
                isBatchRunning={isBatchRunning}
                isBatchFinished={isBatchFinished}
                autoRetryBatch={autoRetryBatch}
                onChangeAutoRetry={setAutoRetryBatch}
                batchEta={batchEta}
                batchFilterTab={batchFilterTab}
                onChangeFilterTab={setBatchFilterTab}
                batchSearchQuery={batchSearchQuery}
                onChangeSearchQuery={setBatchSearchQuery}
                zipIncludeSources={zipIncludeSources}
                onChangeZipIncludeSources={setZipIncludeSources}
                isBatchDragOver={isBatchDragOver}
                onChangeBatchDragOver={setIsBatchDragOver}
                justAddedCount={justAddedCount}
                onDismissJustAdded={() => setJustAddedCount(null)}
                nowTimestamp={nowTimestamp}
                addMoreFilesInputRef={addMoreFilesInputRef}
                onAddFiles={(files) => handleAddFilesToQueue(files)}
                onStopBatch={handleStopBatch}
                onResetBatch={handleResetBatch}
                onDownloadCompletedSoFar={() => void handleDownloadCompletedSoFar()}
                onDownloadRemainingUnDownloaded={() => void handleDownloadRemainingUnDownloaded()}
                onDownloadFullBatchZip={() => void handleDownloadFullBatchZip()}
                onExportRemainingManifest={handleExportRemainingQueueManifest}
                onResumeRemainingBatch={handleResumeRemainingBatch}
                onRetryAllFailed={() => void handleRetryAllFailed()}
                onRemoveQueueItem={handleRemoveQueueItem}
                onDownloadSingleDocx={(res, name, id) => void handleDownloadSingleDocx(res, name, id)}
                onViewBatchItemResult={handleViewBatchItemResult}
                onRetryBatchItem={(itemId) => void handleRetryBatchItem(itemId)}
              />
            ) : (
              serverJobs.length === 0 && (
                <Dropzone
                  onStartConversion={handleStartConversion}
                  isProcessing={isProcessing}
                />
              )
            )}

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

      <HistoryDrawer
        isOpen={isHistoryDrawerOpen}
        onClose={() => setIsHistoryDrawerOpen(false)}
        items={savedItems}
        onSelect={handleSelectSavedItem}
        onDelete={handleDeleteSavedItem}
        onClearAll={handleClearAllHistory}
        onMarkDownloaded={handleMarkDownloaded}
      />

      <input
        type="file"
        ref={retryFileInputRef}
        onChange={handleRetryFileSelected}
        accept=".pdf,.docx,.doc,image/*"
        className="hidden"
      />
    </div>
  );
}
