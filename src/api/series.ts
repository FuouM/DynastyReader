import { absUrl, COVERS_PREFIX, SITE_ROOT } from "../stores";
import { getCached, setCached, deleteCached, updateFollowedSeriesCover } from "../db";
import { httpGetText, httpDownloadFull, fileDelete, fileExists, fileResolve } from "./client";
import { fetchChapter } from "./chapter";
import * as ipc from "../ipc";
import type { Series } from "../types/api";

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
  const { absolutePath: absRawPath, sizeBytes } = await httpDownloadFull(url, rawOutPath, 30000);

  // If the cover is already small (<= 100KB), keep the original download and do not convert.
  if (sizeBytes > 0 && sizeBytes <= 100_000) {
    return absRawPath;
  }

  let finalPath = absRawPath;
  try {
    const convResp = await ipc.ephemeralConvertImages({
      quality: 75,
      maxDimension: 256,
      maxBytes: 100_000,
      conversions: [[rawOutPath, webpOutPath]],
    });
    const results = convResp.converted;
    if (results && results.length > 0 && results[0].output_path && !results[0].error) {
      finalPath = results[0].output_path;
      // Clean up the bulky raw download.
      try {
        await fileDelete(rawOutPath);
      } catch {}
    }
  } catch (err) {
    console.warn("Failed to transcode cover to WebP, keeping raw download:", err);
  }

  return finalPath;
}

/** Ordered candidate JSON endpoints for a series-style permalink. */
export function seriesEndpoints(permalink: string, preferredType?: string): string[] {
  const enc = encodeURIComponent(permalink);
  const typeMap: Record<string, string> = {
    series: `${SITE_ROOT}/series/${enc}.json`,
    anthology: `${SITE_ROOT}/anthologies/${enc}.json`,
    doujin: `${SITE_ROOT}/doujins/${enc}.json`,
    doujinshi: `${SITE_ROOT}/doujins/${enc}.json`,
    issue: `${SITE_ROOT}/issues/${enc}.json`,
    author: `${SITE_ROOT}/authors/${enc}.json`,
    artist: `${SITE_ROOT}/authors/${enc}.json`,
    scanlator: `${SITE_ROOT}/scanlators/${enc}.json`,
    group: `${SITE_ROOT}/scanlators/${enc}.json`,
    pairing: `${SITE_ROOT}/pairings/${enc}.json`,
    tag: `${SITE_ROOT}/tags/${enc}.json`,
    general: `${SITE_ROOT}/tags/${enc}.json`,
  };

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

  const preferredUrl = preferredType ? typeMap[preferredType.toLowerCase()] : undefined;
  return preferredUrl
    ? [preferredUrl, ...defaultEndpoints.filter((u) => u !== preferredUrl)]
    : defaultEndpoints;
}

/** Series / anthology / doujin / author / tag detail. `force` skips the cache (used by the Refresh button). */
export async function fetchSeries(
  permalink: string,
  force = false,
  preferredType?: string,
): Promise<Series> {
  const key = `series:${permalink}`;
  if (!force) {
    const cached = await getCached(key);
    if (cached) return JSON.parse(cached.json_payload) as Series;
  }

  let lastErr: Error | null = null;
  const cached = await getCached(key);
  const headers: Record<string, string> = {};
  if (cached?.etag) {
    headers["If-None-Match"] = cached.etag;
  }

  for (const url of seriesEndpoints(permalink, preferredType)) {
    try {
      const { status, body, etag } = await httpGetText(url, { headers });
      if (status === 304 && cached) {
        return JSON.parse(cached.json_payload) as Series;
      }
      if (status === 200 && body) {
        await setCached(key, "series", body, etag);
        return JSON.parse(body) as Series;
      }
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
    }
  }

  if (cached) {
    return JSON.parse(cached.json_payload) as Series;
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
  const key = `cover:series:${permalink}`;
  const cached = await getCached(key);
  if (cached && cached.json_payload) {
    // The cached path may point at a file that was purged (e.g. "Clear Cached
    // Covers"). Verify on disk before trusting it; purge + refetch when stale.
    try {
      if (await fileExists(cached.json_payload)) return cached.json_payload;
    } catch {}
    await deleteCached(key);
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
    } catch {}
  }
  const fresh = await getOrHydrateSeriesCover(permalink);
  if (fresh) {
    try {
      await updateFollowedSeriesCover(permalink, fresh);
    } catch {
      // The DB write must never break cover rendering; the fresh path still wins.
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
  const key = `cover:chapter:${permalink}`;
  const cached = await getCached(key);
  if (cached && cached.json_payload) {
    try {
      if (await fileExists(cached.json_payload)) return cached.json_payload;
    } catch {}
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
  const seriesCached = await getCached(`series:${permalink}`);
  let coverUrl: string | null = null;
  if (seriesCached?.json_payload) {
    try {
      const s = JSON.parse(seriesCached.json_payload) as Series;
      coverUrl = s.cover;
    } catch {}
  }

  if (!coverUrl) {
    try {
      const s = await fetchSeries(permalink, false, seriesType || undefined);
      coverUrl = s.cover;
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
  } catch {}

  return null;
}
