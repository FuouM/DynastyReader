/**
 * MangaDex Followed Manga (Library) Repository
 * Manages followed manga in mangadex.db.
 */

import { execute, query } from "./client";
import { initMangaDexDb } from "./schema";
import { notifyFollowedChanged } from "../../../db/library-notifiers";
import type { MangaDexFollowedRow } from "../types";
import type { GetFollowedPageOptions } from "../../../types/db";

export interface FollowedMangaPageResult {
  rows: MangaDexFollowedRow[];
  totalPages: number;
  currentPage: number;
  totalCount: number;
}

/**
 * Adds a manga to followed library.
 */
export async function followManga(
  mangaId: string,
  title: string,
  coverFilename: string | null = null,
): Promise<void> {
  await initMangaDexDb();
  const now = Date.now();
  await execute(
    `INSERT INTO followed_manga (manga_id, title, cover_filename, last_checked_at, created_at)
     VALUES (?1, ?2, ?3, ?4, ?4)
     ON CONFLICT(manga_id) DO UPDATE SET
       title = excluded.title,
       cover_filename = COALESCE(excluded.cover_filename, followed_manga.cover_filename),
       last_checked_at = excluded.last_checked_at`,
    [mangaId, title, coverFilename, now],
  );
  notifyFollowedChanged();
}

/**
 * Removes a manga from followed library.
 */
export async function unfollowManga(mangaId: string): Promise<void> {
  await initMangaDexDb();
  await execute("DELETE FROM followed_manga WHERE manga_id = ?1", [mangaId]);
  notifyFollowedChanged();
}

/**
 * Checks if a manga is followed.
 */
export async function isMangaFollowed(mangaId: string): Promise<boolean> {
  await initMangaDexDb();
  const rows = await query<{ c: number }>(
    "SELECT COUNT(*) as c FROM followed_manga WHERE manga_id = ?1",
    [mangaId],
  );
  return (rows[0]?.c ?? 0) > 0;
}

/**
 * Retrieves paginated followed manga list.
 */
export async function getFollowedManga(
  page = 1,
  limit = 24,
  options?: GetFollowedPageOptions,
): Promise<FollowedMangaPageResult> {
  await initMangaDexDb();
  const q = options?.query?.trim();
  const whereSql = q ? `WHERE title LIKE ?1` : "";
  const countParams: unknown[] = q ? [`%${q}%`] : [];

  const countRows = await query<{ c: number }>(
    `SELECT COUNT(*) as c FROM followed_manga ${whereSql}`,
    countParams,
  );
  const totalCount = countRows[0]?.c ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / limit));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const offset = Math.max(0, (currentPage - 1) * limit);

  let orderSql = `ORDER BY created_at DESC`;
  if (options?.sort === "alphabetical") orderSql = `ORDER BY title COLLATE NOCASE ASC`;
  else if (options?.sort === "recent_checked") orderSql = `ORDER BY last_checked_at DESC`;

  const queryParams: unknown[] = q ? [`%${q}%`, limit, offset] : [limit, offset];
  const limitIdx = q ? "?2" : "?1";
  const offsetIdx = q ? "?3" : "?2";

  const rows = await query<MangaDexFollowedRow>(
    `SELECT manga_id, title, cover_filename, last_checked_at, latest_chapter_id, latest_chapter_title, created_at
     FROM followed_manga
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

/**
 * Retrieves all followed manga sorted alphabetically.
 */
export async function getAllFollowedManga(): Promise<MangaDexFollowedRow[]> {
  await initMangaDexDb();
  return query<MangaDexFollowedRow>(
    `SELECT manga_id, title, cover_filename, last_checked_at, latest_chapter_id, latest_chapter_title, created_at
     FROM followed_manga
     ORDER BY title COLLATE NOCASE ASC`,
  );
}
