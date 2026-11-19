import { apiFetch } from '../utils/apiClient';
import type { ServerJobDetailResponse, ServerJobMeta } from '../model/jobs';

export async function listServerJobs(): Promise<ServerJobMeta[] | null> {
  const resp = await apiFetch('/api/jobs', { cache: 'no-store' });
  if (!resp.ok) return null;
  const data = await resp.json();
  if (data?.success && Array.isArray(data.jobs)) {
    return data.jobs as ServerJobMeta[];
  }
  return null;
}

export async function submitServerJobFile(
  file: File,
  direction: 'auto' | 'rtl' | 'ltr' = 'auto'
): Promise<{ ok: boolean; success: boolean; error?: string }> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('direction', direction);

  const resp = await apiFetch('/api/jobs', {
    method: 'POST',
    body: formData,
  });
  const data = await resp.json().catch(() => null);
  return {
    ok: resp.ok,
    success: Boolean(data?.success),
    error: data?.error,
  };
}

export async function fetchServerJobDetail(jobId: string): Promise<{
  ok: boolean;
  data: ServerJobDetailResponse;
}> {
  const resp = await apiFetch(`/api/jobs/${encodeURIComponent(jobId)}`);
  const data = (await resp.json()) as ServerJobDetailResponse;
  return { ok: resp.ok, data };
}

export async function pauseServerJob(jobId: string): Promise<void> {
  await apiFetch(`/api/jobs/${encodeURIComponent(jobId)}/cancel`, { method: 'POST' });
}

export async function resumeServerJob(jobId: string): Promise<void> {
  await apiFetch(`/api/jobs/${encodeURIComponent(jobId)}/resume`, { method: 'POST' });
}

export async function deleteServerJob(jobId: string): Promise<void> {
  await apiFetch(`/api/jobs/${encodeURIComponent(jobId)}`, { method: 'DELETE' });
}

export async function fetchServerJobDocxBlob(jobId: string): Promise<Blob> {
  const resp = await apiFetch(`/api/jobs/${encodeURIComponent(jobId)}/download-docx`);
  if (!resp.ok) {
    const errJson = await resp.json().catch(() => null);
    throw new Error(errJson?.error || 'تعذر إنشاء ملف Word لهذه المهمة.');
  }
  return await resp.blob();
}
