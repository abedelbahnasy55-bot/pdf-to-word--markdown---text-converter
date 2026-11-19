import type { ConversionResult } from '../types';

export interface BatchQueueLightItem {
  id: string;
  name: string;
  size: number;
  status: string;
  result?: ConversionResult;
  file?: File;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  timestamp: number;
  metaSummary?: string;
}

export interface UnitFilterEntry {
  includeUnits: string[];
  excludeUnits: string[];
}
