import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Code2,
  Copy,
  Download,
  ExternalLink,
  Globe,
  Lock,
  LogOut,
  RefreshCw,
  Server,
  ShieldCheck,
  Terminal,
  Unlock,
} from 'lucide-react';
import { apiFetch, setStoredTeamToken } from '../utils/apiClient';
import { AgentCliHubPage } from './AgentCliHubPage';
import {
  PROJECT_CUSTOM_INSTRUCTIONS_EN,
  PROJECT_CUSTOM_INSTRUCTIONS_AR,
} from '../data/projectCustomInstructions';

export interface TeamAuthStatusState {
  lockEnabled: boolean;
  authenticated: boolean;
  envManaged: boolean;
  hasPasscodeConfigured: boolean;
  currentOrigin: string;
  sharedPublicOrigin: string;
  isDevPreviewHost: boolean;
}

interface ManagedModelView {
  id: string;
  displayName: string;
  status:
    | 'verified_free'
    | 'candidate'
    | 'cooldown'
    | 'daily_exhausted'
    | 'paid_required'
    | 'unavailable';
  cooldownRemainingSec: number;
  successCount: number;
  errorCount: number;
  lastError: string | null;
}

interface AdminConsolePageProps {
  authStatus: TeamAuthStatusState | null;
  onAuthStatusUpdated: () => Promise<void> | void;
  onExitAdmin: () => void;
}

function generateSuggestedTeamCode(): string {
  const digits = String(Math.floor(100000 + Math.random() * 900000));
  return `TEAM-${digits}`;
}

function getModelStatusLabel(
  status: ManagedModelView['status'],
  cooldownSec: number
): { label: string; toneClass: string } {
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

export const AdminConsolePage: React.FC<AdminConsolePageProps> = ({
  authStatus,
  onAuthStatusUpdated,
  onExitAdmin,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'instructions' | 'cli'>(
    'overview'
  );
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Team Passcode state
  const [newCode, setNewCode] = useState('');
  const [isSavingAuth, setIsSavingAuth] = useState(false);
  const [authFeedback, setAuthFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null
  );

  // Live Gemini Model Pool state
  const [models, setModels] = useState<ManagedModelView[]>([]);
  const [activeModelsCount, setActiveModelsCount] = useState<number>(0);
  const [isLoadingModels, setIsLoadingModels] = useState(false);

  // Custom Instructions state
  const [instructionLang, setInstructionLang] = useState<'en' | 'ar'>('en');

  // Links Guide download state
  const [isDownloadingGuide, setIsDownloadingGuide] = useState(false);
  const [guideDownloadNotice, setGuideDownloadNotice] = useState<string | null>(null);

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
    void loadModelsStatus(false);
  }, []);

  const handleCopy = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2200);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleDownloadLinksGuide = async () => {
    setIsDownloadingGuide(true);
    setGuideDownloadNotice(null);
    try {
      const res = await apiFetch('/api/links-guide/download');
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'LINKS_GUIDE.md';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setGuideDownloadNotice('تم تنزيل ملف دليل الروابط (LINKS_GUIDE.md) بنجاح.');
      setTimeout(() => setGuideDownloadNotice(null), 4000);
    } catch {
      setGuideDownloadNotice('تعذر تنزيل ملف دليل الروابط. تحقق من الاتصال بالخادم.');
    } finally {
      setIsDownloadingGuide(false);
    }
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

  const publishedUrl = 'https://pdf-to-word-markdown-text-converter.ai.studio/';
  const adminUrl = 'https://pdf-to-word-markdown-text-converter.ai.studio/?admin=1';
  const sharedPreUrl =
    authStatus?.sharedPublicOrigin && !authStatus.sharedPublicOrigin.includes('127.0.0.1')
      ? authStatus.sharedPublicOrigin
      : 'https://ais-pre-wpsct27fdufcpry5x6ikjn-685461883733.europe-west2.run.app';
  const devUrl =
    'https://ais-dev-wpsct27fdufcpry5x6ikjn-685461883733.europe-west2.run.app';
  const studioEditorUrl =
    'https://aistudio.google.com/apps/003b657a-dcce-45ea-a80a-255c7ae94b18';
  const deployCommand = 'bash deploy-cloudrun.sh doc-studio-team europe-west2';

  const instructionsText =
    instructionLang === 'en'
      ? PROJECT_CUSTOM_INSTRUCTIONS_EN
      : PROJECT_CUSTOM_INSTRUCTIONS_AR;

  return (
    <div dir="rtl" className="max-w-6xl mx-auto w-full px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      {/* Supervisor Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-slate-200 dark:border-[#232938]">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-900 dark:bg-blue-600 text-white flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg sm:text-2xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
              لوحة المشرف وإدارة المنصة
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-0.5">
              إدارة الروابط، رمز دخول الفريق، النماذج المجانية الحية، أدوات CLI/MCP، وتعليمات الوكلاء
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={isDownloadingGuide}
            onClick={handleDownloadLinksGuide}
            className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>{isDownloadingGuide ? 'جاري التنزيل...' : 'تنزيل ملف الروابط (.md)'}</span>
          </button>

          <button
            type="button"
            onClick={onExitAdmin}
            className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-[#2A3142] bg-white dark:bg-[#141720] hover:bg-slate-50 dark:hover:bg-[#1B202C] text-slate-800 dark:text-slate-200 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <ArrowRight className="w-4 h-4" />
            <span>واجهة المستخدم العادية</span>
          </button>
        </div>
      </div>

      {guideDownloadNotice && (
        <div className="p-3 rounded-xl border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-200 text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{guideDownloadNotice}</span>
        </div>
      )}

      {/* Supervisor Sub-Navigation Tabs */}
      <nav
        aria-label="أقسام لوحة المشرف"
        className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 dark:border-[#232938]"
      >
        <button
          type="button"
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2.5 text-xs sm:text-sm font-bold border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'overview'
              ? 'border-blue-600 text-blue-700 dark:text-blue-400'
              : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <Globe className="w-4 h-4" />
          <span>الروابط والفريق والنماذج</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('instructions')}
          className={`px-4 py-2.5 text-xs sm:text-sm font-bold border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'instructions'
              ? 'border-blue-600 text-blue-700 dark:text-blue-400'
              : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <Code2 className="w-4 h-4" />
          <span>التعليمات الهندسية للوكلاء</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('cli')}
          className={`px-4 py-2.5 text-xs sm:text-sm font-bold border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'cli'
              ? 'border-blue-600 text-blue-700 dark:text-blue-400'
              : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <Terminal className="w-4 h-4" />
          <span>أدوات الأتمتة و CLI / MCP</span>
        </button>
      </nav>

      {/* Tab 1: Links, Team Lock & Live Model Pool */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Card 1: Categorized Links */}
          <section className="p-5 sm:p-6 bg-white dark:bg-[#141720] border border-slate-200 dark:border-[#232938] rounded-2xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  1. خريطة الروابط المعتمدة وتوزيعها
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  الرابط العام للمستخدمين بدون أدوات إدارة، ورابط المشرف لإدارة القفل والنماذج والروابط.
                </p>
              </div>
              <button
                type="button"
                disabled={isDownloadingGuide}
                onClick={handleDownloadLinksGuide}
                className="px-3 py-1.5 rounded-lg border border-blue-200 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-500/10 hover:bg-blue-100 dark:hover:bg-blue-500/20 text-blue-700 dark:text-blue-300 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                <span>تنزيل LINKS_GUIDE.md</span>
              </button>
            </div>

            {/* Public User Link */}
            <div className="p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50/60 dark:bg-emerald-500/10 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-emerald-900 dark:text-emerald-200">
                  أ) الرابط العام للفريق والمستخدمين (يُرسل للجميع)
                </span>
                <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                  واجهة نظيفة بدون أدوات المشرف
                </span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  dir="ltr"
                  value={publishedUrl}
                  className="flex-1 px-3 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-500/30 bg-white dark:bg-[#0E1118] text-xs font-mono text-slate-900 dark:text-slate-100 select-all"
                />
                <button
                  type="button"
                  onClick={() => void handleCopy('pub', publishedUrl)}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1 cursor-pointer shrink-0"
                >
                  {copiedKey === 'pub' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedKey === 'pub' ? 'نُسخ' : 'نسخ'}</span>
                </button>
                <a
                  href={publishedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 rounded-lg border border-emerald-200 dark:border-emerald-500/30 bg-white dark:bg-[#0E1118] text-emerald-700 dark:text-emerald-300"
                  title="فتح الرابط العام"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>

            {/* Admin Link */}
            <div className="p-3.5 rounded-xl border border-blue-200 dark:border-blue-500/30 bg-blue-50/60 dark:bg-blue-500/10 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-blue-900 dark:text-blue-200">
                  ب) رابط المشرف والإدارة (لك وللمشرفين فقط)
                </span>
                <span className="text-[11px] font-bold text-blue-700 dark:text-blue-300">
                  يفتح هذه اللوحة الإدارية مباشرة
                </span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  dir="ltr"
                  value={adminUrl}
                  className="flex-1 px-3 py-1.5 rounded-lg border border-blue-200 dark:border-blue-500/30 bg-white dark:bg-[#0E1118] text-xs font-mono text-slate-900 dark:text-slate-100 select-all"
                />
                <button
                  type="button"
                  onClick={() => void handleCopy('admin', adminUrl)}
                  className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold inline-flex items-center gap-1 cursor-pointer shrink-0"
                >
                  {copiedKey === 'admin' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedKey === 'admin' ? 'نُسخ' : 'نسخ'}</span>
                </button>
              </div>
            </div>

            {/* Fallback Pre-Release Link */}
            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-[#232938] bg-slate-50/70 dark:bg-[#0E1118] space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  ج) رابط المعاينة المشترك البديل (ais-pre)
                </span>
                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  احتياطي للرابط الرسمي
                </span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  dir="ltr"
                  value={sharedPreUrl}
                  className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[#2A3142] bg-white dark:bg-[#141720] text-xs font-mono text-slate-700 dark:text-slate-300 select-all"
                />
                <button
                  type="button"
                  onClick={() => void handleCopy('pre', sharedPreUrl)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[#2A3142] bg-white dark:bg-[#1B202C] text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer shrink-0"
                >
                  {copiedKey === 'pre' ? 'نُسخ' : 'نسخ'}
                </button>
              </div>
            </div>

            {/* Owner-Only Links */}
            <div className="p-3.5 rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50/60 dark:bg-amber-500/10 space-y-2">
              <span className="block text-xs font-bold text-amber-900 dark:text-amber-200">
                د) روابط خاصة بك كمطوّر فقط (ممنوع مشاركتها مع الفريق):
              </span>
              <ul className="text-xs text-amber-900/90 dark:text-amber-200/90 space-y-1 leading-relaxed list-disc pr-4">
                <li>
                  <span dir="ltr" className="font-mono font-semibold">{devUrl}</span> — بيئة المعاينة التطويرية المقيدة بحسابك فقط.
                </li>
                <li>
                  <span dir="ltr" className="font-mono font-semibold">{studioEditorUrl}</span> — لوحة المحرر والمساعد البرمجي لإدارة الشيفرة ومزامنة GitHub والنشر.
                </li>
              </ul>
            </div>

            <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-[#0E1118] border border-slate-200 dark:border-[#232938]">
              <code dir="ltr" className="text-[11px] font-mono text-slate-700 dark:text-slate-300 truncate">
                {deployCommand}
              </code>
              <button
                type="button"
                onClick={() => void handleCopy('deploy', deployCommand)}
                className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 shrink-0 cursor-pointer"
              >
                {copiedKey === 'deploy' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedKey === 'deploy' ? 'نُسخ' : 'نسخ أمر Cloud Run'}</span>
              </button>
            </div>
          </section>

          {/* Card 2: Team Passcode & Sessions */}
          <section className="p-5 sm:p-6 bg-white dark:bg-[#141720] border border-slate-200 dark:border-[#232938] rounded-2xl space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {authStatus?.lockEnabled ? (
                  <Lock className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <Unlock className="w-4 h-4 text-slate-400" />
                )}
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  2. رمز دخول الفريق وإدارة الجلسات
                </h2>
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
                رمز الفريق مُدار حالياً عبر متغير البيئة{' '}
                <span dir="ltr" className="font-mono font-bold">TEAM_ACCESS_CODE</span> في إعدادات الخادم.
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

          {/* Card 3: Live Free-Tier Model Pool */}
          <section className="p-5 sm:p-6 bg-white dark:bg-[#141720] border border-slate-200 dark:border-[#232938] rounded-2xl space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                  3. تجمع النماذج المجانية الحية ({activeModelsCount} نشط)
                </h2>
              </div>
              <button
                type="button"
                disabled={isLoadingModels}
                onClick={() => void loadModelsStatus(true)}
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
                    <th className="py-2.5 px-3 font-semibold">النموذج</th>
                    <th className="py-2.5 px-3 font-semibold">الحالة الفعلية</th>
                    <th className="py-2.5 px-3 font-semibold text-left">النجاح / الأخطاء</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-[#1F2533]">
                  {models.length === 0 ? (
                    <tr>
                      <td
                        colSpan={3}
                        className="py-4 px-3 text-center text-slate-500 dark:text-slate-400"
                      >
                        {isLoadingModels ? 'جاري فحص النماذج المتاحة...' : 'لا توجد بيانات فحص بعد.'}
                      </td>
                    </tr>
                  ) : (
                    models.map((m) => {
                      const view = getModelStatusLabel(m.status, m.cooldownRemainingSec);
                      return (
                        <tr key={m.id} className="hover:bg-slate-50/70 dark:hover:bg-[#191E2B]">
                          <td
                            className="py-2 px-3 font-mono text-slate-800 dark:text-slate-200"
                            dir="ltr"
                          >
                            {m.id}
                          </td>
                          <td className={`py-2 px-3 font-semibold tabular-nums ${view.toneClass}`}>
                            {view.label}
                          </td>
                          <td
                            className="py-2 px-3 font-mono tabular-nums text-left text-slate-500 dark:text-slate-400"
                            dir="ltr"
                          >
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
      )}

      {/* Tab 2: Project Custom Instructions */}
      {activeTab === 'instructions' && (
        <section className="p-5 sm:p-6 bg-white dark:bg-[#141720] border border-slate-200 dark:border-[#232938] rounded-2xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                تعليمات هندسية مخصصة مستخرجة من معمارية وأكواد هذا المشروع
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                انسخ هذا النص وضعه في خانة Custom Instructions لأي وكيل برمجي سيعمل على صيانة أو تطوير المشروع.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className="flex items-center bg-slate-100 dark:bg-[#0E1118] p-0.5 rounded-lg text-[11px] font-bold">
                <button
                  type="button"
                  onClick={() => setInstructionLang('en')}
                  className={`px-2.5 py-1 rounded-md cursor-pointer transition-colors ${
                    instructionLang === 'en'
                      ? 'bg-white dark:bg-[#1E2433] text-slate-900 dark:text-slate-100 shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  English (موصى به)
                </button>
                <button
                  type="button"
                  onClick={() => setInstructionLang('ar')}
                  className={`px-2.5 py-1 rounded-md cursor-pointer transition-colors ${
                    instructionLang === 'ar'
                      ? 'bg-white dark:bg-[#1E2433] text-slate-900 dark:text-slate-100 shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  العربية
                </button>
              </div>

              <button
                type="button"
                onClick={() => void handleCopy('instructions', instructionsText)}
                className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                {copiedKey === 'instructions' ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>تم النسخ</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>نسخ التعليمات</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <pre
            dir={instructionLang === 'en' ? 'ltr' : 'rtl'}
            className="p-4 rounded-xl border border-slate-200 dark:border-[#232938] bg-[#FBFBF9] dark:bg-[#0E1118] text-[11px] sm:text-xs font-mono text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed max-h-[540px] overflow-y-auto select-all"
          >
            {instructionsText}
          </pre>
        </section>
      )}

      {/* Tab 3: Automation CLI & MCP Hub */}
      {activeTab === 'cli' && (
        <AgentCliHubPage embedded onBack={() => setActiveTab('overview')} />
      )}
    </div>
  );
};
