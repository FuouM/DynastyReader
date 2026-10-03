import type {
  ContentProviderAdapter,
  FollowSeriesInput,
  BookmarkInput,
  HistoryInput,
  ReadingProgressInput,
  MarkChapterReadInput,
  FollowedLookup,
  ProviderCacheStats,
  ProviderMetaInfo,
} from "./types";
import { query, execute } from "../db/client";
import { inClause, queryPaged } from "../db/paging";
import { DB_NAME } from "../constants";
import * as ipc from "../ipc";
import { dynastyUrl, decodeEntities } from "../utils/formatting";
import {
  notifyFollowedChanged,
  notifyBookmarksChanged,
  notifyHistoryChanged,
  notifyProgressChanged,
} from "../db/library-notifiers";
import {
  getFullyCachedChapters,
  clearCachedGroupPages,
  getCacheOverviewStats,
  clearAllCacheStorage,
  type FullyCachedChapterRow,
} from "../db/cache.repo";
import { fetchSeries, fetchChapter } from "../api/series";
import type {
  FollowedSeriesRow,
  FollowedSeriesPageResult,
  ReadingProgressRow,
  SeriesProgressRow,
  HistoryRow,
  HistoryPageResult,
  BookmarkRow,
  BookmarkPageResult,
} from "../types/db";
import type { Series, Chapter } from "../types/api";

const DYNASTY_SLUG_REGEX = /^[a-zA-Z0-9_-]+$/;

export class DynastyProvider implements ContentProviderAdapter {
  readonly id = "dynasty" as const;

  readonly meta: ProviderMetaInfo = {
    id: "dynasty",
    name: "Dynasty Scans",
    shortName: "Dynasty",
    description: "Curated Yuri & Girls' Love catalog, doujinshi, and scanlations.",
    badge: "Yuri / GL",
    isBrowsable: true,
  };

  matchesPermalink(permalink: string): boolean {
    return (
      typeof permalink === "string" &&
      !permalink.startsWith("mdx:") &&
      !permalink.startsWith("local:")
    );
  }

  extractEntityId(permalink: string): string {
    return permalink;
  }

  canonicalUrl(path: string, permalink: string): string {
    if (!permalink) return "";
    return dynastyUrl(path, permalink);
  }

  isValidPermalink(candidate: unknown): candidate is string {
    return typeof candidate === "string" && DYNASTY_SLUG_REGEX.test(candidate);
  }

  // Followed
  async getFollowedPage(page = 1, pageSize = 10): Promise<FollowedSeriesPageResult> {
    return queryPaged<FollowedSeriesRow>(
      `SELECT COUNT(*) as count FROM followed_series`,
      `SELECT permalink, name, cover, last_checked_at, latest_chapter_permalink,
              latest_chapter_title, created_at
       FROM followed_series
       ORDER BY name COLLATE NOCASE LIMIT ? OFFSET ?`,
      page,
      pageSize,
    );
  }

  async getFollowedLookup(): Promise<FollowedLookup> {
    const rows = await query<{ permalink: string; name: string }>(
      `SELECT permalink, name FROM followed_series`,
    ).catch(() => []);
    const permalinks = new Set<string>();
    const names = new Set<string>();
    for (const r of rows) {
      if (r.permalink) permalinks.add(r.permalink);
      if (r.name) names.add(decodeEntities(r.name).trim().toLowerCase());
    }
    return { permalinks, names };
  }

  async isFollowed(permalink: string): Promise<boolean> {
    const rows = await query<{ c: number }>(
      `SELECT COUNT(*) as c FROM followed_series WHERE permalink = ?`,
      [permalink],
    ).catch(() => []);
    return (rows[0]?.c ?? 0) > 0;
  }

  async follow(input: FollowSeriesInput): Promise<void> {
    await execute(
      `INSERT INTO followed_series (permalink, name, cover, last_checked_at,
         latest_chapter_permalink, latest_chapter_title, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(permalink) DO UPDATE SET
         name = excluded.name,
         cover = excluded.cover,
         last_checked_at = excluded.last_checked_at,
         latest_chapter_permalink = excluded.latest_chapter_permalink,
         latest_chapter_title = excluded.latest_chapter_title`,
      [
        input.permalink,
        input.name,
        input.cover ?? null,
        Date.now(),
        input.latestChapterPermalink ?? null,
        input.latestChapterTitle ?? null,
        Date.now(),
      ],
    );
    notifyFollowedChanged();
  }

  async unfollow(permalink: string): Promise<void> {
    await execute(`DELETE FROM followed_series WHERE permalink = ?`, [permalink]);
    notifyFollowedChanged();
  }

  async updateFollowedCover(permalink: string, cover: string | null, notify = false): Promise<void> {
    await execute(`UPDATE followed_series SET cover = ? WHERE permalink = ?`, [cover, permalink]);
    if (notify) notifyFollowedChanged();
  }

  // Bookmarks
  async getBookmark(chapterPermalink: string): Promise<BookmarkRow | null> {
    const rows = await query<BookmarkRow>(
      `SELECT chapter_permalink, series_permalink, series_name, chapter_title,
              page_index, created_at
       FROM bookmarks WHERE chapter_permalink = ?`,
      [chapterPermalink],
    );
    return rows[0] ?? null;
  }

  async getBookmarksPage(page = 1, pageSize = 15): Promise<BookmarkPageResult> {
    return queryPaged<BookmarkRow>(
      `SELECT COUNT(*) as count FROM bookmarks`,
      `SELECT chapter_permalink, series_permalink, series_name, chapter_title,
              page_index, created_at
       FROM bookmarks ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      page,
      pageSize,
    );
  }

  async addBookmark(input: BookmarkInput): Promise<void> {
    await execute(
      `INSERT INTO bookmarks (chapter_permalink, series_permalink, series_name,
         chapter_title, page_index, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(chapter_permalink) DO UPDATE SET
         page_index = excluded.page_index,
         created_at = excluded.created_at`,
      [
        input.chapterPermalink,
        input.seriesPermalink,
        input.seriesName,
        input.chapterTitle,
        input.pageIndex,
        Date.now(),
      ],
    );
    notifyBookmarksChanged();
  }

  async removeBookmark(chapterPermalink: string): Promise<void> {
    await execute(`DELETE FROM bookmarks WHERE chapter_permalink = ?`, [chapterPermalink]);
    notifyBookmarksChanged();
  }

  async removeBookmarksBatch(chapterPermalinks: string[]): Promise<void> {
    if (chapterPermalinks.length === 0) return;
    await ipc.dbExecuteBatch(
      DB_NAME,
      [`DELETE FROM bookmarks WHERE chapter_permalink IN (${inClause(chapterPermalinks.length)})`],
      [chapterPermalinks],
    );
    notifyBookmarksChanged();
  }

  // History & Progress
  async getHistoryPage(page = 1, pageSize = 15): Promise<HistoryPageResult> {
    return queryPaged<HistoryRow>(
      `SELECT COUNT(*) as count FROM reading_history rh`,
      `SELECT rh.id, rh.chapter_permalink, rh.series_permalink, rh.series_name, rh.chapter_title, rh.read_at,
              rp.page_index, rp.page_total, rp.completed
       FROM reading_history rh
       LEFT JOIN reading_progress rp ON rh.chapter_permalink = rp.chapter_permalink
       ORDER BY rh.read_at DESC, rh.id DESC LIMIT ? OFFSET ?`,
      page,
      pageSize,
    );
  }

  async removeHistory(id: number): Promise<void> {
    await execute(`DELETE FROM reading_history WHERE id = ?`, [id]);
    notifyHistoryChanged();
  }

  async removeHistoryBatch(ids: number[]): Promise<void> {
    if (ids.length === 0) return;
    await ipc.dbExecuteBatch(
      DB_NAME,
      [`DELETE FROM reading_history WHERE id IN (${inClause(ids.length)})`],
      [ids],
    );
    notifyHistoryChanged();
  }

  async clearHistory(): Promise<void> {
    await execute(`DELETE FROM reading_history`);
    notifyHistoryChanged();
  }

  async getProgress(chapterPermalink: string): Promise<ReadingProgressRow | null> {
    const rows = await query<ReadingProgressRow>(
      `SELECT chapter_permalink, series_permalink, series_name, chapter_title,
              page_index, page_total, completed, updated_at
       FROM reading_progress WHERE chapter_permalink = ?`,
      [chapterPermalink],
    );
    return rows[0] ?? null;
  }

  async getProgressForSeries(seriesPermalink: string): Promise<SeriesProgressRow[]> {
    return query<SeriesProgressRow>(
      `SELECT chapter_permalink, page_index, page_total, completed
       FROM reading_progress WHERE series_permalink = ?`,
      [seriesPermalink],
    );
  }

  async saveProgress(input: ReadingProgressInput): Promise<void> {
    await execute(
      `INSERT INTO reading_progress (chapter_permalink, series_permalink, series_name,
         chapter_title, page_index, page_total, completed, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(chapter_permalink) DO UPDATE SET
         series_permalink = excluded.series_permalink,
         series_name = excluded.series_name,
         chapter_title = excluded.chapter_title,
         page_index = excluded.page_index,
         page_total = excluded.page_total,
         completed = excluded.completed,
         updated_at = excluded.updated_at`,
      [
        input.chapterPermalink,
        input.seriesPermalink,
        input.seriesName,
        input.chapterTitle,
        input.pageIndex,
        input.pageTotal,
        input.completed ? 1 : 0,
        Date.now(),
      ],
    );
    notifyProgressChanged();
    notifyHistoryChanged();
  }

  async recordHistory(input: HistoryInput): Promise<void> {
    await execute(
      `INSERT INTO reading_history (chapter_permalink, series_permalink, series_name,
         chapter_title, read_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(chapter_permalink) DO UPDATE SET
         series_permalink = excluded.series_permalink,
         series_name = excluded.series_name,
         chapter_title = excluded.chapter_title,
         read_at = excluded.read_at`,
      [input.chapterPermalink, input.seriesPermalink, input.seriesName, input.chapterTitle, Date.now()],
    );
    notifyHistoryChanged();
  }

  async markChapterRead(input: MarkChapterReadInput): Promise<void> {
    await Promise.all([
      this.saveProgress({
        chapterPermalink: input.chapterPermalink,
        seriesPermalink: input.seriesPermalink,
        seriesName: input.seriesName,
        chapterTitle: input.chapterTitle,
        pageIndex: 0,
        pageTotal: input.pageTotal ?? 1,
        completed: true,
      }),
      this.recordHistory({
        chapterPermalink: input.chapterPermalink,
        seriesPermalink: input.seriesPermalink,
        seriesName: input.seriesName,
        chapterTitle: input.chapterTitle,
      }),
    ]);
  }

  async markChapterUnread(chapterPermalink: string): Promise<void> {
    await Promise.all([
      execute(`DELETE FROM reading_progress WHERE chapter_permalink = ?`, [chapterPermalink]),
      execute(`DELETE FROM reading_history WHERE chapter_permalink = ?`, [chapterPermalink]),
    ]);
    notifyProgressChanged();
    notifyHistoryChanged();
  }

  // Cache
  async getDownloadedChapterRows(): Promise<FullyCachedChapterRow[]> {
    return getFullyCachedChapters();
  }

  async clearCachedChapters(chapterPermalinks: string[]): Promise<void> {
    return clearCachedGroupPages(chapterPermalinks);
  }

  async getCacheStats(): Promise<ProviderCacheStats> {
    const s = await getCacheOverviewStats();
    return {
      pages: s.totalCachedPages,
      chapters: s.totalCachedChapters,
      total_bytes: s.totalSizeBytes,
      cached_metadata_count: s.totalMetadataEntries,
    };
  }

  async purgeCache(): Promise<void> {
    return clearAllCacheStorage();
  }

  // Fetching
  async fetchSeries(permalink: string, force = false, preferredType?: string): Promise<Series> {
    return fetchSeries(permalink, force, preferredType);
  }

  async fetchChapterForReader(permalink: string): Promise<{ chapter: Chapter; startPage?: number }> {
    const chapter = await fetchChapter(permalink);
    return { chapter };
  }
}

export const dynastyProvider = new DynastyProvider();
