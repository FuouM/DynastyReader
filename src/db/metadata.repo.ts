import { query, execute, type Row } from "./client";
import { inClause } from "./paging";
import type { CachedMetadata } from "../types/db";

export interface MetadataDbClient {
  query: <T extends object = Row>(sql: string, params?: unknown[]) => Promise<T[]>;
  execute: (sql: string, params?: unknown[]) => Promise<number>;
}

export function createMetadataRepo(db: MetadataDbClient) {
  return {
    getCached: async (key: string): Promise<CachedMetadata | null> => {
      const rows = await db.query<CachedMetadata>(
        `SELECT json_payload, cached_at, etag FROM cached_metadata WHERE cache_key = ?`,
        [key],
      );
      return rows[0] ?? null;
    },

    getBatchCached: async (keys: string[]): Promise<Map<string, string>> => {
      if (keys.length === 0) return new Map();
      const rows = await db.query<{ cache_key: string; json_payload: string }>(
        `SELECT cache_key, json_payload FROM cached_metadata WHERE cache_key IN (${inClause(keys.length)})`,
        keys,
      );
      return new Map(rows.map((r) => [r.cache_key, r.json_payload]));
    },

    setCached: async (
      key: string,
      dataType: string,
      jsonPayload: string,
      etag?: string,
    ): Promise<void> => {
      await db.execute(
        `INSERT INTO cached_metadata (cache_key, data_type, json_payload, cached_at, etag)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(cache_key) DO UPDATE SET
           data_type = excluded.data_type,
           json_payload = excluded.json_payload,
           cached_at = excluded.cached_at,
           etag = COALESCE(excluded.etag, cached_metadata.etag)`,
        [key, dataType, jsonPayload, Date.now(), etag ?? null],
      );
    },

    touchCached: async (key: string): Promise<void> => {
      await db.execute(`UPDATE cached_metadata SET cached_at = ? WHERE cache_key = ?`, [Date.now(), key]);
    },

    deleteCached: async (key: string): Promise<void> => {
      await db.execute(`DELETE FROM cached_metadata WHERE cache_key = ?`, [key]);
    },
  };
}

const defaultRepo = createMetadataRepo({ query, execute });
export const getCached = defaultRepo.getCached;
export const getBatchCached = defaultRepo.getBatchCached;
export const setCached = defaultRepo.setCached;
export const touchCached = defaultRepo.touchCached;
export const deleteCached = defaultRepo.deleteCached;
