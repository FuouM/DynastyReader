/**
 * MangaDex Feed & Revalidation Service
 * Provides standard Feed / FeedRevalidationResult models to BrowseFeed.tsx.
 */

import { searchManga } from "./api/manga";
import { searchChapters } from "./api/chapter";
import {
  formatMangaTitle,
  formatMangaDexChapterTitle,
  getMangaAuthorTags,
  getChapterScanlationGroup,
  getMangaCoverUrl,
} from "./mapping";
import { t } from "../../i18n";
import { whitelistEnabled, whitelistedTags } from "./db/whitelist.repo";
import {
  getCachedMdxMetadata,
  setCachedMdxMetadata,
  touchCachedMdxMetadata,
} from "./db/metadata.repo";
import type { Feed, FeedChapter, FeedRevalidationResult, SeriesTag } from "../../types/api";
import type { FeedHeadRevalidationResult } from "../../browse/useFeedHeadRevalidation";
import type { MangaDexChapter, MangaDexManga } from "./types";

const PAGE_SIZE = 24;

function parseTabAndPageFromKey(key: string): { tabId: string; page: number } {
  const parts = key.split(":");
  const tabId = parts[1] || "releases";
  const page = parseInt(parts[2] || "1", 10);
  return { tabId, page: Number.isNaN(page) ? 1 : page };
}

function feedCacheKey(tabId: string, page: number): string {
  const whitelistKey = whitelistEnabled()
    ? whitelistedTags().map((t) => t.id).sort().join(",")
    : "all";
  return `mdx:feed:${tabId}:${page}:${whitelistKey}`;
}

async function readCachedFeed(cacheKey: string) {
  const cached = await getCachedMdxMetadata(cacheKey).catch(() => null);
  let parsedFeed: Feed | null = null;
  if (cached?.json_payload) {
    try {
      const raw = JSON.parse(cached.json_payload);
      if (raw && Array.isArray(raw.chapters)) {
        parsedFeed = raw;
      }
    } catch {
      parsedFeed = null;
    }
  }
  return { cached, parsedFeed };
}

/** Id of the newest chapter for the tab (one-item head request). Throws on network failure. */
async function fetchNewestChapterId(tabId: string): Promise<string | null> {
  if (whitelistEnabled() && whitelistedTags().length > 0) {
    const tagIds = whitelistedTags().map((t) => t.id);
    const headManga = await searchManga({
      includedTags: tagIds,
      order: { latestUploadedChapter: "desc" },
      limit: 1,
    });
    return headManga.data?.[0]?.attributes?.latestUploadedChapter || null;
  }
  const order: Record<string, "asc" | "desc"> =
    tabId === "releases" ? { readableAt: "desc" } : { createdAt: "desc" };
  const headCh = await searchChapters({
    limit: 1,
    order,
    translatedLanguage: ["en"],
  });
  return headCh.data?.[0]?.id || null;
}

function mapMdxChapterToFeedChapter(
  ch: MangaDexChapter,
  mangaEntity?: MangaDexManga,
): FeedChapter {
  const title = formatMangaDexChapterTitle(ch.attributes.chapter, ch.attributes.title);
  let mangaTitle = t("mangadex.defaultManga");
  let mangaId = "";
  if (mangaEntity) {
    mangaId = mangaEntity.id;
    mangaTitle = formatMangaTitle(mangaEntity);
  } else {
    const mangaRel = ch.relationships?.find((r) => r.type === "manga");
    if (mangaRel) {
      mangaId = mangaRel.id;
      const attrs = mangaRel.attributes;
      if (attrs && typeof attrs === "object" && "title" in attrs) {
        const titleMap = attrs.title as Record<string, string>;
        mangaTitle = titleMap?.en || Object.values(titleMap || {})[0] || t("mangadex.defaultManga");
      }
    }
  }

  const tags: SeriesTag[] = [];
  if (mangaId) {
    tags.push({
      type: "Series",
      name: mangaTitle,
      permalink: `mdx:${mangaId}`,
    });
  }

  if (mangaEntity) {
    tags.push(...getMangaAuthorTags(mangaEntity));

    for (const t of mangaEntity.attributes.tags || []) {
      const name = t.attributes?.name?.en;
      if (name) {
        tags.push({
          type: "Tag",
          name,
          permalink: `mdx-tag:${t.id}`,
        });
      }
    }
  }

  const group = getChapterScanlationGroup(ch);
  if (group) {
    tags.push({
      type: "Scanlator",
      name: group.name,
      permalink: `mdx-group:${group.name}`,
    });
  }

  const coverUrl = mangaEntity ? getMangaCoverUrl(mangaEntity, "256") : null;

  return {
    title,
    series: mangaTitle,
    series_type: "Series",
    permalink: `mdx:${ch.id}`,
    tags,
    released_on: ch.attributes.readableAt ?? null,
    cover_url: coverUrl,
  };
}

export async function fetchMangaDexFeedWithRevalidation(
  _urlPath: string,
  key: string,
  force = false,
): Promise<FeedRevalidationResult> {
  const { tabId, page } = parseTabAndPageFromKey(key);
  const cacheKey = feedCacheKey(tabId, page);

  // 1. Check SQLite metadata cache
  const { cached, parsedFeed } = await readCachedFeed(cacheKey);

  const isCacheFresh = cached && Date.now() - cached.cached_at < 5 * 60 * 1000;
  if (page === 1 && parsedFeed && !force && isCacheFresh) {
    return {
      data: parsedFeed,
      isStale: false,
      cachedAt: cached.cached_at,
      source: "sqlite",
    };
  }

  // 2. Fast Head Check (limit: 1) if page 1 and cached exists
  if (page === 1 && parsedFeed && Array.isArray(parsedFeed.chapters) && parsedFeed.chapters.length > 0) {
    let newestChapterId: string | null = null;
    try {
      newestChapterId = await fetchNewestChapterId(tabId);
    } catch (err) {
      console.warn("[MangaDexFeed] Head check error:", err);
    }

    const currentTopId = parsedFeed.chapters[0]?.permalink.replace(/^mdx:/, "");
    if (newestChapterId && newestChapterId === currentTopId) {
      await touchCachedMdxMetadata(cacheKey).catch(() => {});
      return {
        data: parsedFeed,
        isStale: false,
        cachedAt: Date.now(),
        source: "sqlite",
      };
    }
  }

  // 3. Full fetch
  const offset = (page - 1) * PAGE_SIZE;
  let chapters: MangaDexChapter[] = [];
  const mangaMap = new Map<string, MangaDexManga>();
  let totalCount = 0;

  if (whitelistEnabled() && whitelistedTags().length > 0) {
    const tagIds = whitelistedTags().map((t) => t.id);
    const mangaResp = await searchManga({
      includedTags: tagIds,
      order: { latestUploadedChapter: "desc" },
      limit: PAGE_SIZE,
      offset,
    });

    totalCount = mangaResp.total ?? 0;
    const mangaList = mangaResp.data || [];
    for (const m of mangaList) {
      mangaMap.set(m.id, m);
    }

    const chapterIds = mangaList
      .map((m) => m.attributes.latestUploadedChapter)
      .filter((id): id is string => Boolean(id));

    if (chapterIds.length > 0) {
      const cResp = await searchChapters({
        ids: chapterIds,
        limit: 100,
        translatedLanguage: ["en"],
        includes: ["scanlation_group", "manga"],
      });
      chapters = cResp.data || [];
    }
  } else {
    const order: Record<string, "asc" | "desc"> =
      tabId === "releases" ? { readableAt: "desc" } : { createdAt: "desc" };
    const resp = await searchChapters({
      limit: PAGE_SIZE,
      offset,
      order,
      translatedLanguage: ["en"],
      includes: ["scanlation_group", "manga"],
    });
    chapters = resp.data || [];
    totalCount = resp.total ?? 0;

    const mangaIds = Array.from(
      new Set(
        chapters
          .map((c) => c.relationships?.find((r) => r.type === "manga")?.id)
          .filter((id): id is string => Boolean(id)),
      ),
    );
    if (mangaIds.length > 0) {
      try {
        const mangaResp = await searchManga({ ids: mangaIds, limit: 100 });
        for (const m of mangaResp.data || []) {
          mangaMap.set(m.id, m);
        }
      } catch (err) {
        console.warn("[MangaDexFeed] Failed to batch-fetch manga:", err);
      }
    }
  }

  const feedChapters: FeedChapter[] = chapters.map((ch) => {
    const mId = ch.relationships?.find((r) => r.type === "manga")?.id;
    const mEntity = mId ? mangaMap.get(mId) : undefined;
    return mapMdxChapterToFeedChapter(ch, mEntity);
  });

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const freshFeed: Feed = {
    chapters: feedChapters,
    current_page: page,
    total_pages: totalPages,
  };

  void setCachedMdxMetadata(cacheKey, "feed", JSON.stringify(freshFeed)).catch(() => {});

  return {
    data: freshFeed,
    isStale: false,
    cachedAt: Date.now(),
    source: "network",
  };
}

export async function revalidateMangaDexFeedHead(tabId: string): Promise<FeedHeadRevalidationResult> {
  const cacheKey = feedCacheKey(tabId, 1);
  const { parsedFeed } = await readCachedFeed(cacheKey);

  let newestChapterId: string | null = null;
  try {
    newestChapterId = await fetchNewestChapterId(tabId);
  } catch {
    return { hasNew: false, status: "error" };
  }

  const currentTopId = parsedFeed?.chapters?.[0]?.permalink.replace(/^mdx:/, "");
  if (!currentTopId) {
    return { hasNew: false, status: "no-baseline" };
  }

  if (newestChapterId && newestChapterId !== currentTopId) {
    return { hasNew: true, status: "new-chapters" };
  }

  await touchCachedMdxMetadata(cacheKey).catch(() => {});
  return { hasNew: false, status: "unchanged" };
}
