import * as ipc from "../ipc";
import {
  getAllCachedPagesForIntegrity,
  getAllCachedCoversForIntegrity,
  getFollowedCoversForIntegrity,
  getCollectionCoversForIntegrity,
  removeCorruptedCachedPages,
  removeCorruptedCachedCovers,
} from "../db/cache.repo";
import { updateFollowedSeriesCover } from "../db/library.repo";
import { updateCollectionItemCover } from "../db/collections.repo";
import { getCached } from "../db/metadata.repo";
import { getOrHydrateSeriesCover, getOrHydrateItemCover } from "../api/series";
import { fetchChapter } from "../api/chapter";
import { getChapterContainerTag } from "../taxonomy";
import { browseCovers } from "../browse/browse-covers";
import { log } from "../utils/log";
import type { Chapter } from "../types/api";

export interface IntegrityIssue {
  type: "page" | "cover" | "followed" | "collection";
  id: string;
  path: string;
  reason: string;
  isMissing: boolean;
  isCorrupted: boolean;
  chapterPermalink?: string;
  pageIndex?: number;
  cacheKey?: string;
  seriesPermalink?: string;
  collectionId?: number;
}

export interface IntegrityReport {
  totalScanned: number;
  totalHealthy: number;
  totalMissing: number;
  totalCorrupted: number;
  pageCount: number;
  coverCount: number;
  issues: IntegrityIssue[];
}

export interface RecoveryResult {
  recoveredCovers: number;
  queuedChapters: number;
  cleanedRecords: number;
  deletedFiles: number;
}

const BATCH_CHUNK_SIZE = 250;

/**
 * Scans all cached pages, cover metadata, and stored library cover paths.
 * Validates existence, non-zero file size, and image header integrity.
 */
export async function runIntegrityCheck(
  onProgress?: (scanned: number, total: number) => void,
): Promise<IntegrityReport> {
  log.info("cache-integrity", "Starting cache integrity scan...");

  const [pages, covers, followed, collections] = await Promise.all([
    getAllCachedPagesForIntegrity(),
    getAllCachedCoversForIntegrity(),
    getFollowedCoversForIntegrity(),
    getCollectionCoversForIntegrity(),
  ]);

  const checkItems: Array<{
    req: ipc.IntegrityCheckRequestItem;
    meta: {
      type: "page" | "cover" | "followed" | "collection";
      chapterPermalink?: string;
      pageIndex?: number;
      cacheKey?: string;
      seriesPermalink?: string;
      collectionId?: number;
    };
  }> = [];

  for (const p of pages) {
    checkItems.push({
      req: { id: `page:${p.chapter_permalink}:${p.page_index}`, path: p.file_path },
      meta: { type: "page", chapterPermalink: p.chapter_permalink, pageIndex: p.page_index },
    });
  }

  for (const c of covers) {
    checkItems.push({
      req: { id: `cover:${c.cache_key}`, path: c.json_payload },
      meta: { type: "cover", cacheKey: c.cache_key },
    });
  }

  for (const f of followed) {
    checkItems.push({
      req: { id: `followed:${f.permalink}`, path: f.cover },
      meta: { type: "followed", seriesPermalink: f.permalink },
    });
  }

  for (const col of collections) {
    checkItems.push({
      req: { id: `collection:${col.id}`, path: col.cover },
      meta: { type: "collection", collectionId: col.id, seriesPermalink: col.item_permalink },
    });
  }

  const total = checkItems.length;
  let scanned = 0;
  let totalHealthy = 0;
  let totalMissing = 0;
  let totalCorrupted = 0;
  const issues: IntegrityIssue[] = [];

  for (let i = 0; i < total; i += BATCH_CHUNK_SIZE) {
    const chunk = checkItems.slice(i, i + BATCH_CHUNK_SIZE);
    const reqs = chunk.map((c) => c.req);

    try {
      const results = await ipc.verifyFileIntegrityBatch(reqs);
      for (let j = 0; j < results.length; j++) {
        const res = results[j];
        const itemMeta = chunk[j].meta;

        if (res.exists && res.is_valid) {
          totalHealthy++;
        } else if (!res.exists) {
          totalMissing++;
          issues.push({
            type: itemMeta.type,
            id: res.id,
            path: res.path,
            reason: res.error || "Missing from disk",
            isMissing: true,
            isCorrupted: false,
            chapterPermalink: itemMeta.chapterPermalink,
            pageIndex: itemMeta.pageIndex,
            cacheKey: itemMeta.cacheKey,
            seriesPermalink: itemMeta.seriesPermalink,
            collectionId: itemMeta.collectionId,
          });
        } else {
          totalCorrupted++;
          issues.push({
            type: itemMeta.type,
            id: res.id,
            path: res.path,
            reason: res.error || "Corrupted image file",
            isMissing: false,
            isCorrupted: true,
            chapterPermalink: itemMeta.chapterPermalink,
            pageIndex: itemMeta.pageIndex,
            cacheKey: itemMeta.cacheKey,
            seriesPermalink: itemMeta.seriesPermalink,
            collectionId: itemMeta.collectionId,
          });
        }
      }
    } catch (batchErr) {
      log.error("cache-integrity", "Batch verification error:", batchErr);
    }

    scanned += chunk.length;
    onProgress?.(scanned, total);
  }

  log.info("cache-integrity", `Scan complete: ${totalHealthy} healthy, ${totalMissing} missing, ${totalCorrupted} corrupted out of ${total}`);

  return {
    totalScanned: total,
    totalHealthy,
    totalMissing,
    totalCorrupted,
    pageCount: pages.length,
    coverCount: covers.length + followed.length + collections.length,
    issues,
  };
}

/**
 * Recovers missing or corrupted files:
 * 1. Batch deletes 0-byte or corrupted files from disk.
 * 2. Purges stale/corrupted records from SQLite.
 * 3. Re-downloads covers from upstream.
 * 4. Queues chapters with missing/corrupted pages into the background download queue.
 */
export async function runIntegrityRecovery(
  issues: IntegrityIssue[],
  onProgress?: (phase: string, current: number, total: number) => void,
): Promise<RecoveryResult> {
  if (issues.length === 0) {
    return { recoveredCovers: 0, queuedChapters: 0, cleanedRecords: 0, deletedFiles: 0 };
  }

  let deletedFiles = 0;
  let cleanedRecords = 0;
  let recoveredCovers = 0;
  let queuedChapters = 0;

  // Phase 1: Delete corrupted files from disk
  const corruptedPaths = issues.filter((it) => it.isCorrupted).map((it) => it.path);
  if (corruptedPaths.length > 0) {
    onProgress?.("deleting_corrupt", 0, corruptedPaths.length);
    try {
      deletedFiles = await ipc.fileDeleteBatch(corruptedPaths);
    } catch (delErr) {
      log.error("cache-integrity", "Failed to delete corrupted files:", delErr);
    }
  }

  // Phase 2: Clean invalid database records
  const corruptedPages = issues
    .filter((it) => it.type === "page" && it.chapterPermalink && it.pageIndex !== undefined)
    .map((it) => ({ chapterPermalink: it.chapterPermalink!, pageIndex: it.pageIndex! }));

  if (corruptedPages.length > 0) {
    onProgress?.("cleaning_db", 0, corruptedPages.length);
    try {
      await removeCorruptedCachedPages(corruptedPages);
      cleanedRecords += corruptedPages.length;
    } catch (err) {
      log.error("cache-integrity", "Failed to remove corrupted cached pages:", err);
    }
  }

  const corruptedCoverKeys = issues
    .filter((it) => it.type === "cover" && it.cacheKey)
    .map((it) => it.cacheKey!);

  if (corruptedCoverKeys.length > 0) {
    try {
      await removeCorruptedCachedCovers(corruptedCoverKeys);
      cleanedRecords += corruptedCoverKeys.length;
    } catch (err) {
      log.error("cache-integrity", "Failed to remove corrupted cached covers:", err);
    }
  }

  for (const it of issues) {
    if (it.type === "followed" && it.seriesPermalink) {
      void updateFollowedSeriesCover(it.seriesPermalink, null, false);
      cleanedRecords++;
    } else if (it.type === "collection" && it.collectionId) {
      void updateCollectionItemCover(it.collectionId, "");
      cleanedRecords++;
    }
  }

  try {
    browseCovers.clearMemoryCache();
  } catch {
    // Non-fatal
  }

  // Phase 3: Re-download covers
  const coverIssues = issues.filter((it) => it.type === "cover" || it.type === "followed" || it.type === "collection");
  if (coverIssues.length > 0) {
    onProgress?.("recovering_covers", 0, coverIssues.length);
    let coverIdx = 0;
    for (const it of coverIssues) {
      coverIdx++;
      onProgress?.("recovering_covers", coverIdx, coverIssues.length);

      try {
        if (it.type === "cover" && it.cacheKey) {
          if (it.cacheKey.startsWith("cover:series:")) {
            const permalink = it.cacheKey.replace(/^cover:series:/, "");
            const res = await getOrHydrateSeriesCover(permalink);
            if (res) recoveredCovers++;
          } else if (it.cacheKey.startsWith("cover:chapter:")) {
            const permalink = it.cacheKey.replace(/^cover:chapter:/, "");
            const res = await getOrHydrateItemCover({
              coverKey: `chapter:${permalink}`,
              chapterPermalink: permalink,
            });
            if (res) recoveredCovers++;
          }
        } else if (it.type === "followed" && it.seriesPermalink) {
          const fresh = await getOrHydrateSeriesCover(it.seriesPermalink);
          if (fresh) {
            await updateFollowedSeriesCover(it.seriesPermalink, fresh, false);
            recoveredCovers++;
          }
        } else if (it.type === "collection" && it.collectionId && it.seriesPermalink) {
          const fresh = await getOrHydrateSeriesCover(it.seriesPermalink);
          if (fresh) {
            await updateCollectionItemCover(it.collectionId, fresh);
            recoveredCovers++;
          }
        }
      } catch (covErr) {
        log.debug("cache-integrity", `Failed to recover cover ${it.id}:`, covErr);
      }
    }
  }

  // Phase 4: Queue chapters with missing/corrupted pages for repair
  const affectedChapterPermalinks = Array.from(
    new Set(
      issues
        .filter((it) => it.type === "page" && it.chapterPermalink)
        .map((it) => it.chapterPermalink!),
    ),
  );

  if (affectedChapterPermalinks.length > 0) {
    onProgress?.("queuing_chapters", 0, affectedChapterPermalinks.length);
    const downloadRequests: ipc.DownloadRequest[] = [];

    let chIdx = 0;
    for (const cp of affectedChapterPermalinks) {
      chIdx++;
      onProgress?.("queuing_chapters", chIdx, affectedChapterPermalinks.length);

      try {
        let seriesPermalink = "";
        let seriesTitle = "";
        let chapterTitle = cp;

        // Try reading cached chapter metadata first (offline safe)
        const cachedMeta = await getCached(`chapter:${cp}`);
        let ch: Chapter | null = null;
        if (cachedMeta?.json_payload) {
          try {
            ch = JSON.parse(cachedMeta.json_payload) as Chapter;
          } catch {
            // parse error
          }
        }

        // If not cached, fetch from API
        if (!ch) {
          ch = await fetchChapter(cp);
        }

        if (ch) {
          const containerTag = getChapterContainerTag(ch.tags);
          seriesPermalink = containerTag ? containerTag.permalink : cp;
          seriesTitle = containerTag ? containerTag.name : (ch.title || cp);
          chapterTitle = ch.title || cp;
        }
        if (seriesPermalink) {
          downloadRequests.push({
            series_permalink: seriesPermalink,
            series_title: seriesTitle,
            chapter_permalink: cp,
            chapter_title: chapterTitle,
            chapter_index: 0,
          });
        }
      } catch (chErr) {
        log.debug("cache-integrity", `Failed to resolve chapter metadata for ${cp}:`, chErr);
      }
    }

    if (downloadRequests.length > 0) {
      try {
        const enq = await ipc.enqueueChapters(downloadRequests);
        queuedChapters = enq.queued_count + enq.already_queued_count;
        log.info("cache-integrity", `Queued ${queuedChapters} chapters to restore missing pages.`);
      } catch (enqErr) {
        log.error("cache-integrity", "Failed to enqueue repair chapters:", enqErr);
      }
    }
  }

  log.info("cache-integrity", `Recovery complete: ${recoveredCovers} covers restored, ${queuedChapters} chapters queued, ${cleanedRecords} records cleaned, ${deletedFiles} files deleted.`);

  return {
    recoveredCovers,
    queuedChapters,
    cleanedRecords,
    deletedFiles,
  };
}
