import React, { useState } from 'react';
import {
  Clock,
  Download,
  Eye,
  Trash2,
  FileText,
  CheckCircle2,
  AlertCircle,
  Layers,
} from 'lucide-react';
import { SavedConversion } from '../types';
import { downloadDocx } from '../utils/docxExporter';
import { formatBytes } from '../utils/historyStorage';

interface HistoryListProps {
  items: SavedConversion[];
  onSelect: (item: SavedConversion) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
  onMarkDownloaded: (id: string) => void;
}

export const HistoryList: React.FC<HistoryListProps> = ({
  items,
  onSelect,
  onDelete,
  onClearAll,
  onMarkDownloaded,
}) => {
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  if (items.length === 0) {
    return null;
  }

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    const now = new Date();
    const isToday =
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear();

    const timeStr = d.toLocaleTimeString('ar-EG', {
      hour: '2-digit',
      minute: '2-digit',
    });

    if (isToday) {
      return `اليوم، ${timeStr}`;
    }
    return `${d.toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' })}، ${timeStr}`;
  };

  const handleQuickDocxDownload = async (e: React.MouseEvent, item: SavedConversion) => {
    e.stopPropagation();
    setDownloadingId(item.id);
    try {
      const isRtl = item.result.textDirection === 'rtl';
      const baseName = (item.fileName || item.result.title || 'document').replace(/\.[^/.]+$/, '');
      await downloadDocx(
        {
          title: item.result.title,
          markdown: item.result.markdown,
          isRtl,
        },
        `${baseName}.docx`
      );
      onMarkDownloaded(item.id);
    } catch (err) {
      console.error('Quick download failed', err);
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto mt-8 space-y-4">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 tabular-nums">
            الملفات السابقة والمحفوظة ({items.length})
          </h3>
        </div>

        {items.length > 1 && (
          <button
            type="button"
            onClick={onClearAll}
            className="text-[11px] font-medium text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-colors flex items-center gap-1 cursor-pointer"
          >
            <Trash2 className="w-3 h-3" />
            <span>مسح السجل</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {items.map((item) => {
          const isDownloading = downloadingId === item.id;

          return (
            <div
              key={item.id}
              role="button"
              tabIndex={0}
              aria-label={`معاينة ${item.title || item.fileName}`}
              onClick={() => onSelect(item)}
              onKeyDown={(e) => {
                if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  onSelect(item);
                }
              }}
              className="group relative bg-white dark:bg-[#141720] border border-slate-200/90 dark:border-[#232938] hover:border-blue-400 dark:hover:border-blue-500/60 rounded-xl p-4 transition-colors cursor-pointer flex flex-col justify-between space-y-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <div className="space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                        {item.title || item.fileName}
                      </h4>
                      <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate max-w-[200px]">
                        {item.fileName}
                      </p>
                    </div>
                  </div>

                  {item.isDownloaded ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-[10px] font-medium shrink-0">
                      <CheckCircle2 className="w-3 h-3" />
                      تم التنزيل
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-500/15 border border-amber-200 dark:border-amber-500/30 text-amber-700 dark:text-amber-300 text-[10px] font-medium shrink-0">
                      <AlertCircle className="w-3 h-3" />
                      جاهز
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 pt-1 tabular-nums">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3 text-slate-400" />
                    {formatDate(item.timestamp)}
                  </span>
                  {item.totalPages && item.totalPages > 1 && (
                    <span className="flex items-center gap-1 text-slate-600 dark:text-slate-300 font-medium">
                      · <Layers className="w-3 h-3 text-blue-500" />
                      {item.totalPages} صفحة
                    </span>
                  )}
                  {item.fileSize && (
                    <span className="text-slate-400">· {formatBytes(item.fileSize)}</span>
                  )}
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 dark:border-[#232938] flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={(e) => handleQuickDocxDownload(e, item)}
                    disabled={isDownloading}
                    className="px-2.5 py-1.5 bg-blue-50 dark:bg-blue-500/15 hover:bg-blue-600 text-blue-700 dark:text-blue-300 hover:text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{isDownloading ? 'جاري التجهيز...' : 'تحميل Word'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onSelect(item)}
                    className="px-2.5 py-1.5 bg-slate-50 dark:bg-[#1B202C] hover:bg-slate-100 dark:hover:bg-[#232938] text-slate-700 dark:text-slate-200 rounded-lg text-xs font-medium transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                    <span>معاينة</span>
                  </button>
                </div>

                <button
                  type="button"
                  title="حذف من السجل"
                  aria-label={`حذف ${item.title || item.fileName} من السجل`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(item.id);
                  }}
                  className="p-1.5 text-slate-300 dark:text-slate-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
