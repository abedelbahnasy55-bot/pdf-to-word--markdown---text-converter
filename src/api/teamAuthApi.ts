import { apiFetch } from '../utils/apiClient';
import type { TeamAuthMutationResponse, TeamAuthStatusState } from '../model/auth';

export async function fetchTeamAuthStatus(): Promise<TeamAuthStatusState | null> {
  const resp = await apiFetch('/api/auth/status', { method: 'GET', cache: 'no-store' });
  if (!resp.ok) return null;
  const data = await resp.json();
  return {
    lockEnabled: Boolean(data.lockEnabled),
    authenticated: Boolean(data.authenticated),
    envManaged: Boolean(data.envManaged),
    hasPasscodeConfigured: Boolean(data.hasPasscodeConfigured),
    currentOrigin: String(data.currentOrigin || ''),
    sharedPublicOrigin: String(data.sharedPublicOrigin || ''),
    isDevPreviewHost: Boolean(data.isDevPreviewHost),
  };
}

export async function verifyTeamPasscode(
  code: string,
  rememberDevice: boolean
): Promise<{ ok: boolean; data: TeamAuthMutationResponse }> {
  const res = await apiFetch('/api/auth/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, rememberDevice }),
  });
  const data = (await res.json()) as TeamAuthMutationResponse;
  return { ok: res.ok, data };
}

export async function saveTeamAuthConfig(
  enabled: boolean,
  newCode?: string
): Promise<{ ok: boolean; data: TeamAuthMutationResponse }> {
  const res = await apiFetch('/api/auth/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      enabled,
      newCode: newCode?.trim() || undefined,
    }),
  });
  const data = (await res.json()) as TeamAuthMutationResponse;
  return { ok: res.ok, data };
}

export async function revokeAllTeamSessions(): Promise<{
  ok: boolean;
  data: TeamAuthMutationResponse;
}> {
  const res = await apiFetch('/api/auth/revoke-all', { method: 'POST' });
  const data = (await res.json()) as TeamAuthMutationResponse;
  return { ok: res.ok, data };
}

export async function downloadLinksGuideBlob(): Promise<Blob> {
  const res = await apiFetch('/api/links-guide/download');
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return await res.blob();
}
