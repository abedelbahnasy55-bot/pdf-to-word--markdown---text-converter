import React, { useState } from 'react';
import {
  X,
  Clock,
  Download,
  Trash2,
  FileText,
  CheckCircle2,
  AlertCircle,
  Layers
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
      const baseName = (item.fileName || 'document').replace(/\.pdf$/i, '');
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
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
      />

      {/* Drawer panel */}
      <div className="absolute inset-y-0 left-0 max-w-md w-full bg-white shadow-2xl flex flex-col z-10 animate-in slide-in-from-left duration-200">
        {/* Header */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                الملفات المحفوظة والسابقة
              </h3>
              <p className="text-xs text-slate-400">
                {items.length} ملفات جاهزة للتحميل والاستعراض
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {items.length === 0 ? (
            <div className="text-center py-16 space-y-3">
              <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
                <FileText className="w-6 h-6" />
              </div>
              <p className="text-sm text-slate-500 font-medium">
                لا توجد ملفات سابقة محفوظة بعد
              </p>
              <p className="text-xs text-slate-400 max-w-xs mx-auto">
                عندما تقوم بتحويل أي ملف، سيتم حفظه هنا تلقائياً لتتمكن من تنزيله في أي وقت حتى بعد إعادة تشغيل المتصفح.
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
                className="group border border-slate-200 hover:border-blue-300 rounded-xl p-3.5 bg-white hover:bg-blue-50/20 transition-all cursor-pointer space-y-2.5 shadow-2xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h4 className="text-xs sm:text-sm font-bold text-slate-800 truncate group-hover:text-blue-600">
                      {item.title || item.fileName}
                    </h4>
                    <p className="text-[11px] text-slate-400 truncate">
                      {item.fileName}
                    </p>
                  </div>

                  {item.isDownloaded ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] shrink-0 font-medium">
                      <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                      تم التنزيل
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[10px] shrink-0 font-medium">
                      <AlertCircle className="w-3 h-3 text-amber-500" />
                      لم يتم التنزيل
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-100">
                  <div className="flex items-center gap-2">
                    <span>{formatDate(item.timestamp)}</span>
                    {item.totalPages && item.totalPages > 1 && (
                      <span className="flex items-center gap-0.5 text-slate-600">
                        • <Layers className="w-3 h-3 text-blue-500" /> {item.totalPages} ص
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={(e) => handleQuickDocxDownload(e, item)}
                      disabled={downloadingId === item.id}
                      className="px-2 py-1 bg-blue-600 text-white hover:bg-blue-700 rounded-md text-[11px] font-semibold transition-colors flex items-center gap-1"
                    >
                      <Download className="w-3 h-3" />
                      <span>تحميل Word</span>
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(item.id);
                      }}
                      className="p-1 text-slate-300 hover:text-red-500 rounded-md hover:bg-red-50 transition-colors"
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

        {/* Footer */}
        {items.length > 0 && (
          <div className="p-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
            <button
              onClick={onClearAll}
              className="text-xs text-red-600 hover:text-red-700 font-medium flex items-center gap-1 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              مسح جميع الملفات المحفوظة
            </button>
            <span className="text-[11px] text-slate-400">
              مخزنة محلياً في متصفحك
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
