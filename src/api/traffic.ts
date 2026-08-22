/**
 * Real-time network traffic and bandwidth tracker.
 * Tracks bytes downloaded, network requests, and cache hits across both
 * the current app session and all-time (persisted).
 */

import { throttle } from "@solid-primitives/scheduled";
export interface TrafficMetrics {
  bytesDownloaded: number;
  networkRequests: number;
  cacheHits: number;
  bytesSaved: number;
}

export interface SessionTraffic extends TrafficMetrics {
  session: TrafficMetrics;
  lifetime: TrafficMetrics;
}

const STORAGE_KEY = "ds_lifetime_traffic";

function loadLifetime(): TrafficMetrics {
  try {
    if (typeof localStorage !== "undefined") {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          bytesDownloaded: Math.max(0, Number(parsed.bytesDownloaded) || 0),
          networkRequests: Math.max(0, Number(parsed.networkRequests) || 0),
          cacheHits: Math.max(0, Number(parsed.cacheHits) || 0),
          bytesSaved: Math.max(0, Number(parsed.bytesSaved) || 0),
        };
      }
    }
  } catch {}
  return {
    bytesDownloaded: 0,
    networkRequests: 0,
    cacheHits: 0,
    bytesSaved: 0,
  };
}

const lifetimeMetrics: TrafficMetrics = loadLifetime();
const sessionMetrics: TrafficMetrics = {
  bytesDownloaded: 0,
  networkRequests: 0,
  cacheHits: 0,
  bytesSaved: 0,
};

function snapshot(): SessionTraffic {
  return {
    ...sessionMetrics,
    session: { ...sessionMetrics },
    lifetime: { ...lifetimeMetrics },
  };
}

type TrafficListener = (state: SessionTraffic) => void;
const listeners = new Set<TrafficListener>();

function notify(): void {
  const snap = snapshot();
  for (const listener of listeners) {
    try {
      listener(snap);
    } catch (err) {
      console.warn("[ds-traffic] listener error:", err);
    }
  }
}

const schedulePersist = throttle(() => {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lifetimeMetrics));
    }
  } catch (err) {
    console.warn("[ds-traffic] failed to persist lifetime traffic:", err);
  }
}, 2000);

/** Records inbound network payload traffic. */
export function recordNetworkTraffic(bytes: number): void {
  const b = Math.max(0, bytes);
  sessionMetrics.bytesDownloaded += b;
  sessionMetrics.networkRequests += 1;
  lifetimeMetrics.bytesDownloaded += b;
  lifetimeMetrics.networkRequests += 1;
  schedulePersist();
  notify();
}

/** Records a local cache hit (saving online bandwidth). */
export function recordCacheHit(savedBytes = 0): void {
  const b = Math.max(0, savedBytes);
  sessionMetrics.cacheHits += 1;
  sessionMetrics.bytesSaved += b;
  lifetimeMetrics.cacheHits += 1;
  lifetimeMetrics.bytesSaved += b;
  schedulePersist();
  notify();
}

/** Returns the current session + lifetime traffic snapshot. */
export function getSessionTraffic(): SessionTraffic {
  return snapshot();
}

/** Returns lifetime metrics. */
export function getLifetimeTraffic(): TrafficMetrics {
  return { ...lifetimeMetrics };
}

/** Resets lifetime traffic statistics. */
export function resetLifetimeTraffic(): void {
  lifetimeMetrics.bytesDownloaded = 0;
  lifetimeMetrics.networkRequests = 0;
  lifetimeMetrics.cacheHits = 0;
  lifetimeMetrics.bytesSaved = 0;
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {}
  notify();
}

/** Subscribes to live traffic updates. Returns an unsubscribe callback. */
export function subscribeSessionTraffic(listener: TrafficListener): () => void {
  listeners.add(listener);
  listener(snapshot());
  return () => {
    listeners.delete(listener);
  };
}
/** Formats byte counts into human-readable strings (canonical, from `lib/format`). */
export { formatBytes } from "../lib/format";
