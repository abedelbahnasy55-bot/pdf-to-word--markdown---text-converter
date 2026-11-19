import { GoogleGenAI } from "@google/genai";
import { sharedModelPool } from "../modelPool.js";

let cachedAiClient: GoogleGenAI | null = null;

export function getGeminiClient(): GoogleGenAI {
  if (!cachedAiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn("WARNING: GEMINI_API_KEY is not set. Conversions will require API key.");
    }
    cachedAiClient = new GoogleGenAI({
      apiKey: apiKey || "",
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return cachedAiClient;
}

export async function runWithTimeout<T>(
  timeoutMs: number,
  timeoutMessage: string,
  operation: () => Promise<T>
): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);
  });

  try {
    return await Promise.race([operation(), timeoutPromise]);
  } finally {
    if (timeoutHandle !== undefined) {
      clearTimeout(timeoutHandle);
    }
  }
}

export interface RateLimitDelegatedResult {
  kind: "rate_limit_delegated";
  status: 429;
  body: {
    success: false;
    error: string;
    isRateLimit: true;
    isUnavailable: false;
    isPeakDemand: false;
    retryAfterSeconds: number;
  };
}

export interface PoolExecutionSuccess {
  kind: "success";
  model: string;
  responseText: string;
}

export interface PoolExecutionFailed {
  kind: "failed";
  lastError: unknown;
}

export type PoolExecutionOutcome =
  | PoolExecutionSuccess
  | RateLimitDelegatedResult
  | PoolExecutionFailed;

export interface GeminiPoolCallOptions {
  ai: GoogleGenAI;
  maxRounds: number;
  timeoutMs: number;
  respectCooldownGate?: boolean;
  pauseBetweenRounds?: boolean;
  pauseBetweenModelsMs?: number;
  buildTimeoutMessage: (modelName: string) => string;
  generateForModel: (modelName: string, ai: GoogleGenAI) => Promise<{ text?: string } | null | undefined>;
  onModelAttempt?: (round: number, maxRounds: number, modelName: string) => void;
  onModelError?: (modelName: string, err: unknown) => void;
}

export async function executeWithModelPool(
  options: GeminiPoolCallOptions
): Promise<PoolExecutionOutcome> {
  const {
    ai,
    maxRounds,
    timeoutMs,
    respectCooldownGate = false,
    pauseBetweenRounds = false,
    pauseBetweenModelsMs = 0,
    buildTimeoutMessage,
    generateForModel,
    onModelAttempt,
    onModelError,
  } = options;

  let lastError: unknown = null;

  for (let round = 0; round < maxRounds; round++) {
    const modelsToTry = sharedModelPool.getCandidateModels();

    if (pauseBetweenRounds && round > 0) {
      const delayMs = Math.min(10000, 1500 + round * 1200 + Math.floor(Math.random() * 500));
      console.log(`[Backoff Round ${round + 1}/${maxRounds}] Pausing ${delayMs}ms before retrying models...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    if (respectCooldownGate) {
      const earliestWaitMs = sharedModelPool.getEarliestReadyWaitMs();
      if (earliestWaitMs > 0) {
        const waitSec = Math.max(1, Math.min(60, Math.ceil(earliestWaitMs / 1000)));
        if (waitSec <= 15) {
          console.log(`[Rate Limit Guard] All models on cooldown. Waiting ${waitSec}s on server...`);
          await new Promise((resolve) => setTimeout(resolve, (waitSec + 1) * 1000));
        } else {
          console.log(`[Rate Limit Guard] Models in cooldown for ${waitSec}s. Delegating wait to client.`);
          return {
            kind: "rate_limit_delegated",
            status: 429,
            body: {
              success: false,
              error: "تم بلوغ حد الطلبات اللحظي في الدقيقة (Rate limit). يرجى الانتظار ثوانٍ قليلة...",
              isRateLimit: true,
              isUnavailable: false,
              isPeakDemand: false,
              retryAfterSeconds: waitSec + 1,
            },
          };
        }
      }
    }

    for (const modelName of modelsToTry) {
      try {
        onModelAttempt?.(round, maxRounds, modelName);
        const response = await runWithTimeout(timeoutMs, buildTimeoutMessage(modelName), () =>
          generateForModel(modelName, ai)
        );
        const text = response?.text || "";
        if (text && text.trim().length > 0) {
          sharedModelPool.recordSuccess(modelName);
          return {
            kind: "success",
            model: modelName,
            responseText: text,
          };
        }
      } catch (err: unknown) {
        lastError = err;
        sharedModelPool.classifyAndRecordError(modelName, err);
        onModelError?.(modelName, err);
        if (pauseBetweenModelsMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, pauseBetweenModelsMs));
        }
      }
    }
  }

  return { kind: "failed", lastError };
}

export interface ClassifiedGeminiHttpError {
  status: number;
  body: Record<string, unknown>;
}

export function classifyGeminiHttpError(error: unknown): ClassifiedGeminiHttpError {
  const rawError = error instanceof Error ? error.message : String(error);
  let extractedRetrySec = 15;
  try {
    const match = rawError.match(/retry in ([0-9.]+)s/i) || rawError.match(/retryDelay"?:\s*"(\d+)s"/i);
    if (match) extractedRetrySec = Math.ceil(parseFloat(match[1]));
  } catch {}

  const isDailyQuotaExhausted =
    rawError.includes("GenerateRequestsPerDay") ||
    (rawError.includes("free_tier_requests") && (rawError.includes("limit: 500") || extractedRetrySec > 300));

  const isRateLimit =
    rawError.includes("429") ||
    rawError.includes("RESOURCE_EXHAUSTED") ||
    rawError.includes("Quota exceeded") ||
    rawError.toLowerCase().includes("rate limit") ||
    rawError.toLowerCase().includes("quota");

  const isUnavailable =
    rawError.includes("503") ||
    rawError.toLowerCase().includes("high demand") ||
    rawError.toLowerCase().includes("peak demand") ||
    rawError.includes("UNAVAILABLE") ||
    rawError.toLowerCase().includes("overloaded") ||
    rawError.toLowerCase().includes("temporary");

  if (isUnavailable) {
    return {
      status: 503,
      body: {
        success: false,
        error: "تشهد خدمة المعالجة ضغطاً مؤقتاً. الحفاظ على تقدمك وإعادة المحاولة تلقائياً...",
        isRateLimit: false,
        isUnavailable: true,
        isPeakDemand: true,
        isDailyQuotaExhausted: false,
        retryAfterSeconds: Math.max(6, Math.min(25, extractedRetrySec)),
      },
    };
  }

  if (isRateLimit) {
    return {
      status: 429,
      body: {
        success: false,
        error: isDailyQuotaExhausted
          ? "تم استهلاك الحصة المجانية اليومية للطلبات البصرية. يمكنك إكمال الصفحات الرقمية فوراً أو المتابعة تلقائياً بعد انتهاء التهدئة."
          : "تم الوصول إلى الحد المؤقت للطلبات في الدقيقة (Rate limit). جاري الانتظار والاستئناف تلقائياً...",
        isRateLimit: true,
        isUnavailable: false,
        isPeakDemand: false,
        isDailyQuotaExhausted,
        retryAfterSeconds: isDailyQuotaExhausted ? 60 : Math.max(10, Math.min(65, extractedRetrySec + 2)),
      },
    };
  }

  return {
    status: 500,
    body: {
      success: false,
      error: rawError,
      isRateLimit: false,
    },
  };
}
