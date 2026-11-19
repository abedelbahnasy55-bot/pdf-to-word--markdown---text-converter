import fs from "fs";
import path from "path";
import crypto from "crypto";
import type { Express, NextFunction, Request, Response } from "express";

export type UserAccessMode = "active" | "block_conversions" | "block_site";
export type ConversionStatus =
  | "started"
  | "processing"
  | "completed"
  | "paused"
  | "failed"
  | "blocked";
export type AnnouncementTone = "info" | "warning" | "danger";
export type GovernanceAction =
  | "convert"
  | "ocr"
  | "background_job"
  | "smart_compiler"
  | "docx_export";

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

export interface DailyUsageCounter {
  date: string;
  conversions: number;
  pages: number;
}

export interface TrackedUserProfile {
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
  dailyUsage: Record<string, DailyUsageCounter>;
}

export interface ConversionTelemetryEvent {
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

export interface ClientIdentity {
  clientId: string;
  ip: string;
  userAgent: string;
  deviceLabel: string;
  fromExplicitHeader: boolean;
}

export interface EvaluatedClientPolicy {
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
  todayUsage: DailyUsageCounter;
  remainingDailyConversions: number | null;
  remainingDailyPages: number | null;
  matchedByIp: boolean;
}

export interface ActionAuthorizationResult {
  allowed: boolean;
  status: number;
  blockScope?: "site" | "conversions" | "feature" | "quota" | "limit";
  error?: string;
  policy: EvaluatedClientPolicy;
}

interface PersistedGovernanceState {
  version: 1;
  siteControls: SiteControlsConfig;
  users: Record<string, TrackedUserProfile>;
  conversionLogs: ConversionTelemetryEvent[];
}

export const CLIENT_ID_COOKIE_NAME = "studio_client_id";
export const CLIENT_ID_HEADER_NAME = "x-client-id";
export const CLIENT_DEVICE_HEADER_NAME = "x-client-device";
const MAX_LOGS_COUNT = 1000;
const MAX_USERS_COUNT = 2000;

function getTodayDateKey(now: number = Date.now()): string {
  const d = new Date(now);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeIp(raw: string | undefined): string {
  if (!raw) return "unknown";
  let cleaned = raw.split(",")[0].trim();
  if (cleaned.startsWith("::ffff:")) {
    cleaned = cleaned.slice(7);
  }
  if (cleaned === "::1") return "127.0.0.1";
  return cleaned.slice(0, 64) || "unknown";
}

function deriveDeviceLabel(ua: string, headerDevice?: string): string {
  if (headerDevice && typeof headerDevice === "string") {
    try {
      const decoded = decodeURIComponent(headerDevice).trim();
      if (decoded.length >= 2) return decoded.slice(0, 80);
    } catch {
      const trimmed = headerDevice.trim();
      if (trimmed.length >= 2) return trimmed.slice(0, 80);
    }
  }

  const s = ua || "";
  if (!s) return "جهاز غير محدد";
  if (/curl|wget|node-fetch|undici|axios|python-requests|PostmanRuntime/i.test(s)) {
    return "أداة CLI / API";
  }

  let browser = "متصفح";
  if (/Edg\//i.test(s)) browser = "Edge";
  else if (/OPR\/|Opera/i.test(s)) browser = "Opera";
  else if (/Chrome\//i.test(s) && !/Edg\//i.test(s)) browser = "Chrome";
  else if (/Firefox\//i.test(s)) browser = "Firefox";
  else if (/Safari\//i.test(s) && !/Chrome\//i.test(s)) browser = "Safari";

  let os = "";
  if (/iPhone|iPad|iPod/i.test(s)) os = "iOS";
  else if (/Android/i.test(s)) os = "Android";
  else if (/Windows/i.test(s)) os = "Windows";
  else if (/Mac OS X|Macintosh/i.test(s)) os = "macOS";
  else if (/Linux/i.test(s)) os = "Linux";

  return os ? `${browser} · ${os}` : browser;
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;
  for (const part of cookieHeader.split(";")) {
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) {
      try {
        result[key] = decodeURIComponent(val);
      } catch {
        result[key] = val;
      }
    }
  }
  return result;
}

function sanitizeClientId(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const cleaned = raw.trim();
  if (/^[a-zA-Z0-9_-]{3,64}$/.test(cleaned)) {
    return cleaned;
  }
  return "";
}

function defaultSiteControls(): SiteControlsConfig {
  return {
    siteEnabled: true,
    siteDisabledMessage:
      "المنصة متوقفة مؤقتاً من قِبل الإدارة للصيانة والتحديث، يرجى المحاولة لاحقاً.",
    conversionsEnabled: true,
    conversionsPausedMessage:
      "تم إيقاف عمليات التحويل مؤقتاً من قِبل المشرف. يرجى المحاولة بعد قليل أو مراجعة الإدارة.",
    announcementBanner: {
      enabled: false,
      text: "",
      tone: "info",
    },
    featureFlags: {
      allowSmartCompiler: true,
      allowBackgroundJobs: true,
      allowDocxExport: true,
      allowOcrFallback: true,
    },
    globalLimits: {
      maxPagesPerConversion: 0,
      maxFileSizeMb: 0,
      dailyConversionQuotaPerUser: 0,
      dailyPageQuotaPerUser: 0,
    },
    updatedAt: Date.now(),
  };
}

export class GovernanceManager {
  private readonly storageDir: string;
  private readonly filePath: string;
  private state: PersistedGovernanceState;

  constructor(projectRoot: string) {
    this.storageDir = path.join(projectRoot, ".jobs");
    fs.mkdirSync(this.storageDir, { recursive: true });
    this.filePath = path.join(this.storageDir, "governance.json");
    this.state = this.loadState();
  }

  private loadState(): PersistedGovernanceState {
    const fallback: PersistedGovernanceState = {
      version: 1,
      siteControls: defaultSiteControls(),
      users: {},
      conversionLogs: [],
    };
    try {
      if (!fs.existsSync(this.filePath)) return fallback;
      const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf-8"));
      const sc = parsed?.siteControls || {};
      const defaults = defaultSiteControls();
      return {
        version: 1,
        siteControls: {
          siteEnabled: sc.siteEnabled !== false,
          siteDisabledMessage:
            typeof sc.siteDisabledMessage === "string" && sc.siteDisabledMessage.trim()
              ? sc.siteDisabledMessage
              : defaults.siteDisabledMessage,
          conversionsEnabled: sc.conversionsEnabled !== false,
          conversionsPausedMessage:
            typeof sc.conversionsPausedMessage === "string" && sc.conversionsPausedMessage.trim()
              ? sc.conversionsPausedMessage
              : defaults.conversionsPausedMessage,
          announcementBanner: {
            enabled: Boolean(sc.announcementBanner?.enabled),
            text:
              typeof sc.announcementBanner?.text === "string"
                ? sc.announcementBanner.text
                : "",
            tone:
              sc.announcementBanner?.tone === "warning" ||
              sc.announcementBanner?.tone === "danger"
                ? sc.announcementBanner.tone
                : "info",
          },
          featureFlags: {
            allowSmartCompiler: sc.featureFlags?.allowSmartCompiler !== false,
            allowBackgroundJobs: sc.featureFlags?.allowBackgroundJobs !== false,
            allowDocxExport: sc.featureFlags?.allowDocxExport !== false,
            allowOcrFallback: sc.featureFlags?.allowOcrFallback !== false,
          },
          globalLimits: {
            maxPagesPerConversion: Math.max(
              0,
              Number(sc.globalLimits?.maxPagesPerConversion) || 0
            ),
            maxFileSizeMb: Math.max(0, Number(sc.globalLimits?.maxFileSizeMb) || 0),
            dailyConversionQuotaPerUser: Math.max(
              0,
              Number(sc.globalLimits?.dailyConversionQuotaPerUser) || 0
            ),
            dailyPageQuotaPerUser: Math.max(
              0,
              Number(sc.globalLimits?.dailyPageQuotaPerUser) || 0
            ),
          },
          updatedAt: Number(sc.updatedAt) || Date.now(),
        },
        users:
          parsed?.users && typeof parsed.users === "object"
            ? (parsed.users as Record<string, TrackedUserProfile>)
            : {},
        conversionLogs: Array.isArray(parsed?.conversionLogs)
          ? (parsed.conversionLogs as ConversionTelemetryEvent[]).slice(0, MAX_LOGS_COUNT)
          : [],
      };
    } catch {
      return fallback;
    }
  }

  private saveState(): void {
    const tmpPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    try {
      fs.writeFileSync(tmpPath, JSON.stringify(this.state, null, 2), "utf-8");
      fs.renameSync(tmpPath, this.filePath);
    } catch (err) {
      try {
        fs.rmSync(tmpPath, { force: true });
      } catch {}
      throw err;
    }
  }

  public extractClientIdentity(req: Request): ClientIdentity {
    const forwarded =
      typeof req.headers["x-forwarded-for"] === "string"
        ? req.headers["x-forwarded-for"]
        : undefined;
    const ip = normalizeIp(forwarded || req.ip || req.socket?.remoteAddress);
    const ua = typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : "";
    const cookies = parseCookies(req.headers.cookie);

    const headerId = sanitizeClientId(req.headers[CLIENT_ID_HEADER_NAME]);
    const cookieId = sanitizeClientId(cookies[CLIENT_ID_COOKIE_NAME]);
    const explicitId = headerId || cookieId;

    const clientId =
      explicitId ||
      `anon_${crypto
        .createHash("sha256")
        .update(`${ip}|${ua.slice(0, 120)}`)
        .digest("hex")
        .slice(0, 10)}`;

    const rawDeviceHeader =
      typeof req.headers[CLIENT_DEVICE_HEADER_NAME] === "string"
        ? req.headers[CLIENT_DEVICE_HEADER_NAME]
        : undefined;

    return {
      clientId,
      ip,
      userAgent: ua.slice(0, 240),
      deviceLabel: deriveDeviceLabel(ua, rawDeviceHeader),
      fromExplicitHeader: Boolean(headerId),
    };
  }

  private pruneOldDailyBuckets(user: TrackedUserProfile, now: number): void {
    const keys = Object.keys(user.dailyUsage || {}).sort();
    if (keys.length <= 10) return;
    const cutoff = getTodayDateKey(now - 9 * 24 * 60 * 60 * 1000);
    for (const k of keys) {
      if (k < cutoff) {
        delete user.dailyUsage[k];
      }
    }
  }

  public touchUser(identity: ClientIdentity, persist = true): TrackedUserProfile {
    const now = Date.now();
    let user = this.state.users[identity.clientId];
    let dirty = false;

    if (!user) {
      // Evict oldest inactive non-blocked user if capacity reached
      const userIds = Object.keys(this.state.users);
      if (userIds.length >= MAX_USERS_COUNT) {
        const candidates = userIds
          .map((id) => this.state.users[id])
          .filter((u) => u.accessMode === "active")
          .sort((a, b) => a.lastSeenAt - b.lastSeenAt);
        if (candidates[0]) {
          delete this.state.users[candidates[0].clientId];
        }
      }

      user = {
        clientId: identity.clientId,
        displayName: "",
        adminNote: "",
        firstSeenAt: now,
        lastSeenAt: now,
        lastIp: identity.ip,
        knownIps: identity.ip !== "unknown" ? [identity.ip] : [],
        userAgent: identity.userAgent,
        deviceLabel: identity.deviceLabel,
        accessMode: "active",
        customBlockMessage: "",
        customDailyPageLimit: 0,
        blockMatchingIpToo: false,
        totalConversions: 0,
        completedConversions: 0,
        failedConversions: 0,
        blockedAttempts: 0,
        totalPagesConverted: 0,
        lastFileName: "",
        lastActivityAt: now,
        dailyUsage: {},
      };
      this.state.users[identity.clientId] = user;
      dirty = true;
    } else {
      const seenGapMs = now - user.lastSeenAt;
      if (seenGapMs > 15_000) {
        user.lastSeenAt = now;
        dirty = true;
      }
      if (identity.ip !== "unknown" && identity.ip !== user.lastIp) {
        user.lastIp = identity.ip;
        if (!user.knownIps.includes(identity.ip)) {
          user.knownIps = [identity.ip, ...user.knownIps].slice(0, 10);
        }
        dirty = true;
      }
      if (identity.deviceLabel && identity.deviceLabel !== "جهاز غير محدد" && identity.deviceLabel !== user.deviceLabel) {
        user.deviceLabel = identity.deviceLabel;
        dirty = true;
      }
      if (identity.userAgent && identity.userAgent !== user.userAgent) {
        user.userAgent = identity.userAgent;
        dirty = true;
      }
    }

    if (dirty && persist) {
      this.saveState();
    }
    return user;
  }

  public evaluatePolicy(identity: ClientIdentity): EvaluatedClientPolicy {
    const user = this.state.users[identity.clientId];
    const sc = this.state.siteControls;
    const today = getTodayDateKey();
    const todayUsage: DailyUsageCounter = user?.dailyUsage?.[today] || {
      date: today,
      conversions: 0,
      pages: 0,
    };

    // Determine effective per-user rule (either direct clientId match or IP match if enabled)
    let effectiveRuleUser: TrackedUserProfile | undefined = user;
    let matchedByIp = false;

    if ((!effectiveRuleUser || effectiveRuleUser.accessMode === "active") && identity.ip !== "unknown") {
      for (const candidate of Object.values(this.state.users)) {
        if (candidate.clientId === identity.clientId) continue;
        if (candidate.accessMode === "active" || !candidate.blockMatchingIpToo) continue;
        const matchesIp =
          candidate.lastIp === identity.ip || candidate.knownIps.includes(identity.ip);
        if (matchesIp) {
          if (
            !effectiveRuleUser ||
            effectiveRuleUser.accessMode === "active" ||
            (candidate.accessMode === "block_site" &&
              effectiveRuleUser.accessMode !== "block_site")
          ) {
            effectiveRuleUser = candidate;
            matchedByIp = true;
          }
        }
      }
    }

    const userAccessMode: UserAccessMode = effectiveRuleUser?.accessMode || "active";
    const userCustomMsg = (effectiveRuleUser?.customBlockMessage || "").trim();

    const dailyConvLimit = sc.globalLimits.dailyConversionQuotaPerUser || 0;
    const customPageLimit = user?.customDailyPageLimit || 0;
    const effectiveDailyPageLimit =
      customPageLimit > 0 ? customPageLimit : sc.globalLimits.dailyPageQuotaPerUser || 0;

    const remainingDailyConversions =
      dailyConvLimit > 0 ? Math.max(0, dailyConvLimit - todayUsage.conversions) : null;
    const remainingDailyPages =
      effectiveDailyPageLimit > 0
        ? Math.max(0, effectiveDailyPageLimit - todayUsage.pages)
        : null;

    const convQuotaExceeded =
      remainingDailyConversions !== null && remainingDailyConversions <= 0;
    const pageQuotaExceeded = remainingDailyPages !== null && remainingDailyPages <= 0;

    const isSiteDisabledGlobally = !sc.siteEnabled;
    const isUserSiteBlocked = userAccessMode === "block_site";
    const siteEnabled = !isSiteDisabledGlobally && !isUserSiteBlocked;

    const isUserConversionBlocked = userAccessMode === "block_conversions";
    const conversionsPausedGlobally = !sc.conversionsEnabled;

    const conversionsEnabled =
      siteEnabled &&
      !isUserConversionBlocked &&
      !conversionsPausedGlobally &&
      !convQuotaExceeded &&
      !pageQuotaExceeded;

    let accessMode: UserAccessMode = "active";
    if (!siteEnabled) {
      accessMode = "block_site";
    } else if (!conversionsEnabled) {
      accessMode = "block_conversions";
    }

    let siteBlockMessage = "";
    if (isUserSiteBlocked) {
      siteBlockMessage =
        userCustomMsg || "تم تقييد وصولك إلى المنصة من قِبل المشرف. يرجى مراجعة الإدارة.";
    } else if (isSiteDisabledGlobally) {
      siteBlockMessage = sc.siteDisabledMessage;
    }

    let conversionBlockMessage = "";
    if (!siteEnabled) {
      conversionBlockMessage = siteBlockMessage;
    } else if (isUserConversionBlocked) {
      conversionBlockMessage =
        userCustomMsg || "تم إيقاف صلاحية التحويل لحسابك مؤقتاً من قِبل المشرف.";
    } else if (conversionsPausedGlobally) {
      conversionBlockMessage = sc.conversionsPausedMessage;
    } else if (convQuotaExceeded) {
      conversionBlockMessage = `لقد وصلت إلى الحد الأقصى المسموح به يومياً للتحويل (${dailyConvLimit} عمليات تحويل في اليوم). يرجى المحاولة غداً أو التواصل مع المشرف.`;
    } else if (pageQuotaExceeded) {
      conversionBlockMessage = `لقد استنفدت الحد الأقصى المسموح به يومياً للصفحات (${effectiveDailyPageLimit} صفحة في اليوم). يرجى المحاولة غداً أو التواصل مع المشرف.`;
    }

    return {
      clientId: identity.clientId,
      ip: identity.ip,
      deviceLabel: identity.deviceLabel,
      siteEnabled,
      conversionsEnabled,
      accessMode,
      blockMessage: !siteEnabled ? siteBlockMessage : conversionBlockMessage,
      siteBlockMessage,
      conversionBlockMessage,
      announcementBanner: sc.announcementBanner,
      featureFlags: sc.featureFlags,
      globalLimits: sc.globalLimits,
      effectiveDailyPageLimit,
      todayUsage,
      remainingDailyConversions,
      remainingDailyPages,
      matchedByIp,
    };
  }

  public checkActionAllowed(
    identity: ClientIdentity,
    action: GovernanceAction,
    meta?: {
      fileSizeBytes?: number;
      pagesCount?: number;
      fileName?: string;
      operation?: string;
    }
  ): ActionAuthorizationResult {
    this.touchUser(identity, false);
    const policy = this.evaluatePolicy(identity);
    const sc = this.state.siteControls;

    const reject = (
      blockScope: NonNullable<ActionAuthorizationResult["blockScope"]>,
      error: string
    ): ActionAuthorizationResult => {
      this.recordConversionEvent({
        clientId: identity.clientId,
        ip: identity.ip,
        deviceLabel: identity.deviceLabel,
        fileName: meta?.fileName || "طلب مقيّد",
        fileSize: meta?.fileSizeBytes || 0,
        mimeType: "",
        operation: meta?.operation || action,
        status: "blocked",
        pagesCount: meta?.pagesCount || 0,
        wordsCount: 0,
        charsCount: 0,
        extractionMethod: "blocked_by_governance",
        durationMs: 0,
        blockReason: error,
        startedAt: Date.now(),
        completedAt: Date.now(),
      });
      return {
        allowed: false,
        status: 403,
        blockScope,
        error,
        policy,
      };
    };

    if (!policy.siteEnabled) {
      return reject("site", policy.siteBlockMessage);
    }

    if (action === "docx_export") {
      if (!sc.featureFlags.allowDocxExport) {
        return reject("feature", "تم تعطيل ميزة تصدير ملفات Word (.docx) مؤقتاً من قِبل المشرف.");
      }
      return { allowed: true, status: 200, policy };
    }

    if (action === "smart_compiler") {
      if (!sc.featureFlags.allowSmartCompiler) {
        return reject("feature", "تم تعطيل استوديو التجميع الذكي مؤقتاً من قِبل المشرف.");
      }
      if (!policy.conversionsEnabled && policy.accessMode === "block_conversions" && !sc.conversionsEnabled) {
        return reject("conversions", policy.conversionBlockMessage);
      }
      const user = this.state.users[identity.clientId];
      if (user?.accessMode === "block_conversions") {
        return reject("conversions", policy.conversionBlockMessage);
      }
      return { allowed: true, status: 200, policy };
    }

    // Conversion actions: "convert" | "ocr" | "background_job"
    if (!policy.conversionsEnabled) {
      const isQuota =
        (policy.remainingDailyConversions !== null && policy.remainingDailyConversions <= 0) ||
        (policy.remainingDailyPages !== null && policy.remainingDailyPages <= 0);
      return reject(isQuota ? "quota" : "conversions", policy.conversionBlockMessage);
    }

    if (action === "background_job" && !sc.featureFlags.allowBackgroundJobs) {
      return reject(
        "feature",
        "تم تعطيل المعالجة الخلفية على الخادم مؤقتاً من قِبل المشرف."
      );
    }

    if (action === "ocr" && !sc.featureFlags.allowOcrFallback) {
      return reject(
        "feature",
        "تم تعطيل التعرف البصري بالذكاء الاصطناعي (OCR) من قِبل المشرف؛ يُسمح حالياً بالملفات الرقمية المباشرة فقط."
      );
    }

    if (
      sc.globalLimits.maxFileSizeMb > 0 &&
      meta?.fileSizeBytes &&
      meta.fileSizeBytes > sc.globalLimits.maxFileSizeMb * 1024 * 1024
    ) {
      return reject(
        "limit",
        `يتجاوز حجم الملف الحد الأقصى المسموح به من الإدارة (${sc.globalLimits.maxFileSizeMb} ميجابايت).`
      );
    }

    if (
      sc.globalLimits.maxPagesPerConversion > 0 &&
      meta?.pagesCount &&
      meta.pagesCount > sc.globalLimits.maxPagesPerConversion
    ) {
      return reject(
        "limit",
        `يتجاوز عدد صفحات الملف الحد الأقصى المسموح به في المرة الواحدة (${sc.globalLimits.maxPagesPerConversion} صفحة).`
      );
    }

    return { allowed: true, status: 200, policy };
  }

  public recordConversionEvent(input: {
    id?: string;
    jobId?: string;
    clientId: string;
    ip: string;
    deviceLabel: string;
    fileName: string;
    fileSize?: number;
    mimeType?: string;
    operation: string;
    status: ConversionStatus;
    pagesCount?: number;
    wordsCount?: number;
    charsCount?: number;
    extractionMethod?: string;
    durationMs?: number;
    errorMessage?: string;
    blockReason?: string;
    startedAt?: number;
    completedAt?: number;
  }): ConversionTelemetryEvent {
    const now = Date.now();
    const user = this.touchUser(
      {
        clientId: input.clientId,
        ip: normalizeIp(input.ip),
        userAgent: "",
        deviceLabel: input.deviceLabel || "جهاز غير محدد",
        fromExplicitHeader: true,
      },
      false
    );

    const safePages = Math.max(0, Math.round(Number(input.pagesCount) || 0));
    const safeWords = Math.max(0, Math.round(Number(input.wordsCount) || 0));
    const safeChars = Math.max(0, Math.round(Number(input.charsCount) || 0));
    const safeSize = Math.max(0, Math.round(Number(input.fileSize) || 0));
    const safeDuration = Math.max(0, Math.round(Number(input.durationMs) || 0));

    // Match existing log entry by id or jobId to update status lifecycle without duplication
    const existingIndex = this.state.conversionLogs.findIndex(
      (ev) =>
        (input.id && ev.id === input.id) ||
        (input.jobId && ev.jobId === input.jobId)
    );

    let event: ConversionTelemetryEvent;
    const previousStatus = existingIndex >= 0 ? this.state.conversionLogs[existingIndex].status : null;
    const previousPages = existingIndex >= 0 ? this.state.conversionLogs[existingIndex].pagesCount : 0;

    if (existingIndex >= 0) {
      const existing = this.state.conversionLogs[existingIndex];
      event = {
        ...existing,
        fileName: input.fileName || existing.fileName,
        fileSize: safeSize || existing.fileSize,
        mimeType: input.mimeType || existing.mimeType,
        operation: input.operation || existing.operation,
        status: input.status,
        pagesCount: safePages || existing.pagesCount,
        wordsCount: safeWords || existing.wordsCount,
        charsCount: safeChars || existing.charsCount,
        extractionMethod: input.extractionMethod || existing.extractionMethod,
        durationMs: safeDuration || existing.durationMs,
        errorMessage: input.errorMessage ?? existing.errorMessage,
        blockReason: input.blockReason ?? existing.blockReason,
        completedAt:
          input.status === "completed" ||
          input.status === "failed" ||
          input.status === "paused" ||
          input.status === "blocked"
            ? input.completedAt || now
            : existing.completedAt,
      };
      this.state.conversionLogs[existingIndex] = event;
      // Re-sort newest first
      this.state.conversionLogs.sort((a, b) => b.startedAt - a.startedAt);
    } else {
      event = {
        id: input.id || `log_${now}_${crypto.randomBytes(3).toString("hex")}`,
        jobId: input.jobId,
        clientId: user.clientId,
        ip: normalizeIp(input.ip),
        deviceLabel: input.deviceLabel || user.deviceLabel,
        fileName: (input.fileName || "document").slice(0, 220),
        fileSize: safeSize,
        mimeType: (input.mimeType || "").slice(0, 100),
        operation: input.operation || "conversion",
        status: input.status,
        pagesCount: safePages,
        wordsCount: safeWords,
        charsCount: safeChars,
        extractionMethod: input.extractionMethod || "standard",
        durationMs: safeDuration,
        ...(input.errorMessage ? { errorMessage: input.errorMessage.slice(0, 500) } : {}),
        ...(input.blockReason ? { blockReason: input.blockReason.slice(0, 500) } : {}),
        startedAt: input.startedAt || now,
        ...(input.completedAt ||
        input.status === "completed" ||
        input.status === "failed" ||
        input.status === "blocked"
          ? { completedAt: input.completedAt || now }
          : {}),
      };

      this.state.conversionLogs.unshift(event);
      if (this.state.conversionLogs.length > MAX_LOGS_COUNT) {
        this.state.conversionLogs.length = MAX_LOGS_COUNT;
      }
    }

    // Update user totals carefully (avoid double-counting when updating an existing event)
    user.lastSeenAt = now;
    user.lastActivityAt = now;
    if (event.fileName && event.status !== "blocked") {
      user.lastFileName = event.fileName;
    }

    const today = getTodayDateKey(now);
    if (!user.dailyUsage[today]) {
      user.dailyUsage[today] = { date: today, conversions: 0, pages: 0 };
    }

    const isTerminalNewStart = !previousStatus;
    if (isTerminalNewStart && input.status !== "blocked") {
      user.totalConversions += 1;
      user.dailyUsage[today].conversions += 1;
    } else if (!previousStatus && input.status === "blocked") {
      user.blockedAttempts += 1;
    }

    if (input.status === "completed" && previousStatus !== "completed") {
      user.completedConversions += 1;
      const pagesDelta = Math.max(0, event.pagesCount - previousPages);
      user.totalPagesConverted += pagesDelta || event.pagesCount;
      user.dailyUsage[today].pages += pagesDelta || event.pagesCount;
    } else if (input.status === "failed" && previousStatus !== "failed") {
      user.failedConversions += 1;
    }

    this.pruneOldDailyBuckets(user, now);
    this.saveState();
    return event;
  }

  public getSiteControls(): SiteControlsConfig {
    return this.state.siteControls;
  }

  public updateSiteControls(partial: {
    siteEnabled?: boolean;
    siteDisabledMessage?: string;
    conversionsEnabled?: boolean;
    conversionsPausedMessage?: string;
    announcementBanner?: Partial<AnnouncementBannerConfig>;
    featureFlags?: Partial<FeatureFlagsConfig>;
    globalLimits?: Partial<GlobalLimitsConfig>;
  }): SiteControlsConfig {
    const cur = this.state.siteControls;
    const next: SiteControlsConfig = {
      siteEnabled:
        typeof partial.siteEnabled === "boolean" ? partial.siteEnabled : cur.siteEnabled,
      siteDisabledMessage:
        typeof partial.siteDisabledMessage === "string"
          ? partial.siteDisabledMessage.trim() || defaultSiteControls().siteDisabledMessage
          : cur.siteDisabledMessage,
      conversionsEnabled:
        typeof partial.conversionsEnabled === "boolean"
          ? partial.conversionsEnabled
          : cur.conversionsEnabled,
      conversionsPausedMessage:
        typeof partial.conversionsPausedMessage === "string"
          ? partial.conversionsPausedMessage.trim() ||
            defaultSiteControls().conversionsPausedMessage
          : cur.conversionsPausedMessage,
      announcementBanner: {
        enabled:
          typeof partial.announcementBanner?.enabled === "boolean"
            ? partial.announcementBanner.enabled
            : cur.announcementBanner.enabled,
        text:
          typeof partial.announcementBanner?.text === "string"
            ? partial.announcementBanner.text.trim()
            : cur.announcementBanner.text,
        tone:
          partial.announcementBanner?.tone === "warning" ||
          partial.announcementBanner?.tone === "danger" ||
          partial.announcementBanner?.tone === "info"
            ? partial.announcementBanner.tone
            : cur.announcementBanner.tone,
      },
      featureFlags: {
        allowSmartCompiler:
          typeof partial.featureFlags?.allowSmartCompiler === "boolean"
            ? partial.featureFlags.allowSmartCompiler
            : cur.featureFlags.allowSmartCompiler,
        allowBackgroundJobs:
          typeof partial.featureFlags?.allowBackgroundJobs === "boolean"
            ? partial.featureFlags.allowBackgroundJobs
            : cur.featureFlags.allowBackgroundJobs,
        allowDocxExport:
          typeof partial.featureFlags?.allowDocxExport === "boolean"
            ? partial.featureFlags.allowDocxExport
            : cur.featureFlags.allowDocxExport,
        allowOcrFallback:
          typeof partial.featureFlags?.allowOcrFallback === "boolean"
            ? partial.featureFlags.allowOcrFallback
            : cur.featureFlags.allowOcrFallback,
      },
      globalLimits: {
        maxPagesPerConversion:
          partial.globalLimits?.maxPagesPerConversion !== undefined
            ? Math.max(0, Math.round(Number(partial.globalLimits.maxPagesPerConversion) || 0))
            : cur.globalLimits.maxPagesPerConversion,
        maxFileSizeMb:
          partial.globalLimits?.maxFileSizeMb !== undefined
            ? Math.max(0, Math.round(Number(partial.globalLimits.maxFileSizeMb) || 0))
            : cur.globalLimits.maxFileSizeMb,
        dailyConversionQuotaPerUser:
          partial.globalLimits?.dailyConversionQuotaPerUser !== undefined
            ? Math.max(
                0,
                Math.round(Number(partial.globalLimits.dailyConversionQuotaPerUser) || 0)
              )
            : cur.globalLimits.dailyConversionQuotaPerUser,
        dailyPageQuotaPerUser:
          partial.globalLimits?.dailyPageQuotaPerUser !== undefined
            ? Math.max(0, Math.round(Number(partial.globalLimits.dailyPageQuotaPerUser) || 0))
            : cur.globalLimits.dailyPageQuotaPerUser,
      },
      updatedAt: Date.now(),
    };

    this.state.siteControls = next;
    this.saveState();
    return next;
  }

  public updateUserControls(
    clientId: string,
    patch: {
      displayName?: string;
      adminNote?: string;
      accessMode?: UserAccessMode;
      customBlockMessage?: string;
      customDailyPageLimit?: number;
      blockMatchingIpToo?: boolean;
      resetTodayQuota?: boolean;
    }
  ): TrackedUserProfile | null {
    const cleanId = sanitizeClientId(clientId);
    if (!cleanId || !this.state.users[cleanId]) return null;
    const user = this.state.users[cleanId];

    if (typeof patch.displayName === "string") {
      user.displayName = patch.displayName.trim().slice(0, 80);
    }
    if (typeof patch.adminNote === "string") {
      user.adminNote = patch.adminNote.trim().slice(0, 300);
    }
    if (
      patch.accessMode === "active" ||
      patch.accessMode === "block_conversions" ||
      patch.accessMode === "block_site"
    ) {
      user.accessMode = patch.accessMode;
    }
    if (typeof patch.customBlockMessage === "string") {
      user.customBlockMessage = patch.customBlockMessage.trim().slice(0, 400);
    }
    if (patch.customDailyPageLimit !== undefined) {
      user.customDailyPageLimit = Math.max(
        0,
        Math.round(Number(patch.customDailyPageLimit) || 0)
      );
    }
    if (typeof patch.blockMatchingIpToo === "boolean") {
      user.blockMatchingIpToo = patch.blockMatchingIpToo;
    }
    if (patch.resetTodayQuota) {
      const today = getTodayDateKey();
      user.dailyUsage[today] = { date: today, conversions: 0, pages: 0 };
    }

    this.saveState();
    return user;
  }

  public deleteUser(clientId: string, includeLogs = false): boolean {
    const cleanId = sanitizeClientId(clientId);
    if (!cleanId || !this.state.users[cleanId]) return false;
    delete this.state.users[cleanId];
    if (includeLogs) {
      this.state.conversionLogs = this.state.conversionLogs.filter(
        (ev) => ev.clientId !== cleanId
      );
    }
    this.saveState();
    return true;
  }

  public clearLogs(clientId?: string): number {
    const before = this.state.conversionLogs.length;
    if (clientId) {
      const cleanId = sanitizeClientId(clientId);
      this.state.conversionLogs = this.state.conversionLogs.filter(
        (ev) => ev.clientId !== cleanId
      );
    } else {
      this.state.conversionLogs = [];
    }
    this.saveState();
    return Math.max(0, before - this.state.conversionLogs.length);
  }

  public getAdminOverview() {
    const today = getTodayDateKey();
    const users = Object.values(this.state.users).sort(
      (a, b) => b.lastSeenAt - a.lastSeenAt
    );
    const logs = this.state.conversionLogs;
    const activeThreshold = Date.now() - 5 * 60 * 1000;

    let totalPagesToday = 0;
    let totalConversionsToday = 0;
    for (const u of users) {
      const bucket = u.dailyUsage?.[today];
      if (bucket) {
        totalPagesToday += bucket.pages || 0;
        totalConversionsToday += bucket.conversions || 0;
      }
    }

    return {
      siteControls: this.state.siteControls,
      summary: {
        totalUsers: users.length,
        onlineRecentlyCount: users.filter((u) => u.lastSeenAt >= activeThreshold).length,
        blockedUsersCount: users.filter((u) => u.accessMode !== "active").length,
        totalConversions: logs.filter((l) => l.status !== "blocked").length,
        completedConversions: logs.filter((l) => l.status === "completed").length,
        failedConversions: logs.filter((l) => l.status === "failed").length,
        blockedAttempts: logs.filter((l) => l.status === "blocked").length,
        totalPagesConverted: logs
          .filter((l) => l.status === "completed")
          .reduce((sum, l) => sum + (l.pagesCount || 0), 0),
        todayConversions: totalConversionsToday,
        todayPages: totalPagesToday,
      },
      users: users.map((u) => ({
        ...u,
        todayConversions: u.dailyUsage?.[today]?.conversions || 0,
        todayPages: u.dailyUsage?.[today]?.pages || 0,
      })),
      logs,
    };
  }
}

function setClientIdCookie(res: Response, req: Request, clientId: string): void {
  const protoHeader = req.headers["x-forwarded-proto"];
  const isHttps =
    req.secure ||
    (typeof protoHeader === "string" && protoHeader.toLowerCase().includes("https"));
  const maxAge = 365 * 24 * 60 * 60;
  const parts = [
    `${CLIENT_ID_COOKIE_NAME}=${encodeURIComponent(clientId)}`,
    "Path=/",
    `Max-Age=${maxAge}`,
    "HttpOnly",
    isHttps ? "SameSite=None" : "SameSite=Lax",
  ];
  if (isHttps) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

function resolveActionForApiRequest(
  req: Request
): { action: GovernanceAction; isFileUploadCheck?: boolean } | null {
  const fullPath = req.originalUrl.split("?")[0];
  const method = req.method.toUpperCase();

  if (fullPath === "/api/extract-direct-pdf" && method === "POST") {
    return { action: "convert" };
  }
  if (fullPath === "/api/convert-pdf" && method === "POST") {
    return { action: "ocr" };
  }
  if (fullPath === "/api/jobs" && method === "POST") {
    return { action: "background_job", isFileUploadCheck: true };
  }
  if (/^\/api\/jobs\/[^/]+\/resume$/.test(fullPath) && method === "POST") {
    return { action: "background_job" };
  }
  if (
    fullPath === "/api/export-docx" ||
    /^\/api\/jobs\/[^/]+\/download-docx$/.test(fullPath)
  ) {
    return { action: "docx_export" };
  }
  if (fullPath.startsWith("/api/compiler/")) {
    return { action: "smart_compiler" };
  }
  if (
    fullPath === "/api/contextual-check" ||
    fullPath === "/api/grammar-syntax-check"
  ) {
    return { action: "convert" };
  }
  return null;
}

export function registerGovernanceRoutes(
  app: Express,
  projectRoot: string
): GovernanceManager {
  const manager = new GovernanceManager(projectRoot);

  // Public Client Policy & Identity Handshake
  app.get("/api/client/policy", (req: Request, res: Response) => {
    const identity = manager.extractClientIdentity(req);
    manager.touchUser(identity, true);
    const cookies = parseCookies(req.headers.cookie);
    if (!cookies[CLIENT_ID_COOKIE_NAME] || cookies[CLIENT_ID_COOKIE_NAME] !== identity.clientId) {
      setClientIdCookie(res, req, identity.clientId);
    }
    const policy = manager.evaluatePolicy(identity);
    return res.json({
      success: true,
      policy,
    });
  });

  // Client Telemetry Reporting (called by browser conversion pipeline)
  app.post("/api/client/telemetry", (req: Request, res: Response) => {
    const identity = manager.extractClientIdentity(req);
    const body = (req.body || {}) as Record<string, unknown>;
    const allowedStatuses = new Set<ConversionStatus>([
      "started",
      "processing",
      "completed",
      "paused",
      "failed",
      "blocked",
    ]);
    const statusRaw = String(body.status || "started") as ConversionStatus;
    const status: ConversionStatus = allowedStatuses.has(statusRaw)
      ? statusRaw
      : "started";

    const event = manager.recordConversionEvent({
      id: typeof body.eventId === "string" ? body.eventId.slice(0, 80) : undefined,
      jobId: typeof body.jobId === "string" ? body.jobId.slice(0, 80) : undefined,
      clientId: identity.clientId,
      ip: identity.ip,
      deviceLabel: identity.deviceLabel,
      fileName: typeof body.fileName === "string" ? body.fileName : "document",
      fileSize: Number(body.fileSize) || 0,
      mimeType: typeof body.mimeType === "string" ? body.mimeType : "",
      operation: typeof body.operation === "string" ? body.operation : "client-pipeline",
      status,
      pagesCount: Number(body.pagesCount) || 0,
      wordsCount: Number(body.wordsCount) || 0,
      charsCount: Number(body.charsCount) || 0,
      extractionMethod:
        typeof body.extractionMethod === "string" ? body.extractionMethod : "client",
      durationMs: Number(body.durationMs) || 0,
      errorMessage:
        typeof body.errorMessage === "string" ? body.errorMessage : undefined,
      blockReason:
        typeof body.blockReason === "string" ? body.blockReason : undefined,
      startedAt: Number(body.startedAt) || undefined,
      completedAt: Number(body.completedAt) || undefined,
    });

    return res.json({
      success: true,
      eventId: event.id,
      policy: manager.evaluatePolicy(identity),
    });
  });

  // Enforcement Middleware across API routes (Admin / Auth / Health / Policy exempt)
  app.use("/api", (req: Request, res: Response, next: NextFunction) => {
    if (req.method === "OPTIONS") return next();
    const resolved = resolveActionForApiRequest(req);
    if (!resolved) return next();

    const identity = manager.extractClientIdentity(req);
    const contentLength = Number(req.headers["content-length"] || 0);
    const bodyFileSize =
      typeof req.body?.pdfBase64 === "string"
        ? Math.round((req.body.pdfBase64.length * 3) / 4)
        : contentLength > 0
        ? contentLength
        : undefined;

    const authz = manager.checkActionAllowed(identity, resolved.action, {
      fileSizeBytes: bodyFileSize,
      fileName:
        typeof req.body?.filename === "string"
          ? req.body.filename
          : typeof req.body?.fileName === "string"
          ? req.body.fileName
          : undefined,
      operation: resolved.action,
    });

    if (!authz.allowed) {
      return res.status(authz.status).json({
        success: false,
        blocked: true,
        blockScope: authz.blockScope,
        error: authz.error,
      });
    }

    next();
  });

  // Admin Overview, Controls, Users & Logs APIs (/api/admin/*)
  app.get("/api/admin/overview", (_req: Request, res: Response) => {
    const overview = manager.getAdminOverview();
    return res.json({
      success: true,
      ...overview,
    });
  });

  app.post("/api/admin/controls", (req: Request, res: Response) => {
    try {
      const updated = manager.updateSiteControls(req.body || {});
      return res.json({
        success: true,
        siteControls: updated,
      });
    } catch (err: any) {
      return res.status(400).json({
        success: false,
        error: err?.message || "تعذر حفظ إعدادات التحكم.",
      });
    }
  });

  app.patch("/api/admin/users/:clientId", (req: Request, res: Response) => {
    const updated = manager.updateUserControls(req.params.clientId, req.body || {});
    if (!updated) {
      return res.status(404).json({
        success: false,
        error: "المستخدم غير موجود في السجل.",
      });
    }
    return res.json({
      success: true,
      user: updated,
    });
  });

  app.delete("/api/admin/users/:clientId", (req: Request, res: Response) => {
    const includeLogs = req.query.includeLogs === "1" || req.query.includeLogs === "true";
    const deleted = manager.deleteUser(req.params.clientId, includeLogs);
    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: "المستخدم غير موجود.",
      });
    }
    return res.json({ success: true });
  });

  app.delete("/api/admin/logs", (req: Request, res: Response) => {
    const clientId =
      typeof req.query.clientId === "string" ? req.query.clientId : undefined;
    const removedCount = manager.clearLogs(clientId);
    return res.json({
      success: true,
      removedCount,
    });
  });

  return manager;
}
