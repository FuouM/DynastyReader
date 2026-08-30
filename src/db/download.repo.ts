import { execute, query } from "./client";

export interface DownloadQueueRow {
  series_permalink: string;
  series_title: string;
  chapter_permalink: string;
  chapter_title: string;
  chapter_index: number;
  status: string;
  progress: number;
  total_pages: number;
  error_msg: string | null;
  queued_at: number;
  completed_at: number | null;
}

export async function getDownloadQueue(): Promise<DownloadQueueRow[]> {
  const rows = await query<DownloadQueueRow>(
    `SELECT series_permalink, series_title, chapter_permalink, chapter_title, chapter_index, status, progress, total_pages, error_msg, queued_at, completed_at FROM download_queue ORDER BY queued_at ASC`,
  );
  return rows;
}

export async function clearDownloadQueue(permalink: string): Promise<void> {
  await execute(`DELETE FROM download_queue WHERE series_permalink = ?`, [permalink]);
}
