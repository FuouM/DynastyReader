/**
 * MangaDex Manga API Endpoints
 * Implements search, details, feed, aggregate, and tags.
 */

import { fetchMangaDex } from "./client";
import { cleanMangaDexId } from "./constants";
import { getChapter } from "./chapter";
import type {
  MangaDexChapter,
  MangaDexManga,
  MangaDexResponse,
  MangaDexSearchFilters,
  MangaDexTag,
} from "../types";

/**
 * Searches manga with filters (tags, content rating, status, sorting, pagination).
 * Automatically includes cover_art and author entities.
 */
export async function searchManga(
  filters: MangaDexSearchFilters = {},
): Promise<MangaDexResponse<MangaDexManga[]>> {
  const params: Record<string, unknown> = {
    ids: filters.ids,
    title: filters.title,
    includedTags: filters.includedTags,
    excludedTags: filters.excludedTags,
    contentRating: filters.contentRatings ?? ["safe", "suggestive", "erotica", "pornographic"],
    status: filters.status,
    originalLanguage: filters.originalLanguage,
    availableTranslatedLanguage: filters.translatedLanguage,
    order: filters.order ?? { latestUploadedChapter: "desc" },
    limit: filters.limit ?? 24,
    offset: filters.offset ?? 0,
    includes: ["cover_art", "author"],
  };

  return fetchMangaDex<MangaDexResponse<MangaDexManga[]>>("/manga", params);
}

/**
 * Fetches a single manga by UUID with cover_art and author relationships.
 */
export async function getManga(id: string): Promise<MangaDexManga> {
  const cleanId = cleanMangaDexId(id);
  const resp = await fetchMangaDex<MangaDexResponse<MangaDexManga>>(`/manga/${cleanId}`, {
    includes: ["cover_art", "author"],
  });
  return resp.data;
}

/**
 * Resolves whether a bare MangaDex UUID belongs to a manga or a chapter.
 * Queries both endpoints concurrently with Promise.allSettled.
 */
export async function resolveMangaDexEntity(id: string): Promise<"series" | "chapter" | null> {
  const cleanId = cleanMangaDexId(id);
  const [mangaRes, chapterRes] = await Promise.allSettled([
    getManga(cleanId),
    getChapter(cleanId),
  ]);
  if (mangaRes.status === "fulfilled" && mangaRes.value?.id) {
    return "series";
  }
  if (chapterRes.status === "fulfilled" && chapterRes.value?.id) {
    return "chapter";
  }
  return null;
}

export interface GetMangaFeedOptions {
  translatedLanguage?: string[];
  limit?: number;
  offset?: number;
  order?: {
    chapter?: "asc" | "desc";
    volume?: "asc" | "desc";
  };
}

/**
 * Fetches paginated chapter feed for a manga with scanlation_group relationships.
 */
export async function getMangaFeed(
  id: string,
  options: GetMangaFeedOptions = {},
): Promise<MangaDexResponse<MangaDexChapter[]>> {
  const cleanId = cleanMangaDexId(id);
  const params: Record<string, unknown> = {
    translatedLanguage: options.translatedLanguage ?? ["en"],
    limit: options.limit ?? 100,
    offset: options.offset ?? 0,
    order: options.order ?? { volume: "asc", chapter: "asc" },
    includes: ["scanlation_group"],
    includeExternalUrl: 0,
    includeEmptyPages: 0,
    includeFutureUpdates: 0,
  };

  const resp = await fetchMangaDex<MangaDexResponse<MangaDexChapter[]>>(`/manga/${cleanId}/feed`, params);
  if (resp.data) {
    resp.data = resp.data.filter((c) => !c.attributes.externalUrl && (c.attributes.pages ?? 0) > 0);
  }
  return resp;
}

/**
 * Fetches all chapters for a manga across pagination boundaries.
 * Repeatedly queries `/manga/{id}/feed` in batches of up to 500 until offset >= total.
 */
export async function getAllMangaFeed(
  id: string,
  options: GetMangaFeedOptions = {},
): Promise<MangaDexResponse<MangaDexChapter[]>> {
  const batchLimit = Math.min(options.limit ?? 500, 500);
  let offset = options.offset ?? 0;
  const firstResp = await getMangaFeed(id, { ...options, limit: batchLimit, offset });
  const allChapters = [...firstResp.data];
  const total = firstResp.total ?? allChapters.length;
  offset += batchLimit;

  while (offset < total) {
    const nextResp = await getMangaFeed(id, { ...options, limit: batchLimit, offset });
    if (!nextResp.data || nextResp.data.length === 0) break;
    allChapters.push(...nextResp.data);
    offset += batchLimit;
  }

  return {
    ...firstResp,
    data: allChapters,
    total: allChapters.length,
  };
}


/** Cache tag taxonomy in memory to avoid repeated network calls */
let cachedTags: MangaDexTag[] | null = null;

/**
 * Fetches all MangaDex tags (genres, themes, formats, content).
 */
export async function getTags(forceRefresh = false): Promise<MangaDexTag[]> {
  if (cachedTags && !forceRefresh) {
    return cachedTags;
  }
  const resp = await fetchMangaDex<MangaDexResponse<MangaDexTag[]>>("/manga/tag");
  cachedTags = resp.data;
  return resp.data;
}
