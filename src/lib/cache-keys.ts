/**
 * Canonical SQLite metadata cache key generators.
 * Provides a single source of truth for cache keys to eliminate typos and drift.
 */

export function seriesCoverKey(permalink: string): string {
  return `cover:series:${permalink}`;
}

export function chapterCoverKey(permalink: string): string {
  return `cover:chapter:${permalink}`;
}

export function seriesKey(permalink: string): string {
  return `series:${permalink}`;
}

