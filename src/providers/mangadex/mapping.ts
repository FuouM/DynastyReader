/**
 * MangaDex Domain & UI Mapping Layer
 * Converts MangaDex API models to DynastyReader domain models and multi-scanlator groups.
 */

import { MANGADEX_UPLOADS_BASE } from "./api/constants";
import type {
  MangaDexChapter,
  MangaDexManga,
  MangaDexRelationship,
} from "./types";
import type { Chapter, ChapterPage, ChapterTag, Series, SeriesTag } from "../../types/api";

/**
 * Extracts the most appropriate title for a MangaDex manga based on language preference.
 * Preference order: requested language (e.g. 'en') -> 'ja-ro' -> 'ja' -> first available.
 */
export function formatMangaTitle(manga: MangaDexManga, preferredLang = "en"): string {
  const titleMap = manga.attributes.title;
  if (!titleMap) return "Untitled";

  if (titleMap[preferredLang]) return titleMap[preferredLang];
  if (titleMap["ja-ro"]) return titleMap["ja-ro"];
  if (titleMap["en"]) return titleMap["en"];
  if (titleMap["ja"]) return titleMap["ja"];

  const first = Object.values(titleMap)[0];
  return first || "Untitled";
}

/**
 * Constructs the CDN URL for a MangaDex cover image.
 */
export function getMangaCoverUrl(
  manga: MangaDexManga,
  size: "256" | "512" | "original" = "256",
): string | null {
  const coverRel = manga.relationships?.find(
    (r): r is MangaDexRelationship & { attributes?: { fileName?: string } } =>
      r.type === "cover_art",
  );
  const fileName = coverRel?.attributes?.fileName;
  if (!fileName) return null;

  if (size === "original") {
    return `${MANGADEX_UPLOADS_BASE}/covers/${manga.id}/${fileName}`;
  }
  return `${MANGADEX_UPLOADS_BASE}/covers/${manga.id}/${fileName}.${size}.jpg`;
}

/**
 * Extracts author and artist names from relationships.
 */
export function getMangaAuthors(manga: MangaDexManga): string[] {
  const authors: string[] = [];
  if (!manga.relationships) return authors;

  for (const rel of manga.relationships) {
    if ((rel.type === "author" || rel.type === "artist") && rel.attributes && typeof rel.attributes === "object") {
      const attrs = rel.attributes;
      if ("name" in attrs && typeof attrs.name === "string" && attrs.name && !authors.includes(attrs.name)) {
        authors.push(attrs.name);
      }
    }
  }
  return authors;
}

/**
 * Parses numeric chapter value for safe sorting (e.g. "12.5" -> 12.5, null -> -1).
 */
export function parseChapterNumber(chStr: string | null): number {
  if (chStr === null || chStr === undefined || chStr.trim() === "") {
    return -1; // Oneshots / unnumbered extras
  }
  const parsed = parseFloat(chStr);
  return Number.isNaN(parsed) ? -1 : parsed;
}


/**
 * Maps a MangaDexManga entity to DynastyReader's standard Series interface.
 */
export function mangaDexToStandardSeries(
  manga: MangaDexManga,
  preferredLang = "en",
): Series {
  const name = formatMangaTitle(manga, preferredLang);
  const permalink = `mdx:${manga.id}`;
  const cover = getMangaCoverUrl(manga, "512");

  const tags: SeriesTag[] = (manga.attributes.tags || []).map((t) => ({
    type: t.attributes.group,
    name: t.attributes.name.en || Object.values(t.attributes.name)[0] || "Tag",
    permalink: `mdx-tag:${t.id}`,
  }));

  const descMap = manga.attributes.description;
  const description =
    descMap?.[preferredLang] || descMap?.["en"] || Object.values(descMap || {})[0] || null;

  return {
    name,
    type: "Series",
    permalink,
    tags,
    cover,
    link: `https://mangadex.org/title/${manga.id}`,
    description,
    aliases: (manga.attributes.altTitles || [])
      .map((t) => Object.values(t)[0])
      .filter(Boolean),
    taggings: [],
  };
}

/**
 * Maps a MangaDexChapter entity to DynastyReader's standard Chapter interface.
 */
export function mangaDexToStandardChapter(
  chapter: MangaDexChapter,
  pages?: ChapterPage[],
  seriesContext?: { mangaId: string; mangaTitle: string },
): Chapter {
  const chNum = chapter.attributes.chapter;
  const rawTitle = chapter.attributes.title;
  const title = chNum
    ? rawTitle
      ? `Ch. ${chNum} - ${rawTitle}`
      : `Chapter ${chNum}`
    : rawTitle || "Oneshot";

  const tags: ChapterTag[] = [];
  if (seriesContext?.mangaId && seriesContext?.mangaTitle) {
    tags.push({
      type: "Series",
      name: seriesContext.mangaTitle,
      permalink: `mdx:${seriesContext.mangaId}`,
    });
  }

  const groupRel = chapter.relationships?.find((r) => r.type === "scanlation_group");
  let groupName: string | undefined;
  const attrs = groupRel?.attributes;
  if (attrs && typeof attrs === "object" && "name" in attrs && typeof attrs.name === "string" && attrs.name) {
    groupName = attrs.name;
  }
  if (groupName && groupRel) {
    tags.push({
      type: "Scanlator",
      name: groupName,
      permalink: `mdx-group:${groupRel.id}`,
    });
  }

  return {
    title,
    long_title: title,
    permalink: `mdx:${chapter.id}`,
    pages: pages ?? [],
    tags,
    released_on: chapter.attributes.readableAt
      ? chapter.attributes.readableAt.substring(0, 10)
      : null,
  };
}

