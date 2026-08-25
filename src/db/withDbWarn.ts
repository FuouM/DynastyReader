/**
 * Centralized warn wrapper for db.manage ops.
 * Deduplicates `console.warn("[db.manage] … failed:", err)` that was copy-pasted
 * across countTable / dirStatBatch / wipeDatabase fallbacks.
 */
export async function withDbWarn<T>(
  label: string,
  fn: () => Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.warn(`[db.manage] ${label} failed:`, err);
    return fallback;
  }
}

export function warnDb(label: string, err: unknown): void {
  console.warn(`[db.manage] ${label}:`, err);
}
