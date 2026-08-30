import { execute, query } from "./client";
import * as ipc from "../ipc";
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
    const rows = await query<LocalSeriesRow>(`SELECT * FROM local_series ORDER BY updated_at DESC`);
    for (const r of rows) {
      if (r.cover_path && !r.cover_path.includes(":") && !r.cover_path.startsWith("/")) {
        try {
          const res = await ipc.fileExists(r.cover_path);
          if (res.exists) r.cover_path = String(res.absolute_path);
        } catch {}
      }
    }
    return rows;
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
    const r = rows[0] ?? null;
    if (r && r.cover_path && !r.cover_path.includes(":") && !r.cover_path.startsWith("/")) {
      try {
        const res = await ipc.fileExists(r.cover_path);
        if (res.exists) r.cover_path = String(res.absolute_path);
      } catch {}
    }
    return r;
  } catch (err) {
    const msg = String((err as Error)?.message ?? err);
    if (msg.includes("no such table")) return null;
    throw err;
  }
}

export async function deleteLocalSeries(permalink: string): Promise<void> {
  await execute(`DELETE FROM local_series WHERE permalink = ?`, [permalink]);
}
