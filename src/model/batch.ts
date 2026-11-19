import type {
  ConversionOptions,
  ConversionResult,
  ConversionResumeState,
} from '../types';

export type BatchFilterTab = 'all' | 'done' | 'undownloaded' | 'pending' | 'error';

export interface BatchFileItem {
  id: string;
  file: File;
  name: string;
  size: number;
  status: 'pending' | 'processing' | 'done' | 'error';
  progress?: number;
  result?: ConversionResult;
  error?: string;
  retryCount?: number;
  resumeState?: ConversionResumeState;
  options?: ConversionOptions;
  statusMessage?: string;
  isDownloaded?: boolean;
  lastUpdatedAt?: number;
}
