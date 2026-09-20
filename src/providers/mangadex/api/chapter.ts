/**
 * MangaDex Chapter & MangaDex@Home API Endpoints
 */

import { fetchMangaDex } from "./client";
import type {
  MangaDexAtHomeResponse,
  MangaDexChapter,
  MangaDexResponse,
} from "../types";

/**
 * Fetches single chapter metadata with scanlation_group and manga relationships.
 */
export async function getChapter(id: string): Promise<MangaDexChapter> {
  const resp = await fetchMangaDex<MangaDexResponse<MangaDexChapter>>(`/chapter/${id}`, {
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
  return fetchMangaDex<MangaDexAtHomeResponse>(`/at-home/server/${chapterId}`, {
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
