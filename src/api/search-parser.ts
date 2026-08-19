import { decodeEntities } from "../state";
import { KIND_BY_PATH_SEGMENT } from "./navigation";
import type { ChapterTag, SearchResultItem, SearchResultPage } from "../types/api";

/** Extracts kind and permalink from a relative Dynasty Scans href. */
export function parseDynastyHref(href: string): {
  kind: SearchResultItem["kind"];
  permalink: string;
} {
  const match = /^\/([a-zA-Z0-9_-]+)\/([^/?#]+)/.exec(href);
  if (!match) {
    return { kind: "chapter", permalink: href.replace(/^\//, "") };
  }

  const prefix = match[1].toLowerCase();
  const permalink = match[2];
  const kind = KIND_BY_PATH_SEGMENT[prefix] ?? "tag";
  return { kind: kind as SearchResultItem["kind"], permalink };
}

/**
 * Maps parsed href kind to standard Tag category type string for styling.
 */
function tagKindToType(kind: SearchResultItem["kind"]): string {
  switch (kind) {
    case "author":
      return "Author";
    case "scanlator":
      return "Scanlator";
    case "pairing":
      return "Pairing";
    case "doujin":
      return "Doujin";
    case "series":
      return "Series";
    case "anthology":
      return "Anthology";
    case "issue":
      return "Issue";
    case "tag":
    default:
      return "General";
  }
}

/**
 * Parses raw Dynasty Scans search HTML into a typed SearchResultPage.
 */
export function parseSearchHtml(
  html: string,
  query: string,
  requestedPage = 1,
): SearchResultPage {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  const items: SearchResultItem[] = [];
  const ddElements = doc.querySelectorAll("dl.chapter-list > dd");

  ddElements.forEach((dd) => {
    const mainLink = dd.querySelector<HTMLAnchorElement>("a.name, a:first-child");
    if (!mainLink) return;

    const href = mainLink.getAttribute("href") || "";
    const { kind, permalink } = parseDynastyHref(href);
    const title = decodeEntities(mainLink.textContent?.trim() || permalink);

    // Extract Author
    let author: { name: string; permalink: string } | undefined;
    const authorLink = dd.querySelector<HTMLAnchorElement>('a[href^="/authors/"]');
    if (authorLink && authorLink !== mainLink) {
      const aHref = authorLink.getAttribute("href") || "";
      const aMatch = /\/authors\/([^/?#]+)/.exec(aHref);
      if (aMatch) {
        author = {
          name: decodeEntities(authorLink.textContent?.trim() || aMatch[1]),
          permalink: aMatch[1],
        };
      }
    }

    // Extract Doujin parent
    let doujin: { name: string; permalink: string } | undefined;
    const doujinLink = dd.querySelector<HTMLAnchorElement>(
      'small.doujin_tags a[href^="/doujins/"], small a[href^="/doujins/"]',
    );
    if (doujinLink && doujinLink !== mainLink) {
      const dHref = doujinLink.getAttribute("href") || "";
      const dMatch = /\/doujins\/([^/?#]+)/.exec(dHref);
      if (dMatch) {
        doujin = {
          name: decodeEntities(doujinLink.textContent?.trim() || dMatch[1]),
          permalink: dMatch[1],
        };
      }
    }

    // Extract Released On date
    let releasedOn: string | undefined;
    const smallTags = dd.querySelectorAll("small");
    smallTags.forEach((s) => {
      const txt = s.textContent?.trim() || "";
      if (txt.startsWith("released ")) {
        releasedOn = txt.replace(/^released\s+/, "");
      }
    });

    // Extract Tags
    const tags: ChapterTag[] = [];
    const tagLinks = dd.querySelectorAll<HTMLAnchorElement>(
      "span.tags a.label, span.tags a, a.label",
    );
    tagLinks.forEach((tl) => {
      if (tl === mainLink || tl === authorLink || tl === doujinLink) return;
      const tHref = tl.getAttribute("href") || "";
      const parsedTag = parseDynastyHref(tHref);
      const tagName = decodeEntities(tl.textContent?.trim() || parsedTag.permalink);
      if (tagName && parsedTag.permalink) {
        tags.push({
          type: tagKindToType(parsedTag.kind),
          name: tagName,
          permalink: parsedTag.permalink,
        });
      }
    });

    items.push({
      kind,
      title,
      permalink,
      author,
      doujin,
      releasedOn,
      tags,
    });
  });

  // Extract Pagination
  let currentPage = requestedPage;
  let totalPages = 1;

  const pagination = doc.querySelector(".pagination");
  if (pagination) {
    const activeEl = pagination.querySelector("li.active, .active");
    if (activeEl) {
      const activeText = parseInt(activeEl.textContent?.trim() || "1", 10);
      if (!Number.isNaN(activeText)) {
        currentPage = activeText;
      }
    }

    const pageLinks = pagination.querySelectorAll("a, span");
    pageLinks.forEach((el) => {
      const pageNum = parseInt(el.textContent?.trim() || "", 10);
      if (!Number.isNaN(pageNum) && pageNum > totalPages) {
        totalPages = pageNum;
      }
    });
  }

  return {
    items,
    currentPage,
    totalPages: Math.max(currentPage, totalPages),
    query,
  };
}