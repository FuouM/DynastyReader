import { query } from "./client";
import { inClause } from "./paging";
import { seriesCoverKey, chapterCoverKey } from "../lib/cache-keys";
import { getChapterContainerTag } from "../taxonomy";

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
     FROM cached_pages GROUP BY chapter_permalink ORDER BY last_cached DESC${limitClause}`,
  );
  return rows.map((r) => ({
    chapterPermalink: r.chapter_permalink,
    pageCount: Number(r.page_count),
    sizeBytes: Number(r.size_bytes),
    lastCachedAt: Number(r.last_cached),
  }));
}

/**
 * Loads the full cached-chapter context in ~5 batched queries. Cover rows are
 * key-filtered (only the `cover:series:*` / `cover:chapter:*` keys this page
 * set can use) instead of scanning the whole `cached_metadata` table.
 */
export async function loadCachedChapterContext(limit = 200): Promise<CachedChapterContext> {
  const aggs = await groupCachedPages(limit);
  const empty: CachedChapterContext = {
    aggs,
    chapterInfo: new Map(),
    coverMap: new Map(),
    page0Map: new Map(),
    chapterMeta: new Map(),
  };
  if (aggs.length === 0) return empty;

  const permalinks = aggs.map((a) => a.chapterPermalink);
  const placeholders = inClause(permalinks.length);
  const chapterKeys = permalinks.map((cp) => `chapter:${cp}`);
  const chapterKeyPlaceholders = inClause(chapterKeys.length);

  const [progRows, histRows, metaChapterRows, page0Rows] = await Promise.all([
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
        pagesCount: Array.isArray(parsed.pages) ? parsed.pages.length : 0,
        seriesPermalink: containerTag?.permalink,
        seriesName: containerTag?.name,
        tags: parsed.tags,
      });
    } catch (err) {
      console.error(`[cache-aggregate] invalid chapter metadata for ${m.cache_key}:`, err);
    }
  }

  return { aggs, chapterInfo, coverMap, page0Map, chapterMeta };
}