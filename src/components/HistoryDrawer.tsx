import React, { useState } from 'react';
import {
  X,
  Clock,
  Download,
  Trash2,
  FileText,
  CheckCircle2,
  AlertCircle,
  Layers,
} from 'lucide-react';
import { SavedConversion } from '../types';
import { downloadDocx } from '../utils/docxExporter';

interface HistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  items: SavedConversion[];
  onSelect: (item: SavedConversion) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
  onMarkDownloaded: (id: string) => void;
}

export const HistoryDrawer: React.FC<HistoryDrawerProps> = ({
  isOpen,
  onClose,
  items,
  onSelect,
  onDelete,
  onClearAll,
  onMarkDownloaded,
}) => {
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  if (!isOpen) return null;

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    return `${d.toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' })} ${d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}`;
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
      console.error('Download failed', err);
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity"
      />

      <div className="absolute inset-y-0 left-0 max-w-md w-full bg-white dark:bg-[#141720] border-r border-slate-200 dark:border-[#232938] shadow-2xl flex flex-col z-10">
        <div className="p-4 border-b border-slate-100 dark:border-[#232938] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                الملفات المحفوظة والسابقة
              </h3>
              <p className="text-xs text-slate-400 dark:text-slate-500 tabular-nums">
                {items.length} ملفات جاهزة للتحميل والاستعراض
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#1B202C] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {items.length === 0 ? (
            <div className="text-center py-16 space-y-3">
              <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-[#1B202C] text-slate-400 mx-auto flex items-center justify-center">
                <FileText className="w-6 h-6" />
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">
                لا توجد ملفات سابقة محفوظة بعد
              </p>
            </div>
          ) : (
            items.map((item) => (
              <div
                key={item.id}
                onClick={() => {
                  onSelect(item);
                  onClose();
                }}
                className="group border border-slate-200 dark:border-[#232938] hover:border-blue-400 dark:hover:border-blue-500/60 rounded-xl p-3.5 bg-white dark:bg-[#191E2A] transition-colors cursor-pointer space-y-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h4 className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400">
                      {item.title || item.fileName}
                    </h4>
                    <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">
                      {item.fileName}
                    </p>
                  </div>

                  {item.isDownloaded ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30 text-[10px] shrink-0 font-medium">
                      <CheckCircle2 className="w-3 h-3" />
                      تم التنزيل
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30 text-[10px] shrink-0 font-medium">
                      <AlertCircle className="w-3 h-3" />
                      جاهز
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500 pt-1 border-t border-slate-100 dark:border-[#232938] tabular-nums">
                  <div className="flex items-center gap-2">
                    <span>{formatDate(item.timestamp)}</span>
                    {item.totalPages && item.totalPages > 1 && (
                      <span className="flex items-center gap-0.5 text-slate-600 dark:text-slate-300">
                        · <Layers className="w-3 h-3 text-blue-500" /> {item.totalPages} ص
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={(e) => handleQuickDocxDownload(e, item)}
                      disabled={downloadingId === item.id}
                      className="px-2.5 py-1 bg-blue-600 text-white hover:bg-blue-700 rounded-md text-[11px] font-semibold transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <Download className="w-3 h-3" />
                      <span>Word</span>
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(item.id);
                      }}
                      className="p-1 text-slate-300 dark:text-slate-500 hover:text-red-500 rounded-md hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors cursor-pointer"
                      title="حذف"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {items.length > 0 && (
          <div className="p-3 border-t border-slate-100 dark:border-[#232938] bg-slate-50 dark:bg-[#11141C] flex items-center justify-between">
            <button
              type="button"
              onClick={onClearAll}
              className="text-xs text-red-600 dark:text-red-400 hover:underline font-medium flex items-center gap-1 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              مسح السجل
            </button>
            <span className="text-[11px] text-slate-400 dark:text-slate-500">
              محفوظة محلياً
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
