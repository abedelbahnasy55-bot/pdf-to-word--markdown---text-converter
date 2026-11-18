import React from 'react';
import {
  FileText,
  Plus,
  Clock,
  Layers,
  RotateCcw,
  BookOpen,
  Sun,
  Moon,
  ArrowRight,
} from 'lucide-react';
import type { ThemeMode } from '../utils/theme';

interface NavbarProps {
  hasResult: boolean;
  onReset: () => void;
  savedCount?: number;
  onOpenHistory?: () => void;
  batchCount?: number;
  onOpenBatch?: () => void;
  isShowingBatch?: boolean;
  onRestorePreviousBatch?: () => void;
  onOpenSmartCompiler?: () => void;
  isShowingSmartCompiler?: boolean;
  theme?: ThemeMode;
  onToggleTheme?: () => void;
  activeServerJobsCount?: number;
  isAdminMode?: boolean;
  onExitAdmin?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  hasResult,
  onReset,
  savedCount = 0,
  onOpenHistory,
  batchCount = 0,
  onOpenBatch,
  isShowingBatch = false,
  onRestorePreviousBatch,
  onOpenSmartCompiler,
  isShowingSmartCompiler = false,
  theme = 'light',
  onToggleTheme,
  activeServerJobsCount = 0,
  isAdminMode = false,
  onExitAdmin,
}) => {
  return (
    <header className="bg-white/95 dark:bg-[#11141D]/95 backdrop-blur-md border-b border-slate-200/80 dark:border-[#232938] sticky top-0 z-30 transition-colors">
      <div className="max-w-7xl mx-auto px-3 sm:px-5 h-14 flex items-center justify-between gap-2">
        {/* Zone 1: Clean Editorial Brand */}
        <button
          type="button"
          onClick={() => {
            if (isAdminMode && onExitAdmin) {
              onExitAdmin();
            } else {
              onReset();
            }
          }}
          className="flex items-center gap-2.5 cursor-pointer select-none shrink-0 text-right group"
        >
          <div className="w-8 h-8 rounded-lg bg-slate-900 dark:bg-blue-600 flex items-center justify-center text-white transition-colors">
            <FileText className="w-4 h-4" />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-slate-900 dark:text-slate-100 text-xs sm:text-sm tracking-tight group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
              {isAdminMode ? 'PDF Converter · لوحة المشرف' : 'PDF Converter'}
            </span>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium hidden md:inline -mt-0.5">
              {isAdminMode
                ? 'إدارة الروابط، قفل الفريق، مراقبة النماذج، وأدوات الأتمتة'
                : 'تفريغ وتنسيق PDF والصور بدقة احترافية إلى Word و Markdown وتجميع الكتب'}
            </span>
          </div>
        </button>

        {/* Zone 2 & 3: Navigation & Utilities */}
        <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar py-1">
          {isAdminMode ? (
            <>
              {onExitAdmin && (
                <button
                  id="btn-exit-admin-mode"
                  type="button"
                  onClick={onExitAdmin}
                  className="px-3 py-1.5 text-xs font-bold rounded-lg bg-slate-900 dark:bg-blue-600 hover:bg-slate-800 dark:hover:bg-blue-700 text-white transition-colors flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                  <span>العودة لواجهة المستخدم</span>
                </button>
              )}
            </>
          ) : (
            <>
              {batchCount > 0 && onOpenBatch && (
                <button
                  id="btn-nav-batch-queue"
                  type="button"
                  onClick={onOpenBatch}
                  className={`px-2.5 py-1.5 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shrink-0 ${
                    isShowingBatch
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-[#1B202C] hover:bg-slate-200 dark:hover:bg-[#232938] border border-slate-200 dark:border-[#2A3142]'
                  }`}
                  title="العودة لصفحة دفعة الكتب والملفات"
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">قائمة التحويل</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded font-bold tabular-nums ${
                      isShowingBatch
                        ? 'bg-white/20 text-white'
                        : 'bg-blue-600 text-white'
                    }`}
                  >
                    {batchCount}
                  </span>
                </button>
              )}

              {activeServerJobsCount > 0 && onOpenBatch && !isShowingBatch && (
                <button
                  type="button"
                  onClick={onOpenBatch}
                  className="px-2.5 py-1.5 text-xs font-bold rounded-lg bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30 hover:bg-emerald-100 dark:hover:bg-emerald-500/25 transition-colors flex items-center gap-1.5 cursor-pointer shrink-0 tabular-nums"
                  title="توجد مهام جارية في الخلفية على الخادم"
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span>مهام جارية ({activeServerJobsCount})</span>
                </button>
              )}

              {(!batchCount || batchCount === 0) && savedCount > 0 && onRestorePreviousBatch && (
                <button
                  id="btn-nav-fast-restore"
                  type="button"
                  onClick={onRestorePreviousBatch}
                  className="px-2.5 py-1.5 text-xs font-bold text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-500/15 hover:bg-emerald-100 dark:hover:bg-emerald-500/25 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer border border-emerald-200 dark:border-emerald-500/30 shrink-0 tabular-nums"
                  title="استرجاع دفعة الكتب السابقة مباشرة إلى صفحة التحويل"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span className="hidden sm:inline">استرجاع الكتب ({savedCount})</span>
                </button>
              )}

              {onOpenSmartCompiler && (
                <button
                  id="btn-nav-smart-compiler"
                  type="button"
                  onClick={onOpenSmartCompiler}
                  className={`px-2.5 sm:px-3 py-1.5 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shrink-0 ${
                    isShowingSmartCompiler
                      ? 'bg-slate-900 dark:bg-blue-600 text-white'
                      : 'text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-[#1B202C] hover:bg-slate-200 dark:hover:bg-[#232938] border border-slate-200 dark:border-[#2A3142]'
                  }`}
                  title="استوديو التحرير وتجميع الكتب والامتحانات والبحث الدلالي"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>استوديو التجميع</span>
                </button>
              )}

              {savedCount > 0 && onOpenHistory && (
                <button
                  id="btn-open-history"
                  type="button"
                  onClick={onOpenHistory}
                  className="px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-[#1B202C] hover:bg-slate-200 dark:hover:bg-[#232938] border border-slate-200 dark:border-[#2A3142] rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shrink-0 tabular-nums"
                  title="السجل المحفوظ"
                >
                  <Clock className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  <span className="hidden lg:inline">السجل</span>
                  <span className="bg-slate-700 dark:bg-slate-600 text-white text-[10px] px-1.5 py-0.2 rounded font-bold">
                    {savedCount}
                  </span>
                </button>
              )}

              {hasResult && (
                <button
                  id="btn-convert-another"
                  type="button"
                  onClick={onReset}
                  className="px-2.5 py-1.5 text-xs font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-500/15 hover:bg-blue-100 dark:hover:bg-blue-500/25 border border-blue-200 dark:border-blue-500/30 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">ملف جديد</span>
                </button>
              )}
            </>
          )}

          {onToggleTheme && (
            <button
              id="btn-theme-toggle"
              type="button"
              onClick={onToggleTheme}
              aria-label={theme === 'dark' ? 'التبديل إلى الوضع النهاري' : 'التبديل إلى الوضع الليلي'}
              title={theme === 'dark' ? 'التبديل إلى الوضع الفاتح' : 'التبديل إلى الوضع الداكن'}
              className="w-8 h-8 rounded-lg border border-slate-200 dark:border-[#2A3142] bg-white dark:bg-[#171B26] hover:bg-slate-100 dark:hover:bg-[#1E2433] text-slate-700 dark:text-amber-300 flex items-center justify-center transition-colors cursor-pointer shrink-0"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
