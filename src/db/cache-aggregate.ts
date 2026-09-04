import { query } from "./client";
import { inClause } from "./paging";
import { seriesCoverKey, chapterCoverKey } from "../lib/cache-keys";
import { getChapterContainerTag } from "../taxonomy";
import { DB_NAME } from "../constants";
import * as ipc from "../ipc";
import { log } from "../utils/log";
export interface ChapterAggRow {
  chapterPermalink: string;
  pageCount: number;
  sizeBytes: number;
  lastCachedAt: number;
}

export interface ChapterInfo {
  seriesPermalink: string;
  seriesName: string;
  chapterTitle: string;
  /** Total pages from reading_progress (only present when a progress row exists). */
  pageTotal?: number;
}

export interface ChapterMeta {
  title: string;
  pagesCount: number;
  seriesPermalink?: string;
  seriesName?: string;
  tags?: { type?: string; name?: string; permalink?: string }[];
}

export interface CachedChapterContext {
  /** Per-chapter aggregate of cached_pages (page count, bytes, newest cached_at). */
  aggs: ChapterAggRow[];
  /** Chapter → series/title identity, resolved from progress then history. */
  chapterInfo: Map<string, ChapterInfo>;
  /** Cover payloads keyed by `series:<permalink>` / `chapter:<permalink>`. */
  coverMap: Map<string, string>;
  /** Chapter → page-0 file path (standalone-cover fallback). */
  page0Map: Map<string, string>;
  /** Chapter → cached chapter-metadata (title, page count, series tag, tags). */
  chapterMeta: Map<string, ChapterMeta>;
}

/** Raw `GROUP BY chapter_permalink` aggregate over cached_pages. */
async function groupCachedPages(limit?: number): Promise<ChapterAggRow[]> {
  const limitClause = limit !== undefined ? ` LIMIT ${limit}` : "";
  const rows = await query<{
    chapter_permalink: string;
    page_count: number;
    size_bytes: number;
    last_cached: number;
  }>(
    `SELECT chapter_permalink, COUNT(*) as page_count, SUM(COALESCE(size_bytes, 0)) as size_bytes, MAX(cached_at) as last_cached
     FROM cached_pages
     WHERE chapter_permalink NOT LIKE 'local:%'
     GROUP BY chapter_permalink
     ORDER BY last_cached DESC${limitClause}`,
  );
  return rows.map((r) => ({
    chapterPermalink: r.chapter_permalink,
    pageCount: Number(r.page_count),
    sizeBytes: Number(r.size_bytes),
    lastCachedAt: Number(r.last_cached),
  }));
}

/**
 * Batch-reads `download_queue.total_pages` for chapters. The Rust download
 * worker writes the true page count here once a chapter's page list is known,
 * making it more trustworthy than chapter metadata cached from a partial fetch.
 */
export async function getQueuePageTotals(chapterPermalinks: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (chapterPermalinks.length === 0) return map;
  const rows = await query<{ chapter_permalink: string; total_pages: number }>(
    `SELECT chapter_permalink, MAX(total_pages) AS total_pages FROM download_queue WHERE chapter_permalink IN (${inClause(chapterPermalinks.length)}) AND total_pages > 0 GROUP BY chapter_permalink`,
    chapterPermalinks,
  );
  for (const r of rows) map.set(r.chapter_permalink, Number(r.total_pages) || 0);
  return map;
}

/**
 * Loads the full cached-chapter context in ~5 batched queries. Cover rows are
 * key-filtered (only the `cover:series:*` / `cover:chapter:*` keys this page
 * set can use) instead of scanning the whole `cached_metadata` table.
 *
 * No row cap by default: silently truncating to the newest 200 chapters hid
 * older cached chapters from the Cache and Downloaded views.
 */
export async function loadCachedChapterContext(limit?: number): Promise<CachedChapterContext> {
  const aggs = await groupCachedPages(limit);
  const empty: CachedChapterContext = {
    aggs,
    chapterInfo: new Map(),
    coverMap: new Map(),
    page0Map: new Map(),
    chapterMeta: new Map(),
  };
  if (aggs.length === 0) return empty;

  // Self-heal / Backfill unmeasured 0-byte rows from disk
  const unmeasuredPermalinks = aggs
    .filter((a) => a.pageCount > 0 && a.sizeBytes === 0)
    .map((a) => a.chapterPermalink);
  if (unmeasuredPermalinks.length > 0) {
    const unmeasuredPages = await query<{ chapter_permalink: string; file_path: string }>(
      `SELECT chapter_permalink, file_path FROM cached_pages WHERE chapter_permalink IN (${inClause(unmeasuredPermalinks.length)}) AND (size_bytes = 0 OR size_bytes IS NULL)`,
      unmeasuredPermalinks,
    );
    if (unmeasuredPages.length > 0) {
      const paths = unmeasuredPages.map((p) => p.file_path);
      const fileResp = await ipc.fileExistsBatch(paths);
      const sizeByPath = new Map<string, number>();
      const updates: { path: string; size: number }[] = [];
      for (const item of fileResp.items ?? []) {
        if (item.exists && item.size_bytes > 0) {
          sizeByPath.set(item.path, Number(item.size_bytes));
          updates.push({ path: item.path, size: Number(item.size_bytes) });
        }
      }
      if (updates.length > 0) {
        // Update in-memory aggs immediately
        const addMap = new Map<string, number>();
        for (const p of unmeasuredPages) {
          const sz = sizeByPath.get(p.file_path) ?? 0;
          if (sz > 0) {
            addMap.set(p.chapter_permalink, (addMap.get(p.chapter_permalink) ?? 0) + sz);
          }
        }
        for (const a of aggs) {
          const add = addMap.get(a.chapterPermalink);
          if (add) a.sizeBytes += add;
        }

        // Persist to DB in background
        void (async () => {
          try {
            const stmts = updates.map(() => `UPDATE cached_pages SET size_bytes = ? WHERE file_path = ?`);
            const params = updates.map((u) => [u.size, u.path]);
            await ipc.dbExecuteBatch(DB_NAME, stmts, params);
          } catch (err) {
            log.debug("cache-aggregate", "backfill size_bytes error:", err);
          }
        })();
      }
    }
  }

  const permalinks = aggs.map((a) => a.chapterPermalink);
  const placeholders = inClause(permalinks.length);
  const chapterKeys = permalinks.map((cp) => `chapter:${cp}`);
  const chapterKeyPlaceholders = inClause(chapterKeys.length);
  const [progRows, histRows, metaChapterRows, page0Rows, queueTotals] = await Promise.all([
    query<{
      chapter_permalink: string;
      series_permalink: string;
      series_name: string;
      chapter_title: string;
      page_total: number;
    }>(
      `SELECT chapter_permalink, series_permalink, series_name, chapter_title, page_total FROM reading_progress WHERE chapter_permalink IN (${placeholders})`,
      permalinks,
    ),
    query<{
      chapter_permalink: string;
      series_permalink: string;
      series_name: string;
      chapter_title: string;
    }>(
      `SELECT chapter_permalink, series_permalink, series_name, chapter_title FROM reading_history WHERE chapter_permalink IN (${placeholders})`,
      permalinks,
    ),
    query<{ cache_key: string; json_payload: string }>(
      `SELECT cache_key, json_payload FROM cached_metadata WHERE data_type = 'chapter' AND cache_key IN (${chapterKeyPlaceholders})`,
      chapterKeys,
    ),
    query<{ chapter_permalink: string; file_path: string }>(
      `SELECT chapter_permalink, file_path FROM cached_pages WHERE page_index = 0 AND chapter_permalink IN (${placeholders})`,
      permalinks,
    ),
    getQueuePageTotals(permalinks),
  ]);

  // Canonical cover keys only (`cover:series:*` / `cover:chapter:*`); the
  // legacy bare `cover:*` scheme is normalized away by migration v1.
  const coverKeys = new Set<string>();
  for (const r of [...progRows, ...histRows]) {
    if (r.series_permalink) coverKeys.add(seriesCoverKey(r.series_permalink));
  }
  for (const cp of permalinks) {
    coverKeys.add(chapterCoverKey(cp));
  }
  const coverKeyList = [...coverKeys];
  const metaCoverRows =
    coverKeyList.length === 0
      ? []
      : await query<{ cache_key: string; json_payload: string }>(
          `SELECT cache_key, json_payload FROM cached_metadata WHERE data_type = 'cover' AND cache_key IN (${inClause(coverKeyList.length)})`,
          coverKeyList,
        );

  const chapterInfo = new Map<string, ChapterInfo>();
  for (const r of histRows) {
    chapterInfo.set(r.chapter_permalink, {
      seriesPermalink: r.series_permalink,
      seriesName: r.series_name,
      chapterTitle: r.chapter_title,
    });
  }
  for (const r of progRows) {
    chapterInfo.set(r.chapter_permalink, {
      seriesPermalink: r.series_permalink,
      seriesName: r.series_name,
      chapterTitle: r.chapter_title,
      pageTotal: Number(r.page_total || 0),
    });
  }

  const coverMap = new Map<string, string>();
  for (const m of metaCoverRows) {
    coverMap.set(m.cache_key.replace(/^cover:/, ""), m.json_payload);
  }

  const page0Map = new Map<string, string>();
  for (const p of page0Rows) {
    page0Map.set(p.chapter_permalink, p.file_path);
  }

  const chapterMeta = new Map<string, ChapterMeta>();
  for (const m of metaChapterRows) {
    try {
      const pl = m.cache_key.replace(/^chapter:/, "");
      const parsed = JSON.parse(m.json_payload) as ChapterMeta & { pages?: unknown };
      const containerTag = getChapterContainerTag(parsed.tags);
      chapterMeta.set(pl, {
        title: parsed.title || pl,
        // The Rust-side queue total wins when available: cached metadata may
        // have been written from a partial page-list fetch.
        pagesCount:
          (queueTotals.get(pl) ?? 0) > 0
            ? queueTotals.get(pl)!
            : Array.isArray(parsed.pages)
              ? parsed.pages.length
              : 0,
        seriesPermalink: containerTag?.permalink,
        seriesName: containerTag?.name,
        tags: parsed.tags,
      });
    } catch (err) {
      log.error("cache-aggregate", `invalid chapter metadata for ${m.cache_key}:`, err);
    }
  }

  return { aggs, chapterInfo, coverMap, page0Map, chapterMeta };
}