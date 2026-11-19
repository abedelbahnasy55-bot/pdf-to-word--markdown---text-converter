import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  CONVERSION_DEFAULTS,
  ConversionOptions,
  ConversionProgress,
  SavedConversion,
} from '../types';
import type { BatchFileItem, BatchFilterTab } from '../model/batch';
import { QueuedDocument } from '../utils/documentMerger';
import { convertDocumentFile } from '../utils/documentConverter';
import {
  saveToHistory,
  markHistoryDownloaded,
  formatBytes,
  saveBatchSession,
  clearBatchSession,
  markBatchItemDownloadedInSession,
} from '../utils/historyStorage';
import { downloadBatchAsZip } from '../utils/batchZipExporter';
import { safeDownloadText } from '../utils/fileDownloader';
import {
  BatchEtaInfo,
  StableBatchEtaState,
  calculateStableBatchEta,
} from '../utils/etaCalculator';
import type { ClientPolicyState } from '../model/governance';
import { reportClientTelemetry } from '../api/governanceApi';

interface UseBatchQueueParams {
  refreshHistoryList: () => Promise<void>;
  onProgressUpdate: (prog: ConversionProgress) => void;
  onProcessingFileName: (name: string) => void;
  submitFilesToServerBackgroundJobs: (
    files: File[],
    customOptions?: ConversionOptions
  ) => Promise<void>;
  notify: (msg: string, durationMs?: number) => void;
  onError: (msg: string | null) => void;
  clientPolicy?: ClientPolicyState | null;
  onConversionTelemetryUpdated?: () => void;
}

function playCompletionChime(): void {
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
    osc.onended = () => {
      void ctx.close().catch(() => {});
    };
    osc.start();
    osc.stop(ctx.currentTime + 0.6);
  } catch {}
}

export function useBatchQueue({
  refreshHistoryList,
  onProgressUpdate,
  onProcessingFileName,
  submitFilesToServerBackgroundJobs,
  notify,
  onError,
  clientPolicy,
  onConversionTelemetryUpdated,
}: UseBatchQueueParams) {
  const [batchQueue, setBatchQueue] = useState<BatchFileItem[] | null>(null);
  const [isBatchRunning, setIsBatchRunning] = useState<boolean>(false);
  const [isBatchFinished, setIsBatchFinished] = useState<boolean>(false);
  const [autoRetryBatch, setAutoRetryBatch] = useState<boolean>(true);
  const autoRetryBatchRef = useRef<boolean>(true);
  useEffect(() => {
    autoRetryBatchRef.current = autoRetryBatch;
  }, [autoRetryBatch]);

  const queuePendingItemsRef = useRef<BatchFileItem[]>([]);
  const queueCompletedItemsRef = useRef<QueuedDocument[]>([]);
  const isQueueProcessingRef = useRef<boolean>(false);
  const addMoreFilesInputRef = useRef<HTMLInputElement>(null);
  const retryFileInputRef = useRef<HTMLInputElement | null>(null);
  const [retryTargetItemId, setRetryTargetItemId] = useState<string | null>(null);

  const [isBatchDragOver, setIsBatchDragOver] = useState(false);
  const [justAddedCount, setJustAddedCount] = useState<number | null>(null);
  const [batchFilterTab, setBatchFilterTab] = useState<BatchFilterTab>('all');
  const [batchSearchQuery, setBatchSearchQuery] = useState<string>('');
  const [zipIncludeSources, setZipIncludeSources] = useState<boolean>(true);

  const batchAbortControllerRef = useRef<AbortController | null>(null);
  const batchStartTimeRef = useRef<number | null>(null);
  const justAddedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [batchElapsedSeconds, setBatchElapsedSeconds] = useState<number>(0);

  useEffect(() => {
    return () => {
      if (justAddedTimerRef.current) clearTimeout(justAddedTimerRef.current);
    };
  }, []);

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
    let interval: ReturnType<typeof setInterval> | null = null;
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

    const signature = batchQueue
      .map((it) => `${it.id}:${it.status}:${it.isDownloaded ? 1 : 0}`)
      .join('|');
    const isStatusTransition = signature !== lastSavedSignatureRef.current;
    if (!isStatusTransition) return;

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

  const hydrateFromPersistence = useCallback(
    (items: SavedConversion[], persistedBatch: any[] | null) => {
      if (persistedBatch && persistedBatch.length > 0) {
        const reconstructed: BatchFileItem[] = persistedBatch.map((it) => {
          const fileObj = it.fileBlob
            ? new File([it.fileBlob], it.name, { type: it.fileType || 'application/pdf' })
            : new File([], it.name, { type: 'application/pdf' });
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
        setIsBatchFinished(reconstructed.every((it) => it.status === 'done'));
        setIsBatchRunning(false);
        queuePendingItemsRef.current = reconstructed.filter((it) => it.status === 'pending');
      } else if (items.length > 0) {
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
    },
    []
  );

  const startQueueRunner = useCallback(async () => {
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
      onProcessingFileName(currentItem.name);

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

      const activeOpts = currentItem.options || CONVERSION_DEFAULTS;
      const itemStartedAt = Date.now();
      let telemetryEventId: string | undefined;

      try {
        if (!currentFile || currentFile.size === 0) {
          throw new Error('الملف غير متوفر في الذاكرة المؤقتة. اضغط على "إعادة رفع الملف" لاختياره وتحويله مباشرة.');
        }

        const startReport = await reportClientTelemetry({
          fileName: currentFile.name,
          fileSize: currentFile.size,
          mimeType: currentFile.type || '',
          operation: isDocx ? 'docx-client-convert' : 'client-pipeline',
          status: 'started',
          startedAt: itemStartedAt,
        });
        telemetryEventId = startReport?.eventId;

        const res = await convertDocumentFile(
          currentFile,
          activeOpts,
          (prog) => {
            onProgressUpdate(prog);
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

        const wordsCount = (res.plainText || '').trim()
          ? (res.plainText || '').trim().split(/\s+/).length
          : 0;
        await reportClientTelemetry({
          eventId: telemetryEventId,
          fileName: currentFile.name,
          fileSize: currentFile.size,
          mimeType: currentFile.type || '',
          operation: isDocx ? 'docx-client-convert' : 'client-pipeline',
          status: 'completed',
          pagesCount: res.totalPages || 1,
          wordsCount,
          charsCount: (res.markdown || '').length,
          extractionMethod: isDocx ? 'docx_reader' : 'client_hybrid',
          durationMs: res.conversionDurationMs || Date.now() - itemStartedAt,
          startedAt: itemStartedAt,
          completedAt: Date.now(),
        });
        onConversionTelemetryUpdated?.();

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
          void reportClientTelemetry({
            eventId: telemetryEventId,
            fileName: currentFile.name,
            fileSize: currentFile.size,
            operation: isDocx ? 'docx-client-convert' : 'client-pipeline',
            status: 'paused',
            durationMs: Date.now() - itemStartedAt,
            startedAt: itemStartedAt,
            completedAt: Date.now(),
          });
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

        const isBlocked = Boolean(err?.isBlocked);
        if (isBlocked) {
          const msg = err?.message || 'تم تقييد عملية التحويل من قِبل المشرف.';
          await reportClientTelemetry({
            eventId: telemetryEventId,
            fileName: currentFile.name,
            fileSize: currentFile.size,
            operation: isDocx ? 'docx-client-convert' : 'client-pipeline',
            status: 'blocked',
            blockReason: msg,
            durationMs: Date.now() - itemStartedAt,
            startedAt: itemStartedAt,
            completedAt: Date.now(),
          });
          onConversionTelemetryUpdated?.();
          onError(msg);
          setBatchQueue((prev) =>
            prev
              ? prev.map((item) =>
                  item.id === currentItem.id
                    ? { ...item, status: 'error', error: msg, lastUpdatedAt: Date.now() }
                    : item
                )
              : null
          );
          continue;
        }

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
          const errText = err?.message || 'تعذر التحويل';
          await reportClientTelemetry({
            eventId: telemetryEventId,
            fileName: currentFile.name,
            fileSize: currentFile.size,
            operation: isDocx ? 'docx-client-convert' : 'client-pipeline',
            status: 'failed',
            errorMessage: errText,
            durationMs: Date.now() - itemStartedAt,
            startedAt: itemStartedAt,
            completedAt: Date.now(),
          });
          onConversionTelemetryUpdated?.();
          setBatchQueue((prev) =>
            prev
              ? prev.map((item) =>
                  item.id === currentItem.id
                    ? { ...item, status: 'error', error: errText, lastUpdatedAt: Date.now() }
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
      notify(
        count === 1
          ? 'اكتمل تحويل المستند بنجاح! يمكنك الآن تنزيله أو معاينته.'
          : `اكتمل تحويل كافة الكتب والمستندات (${count} مستندات) بنجاح! يمكنك الآن تنزيل كل ملف Word أو تحميل الحزمة الكاملة.`,
        7000
      );
    }
  }, [notify, onProcessingFileName, onProgressUpdate, refreshHistoryList]);

  const handleAddFilesToQueue = useCallback(
    (files: File[], customOptions?: ConversionOptions) => {
      if (!files || files.length === 0) return;
      onError(null);

      if (clientPolicy && (!clientPolicy.siteEnabled || !clientPolicy.conversionsEnabled)) {
        const blockMsg =
          clientPolicy.conversionBlockMessage ||
          clientPolicy.blockMessage ||
          'تم إيقاف عمليات التحويل مؤقتاً من قِبل المشرف.';
        onError(blockMsg);
        void reportClientTelemetry({
          fileName: files.map((f) => f.name).join(', ').slice(0, 180),
          fileSize: files.reduce((s, f) => s + f.size, 0),
          operation: 'client-gate',
          status: 'blocked',
          blockReason: blockMsg,
        }).then(() => onConversionTelemetryUpdated?.());
        return;
      }

      const maxFileSizeMb = clientPolicy?.globalLimits?.maxFileSizeMb || 0;
      if (maxFileSizeMb > 0) {
        const oversized = files.find((f) => f.size > maxFileSizeMb * 1024 * 1024);
        if (oversized) {
          const msg = `يتجاوز حجم الملف "${oversized.name}" الحد الأقصى المسموح به من الإدارة (${maxFileSizeMb} ميجابايت).`;
          onError(msg);
          void reportClientTelemetry({
            fileName: oversized.name,
            fileSize: oversized.size,
            operation: 'size-limit-check',
            status: 'blocked',
            blockReason: msg,
          }).then(() => onConversionTelemetryUpdated?.());
          return;
        }
      }

      const serverEligibleFiles: File[] = [];
      const clientFiles: File[] = [];
      const hasCustomPageRange = Boolean(customOptions?.pageRange?.enabled);
      const allowBackgroundJobs = clientPolicy?.featureFlags?.allowBackgroundJobs !== false;

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
          if (hasCustomPageRange || !allowBackgroundJobs) {
            clientFiles.push(f);
          } else {
            serverEligibleFiles.push(f);
          }
        } else if (isDocx) {
          clientFiles.push(f);
        }
      }

      if (serverEligibleFiles.length === 0 && clientFiles.length === 0) {
        onError('يرجى اختيار ملفات PDF أو مستندات Word (.docx) أو صور صالحة.');
        return;
      }

      if (serverEligibleFiles.length > 0) {
        void submitFilesToServerBackgroundJobs(serverEligibleFiles, customOptions);
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
      if (justAddedTimerRef.current) clearTimeout(justAddedTimerRef.current);
      justAddedTimerRef.current = setTimeout(() => {
        setJustAddedCount(null);
        justAddedTimerRef.current = null;
      }, 4500);

      if (!isQueueProcessingRef.current) {
        void startQueueRunner();
      }
    },
    [clientPolicy, onConversionTelemetryUpdated, onError, startQueueRunner, submitFilesToServerBackgroundJobs]
  );

  const handleRemoveQueueItem = useCallback((itemId: string) => {
    queuePendingItemsRef.current = queuePendingItemsRef.current.filter((it) => it.id !== itemId);
    setBatchQueue((prev) => (prev ? prev.filter((it) => it.id !== itemId) : null));
  }, []);

  const handleStopBatch = useCallback(() => {
    if (batchAbortControllerRef.current) {
      batchAbortControllerRef.current.abort();
      batchAbortControllerRef.current = null;
    }
    queuePendingItemsRef.current = [];
    isQueueProcessingRef.current = false;
    setIsBatchRunning(false);
  }, []);

  const handleResetBatch = useCallback(() => {
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
    void clearBatchSession();
  }, []);

  const markItemsAsDownloaded = useCallback(
    async (itemIds: string[]) => {
      for (const id of itemIds) {
        await markBatchItemDownloadedInSession(id);
        await markHistoryDownloaded(id);
      }
      await refreshHistoryList();
    },
    [refreshHistoryList]
  );

  const downloadBatchSubset = useCallback(
    async (
      items: BatchFileItem[],
      zipFilename: string,
      successNotice: string
    ) => {
      const docsToDownload: QueuedDocument[] = items.map((it) => ({
        id: it.id,
        file: it.file,
        type: it.name.toLowerCase().endsWith('.docx') ? 'docx' : 'pdf',
        name: it.name,
        size: it.size,
        status: 'done',
        result: it.result,
      }));

      await downloadBatchAsZip(docsToDownload, zipFilename, {
        includeMarkdown: zipIncludeSources,
        includeText: zipIncludeSources,
        onlyWord: !zipIncludeSources,
      });

      const downloadedIds = docsToDownload.map((d) => d.id);
      setBatchQueue((prev) =>
        prev
          ? prev.map((it) =>
              downloadedIds.includes(it.id) ? { ...it, isDownloaded: true } : it
            )
          : null
      );
      await markItemsAsDownloaded(downloadedIds);
      notify(successNotice, 5000);
    },
    [markItemsAsDownloaded, notify, zipIncludeSources]
  );

  const handleDownloadCompletedSoFar = useCallback(async () => {
    if (!batchQueue) return;
    const completed = batchQueue.filter((it) => it.status === 'done' && it.result);
    if (completed.length === 0) {
      onError('لا توجد ملفات مكتملة التحويل حتى الآن لتنزيلها.');
      return;
    }
    await downloadBatchSubset(
      completed,
      `الكتب_المنجزة_حتى_الآن_${completed.length}_ملف.zip`,
      `تم تنزيل ${completed.length} كتاب/ملف منجز بنجاح كحزمة ZIP! المعالجة مستمرة لباقي الملفات.`
    );
  }, [batchQueue, downloadBatchSubset, onError]);

  const handleDownloadRemainingUnDownloaded = useCallback(async () => {
    if (!batchQueue) return;
    const unDownloaded = batchQueue.filter(
      (it) => it.status === 'done' && it.result && !it.isDownloaded
    );
    if (unDownloaded.length === 0) {
      onError('تم تنزيل كافة الكتب المكتملة مسبقاً! يمكنك تنزيل المجلد كاملاً إذا رغبت.');
      return;
    }
    await downloadBatchSubset(
      unDownloaded,
      `الجزء_المتبقي_الذي_لم_يحمل_${unDownloaded.length}_ملف.zip`,
      `تم تنزيل الجزء المتبقي الجديد (${unDownloaded.length} كتاب) بنجاح!`
    );
  }, [batchQueue, downloadBatchSubset, onError]);

  const handleDownloadFullBatchZip = useCallback(async () => {
    if (!batchQueue) return;
    const completed = batchQueue.filter((it) => it.status === 'done' && it.result);
    if (completed.length === 0) return;
    await downloadBatchSubset(
      completed,
      `المجلد_الكامل_${completed.length}_ملف_Word.zip`,
      `تم تنزيل المجلد الكامل (${completed.length} كتاب) بنجاح!`
    );
  }, [batchQueue, downloadBatchSubset]);

  const handleExportRemainingQueueManifest = useCallback(() => {
    if (!batchQueue) return;
    const remaining = batchQueue.filter(
      (it) => it.status === 'pending' || it.status === 'processing' || it.status === 'error'
    );
    if (remaining.length === 0) {
      onError('لا توجد ملفات متبقية في الطابور، كل الملفات مكتملة التحويل.');
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
    notify(`تم استخراج كشف الكتب المتبقية (${remaining.length} ملف) بنجاح!`, 5000);
  }, [batchQueue, notify, onError]);

  const handleResumeRemainingBatch = useCallback(() => {
    if (!batchQueue) return;
    if (clientPolicy && (!clientPolicy.siteEnabled || !clientPolicy.conversionsEnabled)) {
      onError(clientPolicy.blockMessage || 'التحويل متوقف مؤقتاً من قِبل المشرف.');
      return;
    }
    const pendingItems = batchQueue.filter((it) => it.status === 'pending');
    if (pendingItems.length === 0) {
      onError('لا توجد ملفات في قائمة الانتظار للبدء بتحويلها.');
      return;
    }
    queuePendingItemsRef.current = [...pendingItems];
    if (!isQueueProcessingRef.current) {
      void startQueueRunner();
    }
  }, [batchQueue, clientPolicy, onError, startQueueRunner]);

  const handleRestoreSavedHistoryToBatch = useCallback(
    (savedItems: SavedConversion[]) => {
      if (savedItems.length === 0) {
        onError('لا توجد ملفات محفوظة في السجل لاستعادتها.');
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
      notify(`تمت استعادة ${restoredItems.length} كتب ومستندات سابقة إلى صفحة التحويل بنجاح!`, 5000);
    },
    [notify, onError]
  );

  const handleDownloadAllHistoryZip = useCallback(async (savedItems: SavedConversion[]) => {
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
  }, []);

  const handleRetryBatchItem = useCallback(
    async (itemId: string) => {
      if (!batchQueue) return;
      if (clientPolicy && (!clientPolicy.siteEnabled || !clientPolicy.conversionsEnabled)) {
        onError(clientPolicy.blockMessage || 'التحويل متوقف مؤقتاً من قِبل المشرف.');
        return;
      }
      const targetItem = batchQueue.find((it) => it.id === itemId);
      if (!targetItem) return;

      if (!targetItem.file || targetItem.file.size === 0) {
        setRetryTargetItemId(itemId);
        notify(`يرجى اختيار ملف "${targetItem.name}" من جهازك لإعادة تحويله مباشرة.`);
        if (retryFileInputRef.current) {
          retryFileInputRef.current.value = '';
          retryFileInputRef.current.click();
        }
        return;
      }

      const resetItem: BatchFileItem = {
        ...targetItem,
        retryCount: 0,
        status: 'pending',
        progress: 0,
        error: undefined,
        lastUpdatedAt: Date.now(),
      };

      setBatchQueue((prev) =>
        prev ? prev.map((it) => (it.id === itemId ? resetItem : it)) : null
      );

      queuePendingItemsRef.current.push(resetItem);
      notify(`تمت إضافة "${resetItem.name}" إلى طابور المعالجة وجاري البدء...`, 3000);

      if (!isQueueProcessingRef.current) {
        void startQueueRunner();
      }
    },
    [batchQueue, clientPolicy, notify, onError, startQueueRunner]
  );

  const handleRetryFileSelected = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
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
        notify(`تم ربط ملف "${file.name}" بنجاح وجاري استئناف التحويل...`, 4000);
        if (!isQueueProcessingRef.current) {
          void startQueueRunner();
        }
      }
      setRetryTargetItemId(null);
    },
    [notify, retryTargetItemId, startQueueRunner]
  );

  const handleRetryAllFailed = useCallback(async () => {
    if (!batchQueue) return;
    if (clientPolicy && (!clientPolicy.siteEnabled || !clientPolicy.conversionsEnabled)) {
      onError(clientPolicy.blockMessage || 'التحويل متوقف مؤقتاً من قِبل المشرف.');
      return;
    }
    const failedItems = batchQueue.filter((it) => it.status === 'error');
    if (failedItems.length === 0) return;

    const needsReupload = failedItems.find((it) => !it.file || it.file.size === 0);
    if (needsReupload) {
      notify(
        `الملف "${needsReupload.name}" يتطلب إعادة اختياره من جهازك لأن المتصفح مسح نسخته المؤقتة.`
      );
      void handleRetryBatchItem(needsReupload.id);
      return;
    }

    const now = Date.now();
    const resetItems: BatchFileItem[] = failedItems.map((item) => ({
      ...item,
      retryCount: 0,
      status: 'pending',
      progress: 0,
      error: undefined,
      lastUpdatedAt: now,
    }));
    const resetMap = new Map(resetItems.map((it) => [it.id, it]));
    queuePendingItemsRef.current.push(...resetItems);
    setBatchQueue((prev) =>
      prev ? prev.map((it) => resetMap.get(it.id) || it) : null
    );
    if (!isQueueProcessingRef.current) {
      void startQueueRunner();
    }
  }, [batchQueue, clientPolicy, handleRetryBatchItem, notify, onError, startQueueRunner]);

  return {
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
  };
}
