import React, { useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ArrowUpLeft, History, Users } from 'lucide-react';
import type {
  AdminOverviewSummary,
  ConversionLogView,
  TrackedUserView,
} from '../../model/governance';
import {
  buildDashboardMetrics,
  type DailyMetricMode,
  type DashboardWindowDays,
  type TopUsersSortMode,
} from './dashboardMetrics';

interface AdminDashboardTabProps {
  summary: AdminOverviewSummary;
  users: TrackedUserView[];
  logs: ConversionLogView[];
  onInspectUser: (clientId: string) => void;
  onOpenLogs: () => void;
}

function useIsDarkTheme(): boolean {
  const [isDark, setIsDark] = useState<boolean>(() =>
    typeof document !== 'undefined'
      ? document.documentElement.classList.contains('dark')
      : false
  );

  useEffect(() => {
    if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') {
      return;
    }
    const root = document.documentElement;
    const sync = () => setIsDark(root.classList.contains('dark'));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return isDark;
}

interface CustomTooltipPayloadItem {
  name?: string;
  value?: number;
  color?: string;
  dataKey?: string;
  payload?: Record<string, unknown>;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: CustomTooltipPayloadItem[];
  label?: string;
  mode?: 'daily' | 'user' | 'pie';
}

const DashboardTooltip: React.FC<ChartTooltipProps> = ({
  active,
  payload,
  label,
  mode = 'daily',
}) => {
  if (!active || !payload || payload.length === 0) return null;

  const firstPayload = payload[0]?.payload as Record<string, unknown> | undefined;

  return (
    <div
      dir="rtl"
      className="rounded-xl border border-slate-200 dark:border-[#2A3142] bg-white/95 dark:bg-[#0E1118]/95 px-3.5 py-2.5 shadow-md text-xs text-slate-800 dark:text-slate-100 space-y-1.5 min-w-[165px]"
    >
      <p className="font-bold text-slate-900 dark:text-slate-100 border-b border-slate-100 dark:border-[#1E2433] pb-1">
        {mode === 'user'
          ? String(firstPayload?.fullName || label || '')
          : mode === 'pie'
          ? String(payload[0]?.name || '')
          : `التاريخ: ${String(firstPayload?.dateKey || label || '')}`}
      </p>

      {mode === 'user' && firstPayload?.deviceLabel && (
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          {String(firstPayload.deviceLabel)}
        </p>
      )}

      <div className="space-y-1">
        {payload.map((entry, idx) => (
          <div
            key={`${String(entry.dataKey || entry.name)}-${idx}`}
            className="flex items-center justify-between gap-4"
          >
            <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
              <span
                className="w-2 h-2 rounded-xs shrink-0"
                style={{ backgroundColor: entry.color || '#2563eb' }}
              />
              <span>{entry.name}</span>
            </span>
            <span className="font-mono font-bold tabular-nums text-slate-900 dark:text-slate-100">
              {Number(entry.value || 0).toLocaleString('en-US')}
            </span>
          </div>
        ))}
      </div>

      {mode === 'daily' && firstPayload && typeof firstPayload.pages === 'number' && (
        <div className="pt-1 border-t border-slate-100 dark:border-[#1E2433] flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
          <span>الصفحات المحولة</span>
          <span className="font-mono font-bold tabular-nums">
            {Number(firstPayload.pages).toLocaleString('en-US')} ص
          </span>
        </div>
      )}

      {mode === 'user' && firstPayload && firstPayload.successRate !== null && (
        <div className="pt-1 border-t border-slate-100 dark:border-[#1E2433] flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
          <span>معدل النجاح</span>
          <span className="font-mono font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
            {String(firstPayload.successRate)}%
          </span>
        </div>
      )}
    </div>
  );
};

export const AdminDashboardTab: React.FC<AdminDashboardTabProps> = ({
  summary,
  users,
  logs,
  onInspectUser,
  onOpenLogs,
}) => {
  const isDark = useIsDarkTheme();
  const [windowDays, setWindowDays] = useState<DashboardWindowDays>(14);
  const [dailyMode, setDailyMode] = useState<DailyMetricMode>('conversions');
  const [topUsersSort, setTopUsersSort] = useState<TopUsersSortMode>('conversions');

  const metrics = useMemo(
    () =>
      buildDashboardMetrics({
        summary,
        users,
        logs,
        windowDays,
        topUsersSort,
        isDark,
      }),
    [summary, users, logs, windowDays, topUsersSort, isDark]
  );

  const axisStroke = isDark ? '#94a3b8' : '#475569';
  const gridStroke = isDark ? '#232938' : '#e2e8f0';
  const primaryColor = isDark ? '#3b82f6' : '#2563eb';
  const successColor = isDark ? '#22c55e' : '#16a34a';
  const failColor = isDark ? '#ef4444' : '#dc2626';
  const warnColor = isDark ? '#f59e0b' : '#d97706';
  const pagesColor = isDark ? '#0ea5e9' : '#0284c7';

  return (
    <div className="space-y-6">
      {/* Toolbar: Window Selector & Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
            مؤشرات الأداء والنشاط الحي
          </h2>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
            <span>تحليل فوري مبني على سجلات الخادم الفعلية</span>
            <span aria-hidden="true">·</span>
            <span>آخر {windowDays} يوماً: {metrics.windowTotalConversions.toLocaleString('en-US')} تحويل</span>
            <span aria-hidden="true">·</span>
            <span>{metrics.windowTotalPages.toLocaleString('en-US')} صفحة</span>
          </div>
        </div>

        <div
          role="group"
          aria-label="النطاق الزمني للرسوم البيانية"
          className="inline-flex items-center gap-1 p-1 rounded-xl border border-slate-200 dark:border-[#232938] bg-slate-100/80 dark:bg-[#0E1118] self-start sm:self-auto"
        >
          {([7, 14, 30] as const).map((days) => (
            <button
              key={days}
              type="button"
              onClick={() => setWindowDays(days)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors tabular-nums ${
                windowDays === days
                  ? 'bg-white dark:bg-[#1E2433] text-slate-900 dark:text-slate-100 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {days === 7 ? 'آخر 7 أيام' : days === 14 ? 'آخر 14 يوماً' : 'آخر 30 يوماً'}
            </button>
          ))}
        </div>
      </div>

      {/* 4-Column Single-Elevation KPI Strip */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="p-4 rounded-2xl border border-slate-200 dark:border-[#232938] bg-white dark:bg-[#141720]">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            إجمالي عمليات التحويل
          </span>
          <p className="mt-1.5 text-2xl font-extrabold text-slate-900 dark:text-slate-100 font-mono tabular-nums">
            {summary.totalConversions.toLocaleString('en-US')}
          </p>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
            اليوم: {summary.todayConversions.toLocaleString('en-US')} · محظور: {summary.blockedAttempts.toLocaleString('en-US')}
          </p>
        </div>

        <div className="p-4 rounded-2xl border border-slate-200 dark:border-[#232938] bg-white dark:bg-[#141720]">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            معدل نجاح التحويل
          </span>
          <p
            className={`mt-1.5 text-2xl font-extrabold font-mono tabular-nums ${
              metrics.overallSuccessRate === null
                ? 'text-slate-500 dark:text-slate-400'
                : metrics.overallSuccessRate >= 85
                ? 'text-emerald-700 dark:text-emerald-400'
                : metrics.overallSuccessRate >= 60
                ? 'text-amber-700 dark:text-amber-300'
                : 'text-red-600 dark:text-red-400'
            }`}
          >
            {metrics.overallSuccessRate !== null ? `${metrics.overallSuccessRate}%` : '—'}
          </p>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
            مكتمل: {summary.completedConversions.toLocaleString('en-US')} · فشل: {summary.failedConversions.toLocaleString('en-US')}
          </p>
        </div>

        <div className="p-4 rounded-2xl border border-slate-200 dark:border-[#232938] bg-white dark:bg-[#141720]">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            إجمالي الصفحات المحولة
          </span>
          <p className="mt-1.5 text-2xl font-extrabold text-slate-900 dark:text-slate-100 font-mono tabular-nums">
            {summary.totalPagesConverted.toLocaleString('en-US')}
          </p>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
            اليوم: {summary.todayPages.toLocaleString('en-US')} · متوسط الملف: {metrics.avgPagesPerCompleted} ص
          </p>
        </div>

        <div className="p-4 rounded-2xl border border-slate-200 dark:border-[#232938] bg-white dark:bg-[#141720]">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            قاعدة المستخدمين والزوار
          </span>
          <p className="mt-1.5 text-2xl font-extrabold text-slate-900 dark:text-slate-100 font-mono tabular-nums">
            {summary.totalUsers.toLocaleString('en-US')}
          </p>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
            متصل حالياً: {summary.onlineRecentlyCount.toLocaleString('en-US')} · محظور: {summary.blockedUsersCount.toLocaleString('en-US')}
          </p>
        </div>
      </section>

      {/* Chart 1: Daily Conversions / Pages / Outcome Breakdown */}
      <section className="p-5 sm:p-6 bg-white dark:bg-[#141720] border border-slate-200 dark:border-[#232938] rounded-2xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">
              1. عدد عمليات التحويل اليومية
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
              توزيع النشاط اليومي خلال آخر {windowDays} يوماً ({metrics.windowTotalConversions.toLocaleString('en-US')} عملية · {metrics.windowTotalPages.toLocaleString('en-US')} صفحة)
            </p>
          </div>

          <div
            role="group"
            aria-label="نوع مقياس الرسم اليومي"
            className="inline-flex items-center gap-1 p-1 rounded-xl border border-slate-200 dark:border-[#232938] bg-slate-100/80 dark:bg-[#0E1118] self-start sm:self-auto"
          >
            <button
              type="button"
              onClick={() => setDailyMode('conversions')}
              className={`px-3 py-1 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                dailyMode === 'conversions'
                  ? 'bg-white dark:bg-[#1E2433] text-slate-900 dark:text-slate-100 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              عدد التحويلات
            </button>
            <button
              type="button"
              onClick={() => setDailyMode('breakdown')}
              className={`px-3 py-1 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                dailyMode === 'breakdown'
                  ? 'bg-white dark:bg-[#1E2433] text-slate-900 dark:text-slate-100 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              ناجح / فاشل / مقيد
            </button>
            <button
              type="button"
              onClick={() => setDailyMode('pages')}
              className={`px-3 py-1 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                dailyMode === 'pages'
                  ? 'bg-white dark:bg-[#1E2433] text-slate-900 dark:text-slate-100 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              الصفحات اليومية
            </button>
          </div>
        </div>

        <div dir="ltr" className="w-full h-[290px]">
          <ResponsiveContainer width="100%" height="100%">
            {dailyMode === 'breakdown' ? (
              <BarChart
                data={metrics.dailySeries}
                margin={{ top: 10, right: 12, left: 0, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: axisStroke, fontSize: 11 }}
                  axisLine={{ stroke: gridStroke }}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: axisStroke, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={38}
                />
                <Tooltip content={<DashboardTooltip mode="daily" />} />
                <Bar
                  dataKey="completed"
                  name="مكتملة"
                  stackId="status"
                  fill={successColor}
                  radius={[0, 0, 0, 0]}
                />
                <Bar
                  dataKey="failed"
                  name="فاشلة"
                  stackId="status"
                  fill={failColor}
                  radius={[0, 0, 0, 0]}
                />
                <Bar
                  dataKey="blocked"
                  name="مقيدة"
                  stackId="status"
                  fill={warnColor}
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            ) : dailyMode === 'pages' ? (
              <BarChart
                data={metrics.dailySeries}
                margin={{ top: 10, right: 12, left: 0, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: axisStroke, fontSize: 11 }}
                  axisLine={{ stroke: gridStroke }}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: axisStroke, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={42}
                />
                <Tooltip content={<DashboardTooltip mode="daily" />} />
                <Bar
                  dataKey="pages"
                  name="الصفحات المحولة"
                  fill={pagesColor}
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            ) : (
              <AreaChart
                data={metrics.dailySeries}
                margin={{ top: 10, right: 12, left: 0, bottom: 4 }}
              >
                <defs>
                  <linearGradient id="dailyTotalGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={primaryColor} stopOpacity={0.28} />
                    <stop offset="95%" stopColor={primaryColor} stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="dailyCompletedGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={successColor} stopOpacity={0.22} />
                    <stop offset="95%" stopColor={successColor} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: axisStroke, fontSize: 11 }}
                  axisLine={{ stroke: gridStroke }}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: axisStroke, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={38}
                />
                <Tooltip content={<DashboardTooltip mode="daily" />} />
                <Area
                  type="monotone"
                  dataKey="total"
                  name="إجمالي العمليات"
                  stroke={primaryColor}
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#dailyTotalGradient)"
                  activeDot={{ r: 5 }}
                />
                <Area
                  type="monotone"
                  dataKey="completed"
                  name="العمليات المكتملة"
                  stroke={successColor}
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#dailyCompletedGradient)"
                />
              </AreaChart>
            )}
          </ResponsiveContainer>
        </div>

        {/* Clean explicit color-key legend below chart */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-[#1E2433] text-xs text-slate-600 dark:text-slate-300">
          <div className="flex flex-wrap items-center gap-4">
            {dailyMode === 'breakdown' ? (
              <>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs" style={{ backgroundColor: successColor }} />
                  <span>مكتملة</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs" style={{ backgroundColor: failColor }} />
                  <span>فاشلة</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs" style={{ backgroundColor: warnColor }} />
                  <span>مقيدة / مرفوضة</span>
                </span>
              </>
            ) : dailyMode === 'pages' ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs" style={{ backgroundColor: pagesColor }} />
                <span>إجمالي الصفحات المحولة يومياً</span>
              </span>
            ) : (
              <>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs" style={{ backgroundColor: primaryColor }} />
                  <span>إجمالي العمليات</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs" style={{ backgroundColor: successColor }} />
                  <span>المكتملة بنجاح</span>
                </span>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={onOpenLogs}
            className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
          >
            <History className="w-3.5 h-3.5" />
            <span>فتح سجل التحويلات التفصيلي</span>
          </button>
        </div>
      </section>

      {/* Bottom 2-Column Split: Top Active Users & Success Rate Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Chart 2: Top Active Users (7 columns) */}
        <section className="lg:col-span-7 p-5 sm:p-6 bg-white dark:bg-[#141720] border border-slate-200 dark:border-[#232938] rounded-2xl flex flex-col justify-between space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">
                2. أكثر المستخدمين استخداماً
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                ترتيب أعلى المستخدمين نشاطاً حسب{' '}
                {topUsersSort === 'conversions' ? 'عدد التحويلات' : 'الصفحات المحولة'}
              </p>
            </div>

            <div
              role="group"
              aria-label="ترتيب أكثر المستخدمين"
              className="inline-flex items-center gap-1 p-1 rounded-xl border border-slate-200 dark:border-[#232938] bg-slate-100/80 dark:bg-[#0E1118] self-start sm:self-auto"
            >
              <button
                type="button"
                onClick={() => setTopUsersSort('conversions')}
                className={`px-3 py-1 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                  topUsersSort === 'conversions'
                    ? 'bg-white dark:bg-[#1E2433] text-slate-900 dark:text-slate-100 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                بعدد التحويلات
              </button>
              <button
                type="button"
                onClick={() => setTopUsersSort('pages')}
                className={`px-3 py-1 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                  topUsersSort === 'pages'
                    ? 'bg-white dark:bg-[#1E2433] text-slate-900 dark:text-slate-100 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                بعدد الصفحات
              </button>
            </div>
          </div>

          {metrics.topUsers.length === 0 ? (
            <div className="py-14 text-center space-y-2.5 border border-dashed border-slate-200 dark:border-[#232938] rounded-xl">
              <Users className="w-6 h-6 text-slate-400 mx-auto" />
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                لا توجد عمليات تحويل مسجلة للمستخدمين حتى الآن.
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                سيظهر ترتيب أكثر المستخدمين تلقائياً فور بدء أي مستخدم في تحويل ملف PDF أو صورة.
              </p>
            </div>
          ) : (
            <>
              <div dir="ltr" className="w-full h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={metrics.topUsers}
                    layout="vertical"
                    margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} horizontal={false} />
                    <XAxis
                      type="number"
                      allowDecimals={false}
                      tick={{ fill: axisStroke, fontSize: 11 }}
                      axisLine={{ stroke: gridStroke }}
                      tickLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="shortName"
                      width={118}
                      tick={{ fill: axisStroke, fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip content={<DashboardTooltip mode="user" />} />
                    {topUsersSort === 'pages' ? (
                      <Bar
                        dataKey="pages"
                        name="الصفحات المحولة"
                        fill={pagesColor}
                        radius={[0, 4, 4, 0]}
                        barSize={18}
                      />
                    ) : (
                      <>
                        <Bar
                          dataKey="completed"
                          name="مكتملة"
                          stackId="u"
                          fill={successColor}
                          barSize={18}
                        />
                        <Bar
                          dataKey="failed"
                          name="فاشلة"
                          stackId="u"
                          fill={failColor}
                          barSize={18}
                        />
                        <Bar
                          dataKey="other"
                          name="أخرى / قيد التنفيذ"
                          stackId="u"
                          fill={primaryColor}
                          radius={[0, 4, 4, 0]}
                          barSize={18}
                        />
                      </>
                    )}
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Quick clickable table linking directly to user inspector */}
              <div className="border-t border-slate-100 dark:border-[#1E2433] pt-3 space-y-1.5">
                <span className="block text-[11px] font-bold text-slate-500 dark:text-slate-400">
                  انقر على أي مستخدم لفتح ملفه والتحكم بصلاحياته:
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {metrics.topUsers.slice(0, 6).map((u) => (
                    <button
                      key={u.clientId}
                      type="button"
                      onClick={() => onInspectUser(u.clientId)}
                      className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-slate-200 dark:border-[#232938] bg-[#FBFBF9] dark:bg-[#0E1118] hover:border-blue-400 dark:hover:border-blue-500/50 text-right cursor-pointer transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                          {u.fullName}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums truncate">
                          {u.total.toLocaleString('en-US')} تحويل · {u.pages.toLocaleString('en-US')} صفحة
                        </p>
                      </div>
                      <ArrowUpLeft className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </section>

        {/* Chart 3: Conversion Success Rates & Breakdown (5 columns) */}
        <section className="lg:col-span-5 p-5 sm:p-6 bg-white dark:bg-[#141720] border border-slate-200 dark:border-[#232938] rounded-2xl flex flex-col justify-between space-y-4">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">
              3. معدلات نجاح التحويل والحالات
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
              نسبة النجاح في العمليات المنتهية:{' '}
              <strong className="font-mono text-slate-900 dark:text-slate-100">
                {metrics.overallSuccessRate !== null ? `${metrics.overallSuccessRate}%` : 'لا توجد عمليات منتهية بعد'}
              </strong>
            </p>
          </div>

          {metrics.outcomeSlices.length === 0 ? (
            <div className="py-14 text-center space-y-2 border border-dashed border-slate-200 dark:border-[#232938] rounded-xl">
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                لا تتوفر بيانات حالات كافية لعرض الرسم الدائري بعد.
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                ستظهر نسب النجاح والفشل والتقييد بمجرد تسجيل أول عملية تحويل.
              </p>
            </div>
          ) : (
            <>
              <div className="relative h-[220px]" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={metrics.outcomeSlices}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={58}
                      outerRadius={86}
                      paddingAngle={2}
                      stroke={isDark ? '#141720' : '#ffffff'}
                      strokeWidth={2}
                    >
                      {metrics.outcomeSlices.map((slice) => (
                        <Cell key={slice.key} fill={slice.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<DashboardTooltip mode="pie" />} />
                  </PieChart>
                </ResponsiveContainer>

                {/* Center KPI inside Donut */}
                <div
                  dir="rtl"
                  className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center"
                >
                  <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    معدل النجاح
                  </span>
                  <span className="text-2xl font-extrabold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                    {metrics.overallSuccessRate !== null ? `${metrics.overallSuccessRate}%` : '—'}
                  </span>
                </div>
              </div>

              {/* Explicit Status Breakdown List */}
              <div className="space-y-2 border-t border-slate-100 dark:border-[#1E2433] pt-3">
                {metrics.outcomeSlices.map((slice) => (
                  <div
                    key={slice.key}
                    className="flex items-center justify-between gap-2 text-xs"
                  >
                    <span className="flex items-center gap-2 font-semibold text-slate-700 dark:text-slate-200">
                      <span
                        className="w-2.5 h-2.5 rounded-xs shrink-0"
                        style={{ backgroundColor: slice.color }}
                      />
                      <span>{slice.name}</span>
                    </span>
                    <span className="font-mono tabular-nums text-slate-600 dark:text-slate-300">
                      <strong className="text-slate-900 dark:text-slate-100">
                        {slice.value.toLocaleString('en-US')}
                      </strong>{' '}
                      ({slice.percentage}%)
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Extraction Methods Breakdown */}
          {metrics.extractionMethods.length > 0 && (
            <div className="space-y-2 border-t border-slate-100 dark:border-[#1E2433] pt-3">
              <span className="block text-[11px] font-bold text-slate-500 dark:text-slate-400">
                توزيع طرق الاستخراج المستخدمة:
              </span>
              <div className="space-y-2">
                {metrics.extractionMethods.slice(0, 4).map((m) => (
                  <div key={m.key} className="space-y-1">
                    <div className="flex items-center justify-between text-[11px] text-slate-700 dark:text-slate-300">
                      <span className="font-semibold truncate">{m.label}</span>
                      <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400 shrink-0">
                        {m.count.toLocaleString('en-US')} ({m.percentage}%)
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-[#0E1118] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-blue-600 dark:bg-blue-500"
                        style={{ width: `${Math.max(4, m.percentage)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
