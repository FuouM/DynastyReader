import { absUrl } from "../utils/url";
import { cachedJson, httpGetText } from "./http";
import { FEED_TTL_MS } from "./feed";
import { tryParseJson } from "../utils/json";
import { directoryGroups } from "../utils/directory";
import { log } from "../utils/log";
import { persistDirectoryEntries, persistSuggestEntries } from "./cache-persist";
import type { Directory, DirectoryGroup, SuggestResult } from "../types/api";

export async function fetchDirectory(urlPath: string, key: string, kind?: "series" | "tags"): Promise<Directory> {
  const dir = await cachedJson<Directory>(key, absUrl(urlPath), FEED_TTL_MS);
  if (kind) {
    const groups = directoryGroups(dir);
    void persistDirectoryEntries(kind, groups, "directory");
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


// RAM quick win: 32 in-memory suggest query results (down from 100).
// Cache misses fall back to local SQLite directory entries instantly.
const MAX_SUGGEST_CACHE = 32;
const suggestCache = new Map<string, SuggestResult[]>();

function setSuggestCache(key: string, val: SuggestResult[]): void {
  if (suggestCache.size >= MAX_SUGGEST_CACHE) {
    const oldest = suggestCache.keys().next().value;
    if (oldest !== undefined) suggestCache.delete(oldest);
  }
  suggestCache.set(key, val);
}

/** Search typeahead suggestions with instant local SQLite lookup + network fallback. */
export async function suggest(query: string): Promise<SuggestResult[]> {
  const q = query.trim();
  if (!q) return [];

  const cacheKey = q.toLowerCase();
  if (suggestCache.has(cacheKey)) {
    return suggestCache.get(cacheKey)!;
  }

  // 1. Try local SQLite directory entries first (zero network latency)
  try {
    const { suggestDirectoryEntries } = await import("../db");
    const local = await suggestDirectoryEntries(q, 8);
    if (local.length > 0) {
      setSuggestCache(cacheKey, local);
      return local;
    }
  } catch (err) {
    log.debug("api/directory", "local suggest lookup missed or failed:", err);
  }
  // 2. Query online endpoint
  const { status, body } = await httpGetText(absUrl("/tags/suggest"), {
    method: "POST",
    body: `query=${encodeURIComponent(q)}`,
  });
  if (status !== 200) throw new Error(`HTTP ${status} for /tags/suggest`);
  const parsed = tryParseJson<SuggestResult[]>(body);
  if (parsed === null) throw new Error("Invalid JSON from /tags/suggest");
  setSuggestCache(cacheKey, parsed);

  // Persist newly discovered suggestions into SQLite directory_entries
  if (parsed.length > 0) {
    void persistSuggestEntries(parsed, "directory");
  }

  return parsed;
}
