import { absUrl, COVERS_PREFIX, isMobile } from "../stores";
import { getCached, setCached, deleteCached } from "../db";
import { httpDownloadFull } from "./http";
import { fileDelete, fileExists } from "./fs";
import * as ipc from "../ipc";
import { log } from "../utils/log";

const COVER_DOWNLOAD_TIMEOUT_MS = 30_000;
const COVER_SKIP_TRANSCODE_THRESHOLD_BYTES = 100_000;
const COVER_WEBP_QUALITY = 75;
const COVER_MAX_DIMENSION_PX = 256;
const COVER_WEBP_MAX_BYTES = 100_000;

function coverExtension(url: string): string {
  const m = /\.([a-zA-Z0-9]+)(?:\?.*)?$/.exec(url);
  return m ? m[1] : "jpg";
}

async function transcodeCover(url: string, rawOutPath: string, webpOutPath: string): Promise<string> {
  const { absolutePath: absRawPath, sizeBytes } = await httpDownloadFull(url, rawOutPath, COVER_DOWNLOAD_TIMEOUT_MS);
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
      try {
        await fileDelete(rawOutPath);
      } catch (delErr) {
        log.debug("api/cover-pipeline", `raw cover delete failed for ${rawOutPath}:`, delErr);
      }
    }
  } catch (err) {
    log.warn("api/cover-pipeline", "Failed to transcode cover to WebP, keeping raw download:", err);
  }
  return finalPath;
}

/**
 * Common cached-cover helper: checks SQLite cache + disk, otherwise downloads + transcodes.
 * Returns the absolute path or null.
 */
export async function fetchAndCacheCover(opts: {
  cacheKey: string;
  coverUrl: string;
  rawOutPath: string;
  webpOutPath: string;
  onPhase?: (phase: "downloading" | "processing") => void;
}): Promise<string | null> {
  const { cacheKey, coverUrl, rawOutPath, webpOutPath, onPhase } = opts;
  if (!coverUrl) return null;
  const cached = await getCached(cacheKey);
  if (cached && cached.json_payload) {
    try {
      if (await fileExists(cached.json_payload)) return cached.json_payload;
    } catch (checkErr) {
      log.debug("api/cover-pipeline", `cover file existence check failed for ${cached.json_payload}:`, checkErr);
    }
    // Stale DB entry — purge so fresh download can set new path
    await deleteCached(cacheKey);
  }
  if (cacheKey.startsWith("cover:chapter:")) {
    // Chapter covers may have stale raw download — purge implied via delete above
  }
  onPhase?.("downloading");
  const finalPath = await transcodeCover(absUrl(coverUrl), rawOutPath, webpOutPath);
  onPhase?.("processing");
  await setCached(cacheKey, "cover", finalPath);
  return finalPath;
}

export function coverPathsForSeries(permalink: string, coverUrl: string): { rawOutPath: string; webpOutPath: string } {
  const ext = coverExtension(coverUrl);
  return {
    rawOutPath: `${COVERS_PREFIX}/raw_${permalink}.${ext}`,
    webpOutPath: `${COVERS_PREFIX}/${permalink}.webp`,
  };
}

export function coverPathsForChapter(permalink: string, firstPageUrl: string): { rawOutPath: string; webpOutPath: string } {
  const ext = coverExtension(firstPageUrl);
  return {
    rawOutPath: `${COVERS_PREFIX}/raw_ch_${permalink}.${ext}`,
    webpOutPath: `${COVERS_PREFIX}/ch_${permalink}.webp`,
  };
}
