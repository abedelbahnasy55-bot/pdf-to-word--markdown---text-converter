import type { Express, Request, Response } from "express";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";

/**
 * Deprecated or non-text / paid-only families that MUST stay excluded
 * from the 100% free-tier high-throughput rotation pool.
 */
const BANNED_DEPRECATED_PATTERNS = [
  /^gemini-1\./i,
  /^gemini-2\.0/i,
  /^gemini-pro$/i,
];

const EXCLUDED_PAID_OR_SPECIALTY_PATTERNS = [
  /carbon/i,
  /argon/i,
  /image/i,
  /nano-banana/i,
  /omni/i,
  /lyria/i,
  /embedding/i,
  /decision/i,
  /imagen/i,
  /\bveo\b/i,
  /transcribe/i,
  /-live\b/i,
  /-tts\b/i,
  /\baqa\b/i,
  /robotics/i,
  /computer-use/i,
  /deep-research/i,
];

/**
 * Curated priority ordering among candidate free-tier text/multimodal models.
 * Lower index = higher priority when equally healthy, while round-robin rotates across all healthy entries.
 */
const PREFERRED_FREE_RANK: string[] = [
  "gemini-4-hydrogen",
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3.1-flash",
  "gemini-3-flash",
  "gemini-3-flash-preview",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
];

export type ModelHealthStatus =
  | "verified_free"
  | "candidate"
  | "cooldown"
  | "daily_exhausted"
  | "paid_required"
  | "unavailable";

export interface ManagedModelEntry {
  id: string;
  displayName: string;
  status: ModelHealthStatus;
  supportsThinkingLevel: boolean;
  cooldownUntil: number | null;
  lastVerifiedAt: number | null;
  lastError: string | null;
  successCount: number;
  errorCount: number;
}

export function normalizeModelId(rawName: string): string {
  return (rawName || "").replace(/^models\//i, "").trim();
}

export function supportsThinkingLevel(modelId: string): boolean {
  const id = normalizeModelId(modelId).toLowerCase();
  return id.startsWith("gemini-3") || id.startsWith("gemini-4");
}

const modelsRequiringLowThinking = new Set<string>();

export function buildSafeThinkingConfig(modelId: string): Record<string, any> {
  const id = normalizeModelId(modelId).toLowerCase();
  if (!supportsThinkingLevel(id)) {
    return {};
  }
  if (
    id.includes("hydrogen") ||
    id.startsWith("gemini-4") ||
    id.startsWith("gemini-3.8") ||
    id.startsWith("gemini-3.7") ||
    modelsRequiringLowThinking.has(id)
  ) {
    return { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } };
  }
  return { thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL } };
}

export function isEligibleFreeCandidate(modelId: string, supportedActions?: string[]): boolean {
  const id = normalizeModelId(modelId);
  if (!id) return false;
  if (Array.isArray(supportedActions) && supportedActions.length > 0) {
    const canGenerate = supportedActions.some(
      (a) => a === "generateContent" || a === "streamGenerateContent"
    );
    if (!canGenerate) return false;
  }
  if (BANNED_DEPRECATED_PATTERNS.some((re) => re.test(id))) return false;
  if (EXCLUDED_PAID_OR_SPECIALTY_PATTERNS.some((re) => re.test(id))) return false;

  // Exclude standalone Pro tiers unless explicitly requested; keep Flash / Hydrogen / Flash-Lite workhorses
  if (/\bpro\b/i.test(id) && !/flash/i.test(id)) return false;

  return /(hydrogen|flash|lite)/i.test(id);
}

function rankModelId(id: string): number {
  const idx = PREFERRED_FREE_RANK.indexOf(id);
  if (idx !== -1) return idx;
  if (id.startsWith("gemini-4")) return 50;
  if (id.startsWith("gemini-3") && id.includes("flash") && !id.includes("lite")) return 60;
  if (id.startsWith("gemini-3") && id.includes("lite")) return 70;
  if (id.startsWith("gemini-2.5") && id.includes("flash")) return 80;
  return 100;
}

export class ModelPoolManager {
  private readonly entries = new Map<string, ManagedModelEntry>();
  private rrCursor = 0;
  private lastRefreshedAt: number | null = null;
  private isRefreshing = false;
  private refreshPromise: Promise<ManagedModelEntry[]> | null = null;

  constructor() {
    // Seed immediately with guaranteed SDK baseline free-tier pair
    for (const baseId of ["gemini-4-hydrogen", "gemini-3.1-flash-lite"]) {
      this.entries.set(baseId, {
        id: baseId,
        displayName: baseId,
        status: "candidate",
        supportsThinkingLevel: supportsThinkingLevel(baseId),
        cooldownUntil: null,
        lastVerifiedAt: null,
        lastError: null,
        successCount: 0,
        errorCount: 0,
      });
    }
  }

  private ensureEntry(modelId: string, displayName?: string): ManagedModelEntry {
    const id = normalizeModelId(modelId);
    const existing = this.entries.get(id);
    if (existing) {
      if (displayName && !existing.displayName) existing.displayName = displayName;
      return existing;
    }
    const created: ManagedModelEntry = {
      id,
      displayName: displayName || id,
      status: "candidate",
      supportsThinkingLevel: supportsThinkingLevel(id),
      cooldownUntil: null,
      lastVerifiedAt: null,
      lastError: null,
      successCount: 0,
      errorCount: 0,
    };
    this.entries.set(id, created);
    return created;
  }

  public classifyAndRecordError(modelId: string, error: unknown): {
    kind: "not_found" | "paid_required" | "quota_daily" | "quota_minute" | "busy" | "transient";
    retryAfterSeconds: number;
  } {
    const id = normalizeModelId(modelId);
    const entry = this.ensureEntry(id);
    const msg = String((error as any)?.message || error || "");
    const lower = msg.toLowerCase();
    const now = Date.now();

    let retryAfterSeconds = 12;
    const match = msg.match(/retry in ([0-9.]+)s/i) || msg.match(/retryDelay"?:\s*"(\d+)s"/i);
    if (match) {
      retryAfterSeconds = Math.max(5, Math.ceil(parseFloat(match[1])));
    }

    entry.errorCount += 1;
    entry.lastError = msg.slice(0, 220);

    if (
      msg.includes("404") ||
      lower.includes("not found") ||
      lower.includes("is not supported") ||
      lower.includes("no longer available")
    ) {
      entry.status = "unavailable";
      entry.cooldownUntil = now + 30 * 60 * 1000;
      return { kind: "not_found", retryAfterSeconds: 1800 };
    }

    if (
      lower.includes("paid") ||
      lower.includes("billing") ||
      (msg.includes("403") && lower.includes("permission")) ||
      lower.includes("limit: 0")
    ) {
      entry.status = "paid_required";
      entry.cooldownUntil = now + 60 * 60 * 1000;
      return { kind: "paid_required", retryAfterSeconds: 3600 };
    }

    if (lower.includes("perday") || lower.includes("requests_per_day") || lower.includes("daily")) {
      const waitSec = Math.max(retryAfterSeconds, 3600);
      entry.status = "daily_exhausted";
      entry.cooldownUntil = now + waitSec * 1000;
      return { kind: "quota_daily", retryAfterSeconds: waitSec };
    }

    if (msg.includes("429") || lower.includes("resource_exhausted") || lower.includes("quota") || lower.includes("rate limit")) {
      const waitSec = Math.min(65, Math.max(8, retryAfterSeconds + 2));
      entry.status = "cooldown";
      entry.cooldownUntil = now + waitSec * 1000;
      return { kind: "quota_minute", retryAfterSeconds: waitSec };
    }

    if (msg.includes("503") || lower.includes("unavailable") || lower.includes("high demand")) {
      entry.status = "cooldown";
      entry.cooldownUntil = now + 45 * 1000;
      return { kind: "busy", retryAfterSeconds: 45 };
    }

    entry.cooldownUntil = now + 8 * 1000;
    return { kind: "transient", retryAfterSeconds: 8 };
  }

  public recordSuccess(modelId: string): void {
    const id = normalizeModelId(modelId);
    const entry = this.ensureEntry(id);
    entry.status = "verified_free";
    entry.cooldownUntil = null;
    entry.lastVerifiedAt = Date.now();
    entry.lastError = null;
    entry.successCount += 1;
  }

  /**
   * Returns ordered candidate models for the next request using true round-robin across ready healthy models,
   * followed by soonest-recovering cooldown models so calls never stall unnecessarily.
   */
  public getCandidateModels(): string[] {
    const now = Date.now();
    const active: ManagedModelEntry[] = [];
    const cooling: ManagedModelEntry[] = [];

    for (const entry of this.entries.values()) {
      if (entry.status === "paid_required" || entry.status === "unavailable") {
        // Re-check unavailable/paid models only after their long cooldown expires
        if (entry.cooldownUntil && entry.cooldownUntil <= now) {
          entry.status = "candidate";
          entry.cooldownUntil = null;
        } else {
          continue;
        }
      }

      if (entry.cooldownUntil && entry.cooldownUntil > now) {
        cooling.push(entry);
        continue;
      }

      if (entry.status === "cooldown" || entry.status === "daily_exhausted") {
        entry.status = "verified_free";
        entry.cooldownUntil = null;
      }
      active.push(entry);
    }

    active.sort((a, b) => {
      // Verified active models ahead of unprobed candidates
      const statusScoreA = a.status === "verified_free" ? 0 : 1;
      const statusScoreB = b.status === "verified_free" ? 0 : 1;
      if (statusScoreA !== statusScoreB) return statusScoreA - statusScoreB;
      return rankModelId(a.id) - rankModelId(b.id);
    });

    if (active.length > 0) {
      const rotated = active.map((_, i) => active[(this.rrCursor + i) % active.length].id);
      this.rrCursor = (this.rrCursor + 1) % active.length;
      if (cooling.length > 0) {
        cooling.sort((a, b) => (a.cooldownUntil || 0) - (b.cooldownUntil || 0));
        return [...rotated, ...cooling.map((c) => c.id)];
      }
      return rotated;
    }

    if (cooling.length > 0) {
      cooling.sort((a, b) => (a.cooldownUntil || 0) - (b.cooldownUntil || 0));
      return cooling.map((c) => c.id);
    }

    return ["gemini-4-hydrogen", "gemini-3.1-flash-lite"];
  }

  public getEarliestReadyWaitMs(): number {
    const now = Date.now();
    const waitTimes: number[] = [];
    for (const entry of this.entries.values()) {
      if (entry.status === "paid_required" || entry.status === "unavailable") continue;
      if (!entry.cooldownUntil || entry.cooldownUntil <= now) return 0;
      waitTimes.push(entry.cooldownUntil - now);
    }
    return waitTimes.length > 0 ? Math.min(...waitTimes) : 0;
  }

  private async probeSingleModel(ai: GoogleGenAI, id: string): Promise<void> {
    const entry = this.ensureEntry(id);
    const runProbeAttempt = async (thinkingOverride?: Record<string, any>) => {
      let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
      try {
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutHandle = setTimeout(() => reject(new Error(`Probe timeout for ${id}`)), 12000);
        });
        const callPromise = ai.models.generateContent({
          model: id,
          contents: "1",
          config: {
            ...(thinkingOverride ?? buildSafeThinkingConfig(id)),
            maxOutputTokens: 4,
          },
        });
        return await Promise.race([callPromise, timeoutPromise]);
      } finally {
        if (timeoutHandle) clearTimeout(timeoutHandle);
      }
    };

    try {
      let res = await runProbeAttempt().catch(async (err) => {
        const msg = String((err as any)?.message || err || "").toLowerCase();
        if (msg.includes("thinking level") && msg.includes("minimal") && msg.includes("not supported")) {
          modelsRequiringLowThinking.add(id.toLowerCase());
          return await runProbeAttempt({ thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } });
        }
        throw err;
      });
      if (typeof res?.text === "string") {
        entry.status = "verified_free";
        entry.cooldownUntil = null;
        entry.lastVerifiedAt = Date.now();
        entry.lastError = null;
      }
    } catch (err) {
      this.classifyAndRecordError(id, err);
    }
  }

  /**
   * Queries live Gemini catalog via ai.models.list(), discovers eligible Flash/Hydrogen/Lite models,
   * and probes a bounded batch to promote verified free-tier models into rotation.
   */
  public async discoverAndVerify(
    ai: GoogleGenAI,
    opts: { probeActive?: boolean } = {}
  ): Promise<ManagedModelEntry[]> {
    if (this.refreshPromise) return this.refreshPromise;

    this.isRefreshing = true;
    this.refreshPromise = (async () => {
      try {
        const discoveredIds: string[] = [];
        try {
          const pager = await ai.models.list({ config: { pageSize: 100 } });
          for await (const m of pager) {
            const rawName = m?.name || "";
            const normalized = normalizeModelId(rawName);
            const actions = Array.isArray((m as any)?.supportedActions)
              ? ((m as any).supportedActions as string[])
              : Array.isArray((m as any)?.supportedGenerationMethods)
              ? ((m as any).supportedGenerationMethods as string[])
              : undefined;
            if (isEligibleFreeCandidate(normalized, actions)) {
              discoveredIds.push(normalized);
              this.ensureEntry(normalized, (m as any)?.displayName || normalized);
            }
          }
        } catch (listErr: any) {
          console.warn("[ModelPool] models.list catalog check skipped:", listErr?.message || listErr);
        }

        // Also seed canonical expected versions if API key exists and user wants live check
        if (opts.probeActive !== false && process.env.GEMINI_API_KEY) {
          const toProbe = Array.from(
            new Set([
              ...discoveredIds,
              ...Array.from(this.entries.keys()),
            ])
          )
            .filter((id) => {
              if (!isEligibleFreeCandidate(id)) return false;
              const e = this.entries.get(id);
              return !e || e.status === "candidate" || !e.lastVerifiedAt;
            })
            .sort((a, b) => rankModelId(a) - rankModelId(b))
            .slice(0, 14);

          for (let i = 0; i < toProbe.length; i += 3) {
            const slice = toProbe.slice(i, i + 3);
            await Promise.all(slice.map((id) => this.probeSingleModel(ai, id)));
          }
        }

        this.lastRefreshedAt = Date.now();
        return this.getSnapshot().models;
      } finally {
        this.isRefreshing = false;
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  public getSnapshot() {
    const now = Date.now();
    const list = Array.from(this.entries.values())
      .map((e) => ({
        ...e,
        cooldownRemainingSec:
          e.cooldownUntil && e.cooldownUntil > now
            ? Math.ceil((e.cooldownUntil - now) / 1000)
            : 0,
      }))
      .sort((a, b) => rankModelId(a.id) - rankModelId(b.id));

    const activeCount = list.filter(
      (m) => m.status === "verified_free" || m.status === "candidate"
    ).length;

    return {
      lastRefreshedAt: this.lastRefreshedAt,
      isRefreshing: this.isRefreshing,
      activeCount,
      models: list,
    };
  }
}

export const sharedModelPool = new ModelPoolManager();

export function registerModelPoolRoutes(
  app: Express,
  getGeminiClient: () => GoogleGenAI
): void {
  app.get("/api/models/status", (_req: Request, res: Response) => {
    res.json({
      success: true,
      ...sharedModelPool.getSnapshot(),
    });
  });

  app.post("/api/models/refresh", async (_req: Request, res: Response) => {
    try {
      const ai = getGeminiClient();
      await sharedModelPool.discoverAndVerify(ai, { probeActive: true });
      res.json({
        success: true,
        ...sharedModelPool.getSnapshot(),
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: err?.message || "تعذر فحص النماذج الحية حالياً.",
      });
    }
  });
}
