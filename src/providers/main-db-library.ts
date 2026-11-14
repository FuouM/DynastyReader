import type {
  BookmarkInput,
  HistoryInput,
  ReadingProgressInput,
  MarkChapterReadInput,
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
import type {
  ReadingProgressRow,
  SeriesProgressRow,
  HistoryRow,
  HistoryPageResult,
  GetHistoryPageOptions,
  BookmarkRow,
  BookmarkPageResult,
  GetBookmarksPageOptions,
} from "../types/db";
import type { Series, Chapter } from "../types/api";

function whereSql(conditions: (string | null)[]): string {
  const active = conditions.filter((c): c is string => c !== null);
  return active.length > 0 ? `WHERE ${active.join(" AND ")}` : "";
}

/**
 * Bookmarks, reading history, progress, and fetching shared by the providers
 * whose library rows live in the main app database (Dynasty and Local).
 */
export abstract class MainDbLibraryProvider {
  /** SQL predicate restricting library listings/clears to this provider's chapters; null = no restriction. */
  protected chapterScope(_column: string): string | null {
    return null;
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

  async getBookmarksPage(page = 1, pageSize = 15, options?: GetBookmarksPageOptions): Promise<BookmarkPageResult> {
    const q = options?.query?.trim();
    const where = whereSql([
      this.chapterScope("chapter_permalink"),
      q ? "(chapter_title LIKE ? OR series_name LIKE ?)" : null,
    ]);
    const params: unknown[] = q ? [`%${q}%`, `%${q}%`] : [];
    let orderSql = `ORDER BY created_at DESC`;
    if (options?.sort === "oldest") orderSql = `ORDER BY created_at ASC`;
    else if (options?.sort === "alphabetical") orderSql = `ORDER BY series_name COLLATE NOCASE ASC, chapter_title COLLATE NOCASE ASC`;

    return queryPaged<BookmarkRow>(
      `SELECT COUNT(*) as count FROM bookmarks ${where}`,
      `SELECT chapter_permalink, series_permalink, series_name, chapter_title,
              page_index, created_at
       FROM bookmarks
       ${where}
       ${orderSql} LIMIT ? OFFSET ?`,
      page,
      pageSize,
      params,
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
  async getHistoryPage(page = 1, pageSize = 15, options?: GetHistoryPageOptions): Promise<HistoryPageResult> {
    const q = options?.query?.trim();
    const where = whereSql([
      this.chapterScope("rh.chapter_permalink"),
      q ? "(rh.chapter_title LIKE ? OR rh.series_name LIKE ?)" : null,
    ]);
    const params: unknown[] = q ? [`%${q}%`, `%${q}%`] : [];
    let orderSql = `ORDER BY rh.read_at DESC, rh.id DESC`;
    if (options?.sort === "oldest") orderSql = `ORDER BY rh.read_at ASC, rh.id ASC`;
    else if (options?.sort === "alphabetical") orderSql = `ORDER BY rh.series_name COLLATE NOCASE ASC, rh.chapter_title COLLATE NOCASE ASC`;

    return queryPaged<HistoryRow>(
      `SELECT COUNT(*) as count FROM reading_history rh ${where}`,
      `SELECT rh.id, rh.chapter_permalink, rh.series_permalink, rh.series_name, rh.chapter_title, rh.read_at,
              rp.page_index, rp.page_total, rp.completed
       FROM reading_history rh
       LEFT JOIN reading_progress rp ON rh.chapter_permalink = rp.chapter_permalink
       ${where}
       ${orderSql} LIMIT ? OFFSET ?`,
      page,
      pageSize,
      params,
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
    await execute(`DELETE FROM reading_history ${whereSql([this.chapterScope("chapter_permalink")])}`);
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

  // Fetching
  async fetchSeries(permalink: string, force = false, preferredType?: string): Promise<Series> {
    return fetchSeries(permalink, force, preferredType);
  }

  async fetchChapterForReader(permalink: string): Promise<{ chapter: Chapter; startPage?: number }> {
    const chapter = await fetchChapter(permalink);
    return { chapter };
  }
}
