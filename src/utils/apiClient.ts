const TEAM_TOKEN_STORAGE_KEY = 'studio_team_session_token';
export const AUTH_REQUIRED_EVENT = 'studio:auth-required';

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
  if (!token) return existing;
  if (existing instanceof Headers) {
    const cloned = new Headers(existing);
    if (!cloned.has('X-Team-Session')) cloned.set('X-Team-Session', token);
    return cloned;
  }
  if (Array.isArray(existing)) {
    return [...existing, ['X-Team-Session', token]];
  }
  return {
    ...(existing || {}),
    'X-Team-Session': token,
  };
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
