import React from 'react';
import { FileText, Plus, Clock } from 'lucide-react';

interface NavbarProps {
  hasResult: boolean;
  onReset: () => void;
  savedCount?: number;
  onOpenHistory?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  hasResult,
  onReset,
  savedCount = 0,
  onOpenHistory,
}) => {
  return (
    <header className="bg-white border-b border-slate-200/80 sticky top-0 z-30 shadow-2xs">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-2">
        {/* Brand / Logo */}
        <div
          onClick={onReset}
          className="flex items-center gap-2.5 cursor-pointer select-none shrink-0"
        >
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-xs">
            <FileText className="w-4 h-4" />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-slate-900 text-sm sm:text-base tracking-tight">
              تفريغ وتحويل PDF والصور
            </span>
            <span className="text-[10px] text-slate-400 font-medium hidden sm:inline -mt-0.5">
              تحويل إلى Word (.docx) و Markdown ونصوص مع معالجة الحزم
            </span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 shrink-0">
          {savedCount > 0 && onOpenHistory && (
            <button
              id="btn-open-history"
              onClick={onOpenHistory}
              className="px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200/80 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Clock className="w-3.5 h-3.5 text-blue-600" />
              <span className="hidden sm:inline">السجل المحفوظ</span>
              <span className="bg-blue-600 text-white text-[10px] px-1.5 py-0.2 rounded-full font-bold">
                {savedCount}
              </span>
            </button>
          )}

          {hasResult && (
            <button
              id="btn-convert-another"
              onClick={onReset}
              className="px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">تحويل ملف جديد</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};



