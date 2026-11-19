import { apiFetch } from '../utils/apiClient';
import type {
  AdminOverviewResponse,
  AnnouncementBannerConfig,
  ClientPolicyState,
  ConversionStatus,
  FeatureFlagsConfig,
  GlobalLimitsConfig,
  SiteControlsConfig,
  TrackedUserView,
  UserAccessMode,
} from '../model/governance';

export async function fetchClientPolicy(): Promise<ClientPolicyState | null> {
  const res = await apiFetch('/api/client/policy', { method: 'GET', cache: 'no-store' });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  return data?.success && data?.policy ? (data.policy as ClientPolicyState) : null;
}

export interface ClientTelemetryPayload {
  eventId?: string;
  jobId?: string;
  fileName: string;
  fileSize?: number;
  mimeType?: string;
  operation?: string;
  status: ConversionStatus;
  pagesCount?: number;
  wordsCount?: number;
  charsCount?: number;
  extractionMethod?: string;
  durationMs?: number;
  errorMessage?: string;
  blockReason?: string;
  startedAt?: number;
  completedAt?: number;
}

export async function reportClientTelemetry(
  payload: ClientTelemetryPayload
): Promise<{ eventId?: string; policy?: ClientPolicyState } | null> {
  try {
    const res = await apiFetch(
      '/api/client/telemetry',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
      { transientRetries: 0 }
    );
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    if (!data?.success) return null;
    return { eventId: data.eventId, policy: data.policy };
  } catch {
    return null;
  }
}

export async function fetchAdminOverview(): Promise<AdminOverviewResponse | null> {
  const res = await apiFetch('/api/admin/overview', { method: 'GET', cache: 'no-store' });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  return data?.success ? (data as AdminOverviewResponse) : null;
}

export async function saveAdminControls(patch: {
  siteEnabled?: boolean;
  siteDisabledMessage?: string;
  conversionsEnabled?: boolean;
  conversionsPausedMessage?: string;
  announcementBanner?: Partial<AnnouncementBannerConfig>;
  featureFlags?: Partial<FeatureFlagsConfig>;
  globalLimits?: Partial<GlobalLimitsConfig>;
}): Promise<{ ok: boolean; siteControls?: SiteControlsConfig; error?: string }> {
  const res = await apiFetch('/api/admin/controls', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  const data = await res.json().catch(() => null);
  return {
    ok: res.ok && Boolean(data?.success),
    siteControls: data?.siteControls,
    error: data?.error,
  };
}

export async function updateAdminUserControls(
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
): Promise<{ ok: boolean; user?: TrackedUserView; error?: string }> {
  const res = await apiFetch(`/api/admin/users/${encodeURIComponent(clientId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  const data = await res.json().catch(() => null);
  return {
    ok: res.ok && Boolean(data?.success),
    user: data?.user,
    error: data?.error,
  };
}

export async function deleteAdminUser(
  clientId: string,
  includeLogs = false
): Promise<boolean> {
  const q = includeLogs ? '?includeLogs=1' : '';
  const res = await apiFetch(`/api/admin/users/${encodeURIComponent(clientId)}${q}`, {
    method: 'DELETE',
  });
  return res.ok;
}

export async function clearAdminLogs(clientId?: string): Promise<boolean> {
  const q = clientId ? `?clientId=${encodeURIComponent(clientId)}` : '';
  const res = await apiFetch(`/api/admin/logs${q}`, {
    method: 'DELETE',
  });
  return res.ok;
}
