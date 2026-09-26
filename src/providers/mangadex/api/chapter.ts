/**
 * MangaDex Chapter & MangaDex@Home API Endpoints
 */

import { fetchMangaDex } from "./client";
import { cleanMangaDexId } from "./constants";
import type {
  MangaDexAtHomeResponse,
  MangaDexChapter,
  MangaDexContentRating,
  MangaDexResponse,
} from "../types";

/**
 * Fetches single chapter metadata with scanlation_group and manga relationships.
 */
export async function getChapter(id: string): Promise<MangaDexChapter> {
  const cleanId = cleanMangaDexId(id);
  const resp = await fetchMangaDex<MangaDexResponse<MangaDexChapter>>(`/chapter/${cleanId}`, {
    includes: ["scanlation_group", "manga"],
  });
  return resp.data;
}

/**
 * Requests an assigned MangaDex@Home server for a chapter.
 * Returns the ephemeral baseUrl and full/data-saver page filenames.
 */
export async function getAtHomeServer(
  chapterId: string,
  forcePort443 = false,
): Promise<MangaDexAtHomeResponse> {
  const cleanId = cleanMangaDexId(chapterId);
  return fetchMangaDex<MangaDexAtHomeResponse>(`/at-home/server/${cleanId}`, {
    forcePort443: forcePort443 ? "true" : undefined,
  });
}

/**
 * Constructs a fully qualified image URL from MangaDex@Home parameters.
 */
export function buildPageUrl(
  baseUrl: string,
  hash: string,
  filename: string,
  quality: "data" | "data-saver" = "data-saver",
): string {
  const mode = quality === "data-saver" ? "data-saver" : "data";
  return `${baseUrl}/${mode}/${hash}/${filename}`;
}

export interface MangaDexChapterSearchFilters {
  limit?: number;
  offset?: number;
  translatedLanguage?: string[];
  order?: Record<string, "asc" | "desc">;
  contentRating?: MangaDexContentRating[];
  includes?: string[];
  manga?: string;
  ids?: string[];
}

/**
 * Searches chapters with filtering, sorting, and relationship expansion.
 * Used for Recent Releases and Recently Added chapter feeds.
 */
export async function searchChapters(
  filters: MangaDexChapterSearchFilters = {},
): Promise<MangaDexResponse<MangaDexChapter[]>> {
  const params: Record<string, unknown> = {
    limit: filters.limit ?? 24,
    offset: filters.offset ?? 0,
    translatedLanguage: filters.translatedLanguage ?? ["en"],
    contentRating: filters.contentRating ?? ["safe", "suggestive", "erotica", "pornographic"],
    includes: filters.includes ?? ["scanlation_group", "manga"],
    includeExternalUrl: 0,
    includeEmptyPages: 0,
    includeFutureUpdates: 0,
  };
  if (filters.manga) {
    params.manga = filters.manga;
  }
  if (filters.ids) {
    params.ids = filters.ids;
  }
  if (filters.order) {
    params.order = filters.order;
  }
  const resp = await fetchMangaDex<MangaDexResponse<MangaDexChapter[]>>("/chapter", params);
  if (resp.data) {
    resp.data = resp.data.filter((c) => !c.attributes.externalUrl && (c.attributes.pages ?? 0) > 0);
  }
  return resp;
}
