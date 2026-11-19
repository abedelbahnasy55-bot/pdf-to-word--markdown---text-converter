import type { ConversionResult } from '../types';

export interface ServerJobMeta {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  status: 'queued' | 'running' | 'completed' | 'paused' | 'failed';
  createdAt: number;
  updatedAt: number;
  startedAt?: number;
  completedAt?: number;
  totalPages: number;
  completedPages: number;
  digitalPages: number;
  ocrPages: number;
  currentPageRange?: string;
  completedBatches: number;
  totalBatches: number;
  currentPhaseLabel: string;
  percentage: number;
  etaSeconds: number | null;
  errorMessage?: string;
  direction: 'auto' | 'rtl' | 'ltr';
  title: string;
}

export interface ServerJobDetailResponse {
  success: boolean;
  error?: string;
  job?: ServerJobMeta;
  result?: ConversionResult;
  partialMarkdown?: string;
}
