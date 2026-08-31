import { DB_NAME } from "../constants";
import type { Row } from "../types/db";
import * as ipc from "../ipc";

export type { Row };

/** Runs a write query; returns rows affected. */
export async function execute(sql: string, params: unknown[] = []): Promise<number> {
  const resp = await ipc.dbExecute(DB_NAME, sql, params);
  return Number(resp.rows_affected ?? 0);
}

/** Runs a read query; returns rows as plain objects. */
export async function query<T extends object = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
  const resp = await ipc.dbQuery(DB_NAME, sql, params);
  return (resp.rows ?? []) as T[];
}
