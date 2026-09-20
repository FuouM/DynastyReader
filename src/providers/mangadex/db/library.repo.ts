/**
 * MangaDex Followed Manga (Library) Repository
 * Manages followed manga in mangadex.db.
 */

import { execute, query } from "./client";
import { initMangaDexDb } from "./schema";
import type { MangaDexFollowedRow } from "../types";

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
}

/**
 * Removes a manga from followed library.
 */
export async function unfollowManga(mangaId: string): Promise<void> {
  await initMangaDexDb();
  await execute("DELETE FROM followed_manga WHERE manga_id = ?1", [mangaId]);
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
): Promise<FollowedMangaPageResult> {
  await initMangaDexDb();
  const offset = Math.max(0, (page - 1) * limit);

  const countRows = await query<{ c: number }>(
    "SELECT COUNT(*) as c FROM followed_manga",
  );
  const totalCount = countRows[0]?.c ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / limit));

  const rows = await query<MangaDexFollowedRow>(
    `SELECT manga_id, title, cover_filename, last_checked_at, latest_chapter_id, latest_chapter_title, created_at
     FROM followed_manga
     ORDER BY created_at DESC
     LIMIT ?1 OFFSET ?2`,
    [limit, offset],
  );

  return {
    rows,
    totalPages,
    currentPage: page,
    totalCount,
  };
}

/**
 * Updates latest chapter info for a followed manga.
 */
export async function updateFollowedLatestChapter(
  mangaId: string,
  chapterId: string,
  chapterTitle: string,
): Promise<void> {
  await initMangaDexDb();
  await execute(
    `UPDATE followed_manga
     SET latest_chapter_id = ?1, latest_chapter_title = ?2, last_checked_at = ?3
     WHERE manga_id = ?4`,
    [chapterId, chapterTitle, Date.now(), mangaId],
  );
}
