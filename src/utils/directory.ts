import type { Directory, DirectoryGroup } from "../types/api";

/** Normalized, ordered letter → entries groups from a directory payload. */
export function directoryGroups(d: Directory | unknown): DirectoryGroup[] {
  if (!d || typeof d !== "object") return [];
  const obj = d as { tags?: unknown };
  const rawList = obj.tags ?? (Array.isArray(d) ? d : []);
  if (!Array.isArray(rawList)) return [];
  return rawList
    .map((item) => {
      if (item && typeof item === "object") {
        const letter = Object.keys(item)[0] ?? "?";
        const entries = Array.isArray((item as Record<string, unknown>)[letter])
          ? ((item as Record<string, unknown>)[letter] as DirectoryGroup["entries"])
          : [];
        return { letter, entries };
      }
      return { letter: "?", entries: [] };
    })
    .filter((g) => g.entries.length > 0);
}
