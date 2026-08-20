import { SITE_ROOT } from "../stores";
import { httpGetText } from "./client";
import { parseSearchHtml } from "./search-parser";
import type { SearchParams, SearchResultPage } from "../types/api";

/**
 * Executes a search against Dynasty Scans and parses the HTML response into structured data.
 */
export async function searchDynasty(params: SearchParams): Promise<SearchResultPage> {
  const queryParts: string[] = [];

  if (params.q && params.q.trim()) {
    queryParts.push(`q=${encodeURIComponent(params.q.trim())}`);
  }

  if (params.classes && params.classes.length > 0) {
    for (const c of params.classes) {
      if (c) {
        queryParts.push(`classes%5B%5D=${encodeURIComponent(c)}`);
      }
    }
  }

  if (params.withTags && params.withTags.length > 0) {
    for (const t of params.withTags) {
      const trimmed = t.trim();
      if (trimmed) {
        queryParts.push(`with%5B%5D=${encodeURIComponent(trimmed)}`);
      }
    }
  }

  if (params.withoutTags && params.withoutTags.length > 0) {
    for (const t of params.withoutTags) {
      const trimmed = t.trim();
      if (trimmed) {
        queryParts.push(`without%5B%5D=${encodeURIComponent(trimmed)}`);
      }
    }
  }

  if (params.sort) {
    queryParts.push(`sort=${encodeURIComponent(params.sort)}`);
  }

  if (params.page && params.page > 1) {
    queryParts.push(`page=${params.page}`);
  }

  const qs = queryParts.length > 0 ? `?${queryParts.join("&")}` : "";
  const url = `${SITE_ROOT}/search${qs}`;

  const { status, body } = await httpGetText(url);
  if (status !== 200) {
    throw new Error(`Dynasty search returned HTTP ${status}`);
  }

  return parseSearchHtml(body, params.q ?? "", params.page ?? 1);
}