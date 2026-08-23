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

async function countTable(table: string): Promise<number> {
  try {
    const rows = await query<{ c: number }>(`SELECT COUNT(*) as c FROM ${table}`);
    return rows[0]?.c ?? 0;
  } catch {
    return 0;
  }
}

/** File size for the main db + wal/shm sidecars. */
export async function getDbFileStats(): Promise<DbFileStats> {
  const extractSizes = (batch: unknown): DbFileStats | null => {
    if (!batch || typeof batch !== "object" || !("items" in batch)) return null;
    const batchRec = batch as { items?: unknown[] };
    const items = Array.isArray(batchRec.items) ? batchRec.items : [];
    const getSize = (idx: number): number => {
      const entry = items[idx];
      if (!entry || typeof entry !== "object" || !("size_bytes" in entry)) return 0;
      const v = (entry as Record<string, unknown>).size_bytes;
      return typeof v === "number" ? v : 0;
    };
    return {
      dbSizeBytes: getSize(0),
      walSizeBytes: getSize(1),
      shmSizeBytes: getSize(2),
      totalSizeBytes: getSize(0) + getSize(1) + getSize(2),
    };
  };

  try {
    const batch = await ipc.dirStatBatch([DB_NAME, `${DB_NAME}-wal`, `${DB_NAME}-shm`]);
    const parsed = extractSizes(batch);
    if (parsed) {
      // If extracted but all zero and batch was empty, fallback
      if (parsed.dbSizeBytes !== 0 || parsed.walSizeBytes !== 0 || parsed.shmSizeBytes !== 0) return parsed;
      if (parsed.totalSizeBytes === 0) {
        // try single fallback still
      } else {
        return parsed;
      }
    }
    const single = await ipc.dirStat(DB_NAME).catch(() => null);
    if (single && typeof single === "object" && "size_bytes" in single) {
      const v = (single as Record<string, unknown>).size_bytes;
      const s = typeof v === "number" ? v : 0;
      return { dbSizeBytes: s, walSizeBytes: 0, shmSizeBytes: 0, totalSizeBytes: s };
    }
    return { dbSizeBytes: 0, walSizeBytes: 0, shmSizeBytes: 0, totalSizeBytes: 0 };
  } catch {
    try {
      const r = await ipc.dirStat(DB_NAME);
      if (r && typeof r === "object" && "size_bytes" in r) {
        const v = (r as Record<string, unknown>).size_bytes;
        const s = typeof v === "number" ? v : 0;
        return { dbSizeBytes: s, walSizeBytes: 0, shmSizeBytes: 0, totalSizeBytes: s };
      }
      return { dbSizeBytes: 0, walSizeBytes: 0, shmSizeBytes: 0, totalSizeBytes: 0 };
    } catch {
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
  } catch {
    for (const sql of statements) {
      try {
        await execute(sql, []);
      } catch {}
    }
  }
  // Shrink file
  try {
    await execute("VACUUM", []);
  } catch {}
  // Reset sqlite_sequence if present
  try {
    await execute("DELETE FROM sqlite_sequence", []);
  } catch {}
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
