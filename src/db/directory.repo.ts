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
