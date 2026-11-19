import React, { useState } from 'react';
import { Lock, Eye, EyeOff, ArrowLeft, Sun, Moon } from 'lucide-react';
import { setStoredTeamToken } from '../utils/apiClient';
import { verifyTeamPasscode } from '../api/teamAuthApi';
import type { ThemeMode } from '../utils/theme';

interface TeamAccessGateProps {
  theme: ThemeMode;
  onToggleTheme: () => void;
  onAuthenticated: () => void;
}

export const TeamAccessGate: React.FC<TeamAccessGateProps> = ({
  theme,
  onToggleTheme,
  onAuthenticated,
}) => {
  const [code, setCode] = useState('');
  const [showCode, setShowCode] = useState(false);
  const [rememberDevice, setRememberDevice] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) {
      setErrorMsg('يرجى إدخال رمز دخول الفريق للمتابعة.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      const { ok, data } = await verifyTeamPasscode(trimmed, rememberDevice);
      if (!ok || !data?.success) {
        setErrorMsg(data?.error || 'رمز الدخول غير صحيح.');
        return;
      }
      if (data.sessionToken) {
        setStoredTeamToken(data.sessionToken);
      }
      onAuthenticated();
    } catch {
      setErrorMsg('تعذر الاتصال بالخادم للتحقق من الرمز. حاول مرة أخرى.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      dir="rtl"
      className="min-h-screen bg-[#FBFBF9] dark:bg-[#0B0D12] text-slate-900 dark:text-slate-100 flex flex-col justify-between px-4 py-6 transition-colors"
    >
      <div className="max-w-md w-full mx-auto flex items-center justify-between">
        <span className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100">
          PDF Converter
        </span>
        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={theme === 'dark' ? 'التبديل إلى الوضع النهاري' : 'التبديل إلى الوضع الليلي'}
          className="w-9 h-9 rounded-lg border border-slate-200 dark:border-[#2A3142] bg-white dark:bg-[#141720] hover:bg-slate-100 dark:hover:bg-[#1C2130] text-slate-700 dark:text-amber-300 flex items-center justify-center transition-colors cursor-pointer"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>

      <div className="max-w-md w-full mx-auto bg-white dark:bg-[#141720] border border-slate-200 dark:border-[#232938] rounded-2xl p-6 sm:p-8 shadow-sm">
        <div className="w-11 h-11 rounded-xl bg-slate-100 dark:bg-[#1B202C] border border-slate-200 dark:border-[#2A3142] flex items-center justify-center text-slate-800 dark:text-slate-200 mb-5">
          <Lock className="w-5 h-5" />
        </div>

        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">
          بوابة دخول الفريق
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed mb-6">
          أدخل رمز الوصول الخاص بالفريق لفتح منصة تحويل المستندات وتجميع الملفات دون الحاجة لتسجيل دخول بحساب شخصي.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="team-access-code-input"
              className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5"
            >
              رمز دخول الفريق
            </label>
            <div className="relative">
              <input
                id="team-access-code-input"
                type={showCode ? 'text' : 'password'}
                autoComplete="current-password"
                autoFocus
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                  if (errorMsg) setErrorMsg(null);
                }}
                placeholder="أدخل رمز الفريق"
                dir="ltr"
                className="w-full px-3.5 py-2.5 pl-10 rounded-xl border border-slate-300 dark:border-[#2A3142] bg-[#FBFBF9] dark:bg-[#0E1118] text-slate-900 dark:text-slate-100 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowCode((v) => !v)}
                aria-label={showCode ? 'إخفاء الرمز' : 'إظهار الرمز'}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1 cursor-pointer"
              >
                {showCode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <label className="flex items-center gap-2.5 text-xs text-slate-600 dark:text-slate-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={rememberDevice}
              onChange={(e) => setRememberDevice(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 dark:border-[#2A3142] text-blue-600 focus:ring-blue-600"
            />
            <span>تذكر هذا الجهاز لمدة 30 يوماً</span>
          </label>

          {errorMsg && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-xs font-semibold text-red-700 dark:text-red-300"
            >
              {errorMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-60 cursor-pointer"
          >
            <span>{isSubmitting ? 'جاري التحقق...' : 'دخول إلى المنصة'}</span>
            {!isSubmitting && <ArrowLeft className="w-4 h-4" />}
          </button>
        </form>
      </div>

      <div className="max-w-md w-full mx-auto text-center text-xs text-slate-400 dark:text-slate-500">
        وصول محمي برمز الفريق · يعمل على جميع الأجهزة
      </div>
    </div>
  );
};
