/**
 * Dynasty Scans Domain Taxonomy
 *
 * Single source of truth for:
 * 1. Entity kinds, plural endpoints, and path segment mappings.
 * 2. Tag categories, category ranking, and status keyword recognition.
 * 3. Theme CSS classes, Bootstrap icon names, and brand accent colors.
 * 4. Entity / tag classification helpers (isSeriesLike, isArtist, isScanlator, etc.).
 * 5. Tag partitioning and grouping utilities for feeds and series detail views.
 */

import type { BootstrapIconName } from "./components/Icon";
import type { ChapterTag, SeriesTag, SeriesTaggings } from "./types/api";
export type { GroupedSeriesTags } from "./types/taxonomy";
import type { GroupedSeriesTags } from "./types/taxonomy";

// ── 1. Canonical Domain Entity Types ──────────────────────────────────────────

export type EntityKind =
  | "chapter"
  | "series"
  | "anthology"
  | "doujin"
  | "issue"
  | "author"
  | "scanlator"
  | "pairing"
  | "tag";

/** Runtime type guard for EntityKind. */
export function isEntityKind(s: string): s is EntityKind {
  return s in ENTITY_TAXONOMY;
}

export interface EntityMeta {
  kind: EntityKind;
  path: string;
  label: string;
  icon: BootstrapIconName;
  color: string;
  isSeriesLike: boolean;
  isContent: boolean;
}

/** Canonical taxonomy metadata for all Dynasty domain entity kinds. */
export const ENTITY_TAXONOMY: Record<EntityKind, EntityMeta> = {
  chapter: { kind: "chapter", path: "chapters", label: "Chapter", icon: "file-earmark-text", color: "#0078d4", isSeriesLike: false, isContent: true },
  series: { kind: "series", path: "series", label: "Series", icon: "collection-play", color: "#d83b01", isSeriesLike: true, isContent: true },
  anthology: { kind: "anthology", path: "anthologies", label: "Anthology", icon: "journal-album", color: "#107c41", isSeriesLike: true, isContent: true },
  doujin: { kind: "doujin", path: "doujins", label: "Doujin", icon: "book", color: "#8764b8", isSeriesLike: true, isContent: true },
  issue: { kind: "issue", path: "issues", label: "Issue", icon: "newspaper", color: "#b146c2", isSeriesLike: true, isContent: true },
  author: { kind: "author", path: "authors", label: "Author", icon: "person", color: "#008272", isSeriesLike: true, isContent: false },
  scanlator: { kind: "scanlator", path: "scanlators", label: "Scanlator", icon: "people", color: "#5c2d91", isSeriesLike: true, isContent: false },
  pairing: { kind: "pairing", path: "pairings", label: "Pairing", icon: "heart", color: "#e3008c", isSeriesLike: true, isContent: false },
  tag: { kind: "tag", path: "tags", label: "Tag", icon: "tag", color: "#69797e", isSeriesLike: true, isContent: false },
};

/** Mapping from URL path segments and aliases to canonical EntityKind. */
export const KIND_BY_PATH_SEGMENT: Record<string, EntityKind> = {
  chapters: "chapter",
  series: "series",
  anthologies: "anthology",
  doujins: "doujin",
  doujinshi: "doujin",
  issues: "issue",
  authors: "author",
  artists: "author",
  scanlators: "scanlator",
  groups: "scanlator",
  pairings: "pairing",
  tags: "tag",
};

/**
 * Returns the plural API / URL path segment for any series-style entity type string.
 */
export function seriesTypeToPath(type?: string | null): string {
  const t = (type ?? "").toLowerCase().trim();
  const kind = KIND_BY_PATH_SEGMENT[t] ?? KIND_BY_PATH_SEGMENT[`${t}s`];
  if (kind && ENTITY_TAXONOMY[kind]) {
    return ENTITY_TAXONOMY[kind].path;
  }
  return "series";
}

/** Checks whether an entity kind is a collection/series container (not a bare chapter). */
export function isSeriesKind(kind?: string | null): boolean {
  if (!kind) return false;
  const k = kind.toLowerCase();
  return isEntityKind(k) && (ENTITY_TAXONOMY[k]?.isSeriesLike ?? false);
}

export function isContentKind(kind?: string | null): boolean {
  if (!kind) return false;
  const k = kind.toLowerCase();
  return isEntityKind(k) && (ENTITY_TAXONOMY[k]?.isContent ?? false);
}

/**
 * Canonical chapter container kinds (ordered by priority when selecting a parent container for a chapter).
 * Series, Anthology, and Issue are structured sequential chapter containers.
 * Doujin acts as a container for doujinshi/doujin works when no higher-level container exists.
 */
export const CHAPTER_CONTAINER_KINDS = ["series", "anthology", "issue", "doujin"] as const;
/** Checks whether a tag type represents a chapter container (Series, Anthology, Issue). */
export function isContainerKind(type?: string | null): boolean {
  if (!type) return false;
  const clean = type.toLowerCase().trim();
  const kind = KIND_BY_PATH_SEGMENT[clean] ?? KIND_BY_PATH_SEGMENT[`${clean}s`] ?? clean;
  return (CHAPTER_CONTAINER_KINDS as readonly string[]).includes(kind);
}

/**
 * Finds the parent container tag for a chapter in priority order:
 * 1. Series
 * 2. Anthology
 * 3. Issue
 *
 * Explicitly excludes non-container tags like Author, Scanlator, Doujin (copyright/parody), Pairing, General, etc.
 */
export function getChapterContainerTag(
  tags?: { type?: string; name?: string; permalink?: string }[],
): { type: string; name: string; permalink: string } | null {
  if (!tags || tags.length === 0) return null;

  const normalizeType = (t?: string): string => {
    if (!t) return "";
    const clean = t.toLowerCase().trim();
    return KIND_BY_PATH_SEGMENT[clean] ?? KIND_BY_PATH_SEGMENT[`${clean}s`] ?? clean;
  };

  for (const priority of CHAPTER_CONTAINER_KINDS) {
    const found = tags.find(
      (t) => normalizeType(t.type) === priority && Boolean(t.permalink && t.permalink.trim().length > 0),
    );
    if (found && found.permalink) {
      return {
        type: found.type || priority,
        name: found.name || "",
        permalink: found.permalink,
      };
    }
  }

  return null;
}

// ── 2. Tag Classification & Categories ────────────────────────────────────────

export type TagCategory =
  | "Author"
  | "Scanlator"
  | "Pairing"
  | "Character"
  | "Doujin"
  | "Series"
  | "Anthology"
  | "Issue"
  | "Status"
  | "General";

/**
 * Canonical ordering rank for browse tag pills:
 * Author -> Scanlator -> Pairing -> Character -> Doujin -> Series -> Anthology -> Issue -> General.
 */
export const TAG_CATEGORY_RANK: Record<string, number> = {
  author: 0,
  artist: 0,
  scanlator: 1,
  group: 1,
  pairing: 2,
  character: 3,
  doujin: 4,
  doujinshi: 4,
  series: 5,
  anthology: 6,
  issue: 7,
  general: 8,
};

/** Status names rendered as green status pills regardless of tag type. */
export const STATUS_NAMES: Record<string, true> = {
  oneshot: true,
  "one-shot": true,
  anthology: true,
  completed: true,
  ongoing: true,
  licensed: true,
  hiatus: true,
  discontinued: true,
};
export function isArtistTag(type?: string | null): boolean {
  const t = (type ?? "").toLowerCase();
  return t === "author" || t === "artist";
}

export function isScanlatorTag(type?: string | null): boolean {
  const t = (type ?? "").toLowerCase();
  return t === "scanlator" || t === "group";
}

export function isDoujinTag(type?: string | null): boolean {
  const t = (type ?? "").toLowerCase();
  return t === "doujin" || t === "doujinshi" || t === "copyright" || t === "parody";
}

export function isPairingTag(type?: string | null): boolean {
  const t = (type ?? "").toLowerCase();
  return t === "pairing";
}

export function isCharacterTag(type?: string | null): boolean {
  const t = (type ?? "").toLowerCase();
  return t === "character";
}

export function isStatusTag(type?: string | null, name?: string | null): boolean {
  const t = (type ?? "").toLowerCase();
  const n = (name ?? "").toLowerCase();
  return t === "status" || t === "format" || Boolean(STATUS_NAMES[n]);
}

/** Maps a parsed search/navigation entity kind to its standard Tag category label. */
export function tagKindToType(kind: EntityKind | string): TagCategory {
  switch (kind) {
    case "author":
      return "Author";
    case "scanlator":
      return "Scanlator";
    case "pairing":
      return "Pairing";
    case "character":
      return "Character";
    case "doujin":
      return "Doujin";
    case "series":
      return "Series";
    case "anthology":
      return "Anthology";
    case "issue":
      return "Issue";
    case "tag":
    default:
      return "General";
  }
}

/**
 * Maps a Dynasty Scans tag type or name to a themed CSS tag-pill class.
 * Both light and dark palettes are driven entirely by CSS variables.
 */
export function tagClass(type: string, name?: string): string {
  const t = (type ?? "").toLowerCase();
  if (isArtistTag(t)) return "tag-pill tag-artist";
  if (isCharacterTag(t)) return "tag-pill tag-character";
  if (isPairingTag(t)) return "tag-pill tag-pairing";
  if (isDoujinTag(t) || t === "series" || t === "anthology" || t === "issue") return "tag-pill tag-copyright";
  if (isScanlatorTag(t) || t === "meta") return "tag-pill tag-meta";
  if (isStatusTag(t, name)) return "tag-pill tag-status";
  return "tag-pill tag-rank-3";
}

/** Sorts tags by browse category order (author first), stable within a category. */
export function sortTagsByCategory<T extends { type: string }>(tags: T[]): T[] {
  return [...tags].sort((a, b) => {
    const rankA = TAG_CATEGORY_RANK[(a.type ?? "").toLowerCase()] ?? 8;
    const rankB = TAG_CATEGORY_RANK[(b.type ?? "").toLowerCase()] ?? 8;
    return rankA - rankB;
  });
}

// ── 3. Tag Grouping & Partitioning ────────────────────────────────────────────

/**
 * Partitions a series' tags and chapter taggings into categorized buckets
 * for metadata display and header rendering.
 */
export function groupSeriesTags(
  tags?: SeriesTag[] | null,
  taggings?: SeriesTaggings[] | null,
): GroupedSeriesTags {
  const authorTags: SeriesTag[] = [];
  const groupMap = new Map<string, SeriesTag>();
  const doujinTags: SeriesTag[] = [];
  const pairingTags: SeriesTag[] = [];
  const characterTags: SeriesTag[] = [];
  const statusTags: SeriesTag[] = [];
  const otherTags: SeriesTag[] = [];

  for (const t of tags ?? []) {
    const type = t.type ?? "";
    const name = t.name ?? "";
    if (isArtistTag(type)) {
      authorTags.push(t);
    } else if (isScanlatorTag(type)) {
      groupMap.set(t.permalink || t.name, t);
    } else if (isDoujinTag(type)) {
      doujinTags.push(t);
    } else if (isPairingTag(type)) {
      pairingTags.push(t);
    } else if (isCharacterTag(type)) {
      characterTags.push(t);
    } else if (isStatusTag(type, name)) {
      statusTags.push(t);
    } else {
      otherTags.push(t);
    }
  }

  // Also collect any scanlation groups from chapter taggings if not in series.tags
  for (const tagging of taggings ?? []) {
    for (const t of tagging.tags ?? []) {
      if (isScanlatorTag(t.type)) {
        const key = t.permalink || t.name;
        if (!groupMap.has(key)) {
          groupMap.set(key, t);
        }
      }
    }
  }

  const groupTags = Array.from(groupMap.values());
  return { authorTags, groupTags, doujinTags, pairingTags, characterTags, statusTags, otherTags };
}

export interface CategorizedChapterTags {
  artistTags: ChapterTag[];
  groupTags: ChapterTag[];
  otherTags: ChapterTag[];
}

/**
 * Partitions feed chapter tags into artist, scanlator, and other sorted tags.
 */
export function categorizeChapterTags(rawTags: ChapterTag[] = []): CategorizedChapterTags {
  const artistTags = rawTags.filter((t) => isArtistTag(t.type));
  const groupTags = rawTags.filter((t) => isScanlatorTag(t.type));
  const otherTags = sortTagsByCategory(
    rawTags.filter((t) => !isArtistTag(t.type) && !isScanlatorTag(t.type) && (t.type ?? "").toLowerCase() !== "series"),
  );
  return { artistTags, groupTags, otherTags };
}
