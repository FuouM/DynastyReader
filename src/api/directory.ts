import { absUrl } from "../stores";
import { cachedJson, httpGetText } from "./client";
import { FEED_TTL_MS } from "./feed";
import { tryParseJson } from "../utils/json";
import type { Directory, DirectoryGroup, SuggestResult } from "../types/api";

/** Series / tag directories, cached for one hour. */
export async function fetchDirectory(urlPath: string, key: string, kind?: "series" | "tags"): Promise<Directory> {
  const dir = await cachedJson<Directory>(key, absUrl(urlPath), FEED_TTL_MS);
  if (kind) {
    try {
      const { saveDirectoryEntries } = await import("../db");
      const groups = directoryGroups(dir);
      void saveDirectoryEntries(kind, groups);
    } catch {}
  }
  return dir;
}

const syncActive = { series: false, tags: false };

/**
 * Background-syncs all directory pages into SQLite so global directory search covers all series/tags.
 */
export async function syncAllDirectoryPages(kind: "series" | "tags", totalPages: number): Promise<void> {
  if (syncActive[kind] || totalPages <= 1) return;
  syncActive[kind] = true;
  try {
    const promises: Promise<unknown>[] = [];
    for (let p = 1; p <= totalPages; p++) {
      const url = kind === "series" ? `/series.json?page=${p}` : `/tags.json?page=${p}`;
      const key = `${kind === "series" ? "dir:series" : "dir:tags"}:${p}`;
      promises.push(fetchDirectory(url, key, kind));
    }
    await Promise.allSettled(promises);
  } finally {
    syncActive[kind] = false;
  }
}

/**
 * Searches directory entries directly in SQLite with indexed SQL queries.
 */
export async function searchAllDirectoryEntries(
  kind: "series" | "tags",
  query: string,
): Promise<DirectoryGroup[]> {
  const { searchDirectoryEntries } = await import("../db");
  return searchDirectoryEntries(kind, query);
}

/** Normalized, ordered letter → entries groups from a directory payload. */
export function directoryGroups(d: Directory | unknown): DirectoryGroup[] {
  if (!d || typeof d !== "object") return [];
  const obj = d as { tags?: unknown };
  const rawList = obj.tags ?? (Array.isArray(d) ? d : []);
  if (!Array.isArray(rawList)) return [];
  return rawList
    .map((obj) => {
      if (obj && typeof obj === "object") {
        const letter = Object.keys(obj)[0] ?? "?";
        const entries = Array.isArray(obj[letter]) ? obj[letter] : [];
        return { letter, entries };
      }
      return { letter: "?", entries: [] };
    })
    .filter((g) => g.entries.length > 0);
}

/** Search typeahead suggestions. */
export async function suggest(query: string): Promise<SuggestResult[]> {
  const { status, body } = await httpGetText(absUrl("/tags/suggest"), {
    method: "POST",
    body: `query=${encodeURIComponent(query)}`,
  });
  if (status !== 200) throw new Error(`HTTP ${status} for /tags/suggest`);
  const parsed = tryParseJson<SuggestResult[]>(body);
  if (parsed === null) throw new Error("Invalid JSON from /tags/suggest");
  return parsed;
}
