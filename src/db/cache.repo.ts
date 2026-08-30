import { query, execute } from "./client";
import { inClause } from "./paging";
import { loadCachedChapterContext } from "./cache-aggregate";
import { DB_NAME } from "../stores";
import * as ipc from "../ipc";
import { log } from "../utils/log";
import type {
  CachedPageRow,
  ChapterCacheCount,
  CacheOverviewStats,
  CachedSeriesGroup,
} from "../types/db";

export async function getCachedPages(chapterPermalink: string): Promise<CachedPageRow[]> {
  return query<CachedPageRow>(
    `SELECT chapter_permalink, page_index, file_path, cached_at
     FROM cached_pages WHERE chapter_permalink = ?`,
    [chapterPermalink],
  );
}

export async function setCachedPage(
  chapterPermalink: string,
  pageIndex: number,
  filePath: string,
  sizeBytes = 0,
): Promise<void> {
  await execute(
    `INSERT INTO cached_pages (chapter_permalink, page_index, file_path, size_bytes, cached_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(chapter_permalink, page_index) DO UPDATE SET
       file_path = excluded.file_path,
       size_bytes = excluded.size_bytes,
       cached_at = excluded.cached_at`,
    [chapterPermalink, pageIndex, filePath, sizeBytes, Date.now()],
  );
}

/** Cached-page counts for a batch of chapters (one query). */
export async function getCachedPageCounts(
  chapterPermalinks: string[],
): Promise<ChapterCacheCount[]> {
  if (chapterPermalinks.length === 0) return [];
  return query<ChapterCacheCount>(
    `SELECT chapter_permalink, COUNT(*) AS n FROM cached_pages
     WHERE chapter_permalink IN (${inClause(chapterPermalinks.length)}) GROUP BY chapter_permalink`,
    chapterPermalinks,
  );
}

export async function getCacheOverviewStats(): Promise<CacheOverviewStats> {
  const [pageRows, metaRows, diskStat] = await Promise.all([
    query<{ pages: number; chapters: number; total_bytes: number }>(
      `SELECT COUNT(*) as pages, COUNT(DISTINCT chapter_permalink) as chapters, SUM(COALESCE(size_bytes, 0)) as total_bytes FROM cached_pages`,
    ),
    query<{ count: number }>(`SELECT COUNT(*) as count FROM cached_metadata`),
    (async () => {
      try {
        const diskStat = await ipc.dirStat("");
        return Number(diskStat.total_bytes ?? 0);
      } catch (err) {
        log.debug("cache.repo", "dirStat failed:", err);
        return 0;
      }
    })(),
  ]);

  const pages = Number(pageRows[0]?.pages ?? 0);
  const bytes = diskStat > 0 ? diskStat : Number(pageRows[0]?.total_bytes ?? 0);

  return {
    totalCachedPages: pages,
    totalCachedChapters: Number(pageRows[0]?.chapters ?? 0),
    totalSizeBytes: bytes,
    totalMetadataEntries: Number(metaRows[0]?.count ?? 0),
  };
}

export async function getCachedSeriesGroups(): Promise<CachedSeriesGroup[]> {
  const { aggs, coverMap, page0Map, chapterMeta } = await loadCachedChapterContext();
  if (aggs.length === 0) return [];

  const groupMap = new Map<string, CachedSeriesGroup>();
  for (const row of aggs) {
    const cp = row.chapterPermalink;
    const meta = chapterMeta.get(cp);
    const seriesPermalink = meta?.seriesPermalink || "";
    const seriesName = seriesPermalink ? (meta?.seriesName || "") : "";

    const groupKey = seriesPermalink ? `series:${seriesPermalink}` : `chapter:${cp}`;
    let g = groupMap.get(groupKey);
    if (!g) {
      // Canonical `cover:series:*` / `cover:chapter:*` keys only; legacy bare
      // `cover:*` rows are normalized away by migration v1.
      const coverPath =
        (seriesPermalink && coverMap.get(`series:${seriesPermalink}`)) ||
        coverMap.get(`chapter:${cp}`) ||
        page0Map.get(cp) ||
        null;

      g = {
        seriesPermalink: seriesPermalink || cp,
        seriesName: seriesName || meta?.title || cp,
        isStandalone: !seriesPermalink,
        coverPath,
        chapterCount: 0,
        pageCount: 0,
        totalSizeBytes: 0,
        lastCachedAt: 0,
        chapterPermalinks: [],
      };
      groupMap.set(groupKey, g);
    }
    g.chapterCount += 1;
    g.pageCount += row.pageCount;
    g.totalSizeBytes += row.sizeBytes;
    g.lastCachedAt = Math.max(g.lastCachedAt, row.lastCachedAt);
    g.chapterPermalinks.push(cp);
  }

  // Exact disk footprint resolution. Directory stats for every group's candidate
  // paths are resolved in ONE `DirStatBatch` call instead of a per-group IPC
  // burst; the same applies to the exact-file fallback via `FileExistsBatch`.
  const dirProbe: { group: CachedSeriesGroup; candidates: string[] }[] = [];
  for (const g of groupMap.values()) {
    const clean = g.seriesPermalink.replace(/[^a-zA-Z0-9_-]/g, "_");
    dirProbe.push({
      group: g,
      candidates: g.isStandalone
        ? [`pages/_singles/${clean}`, `pages/${clean}`]
        : [`pages/${clean}`],
    });
  }

  const allDirPaths = [...new Set(dirProbe.flatMap((p) => p.candidates))];
  const dirResp = await ipc.dirStatBatch(allDirPaths);
  const dirBytesByPath = new Map<string, number>();
  for (const item of dirResp.items ?? []) {
    dirBytesByPath.set(item.path, Number(item.total_bytes ?? 0));
  }

  const fileProbe: { group: CachedSeriesGroup; filePaths: string[] }[] = [];
  for (const p of dirProbe) {
    let foundBytes = 0;
    for (const c of p.candidates) {
      const bytes = dirBytesByPath.get(c) ?? 0;
      if (bytes > 0) {
        foundBytes = bytes;
        break;
      }
    }
    if (foundBytes > 0) {
      p.group.totalSizeBytes = foundBytes;
      continue;
    }
    if (p.group.chapterPermalinks.length > 0) fileProbe.push({ group: p.group, filePaths: [] });
  }

  if (fileProbe.length > 0) {
    const filePathGroups = await Promise.all(
      fileProbe.map(async (p) => {
        const pathRows = await query<{ file_path: string }>(
          `SELECT file_path FROM cached_pages WHERE chapter_permalink IN (${inClause(p.group.chapterPermalinks.length)})`,
          p.group.chapterPermalinks,
        );
        return { group: p.group, filePaths: pathRows.map((r) => r.file_path) };
      }),
    );
    const allFilePaths = [...new Set(filePathGroups.flatMap((f) => f.filePaths))];
    const fileResp = await ipc.fileExistsBatch(allFilePaths);
    const sizeByPath = new Map<string, number>();
    for (const item of fileResp.items ?? []) {
      sizeByPath.set(item.path, Number(item.size_bytes ?? 0));
    }
    for (const f of filePathGroups) {
      f.group.totalSizeBytes = f.filePaths.reduce((sum, fp) => sum + (sizeByPath.get(fp) ?? 0), 0);
    }
  }

  return Array.from(groupMap.values()).sort((a, b) => b.lastCachedAt - a.lastCachedAt);
}

/**
 * Deletes files best-effort. Returns the set of paths that were actually
 * deleted; callers must only remove DB rows for deleted paths so a failed
 * file deletion never orphans an on-disk file the DB has already forgotten.
 */
async function deleteFiles(paths: string[]): Promise<Set<string>> {
  const deleted = new Set<string>();
  await Promise.all(
    paths.map(async (p) => {
      try {
        await ipc.fileDelete(p);
        deleted.add(p);
      } catch (err) {
        log.error("cache.repo", "FileDelete failed; keeping DB row to avoid orphan:", p, err);
      }
    }),
  );
  return deleted;
}

export async function clearCachedGroupPages(chapterPermalinks: string[]): Promise<void> {
  if (chapterPermalinks.length === 0) return;
  const rows = await query<{ file_path: string }>(
    `SELECT file_path FROM cached_pages WHERE chapter_permalink IN (${inClause(chapterPermalinks.length)})`,
    chapterPermalinks,
  );
  const deleted = await deleteFiles(rows.map((r) => r.file_path));
  if (deleted.size === 0) return;
  const pathPlaceholders = inClause(deleted.size);
  await execute(
    `DELETE FROM cached_pages WHERE file_path IN (${pathPlaceholders})`,
    Array.from(deleted),
  );
}

export async function clearAllCachedPages(): Promise<void> {
  const rows = await query<{ file_path: string }>(`SELECT file_path FROM cached_pages`);
  const deleted = await deleteFiles(rows.map((r) => r.file_path));
  if (deleted.size === 0) return;
  await execute(`DELETE FROM cached_pages WHERE file_path IN (${inClause(deleted.size)})`, Array.from(deleted));
}

export async function clearAllCachedCovers(): Promise<void> {
  const coverRows = await query<{ json_payload: string }>(
    `SELECT json_payload FROM cached_metadata WHERE data_type = 'cover'`,
  );
  const deleted = await deleteFiles(coverRows.map((r) => r.json_payload));
  if (deleted.size === 0) return;
  await execute(
    `DELETE FROM cached_metadata WHERE data_type = 'cover' AND json_payload IN (${inClause(deleted.size)})`,
    Array.from(deleted),
  );
}

export async function clearAllCacheStorage(): Promise<void> {
  // Sweep every removable on-disk file first (pages + covers); rows are only
  // deleted for files that were actually removed, so a failed deletion never
  // orphans a file the DB has already forgotten.
  const [pageRows, coverRows] = await Promise.all([
    query<{ file_path: string }>(`SELECT file_path FROM cached_pages`),
    query<{ json_payload: string }>(
      `SELECT json_payload FROM cached_metadata WHERE data_type = 'cover'`,
    ),
  ]);
  const pagePaths = pageRows.map((r) => r.file_path);
  const coverPaths = coverRows.map((r) => r.json_payload);
  const deletedPaths = Array.from(await deleteFiles([...pagePaths, ...coverPaths]));

  // The row deletion is atomic: every statement commits or none do, so a crash
  // between statements can never leave a half-cleared cache.
  const statements: string[] = [];
  const batchParams: unknown[][] = [];
  if (deletedPaths.length > 0) {
    statements.push(`DELETE FROM cached_pages WHERE file_path IN (${inClause(deletedPaths.length)})`);
    batchParams.push(deletedPaths);
    statements.push(
      `DELETE FROM cached_metadata WHERE data_type = 'cover' AND json_payload IN (${inClause(deletedPaths.length)})`,
    );
    batchParams.push(deletedPaths);
  }
  statements.push(`DELETE FROM cached_metadata WHERE data_type = 'chapter'`);
  batchParams.push([]);
  await ipc.dbExecuteBatch(DB_NAME, statements, batchParams);
}

export interface FullyCachedChapterRow {
  chapterPermalink: string;
  chapterTitle: string;
  seriesPermalink: string | null;
  seriesName: string | null;
  pageCount: number;
  pageTotal: number;
  totalSizeBytes: number;
  lastCachedAt: number;
  coverPath: string | null;
  tags?: { type?: string; name?: string; permalink?: string }[];
}

export async function getFullyCachedChapters(): Promise<FullyCachedChapterRow[]> {
  const { aggs, chapterInfo, coverMap, page0Map, chapterMeta } = await loadCachedChapterContext();

  const result: FullyCachedChapterRow[] = [];

  for (const row of aggs) {
    const cp = row.chapterPermalink;
    if (cp.startsWith("local:")) continue;
    const meta = chapterMeta.get(cp);
    const info = chapterInfo.get(cp);

    const totalPages = meta?.pagesCount || info?.pageTotal || 0;
    const isFullyCached = totalPages > 0 ? row.pageCount >= totalPages : row.pageCount > 0;

    if (isFullyCached) {
      const seriesPermalink = meta?.seriesPermalink || info?.seriesPermalink || null;
      const seriesName = meta?.seriesName || info?.seriesName || null;
      const chapterTitle = meta?.title || info?.chapterTitle || cp;
      // Canonical `cover:series:*` / `cover:chapter:*` keys only (migration v1).
      const coverPath =
        (seriesPermalink && coverMap.get(`series:${seriesPermalink}`)) ||
        coverMap.get(`chapter:${cp}`) ||
        page0Map.get(cp) ||
        null;

      result.push({
        chapterPermalink: cp,
        chapterTitle,
        seriesPermalink,
        seriesName,
        pageCount: row.pageCount,
        pageTotal: totalPages || row.pageCount,
        totalSizeBytes: row.sizeBytes,
        lastCachedAt: row.lastCachedAt,
        coverPath,
        tags: meta?.tags,
      });
    }
  }

  result.sort((a, b) => b.lastCachedAt - a.lastCachedAt);
  return result;
}

/**
 * Lightweight fully-cached check: instead of building the full per-view rows
 * (covers, history, tags), this only needs each chapter's cached page count
 * versus its expected total (progress `page_total`, or cached chapter metadata
 * page count) to produce the `Set<permalink>` the feed/search/library badge.
 */
export async function getFullyCachedChapterPermalinks(permalinks?: string[]): Promise<Set<string>> {
  if (permalinks && permalinks.length === 0) return new Set();
  const whereClauses = ["cp.chapter_permalink NOT LIKE 'local:%'"];
  const params: unknown[] = [];
  if (permalinks) {
    whereClauses.push(`cp.chapter_permalink IN (${inClause(permalinks.length)})`);
    params.push(...permalinks);
  }
  const whereClause = ` WHERE ${whereClauses.join(" AND ")}`;
  const rows = await query<{
    chapter_permalink: string;
    page_count: number;
    progress_total: number | null;
    chapter_payload: string | null;
  }>(
    `SELECT cp.chapter_permalink,
            COUNT(cp.page_index) AS page_count,
            (SELECT rp.page_total FROM reading_progress rp WHERE rp.chapter_permalink = cp.chapter_permalink) AS progress_total,
            (SELECT cm.json_payload FROM cached_metadata cm WHERE cm.cache_key = 'chapter:' || cp.chapter_permalink) AS chapter_payload
     FROM cached_pages cp${whereClause}
     GROUP BY cp.chapter_permalink`,
    params,
  );
  const fullyCached = new Set<string>();
  for (const r of rows) {
    let totalPages = Number(r.progress_total ?? 0);
    if (totalPages === 0 && r.chapter_payload) {
      try {
        const parsed = JSON.parse(r.chapter_payload) as { pages?: unknown };
        if (Array.isArray(parsed.pages)) totalPages = parsed.pages.length;
      } catch (err) {
        log.error("cache.repo", `invalid chapter payload for ${r.chapter_permalink}:`, err);
      }
    }
    const pageCount = Number(r.page_count);
    if (totalPages > 0 ? pageCount >= totalPages : pageCount > 0) {
      fullyCached.add(r.chapter_permalink);
    }
  }
  return fullyCached;
}
