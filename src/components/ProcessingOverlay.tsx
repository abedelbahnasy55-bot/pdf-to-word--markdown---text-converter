import React, { useRef, useState, DragEvent, ChangeEvent } from 'react';
import {
  Loader2,
  Layers,
  FileText,
  Clock,
  XCircle,
  CheckCircle2,
  FileCheck,
  BookOpen,
  Check,
  ShieldCheck,
  AlertTriangle,
  Play,
  Eye,
  BookCheck,
  LayoutGrid,
  FileImage,
  Plus,
  UploadCloud,
} from 'lucide-react';
import { ConversionProgress, StageStatus, ProcessingStageId } from '../types';
import { createInitialStages } from '../utils/pipelineStages';
import { formatEtaArabic } from '../utils/etaCalculator';

export interface QueuedFileSummary {
  id: string;
  name: string;
  size: number;
  status: 'pending' | 'processing' | 'done' | 'error';
  progress?: number;
}

interface ProcessingOverlayProps {
  fileName: string;
  progress?: ConversionProgress | null;
  onCancel?: () => void;
  isPausedError?: boolean;
  pausedErrorMessage?: string;
  onRetryResume?: () => void;
  onViewPartialResult?: () => void;
  onAddFiles?: (files: File[]) => void;
  queueItems?: QueuedFileSummary[];
}

export const ProcessingOverlay: React.FC<ProcessingOverlayProps> = ({
  fileName,
  progress,
  onCancel,
  isPausedError = false,
  pausedErrorMessage,
  onRetryResume,
  onViewPartialResult,
  onAddFiles,
  queueItems,
}) => {
  const isChunked = Boolean(progress && progress.totalChunks > 1);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onAddFiles?.(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onAddFiles?.(Array.from(e.target.files));
      e.target.value = '';
    }
  };

  const startTimeRef = React.useRef<number>(Date.now());
  const lastStatusUpdateTimeRef = React.useRef<number>(Date.now());
  const [elapsedSec, setElapsedSec] = React.useState(0);
  const [secondsSinceLastUpdate, setSecondsSinceLastUpdate] = React.useState(0);
  const smoothedSecondsRef = React.useRef<number>(18);
  const lastPctRef = React.useRef<number>(progress?.percentage || 5);

  React.useEffect(() => {
    lastStatusUpdateTimeRef.current = Date.now();
    setSecondsSinceLastUpdate(0);
  }, [progress?.percentage, progress?.currentChunk, progress?.phase, progress?.statusMessage]);

  React.useEffect(() => {
    startTimeRef.current = Date.now();
    lastStatusUpdateTimeRef.current = Date.now();
    smoothedSecondsRef.current = 18;
    lastPctRef.current = 5;
    const interval = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - startTimeRef.current) / 1000));
      setSecondsSinceLastUpdate(Math.floor((Date.now() - lastStatusUpdateTimeRef.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [fileName]);

  const etaInfo = React.useMemo(() => {
    const currentPct = progress?.percentage || 5;

    if (currentPct >= 95) {
      return { remainingSeconds: 2, formattedEta: 'ثوانٍ معدودة...' };
    }

    if (currentPct > lastPctRef.current) {
      lastPctRef.current = currentPct;
      const proportionalRemain = Math.max(3, Math.round(18 * (1 - currentPct / 100)));
      smoothedSecondsRef.current = Math.min(smoothedSecondsRef.current, proportionalRemain);
    } else {
      smoothedSecondsRef.current = Math.max(3, smoothedSecondsRef.current - 1);
    }

    const effective = Math.max(2, smoothedSecondsRef.current);
    return {
      remainingSeconds: effective,
      formattedEta: formatEtaArabic(effective),
    };
  }, [progress?.percentage, elapsedSec]);

  const isLikelyEnglish = React.useMemo(() => {
    if (fileName && /[a-zA-Z]{3,}/.test(fileName) && !/[\u0600-\u06FF]/.test(fileName)) {
      return true;
    }
    return false;
  }, [fileName]);

  const stages: StageStatus[] = React.useMemo(() => {
    if (progress?.stages && progress.stages.length > 0) {
      return progress.stages;
    }
    const active =
      progress?.activeStage ||
      (progress?.phase === 'reading' || progress?.phase === 'splitting'
        ? 'extraction'
        : progress?.percentage && progress.percentage > 85
        ? 'finalizing'
        : progress?.percentage && progress.percentage > 60
        ? 'grammar'
        : progress?.percentage && progress.percentage > 35
        ? 'contextual'
        : 'extraction');
    return createInitialStages(active, isLikelyEnglish);
  }, [
    progress?.stages,
    progress?.activeStage,
    progress?.phase,
    progress?.percentage,
    isLikelyEnglish,
  ]);

  const getStageIcon = (id: ProcessingStageId, status: string) => {
    if (status === 'completed') {
      return <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />;
    }
    if (status === 'in_progress') {
      return <Loader2 className="w-4 h-4 text-blue-600 dark:text-blue-400 animate-spin" />;
    }
    switch (id) {
      case 'image_denoise':
        return <FileImage className="w-4 h-4 text-slate-500 dark:text-slate-400" />;
      case 'extraction':
        return <FileText className="w-4 h-4 text-slate-400" />;
      case 'contextual':
        return <BookOpen className="w-4 h-4 text-slate-400" />;
      case 'grammar':
        return <FileCheck className="w-4 h-4 text-slate-400" />;
      case 'structural':
        return <ShieldCheck className="w-4 h-4 text-slate-400" />;
      case 'quranic_verification':
        return <BookCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />;
      case 'layout_integrity':
        return <LayoutGrid className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />;
      case 'finalizing':
      default:
        return <Layers className="w-4 h-4 text-slate-400" />;
    }
  };

  const getStageBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/30 px-2 py-0.5 rounded-md">
            <Check className="w-3 h-3" />
            <span>مكتمل</span>
          </span>
        );
      case 'in_progress':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-500/15 border border-blue-200 dark:border-blue-500/30 px-2.5 py-0.5 rounded-md">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>قيد التنفيذ</span>
          </span>
        );
      case 'pending':
      default:
        return (
          <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-[#1B202C] px-2 py-0.5 rounded-md">
            في الانتظار
          </span>
        );
    }
  };

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`relative w-full max-w-xl mx-auto p-6 sm:p-8 rounded-2xl bg-white dark:bg-[#141720] border border-slate-200 dark:border-[#232938] shadow-lg text-center space-y-5 transition-colors ${
        isDragOver ? 'ring-4 ring-blue-500/40 border-blue-500' : ''
      }`}
    >
      {isDragOver && (
        <div className="absolute inset-0 bg-blue-600/95 text-white rounded-2xl z-40 flex flex-col items-center justify-center gap-3 backdrop-blur-xs p-6">
          <UploadCloud className="w-12 h-12 text-white" />
          <h4 className="text-base sm:text-lg font-bold">
            أفلت الملفات هنا لإضافتها مباشرة إلى طابور التحويل
          </h4>
          <p className="text-xs text-blue-100 font-medium">
            سيتم إدراجها فوراً وتحويلها بالتتابع بعد الملف الحالي دون انقطاع
          </p>
        </div>
      )}

      <div className="flex flex-col items-center gap-3">
        <div
          className={`relative w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${
            isPausedError
              ? 'bg-amber-500 text-white'
              : progress?.isRateLimited
              ? 'bg-slate-700 text-white'
              : 'bg-blue-600 text-white'
          }`}
        >
          {isPausedError ? (
            <AlertTriangle className="w-6 h-6" />
          ) : progress?.isRateLimited ? (
            <Clock className="w-6 h-6 animate-spin" />
          ) : (
            <Loader2 className="w-6 h-6 animate-spin" />
          )}

          {isChunked && progress && (
            <span className="absolute -bottom-1 -start-1 bg-slate-900 text-white text-[10px] font-bold px-1.5 py-0.2 rounded border border-white dark:border-[#141720] tabular-nums">
              {progress.currentChunk}/{progress.totalChunks}
            </span>
          )}
        </div>

        <div className="space-y-1">
          <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
            {isPausedError
              ? 'توقف مؤقت أثناء التحويل'
              : progress?.isRateLimited
              ? 'تنظيم تلقائي لتوقيت الطلبات'
              : 'جاري تحويل وتنسيق الملف...'}
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-300 truncate max-w-sm mx-auto font-mono bg-slate-50 dark:bg-[#191E2A] py-1 px-3 rounded-lg border border-slate-200 dark:border-[#252B3B]">
            {fileName}
          </p>
        </div>
      </div>

      {progress?.preFlightReport && (
        <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#191E2A] border border-slate-200 dark:border-[#252B3B] text-right space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>الفحص الاستباقي للوثيقة</span>
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300">
              {progress.preFlightReport.hasTextLayer ? 'طبقة نصية سليمة' : 'مسح ضوئي'}
            </span>
          </div>
          <p className="text-[11px] text-slate-700 dark:text-slate-300 leading-relaxed">
            {progress.preFlightReport.summaryArabic}
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-1 text-[10px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            <span>الصفحات: {progress.preFlightReport.totalPages}</span>
            <span>·</span>
            <span>كثافة الحروف: ~{progress.preFlightReport.avgCharsPerPage}/صفحة</span>
          </div>
        </div>
      )}

      {onAddFiles && (
        <div className="space-y-3 pt-1">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-2.5 px-4 bg-slate-50 dark:bg-[#191E2A] hover:bg-slate-100 dark:hover:bg-[#1E2433] border border-slate-200 dark:border-[#2A3142] text-slate-800 dark:text-slate-200 text-xs sm:text-sm font-bold rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <Plus className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>إضافة ملفات أخرى للتحويل بالتتابع</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.docx,.doc,image/*,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={handleFileInput}
              className="hidden"
            />
          </div>

          {queueItems && queueItems.length > 1 && (
            <div className="p-3.5 bg-slate-50 dark:bg-[#191E2A] border border-slate-200 dark:border-[#252B3B] rounded-xl text-right space-y-2.5">
              <div className="flex items-center justify-between text-xs font-bold text-slate-800 dark:text-slate-100 border-b border-slate-200/80 dark:border-[#252B3B] pb-2">
                <span className="flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  <span>طابور التحويل الجاري ({queueItems.length} ملفات)</span>
                </span>
                <span className="text-[11px] text-blue-700 dark:text-blue-300 font-bold tabular-nums">
                  {queueItems.filter((q) => q.status === 'done').length} من {queueItems.length} مكتمل
                </span>
              </div>

              <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                {queueItems.map((item, idx) => (
                  <div
                    key={item.id || idx}
                    className={`p-2 rounded-lg text-xs flex items-center justify-between gap-2 border transition-colors ${
                      item.status === 'processing'
                        ? 'bg-blue-50/80 dark:bg-blue-500/15 border-blue-200 dark:border-blue-500/30 font-bold text-blue-950 dark:text-blue-200'
                        : item.status === 'done'
                        ? 'bg-emerald-50/60 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/25 text-emerald-950 dark:text-emerald-200'
                        : 'bg-white dark:bg-[#141720] border-slate-200 dark:border-[#252B3B] text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-5 h-5 rounded bg-slate-100 dark:bg-[#1B202C] text-slate-700 dark:text-slate-200 flex items-center justify-center text-[10px] font-bold shrink-0 tabular-nums">
                        {idx + 1}
                      </span>
                      <span className="truncate max-w-[200px] sm:max-w-[280px]" title={item.name}>
                        {item.name}
                      </span>
                    </div>

                    <div className="shrink-0 tabular-nums">
                      {item.status === 'processing' ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-700 dark:text-blue-300">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          <span>{item.progress || progress?.percentage || 0}%</span>
                        </span>
                      ) : item.status === 'done' ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                          <Check className="w-3 h-3" />
                          <span>مكتمل</span>
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-500 dark:text-slate-400">في الانتظار</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {progress?.isRateLimited && (
        <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/30 text-right space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-amber-900 dark:text-amber-300 font-bold text-xs sm:text-sm">
              <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400 animate-spin" />
              <span>استئناف مجدول للحفاظ على ثبات الخدمة</span>
            </div>
            <span className="px-2 py-0.5 rounded bg-amber-200/80 dark:bg-amber-500/20 text-amber-950 dark:text-amber-200 text-xs font-mono font-bold tabular-nums">
              خلال {progress.rateLimitCountdownSec || 15} ث
            </span>
          </div>
          <p className="text-xs text-amber-800 dark:text-amber-300/90 leading-relaxed">
            كافة الصفحات المنجزة محفوظة بالكامل، وتُستكمل بقية الصفحات تلقائياً من آخر نقطة.
          </p>
        </div>
      )}

      {isPausedError && (
        <div className="p-4 rounded-xl bg-amber-50/90 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/30 text-right space-y-3">
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-amber-950 dark:text-amber-200 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <span>سبب التوقف المؤقت</span>
            </h4>
            <p className="text-xs text-amber-900 dark:text-amber-200/90 leading-relaxed bg-white/80 dark:bg-[#141720] p-2.5 rounded-lg border border-amber-200 dark:border-[#2A3142]">
              {pausedErrorMessage ||
                progress?.pausedErrorMessage ||
                'حدث توقف مؤقت. تم حفظ كل الصفحات المنجزة بنجاح.'}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            {onRetryResume && (
              <button
                id="btn-resume-conversion"
                type="button"
                onClick={onRetryResume}
                className="flex-1 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-bold rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <Play className="w-4 h-4 fill-white" />
                <span>استئناف المعالجة</span>
              </button>
            )}

            {onViewPartialResult && (
              <button
                id="btn-view-partial-result"
                type="button"
                onClick={onViewPartialResult}
                className="py-2.5 px-4 bg-white dark:bg-[#171B26] hover:bg-slate-50 dark:hover:bg-[#1E2433] text-blue-700 dark:text-blue-300 text-xs sm:text-sm font-bold rounded-lg border border-slate-200 dark:border-[#2A3142] flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Eye className="w-4 h-4" />
                <span>عرض المنجز</span>
              </button>
            )}

            {onCancel && (
              <button
                id="btn-cancel-paused"
                type="button"
                onClick={onCancel}
                className="py-2.5 px-3 bg-slate-100 dark:bg-[#1B202C] hover:bg-slate-200 dark:hover:bg-[#232938] text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-lg cursor-pointer"
              >
                إلغاء والعودة
              </button>
            )}
          </div>
        </div>
      )}

      {progress && (
        <div className="space-y-2.5 bg-slate-50 dark:bg-[#191E2A] p-4 rounded-xl border border-slate-200 dark:border-[#252B3B]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-bold text-slate-700 dark:text-slate-200">
            <div className="flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
              <span>التقدم الإجمالي:</span>
              <span className="text-blue-700 dark:text-blue-400 text-sm font-extrabold ms-1 tabular-nums">
                {progress.percentage}%
              </span>
            </div>

            <div className="flex items-center gap-1.5 self-start sm:self-auto bg-white dark:bg-[#141720] py-1 px-2.5 rounded-lg border border-slate-200 dark:border-[#2A3142] text-[11px]">
              <Clock className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
              <span className="text-slate-500 dark:text-slate-400 font-semibold">المتبقي:</span>
              <span className="font-bold text-slate-900 dark:text-slate-100 font-mono tabular-nums">
                {etaInfo.formattedEta}
              </span>
            </div>
          </div>

          <div
            dir="rtl"
            className="w-full bg-slate-200 dark:bg-[#232938] rounded-full h-2.5 overflow-hidden flex"
          >
            <div
              className="bg-blue-600 h-full rounded-full transition-all duration-300"
              style={{ width: `${Math.max(5, progress.percentage)}%` }}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-200/60 dark:border-[#252B3B] font-mono tabular-nums">
            <span>
              آخر تحديث:{' '}
              <strong className="text-slate-800 dark:text-slate-200">
                {secondsSinceLastUpdate < 5
                  ? 'منذ لحظات'
                  : secondsSinceLastUpdate < 60
                  ? `منذ ${secondsSinceLastUpdate} ث`
                  : `منذ ${Math.floor(secondsSinceLastUpdate / 60)} د`}
              </strong>
            </span>
            <span>
              المنقضي:{' '}
              <strong className="text-slate-800 dark:text-slate-200">
                {Math.floor(elapsedSec / 60)}:{(elapsedSec % 60).toString().padStart(2, '0')}
              </strong>
            </span>
          </div>
        </div>
      )}

      <div className="space-y-2.5 text-right">
        <div className="flex items-center justify-between text-xs font-bold text-slate-800 dark:text-slate-200 border-b border-slate-100 dark:border-[#232938] pb-2">
          <span>مراحل المعالجة والتحقق</span>
          <span className="text-slate-400 dark:text-slate-500 font-normal text-[11px]">
            متابعة مباشرة
          </span>
        </div>

        <div className="space-y-2">
          {stages.map((stage) => {
            const isCurrent = stage.status === 'in_progress';
            const isDone = stage.status === 'completed';

            return (
              <div
                key={stage.id}
                className={`p-3 rounded-xl border transition-colors ${
                  isCurrent
                    ? 'bg-blue-50/70 dark:bg-blue-500/10 border-blue-300 dark:border-blue-500/40'
                    : isDone
                    ? 'bg-emerald-50/40 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/25'
                    : 'bg-white dark:bg-[#141720] border-slate-100 dark:border-[#232938] opacity-65'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                        isDone
                          ? 'bg-emerald-100 dark:bg-emerald-500/20'
                          : isCurrent
                          ? 'bg-blue-100 dark:bg-blue-500/20'
                          : 'bg-slate-100 dark:bg-[#1B202C]'
                      }`}
                    >
                      {getStageIcon(stage.id, stage.status)}
                    </div>
                    <div className="min-w-0">
                      <p
                        className={`text-xs font-bold truncate ${
                          isCurrent
                            ? 'text-blue-950 dark:text-blue-200'
                            : isDone
                            ? 'text-emerald-950 dark:text-emerald-200'
                            : 'text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {stage.title}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
                        {stage.subtitle}
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0">{getStageBadge(stage.status)}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {onCancel && (
        <button
          id="btn-cancel-processing"
          type="button"
          onClick={onCancel}
          className="w-full py-2.5 px-4 bg-slate-100 dark:bg-[#1B202C] hover:bg-red-50 dark:hover:bg-red-500/15 text-slate-700 dark:text-slate-300 hover:text-red-600 dark:hover:text-red-400 text-xs font-bold rounded-xl transition-colors border border-slate-200 dark:border-[#2A3142] flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <XCircle className="w-4 h-4" />
          <span>إلغاء العملية والعودة</span>
        </button>
      )}

      <div className="pt-1 border-t border-slate-100 dark:border-[#232938] flex items-center justify-center gap-2 text-[11px] text-slate-400 dark:text-slate-500">
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
        <span>تطابق معياري للنصوص والجداول والرسم العثماني</span>
      </div>
    </div>
  );
};
