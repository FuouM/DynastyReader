/**
 * MangaDex Database Statistics & File Metrics
 * Reports real file sizes and table row counts for mangadex.db.
 */

import { query } from "./client";
import { initMangaDexDb } from "./schema";
import { getDbFileStats, type DbStats } from "../../../db/db.manage";

const ALLOWED_STATS_TABLES = new Set([
  "followed_manga",
  "reading_progress",
  "reading_history",
  "bookmarks",
  "cached_pages",
  "cached_metadata",
]);

export async function getMangaDexDbStats(): Promise<DbStats> {
  await initMangaDexDb();
  const file = await getDbFileStats("mangadex.db");

  // 2. Table row counts
  async function count(table: string): Promise<number> {
    if (!ALLOWED_STATS_TABLES.has(table)) {
      throw new Error(`Disallowed table name in stats query: ${table}`);
    }
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
    file,
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
