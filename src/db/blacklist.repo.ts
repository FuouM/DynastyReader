import { execute, query } from "./client";
import { persistedSignal } from "../lib/persisted-signal";
import { createChangeNotifier } from "../lib/change-notifier";
import type { BlacklistedTag, BlacklistedSeries, BlacklistCheckResult, BlacklistMode } from "../types/blacklist";

export type { BlacklistedTag, BlacklistedSeries, BlacklistCheckResult, BlacklistMode };

const blacklistNotifier = createChangeNotifier("blacklist.repo");
export const getBlacklistRevision = blacklistNotifier.getRevision;
export const onBlacklistChanged = blacklistNotifier.onChanged;
const notifyBlacklistChanged = blacklistNotifier.notifyChanged;

const [blacklistModeSignal, setBlacklistModeRaw] = persistedSignal<BlacklistMode>("hide", {
  name: "ds-blacklist-mode",
  deserialize: (v) => (v === "hide" || v === "warn" || v === "ghost") ? v : "hide",
});

export const getBlacklistMode = blacklistModeSignal;

export function setBlacklistMode(mode: BlacklistMode): void {
  setBlacklistModeRaw(mode);
  notifyBlacklistChanged();
}

let cachedBlacklistNames = new Set<string>();
let cachedBlacklistSeriesPermalinks = new Set<string>();
let cachedBlacklistSeriesNames = new Set<string>();

/**
 * Loads the active tag and series blacklists into memory for ultra-fast synchronous checks.
 */
export async function initBlacklistCache(): Promise<void> {
  const [tagRows, seriesRows] = await Promise.all([
    getBlacklistedTags(),
    getBlacklistedSeries(),
  ]);

  cachedBlacklistNames = new Set(
    tagRows.flatMap((r) => [
      r.tag_name.toLowerCase().trim(),
      ...(r.tag_permalink ? [r.tag_permalink.toLowerCase().trim()] : []),
    ]),
  );

  cachedBlacklistSeriesPermalinks = new Set(
    seriesRows.map((r) => r.series_permalink.toLowerCase().trim()),
  );
  cachedBlacklistSeriesNames = new Set(
    seriesRows.map((r) => r.series_name.toLowerCase().trim()),
  );
}

/**
 * Returns all blacklisted tags sorted by creation time.
 */
export async function getBlacklistedTags(): Promise<BlacklistedTag[]> {
  return query<BlacklistedTag>(
    "SELECT tag_name, tag_permalink, created_at FROM tag_blacklist ORDER BY created_at DESC",
    [],
  );
}

/**
 * Adds a tag to the SQLite blacklist and updates the in-memory cache.
 */
export async function addBlacklistedTag(name: string, permalink?: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) return;
  const now = Date.now();

  await execute(
    "INSERT INTO tag_blacklist (tag_name, tag_permalink, created_at) VALUES (?, ?, ?) ON CONFLICT(tag_name) DO UPDATE SET tag_permalink = excluded.tag_permalink, created_at = excluded.created_at",
    [trimmed, permalink ? permalink.trim() : null, now],
  );

  cachedBlacklistNames.add(trimmed.toLowerCase());
  if (permalink) {
    cachedBlacklistNames.add(permalink.trim().toLowerCase());
  }
  notifyBlacklistChanged();
}

/**
 * Removes a tag from the SQLite blacklist and updates the in-memory cache.
 */
export async function removeBlacklistedTag(name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) return;

  await execute("DELETE FROM tag_blacklist WHERE tag_name = ?", [trimmed]);
  cachedBlacklistNames.delete(trimmed.toLowerCase());
  await initBlacklistCache();
  notifyBlacklistChanged();
}

/**
 * Returns all blacklisted series sorted by creation time.
 */
export async function getBlacklistedSeries(): Promise<BlacklistedSeries[]> {
  return query<BlacklistedSeries>(
    "SELECT series_permalink, series_name, created_at FROM series_blacklist ORDER BY created_at DESC",
    [],
  );
}

/**
 * Adds a series to the SQLite blacklist and updates the in-memory cache.
 */
export async function addBlacklistedSeries(permalink: string, name: string): Promise<void> {
  const cleanPerm = permalink.trim();
  const cleanName = name.trim() || cleanPerm;
  if (!cleanPerm) return;
  const now = Date.now();

  await execute(
    "INSERT INTO series_blacklist (series_permalink, series_name, created_at) VALUES (?, ?, ?) ON CONFLICT(series_permalink) DO UPDATE SET series_name = excluded.series_name, created_at = excluded.created_at",
    [cleanPerm, cleanName, now],
  );

  cachedBlacklistSeriesPermalinks.add(cleanPerm.toLowerCase());
  cachedBlacklistSeriesNames.add(cleanName.toLowerCase());
  notifyBlacklistChanged();
}

/**
 * Removes a series from the SQLite blacklist and updates the in-memory cache.
 */
export async function removeBlacklistedSeries(permalink: string): Promise<void> {
  const cleanPerm = permalink.trim();
  if (!cleanPerm) return;

  await execute("DELETE FROM series_blacklist WHERE series_permalink = ?", [cleanPerm]);
  cachedBlacklistSeriesPermalinks.delete(cleanPerm.toLowerCase());
  await initBlacklistCache();
  notifyBlacklistChanged();
}

/**
 * Checks synchronously whether a series is blacklisted by permalink or title.
 */
export function isSeriesBlacklisted(permalink?: string, name?: string): boolean {
  if (permalink && cachedBlacklistSeriesPermalinks.has(permalink.toLowerCase().trim())) {
    return true;
  }
  if (name && cachedBlacklistSeriesNames.has(name.toLowerCase().trim())) {
    return true;
  }
  return false;
}

/**
 * Synchronously checks if an item (via tags or series info) matches the active blacklists.
 */
export function isItemBlacklisted(
  tags: { name: string; permalink?: string; type?: string }[] | undefined,
  seriesInfo?: { permalink?: string; name?: string },
): BlacklistCheckResult {
  const matched: string[] = [];

  // 1. Check direct series blacklist
  if (seriesInfo) {
    if (seriesInfo.permalink && cachedBlacklistSeriesPermalinks.has(seriesInfo.permalink.toLowerCase().trim())) {
      matched.push(seriesInfo.name || seriesInfo.permalink);
    } else if (seriesInfo.name && cachedBlacklistSeriesNames.has(seriesInfo.name.toLowerCase().trim())) {
      matched.push(seriesInfo.name);
    }
  }

  // 2. Check tags against tag blacklist & series blacklist
  if (tags && tags.length > 0) {
    for (const t of tags) {
      const nameLower = (t.name || "").toLowerCase().trim();
      const permLower = (t.permalink || "").toLowerCase().trim();

      // Check tag blacklist
      if (
        (nameLower && cachedBlacklistNames.has(nameLower)) ||
        (permLower && cachedBlacklistNames.has(permLower))
      ) {
        if (!matched.includes(t.name || t.permalink || "Unknown")) {
          matched.push(t.name || t.permalink || "Unknown");
        }
      }

      // If tag is a series tag, check against series blacklist
      if (
        (permLower && cachedBlacklistSeriesPermalinks.has(permLower)) ||
        (nameLower && cachedBlacklistSeriesNames.has(nameLower))
      ) {
        if (!matched.includes(t.name || t.permalink || "Unknown")) {
          matched.push(t.name || t.permalink || "Unknown");
        }
      }
    }
  }

  return {
    blacklisted: matched.length > 0,
    matchedTags: matched,
  };
}
