/**
 * MangaDex Cache Repository
 * Tracks downloaded/cached pages and metrics in mangadex.db.
 */

import { execute, query } from "./client";
import { initMangaDexDb } from "./schema";
import type { MangaDexCachedPageRow } from "../types";

/**
 * Records a downloaded page in mangadex.db.
 */
export async function setCachedPage(
  chapterId: string,
  pageIndex: number,
  filePath: string,
  sizeBytes: number,
): Promise<void> {
  await initMangaDexDb();
  const now = Date.now();
  await execute(
    `INSERT INTO cached_pages (chapter_id, page_index, file_path, size_bytes, cached_at)
     VALUES (?1, ?2, ?3, ?4, ?5)
     ON CONFLICT(chapter_id, page_index) DO UPDATE SET
       file_path = excluded.file_path,
       size_bytes = excluded.size_bytes,
       cached_at = excluded.cached_at`,
    [chapterId, pageIndex, filePath, sizeBytes, now],
  );
}

/**
 * Retrieves all cached pages for a chapter.
 */
export async function getCachedPages(
  chapterId: string,
): Promise<MangaDexCachedPageRow[]> {
  await initMangaDexDb();
  return query<MangaDexCachedPageRow>(
    `SELECT chapter_id, page_index, file_path, size_bytes, cached_at
     FROM cached_pages
     WHERE chapter_id = ?1
     ORDER BY page_index ASC`,
    [chapterId],
  );
}

/**
 * Aggregates MangaDex cache metrics (total bytes, page count, distinct chapters).
 */
export async function getMangaDexCacheStats(): Promise<{
  totalBytes: number;
  pageCount: number;
  chapterCount: number;
}> {
  await initMangaDexDb();
  const rows = await query<{
    total_bytes: number | null;
    page_count: number | null;
    chapter_count: number | null;
  }>(
    `SELECT
       SUM(size_bytes) as total_bytes,
       COUNT(*) as page_count,
       COUNT(DISTINCT chapter_id) as chapter_count
     FROM cached_pages`,
  );

  const r = rows[0];
  return {
    totalBytes: Number(r?.total_bytes ?? 0),
    pageCount: Number(r?.page_count ?? 0),
    chapterCount: Number(r?.chapter_count ?? 0),
  };
}

/**
 * Purges all cached page records from mangadex.db.
 */
export async function purgeMangaDexCache(): Promise<void> {
  await initMangaDexDb();
  await execute("DELETE FROM cached_pages");
}
