export interface TeamAuthStatusState {
  lockEnabled: boolean;
  authenticated: boolean;
  envManaged: boolean;
  hasPasscodeConfigured: boolean;
  currentOrigin: string;
  sharedPublicOrigin: string;
  isDevPreviewHost: boolean;
}

export interface TeamAuthMutationResponse {
  success: boolean;
  error?: string;
  lockEnabled?: boolean;
  sessionToken?: string | null;
}
