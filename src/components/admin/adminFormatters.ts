import type { ConversionStatus, UserAccessMode } from '../../model/governance';

export function formatAdminDateTime(ts?: number): string {
  if (!ts || !Number.isFinite(ts)) return '—';
  try {
    return new Date(ts).toLocaleString('ar-EG', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return new Date(ts).toISOString();
  }
}

export function formatRelativeTimeAr(ts?: number): string {
  if (!ts || !Number.isFinite(ts)) return 'غير معروف';
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 45) return 'الآن';
  if (diffSec < 3600) return `منذ ${Math.floor(diffSec / 60)} د`;
  if (diffSec < 86400) return `منذ ${Math.floor(diffSec / 3600)} س`;
  return `منذ ${Math.floor(diffSec / 86400)} يوم`;
}

export function formatDurationMs(ms?: number): string {
  if (!ms || ms <= 0) return '—';
  if (ms < 1000) return `${ms} م.ث`;
  const sec = ms / 1000;
  if (sec < 60) return `${sec.toFixed(1)} ث`;
  const mins = Math.floor(sec / 60);
  const remSec = Math.round(sec % 60);
  return `${mins} د ${remSec} ث`;
}

export function formatFileSizeCompact(bytes?: number): string {
  if (!bytes || bytes <= 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function getAccessModeView(mode: UserAccessMode): {
  label: string;
  badgeClass: string;
} {
  switch (mode) {
    case 'block_site':
      return {
        label: 'محظور من الموقع',
        badgeClass:
          'bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300 border-red-200 dark:border-red-500/30',
      };
    case 'block_conversions':
      return {
        label: 'ممنوع من التحويل',
        badgeClass:
          'bg-amber-50 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-500/30',
      };
    case 'active':
    default:
      return {
        label: 'نشط ومسموح',
        badgeClass:
          'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30',
      };
  }
}

export function getConversionStatusView(status: ConversionStatus): {
  label: string;
  badgeClass: string;
} {
  switch (status) {
    case 'completed':
      return {
        label: 'مكتمل',
        badgeClass:
          'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30',
      };
    case 'started':
    case 'processing':
      return {
        label: 'جاري التنفيذ',
        badgeClass:
          'bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-500/30',
      };
    case 'paused':
      return {
        label: 'متوقف مؤقتاً',
        badgeClass:
          'bg-slate-100 dark:bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-500/30',
      };
    case 'blocked':
      return {
        label: 'مرفوض (مقيد)',
        badgeClass:
          'bg-amber-50 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-500/30',
      };
    case 'failed':
    default:
      return {
        label: 'فشل',
        badgeClass:
          'bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300 border-red-200 dark:border-red-500/30',
      };
  }
}

export function getOperationLabelAr(operation: string, method: string): string {
  const op = operation || '';
  const m = method || '';
  if (op === 'background-job') {
    if (m === 'direct_digital_extraction') return 'خلفية الخادم (رقمي مباشر)';
    if (m === 'hybrid_digital_ocr') return 'خلفية الخادم (هجين رقمي + OCR)';
    return 'خلفية الخادم (OCR)';
  }
  if (op === 'docx-client-convert' || m === 'docx_reader') return 'تحويل Word (.docx)';
  if (op === 'direct-extract' || m === 'direct_digital_extraction') return 'استخراج رقمي مباشر';
  if (op === 'convert-pdf') return 'تفريغ PDF/صورة API';
  if (op === 'client-pipeline') return 'معالجة المتصفح';
  if (op === 'docx_export') return 'تصدير Word (.docx)';
  if (op === 'smart_compiler') return 'استوديو التجميع';
  if (op === 'client-gate' || op === 'size-limit-check') return 'فحص الصلاحية/الحجم';
  return op || 'تحويل مستند';
}
