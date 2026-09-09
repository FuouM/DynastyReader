/**
 * User-defined page-cache ceiling & auto-prune settings (QoL-D3).
 *
 * The ceiling is persisted locally; when auto-prune is enabled the download
 * store sweeps least-recently-read cached chapters after downloads complete
 * until the cache is back under the ceiling.
 */
import { persistedSignal } from "../lib/persisted-signal";
import { log } from "./log";
import { pruneOldestReadCachedPages, type CachePruneResult } from "../db/cache.repo";
import type { TranslationKey } from "../i18n";

export const MB = 1024 * 1024;
export const GB = 1024 * 1024 * 1024;

export interface CacheCeilingPreset {
  bytes: number;
  labelKey?: TranslationKey;
  label: string;
}

export const CACHE_CEILING_PRESETS: CacheCeilingPreset[] = [
  { bytes: 0, label: "Off", labelKey: "cache.ceilingOff" },
  { bytes: 500 * MB, label: "500 MB", labelKey: "cache.ceiling500mb" },
  { bytes: 1 * GB, label: "1 GB", labelKey: "cache.ceiling1gb" },
  { bytes: 2 * GB, label: "2 GB", labelKey: "cache.ceiling2gb" },
  { bytes: 5 * GB, label: "5 GB", labelKey: "cache.ceiling5gb" },
  { bytes: 10 * GB, label: "10 GB", labelKey: "cache.ceiling10gb" },
  { bytes: 20 * GB, label: "20 GB", labelKey: "cache.ceiling20gb" },
];
/** Selectable cache ceilings in bytes; `0` means the ceiling is off. */
export const CACHE_CEILING_OPTIONS: { value: number; labelKey: TranslationKey }[] = [
  { value: 0, labelKey: "cache.ceilingOff" },
  { value: 1 * GB, labelKey: "cache.ceiling1gb" },
  { value: 2 * GB, labelKey: "cache.ceiling2gb" },
  { value: 5 * GB, labelKey: "cache.ceiling5gb" },
  { value: 10 * GB, labelKey: "cache.ceiling10gb" },
];

/** Page-cache ceiling in bytes; `0` = off (default). */
export const [cacheCeilingBytes, setCacheCeilingBytes] = persistedSignal<number>(0, {
  name: "ds_cache_ceiling_bytes",
});

/** Whether to sweep automatically after downloads complete. */
export const [cacheAutoPruneEnabled, setCacheAutoPruneEnabled] = persistedSignal<boolean>(false, {
  name: "ds_cache_auto_prune",
});

let pruneInFlight = false;

/**
 * Runs the eviction sweep when auto-prune is enabled and a ceiling is set.
 * In-flight guards keep overlapping download-completion events from running
 * concurrent sweeps.
 */
export async function maybeAutoPruneCache(
  excludePermalinks?: ReadonlySet<string>,
): Promise<CachePruneResult | null> {
  const ceiling = cacheCeilingBytes();
  if (!cacheAutoPruneEnabled() || ceiling <= 0 || pruneInFlight) return null;
  pruneInFlight = true;
  try {
    return await pruneOldestReadCachedPages(ceiling, excludePermalinks);
  } catch (err) {
    log.warn("cache-quota", "auto-prune sweep failed:", err);
    return null;
  } finally {
    pruneInFlight = false;
  }
}
