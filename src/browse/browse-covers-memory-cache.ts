export type CoverState = "no-cover" | "downloading" | "processing" | "loading" | "loaded";

// RAM quick win: 100 in-memory cover paths (down from 500) covers 5 full 20-item feed pages
// of smooth scrolling, cutting Map entry overhead without dropping visible cover cache.
export const MAX_MEMORY_CACHE = 100;
const MAX_FAILED_ATTEMPTS = 50;

/**
 * In-memory cover path cache with LRU eviction. Manages three maps:
 * - `data`: cover key → resolved image path
 * - `failedAttempts`: cover key → failure count + timestamp (for cooldown)
 * - `inflight`: cover key → in-progress hydration promise (dedup)
 */
export class CoverMemoryCache {
  readonly data = new Map<string, string>();
  readonly failedAttempts = new Map<string, { count: number; lastTried: number }>();
  readonly inflight = new Map<string, Promise<string | null>>();

  get(key: string): string | undefined {
    return this.data.get(key);
  }

  has(key: string): boolean {
    return this.data.has(key);
  }

  set(key: string, val: string): void {
    if (this.data.size >= MAX_MEMORY_CACHE) {
      const oldest = this.data.keys().next().value;
      if (oldest !== undefined) this.data.delete(oldest);
    }
    this.data.set(key, val);
  }

  delete(key: string): void {
    this.data.delete(key);
  }

  setFailedAttempt(key: string, val: { count: number; lastTried: number }): void {
    if (this.failedAttempts.size >= MAX_FAILED_ATTEMPTS) {
      const oldest = this.failedAttempts.keys().next().value;
      if (oldest !== undefined) this.failedAttempts.delete(oldest);
    }
    this.failedAttempts.set(key, val);
  }

  getFailedAttempt(key: string): { count: number; lastTried: number } | undefined {
    return this.failedAttempts.get(key);
  }

  deleteFailedAttempt(key: string): void {
    this.failedAttempts.delete(key);
  }

  getInflight(key: string): Promise<string | null> | undefined {
    return this.inflight.get(key);
  }

  setInflight(key: string, val: Promise<string | null>): void {
    this.inflight.set(key, val);
  }

  deleteInflight(key: string): void {
    this.inflight.delete(key);
  }

  clearData(): void {
    this.data.clear();
  }

  clearFailedAttempts(): void {
    this.failedAttempts.clear();
  }

  clearInflight(): void {
    this.inflight.clear();
  }

  clear(): void {
    this.clearData();
    this.clearFailedAttempts();
    this.clearInflight();
  }
}
