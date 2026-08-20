import { query, execute } from "./client";
import type { DirectoryEntry, DirectoryGroup } from "../types/api";

/**
 * Searches directory entries directly in SQLite with `LIKE %query%` or alphabetical sorting.
 */
export async function searchDirectoryEntries(
  kind: "series" | "tags",
  searchQuery: string,
): Promise<DirectoryGroup[]> {
  const q = searchQuery.trim();
  const pattern = `%${q}%`;
  const rows = await query<DirectoryEntry & { letter: string }>(
    `SELECT permalink, name, letter
     FROM directory_entries
     WHERE kind = ? AND (name LIKE ? OR permalink LIKE ?)
     ORDER BY letter ASC, name COLLATE NOCASE ASC`,
    [kind, pattern, pattern],
  );

  const groupMap = new Map<string, DirectoryEntry[]>();
  for (const row of rows) {
    let list = groupMap.get(row.letter);
    if (!list) {
      list = [];
      groupMap.set(row.letter, list);
    }
    list.push({ permalink: row.permalink, name: row.name });
  }

  const result: DirectoryGroup[] = [];
  const sortedLetters = Array.from(groupMap.keys()).sort((a, b) => {
    if (a === "#") return -1;
    if (b === "#") return 1;
    return a.localeCompare(b);
  });

  for (const letter of sortedLetters) {
    result.push({ letter, entries: groupMap.get(letter)! });
  }

  return result;
}

/**
 * Batch saves normalized directory entries from a directory page into SQLite.
 */
export async function saveDirectoryEntries(
  kind: "series" | "tags",
  groups: DirectoryGroup[],
): Promise<void> {
  if (groups.length === 0) return;
  const now = Date.now();

  for (const group of groups) {
    for (const entry of group.entries) {
      await execute(
        `INSERT INTO directory_entries (kind, letter, permalink, name, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(kind, permalink) DO UPDATE SET
           letter = excluded.letter,
           name = excluded.name,
           updated_at = excluded.updated_at`,
        [kind, group.letter, entry.permalink, entry.name, now],
      );
    }
  }
}

/**
 * Suggests tags or series directly from SQLite for zero-latency typeahead.
 */
export async function suggestDirectoryEntries(
  searchQuery: string,
  limit = 8,
): Promise<{ id: number; name: string; type: string }[]> {
  const q = searchQuery.trim();
  if (!q) return [];
  const prefix = `${q}%`;
  const pattern = `%${q}%`;
  const rows = await query<{ name: string; kind: string }>(
    `SELECT name, kind
     FROM directory_entries
     WHERE name LIKE ? OR permalink LIKE ?
     ORDER BY CASE WHEN name LIKE ? THEN 0 ELSE 1 END, name COLLATE NOCASE ASC
     LIMIT ?`,
    [pattern, pattern, prefix, limit],
  );

  return rows.map((r, idx) => ({
    id: idx + 1,
    name: r.name,
    type: r.kind === "series" ? "Series" : "Tag",
  }));
}

/**
 * Persists suggestion results returned by Dynasty's /tags/suggest into SQLite directory_entries.
 */
export async function saveSuggestEntries(
  suggestions: { name: string; type: string }[],
): Promise<void> {
  if (suggestions.length === 0) return;
  const now = Date.now();

  for (const s of suggestions) {
    if (!s.name) continue;
    const kind = s.type?.toLowerCase() === "series" ? "series" : "tags";
    const permalink = s.name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    if (!permalink) continue;

    const firstChar = s.name.trim().charAt(0).toUpperCase();
    const letter = /[A-Z]/.test(firstChar) ? firstChar : "#";

    await execute(
      `INSERT INTO directory_entries (kind, letter, permalink, name, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(kind, permalink) DO UPDATE SET
         letter = excluded.letter,
         name = excluded.name,
         updated_at = excluded.updated_at`,
      [kind, letter, permalink, s.name.trim(), now],
    );
  }
}
