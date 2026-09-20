/**
 * MangaDex Database Statistics & File Metrics
 * Reports real file sizes and table row counts for mangadex.db.
 */

import { query } from "./client";
import { initMangaDexDb } from "./schema";
import * as ipc from "../../../ipc";
import type { DbStats } from "../../../db/db.manage";

export async function getMangaDexDbStats(): Promise<DbStats> {
  await initMangaDexDb();

  // 1. File size stats
  let dbSizeBytes = 0;
  let walSizeBytes = 0;
  let shmSizeBytes = 0;
  try {
    const batch = await ipc.dirStatBatch(["mangadex.db", "mangadex.db-wal", "mangadex.db-shm"]);
    const items = batch?.items ?? [];
    dbSizeBytes = items[0]?.total_bytes ?? 0;
    walSizeBytes = items[1]?.total_bytes ?? 0;
    shmSizeBytes = items[2]?.total_bytes ?? 0;
  } catch (err) {
    console.warn("[MangaDex] Failed to stat mangadex.db files:", err);
  }

  // 2. Table row counts
  async function count(table: string): Promise<number> {
    try {
      const rows = await query<{ c: number }>(`SELECT COUNT(*) as c FROM ${table}`);
      return rows[0]?.c ?? 0;
    } catch {
      return 0;
    }
  }

  const [followed, progress, history, bookmarks, pages, metadata] = await Promise.all([
    count("followed_manga"),
    count("reading_progress"),
    count("reading_history"),
    count("bookmarks"),
    count("cached_pages"),
    count("cached_metadata"),
  ]);

  const totalRows = followed + progress + history + bookmarks + pages + metadata;

  return {
    file: {
      dbSizeBytes,
      walSizeBytes,
      shmSizeBytes,
      totalSizeBytes: dbSizeBytes + walSizeBytes + shmSizeBytes,
    },
    counts: {
      followedSeries: followed,
      readingProgress: progress,
      readingHistory: history,
      bookmarks: bookmarks,
      cachedMetadata: metadata,
      cachedPages: pages,
      tagBlacklist: 0,
      seriesBlacklist: 0,
      collections: 0,
      collectionItems: 0,
      directoryEntries: 0,
      localSeries: 0,
      downloadQueue: 0,
    },
    totalRows,
  };
}
