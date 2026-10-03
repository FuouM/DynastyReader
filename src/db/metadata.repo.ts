import { query, execute } from "./client";
import type { Row } from "./client";
import { query as mdxQuery, execute as mdxExecute } from "../providers/mangadex/db/client";
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

const dynastyRepo = createMetadataRepo({ query, execute });
const mdxRepo = createMetadataRepo({ query: mdxQuery, execute: mdxExecute });

export const isMdxMetadataKey = (key: string): boolean => key.includes("mdx:");

export const getCached = async (key: string): Promise<CachedMetadata | null> => {
  return isMdxMetadataKey(key) ? mdxRepo.getCached(key) : dynastyRepo.getCached(key);
};

export const getBatchCached = async (keys: string[]): Promise<Map<string, string>> => {
  if (keys.length === 0) return new Map();
  const mdxKeys: string[] = [];
  const dynastyKeys: string[] = [];
  for (const k of keys) {
    (isMdxMetadataKey(k) ? mdxKeys : dynastyKeys).push(k);
  }

  const [mdxMap, dynastyMap] = await Promise.all([
    mdxKeys.length > 0 ? mdxRepo.getBatchCached(mdxKeys) : Promise.resolve(new Map<string, string>()),
    dynastyKeys.length > 0 ? dynastyRepo.getBatchCached(dynastyKeys) : Promise.resolve(new Map<string, string>()),
  ]);

  return new Map([...dynastyMap, ...mdxMap]);
};

export const setCached = async (
  key: string,
  dataType: string,
  jsonPayload: string,
  etag?: string,
): Promise<void> => {
  if (isMdxMetadataKey(key)) {
    await mdxRepo.setCached(key, dataType, jsonPayload, etag);
  } else {
    await dynastyRepo.setCached(key, dataType, jsonPayload, etag);
  }
};

export const touchCached = async (key: string): Promise<void> => {
  if (isMdxMetadataKey(key)) {
    await mdxRepo.touchCached(key);
  } else {
    await dynastyRepo.touchCached(key);
  }
};

export const deleteCached = async (key: string): Promise<void> => {
  if (isMdxMetadataKey(key)) {
    await mdxRepo.deleteCached(key);
  } else {
    await dynastyRepo.deleteCached(key);
  }
};
