import { absUrl, COVERS_PREFIX, SITE_ROOT, isMobile } from "../stores";
import { seriesTypeToPath } from "../taxonomy";
import { getCached, setCached, deleteCached, updateFollowedSeriesCover, touchCached } from "../db";
import { seriesKey, seriesCoverKey, chapterCoverKey } from "../lib/cache-keys";
import { httpGetText, httpDownloadFull } from "./http";
import { recordCacheHit } from "./traffic";
import { fileDelete, fileExists, fileResolve } from "./fs";
import { fetchChapter } from "./chapter";
import * as ipc from "../ipc";
import type { Series } from "../types/api";
import { SeriesSchema } from "./schemas";
const COVER_DOWNLOAD_TIMEOUT_MS = 30_000;
const COVER_SKIP_TRANSCODE_THRESHOLD_BYTES = 100_000;
const COVER_WEBP_QUALITY = 75;
const COVER_MAX_DIMENSION_PX = 256;
const COVER_WEBP_MAX_BYTES = 100_000;
const SERIES_PRIMARY_TIMEOUT_MS = 15_000;
const SERIES_FALLBACK_TIMEOUT_MS = 5_000;
const SERIES_TTL_MS = 10 * 60 * 1000; // 10 minutes cache freshness

/** Extracts a file extension from a URL (falls back to jpg). */
function coverExtension(url: string): string {
  const m = /\.([a-zA-Z0-9]+)(?:\?.*)?$/.exec(url);
  return m ? m[1] : "jpg";
}

/**
 * Downloads a cover image and only transcodes it into WebP if its raw size
 * exceeds 100KB (bounded dimension + <=100KB budget via the backend media engine).
 * If the download is already <= 100KB, it keeps the raw image without conversion.
 */
async function transcodeCover(url: string, rawOutPath: string, webpOutPath: string): Promise<string> {
  const { absolutePath: absRawPath, sizeBytes } = await httpDownloadFull(url, rawOutPath, COVER_DOWNLOAD_TIMEOUT_MS);

  // If the cover is already small (<= 100KB), keep the original download and do not convert.
  if (sizeBytes > 0 && sizeBytes <= COVER_SKIP_TRANSCODE_THRESHOLD_BYTES) {
    return absRawPath;
  }

  let finalPath = absRawPath;
  try {
    const convResp = await ipc.ephemeralConvertImages({
      quality: COVER_WEBP_QUALITY,
      maxDimension: isMobile() ? 128 : COVER_MAX_DIMENSION_PX,
      maxBytes: COVER_WEBP_MAX_BYTES,
      conversions: [[rawOutPath, webpOutPath]],
    });
    const results = convResp.converted;
    if (results && results.length > 0 && results[0].output_path && !results[0].error) {
      finalPath = results[0].output_path;
      // Clean up the bulky raw download.
      try {
        await fileDelete(rawOutPath);
      } catch (delErr) {
        console.debug(`[api/series] raw cover delete failed for ${rawOutPath}:`, delErr);
      }
    }
  } catch (err) {
    console.warn("Failed to transcode cover to WebP, keeping raw download:", err);
  }

  return finalPath;
}

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

/** Series / anthology / doujin / author / tag detail with Stale-While-Revalidate caching. `force` skips the cache. */
export async function fetchSeries(
  permalink: string,
  force = false,
  preferredType?: string,
): Promise<Series> {
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
      console.warn(`[api/series] cached JSON parse failed for series "${permalink}":`, parseErr);
    }
  }

  // Stale cache: return cached immediately for 0ms latency, but revalidate in background
  if (!force && cached) {
    let parsed: Series | null = null;
    try {
      parsed = SeriesSchema.parse(JSON.parse(cached.json_payload));
    } catch (parseErr) {
      console.warn(`[api/series] stale cached JSON parse failed for series "${permalink}":`, parseErr);
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
          console.warn("dynasty-scans: background series revalidation failed:", err);
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
      console.warn(`[api/series] fallback cached JSON parse failed for series "${permalink}":`, parseErr);
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
): Promise<string | null> {
  if (!coverUrl) return null;
  const key = seriesCoverKey(permalink);
  const cached = await getCached(key);
  if (cached && cached.json_payload) {
    // The cached path may point at a file that was purged (e.g. "Clear Cached
    // Covers"). Verify on disk before trusting it; purge + refetch when stale.
    try {
      if (await fileExists(cached.json_payload)) return cached.json_payload;
    } catch (checkErr) {
      console.debug(`[api/series] cover file existence check failed for ${cached.json_payload}:`, checkErr);
    }
  }
  const ext = coverExtension(coverUrl);
  const rawOutPath = `${COVERS_PREFIX}/raw_${permalink}.${ext}`;
  const webpOutPath = `${COVERS_PREFIX}/${permalink}.webp`;

  // Download the original cover and only transcode to WebP if raw download exceeds 100KB.
  const finalPath = await transcodeCover(absUrl(coverUrl), rawOutPath, webpOutPath);

  await setCached(key, "cover", finalPath);
  return finalPath;
}

/**
 * Ensures a followed series' stored cover path still points at a real file.
 * Cache clears delete the cover file but leave `followed_series.cover`
 * stale; when the path is gone, refetch the thumbnail and persist the new
 * path so the Library never renders a dead image.
 */
export async function refreshFollowedSeriesCover(
  permalink: string,
  currentCover: string | null,
): Promise<string | null> {
  if (currentCover) {
    try {
      if (await fileExists(currentCover)) return currentCover;
    } catch (checkErr) {
      console.debug(`[api/series] currentCover fileExists check failed for ${currentCover}:`, checkErr);
    }
  }
  const fresh = await getOrHydrateSeriesCover(permalink);
  if (fresh) {
    try {
      await updateFollowedSeriesCover(permalink, fresh);
    } catch (dbErr) {
      // The DB write must never break cover rendering; the fresh path still wins.
      console.warn(`[api/series] updateFollowedSeriesCover DB write failed for "${permalink}":`, dbErr);
    }
  }
  return fresh;
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

  // Verify file still exists on disk
  if (await fileResolve(cached.json_payload)) return cached.json_payload;

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
): Promise<string | null> {
  if (!firstPageUrl) return null;
  const key = chapterCoverKey(permalink);
  const cached = await getCached(key);
  if (cached && cached.json_payload) {
    try {
      if (await fileExists(cached.json_payload)) return cached.json_payload;
    } catch (checkErr) {
      console.debug(`[api/series] chapter cover fileExists check failed for ${cached.json_payload}:`, checkErr);
    }
    await deleteCached(key);
  }

  const ext = coverExtension(firstPageUrl);
  const rawOutPath = `${COVERS_PREFIX}/raw_ch_${permalink}.${ext}`;
  const webpOutPath = `${COVERS_PREFIX}/ch_${permalink}.webp`;

  // Download the raw first page and only transcode to WebP if raw download exceeds 100KB.
  const finalPath = await transcodeCover(absUrl(firstPageUrl), rawOutPath, webpOutPath);

  await setCached(key, "cover", finalPath);
  return finalPath;
}

/**
 * Opportunistic local-first + lazy background cover hydration for a series.
 */
export async function getOrHydrateSeriesCover(
  permalink: string,
  seriesType?: string | null,
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
      console.warn(`[api/series] seriesCached JSON parse failed for "${permalink}":`, parseErr);
    }
  }
  if (!coverUrl) {
    try {
      const s = await fetchSeries(permalink, false, seriesType || undefined);
      coverUrl = s.cover ?? null;
    } catch {
      return null;
    }
  }

  if (!coverUrl) return null;
  return getSeriesCover(permalink, coverUrl);
}

/**
 * Opportunistic local-first + lazy background cover hydration for any feed item.
 * 1. Checks SQLite for existing cover.
 * 2. If series/doujin permalink provided, downloads series cover.
 * 3. Fallback for standalone chapters / oneshots: loads chapter page 1 as cover art.
 */
export async function getOrHydrateItemCover(
  coverKey: string,
  chapterPermalink: string,
  seriesOrGroupPermalink?: string | null,
  seriesType?: string | null,
): Promise<string | null> {
  if (!coverKey) return null;
  const local = await getLocalCover(coverKey);
  if (local) return local;

  // 1. If it has a series cover key and series permalink, try fetching series cover
  if (coverKey.startsWith("series:") && seriesOrGroupPermalink) {
    const seriesCover = await getOrHydrateSeriesCover(seriesOrGroupPermalink, seriesType);
    if (seriesCover) {
      await setCached(`cover:${coverKey}`, "cover", seriesCover);
      return seriesCover;
    }
  }

  // 2. Standalone chapter / oneshot fallback: fetch chapter metadata and use Page 1
  try {
    const ch = await fetchChapter(chapterPermalink);
    if (ch?.pages && ch.pages.length > 0 && ch.pages[0].url) {
      const page1Cover = await getChapterCover(chapterPermalink, ch.pages[0].url);
      if (page1Cover) {
        await setCached(`cover:${coverKey}`, "cover", page1Cover);
        return page1Cover;
      }
    }
  } catch (err) {
    console.warn(`[api/series] getOrHydrateItemCover fallback failed for chapter "${chapterPermalink}":`, err);
  }
  return null;
}
