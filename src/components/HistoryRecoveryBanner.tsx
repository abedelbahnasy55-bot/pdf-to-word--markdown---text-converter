import React from 'react';
import { Layers, Download } from 'lucide-react';

interface HistoryRecoveryBannerProps {
  savedCount: number;
  onRestoreToBatch: () => void;
  onDownloadAllZip: () => void;
}

export const HistoryRecoveryBanner: React.FC<HistoryRecoveryBannerProps> = ({
  savedCount,
  onRestoreToBatch,
  onDownloadAllZip,
}) => {
  if (savedCount === 0) return null;

  return (
    <div className="bg-slate-900 dark:bg-[#141720] text-white p-4 sm:p-5 rounded-2xl shadow-sm border border-slate-800 dark:border-[#232938] flex flex-col sm:flex-row items-center justify-between gap-4 animate-fadeIn">
      <div className="flex items-center gap-3 text-center sm:text-right">
        <div className="w-10 h-10 rounded-xl bg-slate-800 dark:bg-[#1B202C] flex items-center justify-center shrink-0">
          <Layers className="w-5 h-5 text-blue-400" />
        </div>
        <div>
          <h4 className="font-bold text-sm sm:text-base">
            ملفاتك السابقة محفوظة ({savedCount} ملف)
          </h4>
          <p className="text-xs text-slate-400 mt-0.5">
            نتائج التحويل محفوظة محلياً في متصفحك.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2.5 w-full sm:w-auto justify-center sm:justify-end shrink-0">
        <button
          type="button"
          onClick={onRestoreToBatch}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs sm:text-sm rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-2"
        >
          <Layers className="w-4 h-4" />
          <span>عرض الملفات ({savedCount})</span>
        </button>
        <button
          type="button"
          onClick={onDownloadAllZip}
          className="px-4 py-2.5 bg-white/15 hover:bg-white/25 text-white font-bold text-xs sm:text-sm rounded-xl border border-white/20 transition-all cursor-pointer flex items-center gap-1.5"
        >
          <Download className="w-3.5 h-3.5" />
          <span>تنزيل الكل ZIP</span>
        </button>
      </div>
    </div>
  );
};
