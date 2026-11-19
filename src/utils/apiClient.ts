const TEAM_TOKEN_STORAGE_KEY = 'studio_team_session_token';
const CLIENT_ID_STORAGE_KEY = 'studio_client_id';
export const AUTH_REQUIRED_EVENT = 'studio:auth-required';

let memoryClientIdFallback = '';

export function getOrCreateClientId(): string {
  if (typeof window === 'undefined') return '';
  try {
    const existing = window.localStorage?.getItem(CLIENT_ID_STORAGE_KEY);
    if (existing && /^[a-zA-Z0-9_-]{3,64}$/.test(existing)) {
      return existing;
    }
    const randomHex =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
        : `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const generated = `usr_${randomHex}`;
    window.localStorage?.setItem(CLIENT_ID_STORAGE_KEY, generated);
    return generated;
  } catch {
    if (!memoryClientIdFallback) {
      memoryClientIdFallback = `usr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    }
    return memoryClientIdFallback;
  }
}

export function getBrowserDeviceLabel(): string {
  if (typeof navigator === 'undefined') return '';
  const ua = navigator.userAgent || '';
  let browser = 'Browser';
  if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/OPR\/|Opera/i.test(ua)) browser = 'Opera';
  else if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) browser = 'Chrome';
  else if (/Firefox\//i.test(ua)) browser = 'Firefox';
  else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = 'Safari';

  let os = '';
  if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Mac OS X|Macintosh/i.test(ua)) os = 'macOS';
  else if (/Linux/i.test(ua)) os = 'Linux';

  return os ? `${browser} · ${os}` : browser;
}

export function getStoredTeamToken(): string {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(TEAM_TOKEN_STORAGE_KEY) || '';
    }
  } catch {}
  return '';
}

export function setStoredTeamToken(token: string | null): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      if (token && token.trim()) {
        window.localStorage.setItem(TEAM_TOKEN_STORAGE_KEY, token.trim());
      } else {
        window.localStorage.removeItem(TEAM_TOKEN_STORAGE_KEY);
      }
    }
  } catch {}
}

export function buildApiHeaders(existing?: HeadersInit): HeadersInit | undefined {
  const token = getStoredTeamToken();
  const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';
  const clientId = isBrowser ? getOrCreateClientId() : '';
  const deviceLabel = isBrowser ? getBrowserDeviceLabel() : '';

  if (!token && !clientId) return existing;

  if (existing instanceof Headers) {
    const cloned = new Headers(existing);
    if (token && !cloned.has('X-Team-Session')) cloned.set('X-Team-Session', token);
    if (clientId && !cloned.has('X-Client-Id')) cloned.set('X-Client-Id', clientId);
    if (deviceLabel && !cloned.has('X-Client-Device')) {
      cloned.set('X-Client-Device', encodeURIComponent(deviceLabel));
    }
    return cloned;
  }
  if (Array.isArray(existing)) {
    const out: Array<[string, string]> = [...existing] as Array<[string, string]>;
    if (token) out.push(['X-Team-Session', token]);
    if (clientId) out.push(['X-Client-Id', clientId]);
    if (deviceLabel) out.push(['X-Client-Device', encodeURIComponent(deviceLabel)]);
    return out;
  }
  const merged: Record<string, string> = {
    ...(existing as Record<string, string> | undefined),
  };
  if (token) merged['X-Team-Session'] = token;
  if (clientId) merged['X-Client-Id'] = clientId;
  if (deviceLabel) merged['X-Client-Device'] = encodeURIComponent(deviceLabel);
  return merged;
}

export interface ApiFetchOptions {
  /** Number of automatic transient retries on 502/503/504/network wake drops. Defaults to 1 in browser. */
  transientRetries?: number;
}

const TRANSIENT_STATUSES = new Set([502, 503, 504]);

export async function apiFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
  options: ApiFetchOptions = {}
): Promise<Response> {
  const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';
  const maxRetries =
    typeof options.transientRetries === 'number'
      ? options.transientRetries
      : isBrowser
      ? 1
      : 0;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const headers = buildApiHeaders(init.headers);
      const reqInit: RequestInit = {
        ...init,
        ...(headers !== undefined ? { headers } : {}),
        ...(isBrowser ? { credentials: init.credentials ?? 'include' } : {}),
      };
      const response = await globalThis.fetch(input, reqInit);

      if (response.status === 401 && isBrowser) {
        const cloned = response.clone();
        try {
          const payload = await cloned.json();
          if (payload?.authRequired) {
            setStoredTeamToken(null);
            window.dispatchEvent(new CustomEvent(AUTH_REQUIRED_EVENT));
          }
        } catch {}
      }

      if (TRANSIENT_STATUSES.has(response.status) && attempt < maxRetries && !init.signal?.aborted) {
        await new Promise((r) => setTimeout(r, 900 * (attempt + 1)));
        continue;
      }

      return response;
    } catch (err: any) {
      lastError = err;
      if (init.signal?.aborted || err?.name === 'AbortError' || attempt >= maxRetries) {
        throw err;
      }
      await new Promise((r) => setTimeout(r, 900 * (attempt + 1)));
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Network request failed');
}
