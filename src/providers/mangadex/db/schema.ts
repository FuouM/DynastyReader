/**
 * MangaDex SQLite Database Schema & Initialization
 * Operates on isolated mangadex.db via client.ts.
 */

import { execute, query } from "./client";
import { query as dynastyQuery, execute as dynastyExecute } from "../../../db/client";
import type { CachedMetadataRow } from "../../../types/db";
import { log } from "../../../utils/log";
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS followed_manga (
    manga_id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    cover_filename TEXT,
    last_checked_at INTEGER NOT NULL,
    latest_chapter_id TEXT,
    latest_chapter_title TEXT,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS reading_progress (
    chapter_id TEXT PRIMARY KEY,
    manga_id TEXT NOT NULL,
    manga_title TEXT NOT NULL,
    chapter_title TEXT NOT NULL,
    page_index INTEGER NOT NULL DEFAULT 0,
    page_total INTEGER NOT NULL DEFAULT 0,
    completed INTEGER NOT NULL DEFAULT 0,
    scanlator_name TEXT,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS reading_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chapter_id TEXT NOT NULL,
    manga_id TEXT NOT NULL,
    manga_title TEXT NOT NULL,
    chapter_title TEXT NOT NULL,
    scanlator_name TEXT,
    read_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS bookmarks (
    chapter_id TEXT PRIMARY KEY,
    manga_id TEXT NOT NULL,
    manga_title TEXT NOT NULL,
    chapter_title TEXT NOT NULL,
    page_index INTEGER NOT NULL DEFAULT 0,
    scanlator_name TEXT,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS cached_pages (
    chapter_id TEXT NOT NULL,
    page_index INTEGER NOT NULL,
    file_path TEXT NOT NULL,
    size_bytes INTEGER DEFAULT 0,
    cached_at INTEGER NOT NULL,
    PRIMARY KEY (chapter_id, page_index)
  )`,
  `CREATE TABLE IF NOT EXISTS cached_metadata (
    cache_key TEXT PRIMARY KEY,
    data_type TEXT NOT NULL,
    json_payload TEXT NOT NULL,
    cached_at INTEGER NOT NULL,
    etag TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_mdx_history_read_at ON reading_history(read_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_mdx_progress_manga ON reading_progress(manga_id)`,
  `CREATE INDEX IF NOT EXISTS idx_mdx_cached_pages_chapter ON cached_pages(chapter_id)`,
  `CREATE INDEX IF NOT EXISTS idx_mdx_followed_created_at ON followed_manga(created_at DESC)`,
];

async function migrateLegacyMdxMetadata(): Promise<void> {
  try {
    const legacyRows = await dynastyQuery<CachedMetadataRow>(
      `SELECT cache_key, data_type, json_payload, cached_at, etag
       FROM cached_metadata
       WHERE cache_key LIKE '%mdx:%'`,
    );
    if (legacyRows.length > 0) {
      for (const r of legacyRows) {
        await execute(
          `INSERT INTO cached_metadata (cache_key, data_type, json_payload, cached_at, etag)
           VALUES (?1, ?2, ?3, ?4, ?5)
           ON CONFLICT(cache_key) DO UPDATE SET
             json_payload = excluded.json_payload,
             cached_at = excluded.cached_at`,
          [r.cache_key, r.data_type, r.json_payload, r.cached_at, r.etag],
        );
      }
      await dynastyExecute(`DELETE FROM cached_metadata WHERE cache_key LIKE '%mdx:%'`);
      log.info("mangadex-db", `Migrated ${legacyRows.length} legacy cover cache entries from dynasty_reader.db to mangadex.db`);
    }
  } catch (err) {
    log.warn("mangadex-db", "Legacy cover metadata migration skipped:", err);
  }
}

export const MANGADEX_SCHEMA_VERSION = 1;

export async function getMangaDexSchemaVersion(): Promise<number> {
  try {
    const rows = await query<{ user_version: number }>("PRAGMA user_version");
    return Number(rows[0]?.user_version ?? 0);
  } catch (err) {
    log.error("mangadex-db", "failed to read user_version:", err);
    return 0;
  }
}

async function setMangaDexSchemaVersion(version: number): Promise<void> {
  await execute(`PRAGMA user_version = ${Math.floor(version)}`);
}

interface MangaDexMigration {
  version: number;
  name: string;
  up: () => Promise<void>;
}

const MANGADEX_MIGRATIONS: MangaDexMigration[] = [
  {
    version: 1,
    name: "baseline schema and legacy metadata migration",
    up: async () => {
      for (const ddl of SCHEMA) {
        await execute(ddl);
      }
      await migrateLegacyMdxMetadata();
    },
  },
];

let initPromise: Promise<void> | null = null;

/**
 * Initializes mangadex.db schema. Safe to call multiple times (cached promise).
 */
export function initMangaDexDb(): Promise<void> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const current = await getMangaDexSchemaVersion();
      if (current < MANGADEX_SCHEMA_VERSION) {
        log.info("mangadex-db", `Current mangadex.db version: ${current}, migrating to ${MANGADEX_SCHEMA_VERSION}...`);
        for (const migration of MANGADEX_MIGRATIONS) {
          if (migration.version <= current) continue;
          log.debug("mangadex-db", `Applying mangadex.db migration v${migration.version}: ${migration.name}`);
          await migration.up();
          await setMangaDexSchemaVersion(migration.version);
        }
      }
      log.info("mangadex-db", "mangadex.db schema initialization complete.");
    } catch (err) {
      initPromise = null;
      log.error("mangadex-db", "initMangaDexDb failed:", err);
      throw err;
    }
  })();

  return initPromise;
}
