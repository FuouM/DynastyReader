import { query } from "./client";
import { inClause } from "./paging";
import type {
  FollowedSeriesRow,
  FollowedSeriesPageResult,
  GetFollowedPageOptions,
  ReadingProgressRow,
  SeriesProgressRow,
  HistoryPageResult,
  GetHistoryPageOptions,
  BookmarkRow,
  BookmarkPageResult,
  GetBookmarksPageOptions,
} from "../types/db";
import { activeProvider } from "../stores/provider";
import type { ContentProvider } from "../stores/provider";
import { getProvider, getProviderForPermalink, type ContentProviderAdapter } from "../providers";
import { getChapterContainerTag } from "../taxonomy";
import { decodeEntities, slugify } from "../utils/formatting";
import {
  getFollowedRevision,
  onFollowedChanged,
  notifyFollowedChanged,
  getBookmarksRevision,
  onBookmarksChanged,
  notifyBookmarksChanged,
  getHistoryRevision,
  onHistoryChanged,
  notifyHistoryChanged,
  getProgressRevision,
  onProgressChanged,
  notifyProgressChanged,
} from "./library-notifiers";
export {
  getFollowedRevision,
  onFollowedChanged,
  notifyFollowedChanged,
  getBookmarksRevision,
  onBookmarksChanged,
  notifyBookmarksChanged,
  getHistoryRevision,
  onHistoryChanged,
  notifyHistoryChanged,
  getProgressRevision,
  onProgressChanged,
  notifyProgressChanged,
};

export async function getFollowedSeriesPage(
  page = 1,
  pageSize = 10,
  provider: ContentProvider = activeProvider(),
  options?: GetFollowedPageOptions,
): Promise<FollowedSeriesPageResult> {
  return getProvider(provider).getFollowedPage(page, pageSize, options);
}

export async function getFollowedSeriesRow(permalink: string): Promise<FollowedSeriesRow | null> {
  const isF = await getProviderForPermalink(permalink).isFollowed(permalink);
  if (!isF) return null;
  const rows = await query<FollowedSeriesRow>(
    `SELECT permalink, name, cover, last_checked_at, latest_chapter_permalink,
            latest_chapter_title, created_at
     FROM followed_series WHERE permalink = ?`,
    [permalink],
  );
  return (
    rows[0] ?? {
      permalink,
      name: "",
      cover: null,
      last_checked_at: Date.now(),
      latest_chapter_permalink: null,
      latest_chapter_title: null,
      created_at: Date.now(),
    }
  );
}

export async function isSeriesFollowed(permalink: string): Promise<boolean> {
  return getProviderForPermalink(permalink).isFollowed(permalink);
}

export async function followSeries(row: {
  permalink: string;
  name: string;
  cover: string | null;
  latestChapterPermalink: string | null;
  latestChapterTitle: string | null;
}): Promise<void> {
  return getProviderForPermalink(row.permalink).follow(row);
}

export async function unfollowSeries(permalink: string): Promise<void> {
  return getProviderForPermalink(permalink).unfollow(permalink);
}

/**
 * Updates only the stored cover path of a followed series. Keeps the library
 * cover in sync after a cover cache clear re-downloads a fresh thumbnail.
 */
export async function updateFollowedSeriesCover(
  permalink: string,
  cover: string | null,
  notify = false,
): Promise<void> {
  return getProviderForPermalink(permalink).updateFollowedCover(permalink, cover, notify);
}


export interface FollowedLookup {
  permalinks: Set<string>;
  names: Set<string>;
}

/**
 * Returns sets of followed series permalinks and normalized names for rapid O(1) checks.
 * Accounts for active provider (Dynasty or MangaDex).
 */
export async function getFollowedLookup(provider: ContentProvider = activeProvider()): Promise<FollowedLookup> {
  return getProvider(provider).getFollowedLookup();
}

/**
 * Determines whether a chapter item belongs to a followed series.
 * Matches against container tags (Series, Anthology, Issue), the item's series attribute,
 * and any Series-type tags.
 */
export function isChapterFollowed(
  item: {
    permalink?: string;
    series?: string | null;
    tags?: { type?: string; name?: string; permalink?: string }[];
  },
  lookup: FollowedLookup,
): boolean {
  if (!lookup || (lookup.permalinks.size === 0 && lookup.names.size === 0)) {
    return false;
  }

  const rawTags = item.tags ?? [];

  // 1. Direct container tag check (Series, Anthology, Issue)
  const containerTag = getChapterContainerTag(rawTags);
  if (containerTag) {
    if (containerTag.permalink && lookup.permalinks.has(containerTag.permalink)) {
      return true;
    }
    if (containerTag.name && lookup.names.has(decodeEntities(containerTag.name).trim().toLowerCase())) {
      return true;
    }
  }

  // 2. ch.series property check
  if (item.series && item.series.trim().length > 0) {
    const decoded = decodeEntities(item.series).trim().toLowerCase();
    if (lookup.names.has(decoded)) {
      return true;
    }
    const slug = slugify(item.series);
    if (slug && lookup.permalinks.has(slug)) {
      return true;
    }
  }

  // 3. MangaDex and other Series/Anthology tag checks
  for (const t of rawTags) {
    const k = t.type?.toLowerCase();
    if (k === "series" || k === "anthology") {
      if (t.permalink && lookup.permalinks.has(t.permalink)) {
        return true;
      }
      if (t.name && lookup.names.has(decodeEntities(t.name).trim().toLowerCase())) {
        return true;
      }
    }
  }

  return false;
}
export async function getReadingProgress(
  chapterPermalink: string,
): Promise<ReadingProgressRow | null> {
  return getProviderForPermalink(chapterPermalink).getProgress(chapterPermalink);
}

export async function setReadingProgress(p: {
  chapterPermalink: string;
  seriesPermalink: string;
  seriesName: string;
  chapterTitle: string;
  pageIndex: number;
  pageTotal: number;
  completed: boolean;
}): Promise<void> {
  return getProviderForPermalink(p.chapterPermalink).saveProgress(p);
}

/** Reading progress for every chapter of a series (one query, no per-chapter calls). */
export async function getProgressForSeries(seriesPermalink: string): Promise<SeriesProgressRow[]> {
  return getProviderForPermalink(seriesPermalink).getProgressForSeries(seriesPermalink);
}

/** Manually marks a chapter as read in both reading_progress and reading_history. */
export async function markChapterRead(p: {
  chapterPermalink: string;
  seriesPermalink: string;
  seriesName: string;
  chapterTitle: string;
  pageTotal?: number;
}): Promise<void> {
  return getProviderForPermalink(p.chapterPermalink).markChapterRead(p);
}

export async function markChapterUnread(chapterPermalink: string): Promise<void> {
  return getProviderForPermalink(chapterPermalink).markChapterUnread(chapterPermalink);
}

export async function addHistory(p: {
  chapterPermalink: string;
  seriesPermalink: string;
  seriesName: string;
  chapterTitle: string;
}): Promise<void> {
  return getProviderForPermalink(p.chapterPermalink).recordHistory(p);
}

export async function removeHistory(id: number, provider: ContentProvider = activeProvider()): Promise<void> {
  return getProvider(provider).removeHistory(id);
}

/** Bulk-delete history rows in a single dbExecuteBatch (one transaction). */
export async function removeHistoryBatch(ids: number[], provider: ContentProvider = activeProvider()): Promise<void> {
  return getProvider(provider).removeHistoryBatch(ids);
}

export async function clearHistory(provider: ContentProvider = activeProvider()): Promise<void> {
  return getProvider(provider).clearHistory();
}

export async function getHistoryPage(
  page = 1,
  pageSize = 15,
  provider: ContentProvider = activeProvider(),
  options?: GetHistoryPageOptions,
): Promise<HistoryPageResult> {
  return getProvider(provider).getHistoryPage(page, pageSize, options);
}
/** Returns a Map of chapter permalinks to their most recent read timestamp (read_at). */
export async function getHistoryMap(permalinks: string[]): Promise<Map<string, number>> {
  if (permalinks.length === 0) return new Map();
  const rows = await query<{ chapter_permalink: string; read_at: number }>(
    `SELECT chapter_permalink, read_at FROM reading_history WHERE chapter_permalink IN (${inClause(permalinks.length)})`,
    permalinks,
  );
  const map = new Map<string, number>();
  for (const r of rows) {
    map.set(r.chapter_permalink, r.read_at);
  }
  return map;
}

/** Returns a Set of chapter permalinks that have been recorded in history. */
export async function getHistoryPermalinks(permalinks: string[]): Promise<Set<string>> {
  if (permalinks.length === 0) return new Set();
  const mdxIds: string[] = [];
  const dynastyPerms: string[] = [];
  for (const p of permalinks) {
    if (p.startsWith("mdx:")) mdxIds.push(p.slice(4));
    else dynastyPerms.push(p);
  }
  const result = new Set<string>();
  if (mdxIds.length > 0) {
    const { getMdxHistoryChapterIds } = await import("../providers/mangadex/db/history.repo");
    const found = await getMdxHistoryChapterIds(mdxIds).catch(() => new Set<string>());
    for (const id of found) result.add(`mdx:${id}`);
  }
  if (dynastyPerms.length > 0) {
    const map = await getHistoryMap(dynastyPerms);
    for (const key of map.keys()) result.add(key);
  }
  return result;
}


export async function getBookmarksPage(
  page = 1,
  pageSize = 15,
  provider: ContentProvider = activeProvider(),
  options?: GetBookmarksPageOptions,
): Promise<BookmarkPageResult> {
  return getProvider(provider).getBookmarksPage(page, pageSize, options);
}

export async function getBookmark(chapterPermalink: string): Promise<BookmarkRow | null> {
  return getProviderForPermalink(chapterPermalink).getBookmark(chapterPermalink);
}

/** Returns a Set of chapter permalinks that have been bookmarked. */
export async function getBookmarkPermalinks(permalinks: string[]): Promise<Set<string>> {
  if (permalinks.length === 0) return new Set();
  const mdxIds: string[] = [];
  const dynastyPerms: string[] = [];
  for (const p of permalinks) {
    if (p.startsWith("mdx:")) mdxIds.push(p.slice(4));
    else dynastyPerms.push(p);
  }
  const result = new Set<string>();
  if (mdxIds.length > 0) {
    const { getMdxBookmarkChapterIds } = await import("../providers/mangadex/db/bookmarks.repo");
    const found = await getMdxBookmarkChapterIds(mdxIds).catch(() => new Set<string>());
    for (const id of found) result.add(`mdx:${id}`);
  }
  if (dynastyPerms.length > 0) {
    const rows = await query<{ chapter_permalink: string }>(
      `SELECT chapter_permalink FROM bookmarks WHERE chapter_permalink IN (${inClause(dynastyPerms.length)})`,
      dynastyPerms,
    ).catch(() => []);
    for (const r of rows) result.add(r.chapter_permalink);
  }
  return result;
}

export async function addBookmark(p: {
  chapterPermalink: string;
  seriesPermalink: string;
  seriesName: string;
  chapterTitle: string;
  pageIndex: number;
}): Promise<void> {
  return getProviderForPermalink(p.chapterPermalink).addBookmark(p);
}

export async function removeBookmark(chapterPermalink: string): Promise<void> {
  return getProviderForPermalink(chapterPermalink).removeBookmark(chapterPermalink);
}

/** Bulk-delete bookmarks across providers. */
export async function removeBookmarksBatch(chapterPermalinks: string[]): Promise<void> {
  if (chapterPermalinks.length === 0) return;
  const byProvider = new Map<ContentProviderAdapter, string[]>();
  for (const p of chapterPermalinks) {
    const adapter = getProviderForPermalink(p);
    const list = byProvider.get(adapter) ?? [];
    list.push(p);
    byProvider.set(adapter, list);
  }
  await Promise.all(
    Array.from(byProvider.entries()).map(([adapter, perms]) =>
      adapter.removeBookmarksBatch(perms),
    ),
  );
}
