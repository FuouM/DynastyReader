import { execute, query } from "./client";
import { log } from "../utils/log";

export interface LocalSeriesRow {
  permalink: string;
  title: string;
  author: string | null;
  description: string | null;
  cover_path: string | null;
  source_path: string | null;
  chapter_count: number;
  total_pages: number;
  created_at: number;
  updated_at: number;
}

export async function getLocalSeries(): Promise<LocalSeriesRow[]> {
  try {
    return await query<LocalSeriesRow>(`SELECT * FROM local_series ORDER BY updated_at DESC`);
  } catch (err) {
    const msg = String((err as Error)?.message ?? err);
    if (msg.includes("no such table")) {
      log.warn("local.repo", "local_series missing (migration pending):", msg);
      return [];
    }
    throw err;
  }
}

export async function getLocalSeriesByPermalink(permalink: string): Promise<LocalSeriesRow | null> {
  try {
    const rows = await query<LocalSeriesRow>(`SELECT * FROM local_series WHERE permalink = ?`, [permalink]);
    return rows[0] ?? null;
  } catch (err) {
    const msg = String((err as Error)?.message ?? err);
    if (msg.includes("no such table")) return null;
    throw err;
  }
}

export async function deleteLocalSeries(permalink: string): Promise<void> {
  await execute(`DELETE FROM local_series WHERE permalink = ?`, [permalink]);
}
