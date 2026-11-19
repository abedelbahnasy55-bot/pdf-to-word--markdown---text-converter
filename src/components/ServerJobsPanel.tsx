import React from 'react';
import {
  Layers,
  RefreshCw,
  Download,
  Eye,
  Pause,
  Play,
  Trash2,
} from 'lucide-react';
import type { ServerJobMeta } from '../model/jobs';
import { formatBytes } from '../utils/historyStorage';
import { formatEtaArabic } from '../utils/etaCalculator';

interface ServerJobsPanelProps {
  serverJobs: ServerJobMeta[];
  hasActiveServerJobs: boolean;
  loadingServerJobId: string | null;
  onRefresh: () => void;
  onClearFinished: () => void;
  onDownloadDocx: (job: ServerJobMeta) => void;
  onOpenResult: (job: ServerJobMeta) => void;
  onPause: (jobId: string) => void;
  onResume: (jobId: string) => void;
  onDelete: (jobId: string) => void;
}

export const ServerJobsPanel: React.FC<ServerJobsPanelProps> = ({
  serverJobs,
  hasActiveServerJobs,
  loadingServerJobId,
  onRefresh,
  onClearFinished,
  onDownloadDocx,
  onOpenResult,
  onPause,
  onResume,
  onDelete,
}) => {
  if (serverJobs.length === 0) return null;

  return (
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
            onClick={onRefresh}
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#2A3142] bg-white dark:bg-[#1B202C] hover:bg-slate-50 dark:hover:bg-[#232938] text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-1 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${hasActiveServerJobs ? 'animate-spin text-blue-600 dark:text-blue-400' : ''}`} />
            <span>تحديث</span>
          </button>
          {serverJobs.some((j) => j.status === 'completed' || j.status === 'failed') && (
            <button
              type="button"
              onClick={onClearFinished}
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
                      onClick={() => onDownloadDocx(job)}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>تنزيل Word (.docx)</span>
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => onOpenResult(job)}
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
                    onClick={() => onOpenResult(job)}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#2A3142] bg-white dark:bg-[#1B202C] hover:bg-slate-50 dark:hover:bg-[#232938] text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>معاينة المنجز</span>
                  </button>
                )}

                {isRunningOrQueued && (
                  <button
                    type="button"
                    onClick={() => onPause(job.id)}
                    className="px-2.5 py-1.5 rounded-lg border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/15 hover:bg-amber-100 dark:hover:bg-amber-500/25 text-amber-800 dark:text-amber-300 text-xs font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Pause className="w-3.5 h-3.5" />
                    <span>إيقاف مؤقت</span>
                  </button>
                )}

                {(job.status === 'paused' || job.status === 'failed') && (
                  <button
                    type="button"
                    onClick={() => onResume(job.id)}
                    className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>استئناف من صفحة {job.completedPages + 1}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => onDelete(job.id)}
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
  );
};
