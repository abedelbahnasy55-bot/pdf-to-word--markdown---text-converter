import React from 'react';
import {
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
  FolderDown,
} from 'lucide-react';
import type { ConversionResult } from '../types';
import type { BatchFileItem, BatchFilterTab } from '../model/batch';
import type { BatchEtaInfo } from '../utils/etaCalculator';
import { formatBytes } from '../utils/historyStorage';
import { formatRelativeTime } from '../utils/timeFormatter';

interface BatchQueuePanelProps {
  batchQueue: BatchFileItem[];
  isBatchRunning: boolean;
  isBatchFinished: boolean;
  autoRetryBatch: boolean;
  onChangeAutoRetry: (checked: boolean) => void;
  batchEta: BatchEtaInfo | null;
  batchFilterTab: BatchFilterTab;
  onChangeFilterTab: (tab: BatchFilterTab) => void;
  batchSearchQuery: string;
  onChangeSearchQuery: (q: string) => void;
  zipIncludeSources: boolean;
  onChangeZipIncludeSources: (checked: boolean) => void;
  isBatchDragOver: boolean;
  onChangeBatchDragOver: (over: boolean) => void;
  justAddedCount: number | null;
  onDismissJustAdded: () => void;
  nowTimestamp: number;
  addMoreFilesInputRef: React.RefObject<HTMLInputElement | null>;
  onAddFiles: (files: File[]) => void;
  onStopBatch: () => void;
  onResetBatch: () => void;
  onDownloadCompletedSoFar: () => void;
  onDownloadRemainingUnDownloaded: () => void;
  onDownloadFullBatchZip: () => void;
  onExportRemainingManifest: () => void;
  onResumeRemainingBatch: () => void;
  onRetryAllFailed: () => void;
  onRemoveQueueItem: (itemId: string) => void;
  onDownloadSingleDocx: (res: ConversionResult, fileName: string, itemId?: string) => void;
  onViewBatchItemResult: (res: ConversionResult) => void;
  onRetryBatchItem: (itemId: string) => void;
}

export const BatchQueuePanel: React.FC<BatchQueuePanelProps> = ({
  batchQueue,
  isBatchRunning,
  isBatchFinished,
  autoRetryBatch,
  onChangeAutoRetry,
  batchEta,
  batchFilterTab,
  onChangeFilterTab,
  batchSearchQuery,
  onChangeSearchQuery,
  zipIncludeSources,
  onChangeZipIncludeSources,
  isBatchDragOver,
  onChangeBatchDragOver,
  justAddedCount,
  onDismissJustAdded,
  nowTimestamp,
  addMoreFilesInputRef,
  onAddFiles,
  onStopBatch,
  onResetBatch,
  onDownloadCompletedSoFar,
  onDownloadRemainingUnDownloaded,
  onDownloadFullBatchZip,
  onExportRemainingManifest,
  onResumeRemainingBatch,
  onRetryAllFailed,
  onRemoveQueueItem,
  onDownloadSingleDocx,
  onViewBatchItemResult,
  onRetryBatchItem,
}) => {
  const batchTotalCount = batchQueue.length;
  const batchDoneCount = batchQueue.filter((b) => b.status === 'done').length;
  const batchUndownloadedCount = batchQueue.filter((b) => b.status === 'done' && !b.isDownloaded).length;
  const batchPendingCount = batchQueue.filter((b) => b.status === 'pending').length;
  const batchProcessingCount = batchQueue.filter((b) => b.status === 'processing').length;
  const batchErrorCount = batchQueue.filter((b) => b.status === 'error').length;
  const batchRemainingCount = batchPendingCount + batchProcessingCount + batchErrorCount;

  const filteredBatchQueue = batchQueue.filter((item) => {
    if (batchSearchQuery.trim() && !item.name.toLowerCase().includes(batchSearchQuery.trim().toLowerCase())) {
      return false;
    }
    if (batchFilterTab === 'done') return item.status === 'done';
    if (batchFilterTab === 'undownloaded') return item.status === 'done' && !item.isDownloaded;
    if (batchFilterTab === 'pending') return item.status === 'pending' || item.status === 'processing';
    if (batchFilterTab === 'error') return item.status === 'error';
    return true;
  });

  return (
    <div
      onDragEnter={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onChangeBatchDragOver(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onChangeBatchDragOver(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onChangeBatchDragOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onChangeBatchDragOver(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          onAddFiles(Array.from(e.dataTransfer.files));
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
              onChange={(e) => onChangeAutoRetry(e.target.checked)}
              className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 accent-blue-600 cursor-pointer"
            />
            <span>إعادة المحاولة التلقائية</span>
          </label>

          {isBatchRunning ? (
            <button
              type="button"
              onClick={onStopBatch}
              className="px-4 py-2 bg-red-50 dark:bg-red-500/15 hover:bg-red-100 dark:hover:bg-red-500/25 text-red-600 dark:text-red-300 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 border border-red-200 dark:border-red-500/30 cursor-pointer"
            >
              <StopCircle className="w-4 h-4" />
              <span>إلغاء المعالجة</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onResetBatch}
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
            onClick={onDismissJustAdded}
            aria-label="إغلاق التنبيه"
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
              onClick={onDownloadCompletedSoFar}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs sm:text-sm rounded-lg shadow-xs transition-all flex items-center gap-2 cursor-pointer"
            >
              <Download className="w-4 h-4 text-white" />
              <span>تحميل المنجز حتى الآن ({batchDoneCount}) (.ZIP)</span>
            </button>

            <button
              type="button"
              onClick={onExportRemainingManifest}
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
                  onChange={(e) => onChangeZipIncludeSources(e.target.checked)}
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
              onClick={onDownloadRemainingUnDownloaded}
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
              onClick={onDownloadFullBatchZip}
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
                    onClick={onResumeRemainingBatch}
                    className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>استئناف تحويل الملفات المتبقية ({batchPendingCount})</span>
                  </button>
                )}
                {batchErrorCount > 0 && (
                  <button
                    type="button"
                    onClick={onRetryAllFailed}
                    className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>إعادة محاولة المتعثرة ({batchErrorCount})</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={onExportRemainingManifest}
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
        role="button"
        tabIndex={0}
        aria-label="إضافة ملفات أخرى للتحويل المستمر في الخلفية"
        onClick={() => addMoreFilesInputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            addMoreFilesInputRef.current?.click();
          }
        }}
        className="p-4 rounded-xl border-2 border-dashed border-blue-200 dark:border-blue-500/30 hover:border-blue-400 bg-blue-50/40 dark:bg-blue-500/5 hover:bg-blue-50/80 dark:hover:bg-blue-500/10 transition-all flex flex-col sm:flex-row items-center justify-between gap-3 cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
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
                onAddFiles(Array.from(e.target.files));
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
            onClick={() => onChangeFilterTab('all')}
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
            onClick={() => onChangeFilterTab('done')}
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
            onClick={() => onChangeFilterTab('undownloaded')}
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
              onClick={() => onChangeFilterTab('pending')}
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
              onClick={() => onChangeFilterTab('error')}
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
              onChange={(e) => onChangeSearchQuery(e.target.value)}
              placeholder="بحث باسم الكتاب..."
              className="w-full text-xs px-3 py-1.5 pr-8 pl-8 rounded-lg border border-slate-200 dark:border-[#2A3142] bg-white dark:bg-[#10131C] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2.5" />
            {batchSearchQuery && (
              <button
                type="button"
                onClick={() => onChangeSearchQuery('')}
                aria-label="مسح البحث"
                className="absolute left-2.5 top-2 text-slate-400 hover:text-slate-600 cursor-pointer"
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
                    onClick={() => onRemoveQueueItem(item.id)}
                    className="p-1.5 hover:bg-red-50 dark:hover:bg-red-500/15 text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded-lg transition-colors cursor-pointer"
                    title="إزالة هذا الملف من قائمة الانتظار"
                    aria-label={`إزالة ${item.name} من قائمة الانتظار`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}

                {item.status === 'done' && item.result && (
                  <>
                    <button
                      type="button"
                      onClick={() => onDownloadSingleDocx(item.result!, item.name, item.id)}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer"
                      title="تنزيل ملف Word منفصل"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>تنزيل Word</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onViewBatchItemResult(item.result!)}
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
                    onClick={() => onRetryBatchItem(item.id)}
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
  );
};
