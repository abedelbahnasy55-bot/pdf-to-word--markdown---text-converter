import fs from "fs";
import path from "path";
import type express from "express";
import { resolvePublicUrlInfo } from "../teamAuth.js";

export const CANONICAL_PUBLISHED_ORIGIN =
  "https://pdf-to-word-markdown-text-converter.ai.studio";

export function resolveProjectRoot(): string {
  const cwd = process.cwd();
  if (fs.existsSync(path.join(cwd, "package.json"))) {
    return cwd;
  }
  if (typeof __dirname !== "undefined") {
    const parent = path.dirname(__dirname);
    const grandParent = path.dirname(parent);
    if (fs.existsSync(path.join(grandParent, "package.json"))) {
      return grandParent;
    }
    return path.basename(__dirname) === "dist" ? parent : __dirname;
  }
  return cwd;
}

export function resolveServerPort(argv: string[] = process.argv, env: NodeJS.ProcessEnv = process.env): number {
  const portArgIdx = argv.indexOf("--port");
  if (portArgIdx !== -1 && argv[portArgIdx + 1]) {
    const parsed = parseInt(argv[portArgIdx + 1], 10);
    if (!isNaN(parsed)) return parsed;
  }
  return Number(env.PORT) || 3000;
}

export function resolveServerHost(argv: string[] = process.argv, env: NodeJS.ProcessEnv = process.env): string {
  const hostArgIdx = argv.indexOf("--host");
  if (hostArgIdx !== -1 && argv[hostArgIdx + 1]) {
    return argv[hostArgIdx + 1];
  }
  return env.HOST || "0.0.0.0";
}

/**
 * Resolves the canonical public origin URL, preferring the published .ai.studio domain
 * when running in AI Studio / Cloud Run so external clients always receive a reachable URL.
 */
export function getPublicOrigin(req: express.Request): string {
  const info = resolvePublicUrlInfo(req);
  if (
    info.currentOrigin.includes(".ai.studio") ||
    info.currentOrigin.includes("wpsct27fdufcpry5x6ikjn") ||
    info.sharedPublicOrigin.includes("wpsct27fdufcpry5x6ikjn")
  ) {
    return CANONICAL_PUBLISHED_ORIGIN;
  }
  return info.sharedPublicOrigin;
}
