import { apiFetch } from '../utils/apiClient';
import type { ConversionOptions } from '../types';

export async function extractDirectPdfRequest(params: {
  pdfBase64: string;
  filename: string;
  signal?: AbortSignal;
}): Promise<{ ok: boolean; status?: number; data: any }> {
  const res = await apiFetch('/api/extract-direct-pdf', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Telemetry-Managed': '1',
    },
    signal: params.signal,
    body: JSON.stringify({
      pdfBase64: params.pdfBase64,
      filename: params.filename,
    }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    return { ok: false, status: res.status, data };
  }
  return { ok: true, status: res.status, data };
}

export async function convertPdfChunkRequest(params: {
  pdfBase64: string;
  filename: string;
  options: ConversionOptions;
  signal?: AbortSignal;
}): Promise<{ status: number; ok: boolean; responseText: string }> {
  const response = await apiFetch('/api/convert-pdf', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Telemetry-Managed': '1',
    },
    signal: params.signal,
    body: JSON.stringify({
      pdfBase64: params.pdfBase64,
      filename: params.filename,
      options: params.options,
    }),
  });
  const responseText = await response.text();
  return {
    status: response.status,
    ok: response.ok,
    responseText,
  };
}

export async function contextualCheckRequest(params: {
  markdown: string;
  subjectHint?: string;
  signal?: AbortSignal;
}): Promise<Response> {
  return await apiFetch('/api/contextual-check', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      markdown: params.markdown,
      subjectHint: params.subjectHint,
    }),
    signal: params.signal,
  });
}

export async function grammarSyntaxCheckRequest(params: {
  markdown: string;
  filename?: string;
  signal?: AbortSignal;
}): Promise<Response> {
  return await apiFetch('/api/grammar-syntax-check', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      markdown: params.markdown,
      filename: params.filename,
    }),
    signal: params.signal,
  });
}

export async function exportDocxRequest(payload: unknown): Promise<ArrayBuffer> {
  const res = await apiFetch('/api/export-docx', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    let msg = 'تعذر إنشاء ملف Word (.docx) على الخادم.';
    try {
      const errJson = await res.json();
      if (errJson?.error) msg = errJson.error;
    } catch {}
    throw new Error(msg);
  }
  const arrayBuf = await res.arrayBuffer();
  if (!arrayBuf || arrayBuf.byteLength < 64) {
    throw new Error('ملف Word المُنشأ فارغ أو غير صالح.');
  }
  return arrayBuf;
}
