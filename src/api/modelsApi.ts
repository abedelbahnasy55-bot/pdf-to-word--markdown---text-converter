import { apiFetch } from '../utils/apiClient';
import type { ApiHealthResponse, ModelPoolStatusResponse } from '../model/models';

export async function fetchModelPoolStatus(
  forceRefresh = false
): Promise<ModelPoolStatusResponse | null> {
  const res = await apiFetch(
    forceRefresh ? '/api/models/refresh' : '/api/models/status',
    { method: forceRefresh ? 'POST' : 'GET' }
  );
  const data = await res.json();
  if (data?.success && Array.isArray(data.models)) {
    return data as ModelPoolStatusResponse;
  }
  return null;
}

export async function checkApiHealth(): Promise<{
  ok: boolean;
  status: number;
  data?: ApiHealthResponse;
}> {
  const res = await apiFetch('/api/health');
  if (!res.ok) {
    return { ok: false, status: res.status };
  }
  const data = (await res.json()) as ApiHealthResponse;
  return { ok: true, status: res.status, data };
}
