/**
 * Tag taxonomy helpers: category ordering and pill-class mapping.
 * Extracted from the old `state.ts` barrel.
 */

/**
 * Stable category ordering for browse tag pills: Author, Scanlator, Pairing,
 * Doujin, Series, Anthology, Issue, then everything else (General) last.
 */
const TAG_CATEGORY_RANK: Record<string, number> = Object.fromEntries(
  [
    "author",
    "scanlator",
    "pairing",
    "doujin",
    "series",
    "anthology",
    "issue",
    "general",
  ].map((c, i) => [c, i]),
);

/** Sorts tags by browse category order (author first), stable within a category. */
export function sortTagsByCategory<T extends { type: string }>(tags: T[]): T[] {
  return [...tags].sort((a, b) => {
    const rankA = TAG_CATEGORY_RANK[(a.type ?? "").toLowerCase()] ?? 8;
    const rankB = TAG_CATEGORY_RANK[(b.type ?? "").toLowerCase()] ?? 8;
    return rankA - rankB;
  });
}

/** Status names rendered as green status pills regardless of tag type. */
const STATUS_NAMES = new Set([
  "oneshot",
  "one-shot",
  "anthology",
  "completed",
  "ongoing",
  "licensed",
  "hiatus",
  "discontinued",
]);

/**
 * Maps a Dynasty Scans tag type or name to a themed tag-pill class. Both light
 * and dark palettes are driven entirely by CSS, never inline colors.
 */
export function tagClass(type: string, name?: string): string {
  const t = (type ?? "").toLowerCase();
  switch (t) {
    case "author":
    case "artist":
      return "tag-pill tag-artist";
    case "character":
      return "tag-pill tag-character";
    case "pairing":
      return "tag-pill tag-pairing";
    case "series":
    case "anthology":
    case "issue":
    case "doujin":
    case "doujinshi":
    case "copyright":
    case "parody":
      return "tag-pill tag-copyright";
    case "scanlator":
    case "group":
    case "meta":
      return "tag-pill tag-meta";
    case "status":
      return "tag-pill tag-status";
    default:
      if (STATUS_NAMES.has((name ?? "").toLowerCase())) {
        return "tag-pill tag-status";
      }
      return "tag-pill tag-rank-3";
  }
}