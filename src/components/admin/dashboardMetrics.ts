import type {
  AdminOverviewSummary,
  ConversionLogView,
  TrackedUserView,
} from '../../model/governance';

export type DashboardWindowDays = 7 | 14 | 30;
export type DailyMetricMode = 'conversions' | 'pages' | 'breakdown';
export type TopUsersSortMode = 'conversions' | 'pages';

export interface DailySeriesPoint {
  dateKey: string;
  label: string;
  total: number;
  completed: number;
  failed: number;
  blocked: number;
  other: number;
  pages: number;
}

export interface TopUserPoint {
  clientId: string;
  shortName: string;
  fullName: string;
  deviceLabel: string;
  total: number;
  completed: number;
  failed: number;
  blocked: number;
  other: number;
  pages: number;
  successRate: number | null;
}

export interface OutcomeSlice {
  key: 'completed' | 'failed' | 'blocked' | 'pending';
  name: string;
  value: number;
  percentage: number;
  color: string;
}

export interface ExtractionMethodStat {
  key: string;
  label: string;
  count: number;
  pages: number;
  percentage: number;
}

export interface DashboardMetricsResult {
  dailySeries: DailySeriesPoint[];
  topUsers: TopUserPoint[];
  outcomeSlices: OutcomeSlice[];
  extractionMethods: ExtractionMethodStat[];
  finishedCount: number;
  overallSuccessRate: number | null;
  windowTotalConversions: number;
  windowTotalPages: number;
  avgPagesPerCompleted: number;
}

function toLocalDateKey(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatShortArabicDayLabel(dateKey: string): string {
  const parts = dateKey.split('-');
  if (parts.length !== 3) return dateKey;
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  return `${day}/${month}`;
}

function truncateLabel(text: string, maxLen: number): string {
  const cleaned = text.trim();
  if (cleaned.length <= maxLen) return cleaned;
  return `${cleaned.slice(0, Math.max(1, maxLen - 1))}…`;
}

function classifyExtractionMethod(log: ConversionLogView): { key: string; label: string } {
  const m = (log.extractionMethod || '').toLowerCase();
  const op = (log.operation || '').toLowerCase();

  if (m === 'direct_digital_extraction' || op === 'direct-extract') {
    return { key: 'digital', label: 'استخراج رقمي مباشر' };
  }
  if (m === 'hybrid_digital_ocr' || m === 'client_hybrid') {
    return { key: 'hybrid', label: 'استخراج هجين (رقمي + OCR)' };
  }
  if (m === 'docx_reader' || op.includes('docx')) {
    return { key: 'docx', label: 'معالجة Word (.docx)' };
  }
  if (op === 'background-job') {
    return { key: 'background', label: 'مهمة خلفية (OCR)' };
  }
  return { key: 'ocr', label: 'تفريغ OCR / معالجة ذكية' };
}

export function buildDashboardMetrics(params: {
  summary: AdminOverviewSummary;
  users: TrackedUserView[];
  logs: ConversionLogView[];
  windowDays: DashboardWindowDays;
  topUsersSort: TopUsersSortMode;
  isDark?: boolean;
  now?: number;
}): DashboardMetricsResult {
  const {
    summary,
    users,
    logs,
    windowDays,
    topUsersSort,
    isDark = false,
    now = Date.now(),
  } = params;

  // 1. Build continuous daily buckets for [today - (windowDays - 1) ... today]
  const dayMap = new Map<string, DailySeriesPoint>();
  const dayKeys: string[] = [];

  for (let offset = windowDays - 1; offset >= 0; offset--) {
    const dt = new Date(now - offset * 86_400_000);
    const key = toLocalDateKey(dt.getTime());
    dayKeys.push(key);
    dayMap.set(key, {
      dateKey: key,
      label: formatShortArabicDayLabel(key),
      total: 0,
      completed: 0,
      failed: 0,
      blocked: 0,
      other: 0,
      pages: 0,
    });
  }

  for (const log of logs) {
    const key = toLocalDateKey(log.startedAt);
    const bucket = dayMap.get(key);
    if (!bucket) continue;

    bucket.total += 1;
    if (log.status === 'completed') {
      bucket.completed += 1;
      bucket.pages += Math.max(0, Number(log.pagesCount) || 0);
    } else if (log.status === 'failed') {
      bucket.failed += 1;
    } else if (log.status === 'blocked') {
      bucket.blocked += 1;
    } else {
      bucket.other += 1;
    }
  }

  // Ensure today's totals reflect user aggregate counters if older logs rotated
  const todayKey = dayKeys[dayKeys.length - 1];
  const todayBucket = dayMap.get(todayKey);
  if (todayBucket) {
    if (summary.todayConversions > todayBucket.total) {
      todayBucket.total = summary.todayConversions;
    }
    if (summary.todayPages > todayBucket.pages) {
      todayBucket.pages = summary.todayPages;
    }
  }

  const dailySeries = dayKeys.map((k) => dayMap.get(k)!);
  const windowTotalConversions = dailySeries.reduce((acc, d) => acc + d.total, 0);
  const windowTotalPages = dailySeries.reduce((acc, d) => acc + d.pages, 0);

  // 2. Build Top Active Users Ranking (Top 8 by conversions or pages)
  const activeUsers = users.filter(
    (u) => u.totalConversions > 0 || u.totalPagesConverted > 0 || u.blockedAttempts > 0
  );

  const sortedUsers = [...activeUsers].sort((a, b) => {
    if (topUsersSort === 'pages') {
      return (
        b.totalPagesConverted - a.totalPagesConverted ||
        b.totalConversions - a.totalConversions ||
        b.lastSeenAt - a.lastSeenAt
      );
    }
    return (
      b.totalConversions - a.totalConversions ||
      b.totalPagesConverted - a.totalPagesConverted ||
      b.lastSeenAt - a.lastSeenAt
    );
  });

  const topUsers: TopUserPoint[] = sortedUsers.slice(0, 8).map((u) => {
    const baseName =
      u.displayName?.trim() ||
      u.deviceLabel?.trim() ||
      `زائر ${u.clientId.slice(0, 6)}`;
    const finished = u.completedConversions + u.failedConversions;
    const other = Math.max(0, u.totalConversions - u.completedConversions - u.failedConversions);
    return {
      clientId: u.clientId,
      shortName: truncateLabel(baseName, 18),
      fullName: baseName,
      deviceLabel: u.deviceLabel,
      total: u.totalConversions,
      completed: u.completedConversions,
      failed: u.failedConversions,
      blocked: u.blockedAttempts,
      other,
      pages: u.totalPagesConverted,
      successRate: finished > 0 ? Math.round((u.completedConversions / finished) * 100) : null,
    };
  });

  // 3. Outcome / Success Rate Breakdown
  const completedCount = summary.completedConversions;
  const failedCount = summary.failedConversions;
  const blockedCount = summary.blockedAttempts;
  const pendingCount = Math.max(
    0,
    summary.totalConversions - completedCount - failedCount
  );

  const finishedCount = completedCount + failedCount;
  const overallSuccessRate =
    finishedCount > 0 ? Math.round((completedCount / finishedCount) * 1000) / 10 : null;

  const avgPagesPerCompleted =
    completedCount > 0
      ? Math.round((summary.totalPagesConverted / completedCount) * 10) / 10
      : 0;

  const totalAttempts = completedCount + failedCount + blockedCount + pendingCount;
  const safeDenom = Math.max(1, totalAttempts);

  const rawSlices: OutcomeSlice[] = [
    {
      key: 'completed',
      name: 'مكتمل بنجاح',
      value: completedCount,
      percentage: Math.round((completedCount / safeDenom) * 100),
      color: isDark ? '#22c55e' : '#16a34a',
    },
    {
      key: 'failed',
      name: 'فشل التحويل',
      value: failedCount,
      percentage: Math.round((failedCount / safeDenom) * 100),
      color: isDark ? '#ef4444' : '#dc2626',
    },
    {
      key: 'blocked',
      name: 'مقيد / مرفوض',
      value: blockedCount,
      percentage: Math.round((blockedCount / safeDenom) * 100),
      color: isDark ? '#f59e0b' : '#d97706',
    },
    {
      key: 'pending',
      name: 'قيد التنفيذ / متوقف',
      value: pendingCount,
      percentage: Math.round((pendingCount / safeDenom) * 100),
      color: isDark ? '#60a5fa' : '#2563eb',
    },
  ];

  const outcomeSlices = rawSlices.filter((s) => s.value > 0);

  // 4. Extraction Method Breakdown from detailed logs
  const methodBuckets = new Map<
    string,
    { key: string; label: string; count: number; pages: number }
  >();

  for (const log of logs) {
    if (log.status === 'blocked') continue;
    const classified = classifyExtractionMethod(log);
    const cur = methodBuckets.get(classified.key) || {
      key: classified.key,
      label: classified.label,
      count: 0,
      pages: 0,
    };
    cur.count += 1;
    cur.pages += Math.max(0, Number(log.pagesCount) || 0);
    methodBuckets.set(classified.key, cur);
  }

  const totalMethodsCount = Math.max(
    1,
    Array.from(methodBuckets.values()).reduce((sum, item) => sum + item.count, 0)
  );

  const extractionMethods: ExtractionMethodStat[] = Array.from(methodBuckets.values())
    .sort((a, b) => b.count - a.count)
    .map((item) => ({
      ...item,
      percentage: Math.round((item.count / totalMethodsCount) * 100),
    }));

  return {
    dailySeries,
    topUsers,
    outcomeSlices,
    extractionMethods,
    finishedCount,
    overallSuccessRate,
    windowTotalConversions,
    windowTotalPages,
    avgPagesPerCompleted,
  };
}
