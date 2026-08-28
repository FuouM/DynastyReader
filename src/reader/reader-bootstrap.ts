/**
 * Reader session bootstrap, retry, and post-restore reveal lifecycle.
 * Extracted from `reader-session.ts` (P3-A continuation) for modularity.
 */

import type { ReaderSession } from "./reader-session";
import type { CachedPageRow } from "../types/db";
import type { Chapter } from "../types/api";
import { fetchChapter, fetchSeries } from "../api";
import {
  addHistory,
  getBookmark,
  getCachedPages,
  getReadingProgress,
} from "../db";
import { getChapterContainerTag } from "../taxonomy";
import {
  detectIsLongStrip,
  detectReadingDirection,
} from "./reader-spread";
import {
  getDefaultFitMode,
  getEffectiveDefaultReaderMode,
  getEffectiveDefaultPagedLayout,
  getDefaultReadingDirection,
  getPrefetchBuffer,
  isAutoCacheChapterEnabled,
  isCoverOffsetDefaultEnabled,
  isLongStripFitWidthEnabled,
  isLongStripSpreadOverrideEnabled,
  getScrollLock,
} from "./settings";
import { standardizeCachePaths } from "./path-migration";
import { setBanner, isOnline } from "../stores";
import { t } from "../i18n";
import { errorMessage } from "../utils/errors";
import { loadChapterList } from "./reader-chapter-nav";

export const RESTORE_REVEAL_DEADLINE_MS = 1200;

export async function initReaderSession(s: ReaderSession): Promise<void> {
  const route = s.route;
  const permalink = route.chapterPermalink;
  if (!permalink) return;

  let chapter: Chapter;
  try {
    chapter = await fetchChapter(permalink);
  } catch (err) {
    if (s.disposed) return;
    const msg = errorMessage(err);
    setBanner(t("reader.session.loadChapterError", { msg }));
    s.setError(msg);
    s.setLoading(false);
    return;
  }
  if (s.disposed) return;

  const containerTag = getChapterContainerTag(chapter.tags);
  s.containerTagPermalink = containerTag?.permalink || null;
  s.containerTagType = containerTag?.type || null;

  const hasRouteChapterList = Boolean(route.chapterList && route.chapterList.length > 0);
  const seriesPermalink = hasRouteChapterList
    ? (route.seriesPermalink || containerTag?.permalink || null)
    : (containerTag?.permalink || route.seriesPermalink || null);
  const seriesName = containerTag?.name || route.seriesName || chapter.title;
  const preferredType = containerTag?.type || (route.seriesPermalink ? "series" : undefined);

  s.setSeriesPermalink(seriesPermalink);
  s.setSeriesType(preferredType ?? null);
  s.setSeriesName(seriesName);
  s.setChapterTitle(chapter.title || route.chapterTitle || "Chapter");
  s.setChapterPermalink(s.permalink);
  if (hasRouteChapterList) {
    s.setChapterList(route.chapterList!);
  } else {
    s.setChapterList([]);
  }
  s.setPages(chapter.pages ?? []);

  const pageCount = s.pages().length;
  if (pageCount === 0) {
    s.setEmpty(true);
    s.setLoading(false);
    return;
  }

  let startPage = route.startPage ?? 0;
  if (startPage === -1) {
    startPage = Math.max(0, pageCount - 1);
  } else if (startPage <= 0) {
    try {
      const prog = await getReadingProgress(permalink);
      if (prog && prog.completed !== 1 && prog.page_index > 0) {
        startPage = prog.page_index;
      }
    } catch (err) {
      console.error("[dynasty-reader] failed to load reading progress:", err);
    }
  }
  s.setCurrentIndex(Math.min(startPage, Math.max(0, pageCount - 1)));

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
            if (s.isSpread()) {
              s.resetToCurrentPage(true);
            }
          }
        }
        if (s.layoutAutoDetected() && isLongStripSpreadOverrideEnabled()) {
          const isLong = detectIsLongStrip(chapter.tags ?? [], seriesData.tags ?? []);
          s.setIsLongStrip(isLong);
          if (isLong && s.pagedLayout() === "spread") {
            s.setPagedLayoutSignal("single");
            if (s.isSpread()) {
              s.resetToCurrentPage(true);
            }
          }
        }
        if (isLongStripFitWidthEnabled()) {
          const isLong = detectIsLongStrip(chapter.tags ?? [], seriesData.tags ?? []);
          if (isLong && s.fitMode() !== "width") {
            s.setFitMode("width");
          }
        }
      } catch (err) {
        console.debug("[dynasty-reader] layout metadata detection failed (non-fatal):", err);
      }
    });

    if (s.chapterList().length === 0) {
      await Promise.race([
        p,
        new Promise<void>((resolve) => setTimeout(resolve, 300)),
      ]);
    }
  }

  // Display-mode preferences
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

  // Restore cached page paths from SQLite
  let cachedRows: CachedPageRow[] = [];
  try {
    cachedRows = await getCachedPages(permalink);
  } catch (err) {
    cachedRows = [];
    setBanner(
      t("reader.session.cacheLookupError", { msg: errorMessage(err) }),
    );
  }
  for (const row of cachedRows) {
    if (row.page_index >= 0 && row.page_index < pageCount && row.file_path) {
      s.cachedPages[1](row.page_index, row.file_path);
    }
  }
  s.recountCached();

  // Initial slot states (uncached pages)
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

  // Trigger priority download for uncached start/nearby pages
  const cur = s.currentIndex();
  if (s.getCachedPath(cur) === undefined) s.enqueue(cur, true);
  if (autoCacheAll) {
    if (s.getCachedPath(cur + 1) === undefined) s.enqueue(cur + 1, true);
    if (s.getCachedPath(cur + 2) === undefined) s.enqueue(cur + 2, true);
  } else {
    const prefetchCount = getPrefetchBuffer();
    for (let offset = 1; offset <= prefetchCount; offset++) {
      const nextIdx = cur + offset;
      if (nextIdx < pageCount && s.getCachedPath(nextIdx) === undefined) {
        s.enqueue(nextIdx, true);
      }
    }
  }

  if (startPage > 0) {
    s.setRestoring(true);
  }

  s.setLoading(false);
  standardizeCachePaths(s);

  // History + bookmarked state
  try {
    await addHistory({
      chapterPermalink: permalink,
      seriesPermalink: s.seriesPermalink() ?? "",
      seriesName: s.seriesName() ?? "",
      chapterTitle: s.chapterTitle(),
    });
  } catch (err) {
    console.error("[dynasty-reader] failed to record history:", err);
  }

  let bookmarked = false;
  try {
    bookmarked = (await getBookmark(permalink)) !== null;
  } catch {
    bookmarked = false;
  }
  s.setBookmarked(bookmarked);

  s.publishActions();

  requestAnimationFrame(() => {
    if (s.disposed) return;
    s.setPage(startPage, true);
    if (startPage > 0) {
      revealAfterRestore(s);
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

export function revealAfterRestore(s: ReaderSession): void {
  const deadline = window.performance.now() + RESTORE_REVEAL_DEADLINE_MS;
  const poll = (): void => {
    if (s.disposed) return;
    let ready = true;
    const cur = s.currentIndex();
    const start = Math.max(0, cur - 1);
    const end = Math.min(s.pages().length - 1, cur + 1);
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
    s.slideTo(s.currentIndex(), true);
    s.setRestoring(false);
  };
  window.setTimeout(poll, 0);
}
