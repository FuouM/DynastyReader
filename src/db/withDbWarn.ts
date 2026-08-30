/**
 * Centralized warn wrapper for db.manage ops.
 * Deduplicates `console.warn("[db.manage] … failed:", err)` that was copy-pasted
 * across countTable / dirStatBatch / wipeDatabase fallbacks.
 */
import { log } from "../utils/log";

export async function withDbWarn<T>(
  label: string,
  fn: () => Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    log.warn("db/manage", `${label} failed:`, err);
    return fallback;
  }
}

export function warnDb(label: string, err: unknown): void {
  log.warn("db/manage", `${label}:`, err);
}
