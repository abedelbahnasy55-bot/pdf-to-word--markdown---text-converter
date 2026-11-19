import type express from "express";

/**
 * Baseline HTTP hardening headers for responses served by the backend.
 */
export function securityHeadersMiddleware(
  _req: express.Request,
  res: express.Response,
  next: express.NextFunction
): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  next();
}

/**
 * Global CORS middleware for all /api/* routes (browser, CLI, MCP, and external integrations).
 */
export function apiCorsMiddleware(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): void {
  const origin = req.headers.origin;
  if (typeof origin === "string" && origin.trim()) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
  } else {
    res.setHeader("Access-Control-Allow-Origin", "*");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With, Accept, Origin, X-Team-Session, X-Client-Id, X-Client-Device, X-Telemetry-Managed"
  );
  res.setHeader("Access-Control-Max-Age", "86400");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
}

/**
 * Unified Express body-parser & payload-size error handler (prevents raw HTML 413 / 400 errors).
 */
export function payloadAndSyntaxErrorHandler(
  err: any,
  _req: express.Request,
  res: express.Response,
  next: express.NextFunction
): void {
  if (!err) {
    next();
    return;
  }

  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (err.type === "entity.too.large" || err.status === 413) {
    res.status(413).json({
      success: false,
      error: "حجم الحزمة كبير جداً.",
      isPayloadTooLarge: true,
      isRateLimit: false,
      isUnavailable: false,
    });
    return;
  }

  if (err instanceof SyntaxError || err.status === 400) {
    res.status(400).json({
      success: false,
      error: "استجابة غير صالحة: تنسيق بيانات الطلب غير صحيح.",
    });
    return;
  }

  next(err);
}

/**
 * 404 handler for all /api/* routes (ensures API callers never receive Vite SPA HTML).
 */
export function apiNotFoundHandler(req: express.Request, res: express.Response): void {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.status(404).json({
    success: false,
    error: `المسار البرمجي غير موجود: ${req.method} ${req.path}`,
    code: "NOT_FOUND",
  });
}

/**
 * Global Express error handler for all /api routes.
 */
export function apiUnhandledErrorHandler(
  err: any,
  _req: express.Request,
  res: express.Response,
  _next: express.NextFunction
): void {
  console.error("Unhandled API error:", err);
  const status = err?.status || err?.statusCode || 500;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.status(status).json({
    success: false,
    error: err?.message || "حدث خطأ غير متوقع أثناء معالجة الطلب.",
    code: err?.code || "INTERNAL_ERROR",
  });
}
