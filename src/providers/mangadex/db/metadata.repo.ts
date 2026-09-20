/**
 * MangaDex SQLite Metadata Cache Repository
 * Caches feed pages, head checks, and directory results in mangadex.db.
 */

import { execute, query } from "./client";
import type { CachedMetadata } from "../../../types/db";

export async function getCachedMdxMetadata(key: string): Promise<CachedMetadata | null> {
  const rows = await query<CachedMetadata>(
    `SELECT json_payload, cached_at, etag FROM cached_metadata WHERE cache_key = ?`,
    [key],
  );
  return rows[0] ?? null;
}

export async function setCachedMdxMetadata(
  key: string,
  dataType: string,
  jsonPayload: string,
  etag?: string,
): Promise<void> {
  await execute(
    `INSERT INTO cached_metadata (cache_key, data_type, json_payload, cached_at, etag)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(cache_key) DO UPDATE SET
       data_type = excluded.data_type,
       json_payload = excluded.json_payload,
       cached_at = excluded.cached_at,
       etag = COALESCE(excluded.etag, cached_metadata.etag)`,
    [key, dataType, jsonPayload, Date.now(), etag ?? null],
  );
}

export async function touchCachedMdxMetadata(key: string): Promise<void> {
  await execute(`UPDATE cached_metadata SET cached_at = ? WHERE cache_key = ?`, [Date.now(), key]);
}

export async function deleteCachedMdxMetadata(key: string): Promise<void> {
  await execute(`DELETE FROM cached_metadata WHERE cache_key = ?`, [key]);
}
