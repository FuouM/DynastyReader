/**
 * Real-time network traffic and bandwidth tracker.
 * Tracks bytes downloaded, network requests, and cache hits across both
 * the current app session and all-time (persisted).
 */

import { persistedSignal } from "../lib/persisted-signal";
import { throttle } from "@solid-primitives/scheduled";
import { log } from "../utils/log";

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

const DEFAULT_METRICS: TrafficMetrics = { bytesDownloaded: 0, networkRequests: 0, cacheHits: 0, bytesSaved: 0 };

const [lifetimeMetrics, setLifetimeMetrics] = persistedSignal<TrafficMetrics>({ ...DEFAULT_METRICS }, {
  name: "ds_lifetime_traffic",
  serialize: JSON.stringify,
  deserialize: (raw) => {
    try {
      const p = JSON.parse(raw);
      return {
        bytesDownloaded: Math.max(0, Number(p.bytesDownloaded) || 0),
        networkRequests: Math.max(0, Number(p.networkRequests) || 0),
        cacheHits: Math.max(0, Number(p.cacheHits) || 0),
        bytesSaved: Math.max(0, Number(p.bytesSaved) || 0),
      };
    } catch (err) {
      log.debug("api/traffic", "lifetime deserialize failed:", err);
      return { ...DEFAULT_METRICS };
    }
  },
});
const inMemoryLifetime: TrafficMetrics = { ...lifetimeMetrics() };

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
    lifetime: { ...inMemoryLifetime },
  };
}

type TrafficListener = (state: SessionTraffic) => void;
const listeners = new Set<TrafficListener>();

function notifyImmediately(): void {
  const snap = snapshot();
  for (const listener of listeners) {
    try {
      listener(snap);
    } catch (err) {
      log.warn("api/traffic", "listener error:", err);
    }
  }
}

const scheduleNotify = throttle(notifyImmediately, 250);

const schedulePersist = throttle(() => {
  setLifetimeMetrics({ ...inMemoryLifetime });
}, 2000);

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    setLifetimeMetrics({ ...inMemoryLifetime });
  });
}

/** Records inbound network payload traffic. */
export function recordNetworkTraffic(bytes: number): void {
  const b = Math.max(0, bytes);
  sessionMetrics.bytesDownloaded += b;
  sessionMetrics.networkRequests += 1;
  inMemoryLifetime.bytesDownloaded += b;
  inMemoryLifetime.networkRequests += 1;
  schedulePersist();
  scheduleNotify();
}

/** Records a local cache hit (saving online bandwidth). */
export function recordCacheHit(savedBytes = 0): void {
  const b = Math.max(0, savedBytes);
  sessionMetrics.cacheHits += 1;
  sessionMetrics.bytesSaved += b;
  inMemoryLifetime.cacheHits += 1;
  inMemoryLifetime.bytesSaved += b;
  schedulePersist();
  scheduleNotify();
}

/** Returns the current session + lifetime traffic snapshot. */
export function getSessionTraffic(): SessionTraffic {
  return snapshot();
}

/** Resets lifetime traffic statistics. */
export function resetLifetimeTraffic(): void {
  sessionMetrics.bytesDownloaded = 0;
  sessionMetrics.networkRequests = 0;
  sessionMetrics.cacheHits = 0;
  sessionMetrics.bytesSaved = 0;
  inMemoryLifetime.bytesDownloaded = 0;
  inMemoryLifetime.networkRequests = 0;
  inMemoryLifetime.cacheHits = 0;
  inMemoryLifetime.bytesSaved = 0;
  schedulePersist.clear();
  scheduleNotify.clear();
  setLifetimeMetrics({ ...DEFAULT_METRICS });
  notifyImmediately();
}

/** Subscribes to live traffic updates. Returns an unsubscribe callback. */
export function subscribeSessionTraffic(listener: TrafficListener): () => void {
  listeners.add(listener);
  listener(snapshot());
  return () => {
    listeners.delete(listener);
  };
}
