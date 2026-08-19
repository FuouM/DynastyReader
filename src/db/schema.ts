import { execute, query } from "./client";

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS followed_series (
    permalink TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    cover TEXT,
    last_checked_at INTEGER NOT NULL,
    latest_chapter_permalink TEXT,
    latest_chapter_title TEXT,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS reading_progress (
    chapter_permalink TEXT PRIMARY KEY,
    series_permalink TEXT NOT NULL,
    series_name TEXT NOT NULL,
    chapter_title TEXT NOT NULL,
    page_index INTEGER NOT NULL DEFAULT 0,
    page_total INTEGER NOT NULL DEFAULT 0,
    completed INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS reading_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chapter_permalink TEXT NOT NULL,
    series_permalink TEXT NOT NULL,
    series_name TEXT NOT NULL,
    chapter_title TEXT NOT NULL,
    read_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS bookmarks (
    chapter_permalink TEXT PRIMARY KEY,
    series_permalink TEXT NOT NULL,
    series_name TEXT NOT NULL,
    chapter_title TEXT NOT NULL,
    page_index INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS cached_metadata (
    cache_key TEXT PRIMARY KEY,
    data_type TEXT NOT NULL,
    json_payload TEXT NOT NULL,
    cached_at INTEGER NOT NULL,
    etag TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS cached_pages (
    chapter_permalink TEXT NOT NULL,
    page_index INTEGER NOT NULL,
    file_path TEXT NOT NULL,
    size_bytes INTEGER DEFAULT 0,
    cached_at INTEGER NOT NULL,
    PRIMARY KEY (chapter_permalink, page_index)
  )`,
  `CREATE TABLE IF NOT EXISTS tag_blacklist (
    tag_name TEXT PRIMARY KEY,
    tag_permalink TEXT,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS series_blacklist (
    series_permalink TEXT PRIMARY KEY,
    series_name TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS collections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS collection_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    item_permalink TEXT NOT NULL,
    item_title TEXT NOT NULL,
    item_kind TEXT NOT NULL DEFAULT 'series',
    cover TEXT,
    parent_series_permalink TEXT,
    parent_series_name TEXT,
    created_at INTEGER NOT NULL,
    UNIQUE(collection_id, item_permalink)
  )`,
];

/**
 * One versioned migration step. `up` runs once per `version` inside the
 * migration transaction, guarded by `PRAGMA user_version`.
 */
interface Migration {
  version: number;
  name: string;
  up(): Promise<void>;
}

/** Runs one best-effort step; returns true on success, false on failure. */
async function runStep(sql: string, label: string, params: unknown[] = []): Promise<boolean> {
  try {
    await execute(sql, params);
    return true;
  } catch (err) {
    console.error(`[db/schema] ${label} failed:`, err);
    return false;
  }
}

async function columnExists(table: string, column: string): Promise<boolean> {
  try {
    const rows = await query<{ name: string }>(`PRAGMA table_info(${table})`);
    return rows.some((r) => r.name.toLowerCase() === column.toLowerCase());
  } catch {
    return false;
  }
}

async function getSchemaVersion(): Promise<number> {
  try {
    const rows = await query<{ user_version: number }>(`PRAGMA user_version`);
    return Number(rows[0]?.user_version ?? 0);
  } catch (err) {
    console.error("[db/schema] failed to read user_version:", err);
    return 0;
  }
}

async function setSchemaVersion(version: number): Promise<void> {
  await execute(`PRAGMA user_version = ${Math.floor(version)}`, []);
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: "base schema, indexes, reading-history uniqueness, cover-key normalization",
    up: async () => {
      const failures: string[] = [];
      for (const sql of SCHEMA) {
        const ok = await runStep(sql, "create table");
        if (!ok) failures.push(`table: ${sql.slice(0, 60)}`);
      }

      // Conditional column patches: only run ALTER TABLE if column does not exist yet.
      if (!(await columnExists("cached_pages", "size_bytes"))) {
        if (!(await runStep("ALTER TABLE cached_pages ADD COLUMN size_bytes INTEGER DEFAULT 0", "patch cached_pages.size_bytes"))) {
          failures.push("patch cached_pages.size_bytes");
        }
      }
      if (!(await columnExists("cached_metadata", "etag"))) {
        if (!(await runStep("ALTER TABLE cached_metadata ADD COLUMN etag TEXT", "patch cached_metadata.etag"))) {
          failures.push("patch cached_metadata.etag");
        }
      }

      // Dedupe history to one row per chapter (keeps the most recent read),
      // then enforce uniqueness so addHistory can be a single atomic upsert.
      const deduped = await runStep(
        `DELETE FROM reading_history WHERE id NOT IN (SELECT MAX(id) FROM reading_history GROUP BY chapter_permalink)`,
        "dedupe reading_history",
      );
      if (deduped) {
        const uniqueOk = await runStep(
          "CREATE UNIQUE INDEX IF NOT EXISTS idx_reading_history_chapter ON reading_history(chapter_permalink)",
          "unique reading_history.chapter_permalink",
        );
        if (!uniqueOk) failures.push("unique reading_history.chapter_permalink");
      } else {
        failures.push("dedupe reading_history");
      }

      // Hot-path indexes (verified by EXPLAIN QUERY PLAN).
      await runStep(
        "CREATE INDEX IF NOT EXISTS idx_cached_metadata_data_type ON cached_metadata(data_type)",
        "index cached_metadata.data_type",
      );
      await runStep(
        "CREATE INDEX IF NOT EXISTS idx_reading_progress_series ON reading_progress(series_permalink)",
        "index reading_progress.series_permalink",
      );
      await runStep(
        "CREATE INDEX IF NOT EXISTS idx_collection_items_collection ON collection_items(collection_id)",
        "index collection_items.collection_id",
      );
      await runStep(
        "CREATE INDEX IF NOT EXISTS idx_collection_items_permalink ON collection_items(item_permalink)",
        "index collection_items.item_permalink",
      );

      // Cover-key normalization: the legacy `cover:<permalink>` scheme wrote bare
      // keys for series covers (chapters always used `cover:chapter:<permalink>`).
      // Migrate `cover:X` → `cover:series:X`, dropping the twin when both exist.
      const normalizeOk = await runStep(
        `UPDATE cached_metadata
         SET cache_key = 'cover:series:' || substr(cache_key, 7)
         WHERE cache_key LIKE 'cover:%'
           AND cache_key NOT LIKE 'cover:series:%'
           AND cache_key NOT LIKE 'cover:chapter:%'
           AND NOT EXISTS (
             SELECT 1 FROM cached_metadata t
             WHERE t.cache_key = 'cover:series:' || substr(cache_key, 7)
           )`,
        "normalize legacy cover keys",
      );
      if (normalizeOk) {
        await runStep(
          `DELETE FROM cached_metadata
           WHERE cache_key LIKE 'cover:%'
             AND cache_key NOT LIKE 'cover:series:%'
             AND cache_key NOT LIKE 'cover:chapter:%'
             AND EXISTS (
               SELECT 1 FROM cached_metadata t
               WHERE t.cache_key = 'cover:series:' || substr(cache_key, 7)
             )`,
          "drop legacy cover-key twins",
        );
      } else {
        failures.push("normalize legacy cover keys");
      }

      // Seed default 'Favorites' collection if not already present
      const now = Date.now();
      const seeded = await runStep(
        "INSERT OR IGNORE INTO collections (id, name, is_default, created_at) VALUES (1, 'Favorites', 1, ?)",
        "seed Favorites collection",
        [now],
      );
      if (!seeded) failures.push("seed Favorites collection");

      try {
        const { initBlacklistCache } = await import("./blacklist.repo");
        await initBlacklistCache();
      } catch (err) {
        failures.push("blacklist cache init");
        console.error("[db/schema] blacklist cache init failed:", err);
      }

      if (failures.length > 0) {
        console.error(`[db/schema] migration v1: ${failures.length} step(s) failed:`, failures.join(", "));
      }
    },
  },
  {
    version: 2,
    name: "normalize standalone doujin entries in collection_items to oneshot",
    up: async () => {
      await runStep(
        `UPDATE collection_items
         SET item_kind = 'oneshot'
         WHERE item_kind = 'doujin'
           AND (parent_series_permalink IS NULL OR parent_series_permalink = '')`,
        "normalize doujin collection items",
      );
    },
  },
];

let initDbPromise: Promise<void> | null = null;

/** Applies pending migrations in order, then records the schema version. */
export async function initDb(): Promise<void> {
  if (!initDbPromise) {
    initDbPromise = (async () => {
      const current = await getSchemaVersion();
      for (const migration of MIGRATIONS) {
        if (migration.version <= current) continue;
        console.info(`[db/schema] applying migration v${migration.version}: ${migration.name}`);
        await migration.up();
        await setSchemaVersion(migration.version);
      }
    })();
  }
  return initDbPromise;
}


