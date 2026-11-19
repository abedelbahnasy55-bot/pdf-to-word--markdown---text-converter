export type UserAccessMode = 'active' | 'block_conversions' | 'block_site';
export type ConversionStatus =
  | 'started'
  | 'processing'
  | 'completed'
  | 'paused'
  | 'failed'
  | 'blocked';
export type AnnouncementTone = 'info' | 'warning' | 'danger';

export interface AnnouncementBannerConfig {
  enabled: boolean;
  text: string;
  tone: AnnouncementTone;
}

export interface FeatureFlagsConfig {
  allowSmartCompiler: boolean;
  allowBackgroundJobs: boolean;
  allowDocxExport: boolean;
  allowOcrFallback: boolean;
}

export interface GlobalLimitsConfig {
  maxPagesPerConversion: number;
  maxFileSizeMb: number;
  dailyConversionQuotaPerUser: number;
  dailyPageQuotaPerUser: number;
}

export interface SiteControlsConfig {
  siteEnabled: boolean;
  siteDisabledMessage: string;
  conversionsEnabled: boolean;
  conversionsPausedMessage: string;
  announcementBanner: AnnouncementBannerConfig;
  featureFlags: FeatureFlagsConfig;
  globalLimits: GlobalLimitsConfig;
  updatedAt: number;
}

export interface ClientPolicyState {
  clientId: string;
  ip: string;
  deviceLabel: string;
  siteEnabled: boolean;
  conversionsEnabled: boolean;
  accessMode: UserAccessMode;
  blockMessage: string;
  siteBlockMessage: string;
  conversionBlockMessage: string;
  announcementBanner: AnnouncementBannerConfig;
  featureFlags: FeatureFlagsConfig;
  globalLimits: GlobalLimitsConfig;
  effectiveDailyPageLimit: number;
  todayUsage: {
    date: string;
    conversions: number;
    pages: number;
  };
  remainingDailyConversions: number | null;
  remainingDailyPages: number | null;
  matchedByIp: boolean;
}

export interface TrackedUserView {
  clientId: string;
  displayName: string;
  adminNote: string;
  firstSeenAt: number;
  lastSeenAt: number;
  lastIp: string;
  knownIps: string[];
  userAgent: string;
  deviceLabel: string;
  accessMode: UserAccessMode;
  customBlockMessage: string;
  customDailyPageLimit: number;
  blockMatchingIpToo: boolean;
  totalConversions: number;
  completedConversions: number;
  failedConversions: number;
  blockedAttempts: number;
  totalPagesConverted: number;
  lastFileName: string;
  lastActivityAt: number;
  todayConversions: number;
  todayPages: number;
}

export interface ConversionLogView {
  id: string;
  clientId: string;
  ip: string;
  deviceLabel: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  operation: string;
  status: ConversionStatus;
  pagesCount: number;
  wordsCount: number;
  charsCount: number;
  extractionMethod: string;
  durationMs: number;
  errorMessage?: string;
  blockReason?: string;
  jobId?: string;
  startedAt: number;
  completedAt?: number;
}

export interface AdminOverviewSummary {
  totalUsers: number;
  onlineRecentlyCount: number;
  blockedUsersCount: number;
  totalConversions: number;
  completedConversions: number;
  failedConversions: number;
  blockedAttempts: number;
  totalPagesConverted: number;
  todayConversions: number;
  todayPages: number;
}

export interface AdminOverviewResponse {
  success: boolean;
  siteControls: SiteControlsConfig;
  summary: AdminOverviewSummary;
  users: TrackedUserView[];
  logs: ConversionLogView[];
}
