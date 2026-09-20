/**
 * MangaDex Reading Progress Repository
 * Tracks per-chapter reading progress and completion state in mangadex.db.
 */

import { execute, query } from "./client";
import { initMangaDexDb } from "./schema";
import type { MangaDexReadingProgressRow } from "../types";

/**
 * Saves or updates reading progress for a chapter.
 */
export async function saveReadingProgress(
  chapterId: string,
  mangaId: string,
  mangaTitle: string,
  chapterTitle: string,
  pageIndex: number,
  pageTotal: number,
  completed: boolean,
  scanlatorName?: string | null,
): Promise<void> {
  await initMangaDexDb();
  const now = Date.now();
  await execute(
    `INSERT INTO reading_progress (chapter_id, manga_id, manga_title, chapter_title, page_index, page_total, completed, scanlator_name, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
     ON CONFLICT(chapter_id) DO UPDATE SET
       manga_id = excluded.manga_id,
       manga_title = excluded.manga_title,
       chapter_title = excluded.chapter_title,
       page_index = excluded.page_index,
       page_total = excluded.page_total,
       completed = excluded.completed,
       scanlator_name = COALESCE(excluded.scanlator_name, reading_progress.scanlator_name),
       updated_at = excluded.updated_at`,
    [
      chapterId,
      mangaId,
      mangaTitle,
      chapterTitle,
      pageIndex,
      pageTotal,
      completed ? 1 : 0,
      scanlatorName ?? null,
      now,
    ],
  );
}

/**
 * Gets reading progress for a specific chapter.
 */
export async function getReadingProgress(
  chapterId: string,
): Promise<MangaDexReadingProgressRow | null> {
  await initMangaDexDb();
  const rows = await query<MangaDexReadingProgressRow>(
    `SELECT chapter_id, manga_id, manga_title, chapter_title, page_index, page_total, completed, scanlator_name, updated_at
     FROM reading_progress
     WHERE chapter_id = ?1`,
    [chapterId],
  );
  return rows[0] ?? null;
}

/**
 * Retrieves a dictionary of reading progress rows for all chapters in a manga.
 * Keyed by chapter_id for instant O(1) status lookup.
 */
export async function getMangaReadingProgress(
  mangaId: string,
): Promise<Record<string, MangaDexReadingProgressRow>> {
  await initMangaDexDb();
  const rows = await query<MangaDexReadingProgressRow>(
    `SELECT chapter_id, manga_id, manga_title, chapter_title, page_index, page_total, completed, scanlator_name, updated_at
     FROM reading_progress
     WHERE manga_id = ?1`,
    [mangaId],
  );

  const dict: Record<string, MangaDexReadingProgressRow> = {};
  for (const row of rows) {
    dict[row.chapter_id] = row;
  }
  return dict;
}

/**
 * Marks a chapter as completed or unread.
 */
export async function setChapterCompletion(
  chapterId: string,
  mangaId: string,
  mangaTitle: string,
  chapterTitle: string,
  completed: boolean,
  pageTotal = 1,
): Promise<void> {
  await saveReadingProgress(
    chapterId,
    mangaId,
    mangaTitle,
    chapterTitle,
    completed ? pageTotal - 1 : 0,
    pageTotal,
    completed,
  );
}
