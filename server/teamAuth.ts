import fs from "fs";
import path from "path";
import crypto from "crypto";
import type { Express, NextFunction, Request, Response } from "express";

export const TEAM_COOKIE_NAME = "studio_team_session";
export const TEAM_HEADER_NAME = "x-team-session";

interface PersistedTeamAuthConfig {
  enabled: boolean;
  codeHash: string;
  codeSalt: string;
  sessionEpoch: number;
  updatedAt: number;
}

interface TokenPayload {
  v: 1;
  epoch: number;
  iat: number;
  exp: number;
}

interface FailedAttemptBucket {
  count: number;
  lockedUntil: number;
  firstAttemptAt: number;
}

function hashPasscode(code: string, salt: string): string {
  return crypto.scryptSync(code, salt, 32).toString("hex");
}

function timingSafeEqualHex(aHex: string, bHex: string): boolean {
  try {
    const a = Buffer.from(aHex, "hex");
    const b = Buffer.from(bHex, "hex");
    if (a.length === 0 || a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function timingSafeEqualUtf8(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
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

export class TeamAuthManager {
  private readonly storageDir: string;
  private readonly configPath: string;
  private readonly secretPath: string;
  private readonly signingSecret: Buffer;
  private config: PersistedTeamAuthConfig;
  private readonly attemptsByIp = new Map<string, FailedAttemptBucket>();

  constructor(projectRoot: string) {
    this.storageDir = path.join(projectRoot, ".jobs");
    fs.mkdirSync(this.storageDir, { recursive: true });
    this.configPath = path.join(this.storageDir, "team_auth.json");
    this.secretPath = path.join(this.storageDir, ".auth_secret");
    this.signingSecret = this.loadOrCreateSigningSecret();
    this.config = this.loadConfig();
  }

  private loadOrCreateSigningSecret(): Buffer {
    try {
      if (fs.existsSync(this.secretPath)) {
        const raw = fs.readFileSync(this.secretPath, "utf-8").trim();
        if (raw.length >= 32) {
          return Buffer.from(raw, "hex");
        }
      }
    } catch {}
    const generated = crypto.randomBytes(32);
    try {
      fs.writeFileSync(this.secretPath, generated.toString("hex"), { mode: 0o600 });
    } catch {}
    return generated;
  }

  private loadConfig(): PersistedTeamAuthConfig {
    try {
      if (fs.existsSync(this.configPath)) {
        const parsed = JSON.parse(fs.readFileSync(this.configPath, "utf-8"));
        return {
          enabled: Boolean(parsed.enabled),
          codeHash: typeof parsed.codeHash === "string" ? parsed.codeHash : "",
          codeSalt: typeof parsed.codeSalt === "string" ? parsed.codeSalt : "",
          sessionEpoch: Number.isFinite(parsed.sessionEpoch) ? Number(parsed.sessionEpoch) : 1,
          updatedAt: Number.isFinite(parsed.updatedAt) ? Number(parsed.updatedAt) : Date.now(),
        };
      }
    } catch {}
    return {
      enabled: false,
      codeHash: "",
      codeSalt: "",
      sessionEpoch: 1,
      updatedAt: Date.now(),
    };
  }

  private saveConfig(): void {
    const tmp = `${this.configPath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.config, null, 2), "utf-8");
    fs.renameSync(tmp, this.configPath);
  }

  private getEnvPasscode(): string {
    return (process.env.TEAM_ACCESS_CODE || "").trim();
  }

  public isEnvManaged(): boolean {
    return this.getEnvPasscode().length > 0;
  }

  public isLockEnabled(): boolean {
    if (this.isEnvManaged()) return true;
    return Boolean(this.config.enabled && this.config.codeHash && this.config.codeSalt);
  }

  public getStatusSummary() {
    return {
      lockEnabled: this.isLockEnabled(),
      envManaged: this.isEnvManaged(),
      hasPasscodeConfigured: this.isEnvManaged() || Boolean(this.config.codeHash),
      sessionEpoch: this.config.sessionEpoch,
      updatedAt: this.config.updatedAt,
    };
  }

  public verifyPasscode(candidate: string): boolean {
    const trimmed = (candidate || "").trim();
    if (!trimmed) return false;
    const envCode = this.getEnvPasscode();
    if (envCode) {
      return timingSafeEqualUtf8(trimmed, envCode);
    }
    if (!this.config.codeHash || !this.config.codeSalt) {
      return false;
    }
    const candidateHash = hashPasscode(trimmed, this.config.codeSalt);
    return timingSafeEqualHex(candidateHash, this.config.codeHash);
  }

  private deriveSigningKey(): Buffer {
    const envCode = this.getEnvPasscode();
    return crypto
      .createHmac("sha256", this.signingSecret)
      .update(`epoch:${this.config.sessionEpoch}|env:${envCode}`)
      .digest();
  }

  public signSessionToken(ttlDays: number = 30): string {
    const now = Date.now();
    const payload: TokenPayload = {
      v: 1,
      epoch: this.config.sessionEpoch,
      iat: now,
      exp: now + Math.max(1, ttlDays) * 24 * 60 * 60 * 1000,
    };
    const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
    const sig = crypto
      .createHmac("sha256", this.deriveSigningKey())
      .update(encoded)
      .digest("base64url");
    return `${encoded}.${sig}`;
  }

  public verifySessionToken(token: string | undefined): boolean {
    if (!token || typeof token !== "string") return false;
    const parts = token.split(".");
    if (parts.length !== 2) return false;
    const [encoded, sig] = parts;
    if (!encoded || !sig) return false;
    const expectedSig = crypto
      .createHmac("sha256", this.deriveSigningKey())
      .update(encoded)
      .digest("base64url");
    if (!timingSafeEqualUtf8(sig, expectedSig)) return false;

    try {
      const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as TokenPayload;
      if (payload.v !== 1) return false;
      if (payload.epoch !== this.config.sessionEpoch) return false;
      if (typeof payload.exp !== "number" || Date.now() > payload.exp) return false;
      return true;
    } catch {
      return false;
    }
  }

  public extractTokenFromRequest(req: Request): string | undefined {
    const headerVal = req.headers[TEAM_HEADER_NAME];
    if (typeof headerVal === "string" && headerVal.trim()) {
      return headerVal.trim();
    }
    const authHeader = req.headers.authorization;
    if (typeof authHeader === "string" && authHeader.toLowerCase().startsWith("bearer ")) {
      const bearer = authHeader.slice(7).trim();
      if (bearer.includes(".")) return bearer;
    }
    const cookies = parseCookies(req.headers.cookie);
    if (cookies[TEAM_COOKIE_NAME]) {
      return cookies[TEAM_COOKIE_NAME];
    }
    return undefined;
  }

  public isRequestAuthenticated(req: Request): boolean {
    if (!this.isLockEnabled()) return true;
    const token = this.extractTokenFromRequest(req);
    return this.verifySessionToken(token);
  }

  public updateConfig(opts: { enabled?: boolean; newCode?: string; bumpEpoch?: boolean }) {
    if (this.isEnvManaged()) {
      throw new Error("قفل الفريق مُدار حالياً عبر متغير البيئة TEAM_ACCESS_CODE ولا يمكن تعديله من الواجهة.");
    }
    if (typeof opts.newCode === "string" && opts.newCode.trim().length > 0) {
      const clean = opts.newCode.trim();
      if (clean.length < 4 || clean.length > 64) {
        throw new Error("يجب أن يتراوح طول رمز دخول الفريق بين 4 و 64 حرفاً أو رقماً.");
      }
      const salt = crypto.randomBytes(16).toString("hex");
      this.config.codeSalt = salt;
      this.config.codeHash = hashPasscode(clean, salt);
      this.config.enabled = opts.enabled !== undefined ? Boolean(opts.enabled) : true;
      this.config.sessionEpoch += 1;
    } else if (typeof opts.enabled === "boolean") {
      if (opts.enabled && !this.config.codeHash) {
        throw new Error("يرجى تعيين رمز دخول للفريق قبل تفعيل القفل.");
      }
      this.config.enabled = opts.enabled;
      if (opts.bumpEpoch) {
        this.config.sessionEpoch += 1;
      }
    } else if (opts.bumpEpoch) {
      this.config.sessionEpoch += 1;
    }

    this.config.updatedAt = Date.now();
    this.saveConfig();
  }

  public revokeAllSessions(): void {
    this.config.sessionEpoch += 1;
    this.config.updatedAt = Date.now();
    this.saveConfig();
  }

  public checkRateLimit(ip: string): { allowed: boolean; retryAfterSeconds: number } {
    const key = ip || "unknown";
    const now = Date.now();
    const bucket = this.attemptsByIp.get(key);
    if (!bucket) return { allowed: true, retryAfterSeconds: 0 };
    if (bucket.lockedUntil > now) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((bucket.lockedUntil - now) / 1000)),
      };
    }
    if (now - bucket.firstAttemptAt > 10 * 60 * 1000) {
      this.attemptsByIp.delete(key);
    }
    return { allowed: true, retryAfterSeconds: 0 };
  }

  public recordFailedAttempt(ip: string): void {
    const key = ip || "unknown";
    const now = Date.now();
    const existing = this.attemptsByIp.get(key);
    if (!existing || now - existing.firstAttemptAt > 10 * 60 * 1000) {
      this.attemptsByIp.set(key, { count: 1, lockedUntil: 0, firstAttemptAt: now });
      return;
    }
    existing.count += 1;
    if (existing.count >= 8) {
      existing.lockedUntil = now + 5 * 60 * 1000;
    }
  }

  public clearFailedAttempts(ip: string): void {
    this.attemptsByIp.delete(ip || "unknown");
  }
}

export function resolvePublicUrlInfo(req: Request): {
  currentOrigin: string;
  sharedPublicOrigin: string;
  isDevPreviewHost: boolean;
} {
  const forwardedHost = req.headers["x-forwarded-host"];
  const host =
    typeof forwardedHost === "string"
      ? forwardedHost.split(",")[0].trim()
      : req.get("host") || "localhost:3000";
  const protoHeader = req.headers["x-forwarded-proto"];
  const isLocal =
    host.includes("localhost") || host.includes("127.0.0.1") || host.includes("0.0.0.0");
  const proto =
    typeof protoHeader === "string"
      ? protoHeader.split(",")[0].trim()
      : isLocal
      ? "http"
      : "https";

  const currentOrigin = `${proto}://${host}`;
  const isDevPreviewHost = /^ais-dev-/i.test(host);
  let sharedPublicOrigin = currentOrigin;
  if (isDevPreviewHost) {
    sharedPublicOrigin = `${proto}://${host.replace(/^ais-dev-/i, "ais-pre-")}`;
  } else if (isLocal && process.env.CONVERTER_SERVER_URL) {
    sharedPublicOrigin = process.env.CONVERTER_SERVER_URL.replace(/\/+$/, "");
  }

  return {
    currentOrigin,
    sharedPublicOrigin,
    isDevPreviewHost,
  };
}

function setSessionCookie(res: Response, req: Request, token: string, ttlDays: number): void {
  const protoHeader = req.headers["x-forwarded-proto"];
  const isHttps =
    req.secure ||
    (typeof protoHeader === "string" && protoHeader.toLowerCase().includes("https"));
  const maxAge = Math.max(1, ttlDays) * 24 * 60 * 60;
  const parts = [
    `${TEAM_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    `Max-Age=${maxAge}`,
    "HttpOnly",
    isHttps ? "SameSite=None" : "SameSite=Lax",
  ];
  if (isHttps) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

function clearSessionCookie(res: Response, req: Request): void {
  const protoHeader = req.headers["x-forwarded-proto"];
  const isHttps =
    req.secure ||
    (typeof protoHeader === "string" && protoHeader.toLowerCase().includes("https"));
  const parts = [
    `${TEAM_COOKIE_NAME}=`,
    "Path=/",
    "Max-Age=0",
    "HttpOnly",
    isHttps ? "SameSite=None" : "SameSite=Lax",
  ];
  if (isHttps) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

const PUBLIC_AUTH_EXEMPT_PATHS = new Set([
  "/api/health",
  "/api/ping",
  "/api/info",
  "/api/auth/status",
  "/api/auth/verify",
  "/api/auth/logout",
]);

export function registerTeamAuth(app: Express, projectRoot: string): TeamAuthManager {
  const manager = new TeamAuthManager(projectRoot);

  app.get("/api/auth/status", (req: Request, res: Response) => {
    const urls = resolvePublicUrlInfo(req);
    const summary = manager.getStatusSummary();
    res.json({
      success: true,
      ...summary,
      authenticated: manager.isRequestAuthenticated(req),
      ...urls,
    });
  });

  app.post("/api/auth/verify", (req: Request, res: Response) => {
    const clientIp =
      (typeof req.headers["x-forwarded-for"] === "string"
        ? req.headers["x-forwarded-for"].split(",")[0].trim()
        : "") ||
      req.ip ||
      "unknown";

    const limit = manager.checkRateLimit(clientIp);
    if (!limit.allowed) {
      return res.status(429).json({
        success: false,
        error: `تم تجاوز عدد المحاولات المسموح به. يرجى المحاولة بعد ${limit.retryAfterSeconds} ثانية.`,
        retryAfterSeconds: limit.retryAfterSeconds,
      });
    }

    const { code, rememberDevice } = (req.body || {}) as {
      code?: string;
      rememberDevice?: boolean;
    };

    if (!manager.isLockEnabled()) {
      const token = manager.signSessionToken(30);
      setSessionCookie(res, req, token, 30);
      return res.json({
        success: true,
        authenticated: true,
        sessionToken: token,
      });
    }

    if (!manager.verifyPasscode(code || "")) {
      manager.recordFailedAttempt(clientIp);
      return res.status(401).json({
        success: false,
        error: "رمز دخول الفريق غير صحيح. تأكد من الرمز وأعد المحاولة.",
      });
    }

    manager.clearFailedAttempts(clientIp);
    const ttlDays = rememberDevice === false ? 1 : 30;
    const token = manager.signSessionToken(ttlDays);
    setSessionCookie(res, req, token, ttlDays);

    return res.json({
      success: true,
      authenticated: true,
      sessionToken: token,
      expiresInDays: ttlDays,
    });
  });

  app.post("/api/auth/logout", (req: Request, res: Response) => {
    clearSessionCookie(res, req);
    res.json({ success: true });
  });

  app.post("/api/auth/config", (req: Request, res: Response) => {
    if (!manager.isRequestAuthenticated(req)) {
      return res.status(401).json({
        success: false,
        authRequired: true,
        error: "يجب التحقق برمز دخول الفريق أولاً لتعديل إعدادات القفل.",
      });
    }

    try {
      const { enabled, newCode } = (req.body || {}) as {
        enabled?: boolean;
        newCode?: string;
      };
      manager.updateConfig({ enabled, newCode });

      let sessionToken: string | undefined;
      if (manager.isLockEnabled()) {
        sessionToken = manager.signSessionToken(30);
        setSessionCookie(res, req, sessionToken, 30);
      } else {
        clearSessionCookie(res, req);
      }

      return res.json({
        success: true,
        ...manager.getStatusSummary(),
        authenticated: true,
        sessionToken,
      });
    } catch (err: any) {
      return res.status(400).json({
        success: false,
        error: err?.message || "تعذر تحديث إعدادات رمز الفريق.",
      });
    }
  });

  app.post("/api/auth/revoke-all", (req: Request, res: Response) => {
    if (!manager.isRequestAuthenticated(req)) {
      return res.status(401).json({
        success: false,
        authRequired: true,
        error: "غير مصرح.",
      });
    }
    manager.revokeAllSessions();
    const sessionToken = manager.isLockEnabled() ? manager.signSessionToken(30) : undefined;
    if (sessionToken) {
      setSessionCookie(res, req, sessionToken, 30);
    }
    return res.json({
      success: true,
      ...manager.getStatusSummary(),
      authenticated: true,
      sessionToken,
    });
  });

  // Protect all remaining /api/* routes when Team Lock is enabled
  app.use("/api", (req: Request, res: Response, next: NextFunction) => {
    if (req.method === "OPTIONS") return next();
    const fullPath = req.originalUrl.split("?")[0];
    if (PUBLIC_AUTH_EXEMPT_PATHS.has(fullPath)) return next();
    if (!manager.isLockEnabled()) return next();
    if (manager.isRequestAuthenticated(req)) return next();

    return res.status(401).json({
      success: false,
      authRequired: true,
      error: "مطلوب رمز دخول الفريق للوصول إلى هذه الخدمة.",
    });
  });

  return manager;
}
