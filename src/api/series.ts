import { SITE_ROOT } from "../constants";
import { seriesTypeToPath } from "../taxonomy";
import { getCached, setCached, deleteCached, touchCached, query } from "../db";
import { getLocalSeriesByPermalink } from "../db/local.repo";
import { seriesKey, seriesCoverKey, chapterCoverKey } from "../lib/cache-keys";
import { httpGetText } from "./http";
import { recordCacheHit } from "./traffic";
import { fileResolve } from "./fs";
import { fetchChapter } from "./chapter";
import { log } from "../utils/log";
import type { Series } from "../types/api";
import { SeriesSchema } from "./schemas";
import { coverPathsForChapter, coverPathsForSeries, fetchAndCacheCover } from "./cover-pipeline";
const SERIES_PRIMARY_TIMEOUT_MS = 15_000;
const SERIES_FALLBACK_TIMEOUT_MS = 5_000;
const SERIES_TTL_MS = 10 * 60 * 1000; // 10 minutes cache freshness

/** Ordered candidate JSON endpoints for a series-style permalink. */
export function seriesEndpoints(permalink: string, preferredType?: string): string[] {
  const enc = encodeURIComponent(permalink);
  const defaultEndpoints = [
    `${SITE_ROOT}/series/${enc}.json`,
    `${SITE_ROOT}/anthologies/${enc}.json`,
    `${SITE_ROOT}/doujins/${enc}.json`,
    `${SITE_ROOT}/issues/${enc}.json`,
    `${SITE_ROOT}/authors/${enc}.json`,
    `${SITE_ROOT}/tags/${enc}.json`,
    `${SITE_ROOT}/pairings/${enc}.json`,
    `${SITE_ROOT}/scanlators/${enc}.json`,
  ];

  if (!preferredType) return defaultEndpoints;
  const path = seriesTypeToPath(preferredType);
  const preferredUrl = `${SITE_ROOT}/${path}/${enc}.json`;
  return [preferredUrl, ...defaultEndpoints.filter((u) => u !== preferredUrl)];
}

async function fetchLocalSeries(permalink: string): Promise<Series> {
  const key = seriesKey(permalink);
  const cached = await getCached(key);
  if (cached) {
    try {
      const parsed = SeriesSchema.parse(JSON.parse(cached.json_payload));
      if (parsed.taggings && parsed.taggings.length > 0) {
        return parsed;
      }
    } catch {}
  }

  // Look up local series row from SQLite
  const localRow = await getLocalSeriesByPermalink(permalink);
  const slug = permalink.replace(/^local:/, "");

  // Look up chapters for this local series in cached_metadata
  const chapterRows = await query<{ cache_key: string; json_payload: string }>(
    `SELECT cache_key, json_payload FROM cached_metadata WHERE data_type = 'chapter' AND cache_key LIKE ?`,
    [`chapter:local:${slug}%`],
  );

  const taggings: Array<{ title: string; permalink: string }> = [];
  for (const row of chapterRows) {
    try {
      const chData = JSON.parse(row.json_payload);
      if (chData.permalink && chData.title) {
        taggings.push({
          title: chData.title,
          permalink: chData.permalink,
        });
      }
    } catch {}
  }

  // Fallback: look in cached_pages if cached_metadata is missing
  if (taggings.length === 0) {
    const pageRows = await query<{ chapter_permalink: string }>(
      `SELECT DISTINCT chapter_permalink FROM cached_pages WHERE chapter_permalink LIKE ?`,
      [`local:${slug}%`],
    );
    for (const r of pageRows) {
      taggings.push({
        title: localRow?.title || r.chapter_permalink,
        permalink: r.chapter_permalink,
      });
    }
  }

  if (!localRow && taggings.length === 0) {
    throw new Error(`Local series not found: "${permalink}"`);
  }
  const coverAbs = localRow?.cover_path
    ? (await fileResolve(localRow.cover_path)) || localRow.cover_path
    : (await fileResolve(`local/${slug}/cover.webp`)) || `local/${slug}/cover.webp`;

  const seriesPayload = {
    name: localRow?.title || slug,
    permalink,
    type: "local",
    cover: coverAbs,
    description: localRow?.description || null,
    author: localRow?.author || null,
    taggings,
  };

  await setCached(key, "series", JSON.stringify(seriesPayload));
  return SeriesSchema.parse(seriesPayload);
}

/** Series / anthology / doujin / author / tag detail with Stale-While-Revalidate caching. `force` skips the cache. */
export async function fetchSeries(
  permalink: string,
  force = false,
  preferredType?: string,
): Promise<Series> {
  if (permalink.startsWith("local:")) {
    return fetchLocalSeries(permalink);
  }
  const key = seriesKey(permalink);
  const cached = await getCached(key);
  const isStale = !cached || Date.now() - cached.cached_at >= SERIES_TTL_MS;

  // Fast path: fresh cache
  if (!force && cached && !isStale) {
    try {
      const parsed = SeriesSchema.parse(JSON.parse(cached.json_payload));
      recordCacheHit(cached.json_payload.length);
      return parsed;
    } catch (parseErr) {
      log.warn("api/series", `cached JSON parse failed for series "${permalink}":`, parseErr);
    }
  }

  // Stale cache: return cached immediately for 0ms latency, but revalidate in background
  if (!force && cached) {
    let parsed: Series | null = null;
    try {
      parsed = SeriesSchema.parse(JSON.parse(cached.json_payload));
    } catch (parseErr) {
      log.warn("api/series", `stale cached JSON parse failed for series "${permalink}":`, parseErr);
    }
    if (parsed) {
      recordCacheHit(cached.json_payload.length);
      void (async () => {
        try {
          const headers: Record<string, string> = {};
          if (cached.etag) headers["If-None-Match"] = cached.etag;
          const endpoints = seriesEndpoints(permalink, preferredType);
          for (let i = 0; i < endpoints.length; i++) {
            const url = endpoints[i];
            const timeoutMs = i === 0 ? SERIES_PRIMARY_TIMEOUT_MS : SERIES_FALLBACK_TIMEOUT_MS;
            const { status, body, etag } = await httpGetText(url, { headers, timeoutMs });
            if (status === 304) {
              await touchCached(key);
              break;
            }
            if (status === 200 && body) {
              await setCached(key, "series", body, etag);
              break;
            }
          }
        } catch (err) {
          log.warn("api/series", "background series revalidation failed:", err);
        }
      })();
      return parsed;
    }
  }

  // Network fetch (forced or cache miss)
  let lastErr: Error | null = null;
  const headers: Record<string, string> = {};
  if (cached?.etag && !force) {
    headers["If-None-Match"] = cached.etag;
  }

  const endpoints = seriesEndpoints(permalink, preferredType);
  for (let i = 0; i < endpoints.length; i++) {
    const url = endpoints[i];
    const timeoutMs = i === 0 ? SERIES_PRIMARY_TIMEOUT_MS : SERIES_FALLBACK_TIMEOUT_MS;
    try {
      const { status, body, etag } = await httpGetText(url, { headers, timeoutMs });
      if (status === 304 && cached) {
        await touchCached(key);
        return SeriesSchema.parse(JSON.parse(cached.json_payload));
      }
      if (status === 200 && body) {
        await setCached(key, "series", body, etag);
        return SeriesSchema.parse(JSON.parse(body));
      }
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
    }
  }

  if (cached) {
    try {
      return SeriesSchema.parse(JSON.parse(cached.json_payload));
    } catch (parseErr) {
      log.warn("api/series", `fallback cached JSON parse failed for series "${permalink}":`, parseErr);
    }
  }

  throw lastErr ?? new Error(`Failed to load series for permalink "${permalink}"`);
}

/**
 * Returns the on-disk absolute path of a series cover, downloading + transcoding
 * once into a lightweight WebP thumbnail (bounded dimension + <=100KB budget via
 * the backend media engine). Feed rows render at 42x58 and the series header at
 * 90px, so a small thumbnail keeps decode cheap while scrolling.
 */
export async function getSeriesCover(
  permalink: string,
  coverUrl: string | null,
  onPhase?: (phase: "downloading" | "processing") => void,
): Promise<string | null> {
  if (!coverUrl) return null;
  if (permalink.startsWith("local:")) {
    const directLocal = await fileResolve(coverUrl);
    if (directLocal) return directLocal;
    const slug = permalink.replace(/^local:/, "");
    const coverFallback = await fileResolve(`local/${slug}/cover.webp`);
    if (coverFallback) return coverFallback;
  }
  const { rawOutPath, webpOutPath } = coverPathsForSeries(permalink, coverUrl);
  return fetchAndCacheCover({
    cacheKey: seriesCoverKey(permalink),
    coverUrl,
    rawOutPath,
    webpOutPath,
    onPhase,
  });
}


/**
 * Checks local SQLite cache for an already-downloaded cover (series, doujin, or standalone chapter).
 * Also verifies the cached file actually exists on disk; if missing, purges the stale DB record.
 */
export async function getLocalCover(coverKey: string): Promise<string | null> {
  if (!coverKey) return null;
  const key = `cover:${coverKey}`;
  const cached = await getCached(key);
  if (!cached || !cached.json_payload) return null;

  // Verify file still exists on disk and return absolute path
  const resolved = await fileResolve(cached.json_payload);
  if (resolved) return resolved;
  // File is missing or deleted from disk; clean up stale database entry
  await deleteCached(key);
  return null;
}

/**
 * Checks local SQLite cache for an already-downloaded series cover. Zero network traffic.
 */
export async function getLocalSeriesCover(permalink: string): Promise<string | null> {
  return getLocalCover(`series:${permalink}`);
}

/**
 * Downloads page 1 of a standalone chapter as its cover, automatically
 * optimizing and compressing it into a lightweight WebP thumbnail via the backend media engine.
 */
export async function getChapterCover(
  permalink: string,
  firstPageUrl: string,
  onPhase?: (phase: "downloading" | "processing") => void,
): Promise<string | null> {
  if (!firstPageUrl) return null;
  const { rawOutPath, webpOutPath } = coverPathsForChapter(permalink, firstPageUrl);
  return fetchAndCacheCover({
    cacheKey: chapterCoverKey(permalink),
    coverUrl: firstPageUrl,
    rawOutPath,
    webpOutPath,
    onPhase,
  });
}

/**
 * Opportunistic local-first + lazy background cover hydration for a series.
 */
export async function getOrHydrateSeriesCover(
  permalink: string,
  seriesType?: string | null,
  onPhase?: (phase: "downloading" | "processing") => void,
): Promise<string | null> {
  if (!permalink) return null;
  const local = await getLocalSeriesCover(permalink);
  if (local) return local;

  // Check if series metadata is already cached
  let coverUrl: string | null = null;
  const seriesCached = await getCached(seriesKey(permalink));
  if (seriesCached?.json_payload) {
    try {
      const s = JSON.parse(seriesCached.json_payload) as Series;
      coverUrl = s.cover ?? null;
    } catch (parseErr) {
      log.warn("api/series", `seriesCached JSON parse failed for "${permalink}":`, parseErr);
    }
  }
  if (!coverUrl) {
    try {
      onPhase?.("downloading");
      const s = await fetchSeries(permalink, false, seriesType || undefined);
      coverUrl = s.cover ?? null;
    } catch (err) {
      log.debug("api/series", "fetchSeries failed for", permalink, err);
      return null;
    }
  }

  if (!coverUrl) return null;
  return getSeriesCover(permalink, coverUrl, onPhase);
}

/**
 * Opportunistic local-first + lazy background cover hydration for any feed item.
 * 1. Checks SQLite for existing cover.
 * 2. If series/doujin permalink provided, downloads series cover.
 * 3. Fallback for standalone chapters / oneshots: loads chapter page 1 as cover art.
 */
export interface HydrateItemCoverOpts {
  coverKey: string;
  chapterPermalink: string;
  seriesOrGroupPermalink?: string | null;
  seriesType?: string | null;
  onPhase?: (phase: "downloading" | "processing") => void;
}

export async function getOrHydrateItemCover(opts: HydrateItemCoverOpts): Promise<string | null> {
  const { coverKey, chapterPermalink, seriesOrGroupPermalink, seriesType, onPhase } = opts;
  if (!coverKey) return null;
  const local = await getLocalCover(coverKey);
  if (local) return local;

  // 1. If it has a series cover key and series permalink, try fetching series cover
  if (coverKey.startsWith("series:") && seriesOrGroupPermalink) {
    const seriesCover = await getOrHydrateSeriesCover(seriesOrGroupPermalink, seriesType, onPhase);
    if (seriesCover) {
      onPhase?.("processing");
      await setCached(`cover:${coverKey}`, "cover", seriesCover);
      return seriesCover;
    }
  }

  // 2. Standalone chapter / oneshot fallback: fetch chapter metadata and use Page 1
  try {
    onPhase?.("downloading");
    const ch = await fetchChapter(chapterPermalink);
    if (ch?.pages && ch.pages.length > 0 && ch.pages[0].url) {
      const page1Cover = await getChapterCover(chapterPermalink, ch.pages[0].url, onPhase);
      if (page1Cover) {
        onPhase?.("processing");
        await setCached(`cover:${coverKey}`, "cover", page1Cover);
        return page1Cover;
      }
    }
  } catch (err) {
    log.warn("api/series", `getOrHydrateItemCover fallback failed for chapter "${chapterPermalink}":`, err);
  }
  return null;
}
