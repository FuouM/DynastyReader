/**
 * Reader session bootstrap, retry, and post-restore reveal lifecycle.
 * Extracted from `reader-session.ts` (P3-A continuation) for modularity.
 */

import type { ReaderSession } from "./reader-session";
import type { Chapter } from "../types/api";
import { convertFileSrc } from "../ipc";
import { fetchChapter, fetchSeries } from "../api/series";
import { addHistory, getBookmark, getReadingProgress } from "../db/library.repo";
import { getCachedPages } from "../db/cache.repo";
import {
  loadMangaDexChapterForReader,
  getMdxCachedPages,
  getMdxProgress,
  recordMdxHistory,
} from "../providers/mangadex/reader";
import { getMdxBookmark } from "../providers/mangadex/db/bookmarks.repo";
import { extractMangaDexId } from "../api/navigation";
import { getChapterContainerTag } from "../taxonomy";
import {
  detectIsLongStrip,
  detectReadingDirection,
  spreadIndexOf,
} from "./reader-spread";
import {
  getDefaultFitMode,
  getEffectiveDefaultReaderMode,
  getEffectiveDefaultPagedLayout,
  getDefaultReadingDirection,
  isAutoCacheChapterEnabled,
  isCoverOffsetDefaultEnabled,
  isLongStripFitWidthEnabled,
  isLongStripSpreadOverrideEnabled,
  getScrollLock,
} from "./settings";
import { showBanner, setTitle } from "../stores/topbar";
import { isOnline } from "../stores/platform";
import { setSessionTab } from "../stores/router";
import { decodeEntities, errorMessage } from "../utils/formatting";
import { t } from "../i18n";
import { log } from "../utils/log";
import { loadChapterList } from "./reader-chapter-nav";

const RESTORE_REVEAL_DEADLINE_MS = 1200;

async function determineStartPage(
  route: ReaderSession["route"],
  permalink: string,
  pageCount: number,
): Promise<number> {
  let startPage = route.startPage ?? 0;
  if (startPage === -1) {
    startPage = Math.max(0, pageCount - 1);
  } else if (startPage <= 0) {
    try {
      if (permalink.startsWith("mdx:")) {
        const prog = await getMdxProgress(extractMangaDexId(permalink));
        if (prog && prog.completed !== 1 && prog.page_index > 0) {
          startPage = prog.page_index;
        }
      } else {
        const prog = await getReadingProgress(permalink);
        if (prog && prog.completed !== 1 && prog.page_index > 0) {
          startPage = prog.page_index;
        }
      }
    } catch (err) {
      log.error("reader-bootstrap", "failed to load reading progress:", err);
    }
  }
  return Math.min(startPage, Math.max(0, pageCount - 1));
}

function resolveSeriesContext(s: ReaderSession, chapter: Chapter): void {
  const route = s.route;
  const permalink = s.permalink;
  const containerTag = getChapterContainerTag(chapter.tags);
  const isLocalChapter = permalink.startsWith("local:");
  const containerPerm = containerTag?.permalink
    ? isLocalChapter && !containerTag.permalink.startsWith("local:")
      ? `local:${containerTag.permalink}`
      : containerTag.permalink
    : null;
  s.containerTagPermalink = containerPerm;
  s.containerTagType = isLocalChapter ? "local" : (containerTag?.type || null);

  const hasRouteChapterList = Boolean(route.chapterList && route.chapterList.length > 0);
  const routeSeriesPerm = route.seriesPermalink
    ? isLocalChapter && !route.seriesPermalink.startsWith("local:")
      ? `local:${route.seriesPermalink}`
      : route.seriesPermalink
    : null;

  // Tag/author/pairing listings mis-attribute chapters. If the chapter has a
  // true container (Series/Anthology/Issue/Doujin) that differs from the
  // route's seriesPermalink, ignore the route — otherwise gotoSeries returns
  // to the tag. If the chapter is not part of any series (no containerTag),
  // continue like before and keep the route's tag context.
  const routeMismatch =
    Boolean(containerPerm && routeSeriesPerm && containerPerm !== routeSeriesPerm);
  const useRouteList = hasRouteChapterList && !routeMismatch;
  let seriesPermalink = containerPerm || (!routeMismatch ? routeSeriesPerm : null);
  if (isLocalChapter && seriesPermalink && !seriesPermalink.startsWith("local:")) {
    seriesPermalink = `local:${seriesPermalink}`;
  }
  const seriesName = (containerTag && containerTag.name) || (!routeMismatch ? route.seriesName || chapter.title : chapter.title);
  const preferredType = isLocalChapter ? "local" : ((containerTag && containerTag.type) || (!routeMismatch && route.seriesPermalink ? "series" : undefined));

  s.setSeriesPermalink(seriesPermalink);
  s.setSeriesType(preferredType ?? null);
  s.setSeriesName(seriesName);
  const resolvedChapterTitle = route.chapterTitle || chapter.title || "Chapter";
  s.setChapterTitle(resolvedChapterTitle);
  setTitle(decodeEntities(resolvedChapterTitle));
  setSessionTab((current) => {
    if (!current || current.route.view !== "reader") return current;
    return {
      title: seriesName,
      route: { ...current.route, seriesName, chapterTitle: resolvedChapterTitle },
    };
  });
  s.setChapterPermalink(s.permalink);
  if (useRouteList) {
    s.setChapterList(route.chapterList!);
  } else {
    s.setChapterList([]);
  }
  s.setPages(chapter.pages ?? []);
}

function initDisplayPreferences(s: ReaderSession, chapter: Chapter): void {
  s.setModeSignal(getEffectiveDefaultReaderMode());

  const isLong = detectIsLongStrip(chapter.tags ?? []);
  s.setIsLongStrip(isLong);

  if (isLong && isLongStripSpreadOverrideEnabled()) {
    // Soft disable spread mode for long strip chapters
    s.setPagedLayoutSignal("single");
    s.setLayoutAutoDetected(true);
  } else {
    s.setPagedLayoutSignal(getEffectiveDefaultPagedLayout());
    s.setLayoutAutoDetected(false);
  }

  s.setCoverOffsetSignal(isCoverOffsetDefaultEnabled());

  const dirPref = getDefaultReadingDirection();
  if (dirPref === "auto") {
    const tagDir = detectReadingDirection(chapter.tags ?? []);
    s.setDirectionSignal(tagDir);
    s.setDirectionAutoDetected(true);
  } else {
    s.setDirectionSignal(dirPref);
    s.setDirectionAutoDetected(false);
  }
  if (isLong && isLongStripFitWidthEnabled()) {
    s.setFitModeSignal("width");
  } else {
    s.setFitModeSignal(getDefaultFitMode());
  }
  s.setScrollLockSignal(getScrollLock());
}

async function hydrateCachedPages(s: ReaderSession, permalink: string, pageCount: number): Promise<void> {
  let cachedRows: Array<{ page_index: number; file_path: string }> = [];
  try {
    if (permalink.startsWith("mdx:")) {
      cachedRows = await getMdxCachedPages(extractMangaDexId(permalink));
    } else {
      cachedRows = await getCachedPages(permalink);
    }
  } catch (err) {
    showBanner(
      t("reader.session.cacheLookupError", { msg: errorMessage(err) }),
    );
  }
  for (const row of cachedRows) {
    if (row.page_index >= 0 && row.page_index < pageCount && row.file_path) {
      s.cachedPages[1](row.page_index, row.file_path);
    }
  }
  s.recountCached();
}

function preloadInitialDimensions(s: ReaderSession, pageCount: number): void {
  if (typeof window === "undefined") return;
  const cachedMap = s.cachedPages[0];
  const cur = s.currentIndex();
  const isSpread = s.isSpread();
  const spreads = s.spreads();
  const priorityIndices: number[] = [];
  if (isSpread && spreads.length > 0) {
    const curSpread = spreadIndexOf(spreads, cur);
    for (const p of spreads[curSpread]?.pageIndices ?? []) priorityIndices.push(p);
    for (const p of spreads[curSpread + 1]?.pageIndices ?? []) priorityIndices.push(p);
    if (curSpread > 0) for (const p of spreads[curSpread - 1]?.pageIndices ?? []) priorityIndices.push(p);
  } else {
    priorityIndices.push(cur);
    if (cur + 1 < pageCount) priorityIndices.push(cur + 1);
  }

  for (const i of priorityIndices) {
    const p = cachedMap[i];
    if (!p) continue;
    const img = new Image();
    img.src = convertFileSrc(p);
    if (img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
      s.setPageDimension(i, img.naturalWidth, img.naturalHeight);
    } else {
      img.onload = () => {
        if (!s.disposedFlag) {
          s.setPageDimension(i, img.naturalWidth, img.naturalHeight);
        }
      };
    }
  }
}

function initSlotStatesAndQueue(s: ReaderSession, pageCount: number): void {
  const autoCacheAll = isAutoCacheChapterEnabled();
  for (let i = 0; i < pageCount; i++) {
    if (s.getCachedPath(i) !== undefined) continue;
    if (!isOnline()) {
      s.setSlotState(i, "offline", t("reader.session.slotState.offline"));
    } else if (autoCacheAll) {
      s.setSlotState(i, "spinner", t("reader.session.slotState.queued"));
      s.enqueue(i);
    } else {
      s.setSlotState(i, "idle", t("reader.session.slotState.waiting"));
    }
  }

  const cur = s.currentIndex();
  if (s.isSpread() && s.spreads().length > 0) {
    const curSpread = spreadIndexOf(s.spreads(), cur);
    const active = s.spreads()[curSpread];
    if (active) {
      for (const p of active.pageIndices) {
        if (s.getCachedPath(p) === undefined) s.enqueue(p, true);
      }
    }
    const nextSpread = s.spreads()[curSpread + 1];
    if (nextSpread) {
      for (const p of nextSpread.pageIndices) {
        if (s.getCachedPath(p) === undefined) s.enqueue(p, true);
      }
    }
    const spreadPlus2 = s.spreads()[curSpread + 2];
    if (spreadPlus2) {
      for (const p of spreadPlus2.pageIndices) {
        if (s.getCachedPath(p) === undefined) s.enqueue(p, true);
      }
    }
  } else {
    if (s.getCachedPath(cur) === undefined) s.enqueue(cur, true);
    for (let offset = 1; offset <= 4; offset++) {
      const nextIdx = cur + offset;
      if (nextIdx < pageCount && s.getCachedPath(nextIdx) === undefined) {
        s.enqueue(nextIdx, true);
      }
    }
  }
}

export async function initReaderSession(s: ReaderSession): Promise<void> {
  const route = s.route;
  const permalink = route.chapterPermalink;
  if (!permalink) return;

  let chapter: Chapter;
  try {
    if (permalink.startsWith("mdx:")) {
      const payload = await loadMangaDexChapterForReader(permalink);
      chapter = payload.chapter;
    } else {
      chapter = await fetchChapter(permalink);
    }
  } catch (err) {
    if (s.disposed) return;
    const msg = errorMessage(err);
    showBanner(t("reader.session.loadChapterError", { msg }));
    s.setError(msg);
    s.setLoading(false);
    return;
  }
  if (s.disposed) return;

  resolveSeriesContext(s, chapter);

  const pageCount = s.pages().length;
  if (pageCount === 0) {
    s.setEmpty(true);
    s.setLoading(false);
    return;
  }

  const startPage = await determineStartPage(route, permalink, pageCount);
  s.setCurrentIndex(startPage);
  s.lastPersistedIndex = startPage;
  // Fetch latest series / anthology chapterList and auto-detect layout
  if (s.seriesPermalink()) {
    const p = loadChapterList(s, false);
    s.chapterListPromise = p;

    void p.then(async () => {
      if (s.disposed) return;
      try {
        const seriesData = await fetchSeries(s.seriesPermalink()!, false, s.seriesType() ?? undefined);
        if (s.disposed || !seriesData) return;
        if (s.directionAutoDetected() && getDefaultReadingDirection() === "auto") {
          const newDir = detectReadingDirection(chapter.tags ?? [], seriesData.tags ?? []);
          if (newDir !== s.direction()) {
            s.setDirectionSignal(newDir);
            // applyLayoutMode updates rtl/ltr classes on containerEl/stripEl;
            // resetToCurrentPage syncs scroll position.
            s.applyLayoutMode();
            s.resetToCurrentPage(true);
          }
        }
        if (s.layoutAutoDetected() && isLongStripSpreadOverrideEnabled()) {
          const isLong = detectIsLongStrip(chapter.tags ?? [], seriesData.tags ?? []);
          s.setIsLongStrip(isLong);
          if (isLong && s.pagedLayout() === "spread") {
            s.setPagedLayoutSignal("single");
            s.applyLayoutMode();
            s.resetToCurrentPage(true);
          }
        }
        if (isLongStripFitWidthEnabled()) {
          const isLong = detectIsLongStrip(chapter.tags ?? [], seriesData.tags ?? []);
          if (isLong && s.fitMode() !== "width") {
            s.setFitModeSignal("width");
            s.applyFitClass("width");
            s.updateSlotClearances();
          }
        }
      } catch (err) {
        log.debug("reader-bootstrap", "layout metadata detection failed (non-fatal):", err);
      }
    });

    if (s.chapterList().length === 0) {
      await Promise.race([
        p,
        new Promise<void>((resolve) => setTimeout(resolve, 300)),
      ]);
    }
  }

  initDisplayPreferences(s, chapter);

  await hydrateCachedPages(s, permalink, pageCount);

  preloadInitialDimensions(s, pageCount);
  initSlotStatesAndQueue(s, pageCount);
  if (startPage > 0) {
    s.setRestoring(true);
  }

  s.setLoading(false);

  // History + bookmarked state
  try {
    if (permalink.startsWith("mdx:")) {
      await recordMdxHistory(
        extractMangaDexId(permalink),
        s.seriesPermalink() ? extractMangaDexId(s.seriesPermalink()!) : "",
        s.seriesName() ?? "",
        s.chapterTitle(),
      );
    } else {
      await addHistory({
        chapterPermalink: permalink,
        seriesPermalink: s.seriesPermalink() ?? "",
        seriesName: s.seriesName() ?? "",
        chapterTitle: s.chapterTitle(),
      });
    }
  } catch (err) {
    log.error("reader-bootstrap", "failed to record history:", err);
  }

  let bookmarked = false;
  try {
    if (permalink.startsWith("mdx:")) {
      bookmarked = (await getMdxBookmark(extractMangaDexId(permalink))) !== null;
    } else {
      bookmarked = (await getBookmark(permalink)) !== null;
    }
  } catch (err) {
    log.debug("reader-bootstrap", "getBookmark failed:", err);
    bookmarked = false;
  }
  s.setBookmarked(bookmarked);

  // Seed sticky scanlator group from the opening chapter's ChapterRef so that
  // the first gotoAdjacent call already has a preferred group to track (3D).
  if (permalink.startsWith("mdx:")) {
    const openRef = s.chapterList().find((ref) => ref.permalink === permalink);
    if (openRef?.scanlatorGroup) {
      s.setActiveScanlatorGroup(openRef.scanlatorGroup);
    }
  }

  s.publishActions();

  requestAnimationFrame(() => {
    if (s.disposed) return;
    s.setPage(startPage, true);
    if (startPage > 0) {
      revealAfterRestore(s, startPage);
    }
  });
}

export function retryReaderSession(s: ReaderSession): void {
  s.disposedFlag = false;
  s.setError(null);
  s.setEmpty(false);
  s.setLoading(true);
  s.setPages([]);
  s.setChapterList([]);
  s.setCurrentIndex(0);
  s.setAtEnd(false);
  s.cachedPages[1](() => ({}));
  s.slotStates[1](() => ({}));
  s.recountCached();
  void initReaderSession(s);
}

export function revealAfterRestore(s: ReaderSession, targetPage?: number): void {
  const target = targetPage ?? s.currentIndex();
  const deadline = window.performance.now() + RESTORE_REVEAL_DEADLINE_MS;
  const poll = (): void => {
    if (s.disposed) return;
    if (!s.isHorizontal()) {
      s.slideTo(target, true);
    }
    let ready = true;
    const start = Math.max(0, target - 1);
    const end = Math.min(s.pages().length - 1, target + 1);
    for (let i = start; i <= end; i++) {
      const img = s.slotEls[i]?.querySelector<HTMLImageElement>("img.ds-page-img");
      if (img && !img.complete) {
        ready = false;
        break;
      }
    }
    if (!ready && window.performance.now() < deadline) {
      window.setTimeout(poll, 30);
      return;
    }
    s.slideTo(target, true);
    s.setRestoring(false);
  };
  window.setTimeout(poll, 0);
}
