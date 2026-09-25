/**
 * MangaDex Reading History Repository
 * Manages reading history entries in mangadex.db.
 */

import { execute, query } from "./client";
import { initMangaDexDb } from "./schema";
import { notifyHistoryChanged } from "../../../db/library-notifiers";
import type { MangaDexHistoryRow } from "../types";

export interface HistoryPageResult {
  rows: MangaDexHistoryRow[];
  totalPages: number;
  currentPage: number;
  totalCount: number;
}

/**
 * Records or updates a reading history entry.
 */
export async function recordHistory(
  chapterId: string,
  mangaId: string,
  mangaTitle: string,
  chapterTitle: string,
  scanlatorName?: string | null,
): Promise<void> {
  await initMangaDexDb();
  const now = Date.now();
  // Delete any existing entry for this chapter to ensure latest timestamp on top
  await execute("DELETE FROM reading_history WHERE chapter_id = ?1", [chapterId]);
  await execute(
    `INSERT INTO reading_history (chapter_id, manga_id, manga_title, chapter_title, scanlator_name, read_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
    [chapterId, mangaId, mangaTitle, chapterTitle, scanlatorName ?? null, now],
  );
  notifyHistoryChanged();
}

/**
 * Retrieves paginated reading history.
 */
export async function getHistory(
  page = 1,
  limit = 30,
): Promise<HistoryPageResult> {
  await initMangaDexDb();
  const offset = Math.max(0, (page - 1) * limit);

  const countRows = await query<{ c: number }>(
    "SELECT COUNT(*) as c FROM reading_history",
  );
  const totalCount = countRows[0]?.c ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / limit));

  const rows = await query<MangaDexHistoryRow>(
    `SELECT h.id, h.chapter_id, h.manga_id, h.manga_title, h.chapter_title, h.scanlator_name, h.read_at,
            p.page_index, p.page_total, p.completed
     FROM reading_history h
     LEFT JOIN reading_progress p ON h.chapter_id = p.chapter_id
     ORDER BY h.read_at DESC
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
 * Deletes a single history item by ID.
 */
export async function deleteHistoryItem(id: number): Promise<void> {
  await initMangaDexDb();
  await execute("DELETE FROM reading_history WHERE id = ?1", [id]);
  notifyHistoryChanged();
}

/**
 * Clears all reading history.
 */
export async function clearHistory(): Promise<void> {
  await initMangaDexDb();
  await execute("DELETE FROM reading_history");
  notifyHistoryChanged();
}

export async function getMdxHistoryChapterIds(chapterIds: string[]): Promise<Set<string>> {
  if (chapterIds.length === 0) return new Set();
  await initMangaDexDb();
  const placeholders = chapterIds.map((_, i) => `?${i + 1}`).join(", ");
  const rows = await query<{ chapter_id: string }>(
    `SELECT chapter_id FROM reading_history WHERE chapter_id IN (${placeholders})`,
    chapterIds,
  );
  return new Set(rows.map((r) => r.chapter_id));
}
