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
import {
  notifyBookmarksChanged,
  notifyHistoryChanged,
  notifyProgressChanged,
} from "../db/library-notifiers";
import { fetchSeries, fetchChapter } from "../api/series";
import type { FullyCachedChapterRow } from "../db/cache.repo";
import type {
  FollowedSeriesPageResult,
  ReadingProgressRow,
  SeriesProgressRow,
  HistoryRow,
  HistoryPageResult,
  BookmarkRow,
  BookmarkPageResult,
} from "../types/db";
import type { Series, Chapter } from "../types/api";

export class LocalProvider implements ContentProviderAdapter {
  readonly id = "local" as const;

  readonly meta: ProviderMetaInfo = {
    id: "local",
    name: "Local Library",
    shortName: "Local",
    description: "Imported local folders, CBZ, and ZIP archives.",
    badge: "Local",
    isBrowsable: false,
  };

  matchesPermalink(permalink: string): boolean {
    return typeof permalink === "string" && permalink.startsWith("local:");
  }

  extractEntityId(permalink: string): string {
    if (!permalink) return "";
    return permalink.startsWith("local:") ? permalink.slice(6) : permalink;
  }

  canonicalUrl(_path: string, _permalink: string): string {
    return "";
  }

  isValidPermalink(candidate: unknown): candidate is string {
    return typeof candidate === "string" && candidate.startsWith("local:") && candidate.length > 6;
  }

  // Followed (Local files cannot be followed from a remote feed)
  async getFollowedPage(_page = 1, _pageSize = 10): Promise<FollowedSeriesPageResult> {
    return {
      rows: [],
      totalCount: 0,
      totalPages: 0,
      currentPage: 1,
    };
  }

  async getFollowedLookup(): Promise<FollowedLookup> {
    return { permalinks: new Set(), names: new Set() };
  }

  async isFollowed(_permalink: string): Promise<boolean> {
    return false;
  }

  async follow(_input: FollowSeriesInput): Promise<void> {
    // No-op for local
  }

  async unfollow(_permalink: string): Promise<void> {
    // No-op for local
  }

  async updateFollowedCover(_permalink: string, _cover: string | null, _notify = false): Promise<void> {
    // No-op for local
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
      `SELECT COUNT(*) as count FROM bookmarks WHERE chapter_permalink LIKE 'local:%'`,
      `SELECT chapter_permalink, series_permalink, series_name, chapter_title,
              page_index, created_at
       FROM bookmarks
       WHERE chapter_permalink LIKE 'local:%'
       ORDER BY created_at DESC LIMIT ? OFFSET ?`,
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
      `SELECT COUNT(*) as count FROM reading_history WHERE chapter_permalink LIKE 'local:%'`,
      `SELECT rh.id, rh.chapter_permalink, rh.series_permalink, rh.series_name, rh.chapter_title, rh.read_at,
              rp.page_index, rp.page_total, rp.completed
       FROM reading_history rh
       LEFT JOIN reading_progress rp ON rh.chapter_permalink = rp.chapter_permalink
       WHERE rh.chapter_permalink LIKE 'local:%'
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
    await execute(`DELETE FROM reading_history WHERE chapter_permalink LIKE 'local:%'`);
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

  // Cache (Local files reside on user filesystem and are not part of network cache storage)
  async getDownloadedChapterRows(): Promise<FullyCachedChapterRow[]> {
    return [];
  }

  async clearCachedChapters(_chapterPermalinks: string[]): Promise<void> {
    // No-op for local
  }

  async getCacheStats(): Promise<ProviderCacheStats> {
    return { pages: 0, chapters: 0, total_bytes: 0 };
  }

  async purgeCache(): Promise<void> {
    // No-op for local
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

export const localProvider = new LocalProvider();
