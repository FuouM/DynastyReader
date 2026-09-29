import { DB_NAME } from "../constants";
import type { Row } from "../types/db";
import * as ipc from "../ipc";

export type { Row };

export function createDbClient(dbName: string) {
  return {
    execute: async (sql: string, params: unknown[] = []): Promise<number> => {
      const resp = await ipc.dbExecute(dbName, sql, params);
      return Number(resp.rows_affected ?? 0);
    },
    query: async <T extends object = Row>(sql: string, params: unknown[] = []): Promise<T[]> => {
      const resp = await ipc.dbQuery(dbName, sql, params);
      return (resp.rows ?? []) as T[];
    },
  };
}

const defaultClient = createDbClient(DB_NAME);
export const execute = defaultClient.execute;
export const query = defaultClient.query;
