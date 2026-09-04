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

export function chapterKey(permalink: string): string {
  return `chapter:${permalink}`;
}

export function searchKey(url: string): string {
  return `search:${url}`;
}

export function feedKey(urlPath: string): string {
  return `feed:${urlPath}`;
}

export function dirKey(kind: string, page: number): string {
  return `dir:${kind}:${page}`;
}

/** Returns true if `cover` looks like an on-disk file path vs a bare cover-key slug. */
export function isCoverFilePath(cover: string | null | undefined): boolean {
  if (!cover) return false;
  return cover.includes("/") || cover.includes("\\");
}
