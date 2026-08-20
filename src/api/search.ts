import { SITE_ROOT } from "../stores";
import { httpGetText } from "./client";
import { parseSearchHtml } from "./search-parser";
import { fetchSeries } from "./series";
import { getCached, setCached } from "../db";
import { recordCacheHit } from "./traffic";
import type { SearchParams, SearchResultItem, SearchResultPage, ChapterTag } from "../types/api";

const SEARCH_CACHE_PREFIX = "search_v2:";

function normalizeTagPermalink(tagName: string): string {
  return tagName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * Executes a search against Dynasty Scans with SQLite response caching and
 * multi-tag intersection support.
 */
export async function searchDynasty(params: SearchParams): Promise<SearchResultPage> {
  const query = (params.q ?? "").trim();
  const withTags = (params.withTags ?? []).map((t) => t.trim()).filter(Boolean);
  const withoutTags = (params.withoutTags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean);
  const classes = params.classes && params.classes.length > 0 ? new Set(params.classes) : null;
  const page = Math.max(1, params.page ?? 1);
  const pageSize = 20;

  // ── CASE 1: Empty keyword query + With Tags filter ──────────────────────────
  // Mirror Dynasty Scans tag pages with client-side intersection for multiple tags.
  if (!query && withTags.length > 0) {
    // Fetch all specified tags concurrently (leveraging fetchSeries SQLite ETag cache)
    const tagResults = await Promise.all(
      withTags.map(async (t) => {
        const permalink = normalizeTagPermalink(t);
        try {
          return await fetchSeries(permalink, false, "tag");
        } catch {
          return null;
        }
      }),
    );

    const validTagResults = tagResults.filter((t): t is NonNullable<typeof t> => t !== null);
    if (validTagResults.length === 0) {
      return { items: [], totalPages: 1, currentPage: 1, query: "" };
    }

    // Convert taggings from first tag into SearchResultItems
    const firstTag = validTagResults[0];
    let candidateItems: SearchResultItem[] = [];

    // Add taggables (Series / Anthologies under this tag)
    if (firstTag.taggables && firstTag.taggables.length > 0) {
      for (const tg of firstTag.taggables) {
        candidateItems.push({
          kind: (tg.type ? tg.type.toLowerCase() : "series") as SearchResultItem["kind"],
          title: tg.name,
          permalink: tg.permalink,
          tags: [{ type: "General", name: firstTag.name, permalink: firstTag.permalink }],
        });
      }
    }

    // Add taggings (Chapters / Works under this tag)
    if (firstTag.taggings && firstTag.taggings.length > 0) {
      for (const tg of firstTag.taggings) {
        if (!tg.title || !tg.permalink) continue;
        const itemTags: ChapterTag[] = (tg.tags ?? []).map((t) => ({
          type: t.type || "General",
          name: t.name || "",
          permalink: t.permalink || "",
        }));

        let author: { name: string; permalink: string } | undefined;
        const authorTag = itemTags.find((t) => t.type.toLowerCase() === "author" || t.type.toLowerCase() === "artist");
        if (authorTag) {
          author = { name: authorTag.name, permalink: authorTag.permalink };
        }

        let doujin: { name: string; permalink: string } | undefined;
        const doujinTag = itemTags.find((t) => t.type.toLowerCase() === "doujin" || t.type.toLowerCase() === "doujinshi");
        if (doujinTag) {
          doujin = { name: doujinTag.name, permalink: doujinTag.permalink };
        }

        candidateItems.push({
          kind: "chapter",
          title: tg.title,
          permalink: tg.permalink,
          author,
          doujin,
          releasedOn: tg.released_on,
          tags: itemTags,
        });
      }
    }

    // If multiple withTags: filter items that exist in all remaining tags
    if (validTagResults.length > 1) {
      for (let i = 1; i < validTagResults.length; i++) {
        const nextTag = validTagResults[i];
        const nextTagPermalinks = new Set<string>();

        for (const tg of nextTag.taggables ?? []) {
          nextTagPermalinks.add(tg.permalink);
        }
        for (const tg of nextTag.taggings ?? []) {
          if (tg.permalink) nextTagPermalinks.add(tg.permalink);
        }

        candidateItems = candidateItems.filter((item) => nextTagPermalinks.has(item.permalink));
      }
    }

    // Filter out items containing any 'withoutTags'
    if (withoutTags.length > 0) {
      candidateItems = candidateItems.filter((item) => {
        const itemTagNames = (item.tags ?? []).map((t) => t.name.toLowerCase());
        return !withoutTags.some((wt) => itemTagNames.includes(wt));
      });
    }

    // Filter by Category classes if specified
    if (classes && classes.size > 0) {
      candidateItems = candidateItems.filter((item) => {
        const k = item.kind.toLowerCase();
        for (const c of classes) {
          const cl = c.toLowerCase();
          if (cl === k) return true;
          if (cl === "general" && k === "tag") return true;
        }
        return false;
      });
    }

    const totalItems = candidateItems.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const startIdx = (page - 1) * pageSize;
    const paginatedItems = candidateItems.slice(startIdx, startIdx + pageSize);

    return {
      items: paginatedItems,
      totalPages,
      currentPage: page,
      query: withTags.join(", "),
    };
  }

  // ── CASE 2: Keyword Query or Standard Search ────────────────────────────────
  const queryParts: string[] = [];

  if (query) {
    queryParts.push(`q=${encodeURIComponent(query)}`);
  }

  if (params.classes && params.classes.length > 0) {
    for (const c of params.classes) {
      if (c) {
        queryParts.push(`classes%5B%5D=${encodeURIComponent(c)}`);
      }
    }
  }

  if (withTags.length > 0) {
    for (const t of withTags) {
      queryParts.push(`with%5B%5D=${encodeURIComponent(t)}`);
    }
  }

  if (withoutTags.length > 0) {
    for (const t of withoutTags) {
      queryParts.push(`without%5B%5D=${encodeURIComponent(t)}`);
    }
  }

  if (params.sort) {
    queryParts.push(`sort=${encodeURIComponent(params.sort)}`);
  }

  if (page > 1) {
    queryParts.push(`page=${page}`);
  }

  const qs = queryParts.length > 0 ? `?${queryParts.join("&")}` : "";
  const url = `${SITE_ROOT}/search${qs}`;
  const cacheKey = `${SEARCH_CACHE_PREFIX}${url}`;

  // Check SQLite cache with ETag revalidation
  const cached = await getCached(cacheKey);
  const headers: Record<string, string> = {};
  if (cached?.etag) {
    headers["If-None-Match"] = cached.etag;
  }

  try {
    const { status, body, etag } = await httpGetText(url, { headers });

    if (status === 304 && cached) {
      recordCacheHit(cached.json_payload.length);
      return parseSearchHtml(cached.json_payload, query, page);
    }

    if (status === 200 && body) {
      await setCached(cacheKey, "search", body, etag);
      return parseSearchHtml(body, query, page);
    }
  } catch (err) {
    // If network fails but we have cached results, return cached version
    if (cached) {
      recordCacheHit(cached.json_payload.length);
      return parseSearchHtml(cached.json_payload, query, page);
    }
    throw err;
  }

  if (cached) {
    recordCacheHit(cached.json_payload.length);
    return parseSearchHtml(cached.json_payload, query, page);
  }

  return { items: [], totalPages: 1, currentPage: page, query };
}