/**
 * Sandboxed SQLite Database Client for MangaDex (mangadex.db)
 * Routes directly to Tauri DbPool using dbName = "mangadex".
 */

import { createDbClient, type Row } from "../../../db/client";

export const MANGADEX_DB_NAME = "mangadex.db";
export type { Row };

const client = createDbClient(MANGADEX_DB_NAME);
export const execute = client.execute;
export const query = client.query;
