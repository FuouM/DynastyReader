/**
 * Reactive reader session for the Solid reader.
 *
 * Coordinates one chapter-reading session: owns every piece of
 * chapter-reading state as signals/stores and the imperative machinery (page
 * download queue, reading-progress persistence, chapter navigation, viewport
 * slide/reset/layout) that the toolbar, viewport, shortcuts, wheel, and actions
 * components operate on. DOM writes from the legacy controller are replaced by
 * reactive state that the JSX components render.
 */

import { batch, createComponent, createRoot, getOwner, runWithOwner } from "solid-js";
import type { JSX } from "solid-js";
import { createStore } from "solid-js/store";
import {
  navigate,
  setBanner,
  showBanner,
  setActions,
  clearActions,
  isOnline,
  isMobile,
} from "../stores";
import { getChapterContainerTag } from "../taxonomy";
import { t } from "../i18n";
import { errorMessage } from "../utils/errors";
import { toggleAppTheme } from "../stores/theme";
import { fetchChapter, fetchSeries } from "../api";
import {
  addHistory,
  getBookmark,
  getCachedPages,
  getReadingProgress,
} from "../db";
import type { Chapter, ChapterPage } from "../types/api";
import type { ChapterRef, Route } from "../types/routes";
import { getPrevChapterStartPage } from "./settings";
import type {
  FitMode,
  PagedLayout,
  ReaderMode,
  ReadingDirection,
  SpreadGroup,
} from "../types/reader";
import {
  anchorPageOf,
  detectIsLongStrip,
  detectReadingDirection,
  spreadIndexOf,
  getAdjacentChapters,
} from "./reader-spread";
import { ReaderQueue, type ReaderQueueHost, type SlotStateKind } from "./reader-queue";
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
  setCoverOffsetDefaultEnabled,
  setDefaultFitMode,
  setDefaultPagedLayout,
  setDefaultReaderMode,
  setDefaultReadingDirection,
  getScrollLock,
  setScrollLock as setScrollLockPersisted,
} from "./settings";
import { standardizeCachePaths } from "./path-migration";
import { createReaderState, type ReaderState } from "./reader-state";
import { createReaderPersistence, type ReaderPersistence } from "./reader-persistence";
import { ReaderActions, type ReaderActionsController } from "../components/ReaderActions";

const SCROLL_ANIMATION_DURATION_MS = 280;
const PROGRAMMATIC_SCROLL_LOCK_MS = 350;
const RESTORE_REVEAL_DEADLINE_MS = 1200;
const FULLSCREEN_RELAYOUT_FIRST_MS = 60;
const FULLSCREEN_RELAYOUT_SECOND_MS = 180;

export {
  isAutoCacheChapterEnabled,
  setAutoCacheChapterEnabled,
  getPrefetchBuffer,
  setPrefetchBuffer,
} from "./settings";

export interface SlotStateRecord {
  kind: SlotStateKind;
  message: string;
}

export function createReaderSession(route: Route): ReaderSession {
  return new ReaderSession(route);
}
export class ReaderSession implements ReaderQueueHost {
  readonly permalink: string;
  readonly route: Route;
  private state: ReaderState;

  // Loaded data ------------------------------------------------------------
  readonly seriesPermalink: () => string | null;
  readonly setSeriesPermalink: (val: string | null) => void;

  readonly seriesName: () => string;
  readonly setSeriesName: (val: string) => void;

  readonly chapterPermalink: () => string;
  readonly setChapterPermalink: (val: string) => void;

  readonly chapterTitle: () => string;
  readonly setChapterTitle: (val: string) => void;

  readonly chapterList: () => ChapterRef[];
  readonly setChapterList: (val: ChapterRef[]) => void;

  readonly pages: () => ChapterPage[];
  readonly setPages: (val: ChapterPage[]) => void;

  // Runtime state ----------------------------------------------------------
  readonly currentIndex: () => number;
  readonly setCurrentIndex: (val: number) => void;

  readonly atEnd: () => boolean;
  readonly setAtEnd: (val: boolean) => void;

  readonly mode: () => ReaderMode;
  readonly setModeSignal: (val: ReaderMode) => void;

  readonly pagedLayout: () => PagedLayout;
  readonly setPagedLayoutSignal: (val: PagedLayout) => void;

  readonly layoutAutoDetected: () => boolean;
  readonly setLayoutAutoDetected: (val: boolean) => void;

  readonly isLongStrip: () => boolean;
  readonly setIsLongStrip: (val: boolean) => void;

  readonly direction: () => ReadingDirection;
  readonly setDirectionSignal: (val: ReadingDirection) => void;

  readonly directionAutoDetected: () => boolean;
  readonly setDirectionAutoDetected: (val: boolean) => void;

  readonly coverOffset: () => boolean;
  readonly setCoverOffsetSignal: (val: boolean) => void;

  readonly widePages: () => ReadonlySet<number>;
  readonly setWidePagesSignal: (val: ReadonlySet<number> | ((prev: ReadonlySet<number>) => ReadonlySet<number>)) => void;

  readonly fitMode: () => FitMode;
  readonly setFitModeSignal: (val: FitMode) => void;

  readonly zoomScale: () => number;
  readonly setZoomScaleSignal: (val: number | ((prev: number) => number)) => void;

  readonly scrollLock: () => boolean;
  readonly setScrollLockSignal: (val: boolean | ((prev: boolean) => boolean)) => void;

  readonly isFullscreen: () => boolean;
  readonly setIsFullscreenSignal: (val: boolean) => void;

  readonly loading: () => boolean;
  readonly setLoading: (val: boolean) => void;

  readonly error: () => string | null;
  readonly setError: (val: string | null) => void;

  readonly empty: () => boolean;
  readonly setEmpty: (val: boolean) => void;

  readonly bookmarked: () => boolean;
  readonly setBookmarked: (val: boolean) => void;

  readonly restoring: () => boolean;
  readonly setRestoring: (val: boolean) => void;

  readonly toolbarVisible: () => boolean;
  readonly setToolbarVisible: (val: boolean) => void;
  readonly controlsOpen: () => boolean;
  readonly setControlsOpen: (val: boolean) => void;
  private toolbarHideTimer: number | null = null;
  // Reactive cache / slot state (index -> path / {kind, message}) -----------
  readonly cachedPages: ReturnType<typeof createStore<Record<number, string | undefined>>>;
  readonly slotStates: ReturnType<typeof createStore<Record<number, SlotStateRecord | undefined>>>;
  readonly pageDimensions: ReturnType<typeof createStore<Record<number, { width: number; height: number } | undefined>>>;

  readonly cachedCount: () => number;
  readonly setCachedCount: (val: number) => void;
  // DOM refs ----------------------------------------------------------------
  containerEl: HTMLDivElement | null = null;
  viewportEl: HTMLElement | null = null;
  stripEl: HTMLElement | null = null;
  slotEls: (HTMLElement | null)[] = [];
  spreadSlotEls: (HTMLElement | null)[] = [];

  queue: ReaderQueue;
  readonly retrying = new Set<number>();
  readonly imgErrorCount = new Map<number, number>();
  private persistence!: ReaderPersistence;
  private disposedFlag = false;
  isProgrammaticScroll = false;
  programmaticScrollTimer: number | null = null;
  scrollRaf: number | null = null;
  scrollAnimRaf: number | null = null;
  private readonly cleanupFns: (() => void)[] = [];
  private actionsDispose: (() => void) | null = null;
  private readonly sessionOwner = getOwner();
  // Derived state -----------------------------------------------------------
  readonly isHorizontal: () => boolean;
  readonly isSpread: () => boolean;
  readonly spreads: () => SpreadGroup[];
  readonly slideIndex: () => number;
  readonly progress: () => {
    full: string;
    short: string;
    currentNumStr: string;
    totalNumStr: string;
    maxCurrentChars: number;
    pct: number;
    width: number;
    cachedNote: string;
    title: string;
    prevDisabled: boolean;
    nextDisabled: boolean;
  };
  readonly chapterNav: () => {
    prevDisabled: boolean;
    nextDisabled: boolean;
  };

  constructor(route: Route) {
    this.route = route;
    this.permalink = route.chapterPermalink ?? "";
    this.state = createReaderState();
    this.seriesPermalink = this.state.seriesPermalink;
    this.setSeriesPermalink = this.state.setSeriesPermalink;
    this.seriesName = this.state.seriesName;
    this.setSeriesName = this.state.setSeriesName;
    this.chapterPermalink = this.state.chapterPermalink;
    this.setChapterPermalink = this.state.setChapterPermalink;
    this.chapterTitle = this.state.chapterTitle;
    this.setChapterTitle = this.state.setChapterTitle;
    this.chapterList = this.state.chapterList;
    this.setChapterList = this.state.setChapterList;
    this.pages = this.state.pages;
    this.setPages = this.state.setPages;
    this.currentIndex = this.state.currentIndex;
    this.setCurrentIndex = this.state.setCurrentIndex;
    this.atEnd = this.state.atEnd;
    this.setAtEnd = this.state.setAtEnd;
    this.mode = this.state.mode;
    this.setModeSignal = this.state.setModeSignal;
    this.pagedLayout = this.state.pagedLayout;
    this.setPagedLayoutSignal = this.state.setPagedLayoutSignal;
    this.layoutAutoDetected = this.state.layoutAutoDetected;
    this.setLayoutAutoDetected = this.state.setLayoutAutoDetected;
    this.isLongStrip = this.state.isLongStrip;
    this.setIsLongStrip = this.state.setIsLongStrip;
    this.direction = this.state.direction;
    this.setDirectionSignal = this.state.setDirectionSignal;
    this.directionAutoDetected = this.state.directionAutoDetected;
    this.setDirectionAutoDetected = this.state.setDirectionAutoDetected;
    this.coverOffset = this.state.coverOffset;
    this.setCoverOffsetSignal = this.state.setCoverOffsetSignal;
    this.widePages = this.state.widePages;
    this.setWidePagesSignal = this.state.setWidePagesSignal;
    this.fitMode = this.state.fitMode;
    this.setFitModeSignal = this.state.setFitModeSignal;
    this.zoomScale = this.state.zoomScale;
    this.setZoomScaleSignal = this.state.setZoomScaleSignal;
    this.scrollLock = this.state.scrollLock;
    this.setScrollLockSignal = this.state.setScrollLockSignal;
    this.isFullscreen = this.state.isFullscreen;
    this.setIsFullscreenSignal = this.state.setIsFullscreenSignal;
    this.loading = this.state.loading;
    this.setLoading = this.state.setLoading;
    this.error = this.state.error;
    this.setError = this.state.setError;
    this.empty = this.state.empty;
    this.setEmpty = this.state.setEmpty;
    this.bookmarked = this.state.bookmarked;
    this.setBookmarked = this.state.setBookmarked;
    this.restoring = this.state.restoring;
    this.setRestoring = this.state.setRestoring;
    this.cachedCount = this.state.cachedCount;
    this.setCachedCount = this.state.setCachedCount;
    this.toolbarVisible = this.state.toolbarVisible;
    this.setToolbarVisible = this.state.setToolbarVisible;
    this.controlsOpen = this.state.controlsOpen;
    this.setControlsOpen = this.state.setControlsOpen;
    this.cachedPages = this.state.cachedPages;
    this.slotStates = this.state.slotStates;
    this.pageDimensions = this.state.pageDimensions;
    this.isHorizontal = this.state.isHorizontal;
    this.isSpread = this.state.isSpread;
    this.spreads = this.state.spreads;
    this.slideIndex = this.state.slideIndex;
    this.progress = this.state.progress;
    this.chapterNav = this.state.chapterNav;

    this.queue = new ReaderQueue(this);
    this.persistence = createReaderPersistence(this.state, this.permalink);
  }
  getPages(): ChapterPage[] {
    return this.pages();
  }

  getSeriesPermalink(): string | null {
    return this.seriesPermalink();
  }

  getCurrentIndex(): number {
    return this.currentIndex();
  }

  isDisposed(): boolean {
    return this.disposedFlag;
  }

  get disposed(): boolean {
    return this.disposedFlag;
  }

  getCachedPath(index: number): string | undefined {
    return this.cachedPages[0][index];
  }

  setCachedPath(index: number, path: string): void {
    this.retrying.delete(index);
    this.cachedPages[1](index, path);
    this.slotStates[1](index, undefined);
    this.recountCached();
  }

  setCachedPage(index: number, path: string): void {
    this.setCachedPath(index, path);
  }

  setSlotState(index: number, kind: SlotStateKind, message: string): void {
    this.slotStates[1](index, { kind, message });
  }

  showErrorBanner(message: string): void {
    showBanner(message);
  }

  isPageFailed(index: number): boolean {
    return this.queue.isFailed(index);
  }

  onDispose(fn: () => void): void {
    this.cleanupFns.push(fn);
  }

  cancelScrollAnimation(): void {
    if (this.scrollAnimRaf !== null) {
      cancelAnimationFrame(this.scrollAnimRaf);
      this.scrollAnimRaf = null;
    }
    if (this.programmaticScrollTimer !== null) {
      clearTimeout(this.programmaticScrollTimer);
      this.programmaticScrollTimer = null;
    }
    this.isProgrammaticScroll = false;
  }

  dispose(): void {
    this.disposedFlag = true;
    this.cancelScrollAnimation();
    this.persistence.dispose();
    this.clearToolbarTimer();
    for (const fn of this.cleanupFns) fn();
    this.cleanupFns.length = 0;
    if (this.actionsDispose) {
      this.actionsDispose();
      this.actionsDispose = null;
    }
    clearActions();
  }

  recountCached(): void {
    this.setCachedCount(Object.keys(this.cachedPages[0]).length);
  }

  recomputeCachedCount(): void {
    this.recountCached();
  }

  // Queue access ------------------------------------------------------------
  enqueue(index: number, priority = false): void {
    if (index >= 0 && index < this.pages().length) {
      const slotState = this.slotStates[0][index];
      if (
        this.getCachedPath(index) === undefined &&
        !this.queue.isFailed(index) &&
        slotState?.kind === "idle"
      ) {
        this.setSlotState(index, "spinner", t("reader.session.slotState.downloading"));
      }
    }
    this.queue.enqueue(index, priority);
  }

  /** Image-load failure: bounded retry before settling into an error state. */
  onPageImgError(index: number): void {
    const count = (this.imgErrorCount.get(index) ?? 0) + 1;
    this.imgErrorCount.set(index, count);
    this.cachedPages[1](index, undefined);
    if (count <= 2) {
      this.setSlotState(index, "spinner", t("reader.session.slotState.redownloading"));
      this.queue.enqueue(index, true);
    } else {
      this.setSlotState(
        index,
        "error",
        t("reader.session.slotState.imageLoadFailed", { page: index + 1 }),
      );
    }
  }

  /** Slot Retry button: clears the failure and re-queues the page. */
  retrySlot(index: number): void {
    this.imgErrorCount.delete(index);
    this.retrying.delete(index);
    this.queue.clearFailed(index);
    this.setSlotState(index, "spinner", t("reader.session.slotState.downloading"));
    this.queue.enqueue(index, true);
  }

  /** Pre-caches all pages in the current chapter. */
  cacheFullChapter(): void {
    const total = this.pages().length;
    for (let i = 0; i < total; i++) {
      if (this.getCachedPath(i) === undefined) {
        this.setSlotState(i, "spinner", t("reader.session.slotState.queued"));
        this.enqueue(i);
      }
    }
  }

  /** Returns true when every page in the chapter is stored locally in cache. */
  isFullyCached(): boolean {
    const total = this.pages().length;
    return total > 0 && this.cachedCount() >= total;
  }
  // Progress + persistence --------------------------------------------------
  schedulePersist(): void {
    this.persistence.schedulePersist();
  }

  async persistNow(): Promise<void> {
    return this.persistence.persistNow();
  }

  setPage(index: number, instant = false, scrollToBottom = false): void {
    if (index < 0 || index >= this.pages().length) return;
    batch(() => {
      const wasAtEnd = this.atEnd();
      const isNowAtEnd = index >= this.pages().length - 1;
      this.setCurrentIndex(index);
      this.setAtEnd(isNowAtEnd);
      if (!wasAtEnd && isNowAtEnd && this.pages().length > 1 && !this.loading()) {
        const list = this.chapterList();
        const curIdx = list.findIndex((c) => c.permalink === this.permalink);
        const nextCh = curIdx >= 0 && curIdx < list.length - 1 ? list[curIdx + 1] : null;
        if (nextCh) {
          showBanner(t("reader.session.endOfChapterNext", { title: nextCh.title }));
        } else {
          showBanner(t("reader.session.endOfChapter"));
        }
      }
    });
    this.schedulePersist();
    if (this.atEnd()) void this.persistNow();
    if (this.isSpread()) {
      this.enqueueSpreadNeighborhood();
    } else {
      this.enqueue(this.currentIndex());
      if (isAutoCacheChapterEnabled()) {
        this.enqueue(this.currentIndex() + 1);
        this.enqueue(this.currentIndex() + 2);
      } else {
        const prefetchCount = getPrefetchBuffer();
        for (let offset = 1; offset <= prefetchCount; offset++) {
          const nextIdx = this.currentIndex() + offset;
          if (nextIdx < this.pages().length && this.getCachedPath(nextIdx) === undefined) {
            this.enqueue(nextIdx);
          }
        }
      }
    }
    this.slideTo(index, instant, scrollToBottom);
  }

  setPageFromScroll(index: number): void {
    batch(() => {
      const wasAtEnd = this.atEnd();
      const isNowAtEnd = index >= this.pages().length - 1;
      this.setCurrentIndex(index);
      this.setAtEnd(isNowAtEnd);
      if (!wasAtEnd && isNowAtEnd && this.pages().length > 1 && !this.loading()) {
        const list = this.chapterList();
        const curIdx = list.findIndex((c) => c.permalink === this.permalink);
        const nextCh = curIdx >= 0 && curIdx < list.length - 1 ? list[curIdx + 1] : null;
        if (nextCh) {
          showBanner(t("reader.session.endOfChapterNext", { title: nextCh.title }));
        } else {
          showBanner(t("reader.session.endOfChapter"));
        }
      }
    });
    this.schedulePersist();
    if (this.atEnd()) void this.persistNow();
  }
  /** Enqueues the current and next two spreads so paired pages load together. */
  private enqueueSpreadNeighborhood(): void {
    if (this.spreads().length === 0) return;
    const cur = spreadIndexOf(this.spreads(), this.currentIndex());
    const end = Math.min(this.spreads().length - 1, cur + 2);
    for (let s = cur; s <= end; s++) {
      for (const pageIndex of this.spreads()[s].pageIndices) {
        this.enqueue(pageIndex);
      }
    }
  }

  /** Steps by one spread in the given reading direction. */
  stepSpread(delta: 1 | -1): void {
    if (!this.isSpread() || this.spreads().length === 0) return;
    const cur = spreadIndexOf(this.spreads(), this.currentIndex());
    const next = cur + delta;
    if (next < 0 || next >= this.spreads().length) return;
    this.setPage(anchorPageOf(this.spreads(), next), false, delta === -1);
  }

  // Layout controls ---------------------------------------------------------
  setMode(mode: ReaderMode): void {
    if (mode === this.mode()) return;
    this.setModeSignal(mode);
    setDefaultReaderMode(mode);
    this.applyLayoutMode();
    this.resetToCurrentPage(false);
  }

  setPagedLayout(layout: PagedLayout): void {
    if (layout === this.pagedLayout()) return;
    this.setPagedLayoutSignal(layout);
    this.setLayoutAutoDetected(false);
    setDefaultPagedLayout(layout);
    this.applyLayoutMode();
    this.resetToCurrentPage(false);
  }

  setDirection(dir: ReadingDirection): void {
    if (dir === this.direction()) return;
    this.setDirectionSignal(dir);
    this.setDirectionAutoDetected(false);
    setDefaultReadingDirection(dir);
    if (this.isHorizontal()) {
      this.applyLayoutMode();
      this.resetToCurrentPage(false);
    }
  }

  toggleCoverOffset(): void {
    this.setCoverOffsetSignal(!this.coverOffset());
    setCoverOffsetDefaultEnabled(this.coverOffset());
    if (this.isSpread()) {
      this.resetToCurrentPage(false);
    }
  }

  setFitMode(fit: FitMode): void {
    this.setFitModeSignal(fit);
    setDefaultFitMode(fit);
    if (this.containerEl) {
      this.containerEl.classList.remove("fit-width", "fit-height", "fit-original");
      this.containerEl.classList.add(`fit-${fit}`);
    }
    if (fit !== "original") {
      this.setZoomScaleSignal(1.0);
    }
  }

  setScrollLock(): void {
    this.setScrollLockSignal((prev) => {
      const next = !prev;
      setScrollLockPersisted(next);
      return next;
    });
  }

  setWidePages(next: ReadonlySet<number>): void {
    this.setWidePagesSignal(next);
  }

  setPageDimension(index: number, width: number, height: number): void {
    const cur = this.pageDimensions[0][index];
    if (cur?.width === width && cur?.height === height) return;
    this.pageDimensions[1](index, { width, height });
    if (index === 0) {
      this.updateFirstSlotHeight();
    }
    if (index === this.pages().length - 1) {
      this.updateLastSlotHeight();
    }
  }

  zoomIn(): void {
    if (this.fitMode() !== "original") return;
    this.setZoomScaleSignal((prev) => Math.min(3.0, Math.round((prev + 0.1) * 10) / 10));
  }

  zoomOut(): void {
    if (this.fitMode() !== "original") return;
    this.setZoomScaleSignal((prev) => Math.max(0.25, Math.round((prev - 0.1) * 10) / 10));
  }

  resetZoom(): void {
    if (this.fitMode() !== "original") return;
    this.setZoomScaleSignal(1.0);
  }

  toggleTheme(): void {
    toggleAppTheme();
  }

  setFullscreen(active: boolean): void {
    this.setIsFullscreenSignal(active);
    const container = this.containerEl;
    if (active) {
      try {
        if (!document.fullscreenElement && document.fullscreenEnabled) {
          void container?.requestFullscreen().catch((err) => {
            console.debug("[reader-session] requestFullscreen rejected:", err);
          });
        }
      } catch (err) {
        console.debug("[reader-session] requestFullscreen failed:", err);
      }
    } else {
      try {
        if (document.fullscreenElement) {
          void document.exitFullscreen().catch((err) => {
            console.debug("[reader-session] exitFullscreen rejected:", err);
          });
        }
      } catch (err) {
        console.debug("[reader-session] exitFullscreen failed:", err);
      }
    }
    this.resetToCurrentPage(false);
    setTimeout(() => this.resetToCurrentPage(false), FULLSCREEN_RELAYOUT_FIRST_MS);
    setTimeout(() => this.resetToCurrentPage(false), FULLSCREEN_RELAYOUT_SECOND_MS);
  }

  // Chapter navigation ------------------------------------------------------
  gotoChapter(c: ChapterRef, targetPage?: number | "last"): void {
    navigate({
      view: "reader",
      seriesPermalink: this.seriesPermalink() ?? undefined,
      seriesName: this.seriesName(),
      chapterPermalink: c.permalink,
      chapterTitle: c.title,
      chapterList: this.chapterList(),
      startPage: targetPage === "last" ? -1 : targetPage,
    });
  }

  gotoPrevChapter(): void {
    const { prevCh } = getAdjacentChapters(this.chapterList(), this.permalink, this.chapterTitle());
    if (prevCh) {
      const target = getPrevChapterStartPage() === "last" ? "last" : 0;
      this.gotoChapter(prevCh, target);
    }
  }

  gotoNextChapter(): void {
    const { nextCh } = getAdjacentChapters(this.chapterList(), this.permalink, this.chapterTitle());
    if (nextCh) {
      this.gotoChapter(nextCh, 0);
    }
  }

  gotoSeries(): void {
    navigate({
      view: "series",
      seriesPermalink: this.seriesPermalink() ?? undefined,
      seriesName: this.seriesName() ?? this.chapterTitle(),
    });
  }

  // Viewport imperative engine ----------------------------------------------
  updateViewportHeight(): void {
    const h = this.viewportEl?.clientHeight;
    if (h && h > 50 && this.containerEl) {
      this.containerEl.style.setProperty("--ds-viewport-full", `${h}px`);
      this.containerEl.style.setProperty("--ds-viewport-height", `${h - 20}px`);
      this.updateSlotClearances();
    }
  }

  updateFirstSlotHeight(): void {
    if (!this.containerEl || this.isHorizontal()) return;
    const firstSlot = this.slotEls[0];
    if (firstSlot) {
      const h = firstSlot.offsetHeight;
      if (h > 0) {
        this.containerEl.style.setProperty("--ds-first-slot-height", `${h}px`);
      }
    }
  }

  updateLastSlotHeight(): void {
    if (!this.containerEl || this.isHorizontal()) return;
    const lastIdx = this.pages().length - 1;
    if (lastIdx < 0) return;
    const lastSlot = this.slotEls[lastIdx];
    if (lastSlot) {
      const h = lastSlot.offsetHeight;
      if (h > 0) {
        this.containerEl.style.setProperty("--ds-last-slot-height", `${h}px`);
      }
    }
  }

  updateSlotClearances(): void {
    this.updateFirstSlotHeight();
    this.updateLastSlotHeight();
  }

  slideTo(index: number, instant = false, scrollToBottom = false): void {
    if (this.isHorizontal()) {
      const slideIndex = this.isSpread() ? spreadIndexOf(this.spreads(), index) : index;
      const targetSlide = this.isSpread() ? this.spreadSlotEls[slideIndex] : this.slotEls[index];
      if (targetSlide) {
        if (scrollToBottom) {
          targetSlide.scrollTop = Math.max(0, targetSlide.scrollHeight - targetSlide.clientHeight);
        } else {
          targetSlide.scrollTop = 0;
        }
        if (
          this.isSpread() &&
          this.direction() === "rtl" &&
          targetSlide.scrollWidth > targetSlide.clientWidth
        ) {
          targetSlide.scrollLeft = targetSlide.scrollWidth - targetSlide.clientWidth;
        } else {
          targetSlide.scrollLeft = 0;
        }
      }
      const sign = this.direction() === "rtl" ? 1 : -1;
      const transformValue = `translateX(${sign * slideIndex * 100}%)`;
      if (this.stripEl) {
        if (!this.scrollLock() || instant) {
          // Force layout commit so transition:none takes effect before transform
          this.stripEl.style.transition = "none";
          void this.stripEl.offsetWidth;
          this.stripEl.style.transform = transformValue;
        } else {
          // Scope will-change to the animation window — saves ~10 MB VRAM between page turns
          if (isMobile()) {
            this.stripEl.style.willChange = "transform";
            const el = this.stripEl;
            el.addEventListener(
              "transitionend",
              () => {
                el.style.willChange = "auto";
              },
              { once: true },
            );
          }
          this.stripEl.style.transition = "";
          this.stripEl.style.transform = transformValue;
        }
      }
    } else {
      this.isProgrammaticScroll = true;
      if (this.programmaticScrollTimer !== null) {
        clearTimeout(this.programmaticScrollTimer);
        this.programmaticScrollTimer = null;
      }
      if (this.scrollAnimRaf !== null) {
        cancelAnimationFrame(this.scrollAnimRaf);
        this.scrollAnimRaf = null;
      }

      const target = this.slotEls[index];
      if (target && this.viewportEl) {
        const vp = this.viewportEl;
        const vpRect = vp.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        const startScrollTop = vp.scrollTop;
        const centerOffset = this.isLongStrip() ? 0 : Math.max(0, (vpRect.height - targetRect.height) / 2);
        const targetScrollTop = index === 0 ? 0 : Math.max(0, startScrollTop + (targetRect.top - vpRect.top) - centerOffset);

        if (instant || !this.scrollLock()) {
          vp.scrollTop = targetScrollTop;
          this.isProgrammaticScroll = false;
        } else {
          const distance = targetScrollTop - startScrollTop;
          if (Math.abs(distance) < 2) {
            vp.scrollTop = targetScrollTop;
            this.isProgrammaticScroll = false;
            return;
          }

          const startTime = performance.now();
          const fullSpan = Math.max(1, vpRect.height);
          const normalizedDist = Math.min(1, Math.abs(distance) / fullSpan);
          const duration = Math.max(90, Math.round(SCROLL_ANIMATION_DURATION_MS * Math.sqrt(normalizedDist)));

          const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

          const step = (currentTime: number) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(1, elapsed / duration);
            vp.scrollTop = startScrollTop + distance * easeOutCubic(progress);

            if (progress < 1) {
              this.scrollAnimRaf = requestAnimationFrame(step);
            } else {
              vp.scrollTop = targetScrollTop;
              this.scrollAnimRaf = null;
              this.isProgrammaticScroll = false;
            }
          };

          this.scrollAnimRaf = requestAnimationFrame(step);
        }
      }
    }
  }

  resetToCurrentPage(smooth = false): void {
    this.updateViewportHeight();
    if (this.isHorizontal()) {
      const slideIndex = this.isSpread() ? spreadIndexOf(this.spreads(), this.currentIndex()) : this.currentIndex();
      const sign = this.direction() === "rtl" ? 1 : -1;
      const transformValue = `translateX(${sign * slideIndex * 100}%)`;
      if (this.stripEl) {
        if (!smooth) {
          this.stripEl.style.transition = "none";
          void this.stripEl.offsetWidth;
          this.stripEl.style.transform = transformValue;
          requestAnimationFrame(() => {
            if (this.stripEl) this.stripEl.style.transition = "";
          });
        } else {
          this.stripEl.style.transform = transformValue;
        }
      }
    } else {
      this.isProgrammaticScroll = true;
      if (this.programmaticScrollTimer !== null) {
        clearTimeout(this.programmaticScrollTimer);
        this.programmaticScrollTimer = null;
      }
      this.programmaticScrollTimer = window.setTimeout(() => {
        this.isProgrammaticScroll = false;
        this.programmaticScrollTimer = null;
      }, PROGRAMMATIC_SCROLL_LOCK_MS);

      const target = this.slotEls[this.currentIndex()];
      if (target && this.viewportEl) {
        if (this.currentIndex() === 0) {
          this.viewportEl.scrollTop = 0;
        } else {
          const vpRect = this.viewportEl.getBoundingClientRect();
          const targetRect = target.getBoundingClientRect();
          const centerOffset = this.isLongStrip() ? 0 : Math.max(0, (vpRect.height - targetRect.height) / 2);
          const targetTop = Math.max(0, this.viewportEl.scrollTop + (targetRect.top - vpRect.top) - centerOffset);
          if (!smooth) {
            this.viewportEl.scrollTop = targetTop;
          } else {
            this.viewportEl.scrollTo({ top: targetTop, behavior: "smooth" });
          }
        }
      } else if (this.viewportEl && this.currentIndex() === 0) {
        this.viewportEl.scrollTop = 0;
      }
    }
  }
  applyLayoutMode(): void {
    if (!this.viewportEl || !this.stripEl) return;
    if (this.isHorizontal()) {
      this.viewportEl.classList.add("horizontal");
      this.viewportEl.classList.toggle("rtl", this.direction() === "rtl");
      this.viewportEl.classList.toggle("ltr", this.direction() === "ltr");
      this.stripEl.classList.toggle("rtl", this.direction() === "rtl");
      this.stripEl.classList.toggle("ltr", this.direction() === "ltr");

      this.stripEl.style.transition = "none";
      const slideIndex = this.isSpread() ? spreadIndexOf(this.spreads(), this.currentIndex()) : this.currentIndex();
      const sign = this.direction() === "rtl" ? 1 : -1;
      this.stripEl.style.transform = `translateX(${sign * slideIndex * 100}%)`;
      requestAnimationFrame(() => {
        if (this.stripEl) this.stripEl.style.transition = "";
      });
    } else {
      this.viewportEl.classList.remove("horizontal", "rtl", "ltr");
      this.stripEl.classList.remove("rtl", "ltr");
      this.stripEl.style.transform = "";
      const target = this.slotEls[this.currentIndex()];
      if (target) {
        target.scrollIntoView({ behavior: "auto", block: "center" });
      } else if (this.viewportEl && this.currentIndex() === 0) {
        this.viewportEl.scrollTop = 0;
      }
    }
  }

  // Toolbar visibility (toggled on tap outside) -----------------------------
  scheduleToolbarAutoHide(): void {
    this.clearToolbarTimer();
  }

  clearToolbarTimer(): void {
    if (this.toolbarHideTimer !== null) {
      window.clearTimeout(this.toolbarHideTimer);
      this.toolbarHideTimer = null;
    }
  }

  toggleToolbarVisible(): void {
    this.setToolbarVisible(!this.toolbarVisible());
    this.clearToolbarTimer();
  }

  // Publish topbar actions — must run inside a Solid root so
  // createSignal / onCleanup inside ReaderActions are owned and disposable.
  // init() is async so the call loses the component owner after await;
  // we capture sessionOwner at construction and use createRoot/runWithOwner.
  publishActions(): void {
    if (this.actionsDispose) {
      this.actionsDispose();
      this.actionsDispose = null;
    }
    const create = () =>
      createComponent(ReaderActions, {
        ctrl: this as unknown as ReaderActionsController,
        bookmarked: () => this.bookmarked(),
      }) as unknown as JSX.Element;
    const owner = this.sessionOwner;
    if (owner) {
      runWithOwner(owner, () => {
        this.actionsDispose = createRoot((dispose) => {
          setActions(create());
          return dispose;
        });
      });
    } else {
      this.actionsDispose = createRoot((dispose) => {
        setActions(create());
        return dispose;
      });
    }
  }

  // Bootstrap ----------------------------------------------------------------
  async init(): Promise<void> {
    const route = this.route;
    const permalink = route.chapterPermalink;
    if (!permalink) return;

    let chapter: Chapter;
    try {
      chapter = await fetchChapter(permalink);
    } catch (err) {
      if (this.disposedFlag) return;
      const msg = errorMessage(err);
      setBanner(t("reader.session.loadChapterError", { msg }));
      this.setError(msg);
      this.setLoading(false);
      return;
    }
    if (this.disposedFlag) return;

    const containerTag = getChapterContainerTag(chapter.tags);
    const seriesPermalink = route.seriesPermalink || containerTag?.permalink || null;
    const seriesName = route.seriesName || containerTag?.name || chapter.title;
    const preferredType = containerTag?.type || (route.seriesPermalink ? "series" : undefined);

    this.setSeriesPermalink(seriesPermalink);
    this.setSeriesName(seriesName);
    this.setChapterTitle(chapter.title || route.chapterTitle || "Chapter");
    this.setChapterPermalink(this.permalink);
    if (route.chapterList && route.chapterList.length > 0) {
      this.setChapterList(route.chapterList);
    } else {
      this.setChapterList([]);
    }
    this.setPages(chapter.pages ?? []);

    const pageCount = this.pages().length;
    if (pageCount === 0) {
      this.setEmpty(true);
      this.setLoading(false);
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
        console.error("dynasty-scans: failed to load reading progress:", err);
      }
    }
    this.setCurrentIndex(Math.min(startPage, Math.max(0, pageCount - 1)));

    // Fetch latest series / anthology chapterList and auto-detect layout
    if (this.seriesPermalink()) {
      void fetchSeries(this.seriesPermalink()!, false, preferredType).then((s) => {
        if (this.disposedFlag) return;
        const cl: ChapterRef[] = [];
        for (const t of s.taggings ?? []) {
          if (t.header) continue;
          if (t.permalink) {
            cl.push({
              title: t.title || t.permalink,
              permalink: t.permalink,
              released_on: t.released_on ?? undefined,
            });
          }
        }
        if (cl.length > 0) {
          this.setChapterList(cl);
        }
        if (this.directionAutoDetected() && getDefaultReadingDirection() === "auto") {
          const newDir = detectReadingDirection(chapter.tags ?? [], s.tags ?? []);
          if (newDir !== this.direction()) {
            this.setDirectionSignal(newDir);
            if (this.isSpread()) {
              this.resetToCurrentPage(true);
            }
          }
        }
        if (this.layoutAutoDetected() && isLongStripSpreadOverrideEnabled()) {
          const isLong = detectIsLongStrip(chapter.tags ?? [], s.tags ?? []);
          this.setIsLongStrip(isLong);
          if (isLong && this.pagedLayout() === "spread") {
            this.setPagedLayoutSignal("single");
            if (this.isSpread()) {
              this.resetToCurrentPage(true);
            }
          }
        }
        if (isLongStripFitWidthEnabled()) {
          const isLong = detectIsLongStrip(chapter.tags ?? [], s.tags ?? []);
          if (isLong && this.fitMode() !== "width") {
            this.setFitMode("width");
          }
        }
      });
    }

    // Display-mode preferences
    this.setModeSignal(getEffectiveDefaultReaderMode());

    const isLong = detectIsLongStrip(chapter.tags ?? []);
    this.setIsLongStrip(isLong);

    if (isLong && isLongStripSpreadOverrideEnabled()) {
      // Soft disable spread mode for long strip chapters
      this.setPagedLayoutSignal("single");
      this.setLayoutAutoDetected(true);
    } else {
      this.setPagedLayoutSignal(getEffectiveDefaultPagedLayout());
      this.setLayoutAutoDetected(false);
    }

    this.setCoverOffsetSignal(isCoverOffsetDefaultEnabled());
    
    const dirPref = getDefaultReadingDirection();
    if (dirPref === "auto") {
      const tagDir = detectReadingDirection(chapter.tags ?? []);
      this.setDirectionSignal(tagDir);
      this.setDirectionAutoDetected(true);
    } else {
      this.setDirectionSignal(dirPref);
      this.setDirectionAutoDetected(false);
    }
    if (isLong && isLongStripFitWidthEnabled()) {
      this.setFitModeSignal("width");
    } else {
      this.setFitModeSignal(getDefaultFitMode());
    }
    this.setScrollLockSignal(getScrollLock());

    // Restore cached page paths from SQLite
    let cachedRows: Awaited<ReturnType<typeof getCachedPages>> = [];
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
        this.cachedPages[1](row.page_index, row.file_path);
      }
    }
    this.recountCached();

    // Initial slot states (uncached pages)
    const autoCacheAll = isAutoCacheChapterEnabled();
    for (let i = 0; i < pageCount; i++) {
      if (this.getCachedPath(i) !== undefined) continue;
      if (!isOnline()) {
        this.setSlotState(i, "offline", t("reader.session.slotState.offline"));
      } else if (autoCacheAll) {
        this.setSlotState(i, "spinner", t("reader.session.slotState.queued"));
        this.enqueue(i);
      } else {
        this.setSlotState(i, "idle", t("reader.session.slotState.waiting"));
      }
    }

    // Trigger priority download for uncached start/nearby pages
    const cur = this.currentIndex();
    if (this.getCachedPath(cur) === undefined) this.enqueue(cur, true);
    if (autoCacheAll) {
      if (this.getCachedPath(cur + 1) === undefined) this.enqueue(cur + 1, true);
      if (this.getCachedPath(cur + 2) === undefined) this.enqueue(cur + 2, true);
    } else {
      const prefetchCount = getPrefetchBuffer();
      for (let offset = 1; offset <= prefetchCount; offset++) {
        const nextIdx = cur + offset;
        if (nextIdx < pageCount && this.getCachedPath(nextIdx) === undefined) {
          this.enqueue(nextIdx, true);
        }
      }
    }

    if (startPage > 0) {
      this.setRestoring(true);
    }

    this.setLoading(false);
    standardizeCachePaths(this as any);

    // History + bookmarked state
    try {
      await addHistory({
        chapterPermalink: permalink,
        seriesPermalink: this.seriesPermalink() ?? "",
        seriesName: this.seriesName() ?? "",
        chapterTitle: this.chapterTitle(),
      });
    } catch (err) {
      console.error("dynasty-scans: failed to record history:", err);
    }

    let bookmarked = false;
    try {
      bookmarked = (await getBookmark(permalink)) !== null;
    } catch {
      bookmarked = false;
    }
    this.setBookmarked(bookmarked);

    this.publishActions();

    requestAnimationFrame(() => {
      if (this.disposedFlag) return;
      this.setPage(startPage, true);
      if (startPage > 0) {
        this.revealAfterRestore();
      }
    });
  }

  retry(): void {
    this.disposedFlag = false;
    this.setError(null);
    this.setEmpty(false);
    this.setLoading(true);
    this.setPages([]);
    this.setChapterList([]);
    this.setCurrentIndex(0);
    this.setAtEnd(false);
    this.cachedPages[1](() => ({}));
    this.slotStates[1](() => ({}));
    this.recountCached();
    void this.init();
  }

  private revealAfterRestore(): void {
    const deadline = window.performance.now() + RESTORE_REVEAL_DEADLINE_MS;
    const poll = (): void => {
      if (this.disposedFlag) return;
      let ready = true;
      const cur = this.currentIndex();
      const start = Math.max(0, cur - 1);
      const end = Math.min(this.pages().length - 1, cur + 1);
      for (let i = start; i <= end; i++) {
        const img = this.slotEls[i]?.querySelector<HTMLImageElement>("img.ds-page-img");
        if (img && !img.complete) {
          ready = false;
          break;
        }
      }
      if (!ready && window.performance.now() < deadline) {
        window.setTimeout(poll, 30);
        return;
      }
      this.slideTo(this.currentIndex(), true);
      this.setRestoring(false);
    };
    window.setTimeout(poll, 0);
  }

  private wideResetScheduled = false;
  scheduleWidePageLayoutReset(): void {
    if (this.wideResetScheduled || !this.isSpread()) return;
    this.wideResetScheduled = true;
    queueMicrotask(() => {
      this.wideResetScheduled = false;
      if (this.disposedFlag || !this.isSpread()) return;
      if (this.slotEls.length === this.pages().length) {
        this.resetToCurrentPage(true);
      }
    });
  }
}
