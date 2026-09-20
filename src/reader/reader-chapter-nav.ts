/**
 * Chapter navigation & series discovery engine for reader sessions.
 * Extracted from `reader-session.ts` (P3-A continuation) for modularity.
 */

import type { ReaderSession } from "./reader-session";
import type { ChapterRef } from "../types/routes";
import type { Series } from "../types/api";
import { fetchSeries } from "../api/series";
import { getMangaFeed } from "../providers/mangadex/api/manga";
import { navigate } from "../stores/router";
import { showBanner } from "../stores/topbar";
import { t } from "../i18n";
import { getPrevChapterStartPage } from "./settings";
import { getAdjacentChapters, normalizePermalink } from "./reader-spread";
import { log } from "../utils/log";

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
  if (permalink.startsWith("mdx:")) {
    const mangaId = permalink.replace(/^mdx:/, "");
    try {
      const feed = await getMangaFeed(mangaId, { limit: 500, order: { chapter: "asc" } });
      const cl: ChapterRef[] = feed.data.map((ch) => {
        const num = ch.attributes.chapter;
        const raw = ch.attributes.title;
        const title = num ? (raw ? `Ch. ${num} - ${raw}` : `Chapter ${num}`) : (raw || "Oneshot");
        const groupRel = ch.relationships?.find((r) => r.type === "scanlation_group");
        const attrs = groupRel?.attributes;
        const groupName = attrs && typeof attrs === "object" && "name" in attrs && typeof attrs.name === "string" ? attrs.name : undefined;
        return {
          title,
          permalink: `mdx:${ch.id}`,
          released_on: ch.attributes.readableAt ? ch.attributes.readableAt.substring(0, 10) : undefined,
          scanlatorGroup: groupRel?.id,
          scanlatorGroupName: groupName,
        };
      });
      s.setChapterList(cl);
      return cl;
    } catch (err) {
      log.warn("reader-chapter-nav", "MangaDex loadChapterList failed:", err);
      return [];
    }
  }
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
          } catch (err2) {
            log.debug("reader-chapter-nav", "containerTag fetch failed:", err2);
          }
        }
        if (!seriesData && (s.permalink.startsWith("local:") || permalink.startsWith("local:"))) {
          const localPerm = permalink.startsWith("local:") ? permalink : `local:${permalink}`;
          try {
            seriesData = await fetchSeries(localPerm, useForce, "local");
            if (seriesData) {
              s.setSeriesPermalink(localPerm);
              s.setSeriesType("local");
            }
          } catch (err3) {
            log.debug("reader-chapter-nav", "local fallback fetch failed:", err3);
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
          const curP = normalizePermalink(s.permalink);
          const found = cur.prevCh !== null || cur.nextCh !== null || cl.some((c) => {
            const p = normalizePermalink(c.permalink);
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
        log.warn("reader-chapter-nav", "loadChapterList failed:", err);
        return lastCl;
      }
    }
  }
  return lastCl;
}
export async function gotoAdjacent(s: ReaderSession, direction: "prev" | "next"): Promise<void> {
  // Atomic guard: rapid double clicks must not trigger two concurrent chapter
  // transitions (parallel fetches, duplicate history entries). The
  // chapterNavigating signal also disables the nav buttons while in flight.
  if (s.chapterNavigating() || s.disposed) return;
  s.setChapterNavigating(true);
  try {
    if (s.chapterList().length === 0 && s.chapterListPromise) {
      await s.chapterListPromise;
    }
    let cl = s.chapterList();
    let adj = getAdjacentChapters(cl, s.permalink, s.chapterTitle());
    let chapter = direction === "prev" ? adj.prevCh : adj.nextCh;
    if (!chapter && s.seriesPermalink()) {
      const needsForce = cl.length > 0;
      cl = await loadChapterList(s, needsForce);
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
      // ── Decision 3D: Sticky scanlator tracking for MangaDex ───────────────
      // The chapter list may contain multiple uploads for the same chapter
      // number (different scanlation groups). Prefer the group that translated
      // the chapter we are navigating FROM so the reader stays with one team.
      if (s.permalink.startsWith("mdx:") && chapter.permalink.startsWith("mdx:")) {
        const preferred = s.activeScanlatorGroup();
        if (preferred) {
          // The adjacent chapter returned by getAdjacentChapters is positionally
          // first. Look for an upload by the preferred group at the same chapter
          // number by scanning the full chapter list for a sibling with matching
          // scanlatorGroup whose title prefix matches the adjacent chapter title.
          // Chapter titles share a "Ch. X" prefix even when scanlation groups differ.
          const adjTitle = chapter.title; // e.g. "Ch. 12 - The Gate"
          const chNumMatch = adjTitle.match(/^(?:Ch\.|Chapter)\s*([\d.]+)/);
          if (chNumMatch) {
            const chNum = chNumMatch[1];
            const preferred_upload = cl.find(
              (ref) =>
                ref.scanlatorGroup === preferred &&
                ref.title.match(/^(?:Ch\.|Chapter)\s*([\d.]+)/)?.[1] === chNum,
            );
            if (preferred_upload) {
              chapter = preferred_upload;
            } else {
              // Preferred group absent for this chapter number → non-blocking toast
              const groupName = chapter.scanlatorGroupName ?? preferred;
              showBanner(
                `[${groupName}] didn't translate this chapter — switching to another scanlation.`,
              );
            }
          }
        }
        // Update sticky scanlator from the chapter we're about to navigate to.
        if (chapter.scanlatorGroup) {
          s.setActiveScanlatorGroup(chapter.scanlatorGroup);
        }
      }
      const target = direction === "prev" && getPrevChapterStartPage() === "last" ? "last" : 0;
      gotoChapter(s, chapter, target);
    } else {
      showBanner(
        direction === "prev"
          ? t("reader.overscrollLock.firstChapterDesc") || "No previous chapter."
          : t("reader.overscrollLock.endOfSeriesDesc") || "No next chapter.",
      );
    }
  } finally {
    s.setChapterNavigating(false);
  }
}

export function gotoPrevChapter(s: ReaderSession): Promise<void> {
  return gotoAdjacent(s, "prev");
}

export function gotoNextChapter(s: ReaderSession): Promise<void> {
  return gotoAdjacent(s, "next");
}

export function gotoSeries(s: ReaderSession): void {
  if (!s.isHorizontal() && s.viewportEl && s.stripEl) {
    s.isToolbarAnimating = false;
    s.computeScrollProgress?.();
  }
  void s.persistNow();
  navigate({
    view: "series",
    seriesPermalink: s.seriesPermalink() ?? undefined,
    seriesName: s.seriesName() ?? s.chapterTitle(),
  });
}
