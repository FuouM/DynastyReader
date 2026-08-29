import { decodeEntities } from "../utils/html";
import type { ChapterTag, SeriesTag } from "../types/api";
import type { ReadingDirection, SpreadGroup } from "../types/reader";
import type { ChapterRef } from "../types/routes";

/**
 * Spread layout engine: maps page indices to dual-page (or standalone) spread
 * slides and detects the reading direction from chapter/series tags.
 *
 * Spreads are derived on demand. The page index stays the source of truth for
 * persistence/bookmarks; `spreadIndexOf` converts a page index to the spread
 * position the strip slides to.
 */

/** Threshold ratio above which a page is treated as a wide double-page scan. */
export const WIDE_RATIO = 1.3;

const LTR_TAG_PERMALINK = "read_left_to_right";
const LTR_NAME_FAMILY = new Set(["read left to right", "left to right", "left_to_right", "left-to-right", "ltr"]);

const LONG_STRIP_TAG_PERMALINKS = new Set(["long_strip", "webtoon"]);
const LONG_STRIP_NAME_FAMILY = new Set([
  "long strip",
  "long_strip",
  "long-strip",
  "webtoon",
  "vertical",
]);

function isLtrTag(tag: { type?: string; name?: string; permalink?: string }): boolean {
  if (!tag) return false;
  return (
    tag.permalink === LTR_TAG_PERMALINK ||
    (tag.name !== undefined && LTR_NAME_FAMILY.has(tag.name.trim().toLowerCase()))
  );
}

export function isLongStripTag(tag: { type?: string; name?: string; permalink?: string }): boolean {
  if (!tag) return false;
  if (tag.permalink && LONG_STRIP_TAG_PERMALINKS.has(tag.permalink.toLowerCase())) {
    return true;
  }
  if (tag.name && LONG_STRIP_NAME_FAMILY.has(tag.name.trim().toLowerCase())) {
    return true;
  }
  return false;
}

/**
 * Builds the ordered list of spreads for a chapter.
 *
 * - `coverOffset` ON: page 0 is its own standalone spread, then pages pair
 *   (1,2), (3,4)… Off: (0,1), (2,3)…
 * - A page whose rendered image is landscape (wide double-page scan) is pulled
 *   out of its pair into its own spread; pairing resumes from the next page.
 */
export function computeSpreads(
  pageCount: number,
  coverOffset: boolean,
  isWidePageFn: (index: number) => boolean,
): SpreadGroup[] {
  const spreads: SpreadGroup[] = [];
  const append = (
    pageIndices: number[],
    isStandaloneCover: boolean,
    isWide: boolean,
  ): void => {
    spreads.push({
      spreadIndex: spreads.length,
      pageIndices,
      isStandaloneCover,
      isWide,
    });
  };

  let i = 0;
  if (coverOffset && pageCount > 0) {
    append([0], true, false);
    i = 1;
  }
  while (i < pageCount) {
    if (isWidePageFn(i)) {
      append([i], false, true);
      i += 1;
      continue;
    }
    if (i + 1 < pageCount) {
      if (isWidePageFn(i + 1)) {
        append([i], false, false);
        i += 1;
      } else {
        append([i, i + 1], false, false);
        i += 2;
      }
    } else {
      append([i], false, false);
      i += 1;
    }
  }
  return spreads;
}

/** Spread index for an anchor page index, or 0 when out of range. */
export function spreadIndexOf(spreads: SpreadGroup[], pageIndex: number): number {
  if (pageIndex < 0 || spreads.length === 0) return 0;
  for (let s = 0; s < spreads.length; s++) {
    const last = spreads[s].pageIndices[spreads[s].pageIndices.length - 1];
    if (pageIndex <= last) return s;
  }
  return spreads.length - 1;
}

/** First page index of a spread, clamped to valid bounds. */
export function anchorPageOf(spreads: SpreadGroup[], spreadIndex: number): number {
  if (spreads.length === 0) return 0;
  const clamped = Math.max(0, Math.min(spreads.length - 1, spreadIndex));
  return spreads[clamped].pageIndices[0];
}

/**
 * Detects reading direction from chapter tags (checked first) and series tags
 * (used when the lazy series fetch resolves). A match returns "ltr", otherwise
 * "rtl" (the manga default).
 */
export function detectReadingDirection(
  chapterTags: ChapterTag[],
  seriesTags?: SeriesTag[],
): ReadingDirection {
  const tags = [...(chapterTags ?? []), ...(seriesTags ?? [])];
  return tags.some(isLtrTag) ? "ltr" : "rtl";
}

/**
 * Detects whether the chapter or series is tagged as "Long strip" / "Webtoon".
 */
export function detectIsLongStrip(
  chapterTags: ChapterTag[],
  seriesTags?: SeriesTag[],
): boolean {
  const tags = [...(chapterTags ?? []), ...(seriesTags ?? [])];
  return tags.some(isLongStripTag);
}

/**
 * Computes adjacent previous and next chapters from a chapter list and current permalink/title.
 */
export function getAdjacentChapters(
  chapterList: ChapterRef[],
  permalink: string,
  chapterTitle?: string,
): { prevCh: ChapterRef | null; nextCh: ChapterRef | null } {
  if (!chapterList || chapterList.length === 0) return { prevCh: null, nextCh: null };

  const normalize = (p: string): string => {
    let s = (p || "").toLowerCase().replace(/^\/+|\/+$/g, "").trim();
    try {
      s = decodeURIComponent(s);
    } catch (err) {
      console.debug("[dynasty-reader/reader-spread] decodeURIComponent failed:", s, err);
    }
    return s.replace(/\.json$/i, "").trim();
  };

  const curPermalink = normalize(permalink);
  const curTitle = decodeEntities(chapterTitle || "").trim().toLowerCase();

  let curIdx = chapterList.findIndex((x) => {
    const p = normalize(x.permalink);
    if (curPermalink.length > 0) {
      if (p === curPermalink || p.endsWith(`/${curPermalink}`) || curPermalink.endsWith(`/${p}`)) {
        return true;
      }
      const pNorm = p.replace(/[-_]+/g, "_");
      const curNorm = curPermalink.replace(/[-_]+/g, "_");
      if (pNorm === curNorm || pNorm.endsWith(`/${curNorm}`) || curNorm.endsWith(`/${pNorm}`)) {
        return true;
      }
    }
    if (curTitle.length > 0 && x.title) {
      const xTitle = decodeEntities(x.title).trim().toLowerCase();
      if (xTitle === curTitle) return true;
    }
    return false;
  });

  if (curIdx < 0 && curPermalink.length > 0) {
    const baseSlug = curPermalink.split("/").pop();
    if (baseSlug) {
      const baseNorm = baseSlug.replace(/[-_]+/g, "_");
      curIdx = chapterList.findIndex((x) => {
        const xNorm = normalize(x.permalink).replace(/[-_]+/g, "_");
        return xNorm === baseNorm || xNorm.endsWith(`/${baseNorm}`) || xNorm.endsWith(baseNorm);
      });
    }
  }
  if (curIdx < 0) {
    // Fallback for new chapter missing from stale cache: treat as newest so prev navigates to last known chapter
    if (chapterList.length > 0) {
      return { prevCh: chapterList[chapterList.length - 1] ?? null, nextCh: null };
    }
    return { prevCh: null, nextCh: null };
  }
  const prevCh = curIdx > 0 ? chapterList[curIdx - 1] : null;
  const nextCh = curIdx < chapterList.length - 1 ? chapterList[curIdx + 1] : null;
  return { prevCh, nextCh };
}