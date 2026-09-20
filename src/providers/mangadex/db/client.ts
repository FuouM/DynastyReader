/**
 * Sandboxed SQLite Database Client for MangaDex (mangadex.db)
 * Routes directly to Tauri DbPool using dbName = "mangadex".
 */

import * as ipc from "../../../ipc";

export const MANGADEX_DB_NAME = "mangadex.db";

export type Row = Record<string, unknown>;

/** Runs a write query on mangadex.db; returns rows affected. */
export async function execute(sql: string, params: unknown[] = []): Promise<number> {
  const resp = await ipc.dbExecute(MANGADEX_DB_NAME, sql, params);
  return Number(resp.rows_affected ?? 0);
}

/** Runs a read query on mangadex.db; returns rows as plain objects. */
export async function query<T extends object = Row>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const resp = await ipc.dbQuery(MANGADEX_DB_NAME, sql, params);
  return (resp.rows ?? []) as T[];
}
