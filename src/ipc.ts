/**
 * Typed Tauri IPC transport for the standalone app.
 *
 * The plugin code used to talk to Curator's `window.PluginHost` facade; every
 * surface it touched is now backed directly by the Tauri commands in
 * `src-tauri/src/commands/` (see `src-tauri/src/main.rs` `invoke_handler`).
 * Unlike the old `{ <Method>Result }` / `{ Error }` envelope, these wrappers
 * throw a plain `Error` on backend failure — callers already treated an
 * `{ Error }` envelope as a thrown error, so behavior is unchanged. Tauri
 * camelCases Rust snake_case args automatically, so callers pass `dbName`,
 * `outputPath`, `timeoutMs`, etc.
 */

import { convertFileSrc as tauriConvertFileSrc, invoke } from "@tauri-apps/api/core";
import type { UpdateInfo } from "./types/api";

/** Asset-protocol URL for a resolved absolute on-disk path.
 * Returns `""` outside the Tauri WebView (e.g. plain Vite browser preview)
 * so `<img src="">` shows a broken-image placeholder instead of crashing. */
export function convertFileSrc(path: string): string {
  if (!path) return "";
  try {
    return tauriConvertFileSrc(path);
  } catch {
    // __TAURI_INTERNALS__ absent — outside Tauri WebView
    return "";
  }
}
/* ---------------------------------------------------------------------------
 * HTTP
 * ------------------------------------------------------------------------ */

export interface HttpGetArgs {
  url: string;
  method?: "GET" | "POST";
  body?: string;
  contentType?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

export interface HttpGetResult {
  status: number;
  body: string;
  etag?: string;
}

/** GET/POST a text/JSON payload. Body is capped at 8MB by the backend. */
export async function httpGet(args: HttpGetArgs): Promise<HttpGetResult> {
  return invoke<HttpGetResult>("httpGet", { ...args });
}

export interface HttpDownloadArgs {
  url: string;
  outputPath: string;
  timeoutMs?: number;
}

export interface HttpDownloadResult {
  written_to: string;
  size_bytes: number;
  absolute_path: string;
}

/** Downloads a binary payload into the portable data root and returns the resolved path. */
export async function httpDownload(args: HttpDownloadArgs): Promise<HttpDownloadResult> {
  return invoke<HttpDownloadResult>("httpDownload", { ...args });
}

/* ---------------------------------------------------------------------------
 * Database
 * ------------------------------------------------------------------------ */

export interface DbExecuteResult {
  rows_affected: number;
}

/** Runs a write statement against a named database under the data root. */
export async function dbExecute(
  dbName: string,
  sql: string,
  params?: unknown[],
): Promise<DbExecuteResult> {
  return invoke<DbExecuteResult>("dbExecute", { dbName, sql, params });
}

export interface DbQueryResult {
  rows: Record<string, unknown>[];
}

/** Runs a read query; rows come back as objects keyed by column name. */
export async function dbQuery(
  dbName: string,
  sql: string,
  params?: unknown[],
): Promise<DbQueryResult> {
  return invoke<DbQueryResult>("dbQuery", { dbName, sql, params });
}

export interface DbExecuteBatchResult {
  rows_affected: number[];
}

/**
 * Runs multiple write statements inside one transaction. `params` supplies one
 * optional parameter list per statement (`?` placeholders), in order.
 */
export async function dbExecuteBatch(
  dbName: string,
  statements: string[],
  params?: unknown[][],
): Promise<DbExecuteBatchResult> {
  return invoke<DbExecuteBatchResult>("dbExecuteBatch", { dbName, statements, params });
}

export interface DbBackupResult {
  backup_path: string;
  absolute_path: string;
  size_bytes: number;
}

/** Creates a timestamped backup of `dbName` via VACUUM INTO. */
export async function dbBackup(dbName: string): Promise<DbBackupResult> {
  return invoke<DbBackupResult>("dbBackup", { dbName });
}

export interface DbRestoreResult {
  restored: boolean;
  backup_filename?: string;
  source_path?: string;
  target: string;
}


export async function dbRestoreFromPath(dbName: string, sourcePath: string): Promise<DbRestoreResult> {
  return invoke<DbRestoreResult>("dbRestoreFromPath", { dbName, sourcePath });
}

/* ---------------------------------------------------------------------------
 * Filesystem
 * ------------------------------------------------------------------------ */

export interface FileExistsResult {
  exists: boolean;
  size_bytes: number;
  absolute_path: string;
}

/**
 * Reports a file as existing only when its size is at least `minSize` bytes.
 * Defaults to 1 (zero-byte files count as missing); pass `minSize: 0` to treat
 * them as present.
 */
export async function fileExists(path: string, minSize?: number): Promise<FileExistsResult> {
  return invoke<FileExistsResult>("fileExists", { path, minSize });
}

export interface FileExistsBatchItem {
  path: string;
  exists: boolean;
  size_bytes: number;
  absolute_path: string;
  error: string;
}

export interface FileExistsBatchResult {
  items: FileExistsBatchItem[];
}

export async function fileExistsBatch(paths: string[], minSize?: number): Promise<FileExistsBatchResult> {
  return invoke<FileExistsBatchResult>("fileExistsBatch", { paths, minSize });
}

export interface FileMoveResult {
  absolute_path: string;
}

/** Renames/moves a path inside the portable data root (cross-device safe). */
export async function fileMove(src: string, dst: string): Promise<FileMoveResult> {
  return invoke<FileMoveResult>("fileMove", { src, dst });
}

/** Deletes a file or directory inside the portable data root. */
export async function fileDelete(path: string): Promise<void> {
  await invoke("fileDelete", { path });
}

export interface DirStatResult {
  total_bytes: number;
  file_count: number;
  absolute_path: string;
}

/** Recursively stats a directory (or single file) under the data root. */
export async function dirStat(path = ""): Promise<DirStatResult> {
  return invoke<DirStatResult>("dirStat", { path });
}

export interface DirStatBatchItem {
  path: string;
  total_bytes: number;
  file_count: number;
  absolute_path: string;
  error: string;
}

export interface DirStatBatchResult {
  items: DirStatBatchItem[];
}

export async function dirStatBatch(paths: string[]): Promise<DirStatBatchResult> {
  return invoke<DirStatBatchResult>("dirStatBatch", { paths });
}

/* ---------------------------------------------------------------------------
 * Media
 * ------------------------------------------------------------------------ */

export interface ConvertItem {
  source_path: string;
  output_path: string;
  error: string;
}

export interface EphemeralConvertArgs {
  conversions: [string, string][];
  quality?: number;
  maxDimension?: number;
  maxBytes?: number;
}

export interface EphemeralConvertResult {
  converted: ConvertItem[];
}

/** Transcodes source → target paths (bounded dimension + byte budget). */
export async function ephemeralConvertImages(
  args: EphemeralConvertArgs,
): Promise<EphemeralConvertResult> {
  return invoke<EphemeralConvertResult>("ephemeralConvertImages", { ...args });
}

/* ---------------------------------------------------------------------------
 * Local Import (CBZ)
 * ------------------------------------------------------------------------ */

export interface ArchiveScanChapter {
  title: string;
  page_count: number;
  files: string[];
}

export interface ArchiveScanResult {
  file_name: string;
  series_title: string;
  chapters: ArchiveScanChapter[];
  total_pages: number;
}

export async function scanArchive(path: string): Promise<ArchiveScanResult> {
  return invoke<ArchiveScanResult>("scanArchive", { path });
}

export interface LocalSeriesMeta {
  title: string;
  author?: string | null;
  description?: string | null;
}

export async function importArchive(path: string, meta: LocalSeriesMeta): Promise<string> {
  return invoke<string>("importArchive", { path, meta });
}

export async function deleteLocalSeries(permalink: string): Promise<void> {
  await invoke("deleteLocalSeries", { permalink });
}

export interface UpdateLocalSeriesMeta {
  title: string;
  author?: string | null;
  description?: string | null;
  /** Absolute path to a new cover image. Omit to keep the existing cover. */
  new_cover_path?: string | null;
}

export async function updateLocalSeries(permalink: string, meta: UpdateLocalSeriesMeta): Promise<void> {
  await invoke("updateLocalSeries", { permalink, meta });
}
export interface FolderScanResult {
  folder_name: string;
  series_title: string;
  page_count: number;
  files: string[];
}

export interface FolderImportMeta {
  title: string;
  chapter_title: string;
  author?: string | null;
  description?: string | null;
  cover_path?: string | null;
}

export async function scanFolder(path: string): Promise<FolderScanResult> {
  return invoke<FolderScanResult>("scanFolder", { path });
}

export async function importFolder(path: string, meta: FolderImportMeta): Promise<string> {
  return invoke<string>("importFolder", { path, meta });
}

/* ---------------------------------------------------------------------------
 * Download Queue
 * ------------------------------------------------------------------------ */

export interface DownloadRequest {
  series_permalink: string;
  series_title: string;
  chapter_permalink: string;
  chapter_title: string;
  chapter_index: number;
}

export async function enqueueChapters(chapters: DownloadRequest[]): Promise<void> {
  await invoke("enqueueChapters", { chapters });
}

export async function pauseDownloads(): Promise<void> {
  await invoke("pauseDownloads");
}

export async function resumeDownloads(): Promise<void> {
  await invoke("resumeDownloads");
}

export async function cancelDownload(chapterPermalink: string): Promise<void> {
  await invoke("cancelDownload", { chapterPermalink });
}

export async function retryFailedDownloads(seriesPermalink: string): Promise<void> {
  await invoke("retryFailedDownloads", { seriesPermalink });
}

export async function clearCompletedDownloads(seriesPermalink: string): Promise<void> {
  await invoke("clearCompletedDownloads", { seriesPermalink });
}

export interface DownloadQueueItem {
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

export async function getDownloadQueue(): Promise<{ items: DownloadQueueItem[] }> {
  return invoke<{ items: DownloadQueueItem[] }>("getDownloadQueue");
}

/* ---------------------------------------------------------------------------
 * System
 * ------------------------------------------------------------------------ */

/** Opens a URL in the default browser (http/https only). */
export async function openUrl(url: string): Promise<void> {
  await invoke("openUrl", { url });
}

/** Reveals the rolling log folder in Explorer. */
export async function openLogsDir(): Promise<{ absolute_path: string }> {
  return invoke("openLogsDir");
}

/* ---------------------------------------------------------------------------
 * Updater
 * ------------------------------------------------------------------------ */

export { type UpdateInfo };

/** Checks the official GitHub release feed for a newer build. */
export async function checkForUpdates(): Promise<UpdateInfo> {
  return invoke<UpdateInfo>("checkForUpdates");
}

/** Downloads and atomically swaps in the new executable, then relaunches. */
export async function installUpdate(downloadUrl: string): Promise<void> {
  await invoke("installUpdate", { downloadUrl });
}
