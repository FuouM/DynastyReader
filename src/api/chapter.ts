import { SITE_ROOT } from "../stores";
import { cachedJson } from "./client";
import { ChapterSchema, type ValidatedChapter } from "./schemas";

/** Chapter detail (pages + tags). Cached forever; refreshed manually if needed. */
export async function fetchChapter(permalink: string): Promise<ValidatedChapter> {
  const raw = await cachedJson<unknown>(`chapter:${permalink}`, `${SITE_ROOT}/chapters/${permalink}.json`);
  return ChapterSchema.parse(raw);
}
