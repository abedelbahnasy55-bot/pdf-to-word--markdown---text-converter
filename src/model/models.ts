export type ModelHealthStatus =
  | 'verified_free'
  | 'candidate'
  | 'cooldown'
  | 'daily_exhausted'
  | 'paid_required'
  | 'unavailable';

export interface ManagedModelView {
  id: string;
  displayName: string;
  status: ModelHealthStatus;
  cooldownRemainingSec: number;
  successCount: number;
  errorCount: number;
  lastError: string | null;
}

export interface ModelPoolStatusResponse {
  success: boolean;
  models: ManagedModelView[];
  activeCount: number;
}

export interface ApiHealthResponse {
  status?: string;
  models?: string[];
}
