import React from 'react';
import { RefreshCw, ShieldAlert, Sun, Moon } from 'lucide-react';
import type { ThemeMode } from '../utils/theme';

interface AccessBlockedScreenProps {
  message: string;
  clientId?: string;
  theme: ThemeMode;
  onToggleTheme: () => void;
  onRetryCheck: () => void;
  isChecking?: boolean;
}

export const AccessBlockedScreen: React.FC<AccessBlockedScreenProps> = ({
  message,
  clientId,
  theme,
  onToggleTheme,
  onRetryCheck,
  isChecking = false,
}) => {
  return (
    <div
      dir="rtl"
      className="min-h-screen bg-[#FBFBF9] dark:bg-[#0B0D12] text-slate-900 dark:text-slate-100 flex flex-col items-center justify-center p-4 sm:p-6 transition-colors"
    >
      <div className="fixed top-4 left-4">
        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={theme === 'dark' ? 'التبديل إلى الوضع النهاري' : 'التبديل إلى الوضع الليلي'}
          className="w-9 h-9 rounded-lg border border-slate-200 dark:border-[#2A3142] bg-white dark:bg-[#171B26] hover:bg-slate-100 dark:hover:bg-[#1E2433] text-slate-700 dark:text-amber-300 flex items-center justify-center transition-colors cursor-pointer"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>

      <div className="max-w-lg w-full p-6 sm:p-8 rounded-2xl bg-white dark:bg-[#141720] border border-red-200/80 dark:border-red-500/30 shadow-sm space-y-5 text-center">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-red-50 dark:bg-red-500/15 border border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-400 flex items-center justify-center">
          <ShieldAlert className="w-7 h-7" />
        </div>

        <div className="space-y-2">
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
            الوصول إلى المنصة غير متاح حالياً
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
            {message ||
              'المنصة مقيدة أو متوقفة مؤقتاً من قِبل الإدارة. يرجى المحاولة لاحقاً أو مراجعة المشرف.'}
          </p>
        </div>

        {clientId && (
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#0E1118] border border-slate-200 dark:border-[#232938] text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between gap-2">
            <span>معرّف الجلسة للمراجعة:</span>
            <code dir="ltr" className="font-mono font-bold text-slate-700 dark:text-slate-200">
              {clientId}
            </code>
          </div>
        )}

        <button
          type="button"
          disabled={isChecking}
          onClick={onRetryCheck}
          className="w-full py-2.5 px-4 rounded-xl bg-slate-900 dark:bg-blue-600 hover:bg-slate-800 dark:hover:bg-blue-700 disabled:opacity-50 text-white text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
        >
          <RefreshCw className={`w-4 h-4 ${isChecking ? 'animate-spin' : ''}`} />
          <span>{isChecking ? 'جاري التحقق...' : 'إعادة التحقق من حالة الوصول'}</span>
        </button>
      </div>
    </div>
  );
};
