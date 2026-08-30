import * as ipc from "../ipc";
import { log } from "../utils/log";

/**
 * Resolves a plugin-relative path to its absolute path if the file exists and is non-empty.
 * Returns null if the file is absent, empty, or the path escapes the plugin data dir.
 */
export async function fileResolve(path: string): Promise<string | null> {
  try {
    const resp = await ipc.fileExists(path);
    if (!resp.exists) return null;
    return String(resp.absolute_path);
  } catch (err) {
    log.debug("api/fs", "fileResolve failed for", path, err);
    return null;
  }
}

/**
 * Resolves a path to its absolute path and size if present and non-empty.
 */
export async function fileResolveWithStat(
  path: string,
): Promise<{ absolutePath: string; sizeBytes: number } | null> {
  try {
    const resp = await ipc.fileExists(path);
    if (!resp.exists) return null;
    return {
      absolutePath: String(resp.absolute_path),
      sizeBytes: Number(resp.size_bytes ?? 0),
    };
  } catch (err) {
    log.debug("api/fs", "fileResolveWithStat failed for", path, err);
    return null;
  }
}

/** Returns true if the file exists on disk in the plugin's data dir and is non-empty. */
export async function fileExists(path: string): Promise<boolean> {
  return (await fileResolve(path)) !== null;
}

/** Renames/moves a file within the plugin's data dir. Returns the new absolute path. */
export async function fileMove(src: string, dst: string): Promise<string> {
  const resp = await ipc.fileMove(src, dst);
  return String(resp.absolute_path ?? "");
}

/** Deletes a file within the plugin's data dir. */
export async function fileDelete(path: string): Promise<void> {
  await ipc.fileDelete(path);
}