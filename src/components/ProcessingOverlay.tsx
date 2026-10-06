import React from 'react';
import {
  Loader2,
  Layers,
  FileText,
  Clock,
  XCircle,
  CheckCircle2,
  Sparkles,
  BookOpen,
  Check,
  ShieldCheck,
  AlertTriangle,
  Play,
  Eye,
  BookCheck,
  LayoutGrid,
  Wand2
} from 'lucide-react';
import { ConversionProgress, StageStatus, ProcessingStageId } from '../types';
import { createInitialStages } from '../utils/pipelineStages';
import { calculateSingleFileEta } from '../utils/etaCalculator';

interface ProcessingOverlayProps {
  fileName: string;
  progress?: ConversionProgress | null;
  onCancel?: () => void;
  isPausedError?: boolean;
  pausedErrorMessage?: string;
  onRetryResume?: () => void;
  onViewPartialResult?: () => void;
}

export const ProcessingOverlay: React.FC<ProcessingOverlayProps> = ({
  fileName,
  progress,
  onCancel,
  isPausedError = false,
  pausedErrorMessage,
  onRetryResume,
  onViewPartialResult,
}) => {
  const isChunked = Boolean(progress && progress.totalChunks > 1);

  // Live timer for single file conversion elapsed time
  const startTimeRef = React.useRef<number>(Date.now());
  const [elapsedSec, setElapsedSec] = React.useState(0);

  React.useEffect(() => {
    startTimeRef.current = Date.now();
    const interval = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [fileName]);

  const etaInfo = calculateSingleFileEta(
    progress?.percentage || 5,
    elapsedSec
  );

  // Derive stage list
  const stages: StageStatus[] = React.useMemo(() => {
    if (progress?.stages && progress.stages.length > 0) {
      return progress.stages;
    }
    const active = progress?.activeStage || (
      progress?.phase === 'reading' || progress?.phase === 'splitting'
        ? 'extraction'
        : progress?.percentage && progress.percentage > 85
        ? 'finalizing'
        : progress?.percentage && progress.percentage > 60
        ? 'grammar'
        : progress?.percentage && progress.percentage > 35
        ? 'contextual'
        : 'extraction'
    );
    return createInitialStages(active);
  }, [progress?.stages, progress?.activeStage, progress?.phase, progress?.percentage]);

  const getStageIcon = (id: ProcessingStageId, status: string) => {
    if (status === 'completed') {
      return <Check className="w-4 h-4 text-emerald-600" />;
    }
    if (status === 'in_progress') {
      return <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />;
    }
    switch (id) {
      case 'image_denoise':
        return <Wand2 className="w-4 h-4 text-amber-500" />;
      case 'extraction':
        return <FileText className="w-4 h-4 text-slate-400" />;
      case 'contextual':
        return <BookOpen className="w-4 h-4 text-slate-400" />;
      case 'grammar':
        return <Sparkles className="w-4 h-4 text-slate-400" />;
      case 'structural':
        return <ShieldCheck className="w-4 h-4 text-slate-400" />;
      case 'quranic_verification':
        return <BookCheck className="w-4 h-4 text-emerald-600" />;
      case 'layout_integrity':
        return <LayoutGrid className="w-4 h-4 text-indigo-600" />;
      case 'finalizing':
      default:
        return <Layers className="w-4 h-4 text-slate-400" />;
    }
  };

  const getStageBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-100/90 px-2 py-0.5 rounded-full">
            <Check className="w-3 h-3" />
            <span>مكتمل</span>
          </span>
        );
      case 'in_progress':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 bg-blue-100 px-2.5 py-0.5 rounded-full animate-pulse shadow-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-ping" />
            <span>جاري الفحص الآن</span>
          </span>
        );
      case 'pending':
      default:
        return (
          <span className="text-[11px] font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
            في الانتظار
          </span>
        );
    }
  };

  return (
    <div className="w-full max-w-xl mx-auto p-6 sm:p-8 rounded-3xl bg-white border border-slate-200/90 shadow-xl text-center space-y-6 animate-fadeIn">
      {/* Top Header & Spinner or Paused Icon */}
      <div className="flex flex-col items-center gap-3">
        <div className={`relative w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg transition-colors ${
          isPausedError
            ? 'bg-amber-500 text-white shadow-amber-500/20'
            : progress?.isRateLimited
            ? 'bg-amber-600 text-white shadow-amber-600/20'
            : 'bg-gradient-to-tr from-blue-600 via-indigo-600 to-emerald-500 text-white shadow-blue-500/20'
        }`}>
          {isPausedError ? (
            <AlertTriangle className="w-8 h-8" />
          ) : progress?.isRateLimited ? (
            <Clock className="w-8 h-8 animate-spin" />
          ) : (
            <Loader2 className="w-8 h-8 animate-spin" />
          )}

          {isChunked && progress && (
            <span className="absolute -bottom-1 -right-1 bg-slate-900 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-md border border-white">
              {progress.currentChunk}/{progress.totalChunks}
            </span>
          )}
        </div>

        <div className="space-y-1">
          <h3 className="text-lg sm:text-xl font-extrabold text-slate-900">
            {isPausedError
              ? 'توقف مؤقت أثناء المعالجة (محفوظ بنسبة 100%)'
              : progress?.isRateLimited
              ? 'استراحة مؤقتة لتفادي ضغط الطلبات (Rate Limit)'
              : 'جاري المعالجة والتدقيق الآلي بالمسطرة'}
          </h3>
          <p className="text-xs text-slate-500 truncate max-w-sm mx-auto font-mono bg-slate-50 py-1 px-3 rounded-lg border border-slate-100 text-slate-600">
            {fileName}
          </p>
        </div>
      </div>

      {/* Prominent Active Rate Limit Countdown Card */}
      {progress?.isRateLimited && (
        <div className="p-4 rounded-2xl bg-amber-50 border-2 border-amber-300 text-right space-y-2.5 animate-pulse shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-amber-900 font-extrabold text-xs sm:text-sm">
              <Clock className="w-4 h-4 text-amber-600 animate-spin" />
              <span>تم الوصول للحد المؤقت للطلبات في الدقيقة (Rate limit)</span>
            </div>
            <span className="px-2.5 py-1 rounded-full bg-amber-200 text-amber-950 text-xs font-mono font-extrabold shadow-2xs">
              استئناف خلال: {progress.rateLimitCountdownSec || 15} ث
            </span>
          </div>
          <p className="text-xs text-amber-800 leading-relaxed">
            النظام يحتفظ بكافة الصفحات المحولة السابقة بنسبة 100%، ويقوم بجدولة استئناف تلقائي للمتابعة من نفس النقطة دون أي تكرار.
          </p>
          <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-amber-200/80">
            <div className="bg-white/80 p-2 rounded-lg text-amber-950 font-medium">
              <strong>الصفحات الجاري تحويلها:</strong> {progress.startPage}-{progress.endPage} من {progress.totalPages}
            </div>
            <div className="bg-white/80 p-2 rounded-lg text-amber-950 font-medium">
              <strong>الحزمة:</strong> {progress.currentChunk} من {progress.totalChunks}
            </div>
          </div>
        </div>
      )}

      {/* Paused Recovery & Coordinates Panel */}
      {isPausedError && (
        <div className="p-5 rounded-3xl bg-amber-50/90 border-2 border-amber-400 text-right space-y-4 shadow-md">
          <div className="space-y-1">
            <h4 className="text-sm font-extrabold text-amber-950 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <span>سبب التوقف المؤقت:</span>
            </h4>
            <p className="text-xs text-amber-900 leading-relaxed bg-white/80 p-2.5 rounded-xl border border-amber-200 font-medium">
              {pausedErrorMessage || progress?.pausedErrorMessage || 'تم الوصول إلى الحد المؤقت للطلبات في الدقيقة (Rate limit). لا تقلق، تم حفظ كل الصفحات المنجزة بنجاح.'}
            </p>
          </div>

          {/* Coordinates Card */}
          <div className="bg-white/95 rounded-2xl p-3.5 border border-amber-200 space-y-2">
            <p className="text-xs font-extrabold text-slate-800 border-b border-slate-100 pb-1.5 flex items-center justify-between">
              <span>إحداثيات تقدم الملف المحفوظة:</span>
              <span className="font-mono text-blue-700 font-bold">{fileName}</span>
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
              <div className="p-2 bg-slate-50 rounded-xl border border-slate-200/80">
                <span className="text-[11px] text-slate-500 block">الصفحات المنجزة:</span>
                <span className="font-extrabold text-slate-900">
                  {progress?.startPage || 1} إلى {progress?.endPage || 1} (من {progress?.totalPages || 1})
                </span>
              </div>
              <div className="p-2 bg-slate-50 rounded-xl border border-slate-200/80">
                <span className="text-[11px] text-slate-500 block">الحزم المكتملة:</span>
                <span className="font-extrabold text-blue-700">
                  {progress?.processedChunksCount || (progress?.currentChunk ? progress.currentChunk - 1 : 0)} من أصل {progress?.totalChunks || 1}
                </span>
              </div>
              <div className="p-2 bg-slate-50 rounded-xl border border-slate-200/80">
                <span className="text-[11px] text-slate-500 block">نسبة الإنجاز:</span>
                <span className="font-extrabold text-emerald-700">
                  {progress?.percentage || 0}%
                </span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-2 pt-1">
            <div className="flex flex-col sm:flex-row gap-2.5">
              {onRetryResume && (
                <button
                  id="btn-resume-conversion"
                  type="button"
                  onClick={onRetryResume}
                  className="flex-1 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-xs sm:text-sm font-extrabold rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-white" />
                  <span>متابعة واستئناف بالذكاء الاصطناعي</span>
                </button>
              )}

              {onViewPartialResult && (
                <button
                  id="btn-view-partial-result"
                  type="button"
                  onClick={onViewPartialResult}
                  className="py-2.5 px-4 bg-blue-50 hover:bg-blue-100 text-blue-800 text-xs sm:text-sm font-bold rounded-xl transition-all border border-blue-200 flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <Eye className="w-4 h-4 text-blue-600" />
                  <span>استعراض ما تم إنجازه</span>
                </button>
              )}

              {onCancel && (
                <button
                  id="btn-cancel-paused"
                  type="button"
                  onClick={onCancel}
                  className="py-2.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-all cursor-pointer"
                >
                  إلغاء والعودة
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main Overall Progress Bar & Estimated Remaining Time Indicator */}
      {progress && (
        <div className="space-y-2.5 bg-slate-50/90 p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-bold text-slate-700">
            {/* Progress Percentage */}
            <div className="flex items-center gap-1.5 text-slate-800">
              <Layers className="w-4 h-4 text-blue-600 shrink-0" />
              <span>الإنجاز الإجمالي لخط الإنتاج:</span>
              <span className="text-blue-700 text-sm font-black mr-1">{progress.percentage}%</span>
            </div>

            {/* Estimated Remaining Time next to progress */}
            <div className="flex items-center gap-1.5 self-start sm:self-auto bg-white py-1 px-2.5 rounded-xl border border-slate-200 shadow-2xs text-[11px]">
              <Clock className="w-3.5 h-3.5 text-blue-600 animate-spin shrink-0" />
              <span className="text-slate-500 font-semibold">الوقت المتوقع المتبقي:</span>
              <span className="font-extrabold text-blue-900 font-mono">
                {etaInfo.formattedEta}
              </span>
            </div>
          </div>

          <div className="w-full bg-slate-200/70 rounded-full h-3 overflow-hidden p-0.5 border border-slate-200">
            <div
              className="bg-gradient-to-r from-blue-600 via-indigo-600 to-emerald-500 h-full rounded-full transition-all duration-300 ease-out shadow-xs"
              style={{ width: `${Math.max(6, progress.percentage)}%` }}
            />
          </div>
        </div>
      )}

      {/* Detailed Multi-Stage Progress Tracker */}
      <div className="space-y-3 text-right">
        <div className="flex items-center justify-between text-xs font-extrabold text-slate-800 border-b border-slate-100 pb-2">
          <span>مراحل الفحص والتدقيق المتقدمة</span>
          <span className="text-slate-400 font-normal text-[11px]">متابعة حية لكل مرحلة</span>
        </div>

        <div className="space-y-2.5">
          {stages.map((stage) => {
            const isCurrent = stage.status === 'in_progress';
            const isDone = stage.status === 'completed';

            return (
              <div
                key={stage.id}
                className={`p-3.5 rounded-2xl border transition-all duration-300 ${
                  isCurrent
                    ? 'bg-blue-50/70 border-blue-300 shadow-sm ring-2 ring-blue-500/10'
                    : isDone
                    ? 'bg-emerald-50/40 border-emerald-200/80'
                    : 'bg-white border-slate-100 opacity-60'
                }`}
              >
                <div className="flex items-start justify-between gap-3 mb-1.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                        isDone
                          ? 'bg-emerald-100'
                          : isCurrent
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-slate-100 text-slate-400'
                      }`}
                    >
                      {getStageIcon(stage.id, stage.status)}
                    </div>
                    <div className="min-w-0">
                      <p
                        className={`text-xs font-bold truncate ${
                          isCurrent
                            ? 'text-blue-950 font-extrabold'
                            : isDone
                            ? 'text-emerald-950 font-bold'
                            : 'text-slate-600'
                        }`}
                      >
                        {stage.title}
                      </p>
                      <p className="text-[11px] text-slate-500 leading-tight">
                        {stage.subtitle}
                      </p>
                    </div>
                  </div>

                  <div className="shrink-0">{getStageBadge(stage.status)}</div>
                </div>

                {/* Sub-progress bar for the individual stage */}
                <div className="w-full bg-slate-200/60 rounded-full h-1.5 overflow-hidden mt-2">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      isDone
                        ? 'bg-emerald-500'
                        : isCurrent
                        ? 'bg-blue-600 animate-pulse'
                        : 'bg-slate-300'
                    }`}
                    style={{ width: `${stage.progress}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Status Message pill if present */}
      {progress?.statusMessage && (
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-semibold flex items-center justify-center gap-2">
          <Clock className="w-4 h-4 text-amber-600 shrink-0" />
          <span>{progress.statusMessage}</span>
        </div>
      )}

      {/* Cancel Operation Button */}
      {onCancel && (
        <div className="pt-2">
          <button
            id="btn-cancel-processing"
            type="button"
            onClick={onCancel}
            className="w-full py-2.5 px-4 bg-slate-100 hover:bg-red-50 text-slate-600 hover:text-red-600 text-xs font-bold rounded-xl transition-all border border-slate-200 hover:border-red-200 flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <XCircle className="w-4 h-4" />
            <span>إلغاء العملية والعودة</span>
          </button>
        </div>
      )}

      <div className="pt-2 border-t border-slate-100 flex items-center justify-center gap-2 text-[11px] text-slate-400">
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
        <span>تدقيق هجين متكامل: مطابقة المصحف والسنة والتحليل النحوي المتقدم</span>
      </div>
    </div>
  );
};
