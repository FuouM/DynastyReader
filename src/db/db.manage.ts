import { query, execute } from "./client";
import { DB_NAME } from "../constants";
import * as ipc from "../ipc";
import { log } from "../utils/log";
import { initBlacklistCache, notifyBlacklistChanged } from "./blacklist.repo";
import { notifyFollowedChanged, notifyBookmarksChanged, notifyHistoryChanged } from "./library-notifiers";
import { notifyCollectionsChanged } from "./collections.repo";
import { notifyLocalChanged } from "./local.repo";
export interface DbFileStats {
  dbSizeBytes: number;
  walSizeBytes: number;
  shmSizeBytes: number;
  totalSizeBytes: number;
}

export interface DbTableCounts {
  followedSeries: number;
  readingProgress: number;
  readingHistory: number;
  bookmarks: number;
  cachedMetadata: number;
  cachedPages: number;
  tagBlacklist: number;
  seriesBlacklist: number;
  collections: number;
  collectionItems: number;
  directoryEntries: number;
  localSeries: number;
  downloadQueue: number;
}

export interface DbStats {
  file: DbFileStats;
  counts: DbTableCounts;
  totalRows: number;
}

/** DbTableCounts field → table it counts. */
const COUNT_TABLES: Record<keyof DbTableCounts, string> = {
  followedSeries: "followed_series",
  readingProgress: "reading_progress",
  readingHistory: "reading_history",
  bookmarks: "bookmarks",
  cachedMetadata: "cached_metadata",
  cachedPages: "cached_pages",
  tagBlacklist: "tag_blacklist",
  seriesBlacklist: "series_blacklist",
  collections: "collections",
  collectionItems: "collection_items",
  directoryEntries: "directory_entries",
  localSeries: "local_series",
  downloadQueue: "download_queue",
};

async function countTable(table: string): Promise<number> {
  try {
    const rows = await query<{ c: number }>(`SELECT COUNT(*) as c FROM ${table}`);
    return rows[0]?.c ?? 0;
  } catch (err) {
    log.warn("db/manage", `countTable failed for "${table}":`, err);
    return 0;
  }
}

/** File size for the main db + wal/shm sidecars. */
export async function getDbFileStats(dbName: string = DB_NAME): Promise<DbFileStats> {
  try {
    const batch = await ipc.dirStatBatch([dbName, `${dbName}-wal`, `${dbName}-shm`]);
    const items = batch?.items ?? [];
    const dbSizeBytes = items[0]?.total_bytes ?? 0;
    const walSizeBytes = items[1]?.total_bytes ?? 0;
    const shmSizeBytes = items[2]?.total_bytes ?? 0;
    return {
      dbSizeBytes,
      walSizeBytes,
      shmSizeBytes,
      totalSizeBytes: dbSizeBytes + walSizeBytes + shmSizeBytes,
    };
  } catch (err) {
    log.warn("db/manage", "dirStatBatch failed, attempting single dirStat fallback:", err);
    try {
      const single = await ipc.dirStat(dbName);
      const total = single?.total_bytes ?? 0;
      return { dbSizeBytes: total, walSizeBytes: 0, shmSizeBytes: 0, totalSizeBytes: total };
    } catch (fallbackErr) {
      log.warn("db/manage", "dirStat single fallback failed:", fallbackErr);
      return { dbSizeBytes: 0, walSizeBytes: 0, shmSizeBytes: 0, totalSizeBytes: 0 };
    }
  }
}

/** Row counts for every table. */
async function getDbTableCounts(): Promise<DbTableCounts> {
  const entries = await Promise.all(
    Object.entries(COUNT_TABLES).map(async ([key, table]) => [key, await countTable(table)] as const),
  );
  return Object.fromEntries(entries) as Record<keyof DbTableCounts, number>;
}

export async function getDbStats(): Promise<DbStats> {
  const [file, counts] = await Promise.all([getDbFileStats(), getDbTableCounts()]);
  const totalRows = Object.values(counts).reduce((a, b) => a + b, 0);
  return { file, counts, totalRows };
}

/** Deletes all rows from every app table and vacuums. Keeps schema. */
export async function wipeDatabase(): Promise<void> {
  const tables = [
    "followed_series",
    "reading_progress",
    "reading_history",
    "bookmarks",
    "cached_metadata",
    "cached_pages",
    "tag_blacklist",
    "series_blacklist",
    "collection_items",
    "collections",
    "directory_entries",
    "local_series",
    "download_queue",
  ];
  const statements = tables.map((t) => `DELETE FROM ${t}`);
  // Use batch for atomicity where supported; fallback to sequential
  try {
    await ipc.dbExecuteBatch(DB_NAME, statements);
  } catch (err) {
    log.warn("db/manage", "batch wipe failed, falling back to sequential:", err);
    for (const sql of statements) {
      try {
        await execute(sql, []);
      } catch (stmtErr) {
        log.warn("db/manage", `sequential wipe statement failed (${sql}):`, stmtErr);
      }
    }
  }
  // Re-seed the default "Favorites" collection (migrations only seed it on v1
  // and do not re-run after a wipe since user_version stays unchanged).
  try {
    await execute(
      `INSERT OR IGNORE INTO collections (id, name, is_default, created_at) VALUES (1, 'Favorites', 1, ?)`,
      [Date.now()],
    );
  } catch (err) {
    log.warn("db/manage", "re-seeding Favorites after wipe failed:", err);
  }
  // Shrink file
  try {
    await execute("VACUUM", []);
  } catch (err) {
    log.warn("db/manage", "VACUUM after wipe failed:", err);
  }
  // Reset sqlite_sequence if present
  try {
    await execute("DELETE FROM sqlite_sequence", []);
  } catch (err) {
    log.warn("db/manage", "sqlite_sequence reset after wipe failed:", err);
  }
  // Reset in-memory blacklist cache so cleared blacklist takes immediate effect
  try {
    await initBlacklistCache();
    notifyBlacklistChanged();
  } catch (err) {
    log.warn("db/manage", "re-initializing blacklist cache after wipe failed:", err);
  }
  notifyFollowedChanged();
  notifyBookmarksChanged();
  notifyHistoryChanged();
  notifyCollectionsChanged();
  notifyLocalChanged();
}

/** Creates a timestamped backup via VACUUM INTO. Returns backup filename and size. */
export async function backupDatabase(): Promise<ipc.DbBackupResult> {
  return ipc.dbBackup(DB_NAME);
}

export async function restoreDatabaseFromPath(sourcePath: string): Promise<ipc.DbRestoreResult> {
  return ipc.dbRestoreFromPath(DB_NAME, sourcePath);
}
