import { apiFetch } from '../utils/apiClient';

async function postCompilerJsonWithTimeout<T>(
  url: string,
  body: unknown,
  timeoutMs = 45000
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await apiFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const json = await response.json();
    if (!response.ok || !json?.success) {
      throw new Error(json?.error || `HTTP ${response.status}`);
    }
    return json.data as T;
  } finally {
    clearTimeout(timer);
  }
}

export async function postCompilerPlanRequest<T>(body: unknown): Promise<T> {
  return await postCompilerJsonWithTimeout<T>('/api/compiler/plan', body, 30000);
}

export async function postCompilerExtractRequest<T>(body: unknown): Promise<T> {
  return await postCompilerJsonWithTimeout<T>('/api/compiler/extract', body, 40000);
}

export async function postCompilerRefineRequest<T>(body: unknown): Promise<T> {
  return await postCompilerJsonWithTimeout<T>('/api/compiler/refine', body, 60000);
}

export async function postCompilerAskRequest<T>(body: unknown): Promise<T> {
  return await postCompilerJsonWithTimeout<T>('/api/compiler/ask', body, 30000);
}

export async function postCompilerSemanticSearchRequest<T>(body: unknown): Promise<T> {
  return await postCompilerJsonWithTimeout<T>('/api/compiler/semantic-search', body, 35000);
}
