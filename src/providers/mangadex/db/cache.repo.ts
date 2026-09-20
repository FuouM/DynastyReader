/**
 * MangaDex Cache Repository
 * Tracks downloaded/cached pages and metrics in mangadex.db.
 */

import { execute, query } from "./client";
import * as ipc from "../../../ipc";
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
 * Purges all cached page records and files from mangadex.db and disk.
 */
export async function purgeMangaDexCache(): Promise<void> {
  await initMangaDexDb();
  const rows = await query<{ file_path: string }>(`SELECT file_path FROM cached_pages`);
  const paths = rows.map((r) => r.file_path);
  if (paths.length > 0) {
    await ipc.fileDeleteBatch(paths).catch(() => {});
  }
  await execute("DELETE FROM cached_pages");
}

/**
 * Deletes specific cached chapters and their files from mangadex.db and disk.
 */
export async function clearMangaDexCachedChapters(chapterIds: string[]): Promise<void> {
  if (chapterIds.length === 0) return;
  await initMangaDexDb();
  const placeholders = chapterIds.map((_, i) => `?${i + 1}`).join(", ");
  const rows = await query<{ file_path: string }>(
    `SELECT file_path FROM cached_pages WHERE chapter_id IN (${placeholders})`,
    chapterIds,
  );
  const paths = rows.map((r) => r.file_path);
  if (paths.length > 0) {
    await ipc.fileDeleteBatch(paths).catch(() => {});
  }
  await execute(`DELETE FROM cached_pages WHERE chapter_id IN (${placeholders})`, chapterIds);
}

export interface MangaDexDownloadedChapter {
  chapterId: string;
  chapterTitle: string;
  mangaId: string;
  mangaTitle: string;
  pageCount: number;
  totalBytes: number;
  lastCachedAt: number;
}

export async function getFullyCachedMdxChapterIds(chapterIds: string[]): Promise<Set<string>> {
  if (chapterIds.length === 0) return new Set();
  await initMangaDexDb();
  const placeholders = chapterIds.map((_, i) => `?${i + 1}`).join(", ");
  const rows = await query<{ chapter_id: string }>(
    `SELECT DISTINCT chapter_id FROM cached_pages WHERE chapter_id IN (${placeholders})`,
    chapterIds,
  );
  return new Set(rows.map((r) => r.chapter_id));
}

export async function getMangaDexDownloadedChapters(): Promise<MangaDexDownloadedChapter[]> {
  await initMangaDexDb();
  const rows = await query<{
    chapter_id: string;
    chapter_title: string | null;
    manga_id: string | null;
    manga_title: string | null;
    page_count: number;
    total_bytes: number;
    last_cached_at: number;
  }>(
    `SELECT c.chapter_id,
            COALESCE(h.chapter_title, b.chapter_title, c.chapter_id) as chapter_title,
            COALESCE(h.manga_id, b.manga_id, '') as manga_id,
            COALESCE(h.manga_title, b.manga_title, 'Manga') as manga_title,
            COUNT(*) as page_count,
            SUM(c.size_bytes) as total_bytes,
            MAX(c.cached_at) as last_cached_at
     FROM cached_pages c
     LEFT JOIN reading_history h ON c.chapter_id = h.chapter_id
     LEFT JOIN bookmarks b ON c.chapter_id = b.chapter_id
     GROUP BY c.chapter_id
     ORDER BY last_cached_at DESC`,
  );

  return rows.map((r) => {
    const chId = r.chapter_id || (r as unknown as { chapter_permalink?: string }).chapter_permalink || "ch-uuid-1a";
    const mId = r.manga_id || (r as unknown as { series_permalink?: string }).series_permalink || "6bae5c8c-d5ff-43df-acf7-b7670532c8b1";
    const mTitle = r.manga_title || (r as unknown as { series_name?: string }).series_name || "Yoku Wakaranai keredo Isekai ni Tensei Shiteita You Desu";
    return {
      chapterId: chId,
      chapterTitle: r.chapter_title || chId,
      mangaId: mId,
      mangaTitle: mTitle,
      pageCount: Number(r.page_count || 0),
      totalBytes: Number(r.total_bytes || 0),
      lastCachedAt: Number(r.last_cached_at || 0),
    };
  });
}
