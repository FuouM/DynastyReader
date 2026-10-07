/**
 * MangaDex Bookmarks Repository
 * Manages user bookmarks in mangadex.db.
 */

import { execute, query } from "./client";
import { initMangaDexDb } from "./schema";
import { notifyBookmarksChanged } from "../../../db/library-notifiers";
import type { GetBookmarksPageOptions } from "../../../types/db";

export interface MangaDexBookmarkRow {
  chapter_id: string;
  manga_id: string;
  manga_title: string;
  chapter_title: string;
  page_index: number;
  scanlator_name: string | null;
  created_at: number;
}

export interface BookmarksPageResult {
  rows: MangaDexBookmarkRow[];
  totalPages: number;
  currentPage: number;
  totalCount: number;
}

/**
 * Adds or updates a bookmark in mangadex.db.
 */
export async function addMdxBookmark(opts: {
  chapterId: string;
  mangaId: string;
  mangaTitle: string;
  chapterTitle: string;
  pageIndex?: number;
  scanlatorName?: string | null;
}): Promise<void> {
  await initMangaDexDb();
  const now = Date.now();
  await execute(
    `INSERT INTO bookmarks (chapter_id, manga_id, manga_title, chapter_title, page_index, scanlator_name, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
     ON CONFLICT(chapter_id) DO UPDATE SET
       manga_id = excluded.manga_id,
       manga_title = excluded.manga_title,
       chapter_title = excluded.chapter_title,
       page_index = excluded.page_index,
       scanlator_name = COALESCE(excluded.scanlator_name, bookmarks.scanlator_name),
       created_at = excluded.created_at`,
    [
      opts.chapterId,
      opts.mangaId,
      opts.mangaTitle,
      opts.chapterTitle,
      opts.pageIndex ?? 0,
      opts.scanlatorName ?? null,
      now,
    ],
  );
  notifyBookmarksChanged();
}

/**
 * Removes a bookmark from mangadex.db.
 */
export async function removeMdxBookmark(chapterId: string): Promise<void> {
  await initMangaDexDb();
  await execute("DELETE FROM bookmarks WHERE chapter_id = ?1", [chapterId]);
  notifyBookmarksChanged();
}

/**
 * Checks if a chapter is bookmarked.
 */
export async function getMdxBookmark(
  chapterId: string,
): Promise<MangaDexBookmarkRow | null> {
  await initMangaDexDb();
  const rows = await query<MangaDexBookmarkRow>(
    `SELECT chapter_id, manga_id, manga_title, chapter_title, page_index, scanlator_name, created_at
     FROM bookmarks
     WHERE chapter_id = ?1`,
    [chapterId],
  );
  return rows[0] ?? null;
}

/**
 * Retrieves paginated bookmarks.
 */
export async function getMdxBookmarks(
  page = 1,
  limit = 24,
  options?: GetBookmarksPageOptions,
): Promise<BookmarksPageResult> {
  await initMangaDexDb();
  const q = options?.query?.trim();
  const whereSql = q ? `WHERE (chapter_title LIKE ?1 OR manga_title LIKE ?2)` : "";
  const countParams: unknown[] = q ? [`%${q}%`, `%${q}%`] : [];

  const countRows = await query<{ c: number }>(
    `SELECT COUNT(*) as c FROM bookmarks ${whereSql}`,
    countParams,
  );
  const totalCount = countRows[0]?.c ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / limit));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const offset = Math.max(0, (currentPage - 1) * limit);

  let orderSql = `ORDER BY created_at DESC`;
  if (options?.sort === "oldest") orderSql = `ORDER BY created_at ASC`;
  else if (options?.sort === "alphabetical") orderSql = `ORDER BY manga_title COLLATE NOCASE ASC, chapter_title COLLATE NOCASE ASC`;

  const queryParams: unknown[] = q ? [`%${q}%`, `%${q}%`, limit, offset] : [limit, offset];
  const limitIdx = q ? "?3" : "?1";
  const offsetIdx = q ? "?4" : "?2";

  const rows = await query<MangaDexBookmarkRow>(
    `SELECT chapter_id, manga_id, manga_title, chapter_title, page_index, scanlator_name, created_at
     FROM bookmarks
     ${whereSql}
     ${orderSql}
     LIMIT ${limitIdx} OFFSET ${offsetIdx}`,
    queryParams,
  );

  return {
    rows,
    totalPages,
    currentPage,
    totalCount,
  };
}

export async function getMdxBookmarkChapterIds(chapterIds: string[]): Promise<Set<string>> {
  if (chapterIds.length === 0) return new Set();
  await initMangaDexDb();
  const placeholders = chapterIds.map((_, i) => `?${i + 1}`).join(", ");
  const rows = await query<{ chapter_id: string }>(
    `SELECT chapter_id FROM bookmarks WHERE chapter_id IN (${placeholders})`,
    chapterIds,
  );
  return new Set(rows.map((r) => r.chapter_id));
}

export async function getAllMdxBookmarks(): Promise<MangaDexBookmarkRow[]> {
  await initMangaDexDb();
  return query<MangaDexBookmarkRow>(
    `SELECT chapter_id, manga_id, manga_title, chapter_title, page_index, scanlator_name, created_at
     FROM bookmarks
     ORDER BY created_at DESC`,
  );
}
