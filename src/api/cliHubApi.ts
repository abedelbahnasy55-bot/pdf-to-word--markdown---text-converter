import { apiFetch } from '../utils/apiClient';

export async function downloadCliArtifactBlob(endpoint: string): Promise<Blob> {
  const res = await apiFetch(endpoint);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return await res.blob();
}
