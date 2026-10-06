import React, { useState } from 'react';
import {
  Clock,
  Download,
  Eye,
  Trash2,
  FileText,
  CheckCircle2,
  AlertCircle,
  Layers
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
      console.error('Quick download failed', err);
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto mt-8 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-blue-600" />
          <h3 className="text-sm font-bold text-slate-800">
            الملفات السابقة والمحفوظة ({items.length})
          </h3>
          <span className="text-[11px] text-slate-400 font-normal">
            (محفوظة في متصفحك ويمكنك تنزيلها أو فتحها بأي وقت)
          </span>
        </div>

        {items.length > 1 && (
          <button
            onClick={onClearAll}
            className="text-[11px] font-medium text-slate-400 hover:text-red-600 transition-colors flex items-center gap-1 cursor-pointer"
          >
            <Trash2 className="w-3 h-3" />
            مسح السجل
          </button>
        )}
      </div>

      {/* Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {items.map((item) => {
          const isDownloading = downloadingId === item.id;

          return (
            <div
              key={item.id}
              onClick={() => onSelect(item)}
              className="group relative bg-white border border-slate-200/90 hover:border-blue-400 hover:shadow-md rounded-xl p-4 transition-all duration-200 cursor-pointer flex flex-col justify-between space-y-3"
            >
              {/* Top Details */}
              <div className="space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs sm:text-sm font-bold text-slate-800 truncate group-hover:text-blue-600 transition-colors">
                        {item.title || item.fileName}
                      </h4>
                      <p className="text-[11px] text-slate-400 truncate max-w-[200px]">
                        {item.fileName}
                      </p>
                    </div>
                  </div>

                  {/* Status Badge */}
                  {item.isDownloaded ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-medium shrink-0">
                      <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                      تم التنزيل
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-medium shrink-0">
                      <AlertCircle className="w-3 h-3 text-amber-500" />
                      جاهز للتنزيل
                    </span>
                  )}
                </div>

                {/* Metadata tags */}
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 pt-1">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3 text-slate-400" />
                    {formatDate(item.timestamp)}
                  </span>
                  {item.totalPages && item.totalPages > 1 && (
                    <span className="flex items-center gap-1 text-slate-600 font-medium">
                      • <Layers className="w-3 h-3 text-blue-500" />
                      {item.totalPages} صفحة
                    </span>
                  )}
                  {item.fileSize && (
                    <span className="text-slate-400">
                      • {formatBytes(item.fileSize)}
                    </span>
                  )}
                </div>
              </div>

              {/* Action Buttons Bar */}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={(e) => handleQuickDocxDownload(e, item)}
                    disabled={isDownloading}
                    className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-600 text-blue-700 hover:text-white rounded-lg text-xs font-semibold transition-all flex items-center gap-1 shadow-2xs cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{isDownloading ? 'جاري التحميل...' : 'تحميل Word'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onSelect(item)}
                    className="px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-medium transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5 text-slate-500" />
                    <span>فتح وعرض</span>
                  </button>
                </div>

                <button
                  type="button"
                  title="حذف من السجل"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(item.id);
                  }}
                  className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
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
