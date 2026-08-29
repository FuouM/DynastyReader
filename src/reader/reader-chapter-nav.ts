/**
 * Chapter navigation & series discovery engine for reader sessions.
 * Extracted from `reader-session.ts` (P3-A continuation) for modularity.
 */

import type { ReaderSession } from "./reader-session";
import type { ChapterRef } from "../types/routes";
import type { Series } from "../types/api";
import { fetchSeries } from "../api";
import { navigate, showBanner } from "../stores";
import { t } from "../i18n";
import { getPrevChapterStartPage } from "./settings";
import { getAdjacentChapters } from "./reader-spread";

export function gotoChapter(s: ReaderSession, c: ChapterRef, targetPage?: number | "last"): void {
  navigate({
    view: "reader",
    seriesPermalink: s.seriesPermalink() ?? undefined,
    seriesName: s.seriesName(),
    chapterPermalink: c.permalink,
    chapterTitle: c.title,
    chapterList: s.chapterList(),
    startPage: targetPage === "last" ? -1 : targetPage,
  });
}

export async function loadChapterList(s: ReaderSession, force = false): Promise<ChapterRef[]> {
  const permalink = s.seriesPermalink();
  if (!permalink) return [];
  let lastCl: ChapterRef[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const useForce = force || attempt === 1;
    try {
      let seriesData: Series | null = null;
      try {
        seriesData = await fetchSeries(permalink, useForce, s.seriesType() ?? undefined);
      } catch (err) {
        if (s.containerTagPermalink && s.containerTagPermalink !== permalink) {
          try {
            seriesData = await fetchSeries(s.containerTagPermalink, useForce, s.containerTagType ?? undefined);
            if (seriesData) {
              s.setSeriesPermalink(s.containerTagPermalink);
              if (s.containerTagType) s.setSeriesType(s.containerTagType);
            }
          } catch {
            // fallback error ignored, throw original below if seriesData is null
          }
        }
        if (!seriesData) throw err;
      }
      if (s.disposed || !seriesData) return lastCl;

      const cl: ChapterRef[] = [];
      for (const tag of seriesData.taggings ?? []) {
        if (tag.header) continue;
        if (tag.permalink) {
          cl.push({
            title: tag.title || tag.permalink,
            permalink: tag.permalink,
            released_on: tag.released_on ?? undefined,
          });
        }
      }
      if (cl.length > 0) {
        s.setChapterList(cl);
        lastCl = cl;
        // If current chapter not found in stale cache, retry with forced network fetch to get fresh list with new chapter
        if (!useForce) {
          const cur = getAdjacentChapters(cl, s.permalink, s.chapterTitle());
          const found = cur.prevCh !== null || cur.nextCh !== null || cl.some((c) => {
            const p = c.permalink.toLowerCase().replace(/^\/+|\/+$/g, "").replace(/\.json$/i, "");
            const curP = s.permalink.toLowerCase().replace(/^\/+|\/+$/g, "").replace(/\.json$/i, "");
            return p === curP || p.endsWith(`/${curP}`) || curP.endsWith(`/${p}`);
          });
          if (!found && cl.length > 0) {
            continue;
          }
        }
        return cl;
      }
      return cl;
    } catch (err) {
      if (attempt === 1) {
        console.warn("[reader-session] loadChapterList failed:", err);
        return lastCl;
      }
    }
  }
  return lastCl;
}
export async function gotoAdjacent(s: ReaderSession, direction: "prev" | "next"): Promise<void> {
  if (s.chapterList().length === 0 && s.chapterListPromise) {
    await s.chapterListPromise;
  }
  let adj = getAdjacentChapters(s.chapterList(), s.permalink, s.chapterTitle());
  let chapter = direction === "prev" ? adj.prevCh : adj.nextCh;
  if (!chapter && s.seriesPermalink()) {
    const needsForce = s.chapterList().length > 0;
    const cl = await loadChapterList(s, needsForce);
    if (cl.length > 0) {
      const reloaded = getAdjacentChapters(cl, s.permalink, s.chapterTitle());
      chapter = direction === "prev" ? reloaded.prevCh : reloaded.nextCh;
      // Fallback for new chapter still missing after forced fetch: treat as newest
      if (!chapter && direction === "prev" && cl.length > 0) {
        const stillMissing = getAdjacentChapters(cl, s.permalink, s.chapterTitle());
        if (stillMissing.prevCh === null && stillMissing.nextCh === null) {
          chapter = cl[cl.length - 1] ?? null;
        }
      }
    }
  }
  if (chapter) {
    const target = direction === "prev" && getPrevChapterStartPage() === "last" ? "last" : 0;
    gotoChapter(s, chapter, target);
  } else {
    showBanner(
      direction === "prev"
        ? t("reader.overscrollLock.firstChapterDesc") || "No previous chapter."
        : t("reader.overscrollLock.endOfSeriesDesc") || "No next chapter.",
    );
  }
}

export async function gotoPrevChapter(s: ReaderSession): Promise<void> {
  return gotoAdjacent(s, "prev");
}

export async function gotoNextChapter(s: ReaderSession): Promise<void> {
  return gotoAdjacent(s, "next");
}

export function gotoSeries(s: ReaderSession): void {
  navigate({
    view: "series",
    seriesPermalink: s.seriesPermalink() ?? undefined,
    seriesName: s.seriesName() ?? s.chapterTitle(),
  });
}
