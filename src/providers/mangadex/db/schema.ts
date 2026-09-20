/**
 * MangaDex SQLite Database Schema & Initialization
 * Operates on isolated mangadex.db via client.ts.
 */

import { execute } from "./client";
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
  `CREATE INDEX IF NOT EXISTS idx_mdx_history_read_at ON reading_history(read_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_mdx_progress_manga ON reading_progress(manga_id)`,
  `CREATE INDEX IF NOT EXISTS idx_mdx_cached_pages_chapter ON cached_pages(chapter_id)`,
  `CREATE INDEX IF NOT EXISTS idx_mdx_followed_created_at ON followed_manga(created_at DESC)`,
];

let initPromise: Promise<void> | null = null;

/**
 * Initializes mangadex.db schema. Safe to call multiple times (cached promise).
 */
export function initMangaDexDb(): Promise<void> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    log.info("mangadex-db", "Initializing mangadex.db schema...");
    for (const ddl of SCHEMA) {
      await execute(ddl);
    }
    log.info("mangadex-db", "mangadex.db schema initialization complete.");
  })();

  return initPromise;
}
