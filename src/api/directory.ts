import { absUrl } from "../state";
import { cachedJson, httpGetText } from "./client";
import { FEED_TTL_MS } from "./feed";
import { tryParseJson } from "../utils/json";
import type { Directory, DirectoryGroup, SuggestResult } from "../types/api";

/** Series / tag directories, cached for one hour. */
export function fetchDirectory(urlPath: string, key: string): Promise<Directory> {
  return cachedJson<Directory>(key, absUrl(urlPath), FEED_TTL_MS);
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
