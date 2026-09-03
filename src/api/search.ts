import { SITE_ROOT } from "../constants";
import { httpGetText } from "./http";
import { parseSearchHtml } from "./search-parser";
import { getCached, setCached } from "../db";
import { recordCacheHit } from "./traffic";
import { persistSuggestEntries } from "./cache-persist";
import type { SearchParams, SearchResultPage } from "../types/api";

const SEARCH_CACHE_PREFIX = "search_v2:";
/**
 * Executes a search against Dynasty Scans with SQLite response caching and
 * multi-tag intersection support.
 */
export async function searchDynasty(params: SearchParams): Promise<SearchResultPage> {
  const query = (params.q ?? "").trim();
  const withTags = (params.withTags ?? []).map((t) => t.trim()).filter(Boolean);
  const withoutTags = (params.withoutTags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean);
  const page = Math.max(1, params.page ?? 1);
  const displayQuery = query || withTags.join(", ");

  // Fast path: completely empty search returns empty page immediately
  if (
    !query &&
    withTags.length === 0 &&
    withoutTags.length === 0 &&
    (!params.classes || params.classes.length === 0)
  ) {
    return { items: [], totalPages: 1, currentPage: page, query: "" };
  }
  // ── CASE 2: Keyword Query or Standard Search ────────────────────────────────
  const searchParams = new URLSearchParams();
  if (query) searchParams.set("q", query);
  for (const c of params.classes ?? []) {
    if (c) searchParams.append("classes[]", c);
  }
  for (const t of withTags) searchParams.append("with[]", t);
  for (const t of withoutTags) searchParams.append("without[]", t);
  if (params.sort) searchParams.set("sort", params.sort);
  if (page > 1) searchParams.set("page", String(page));

  const qs = searchParams.toString();
  const url = `${SITE_ROOT}/search${qs ? `?${qs}` : ""}`;
  const cacheKey = `${SEARCH_CACHE_PREFIX}${url}`;

  // Check SQLite cache (TTL: 1 hour)
  const SEARCH_TTL_MS = 60 * 60 * 1000;
  const cached = await getCached(cacheKey);
  if (cached && Date.now() - cached.cached_at < SEARCH_TTL_MS) {
    recordCacheHit(cached.json_payload.length);
    return parseSearchHtml(cached.json_payload, displayQuery, page);
  }

  const headers: Record<string, string> = {};
  if (cached?.etag) {
    headers["If-None-Match"] = cached.etag;
  }

  try {
    const { status, body, etag } = await httpGetText(url, { headers });

    if (status === 304 && cached) {
      recordCacheHit(cached.json_payload.length);
      return parseSearchHtml(cached.json_payload, displayQuery, page);
    }

    if (status === 200 && body) {
      await setCached(cacheKey, "search", body, etag);
      const parsedPage = parseSearchHtml(body, displayQuery, page);
      // Persist series and tags found in search results into local directory entries
      if (parsedPage.items.length > 0) {
        const toSave = parsedPage.items.map((it) => ({
          name: it.title,
          type: it.kind === "series" ? "Series" : it.kind === "chapter" ? "Chapter" : "Tag",
        }));
        void persistSuggestEntries(toSave, "search");
      }
      return parsedPage;
    }
  } catch (err) {
    // If network fails but we have cached results, return cached version
    if (cached) {
      recordCacheHit(cached.json_payload.length);
      return parseSearchHtml(cached.json_payload, displayQuery, page);
    }
    throw err;
  }

  if (cached) {
    recordCacheHit(cached.json_payload.length);
    return parseSearchHtml(cached.json_payload, displayQuery, page);
  }

  return { items: [], totalPages: 1, currentPage: page, query: displayQuery };
}