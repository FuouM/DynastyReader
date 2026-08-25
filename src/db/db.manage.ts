import { query, execute } from "./client";
import { DB_NAME } from "../stores";
import * as ipc from "../ipc";

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
}

export interface DbStats {
  file: DbFileStats;
  counts: DbTableCounts;
  totalRows: number;
}

const ALLOWED_COUNT_TABLES = new Set<string>([
  "followed_series",
  "reading_progress",
  "reading_history",
  "bookmarks",
  "cached_metadata",
  "cached_pages",
  "tag_blacklist",
  "series_blacklist",
  "collections",
  "collection_items",
  "directory_entries",
]);

async function countTable(table: string): Promise<number> {
  if (!ALLOWED_COUNT_TABLES.has(table)) {
    console.warn(`[db.manage] countTable rejected unapproved table name: "${table}"`);
    return 0;
  }
  try {
    const rows = await query<{ c: number }>(`SELECT COUNT(*) as c FROM ${table}`);
    return rows[0]?.c ?? 0;
  } catch (err) {
    console.warn(`[db.manage] countTable failed for "${table}":`, err);
    return 0;
  }
}

/** File size for the main db + wal/shm sidecars. */
export async function getDbFileStats(): Promise<DbFileStats> {
  try {
    const batch = await ipc.dirStatBatch([DB_NAME, `${DB_NAME}-wal`, `${DB_NAME}-shm`]);
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
    console.warn("[db.manage] dirStatBatch failed, attempting single dirStat fallback:", err);
    try {
      const single = await ipc.dirStat(DB_NAME);
      const total = single?.total_bytes ?? 0;
      return { dbSizeBytes: total, walSizeBytes: 0, shmSizeBytes: 0, totalSizeBytes: total };
    } catch (fallbackErr) {
      console.warn("[db.manage] dirStat single fallback failed:", fallbackErr);
      return { dbSizeBytes: 0, walSizeBytes: 0, shmSizeBytes: 0, totalSizeBytes: 0 };
    }
  }
}

/** Row counts for every table. */
export async function getDbTableCounts(): Promise<DbTableCounts> {
  const [
    followedSeries,
    readingProgress,
    readingHistory,
    bookmarks,
    cachedMetadata,
    cachedPages,
    tagBlacklist,
    seriesBlacklist,
    collections,
    collectionItems,
    directoryEntries,
  ] = await Promise.all([
    countTable("followed_series"),
    countTable("reading_progress"),
    countTable("reading_history"),
    countTable("bookmarks"),
    countTable("cached_metadata"),
    countTable("cached_pages"),
    countTable("tag_blacklist"),
    countTable("series_blacklist"),
    countTable("collections"),
    countTable("collection_items"),
    countTable("directory_entries"),
  ]);
  return {
    followedSeries,
    readingProgress,
    readingHistory,
    bookmarks,
    cachedMetadata,
    cachedPages,
    tagBlacklist,
    seriesBlacklist,
    collections,
    collectionItems,
    directoryEntries,
  };
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
  ];
  const statements = tables.map((t) => `DELETE FROM ${t}`);
  // Use batch for atomicity where supported; fallback to sequential
  try {
    await ipc.dbExecuteBatch(DB_NAME, statements);
  } catch (err) {
    console.warn("[db.manage] batch wipe failed, falling back to sequential:", err);
    for (const sql of statements) {
      try {
        await execute(sql, []);
      } catch (stmtErr) {
        console.warn(`[db.manage] sequential wipe statement failed (${sql}):`, stmtErr);
      }
    }
  }
  // Shrink file
  try {
    await execute("VACUUM", []);
  } catch (err) {
    console.warn("[db.manage] VACUUM after wipe failed:", err);
  }
  // Reset sqlite_sequence if present
  try {
    await execute("DELETE FROM sqlite_sequence", []);
  } catch (err) {
    console.warn("[db.manage] sqlite_sequence reset after wipe failed:", err);
  }
}

/** Creates a timestamped backup via VACUUM INTO. Returns backup filename and size. */
export async function backupDatabase(): Promise<ipc.DbBackupResult> {
  return ipc.dbBackup(DB_NAME);
}

export async function listDatabaseBackups(): Promise<ipc.DbBackupEntry[]> {
  const res = await ipc.dbListBackups(DB_NAME);
  return res.backups ?? [];
}

export async function restoreDatabase(backupFilename: string): Promise<ipc.DbRestoreResult> {
  return ipc.dbRestore(DB_NAME, backupFilename);
}

export async function restoreDatabaseFromPath(sourcePath: string): Promise<ipc.DbRestoreResult> {
  return ipc.dbRestoreFromPath(DB_NAME, sourcePath);
}
