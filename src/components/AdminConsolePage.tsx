import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  Check,
  CheckCircle2,
  Code2,
  Copy,
  Download,
  ExternalLink,
  Globe,
  History,
  Lock,
  LogOut,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  Server,
  ShieldCheck,
  Sliders,
  Terminal,
  Unlock,
  Users,
} from 'lucide-react';
import { getOrCreateClientId, setStoredTeamToken } from '../utils/apiClient';
import {
  downloadLinksGuideBlob,
  revokeAllTeamSessions,
  saveTeamAuthConfig,
} from '../api/teamAuthApi';
import {
  clearAdminLogs,
  deleteAdminUser,
  fetchAdminOverview,
  saveAdminControls,
  updateAdminUserControls,
} from '../api/governanceApi';
import { fetchModelPoolStatus } from '../api/modelsApi';
import { ADMIN_CONSOLE_LINKS } from '../config/adminDeployment';
import type { TeamAuthStatusState } from '../model/auth';
import type { AdminOverviewResponse } from '../model/governance';
import type { ManagedModelView } from '../model/models';
import { AgentCliHubPage } from './AgentCliHubPage';
import { AdminDashboardTab } from './admin/AdminDashboardTab';
import { AdminUsersTab } from './admin/AdminUsersTab';
import { AdminLogsTab } from './admin/AdminLogsTab';
import { AdminControlsTab } from './admin/AdminControlsTab';
import {
  PROJECT_CUSTOM_INSTRUCTIONS_EN,
  PROJECT_CUSTOM_INSTRUCTIONS_AR,
} from '../data/projectCustomInstructions';

export type { TeamAuthStatusState };
type AdminTabId =
  | 'dashboard'
  | 'users'
  | 'logs'
  | 'controls'
  | 'overview'
  | 'instructions'
  | 'cli';

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
  const [activeTab, setActiveTab] = useState<AdminTabId>('dashboard');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Governance Overview (Users, Logs, Site Controls)
  const [overview, setOverview] = useState<AdminOverviewResponse | null>(null);
  const [isLoadingOverview, setIsLoadingOverview] = useState(false);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [livePolling, setLivePolling] = useState(true);
  const [inspectClientId, setInspectClientId] = useState<string | null>(null);
  const [logsFilterClientId, setLogsFilterClientId] = useState<string | null>(null);
  const currentAdminClientId =
    typeof window !== 'undefined' ? getOrCreateClientId() : '';

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

  const loadGovernanceOverview = async (silent = false) => {
    if (!silent) {
      setIsLoadingOverview(true);
      setOverviewError(null);
    }
    try {
      const data = await fetchAdminOverview();
      if (data) {
        setOverview(data);
        setOverviewError(null);
      } else if (!silent) {
        setOverviewError('تعذر جلب بيانات المشرف من الخادم. تأكد من الاتصال أو صلاحية الجلسة.');
      }
    } catch {
      if (!silent) {
        setOverviewError('حدث خطأ أثناء الاتصال بالخادم لجلب بيانات المستخدمين والسجلات.');
      }
    } finally {
      if (!silent) setIsLoadingOverview(false);
    }
  };

  const loadModelsStatus = async (forceRefresh = false) => {
    setIsLoadingModels(true);
    try {
      const data = await fetchModelPoolStatus(forceRefresh);
      if (data) {
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
    void loadGovernanceOverview(false);
    void loadModelsStatus(false);
  }, []);

  useEffect(() => {
    if (!livePolling) return;
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        void loadGovernanceOverview(true);
      }
    }, 8000);
    return () => clearInterval(timer);
  }, [livePolling]);

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
      const blob = await downloadLinksGuideBlob();
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
      const { ok, data } = await saveTeamAuthConfig(enableLock, newCode);
      if (!ok || !data?.success) {
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
      const { ok, data } = await revokeAllTeamSessions();
      if (ok && data?.success) {
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

  const { publishedUrl, adminUrl, fallbackPreUrl, devUrl, studioEditorUrl, deployCommand } =
    ADMIN_CONSOLE_LINKS;
  const sharedPreUrl =
    authStatus?.sharedPublicOrigin && !authStatus.sharedPublicOrigin.includes('127.0.0.1')
      ? authStatus.sharedPublicOrigin
      : fallbackPreUrl;

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
          {overview?.siteControls && (
            <button
              type="button"
              onClick={async () => {
                const nextEnabled = !overview.siteControls.conversionsEnabled;
                const res = await saveAdminControls({ conversionsEnabled: nextEnabled });
                if (res.ok) await loadGovernanceOverview(true);
              }}
              className={`px-3 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                overview.siteControls.conversionsEnabled
                  ? 'border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-500/20'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white'
              }`}
            >
              {overview.siteControls.conversionsEnabled ? (
                <>
                  <PauseCircle className="w-4 h-4" />
                  <span>إيقاف التحويلات فوراً</span>
                </>
              ) : (
                <>
                  <PlayCircle className="w-4 h-4" />
                  <span>استئناف التحويلات</span>
                </>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={() => setLivePolling((v) => !v)}
            className={`px-3 py-2 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
              livePolling
                ? 'border-emerald-200 dark:border-emerald-500/30 bg-emerald-50/70 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                : 'border-slate-200 dark:border-[#2A3142] bg-white dark:bg-[#141720] text-slate-600 dark:text-slate-300'
            }`}
            title="التحديث التلقائي المباشر كل 8 ثوانٍ"
          >
            <span
              className={`w-2 h-2 rounded-full ${
                livePolling ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
              }`}
            />
            <span>{livePolling ? 'تحديث تلقائي: حي' : 'تحديث يدوي'}</span>
          </button>

          <button
            type="button"
            disabled={isLoadingOverview}
            onClick={() => void loadGovernanceOverview(false)}
            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-[#2A3142] bg-white dark:bg-[#141720] hover:bg-slate-50 dark:hover:bg-[#1B202C] text-slate-700 dark:text-slate-200 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingOverview ? 'animate-spin' : ''}`} />
            <span>تحديث</span>
          </button>

          <button
            type="button"
            disabled={isDownloadingGuide}
            onClick={handleDownloadLinksGuide}
            className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>{isDownloadingGuide ? 'جاري التنزيل...' : 'ملف الروابط (.md)'}</span>
          </button>

          <button
            type="button"
            onClick={onExitAdmin}
            className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-[#2A3142] bg-white dark:bg-[#141720] hover:bg-slate-50 dark:hover:bg-[#1B202C] text-slate-800 dark:text-slate-200 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <ArrowRight className="w-4 h-4" />
            <span>واجهة المستخدم</span>
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
        role="tablist"
        className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 dark:border-[#232938]"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'dashboard'}
          onClick={() => setActiveTab('dashboard')}
          className={`px-3.5 py-2.5 text-xs sm:text-sm font-bold border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
            activeTab === 'dashboard'
              ? 'border-blue-600 text-blue-700 dark:text-blue-400'
              : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          <span>لوحة المعلومات</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'users'}
          onClick={() => setActiveTab('users')}
          className={`px-3.5 py-2.5 text-xs sm:text-sm font-bold border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer tabular-nums whitespace-nowrap shrink-0 ${
            activeTab === 'users'
              ? 'border-blue-600 text-blue-700 dark:text-blue-400'
              : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>المستخدمون والتحكم ({overview?.summary.totalUsers ?? 0})</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'logs'}
          onClick={() => setActiveTab('logs')}
          className={`px-3.5 py-2.5 text-xs sm:text-sm font-bold border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer tabular-nums ${
            activeTab === 'logs'
              ? 'border-blue-600 text-blue-700 dark:text-blue-400'
              : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <History className="w-4 h-4" />
          <span>سجل التحويلات ({overview?.logs.length ?? 0})</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'controls'}
          onClick={() => setActiveTab('controls')}
          className={`px-3.5 py-2.5 text-xs sm:text-sm font-bold border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'controls'
              ? 'border-blue-600 text-blue-700 dark:text-blue-400'
              : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <Sliders className="w-4 h-4" />
          <span>التحكم الشامل</span>
          {overview &&
            (!overview.siteControls.siteEnabled || !overview.siteControls.conversionsEnabled) && (
              <span className="w-2 h-2 rounded-full bg-amber-500" />
            )}
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'overview'}
          onClick={() => setActiveTab('overview')}
          className={`px-3.5 py-2.5 text-xs sm:text-sm font-bold border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer ${
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
          role="tab"
          aria-selected={activeTab === 'instructions'}
          onClick={() => setActiveTab('instructions')}
          className={`px-3.5 py-2.5 text-xs sm:text-sm font-bold border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'instructions'
              ? 'border-blue-600 text-blue-700 dark:text-blue-400'
              : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <Code2 className="w-4 h-4" />
          <span>التعليمات الهندسية</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'cli'}
          onClick={() => setActiveTab('cli')}
          className={`px-3.5 py-2.5 text-xs sm:text-sm font-bold border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'cli'
              ? 'border-blue-600 text-blue-700 dark:text-blue-400'
              : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <Terminal className="w-4 h-4" />
          <span>CLI / MCP</span>
        </button>
      </nav>

      {(activeTab === 'dashboard' ||
        activeTab === 'users' ||
        activeTab === 'logs' ||
        activeTab === 'controls') &&
        !overview && (
          <section className="p-8 bg-white dark:bg-[#141720] border border-slate-200 dark:border-[#232938] rounded-2xl text-center space-y-3">
            {overviewError ? (
              <>
                <p className="text-sm font-bold text-red-700 dark:text-red-300">{overviewError}</p>
                <button
                  type="button"
                  onClick={() => void loadGovernanceOverview(false)}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>إعادة المحاولة</span>
                </button>
              </>
            ) : (
              <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
                جاري تحميل بيانات لوحة المعلومات والمستخدمين وسجل التحويلات...
              </p>
            )}
          </section>
        )}

      {/* Tab: Analytics Dashboard (Recharts) */}
      {activeTab === 'dashboard' && overview && (
        <AdminDashboardTab
          summary={overview.summary}
          users={overview.users}
          logs={overview.logs}
          onInspectUser={(clientId) => {
            setInspectClientId(clientId);
            setActiveTab('users');
          }}
          onOpenLogs={() => {
            setLogsFilterClientId(null);
            setActiveTab('logs');
          }}
        />
      )}

      {/* Tab: Users Monitoring & Per-User Controls */}
      {activeTab === 'users' && overview && (
        <AdminUsersTab
          summary={overview.summary}
          users={overview.users}
          logs={overview.logs}
          currentAdminClientId={currentAdminClientId}
          initialSelectedClientId={inspectClientId}
          onUpdateUser={async (clientId, patch) => {
            const res = await updateAdminUserControls(clientId, patch);
            if (res.ok) await loadGovernanceOverview(true);
            return res.ok;
          }}
          onDeleteUser={async (clientId, includeLogs) => {
            const ok = await deleteAdminUser(clientId, includeLogs);
            if (ok) await loadGovernanceOverview(true);
            return ok;
          }}
          onOpenUserLogs={(clientId) => {
            setLogsFilterClientId(clientId);
            setActiveTab('logs');
          }}
        />
      )}

      {/* Tab: Global Conversion Logs */}
      {activeTab === 'logs' && overview && (
        <AdminLogsTab
          logs={overview.logs}
          users={overview.users}
          filterClientId={logsFilterClientId}
          onClearFilterClient={() => setLogsFilterClientId(null)}
          onSelectUserFromLog={(clientId) => {
            setInspectClientId(clientId);
            setActiveTab('users');
          }}
          onClearLogs={async (clientId) => {
            const ok = await clearAdminLogs(clientId);
            if (ok) await loadGovernanceOverview(true);
            return ok;
          }}
        />
      )}

      {/* Tab: Global Platform Controls */}
      {activeTab === 'controls' && overview && (
        <AdminControlsTab
          siteControls={overview.siteControls}
          onSaveControls={async (patch) => {
            const res = await saveAdminControls(patch);
            if (res.ok) await loadGovernanceOverview(true);
            return { ok: res.ok, error: res.error };
          }}
        />
      )}

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
                  aria-label="فتح الرابط العام في نافذة جديدة"
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
