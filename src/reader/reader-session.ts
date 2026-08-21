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

import { batch, createMemo, createSignal } from "solid-js";
import { createStore } from "solid-js/store";
import {
  navigate,
  setBanner,
  showBanner,
  setActions,
  clearActions,
  isOnline,
} from "../stores";
import { toggleAppTheme } from "../stores/theme";
import { fetchChapter, fetchSeries } from "../api";
import {
  addHistory,
  getBookmark,
  getCachedPages,
  getReadingProgress,
  setReadingProgress,
} from "../db";
import type { Chapter, ChapterPage } from "../types/api";
import type { ChapterRef, Route } from "../types/routes";
import type {
  FitMode,
  PagedLayout,
  ReaderMode,
  ReadingDirection,
  SpreadGroup,
} from "../types/reader";
import {
  anchorPageOf,
  computeSpreads,
  detectReadingDirection,
  spreadIndexOf,
} from "./reader-spread";
import { ReaderQueue, type ReaderQueueHost, type SlotStateKind } from "./reader-queue-solid";
import {
  getPrefetchBuffer,
  isAutoCacheChapterEnabled,
} from "./settings";
import { standardizeCachePaths } from "./path-migration";
import { ReaderActions } from "../components/ReaderActions";

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

  // Loaded data ------------------------------------------------------------
  readonly seriesPermalink: () => string | null;
  readonly setSeriesPermalink: (val: string | null) => void;

  readonly seriesName: () => string;
  readonly setSeriesName: (val: string) => void;

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

  // Reactive cache / slot state (index -> path / {kind, message}) -----------
  readonly cachedPages: ReturnType<typeof createStore<Record<number, string | undefined>>>;
  readonly slotStates: ReturnType<typeof createStore<Record<number, SlotStateRecord | undefined>>>;

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

  // Persistence / scroll bookkeeping ---------------------------------------
  private lastPersistedIndex = -1;
  private persistTimer: number | undefined;
  private disposedFlag = false;
  isProgrammaticScroll = false;
  programmaticScrollTimer: number | null = null;
  scrollRaf: number | null = null;
  private readonly cleanupFns: (() => void)[] = [];

  // Derived state -----------------------------------------------------------
  readonly isHorizontal: () => boolean;
  readonly isSpread: () => boolean;
  readonly spreads: () => SpreadGroup[];
  readonly slideIndex: () => number;
  readonly progress: () => {
    full: string;
    short: string;
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

    const [seriesPermalink, setSeriesPermalink] = createSignal<string | null>(null);
    this.seriesPermalink = seriesPermalink;
    this.setSeriesPermalink = setSeriesPermalink;

    const [seriesName, setSeriesName] = createSignal("");
    this.seriesName = seriesName;
    this.setSeriesName = setSeriesName;

    const [chapterTitle, setChapterTitle] = createSignal("");
    this.chapterTitle = chapterTitle;
    this.setChapterTitle = setChapterTitle;

    const [chapterList, setChapterList] = createSignal<ChapterRef[]>([]);
    this.chapterList = chapterList;
    this.setChapterList = setChapterList;

    const [pages, setPages] = createSignal<ChapterPage[]>([]);
    this.pages = pages;
    this.setPages = setPages;

    const [currentIndex, setCurrentIndex] = createSignal(0);
    this.currentIndex = currentIndex;
    this.setCurrentIndex = setCurrentIndex;

    const [atEnd, setAtEnd] = createSignal(false);
    this.atEnd = atEnd;
    this.setAtEnd = setAtEnd;

    const [mode, setModeSignal] = createSignal<ReaderMode>("scroll");
    this.mode = mode;
    this.setModeSignal = setModeSignal;

    const [pagedLayout, setPagedLayoutSignal] = createSignal<PagedLayout>("single");
    this.pagedLayout = pagedLayout;
    this.setPagedLayoutSignal = setPagedLayoutSignal;

    const [direction, setDirectionSignal] = createSignal<ReadingDirection>("rtl");
    this.direction = direction;
    this.setDirectionSignal = setDirectionSignal;

    const [directionAutoDetected, setDirectionAutoDetected] = createSignal(false);
    this.directionAutoDetected = directionAutoDetected;
    this.setDirectionAutoDetected = setDirectionAutoDetected;

    const [coverOffset, setCoverOffsetSignal] = createSignal(false);
    this.coverOffset = coverOffset;
    this.setCoverOffsetSignal = setCoverOffsetSignal;

    const [widePages, setWidePagesSignal] = createSignal<ReadonlySet<number>>(new Set());
    this.widePages = widePages;
    this.setWidePagesSignal = setWidePagesSignal;

    const [fitMode, setFitModeSignal] = createSignal<FitMode>("width");
    this.fitMode = fitMode;
    this.setFitModeSignal = setFitModeSignal;

    const [zoomScale, setZoomScaleSignal] = createSignal(1.0);
    this.zoomScale = zoomScale;
    this.setZoomScaleSignal = setZoomScaleSignal;

    const [scrollLock, setScrollLockSignal] = createSignal(false);
    this.scrollLock = scrollLock;
    this.setScrollLockSignal = setScrollLockSignal;

    const [isFullscreen, setIsFullscreenSignal] = createSignal(false);
    this.isFullscreen = isFullscreen;
    this.setIsFullscreenSignal = setIsFullscreenSignal;

    const [loading, setLoading] = createSignal(true);
    this.loading = loading;
    this.setLoading = setLoading;

    const [error, setError] = createSignal<string | null>(null);
    this.error = error;
    this.setError = setError;

    const [empty, setEmpty] = createSignal(false);
    this.empty = empty;
    this.setEmpty = setEmpty;

    const [bookmarked, setBookmarked] = createSignal(false);
    this.bookmarked = bookmarked;
    this.setBookmarked = setBookmarked;

    const [restoring, setRestoring] = createSignal(false);
    this.restoring = restoring;
    this.setRestoring = setRestoring;

    this.cachedPages = createStore<Record<number, string | undefined>>({});
    this.slotStates = createStore<Record<number, SlotStateRecord | undefined>>({});

    const [cachedCount, setCachedCount] = createSignal(0);
    this.cachedCount = cachedCount;
    this.setCachedCount = setCachedCount;

    this.queue = new ReaderQueue(this);

    this.isHorizontal = createMemo(() => this.mode() === "paged");
    this.isSpread = createMemo(
      () => this.mode() === "paged" && this.pagedLayout() === "spread",
    );
    this.spreads = createMemo<SpreadGroup[]>(() =>
      computeSpreads(this.pages().length, this.coverOffset(), (i) =>
        this.widePages().has(i),
      ),
    );
    this.slideIndex = createMemo(() =>
      this.isSpread() ? spreadIndexOf(this.spreads(), this.currentIndex()) : this.currentIndex(),
    );

    this.progress = createMemo(() => {
      const total = this.pages().length;
      const idx = this.currentIndex();
      const pct = total > 0 ? Math.round(((idx + 1) / total) * 100) : 0;
      const count = this.cachedCount();
      const cachedNote = count > 0 ? `${count}/${total} cached` : "";

      let fullPageStr = `Page ${idx + 1} of ${total}`;
      let shortPageStr = `${idx + 1} / ${total}`;
      if (this.isSpread() && this.spreads().length > 0) {
        const group = this.spreads()[spreadIndexOf(this.spreads(), idx)];
        if (group && group.pageIndices.length > 1) {
          const first = group.pageIndices[0] + 1;
          const last = group.pageIndices[group.pageIndices.length - 1] + 1;
          fullPageStr = `Pages ${first}–${last} of ${total}`;
          shortPageStr = `${first}–${last} / ${total}`;
        } else if (group) {
          const first = group.pageIndices[0] + 1;
          fullPageStr = `Page ${first} of ${total}`;
          shortPageStr = `${first} / ${total}`;
        }
      }

      let prevDisabled = false;
      let nextDisabled = false;
      if (this.isSpread() && this.spreads().length > 0) {
        const cur = spreadIndexOf(this.spreads(), idx);
        prevDisabled = cur <= 0;
        nextDisabled = cur >= this.spreads().length - 1;
      } else {
        prevDisabled = idx <= 0;
        nextDisabled = idx >= total - 1;
      }

      return {
        full: fullPageStr,
        short: shortPageStr,
        pct,
        width: pct,
        cachedNote,
        title: `${fullPageStr} (${pct}%)${cachedNote ? ` · ${cachedNote}` : ""}`,
        prevDisabled,
        nextDisabled,
      };
    });

    this.chapterNav = createMemo(() => {
      const curIdx = this.chapterList().findIndex((c) => c.permalink === this.permalink);
      return {
        prevDisabled: curIdx <= 0,
        nextDisabled: curIdx < 0 || curIdx >= this.chapterList().length - 1,
      };
    });
  }

  // ReaderQueueHost compatibility -------------------------------------------
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

  dispose(): void {
    this.disposedFlag = true;
    window.clearTimeout(this.persistTimer);
    if (this.programmaticScrollTimer !== null) clearTimeout(this.programmaticScrollTimer);
    for (const fn of this.cleanupFns) fn();
    this.cleanupFns.length = 0;
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
        this.setSlotState(index, "spinner", "Downloading…");
      }
    }
    this.queue.enqueue(index, priority);
  }

  /** Image-load failure: drop the cached path and re-download the page. */
  onPageImgError(index: number): void {
    this.cachedPages[1](index, undefined);
    if (this.retrying.has(index)) return;
    this.retrying.add(index);
    this.setSlotState(index, "spinner", "Re-downloading…");
    this.queue.enqueue(index, true);
  }

  /** Slot Retry button: clears the failure and re-queues the page. */
  retrySlot(index: number): void {
    this.queue.clearFailed(index);
    this.setSlotState(index, "spinner", "Downloading…");
    this.queue.enqueue(index);
  }

  // Progress + persistence --------------------------------------------------
  schedulePersist(): void {
    window.clearTimeout(this.persistTimer);
    this.persistTimer = window.setTimeout(() => void this.persistNow(), 400);
  }

  async persistNow(): Promise<void> {
    if (this.lastPersistedIndex === this.currentIndex() && !this.atEnd()) return;
    this.lastPersistedIndex = this.currentIndex();
    try {
      await setReadingProgress({
        chapterPermalink: this.permalink,
        seriesPermalink: this.seriesPermalink() ?? "",
        seriesName: this.seriesName() ?? "",
        chapterTitle: this.chapterTitle(),
        pageIndex: this.currentIndex(),
        pageTotal: this.pages().length,
        completed: this.atEnd(),
      });
    } catch (err) {
      console.error("dynasty-scans: failed to persist reading progress:", err);
    }
  }

  setPage(index: number, instant = false, scrollToBottom = false): void {
    if (index < 0 || index >= this.pages().length) return;
    batch(() => {
      this.setCurrentIndex(index);
      this.setAtEnd(index >= this.pages().length - 1);
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
      this.setCurrentIndex(index);
      this.setAtEnd(index >= this.pages().length - 1);
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
    localStorage.setItem("ds-reader-mode", mode === "paged" ? "paged" : "scroll");
    this.applyLayoutMode();
  }

  setPagedLayout(layout: PagedLayout): void {
    if (layout === this.pagedLayout()) return;
    this.setPagedLayoutSignal(layout);
    localStorage.setItem("ds-reader-layout", layout);
    this.applyLayoutMode();
  }

  setDirection(dir: ReadingDirection): void {
    this.setDirectionSignal(dir);
    if (!this.directionAutoDetected()) {
      localStorage.setItem("ds-reader-direction", dir);
    }
    if (this.isHorizontal()) {
      this.applyLayoutMode();
      this.resetToCurrentPage(true);
    }
  }

  toggleCoverOffset(): void {
    this.setCoverOffsetSignal(!this.coverOffset());
    localStorage.setItem("ds-reader-cover-offset", this.coverOffset() ? "1" : "0");
    if (this.isSpread()) {
      this.resetToCurrentPage(true);
    }
  }

  setFitMode(fit: FitMode): void {
    this.setFitModeSignal(fit);
    localStorage.setItem("ds-reader-fit", fit);
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
      localStorage.setItem("ds-reader-scroll-lock", next ? "1" : "0");
      return next;
    });
  }

  setWidePages(next: ReadonlySet<number>): void {
    this.setWidePagesSignal(next);
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
          void container?.requestFullscreen().catch(() => {});
        }
      } catch {}
    } else {
      try {
        if (document.fullscreenElement) {
          void document.exitFullscreen().catch(() => {});
        }
      } catch {}
    }
    this.resetToCurrentPage(false);
    setTimeout(() => this.resetToCurrentPage(false), 60);
    setTimeout(() => this.resetToCurrentPage(false), 180);
  }

  // Chapter navigation ------------------------------------------------------
  gotoChapter(c: ChapterRef): void {
    navigate({
      view: "reader",
      seriesPermalink: this.seriesPermalink() ?? undefined,
      seriesName: this.seriesName(),
      chapterPermalink: c.permalink,
      chapterTitle: c.title,
      chapterList: this.chapterList(),
    });
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
    }
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
          // Ensure transition is active then slide
          this.stripEl.style.transition = "";
          this.stripEl.style.transform = transformValue;
        }
      }
    } else {
      this.isProgrammaticScroll = true;
      if (this.programmaticScrollTimer !== null) clearTimeout(this.programmaticScrollTimer);
      this.programmaticScrollTimer = window.setTimeout(() => {
        this.isProgrammaticScroll = false;
      }, 500);

      const target = this.slotEls[index];
      if (target && this.viewportEl) {
        if (instant) {
          target.scrollIntoView({ behavior: "auto", block: "start" });
        } else {
          const vpRect = this.viewportEl.getBoundingClientRect();
          const targetRect = target.getBoundingClientRect();
          const targetTop = this.viewportEl.scrollTop + (targetRect.top - vpRect.top);
          this.viewportEl.scrollTo({ top: targetTop, behavior: "smooth" });
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
      if (this.programmaticScrollTimer !== null) clearTimeout(this.programmaticScrollTimer);
      this.programmaticScrollTimer = window.setTimeout(() => {
        this.isProgrammaticScroll = false;
      }, 350);

      const target = this.slotEls[this.currentIndex()];
      if (target && this.viewportEl) {
        if (!smooth) {
          target.scrollIntoView({ behavior: "auto", block: "start" });
        } else {
          const vpRect = this.viewportEl.getBoundingClientRect();
          const targetRect = target.getBoundingClientRect();
          const targetTop = this.viewportEl.scrollTop + (targetRect.top - vpRect.top);
          this.viewportEl.scrollTo({ top: targetTop, behavior: "smooth" });
        }
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
      this.stripEl.style.transition = "";
      const target = this.slotEls[this.currentIndex()];
      if (target) target.scrollIntoView({ block: "start" });
    }
  }

  // Publish topbar actions
  publishActions(): void {
    setActions(ReaderActions({ ctrl: this as any, bookmarked: this.bookmarked() }));
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
      const msg = err instanceof Error ? err.message : String(err);
      setBanner(`Failed to load chapter: ${msg}`);
      this.setError(msg);
      this.setLoading(false);
      return;
    }
    if (this.disposedFlag) return;

    const seriesTag = (chapter.tags ?? []).find((t) => t.type === "Series");
    this.setSeriesPermalink(seriesTag?.permalink ?? route.seriesPermalink ?? null);
    this.setSeriesName(seriesTag?.name ?? route.seriesName ?? chapter.title);
    this.setChapterTitle(chapter.title || route.chapterTitle || "Chapter");
    this.setChapterList(route.chapterList ?? []);
    this.setPages(chapter.pages ?? []);

    let startPage = route.startPage ?? 0;
    if (startPage <= 0) {
      try {
        const prog = await getReadingProgress(permalink);
        if (prog && prog.completed !== 1 && prog.page_index > 0) {
          startPage = prog.page_index;
        }
      } catch (err) {
        console.error("dynasty-scans: failed to load reading progress:", err);
      }
    }

    const pageCount = this.pages().length;
    if (pageCount === 0) {
      this.setEmpty(true);
      this.setLoading(false);
      return;
    }
    this.setCurrentIndex(Math.min(startPage, Math.max(0, pageCount - 1)));

    // Lazy series fetch if chapterList was empty
    if (this.chapterList().length === 0 && this.seriesPermalink()) {
      void fetchSeries(this.seriesPermalink()!).then((s) => {
        if (this.disposedFlag) return;
        const cl: ChapterRef[] = [];
        for (const t of s.taggings ?? []) {
          if (t.title && t.permalink) {
            cl.push({ title: t.title, permalink: t.permalink, released_on: t.released_on });
          }
        }
        if (cl.length > 0) {
          this.setChapterList(cl);
        }
        if (this.directionAutoDetected()) {
          const newDir = detectReadingDirection(chapter.tags ?? [], s.tags ?? []);
          if (newDir !== this.direction()) {
            this.setDirectionSignal(newDir);
            if (this.isSpread()) {
              this.resetToCurrentPage(true);
            }
          }
        }
      });
    }

    // Display-mode preferences
    this.setModeSignal(localStorage.getItem("ds-reader-mode") === "paged" ? "paged" : "scroll");
    this.setPagedLayoutSignal(localStorage.getItem("ds-reader-layout") === "spread" ? "spread" : "single");
    this.setCoverOffsetSignal(localStorage.getItem("ds-reader-cover-offset") === "1");
    
    const tagDir = detectReadingDirection(chapter.tags ?? []);
    if (tagDir === "ltr") {
      this.setDirectionSignal("ltr");
      this.setDirectionAutoDetected(true);
    } else {
      const dirPref = localStorage.getItem("ds-reader-direction");
      if (dirPref === "ltr" || dirPref === "rtl") {
        this.setDirectionSignal(dirPref);
        this.setDirectionAutoDetected(false);
      } else {
        this.setDirectionSignal("rtl");
        this.setDirectionAutoDetected(true);
      }
    }
    this.setFitModeSignal((localStorage.getItem("ds-reader-fit") as FitMode) || "width");
    this.setScrollLockSignal(localStorage.getItem("ds-reader-scroll-lock") === "1");

    // Restore cached page paths from SQLite
    let cachedRows: Awaited<ReturnType<typeof getCachedPages>> = [];
    try {
      cachedRows = await getCachedPages(permalink);
    } catch (err) {
      cachedRows = [];
      setBanner(
        `Page cache lookup failed: ${err instanceof Error ? err.message : String(err)}`,
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
        this.setSlotState(i, "offline", "Offline — not downloaded");
      } else if (autoCacheAll) {
        this.setSlotState(i, "spinner", "Queued for download…");
        this.enqueue(i);
      } else {
        this.setSlotState(i, "idle", "Waiting to read…");
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

    if (startPage > 0) {
      this.setPage(startPage, true);
      this.revealAfterRestore();
    }
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
    if (this.isHorizontal()) {
      this.setRestoring(false);
      return;
    }
    const deadline = window.performance.now() + 1000;
    const poll = (): void => {
      if (this.disposedFlag) return;
      let ready = true;
      const start = Math.max(0, this.currentIndex() - 1);
      const end = Math.min(this.pages().length - 1, this.currentIndex() + 1);
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
}
