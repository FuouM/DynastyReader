/**
 * MangaDex Domain & UI Mapping Layer
 * Converts MangaDex API models to DynastyReader domain models and multi-scanlator groups.
 */

import { MANGADEX_UPLOADS_BASE } from "./api/constants";
import type {
  MangaDexChapter,
  MangaDexChapterGroup,
  MangaDexChapterUpload,
  MangaDexManga,
  MangaDexRelationship,
} from "./types";
import type { Chapter, ChapterPage, ChapterTag, Series, SeriesTag } from "../../types/api";
import type { FeedItemData } from "../../components/FeedItemRow";

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
 * Groups raw MangaDex chapter feed items by chapter number.
 * Supports the multi-scanlator accordion UX (tap chapter to reveal available scanlators).
 */
export function groupChaptersByNumber(
  chapters: MangaDexChapter[],
  order: "asc" | "desc" = "asc",
): MangaDexChapterGroup[] {
  const groupsMap = new Map<string, MangaDexChapterUpload[]>();

  for (const ch of chapters) {
    // Find scanlation group name from relationships
    const groupRel = ch.relationships?.find((r) => r.type === "scanlation_group");
    let scanlatorName = "No Group";
    if (groupRel?.attributes && typeof groupRel.attributes === "object" && "name" in groupRel.attributes) {
      const rawName = groupRel.attributes.name;
      if (typeof rawName === "string" && rawName) {
        scanlatorName = rawName;
      }
    }
    const scanlatorId = groupRel?.id || null;

    const chNum = ch.attributes.chapter;
    const key = chNum !== null && chNum !== undefined ? chNum : "__oneshot__";

    const upload: MangaDexChapterUpload = {
      id: ch.id,
      chapterNumber: chNum,
      volume: ch.attributes.volume,
      title: ch.attributes.title,
      translatedLanguage: ch.attributes.translatedLanguage,
      scanlatorName,
      scanlatorId,
      readableAt: ch.attributes.readableAt,
      pages: ch.attributes.pages,
      externalUrl: ch.attributes.externalUrl,
    };

    const existing = groupsMap.get(key);
    if (existing) {
      existing.push(upload);
    } else {
      groupsMap.set(key, [upload]);
    }
  }

  const result: MangaDexChapterGroup[] = [];

  for (const [key, uploads] of groupsMap.entries()) {
    const isSpecial = key === "__oneshot__";
    const chNum = isSpecial ? null : key;
    const firstUpload = uploads[0];

    let displayTitle: string;
    if (isSpecial) {
      displayTitle = firstUpload.title ? `Oneshot: ${firstUpload.title}` : "Oneshot / Extra";
    } else {
      displayTitle = firstUpload.title
        ? `Ch. ${chNum} — ${firstUpload.title}`
        : `Chapter ${chNum}`;
    }

    result.push({
      chapterNumber: chNum,
      displayTitle,
      volume: firstUpload.volume,
      uploads,
    });
  }

  // Sort groups by chapter number
  result.sort((a, b) => {
    const numA = parseChapterNumber(a.chapterNumber);
    const numB = parseChapterNumber(b.chapterNumber);

    if (numA === -1 && numB !== -1) return 1; // Oneshots to the end
    if (numA !== -1 && numB === -1) return -1;

    return order === "asc" ? numA - numB : numB - numA;
  });

  return result;
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

/**
 * Maps a MangaDexChapter entity with its manga and scanlation_group relationships
 * to DynastyReader's standard FeedItemData for FeedItemRow.
 */
export function mangaDexChapterToFeedItemData(
  chapter: MangaDexChapter,
  mangaEntity?: MangaDexManga,
): FeedItemData & { coverUrl?: string | null } {
  const chNum = chapter.attributes.chapter;
  const rawTitle = chapter.attributes.title;
  const title = chNum
    ? rawTitle
      ? `Ch. ${chNum} - ${rawTitle}`
      : `Chapter ${chNum}`
    : rawTitle || "Oneshot";

  // Find manga relationship
  const mangaRel = chapter.relationships?.find((r) => r.type === "manga");
  let mangaTitle = "Manga";
  let mangaId = "";
  if (mangaEntity) {
    mangaId = mangaEntity.id;
    mangaTitle = formatMangaTitle(mangaEntity);
  } else if (mangaRel) {
    mangaId = mangaRel.id;
    const attrs = mangaRel.attributes;
    if (attrs && typeof attrs === "object" && "title" in attrs) {
      const titleMap = attrs.title as Record<string, string>;
      mangaTitle = titleMap?.en || Object.values(titleMap || {})[0] || "Manga";
    }
  }

  // Find scanlation group relationship
  const groupRel = chapter.relationships?.find((r) => r.type === "scanlation_group");
  let groupName: string | undefined;
  if (groupRel) {
    const attrs = groupRel.attributes;
    if (attrs && typeof attrs === "object" && "name" in attrs && typeof attrs.name === "string") {
      groupName = attrs.name;
    }
  }

  const tags: { type?: string; name?: string; permalink?: string }[] = [];
  if (mangaId) {
    tags.push({
      type: "Series",
      name: mangaTitle,
      permalink: `mdx:${mangaId}`,
    });
  }

  // 1. Authors
  if (mangaEntity) {
    const authors = getMangaAuthors(mangaEntity);
    for (const author of authors) {
      tags.push({
        type: "Author",
        name: author,
        permalink: `mdx-author:${author}`,
      });
    }
  }

  // 2. Scanlator
  if (groupName && groupRel) {
    tags.push({
      type: "Scanlator",
      name: groupName,
      permalink: `mdx-group:${groupRel.id}`,
    });
  }

  // 3. Tags (genres, themes, formats)
  const rawMangaTags = mangaEntity?.attributes?.tags || (mangaRel?.attributes && typeof mangaRel.attributes === "object" && "tags" in mangaRel.attributes ? (mangaRel.attributes as { tags?: Array<{ attributes?: { name?: Record<string, string> } }> }).tags : undefined) || [];
  for (const t of rawMangaTags) {
    const tagName = t.attributes?.name?.en || (t.attributes?.name ? Object.values(t.attributes.name)[0] : undefined);
    if (tagName && typeof tagName === "string") {
      tags.push({
        type: "General",
        name: tagName,
        permalink: `mdx-tag:${tagName}`,
      });
    }
  }

  const coverUrl = mangaEntity ? getMangaCoverUrl(mangaEntity, "256") : null;

  return {
    permalink: `mdx:${chapter.id}`,
    title,
    kind: "chapter",
    series: mangaTitle,
    tags,
    url: `https://mangadex.org/chapter/${chapter.id}`,
    coverUrl,
  };
}
