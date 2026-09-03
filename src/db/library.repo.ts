import { query, execute } from "./client";
import { inClause, queryPaged } from "./paging";
import { createChangeNotifier } from "../lib/change-notifier";
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
const followedNotifier = createChangeNotifier("library.repo:followed");
export const getFollowedRevision = followedNotifier.getRevision;
export const onFollowedChanged = followedNotifier.onChanged;
export const notifyFollowedChanged = followedNotifier.notifyChanged;

const bookmarksNotifier = createChangeNotifier("library.repo:bookmarks");
export const getBookmarksRevision = bookmarksNotifier.getRevision;
export const onBookmarksChanged = bookmarksNotifier.onChanged;
export const notifyBookmarksChanged = bookmarksNotifier.notifyChanged;

const historyNotifier = createChangeNotifier("library.repo:history");
export const getHistoryRevision = historyNotifier.getRevision;
export const onHistoryChanged = historyNotifier.onChanged;
export const notifyHistoryChanged = historyNotifier.notifyChanged;

const progressNotifier = createChangeNotifier("library.repo:progress");
export const getProgressRevision = progressNotifier.getRevision;
export const onProgressChanged = progressNotifier.onChanged;
export const notifyProgressChanged = progressNotifier.notifyChanged;


export async function getFollowedSeriesPage(
  page = 1,
  pageSize = 10,
): Promise<FollowedSeriesPageResult> {
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

export async function getFollowedSeriesRow(permalink: string): Promise<FollowedSeriesRow | null> {
  const rows = await query<FollowedSeriesRow>(
    `SELECT permalink, name, cover, last_checked_at, latest_chapter_permalink,
            latest_chapter_title, created_at
     FROM followed_series WHERE permalink = ?`,
    [permalink],
  );
  return rows[0] ?? null;
}

export async function followSeries(row: {
  permalink: string;
  name: string;
  cover: string | null;
  latestChapterPermalink: string | null;
  latestChapterTitle: string | null;
}): Promise<void> {
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
      row.permalink,
      row.name,
      row.cover,
      Date.now(),
      row.latestChapterPermalink,
      row.latestChapterTitle,
      Date.now(),
    ],
  );
  notifyFollowedChanged();
}

export async function unfollowSeries(permalink: string): Promise<void> {
  await execute(`DELETE FROM followed_series WHERE permalink = ?`, [permalink]);
  notifyFollowedChanged();
}

/**
 * Updates only the stored cover path of a followed series. Keeps the library
 * cover in sync after a cover cache clear re-downloads a fresh thumbnail.
 */
export async function updateFollowedSeriesCover(
  permalink: string,
  cover: string | null,
): Promise<void> {
  await execute(`UPDATE followed_series SET cover = ? WHERE permalink = ?`, [cover, permalink]);
  notifyFollowedChanged();
}

export async function getReadingProgress(
  chapterPermalink: string,
): Promise<ReadingProgressRow | null> {
  const rows = await query<ReadingProgressRow>(
    `SELECT chapter_permalink, series_permalink, series_name, chapter_title,
            page_index, page_total, completed, updated_at
     FROM reading_progress WHERE chapter_permalink = ?`,
    [chapterPermalink],
  );
  return rows[0] ?? null;
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
      p.chapterPermalink,
      p.seriesPermalink,
      p.seriesName,
      p.chapterTitle,
      p.pageIndex,
      p.pageTotal,
      p.completed ? 1 : 0,
      Date.now(),
    ],
  );
  notifyProgressChanged();
}

/** Reading progress for every chapter of a series (one query, no per-chapter calls). */
export async function getProgressForSeries(seriesPermalink: string): Promise<SeriesProgressRow[]> {
  return query<SeriesProgressRow>(
    `SELECT chapter_permalink, page_index, page_total, completed
     FROM reading_progress WHERE series_permalink = ?`,
    [seriesPermalink],
  );
}

export async function addHistory(p: {
  chapterPermalink: string;
  seriesPermalink: string;
  seriesName: string;
  chapterTitle: string;
}): Promise<void> {
  // Single atomic upsert: reading_history.chapter_permalink is UNIQUE (migration v1),
  // so re-reading a chapter bumps its read_at instead of creating a duplicate row,
  // and concurrent readers cannot double-insert (the old read-then-insert TOCTOU).
  await execute(
    `INSERT INTO reading_history (chapter_permalink, series_permalink, series_name,
       chapter_title, read_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(chapter_permalink) DO UPDATE SET
       series_permalink = excluded.series_permalink,
       series_name = excluded.series_name,
       chapter_title = excluded.chapter_title,
       read_at = excluded.read_at`,
    [p.chapterPermalink, p.seriesPermalink, p.seriesName, p.chapterTitle, Date.now()],
  );
  notifyHistoryChanged();
}

export async function removeHistory(id: number): Promise<void> {
  await execute(`DELETE FROM reading_history WHERE id = ?`, [id]);
  notifyHistoryChanged();
}

export async function clearHistory(): Promise<void> {
  await execute(`DELETE FROM reading_history`);
  notifyHistoryChanged();
}

export async function getHistoryPage(page = 1, pageSize = 15): Promise<HistoryPageResult> {
  return queryPaged<HistoryRow>(
    `SELECT COUNT(*) as count FROM reading_history`,
    `SELECT id, chapter_permalink, series_permalink, series_name, chapter_title, read_at
     FROM reading_history
     ORDER BY read_at DESC, id DESC LIMIT ? OFFSET ?`,
    page,
    pageSize,
  );
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
  const map = await getHistoryMap(permalinks);
  return new Set(map.keys());
}


export async function getBookmarksPage(page = 1, pageSize = 15): Promise<BookmarkPageResult> {
  return queryPaged<BookmarkRow>(
    `SELECT COUNT(*) as count FROM bookmarks`,
    `SELECT chapter_permalink, series_permalink, series_name, chapter_title,
            page_index, created_at
     FROM bookmarks ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    page,
    pageSize,
  );
}

export async function getBookmark(chapterPermalink: string): Promise<BookmarkRow | null> {
  const rows = await query<BookmarkRow>(
    `SELECT chapter_permalink, series_permalink, series_name, chapter_title,
            page_index, created_at
     FROM bookmarks WHERE chapter_permalink = ?`,
    [chapterPermalink],
  );
  return rows[0] ?? null;
}

/** Returns a Set of chapter permalinks that have been bookmarked. */
export async function getBookmarkPermalinks(permalinks: string[]): Promise<Set<string>> {
  if (permalinks.length === 0) return new Set();
  const rows = await query<{ chapter_permalink: string }>(
    `SELECT chapter_permalink FROM bookmarks WHERE chapter_permalink IN (${inClause(permalinks.length)})`,
    permalinks,
  );
  return new Set(rows.map((r) => r.chapter_permalink));
}

export async function addBookmark(p: {
  chapterPermalink: string;
  seriesPermalink: string;
  seriesName: string;
  chapterTitle: string;
  pageIndex: number;
}): Promise<void> {
  await execute(
    `INSERT INTO bookmarks (chapter_permalink, series_permalink, series_name,
       chapter_title, page_index, created_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(chapter_permalink) DO UPDATE SET
       page_index = excluded.page_index,
       created_at = excluded.created_at`,
    [p.chapterPermalink, p.seriesPermalink, p.seriesName, p.chapterTitle, p.pageIndex, Date.now()],
  );
  notifyBookmarksChanged();
}

export async function removeBookmark(chapterPermalink: string): Promise<void> {
  await execute(`DELETE FROM bookmarks WHERE chapter_permalink = ?`, [chapterPermalink]);
  notifyBookmarksChanged();
}
