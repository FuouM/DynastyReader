import { execute, query } from "./client";

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
  return query<LocalSeriesRow>(`SELECT * FROM local_series ORDER BY updated_at DESC`);
}

export async function getLocalSeriesByPermalink(permalink: string): Promise<LocalSeriesRow | null> {
  const rows = await query<LocalSeriesRow>(`SELECT * FROM local_series WHERE permalink = ?`, [permalink]);
  return rows[0] ?? null;
}

export async function deleteLocalSeries(permalink: string): Promise<void> {
  await execute(`DELETE FROM local_series WHERE permalink = ?`, [permalink]);
}
