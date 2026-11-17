import React, { useEffect, useState } from 'react';
import {
  X,
  Copy,
  Check,
  Lock,
  Unlock,
  RefreshCw,
  LogOut,
  Globe,
  Server,
} from 'lucide-react';
import { apiFetch, setStoredTeamToken } from '../utils/apiClient';

interface ManagedModelView {
  id: string;
  displayName: string;
  status: 'verified_free' | 'candidate' | 'cooldown' | 'daily_exhausted' | 'paid_required' | 'unavailable';
  cooldownRemainingSec: number;
  successCount: number;
  errorCount: number;
  lastError: string | null;
}

export interface TeamAuthStatusState {
  lockEnabled: boolean;
  authenticated: boolean;
  envManaged: boolean;
  hasPasscodeConfigured: boolean;
  currentOrigin: string;
  sharedPublicOrigin: string;
  isDevPreviewHost: boolean;
}

interface TeamShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  authStatus: TeamAuthStatusState | null;
  onAuthStatusUpdated: () => Promise<void> | void;
}

function generateSuggestedTeamCode(): string {
  const digits = String(Math.floor(100000 + Math.random() * 900000));
  return `TEAM-${digits}`;
}

function getModelStatusLabel(status: ManagedModelView['status'], cooldownSec: number): {
  label: string;
  toneClass: string;
} {
  switch (status) {
    case 'verified_free':
      return {
        label: 'نشط ومجاني',
        toneClass: 'text-emerald-700 dark:text-emerald-300',
      };
    case 'candidate':
      return {
        label: 'جاهز في القائمة',
        toneClass: 'text-blue-700 dark:text-blue-300',
      };
    case 'cooldown':
      return {
        label: `تهدئة مؤقتة (${cooldownSec}ث)`,
        toneClass: 'text-amber-700 dark:text-amber-300',
      };
    case 'daily_exhausted':
      return {
        label: 'استهلك الحد اليومي',
        toneClass: 'text-amber-700 dark:text-amber-300',
      };
    case 'paid_required':
      return {
        label: 'مدفوع مستبعد',
        toneClass: 'text-slate-500 dark:text-slate-400',
      };
    case 'unavailable':
      return {
        label: 'غير متاح بهذا المفتاح',
        toneClass: 'text-red-600 dark:text-red-400',
      };
  }
}

export const TeamShareModal: React.FC<TeamShareModalProps> = ({
  isOpen,
  onClose,
  authStatus,
  onAuthStatusUpdated,
}) => {
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedDeploy, setCopiedDeploy] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [isSavingAuth, setIsSavingAuth] = useState(false);
  const [authFeedback, setAuthFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [models, setModels] = useState<ManagedModelView[]>([]);
  const [activeModelsCount, setActiveModelsCount] = useState<number>(0);
  const [isLoadingModels, setIsLoadingModels] = useState(false);

  const loadModelsStatus = async (forceRefresh = false) => {
    setIsLoadingModels(true);
    try {
      const res = await apiFetch(
        forceRefresh ? '/api/models/refresh' : '/api/models/status',
        { method: forceRefresh ? 'POST' : 'GET' }
      );
      const data = await res.json();
      if (data?.success && Array.isArray(data.models)) {
        setModels(data.models);
        setActiveModelsCount(data.activeCount || 0);
      }
    } catch {
      // ignore transient
    } finally {
      setIsLoadingModels(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setAuthFeedback(null);
      void loadModelsStatus(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const publicUrl =
    authStatus?.sharedPublicOrigin ||
    (typeof window !== 'undefined'
      ? window.location.origin.replace(/^https:\/\/ais-dev-/i, 'https://ais-pre-')
      : '');

  const deployCommand = 'bash deploy-cloudrun.sh doc-studio-team europe-west2';

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } catch {}
  };

  const handleCopyDeploy = async () => {
    try {
      await navigator.clipboard.writeText(deployCommand);
      setCopiedDeploy(true);
      setTimeout(() => setCopiedDeploy(false), 2000);
    } catch {}
  };

  const handleSavePasscode = async (enableLock: boolean) => {
    setIsSavingAuth(true);
    setAuthFeedback(null);
    try {
      const res = await apiFetch('/api/auth/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: enableLock,
          newCode: newCode.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        setAuthFeedback({
          type: 'err',
          text: data?.error || 'تعذر حفظ إعدادات رمز الدخول.',
        });
        return;
      }
      if (data.sessionToken) {
        setStoredTeamToken(data.sessionToken);
      } else if (!data.lockEnabled) {
        setStoredTeamToken(null);
      }
      setNewCode('');
      setAuthFeedback({
        type: 'ok',
        text: data.lockEnabled
          ? 'تم تفعيل رمز دخول الفريق وحفظ الجلسة بنجاح.'
          : 'تم إلغاء قفل رمز الدخول؛ المنصة مفتوحة مباشرة.',
      });
      await onAuthStatusUpdated();
    } catch {
      setAuthFeedback({ type: 'err', text: 'فشل الاتصال بالخادم أثناء الحفظ.' });
    } finally {
      setIsSavingAuth(false);
    }
  };

  const handleRevokeAll = async () => {
    setIsSavingAuth(true);
    setAuthFeedback(null);
    try {
      const res = await apiFetch('/api/auth/revoke-all', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data?.success) {
        if (data.sessionToken) setStoredTeamToken(data.sessionToken);
        setAuthFeedback({
          type: 'ok',
          text: 'تم إنهاء جلسات جميع الأجهزة الأخرى؛ سيُطلب من الفريق إعادة إدخال الرمز.',
        });
        await onAuthStatusUpdated();
      }
    } finally {
      setIsSavingAuth(false);
    }
  };

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-50 bg-slate-900/50 dark:bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="max-w-2xl w-full bg-white dark:bg-[#141720] border border-slate-200 dark:border-[#232938] rounded-2xl shadow-xl overflow-hidden my-auto">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-[#232938] flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Globe className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" />
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                مشاركة رابط الفريق وإعدادات الوصول والنماذج
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                إدارة الرابط العام، رمز دخول الفريق، ومراقبة النماذج المجانية النشطة
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-[#1E2433] text-slate-500 dark:text-slate-400 flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-6 max-h-[82vh] overflow-y-auto">
          {/* Section 1: Public Team URL */}
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                1. رابط الفريق العام
              </h3>
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {authStatus?.isDevPreviewHost
                  ? 'أنت حالياً على رابط المطور الخاص — انسخ الرابط العام بالأسفل'
                  : 'رابط التشغيل العام'}
              </span>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <input
                type="text"
                readOnly
                dir="ltr"
                value={publicUrl}
                className="flex-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-[#2A3142] bg-[#FBFBF9] dark:bg-[#0E1118] text-xs font-mono text-slate-800 dark:text-slate-200 select-all"
              />
              <button
                type="button"
                onClick={handleCopyUrl}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shrink-0 whitespace-nowrap"
              >
                {copiedUrl ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedUrl ? 'تم النسخ' : 'نسخ رابط الفريق'}</span>
              </button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              هذا هو رابط المشاركة الرسمي للفريق (<span dir="ltr" className="font-mono">ais-pre-...</span>). لتفعيله أمام الجميع: اضغط على <strong className="text-slate-800 dark:text-slate-200">Share App</strong> أو <strong className="text-slate-800 dark:text-slate-200">Deploy</strong> بالأعلى واختر <strong className="text-slate-800 dark:text-slate-200">Public / Anyone with the link</strong>، ثم فعّل رمز دخول الفريق من القسم (2) بالأسفل لحماية الوصول. كما يتضمن المستودع أمر نشر مستقل على Cloud Run يعمل دون أي حسابات Google.
            </p>

            <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-[#0E1118] border border-slate-200 dark:border-[#232938]">
              <code dir="ltr" className="text-[11px] font-mono text-slate-700 dark:text-slate-300 truncate">
                {deployCommand}
              </code>
              <button
                type="button"
                onClick={handleCopyDeploy}
                className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 shrink-0 cursor-pointer"
              >
                {copiedDeploy ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedDeploy ? 'نُسخ' : 'نسخ أمر النشر'}</span>
              </button>
            </div>
          </section>

          <hr className="border-slate-200 dark:border-[#232938]" />

          {/* Section 2: Simple Team Access Passcode */}
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {authStatus?.lockEnabled ? (
                  <Lock className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <Unlock className="w-4 h-4 text-slate-400" />
                )}
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  2. رمز دخول الفريق البسيط
                </h3>
              </div>
              <span
                className={`text-xs font-bold ${
                  authStatus?.lockEnabled
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {authStatus?.lockEnabled ? 'القفل مُفعّل (محمي برمز)' : 'مفتوح بدون رمز حالياً'}
              </span>
            </div>

            {authStatus?.envManaged ? (
              <div className="p-3 rounded-xl bg-blue-50/70 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 text-xs text-blue-800 dark:text-blue-300">
                رمز الفريق مُدار حالياً عبر متغير البيئة <span dir="ltr" className="font-mono font-bold">TEAM_ACCESS_CODE</span> في إعدادات الخادم.
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value)}
                    placeholder={
                      authStatus?.hasPasscodeConfigured
                        ? 'أدخل رمزاً جديداً (اتركه فارغاً للإبقاء على الرمز الحالي)'
                        : 'اكتب رمز دخول الفريق (4 أحرف فأكثر، مثل TEAM-4821)'
                    }
                    dir="ltr"
                    className="flex-1 px-3 py-2 rounded-xl border border-slate-300 dark:border-[#2A3142] bg-[#FBFBF9] dark:bg-[#0E1118] text-xs font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600"
                  />
                  <button
                    type="button"
                    onClick={() => setNewCode(generateSuggestedTeamCode())}
                    className="px-3 py-2 rounded-xl border border-slate-200 dark:border-[#2A3142] bg-slate-50 dark:bg-[#1B202C] hover:bg-slate-100 dark:hover:bg-[#232938] text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer shrink-0 whitespace-nowrap"
                  >
                    توليد رمز عشوائي
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={isSavingAuth}
                    onClick={() => handleSavePasscode(true)}
                    className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors disabled:opacity-50 cursor-pointer whitespace-nowrap"
                  >
                    حفظ الرمز وتفعيل القفل
                  </button>

                  {authStatus?.lockEnabled && (
                    <>
                      <button
                        type="button"
                        disabled={isSavingAuth}
                        onClick={() => handleSavePasscode(false)}
                        className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-[#2A3142] bg-white dark:bg-[#1B202C] hover:bg-slate-50 dark:hover:bg-[#232938] text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer whitespace-nowrap"
                      >
                        تعطيل القفل
                      </button>

                      <button
                        type="button"
                        disabled={isSavingAuth}
                        onClick={handleRevokeAll}
                        className="px-3.5 py-2 rounded-xl border border-red-200 dark:border-red-500/30 bg-red-50/70 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 text-xs font-semibold text-red-700 dark:text-red-300 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>إنهاء جلسات الأجهزة</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

            {authFeedback && (
              <div
                className={`p-2.5 rounded-xl text-xs font-semibold border ${
                  authFeedback.type === 'ok'
                    ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-300'
                    : 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300'
                }`}
              >
                {authFeedback.text}
              </div>
            )}
          </section>

          <hr className="border-slate-200 dark:border-[#232938]" />

          {/* Section 3: Live Free-Tier Model Discovery & Rotation */}
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  3. تجمع النماذج المجانية الحية ({activeModelsCount} نشط)
                </h3>
              </div>
              <button
                type="button"
                disabled={isLoadingModels}
                onClick={() => loadModelsStatus(true)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[#2A3142] bg-slate-50 dark:bg-[#1B202C] hover:bg-slate-100 dark:hover:bg-[#232938] text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingModels ? 'animate-spin' : ''}`} />
                <span>فحص النماذج الحية الآن</span>
              </button>
            </div>

            <div className="border border-slate-200 dark:border-[#232938] rounded-xl overflow-hidden">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 dark:bg-[#0E1118] border-b border-slate-200 dark:border-[#232938] text-slate-600 dark:text-slate-400">
                  <tr>
                    <th className="py-2 px-3 font-semibold">النموذج</th>
                    <th className="py-2 px-3 font-semibold">الحالة الفعلية</th>
                    <th className="py-2 px-3 font-semibold text-left">النجاح / الأخطاء</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-[#1F2533]">
                  {models.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="py-4 px-3 text-center text-slate-500 dark:text-slate-400">
                        {isLoadingModels ? 'جاري فحص النماذج المتاحة...' : 'لا توجد بيانات فحص بعد.'}
                      </td>
                    </tr>
                  ) : (
                    models.map((m) => {
                      const view = getModelStatusLabel(m.status, m.cooldownRemainingSec);
                      return (
                        <tr key={m.id} className="hover:bg-slate-50/70 dark:hover:bg-[#191E2B]">
                          <td className="py-2 px-3 font-mono text-slate-800 dark:text-slate-200" dir="ltr">
                            {m.id}
                          </td>
                          <td className={`py-2 px-3 font-semibold tabular-nums ${view.toneClass}`}>
                            {view.label}
                          </td>
                          <td className="py-2 px-3 font-mono tabular-nums text-left text-slate-500 dark:text-slate-400" dir="ltr">
                            {m.successCount} / {m.errorCount}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
