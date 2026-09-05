/**
 * Shared persistence helpers for directory/suggest caching.
 * Centralizes the dynamic `import("../db")` + fire-and-forget `void save...().catch`
 * pattern duplicated across directory.ts / feed.ts / search.ts (4 call sites).
 * Keeps the `console.warn` prefix per caller label for grepability.
 */

import { log } from "../utils/log";
import type { DirectoryGroup } from "../types/api";

export async function persistSuggestEntries(
  entries: { name: string; type: string }[],
  label: string,
): Promise<void> {
  if (entries.length === 0) return;
  try {
    const { saveSuggestEntries } = await import("../db/directory.repo");
    void saveSuggestEntries(entries).catch((err) => {
      log.warn(`api/${label}`, "saveSuggestEntries failed:", err);
    });
  } catch (err) {
    log.warn(`api/${label}`, "failed to import db for saving suggestions:", err);
  }
}

export async function persistDirectoryEntries(
  kind: "series" | "tags",
  groups: DirectoryGroup[],
  label = "directory",
): Promise<void> {
  if (groups.length === 0) return;
  try {
    const { saveDirectoryEntries } = await import("../db/directory.repo");
    void saveDirectoryEntries(kind, groups).catch((err) => {
      log.warn(`api/${label}`, `saveDirectoryEntries failed for ${kind}:`, err);
    });
  } catch (err) {
    log.warn(`api/${label}`, `failed to import db for saving directory ${kind}:`, err);
  }
}
