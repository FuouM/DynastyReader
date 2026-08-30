/**
 * Reactive reader session for the Solid reader.
 *
 * Coordinates one chapter-reading session: owns every piece of reactive
 * state and orchestrates the download queue, persistence, chapter navigation,
 * and topbar actions. DOM viewport operations (slide/reset/layout) are
 * delegated to reader-viewport.ts.
 */

import { batch, createComponent, createRoot, getOwner, runWithOwner } from "solid-js";
import { createStore } from "solid-js/store";
import { showBanner, setActions, clearActions } from "../stores";
import { convertFileSrc } from "../ipc";
import { t } from "../i18n";
import { toggleAppTheme } from "../stores/theme";
import type { ChapterPage } from "../types/api";
import type { ChapterRef, Route } from "../types/routes";
import type {
  FitMode,
  PagedLayout,
  ReaderMode,
  ReadingDirection,
  SpreadGroup,
} from "../types/reader";
import { anchorPageOf, spreadIndexOf } from "./reader-spread";
import { ReaderQueue, type ReaderQueueHost, type SlotStateKind } from "./reader-queue";
import {
  getPrefetchBuffer,
  isAutoCacheChapterEnabled,
  setCoverOffsetDefaultEnabled,
  setDefaultFitMode,
  setDefaultPagedLayout,
  setDefaultReaderMode,
  setDefaultReadingDirection,
  setScrollLock as setScrollLockPersisted,
} from "./settings";
import * as vp from "./reader-viewport";
import * as nav from "./reader-chapter-nav";
import * as boot from "./reader-bootstrap";
import { createReaderState, type ReaderState, type SlotStateRecord } from "./reader-state";
import { createReaderPersistence, type ReaderPersistence } from "./reader-persistence";
import { log } from "../utils/log";
import { ReaderActions, type ReaderActionsController } from "../components/ReaderActions";

const FULLSCREEN_RELAYOUT_FIRST_MS = 60;
const FULLSCREEN_RELAYOUT_SECOND_MS = 180;
export {
  isAutoCacheChapterEnabled,
  setAutoCacheChapterEnabled,
  getPrefetchBuffer,
  setPrefetchBuffer,
} from "./settings";

export function createReaderSession(route: Route): ReaderSession {
  return new ReaderSession(route);
}
export class ReaderSession implements ReaderQueueHost, ReaderActionsController {
  readonly permalink: string;
  readonly route: Route;
  private state: ReaderState;

  // Loaded data ------------------------------------------------------------
  readonly seriesPermalink: () => string | null;
  readonly setSeriesPermalink: (val: string | null) => void;

  readonly seriesType: () => string | null;
  readonly setSeriesType: (val: string | null) => void;

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
  disposedFlag = false;
  isProgrammaticScroll = false;
  programmaticScrollTimer: number | null = null;
  scrollRaf: number | null = null;
  scrollAnimRaf: number | null = null;
  private readonly cleanupFns: (() => void)[] = [];
  containerTagPermalink: string | null = null;
  containerTagType: string | null = null;
  chapterListPromise: Promise<ChapterRef[]> | null = null;
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
    this.seriesType = this.state.seriesType;
    this.setSeriesType = this.state.setSeriesType;
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
    if (typeof window !== "undefined") {
      const img = new Image();
      img.src = convertFileSrc(path);
      if (img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
        this.setPageDimension(index, img.naturalWidth, img.naturalHeight);
        if (typeof img.decode === "function") {
          img.decode().catch(() => {});
        }
      } else {
        img.onload = () => {
          if (!this.disposedFlag) {
            this.setPageDimension(index, img.naturalWidth, img.naturalHeight);
            if (typeof img.decode === "function") {
              img.decode().catch(() => {});
            }
          }
        };
      }
    }
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

  /** Update the page index and show an end-of-chapter banner if we just crossed the boundary. */
  private updateIndexAndNotifyEnd(index: number): void {
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
  }

  setPage(index: number, instant = false, scrollToBottom = false): void {
    if (index < 0 || index >= this.pages().length) return;
    this.updateIndexAndNotifyEnd(index);
    this.schedulePersist();
    if (this.atEnd()) void this.persistNow();
    if (this.isSpread()) {
      this.enqueueSpreadNeighborhood();
    } else {
      this.enqueue(this.currentIndex(), true);
      for (let offset = 1; offset <= 4; offset++) {
        const nextIdx = this.currentIndex() + offset;
        if (nextIdx < this.pages().length && this.getCachedPath(nextIdx) === undefined) {
          this.enqueue(nextIdx, true);
        }
      }
      const prefetchCount = Math.max(getPrefetchBuffer(), 6);
      for (let offset = 5; offset <= prefetchCount; offset++) {
        const nextIdx = this.currentIndex() + offset;
        if (nextIdx < this.pages().length && this.getCachedPath(nextIdx) === undefined) {
          this.enqueue(nextIdx, false);
        }
      }
    }
    this.slideTo(index, instant, scrollToBottom);
  }

  setPageFromScroll(index: number): void {
    this.updateIndexAndNotifyEnd(index);
    this.schedulePersist();
    if (this.atEnd()) void this.persistNow();
  }
  /** Enqueues spreads near the current position, respecting auto-cache / prefetch buffer. */
  private enqueueSpreadNeighborhood(): void {
    if (this.spreads().length === 0) return;
    const cur = spreadIndexOf(this.spreads(), this.currentIndex());
    let end: number;
    if (isAutoCacheChapterEnabled()) {
      end = Math.min(this.spreads().length - 1, cur + 2);
    } else {
      const prefetchCount = getPrefetchBuffer();
      const spreadsAhead = Math.ceil(prefetchCount / 2);
      end = Math.min(this.spreads().length - 1, cur + spreadsAhead);
    }

    // 1. Enqueue active spread pages with top priority
    const active = this.spreads()[cur];
    if (active) {
      for (const pageIndex of active.pageIndices) {
        if (this.getCachedPath(pageIndex) === undefined) {
          this.enqueue(pageIndex, true);
        }
      }
    }

    // 2. Enqueue immediate next spread with priority so next page turn is instant
    if (cur + 1 < this.spreads().length) {
      const next = this.spreads()[cur + 1];
      for (const pageIndex of next.pageIndices) {
        if (this.getCachedPath(pageIndex) === undefined) {
          this.enqueue(pageIndex, true);
        }
      }
    }

    // 3. Prefetch further upcoming spreads
    for (let s = cur + 2; s <= end; s++) {
      for (const pageIndex of this.spreads()[s].pageIndices) {
        if (this.getCachedPath(pageIndex) === undefined) {
          this.enqueue(pageIndex, false);
        }
      }
    }
    // 3. Preload previous spread if uncached
    if (cur > 0) {
      const prev = this.spreads()[cur - 1];
      if (prev) {
        for (const pageIndex of prev.pageIndices) {
          if (this.getCachedPath(pageIndex) === undefined) {
            this.enqueue(pageIndex, false);
          }
        }
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
    this.enqueueSpreadNeighborhood();
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
            log.debug("reader-session", "requestFullscreen rejected:", err);
          });
        }
      } catch (err) {
        log.debug("reader-session", "requestFullscreen failed:", err);
      }
    } else {
      try {
        if (document.fullscreenElement) {
          void document.exitFullscreen().catch((err) => {
            log.debug("reader-session", "exitFullscreen rejected:", err);
          });
        }
      } catch (err) {
        log.debug("reader-session", "exitFullscreen failed:", err);
      }
    }
    this.resetToCurrentPage(false);
    setTimeout(() => this.resetToCurrentPage(false), FULLSCREEN_RELAYOUT_FIRST_MS);
    setTimeout(() => this.resetToCurrentPage(false), FULLSCREEN_RELAYOUT_SECOND_MS);
  }

  // Chapter navigation — delegates to reader-chapter-nav.ts -----------------
  gotoChapter(c: ChapterRef, targetPage?: number | "last"): void {
    nav.gotoChapter(this, c, targetPage);
  }

  async loadChapterList(force = false): Promise<ChapterRef[]> {
    return nav.loadChapterList(this, force);
  }

  async gotoPrevChapter(): Promise<void> {
    return nav.gotoPrevChapter(this);
  }

  async gotoNextChapter(): Promise<void> {
    return nav.gotoNextChapter(this);
  }

  gotoSeries(): void {
    nav.gotoSeries(this);
  }
  // Viewport imperative engine — delegates to reader-viewport.ts ------------
  updateViewportHeight(): void { vp.updateViewportHeight(this); }
  updateFirstSlotHeight(): void { vp.updateFirstSlotHeight(this); }
  updateLastSlotHeight(): void { vp.updateLastSlotHeight(this); }
  updateSlotClearances(): void { vp.updateSlotClearances(this); }
  slideTo(index: number, instant = false, scrollToBottom = false): void { vp.slideTo(this, index, instant, scrollToBottom); }
  resetToCurrentPage(smooth = false): void { vp.resetToCurrentPage(this, smooth); }
  applyLayoutMode(): void { vp.applyLayoutMode(this); }

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
        ctrl: this,
        bookmarked: this.bookmarked(),
      });
    const owner = this.sessionOwner;
    const attach = () => {
      this.actionsDispose = createRoot((dispose) => {
        setActions(create());
        return dispose;
      });
    };
    if (owner) {
      runWithOwner(owner, attach);
    } else {
      attach();
    }
  }

  // Bootstrap — delegates to reader-bootstrap.ts ----------------------------
  async init(): Promise<void> {
    return boot.initReaderSession(this);
  }

  retry(): void {
    boot.retryReaderSession(this);
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
