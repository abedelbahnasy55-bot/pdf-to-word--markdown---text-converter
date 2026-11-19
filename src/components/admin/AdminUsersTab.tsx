import React, { useMemo, useState, useEffect } from 'react';
import {
  Ban,
  CheckCircle2,
  FileText,
  History,
  Monitor,
  PauseCircle,
  RotateCcw,
  Save,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserCheck,
  Users,
} from 'lucide-react';
import { CustomSelect } from '../ui/CustomSelect';
import type {
  AdminOverviewSummary,
  ConversionLogView,
  TrackedUserView,
  UserAccessMode,
} from '../../model/governance';
import {
  formatAdminDateTime,
  formatDurationMs,
  formatFileSizeCompact,
  formatRelativeTimeAr,
  getAccessModeView,
  getConversionStatusView,
  getOperationLabelAr,
} from './adminFormatters';

type UserFilterOption = 'all' | 'online' | 'active' | 'block_conversions' | 'block_site';

interface AdminUsersTabProps {
  summary: AdminOverviewSummary;
  users: TrackedUserView[];
  logs: ConversionLogView[];
  currentAdminClientId?: string;
  initialSelectedClientId?: string | null;
  onUpdateUser: (
    clientId: string,
    patch: {
      displayName?: string;
      adminNote?: string;
      accessMode?: UserAccessMode;
      customBlockMessage?: string;
      customDailyPageLimit?: number;
      blockMatchingIpToo?: boolean;
      resetTodayQuota?: boolean;
    }
  ) => Promise<boolean>;
  onDeleteUser: (clientId: string, includeLogs: boolean) => Promise<boolean>;
  onOpenUserLogs: (clientId: string) => void;
}

export const AdminUsersTab: React.FC<AdminUsersTabProps> = ({
  summary,
  users,
  logs,
  currentAdminClientId,
  initialSelectedClientId,
  onUpdateUser,
  onDeleteUser,
  onOpenUserLogs,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<UserFilterOption>('all');
  const [selectedClientId, setSelectedClientId] = useState<string | null>(
    initialSelectedClientId || null
  );

  // Form states for currently selected user
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editAdminNote, setEditAdminNote] = useState('');
  const [editAccessMode, setEditAccessMode] = useState<UserAccessMode>('active');
  const [editCustomMsg, setEditCustomMsg] = useState('');
  const [editDailyPageLimit, setEditDailyPageLimit] = useState<number>(0);
  const [editBlockIpToo, setEditBlockIpToo] = useState<boolean>(false);
  const [isSavingUser, setIsSavingUser] = useState(false);
  const [confirmDeleteStep, setConfirmDeleteStep] = useState(false);
  const [userFeedback, setUserFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null
  );

  useEffect(() => {
    if (initialSelectedClientId) {
      setSelectedClientId(initialSelectedClientId);
    }
  }, [initialSelectedClientId]);

  const selectedUser = useMemo(
    () => users.find((u) => u.clientId === selectedClientId) || null,
    [users, selectedClientId]
  );

  useEffect(() => {
    if (!selectedUser) return;
    setEditDisplayName(selectedUser.displayName || '');
    setEditAdminNote(selectedUser.adminNote || '');
    setEditAccessMode(selectedUser.accessMode || 'active');
    setEditCustomMsg(selectedUser.customBlockMessage || '');
    setEditDailyPageLimit(selectedUser.customDailyPageLimit || 0);
    setEditBlockIpToo(Boolean(selectedUser.blockMatchingIpToo));
    setConfirmDeleteStep(false);
    setUserFeedback(null);
  }, [selectedUser?.clientId]);

  const filteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const onlineCutoff = Date.now() - 5 * 60 * 1000;
    return users.filter((u) => {
      if (filterMode === 'online' && u.lastSeenAt < onlineCutoff) return false;
      if (
        (filterMode === 'active' ||
          filterMode === 'block_conversions' ||
          filterMode === 'block_site') &&
        u.accessMode !== filterMode
      ) {
        return false;
      }
      if (!q) return true;
      return (
        u.clientId.toLowerCase().includes(q) ||
        (u.displayName || '').toLowerCase().includes(q) ||
        u.lastIp.toLowerCase().includes(q) ||
        u.deviceLabel.toLowerCase().includes(q) ||
        (u.lastFileName || '').toLowerCase().includes(q)
      );
    });
  }, [users, searchQuery, filterMode]);

  const selectedUserLogs = useMemo(() => {
    if (!selectedUser) return [];
    return logs.filter((l) => l.clientId === selectedUser.clientId);
  }, [logs, selectedUser]);

  const handleSaveSelectedUser = async () => {
    if (!selectedUser) return;
    setIsSavingUser(true);
    setUserFeedback(null);
    const ok = await onUpdateUser(selectedUser.clientId, {
      displayName: editDisplayName,
      adminNote: editAdminNote,
      accessMode: editAccessMode,
      customBlockMessage: editCustomMsg,
      customDailyPageLimit: Math.max(0, Number(editDailyPageLimit) || 0),
      blockMatchingIpToo: editBlockIpToo,
    });
    setIsSavingUser(false);
    setUserFeedback(
      ok
        ? { type: 'ok', text: 'تم حفظ إعدادات وصلاحيات المستخدم بنجاح وتطبيقها فوراً.' }
        : { type: 'err', text: 'تعذر حفظ التعديلات. تحقق من الاتصال بالخادم.' }
    );
  };

  const handleQuickAccessChange = async (
    user: TrackedUserView,
    mode: UserAccessMode
  ) => {
    setIsSavingUser(true);
    setUserFeedback(null);
    const ok = await onUpdateUser(user.clientId, { accessMode: mode });
    if (selectedUser?.clientId === user.clientId) {
      setEditAccessMode(mode);
    }
    setIsSavingUser(false);
    if (selectedUser?.clientId === user.clientId) {
      setUserFeedback(
        ok
          ? { type: 'ok', text: 'تم تحديث حالة صلاحية المستخدم فوراً.' }
          : { type: 'err', text: 'تعذر تحديث الحالة.' }
      );
    }
  };

  const handleResetQuota = async () => {
    if (!selectedUser) return;
    setIsSavingUser(true);
    const ok = await onUpdateUser(selectedUser.clientId, { resetTodayQuota: true });
    setIsSavingUser(false);
    setUserFeedback(
      ok
        ? { type: 'ok', text: 'تم تصفير عداد الحصة اليومية لهذا المستخدم.' }
        : { type: 'err', text: 'تعذر تصفير الحصة.' }
    );
  };

  const handleDelete = async (includeLogs: boolean) => {
    if (!selectedUser) return;
    setIsSavingUser(true);
    const ok = await onDeleteUser(selectedUser.clientId, includeLogs);
    setIsSavingUser(false);
    if (ok) {
      setSelectedClientId(null);
      setConfirmDeleteStep(false);
    }
  };

  const onlineThreshold = Date.now() - 5 * 60 * 1000;

  return (
    <div className="space-y-5">
      {/* KPI Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="p-3.5 rounded-xl bg-white dark:bg-[#141720] border border-slate-200 dark:border-[#232938]">
          <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            إجمالي المستخدمين
          </div>
          <div className="text-xl font-extrabold text-slate-900 dark:text-slate-100 mt-1 tabular-nums">
            {summary.totalUsers}
          </div>
        </div>
        <div className="p-3.5 rounded-xl bg-white dark:bg-[#141720] border border-slate-200 dark:border-[#232938]">
          <div className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
            متصل حالياً (5 د)
          </div>
          <div className="text-xl font-extrabold text-emerald-700 dark:text-emerald-300 mt-1 tabular-nums">
            {summary.onlineRecentlyCount}
          </div>
        </div>
        <div className="p-3.5 rounded-xl bg-white dark:bg-[#141720] border border-slate-200 dark:border-[#232938]">
          <div className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">
            حسابات مقيدة/محظورة
          </div>
          <div className="text-xl font-extrabold text-amber-700 dark:text-amber-300 mt-1 tabular-nums">
            {summary.blockedUsersCount}
          </div>
        </div>
        <div className="p-3.5 rounded-xl bg-white dark:bg-[#141720] border border-slate-200 dark:border-[#232938]">
          <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            إجمالي التحويلات
          </div>
          <div className="text-xl font-extrabold text-slate-900 dark:text-slate-100 mt-1 tabular-nums">
            {summary.totalConversions}
          </div>
        </div>
        <div className="p-3.5 rounded-xl bg-white dark:bg-[#141720] border border-slate-200 dark:border-[#232938]">
          <div className="text-[11px] font-semibold text-blue-700 dark:text-blue-400">
            إجمالي الصفحات المحولة
          </div>
          <div className="text-xl font-extrabold text-blue-700 dark:text-blue-300 mt-1 tabular-nums">
            {summary.totalPagesConverted}
          </div>
        </div>
        <div className="p-3.5 rounded-xl bg-white dark:bg-[#141720] border border-slate-200 dark:border-[#232938]">
          <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            نشاط اليوم (عملية / صفحة)
          </div>
          <div className="text-base font-extrabold text-slate-900 dark:text-slate-100 mt-1.5 tabular-nums">
            {summary.todayConversions} / {summary.todayPages}
          </div>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="p-4 rounded-2xl bg-white dark:bg-[#141720] border border-slate-200 dark:border-[#232938] flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث بالاسم، المعرف، عنوان IP، الجهاز، أو آخر ملف..."
            className="w-full pr-9 pl-3 py-2 rounded-xl border border-slate-200 dark:border-[#2A3142] bg-[#FBFBF9] dark:bg-[#0E1118] text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          />
        </div>

        <CustomSelect<UserFilterOption>
          ariaLabel="تصفية المستخدمين حسب الحالة"
          value={filterMode}
          onChange={setFilterMode}
          className="w-full sm:w-56"
          size="md"
          options={[
            { value: 'all', label: `كافة المستخدمين (${users.length})` },
            {
              value: 'online',
              label: `نشطون آخر 5 دقائق (${summary.onlineRecentlyCount})`,
            },
            { value: 'active', label: 'المسموح لهم بالكامل' },
            { value: 'block_conversions', label: 'موقوف عنهم التحويل فقط' },
            { value: 'block_site', label: 'محظورون من الموقع كله' },
          ]}
        />
      </div>

      {/* Main Split: Users Table + Selected User Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Users Table */}
        <section
          className={`${
            selectedUser ? 'lg:col-span-6' : 'lg:col-span-12'
          } bg-white dark:bg-[#141720] border border-slate-200 dark:border-[#232938] rounded-2xl overflow-hidden`}
        >
          <div className="px-4 py-3 border-b border-slate-200 dark:border-[#232938] flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-slate-600 dark:text-slate-400" />
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                قائمة المستخدمين والجلسات ({filteredUsers.length})
              </h2>
            </div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              اضغط على أي مستخدم للتحكم وتفاصيل تحويلاته
            </span>
          </div>

          {filteredUsers.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
              لا توجد جلسات مستخدمين مطابقة للبحث حتى الآن.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-[#1F2533] max-h-[640px] overflow-y-auto">
              {filteredUsers.map((u) => {
                const accessView = getAccessModeView(u.accessMode);
                const isSelected = u.clientId === selectedClientId;
                const isOnline = u.lastSeenAt >= onlineThreshold;
                const isSelf = u.clientId === currentAdminClientId;
                return (
                  <div
                    key={u.clientId}
                    onClick={() => setSelectedClientId(u.clientId)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedClientId(u.clientId);
                      }
                    }}
                    className={`p-3.5 sm:p-4 cursor-pointer transition-colors space-y-2.5 ${
                      isSelected
                        ? 'bg-blue-50/70 dark:bg-blue-500/10 border-r-4 border-r-blue-600'
                        : 'hover:bg-slate-50/80 dark:hover:bg-[#191E2B]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 ${
                              isOnline ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'
                            }`}
                            title={isOnline ? 'متصل مؤخراً' : 'غير نشط حالياً'}
                          />
                          <span className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-slate-100 truncate">
                            {u.displayName || u.clientId}
                          </span>
                          {isSelf && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 font-bold">
                              متصفحك الحالي
                            </span>
                          )}
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-md border font-bold ${accessView.badgeClass}`}
                          >
                            {accessView.label}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                          <span dir="ltr" className="font-mono">
                            {u.clientId}
                          </span>
                          <span dir="ltr" className="font-mono">
                            IP: {u.lastIp}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Monitor className="w-3 h-3" />
                            {u.deviceLabel}
                          </span>
                          <span>آخر ظهور: {formatRelativeTimeAr(u.lastSeenAt)}</span>
                        </div>
                      </div>

                      {/* Quick One-Click Actions */}
                      <div
                        className="flex items-center gap-1 shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {u.accessMode !== 'active' && (
                          <button
                            type="button"
                            disabled={isSavingUser}
                            onClick={() => void handleQuickAccessChange(u, 'active')}
                            title="تفعيل الوصول الكامل"
                            className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-500/25 cursor-pointer"
                          >
                            <UserCheck className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {u.accessMode !== 'block_conversions' && (
                          <button
                            type="button"
                            disabled={isSavingUser}
                            onClick={() => void handleQuickAccessChange(u, 'block_conversions')}
                            title="إيقاف التحويل لهذا المستخدم فقط"
                            className="p-1.5 rounded-lg bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-500/25 cursor-pointer"
                          >
                            <PauseCircle className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {u.accessMode !== 'block_site' && (
                          <button
                            type="button"
                            disabled={isSavingUser}
                            onClick={() => void handleQuickAccessChange(u, 'block_site')}
                            title="حظر الموقع بالكامل عن هذا المستخدم"
                            className="p-1.5 rounded-lg bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-500/25 cursor-pointer"
                          >
                            <Ban className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] pt-1 border-t border-slate-100 dark:border-[#1E2433]">
                      <div className="flex items-center gap-3 tabular-nums text-slate-600 dark:text-slate-300">
                        <span>
                          التحويلات: <strong>{u.completedConversions}</strong>/{u.totalConversions}
                        </span>
                        <span>
                          الصفحات: <strong>{u.totalPagesConverted}</strong>
                        </span>
                        <span>
                          اليوم: <strong>{u.todayPages}</strong> ص
                        </span>
                      </div>
                      {u.lastFileName && (
                        <span className="text-slate-500 dark:text-slate-400 truncate max-w-[220px]">
                          آخر ملف: {u.lastFileName}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* User Inspector & Control Panel */}
        {selectedUser && (
          <section className="lg:col-span-6 bg-white dark:bg-[#141720] border border-slate-200 dark:border-[#232938] rounded-2xl p-4 sm:p-5 space-y-5">
            <div className="flex items-start justify-between gap-2 pb-3 border-b border-slate-200 dark:border-[#232938]">
              <div>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-slate-100">
                    إدارة المستخدم: {selectedUser.displayName || selectedUser.clientId}
                  </h3>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1" dir="ltr">
                  ID: {selectedUser.clientId} · IP: {selectedUser.lastIp} ·{' '}
                  {selectedUser.deviceLabel}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedClientId(null)}
                className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-[#2A3142] text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#1B202C] cursor-pointer"
              >
                إغلاق
              </button>
            </div>

            {selectedUser.clientId === currentAdminClientId && (
              <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 text-[11px] text-blue-800 dark:text-blue-200 font-semibold">
                هذا هو متصفحك الحالي. لوحة المشرف (?admin=1) تبقى مفتوحة دائماً ولن تُغلق عليك حتى إذا قيّدت هذا المعرف للاختبار.
              </div>
            )}

            {/* User Detailed Telemetry Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
              <div className="p-2.5 rounded-xl bg-[#FBFBF9] dark:bg-[#0E1118] border border-slate-200 dark:border-[#232938]">
                <div className="text-[10px] text-slate-500">تم تحويلها</div>
                <div className="text-sm font-extrabold text-emerald-700 dark:text-emerald-300 tabular-nums">
                  {selectedUser.completedConversions}
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-[#FBFBF9] dark:bg-[#0E1118] border border-slate-200 dark:border-[#232938]">
                <div className="text-[10px] text-slate-500">إجمالي الصفحات</div>
                <div className="text-sm font-extrabold text-blue-700 dark:text-blue-300 tabular-nums">
                  {selectedUser.totalPagesConverted}
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-[#FBFBF9] dark:bg-[#0E1118] border border-slate-200 dark:border-[#232938]">
                <div className="text-[10px] text-slate-500">إخفاقات / رفض</div>
                <div className="text-sm font-extrabold text-red-700 dark:text-red-300 tabular-nums">
                  {selectedUser.failedConversions} / {selectedUser.blockedAttempts}
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-[#FBFBF9] dark:bg-[#0E1118] border border-slate-200 dark:border-[#232938]">
                <div className="text-[10px] text-slate-500">اليوم</div>
                <div className="text-sm font-extrabold text-slate-800 dark:text-slate-200 tabular-nums">
                  {selectedUser.todayConversions} / {selectedUser.todayPages}ص
                </div>
              </div>
            </div>

            {/* Access Mode 3-Way Segmented Control */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">
                مستوى الصلاحية لهذا المستخدم
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setEditAccessMode('active')}
                  className={`py-2 px-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                    editAccessMode === 'active'
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-[#FBFBF9] dark:bg-[#0E1118] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-[#2A3142]'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>مسموح</span>
                </button>
                <button
                  type="button"
                  onClick={() => setEditAccessMode('block_conversions')}
                  className={`py-2 px-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                    editAccessMode === 'block_conversions'
                      ? 'bg-amber-600 text-white border-amber-600'
                      : 'bg-[#FBFBF9] dark:bg-[#0E1118] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-[#2A3142]'
                  }`}
                >
                  <PauseCircle className="w-3.5 h-3.5" />
                  <span>وقف التحويل</span>
                </button>
                <button
                  type="button"
                  onClick={() => setEditAccessMode('block_site')}
                  className={`py-2 px-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                    editAccessMode === 'block_site'
                      ? 'bg-red-600 text-white border-red-600'
                      : 'bg-[#FBFBF9] dark:bg-[#0E1118] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-[#2A3142]'
                  }`}
                >
                  <ShieldAlert className="w-3.5 h-3.5" />
                  <span>حظر الموقع</span>
                </button>
              </div>
            </div>

            {/* Custom Message + Nickname + Note + Quota */}
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                  رسالة مخصصة تظهر لهذا المستخدم (عند إيقاف التحويل أو الحظر)
                </label>
                <textarea
                  rows={2}
                  value={editCustomMsg}
                  onChange={(e) => setEditCustomMsg(e.target.value)}
                  placeholder="مثال: عذراً، تم إيقاف التحويل لحسابك لحين مراجعة الاستهلاك أو التواصل مع المشرف..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#2A3142] bg-[#FBFBF9] dark:bg-[#0E1118] text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                    اسم تعريفي للمستخدم
                  </label>
                  <input
                    type="text"
                    value={editDisplayName}
                    onChange={(e) => setEditDisplayName(e.target.value)}
                    placeholder="مثال: أ. محمد — فرع القاهرة"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#2A3142] bg-[#FBFBF9] dark:bg-[#0E1118] text-xs text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                    حد يومي مخصص للصفحات (0 = عام)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={editDailyPageLimit}
                    onChange={(e) =>
                      setEditDailyPageLimit(Math.max(0, Number(e.target.value) || 0))
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#2A3142] bg-[#FBFBF9] dark:bg-[#0E1118] text-xs font-mono tabular-nums text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                  ملاحظة إدارية (سرية لا يراها المستخدم)
                </label>
                <input
                  type="text"
                  value={editAdminNote}
                  onChange={(e) => setEditAdminNote(e.target.value)}
                  placeholder="ملاحظة للمشرفين حول هذا الجهاز..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#2A3142] bg-[#FBFBF9] dark:bg-[#0E1118] text-xs text-slate-900 dark:text-slate-100"
                />
              </div>

              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={editBlockIpToo}
                  onChange={(e) => setEditBlockIpToo(e.target.checked)}
                  className="w-4 h-4 rounded accent-blue-600"
                />
                <span>
                  تطبيق التقييد على نفس عنوان IP أيضاً ({selectedUser.lastIp}) لمنع التجاوز بالوضع المتخفي
                </span>
              </label>
            </div>

            {userFeedback && (
              <div
                className={`p-2.5 rounded-xl text-xs font-semibold border ${
                  userFeedback.type === 'ok'
                    ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-300'
                    : 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300'
                }`}
              >
                {userFeedback.text}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={isSavingUser}
                onClick={() => void handleSaveSelectedUser()}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>حفظ تعديلات المستخدم</span>
              </button>

              <button
                type="button"
                disabled={isSavingUser}
                onClick={() => void handleResetQuota()}
                className="px-3 py-2 rounded-xl border border-slate-200 dark:border-[#2A3142] bg-slate-50 dark:bg-[#1B202C] hover:bg-slate-100 dark:hover:bg-[#232938] text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>تصفير عداد اليوم</span>
              </button>

              <button
                type="button"
                onClick={() => onOpenUserLogs(selectedUser.clientId)}
                className="px-3 py-2 rounded-xl border border-slate-200 dark:border-[#2A3142] bg-white dark:bg-[#1B202C] text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 cursor-pointer"
              >
                <History className="w-3.5 h-3.5" />
                <span>عرض في السجل</span>
              </button>

              {!confirmDeleteStep ? (
                <button
                  type="button"
                  onClick={() => setConfirmDeleteStep(true)}
                  className="px-3 py-2 rounded-xl border border-red-200 dark:border-red-500/30 text-xs font-semibold text-red-700 dark:text-red-300 inline-flex items-center gap-1.5 cursor-pointer mr-auto"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>حذف</span>
                </button>
              ) : (
                <div className="flex items-center gap-1.5 mr-auto">
                  <button
                    type="button"
                    disabled={isSavingUser}
                    onClick={() => void handleDelete(true)}
                    className="px-2.5 py-1.5 rounded-lg bg-red-600 text-white text-[11px] font-bold cursor-pointer"
                  >
                    تأكيد الحذف مع سجله
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteStep(false)}
                    className="px-2 py-1.5 rounded-lg border border-slate-200 dark:border-[#2A3142] text-[11px] font-semibold cursor-pointer"
                  >
                    إلغاء
                  </button>
                </div>
              )}
            </div>

            {/* Per-User Recent Conversions */}
            <div className="space-y-2 pt-3 border-t border-slate-200 dark:border-[#232938]">
              <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-slate-500" />
                <span>ملفات وتحويلات هذا المستخدم ({selectedUserLogs.length})</span>
              </h4>
              {selectedUserLogs.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 py-2">
                  لم يُجرِ هذا المستخدم أي تحويلات حتى الآن.
                </p>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {selectedUserLogs.slice(0, 40).map((log) => {
                    const st = getConversionStatusView(log.status);
                    return (
                      <div
                        key={log.id}
                        className="p-2.5 rounded-xl bg-[#FBFBF9] dark:bg-[#0E1118] border border-slate-200 dark:border-[#232938] space-y-1 text-xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-slate-900 dark:text-slate-100 truncate">
                            {log.fileName}
                          </span>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded border font-bold shrink-0 ${st.badgeClass}`}
                          >
                            {st.label}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                          <span>{formatAdminDateTime(log.startedAt)}</span>
                          <span>{log.pagesCount} صفحة</span>
                          {log.wordsCount > 0 && <span>{log.wordsCount} كلمة</span>}
                          <span>{formatFileSizeCompact(log.fileSize)}</span>
                          <span>{getOperationLabelAr(log.operation, log.extractionMethod)}</span>
                          {log.durationMs > 0 && <span>المدة: {formatDurationMs(log.durationMs)}</span>}
                        </div>
                        {(log.errorMessage || log.blockReason) && (
                          <p className="text-[11px] text-red-600 dark:text-red-400">
                            {log.blockReason || log.errorMessage}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
};
