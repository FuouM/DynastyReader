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
import { showBanner, setActions } from "../stores/topbar";
import { convertFileSrc } from "../ipc";
import { t } from "../i18n";
import { toggleTheme as toggleThemeStore } from "../stores/theme";
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

export function createReaderSession(route: Route): ReaderSession {
  return new ReaderSession(route);
}
export class ReaderSession implements ReaderQueueHost, ReaderActionsController {
  readonly permalink: string;
  readonly route: Route;
  private state: ReaderState;

  // Delegating accessors — all reactive state lives in `createReaderState()`.
  // Getters return the underlying signal/store accessors so call-sites stay
  // `session.foo()` / `session.setFoo(v)` with zero duplication.
  get seriesPermalink(): () => string | null { return this.state.seriesPermalink; }
  get setSeriesPermalink(): (val: string | null) => void { return this.state.setSeriesPermalink; }
  get seriesType(): () => string | null { return this.state.seriesType; }
  get setSeriesType(): (val: string | null) => void { return this.state.setSeriesType; }
  get seriesName(): () => string { return this.state.seriesName; }
  get setSeriesName(): (val: string) => void { return this.state.setSeriesName; }
  get chapterPermalink(): () => string { return this.state.chapterPermalink; }
  get setChapterPermalink(): (val: string) => void { return this.state.setChapterPermalink; }
  get chapterTitle(): () => string { return this.state.chapterTitle; }
  get setChapterTitle(): (val: string) => void { return this.state.setChapterTitle; }
  get chapterList(): () => ChapterRef[] { return this.state.chapterList; }
  get setChapterList(): (val: ChapterRef[]) => void { return this.state.setChapterList; }
  get pages(): () => ChapterPage[] { return this.state.pages; }
  get setPages(): (val: ChapterPage[]) => void { return this.state.setPages; }
  get currentIndex(): () => number { return this.state.currentIndex; }
  get setCurrentIndex(): (val: number) => void { return this.state.setCurrentIndex; }
  get atEnd(): () => boolean { return this.state.atEnd; }
  get setAtEnd(): (val: boolean) => void { return this.state.setAtEnd; }
  get mode(): () => ReaderMode { return this.state.mode; }
  get setModeSignal(): (val: ReaderMode) => void { return this.state.setModeSignal; }
  get pagedLayout(): () => PagedLayout { return this.state.pagedLayout; }
  get setPagedLayoutSignal(): (val: PagedLayout) => void { return this.state.setPagedLayoutSignal; }
  get layoutAutoDetected(): () => boolean { return this.state.layoutAutoDetected; }
  get setLayoutAutoDetected(): (val: boolean) => void { return this.state.setLayoutAutoDetected; }
  get isLongStrip(): () => boolean { return this.state.isLongStrip; }
  get setIsLongStrip(): (val: boolean) => void { return this.state.setIsLongStrip; }
  get direction(): () => ReadingDirection { return this.state.direction; }
  get setDirectionSignal(): (val: ReadingDirection) => void { return this.state.setDirectionSignal; }
  get directionAutoDetected(): () => boolean { return this.state.directionAutoDetected; }
  get setDirectionAutoDetected(): (val: boolean) => void { return this.state.setDirectionAutoDetected; }
  get coverOffset(): () => boolean { return this.state.coverOffset; }
  get setCoverOffsetSignal(): (val: boolean) => void { return this.state.setCoverOffsetSignal; }
  get widePages(): () => ReadonlySet<number> { return this.state.widePages; }
  get setWidePagesSignal(): (val: ReadonlySet<number> | ((prev: ReadonlySet<number>) => ReadonlySet<number>)) => void { return this.state.setWidePagesSignal; }
  get fitMode(): () => FitMode { return this.state.fitMode; }
  get setFitModeSignal(): (val: FitMode) => void { return this.state.setFitModeSignal; }
  get zoomScale(): () => number { return this.state.zoomScale; }
  get setZoomScaleSignal(): (val: number | ((prev: number) => number)) => void { return this.state.setZoomScaleSignal; }
  get scrollLock(): () => boolean { return this.state.scrollLock; }
  get setScrollLockSignal(): (val: boolean | ((prev: boolean) => boolean)) => void { return this.state.setScrollLockSignal; }
  get isFullscreen(): () => boolean { return this.state.isFullscreen; }
  get setIsFullscreenSignal(): (val: boolean) => void { return this.state.setIsFullscreenSignal; }
  get loading(): () => boolean { return this.state.loading; }
  get setLoading(): (val: boolean) => void { return this.state.setLoading; }
  get error(): () => string | null { return this.state.error; }
  get setError(): (val: string | null) => void { return this.state.setError; }
  get empty(): () => boolean { return this.state.empty; }
  get setEmpty(): (val: boolean) => void { return this.state.setEmpty; }
  get bookmarked(): () => boolean { return this.state.bookmarked; }
  get setBookmarked(): (val: boolean) => void { return this.state.setBookmarked; }
  get restoring(): () => boolean { return this.state.restoring; }
  get setRestoring(): (val: boolean) => void { return this.state.setRestoring; }
  get toolbarVisible(): () => boolean { return this.state.toolbarVisible; }
  get setToolbarVisible(): (val: boolean) => void { return this.state.setToolbarVisible; }
  get controlsOpen(): () => boolean { return this.state.controlsOpen; }
  get setControlsOpen(): (val: boolean) => void { return this.state.setControlsOpen; }
  private toolbarHideTimer: number | null = null;
  private priorFitMode: FitMode | null = null;
  get cachedPages(): ReturnType<typeof createStore<Record<number, string | undefined>>> { return this.state.cachedPages; }
  get slotStates(): ReturnType<typeof createStore<Record<number, SlotStateRecord | undefined>>> { return this.state.slotStates; }
  get pageDimensions(): ReturnType<typeof createStore<Record<number, { width: number; height: number } | undefined>>> { return this.state.pageDimensions; }
  get cachedCount(): () => number { return this.state.cachedCount; }
  get setCachedCount(): (val: number) => void { return this.state.setCachedCount; }
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
  // Toolbar show/hide animation lock — separate from isProgrammaticScroll so a
  // toolbar toggle does not leave page-progress tracking stale (RD-M3).
  isToolbarAnimating = false;
  toolbarAnimTimer: number | null = null;
  /** Invoked when the toolbar animation lock expires (set by useReaderGestures). */
  toolbarAnimEndHook: (() => void) | null = null;
  /** Registered by ReaderProgressWrap; focuses the page-jump input (QoL-R2). */
  pageJumpFocusHook: (() => void) | null = null;
  private fullscreenRelayoutTimers: number[] = [];
  private readonly cleanupFns: (() => void)[] = [];
  containerTagPermalink: string | null = null;
  containerTagType: string | null = null;
  chapterListPromise: Promise<ChapterRef[]> | null = null;
  private actionsDispose: (() => void) | null = null;
  private readonly sessionOwner = getOwner();
  get isHorizontal(): () => boolean { return this.state.isHorizontal; }
  get isSpread(): () => boolean { return this.state.isSpread; }
  get spreads(): () => SpreadGroup[] { return this.state.spreads; }
  get slideIndex(): () => number { return this.state.slideIndex; }
  get progress(): () => {
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
  } { return this.state.progress; }
  get chapterNav(): () => {
    prevDisabled: boolean;
    nextDisabled: boolean;
  } { return this.state.chapterNav; }
  get chapterNavigating(): () => boolean { return this.state.chapterNavigating; }
  get setChapterNavigating(): (val: boolean) => void { return this.state.setChapterNavigating; }

  constructor(route: Route) {
    this.route = route;
    this.permalink = route.chapterPermalink ?? "";
    this.state = createReaderState();
    this.queue = new ReaderQueue(this);
    this.persistence = createReaderPersistence(this.state, this.permalink);
  }
  // ReaderQueueHost interface implementation (method wrappers for signal accessors)
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

  /** Internal property accessor used by reader lifecycle guards (RD-M3). */
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
        this.imgErrorCount.delete(index);
        this.setPageDimension(index, img.naturalWidth, img.naturalHeight);
      } else {
        img.onload = () => {
          if (!this.disposedFlag) {
            this.imgErrorCount.delete(index);
            this.setPageDimension(index, img.naturalWidth, img.naturalHeight);
          }
        };
      }
    }
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
    if (this.toolbarAnimTimer !== null) {
      clearTimeout(this.toolbarAnimTimer);
      this.toolbarAnimTimer = null;
    }
    this.isToolbarAnimating = false;
    this.toolbarAnimEndHook = null;
    this.clearFullscreenRelayoutTimers();
    for (const fn of this.cleanupFns) fn();
    this.cleanupFns.length = 0;
    // Drop all slot DOM refs so detached elements are not pinned (RD-H1).
    this.slotEls.length = 0;
    this.spreadSlotEls.length = 0;
    if (this.actionsDispose) {
      this.actionsDispose();
      this.actionsDispose = null;
    }
    setActions(null);
  }

  recountCached(): void {
    this.setCachedCount(Object.keys(this.cachedPages[0]).length);
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
    // 4. Preload previous spread if uncached
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

  private applyFitClass(fit: FitMode): void {
    if (this.containerEl) {
      this.containerEl.classList.remove("fit-width", "fit-height", "fit-original");
      this.containerEl.classList.add(`fit-${fit}`);
    }
  }

  setFitMode(fit: FitMode): void {
    this.priorFitMode = null;
    this.setFitModeSignal(fit);
    setDefaultFitMode(fit);
    this.applyFitClass(fit);
    if (fit !== "original") {
      this.setZoomScaleSignal(1.0);
    }
    if (!this.isHorizontal()) {
      this.updateSlotClearances();
    } else {
      this.resetToCurrentPage(false);
    }
  }

  /**
   * On-screen scale of the current page image relative to its natural size.
   * Used to keep visual size continuous when pinch/ctrl+wheel transitions a
   * fit mode into the zoomed (original-size) rendering state.
   */
  private displayScaleFactor(): number {
    const slot = this.slotEls[this.currentIndex()];
    const img = slot?.querySelector("img.ds-page-img") as HTMLImageElement | null | undefined;
    if (img && img.naturalWidth > 0 && img.clientWidth > 0) {
      const f = img.clientWidth / img.naturalWidth;
      if (isFinite(f) && f > 0) return f;
    }
    return 1;
  }

  /** Current effective on-screen zoom (fit modes report their display scale). */
  effectiveZoomScale(): number {
    return this.fitMode() === "original" ? this.zoomScale() : this.displayScaleFactor();
  }

  /**
   * Switch to the zoomed (original-size) rendering state without persisting a
   * new default fit mode, preserving the current on-screen page size.
   */
  private enterZoomedFit(): void {
    if (this.fitMode() === "original") return;
    this.priorFitMode = this.fitMode();
    const factor = Math.max(0.25, Math.min(4, this.displayScaleFactor()));
    this.setFitModeSignal("original");
    this.applyFitClass("original");
    this.setZoomScaleSignal(factor);
    if (!this.isHorizontal()) {
      requestAnimationFrame(() => this.updateSlotClearances());
    } else {
      this.resetToCurrentPage(false);
    }
  }

  private exitZoomedFit(): void {
    const prior = this.priorFitMode;
    this.priorFitMode = null;
    if (prior && prior !== "original") {
      this.setFitModeSignal(prior);
      this.applyFitClass(prior);
      this.setZoomScaleSignal(1.0);
      if (!this.isHorizontal()) {
        requestAnimationFrame(() => this.updateSlotClearances());
      } else {
        this.resetToCurrentPage(false);
      }
    }
  }

  /** Multiplicative zoom (trackpad ctrl+wheel / pinch) in any fit mode. */
  zoomByFactor(f: number): void {
    if (!isFinite(f) || f <= 0) return;
    const baseScale = this.displayScaleFactor();
    if (this.fitMode() !== "original") {
      // Already at (or below) fitted size — zooming out further is a no-op.
      if (f <= 1) return;
      this.enterZoomedFit();
    }
    const newScale = this.zoomScale() * f;
    if (this.priorFitMode && newScale <= baseScale) {
      this.exitZoomedFit();
      return;
    }
    this.setZoomScaleClamped(newScale);
  }

  /** Absolute zoom target for two-finger pinch in any fit mode. */
  applyPinchZoom(target: number): void {
    if (!isFinite(target)) return;
    const baseScale = this.displayScaleFactor();
    if (this.fitMode() !== "original") {
      if (target <= baseScale) return;
      this.enterZoomedFit();
    } else if (this.priorFitMode && target <= baseScale) {
      this.exitZoomedFit();
      return;
    }
    this.setZoomScaleClamped(target);
  }

  setZoomScaleClamped(scale: number): void {
    const clamped = Math.max(0.25, Math.min(4, scale));
    if (Math.abs(clamped - this.zoomScale()) < 0.0001) return;
    this.setZoomScaleSignal(clamped);
    if (!this.isHorizontal()) {
      requestAnimationFrame(() => this.updateSlotClearances());
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
    if (!this.isHorizontal()) {
      requestAnimationFrame(() => this.updateSlotClearances());
    }
  }

  zoomOut(): void {
    if (this.fitMode() !== "original") return;
    this.setZoomScaleSignal((prev) => Math.max(0.25, Math.round((prev - 0.1) * 10) / 10));
    if (!this.isHorizontal()) {
      requestAnimationFrame(() => this.updateSlotClearances());
    }
  }

  resetZoom(): void {
    if (this.fitMode() !== "original") return;
    if (this.priorFitMode) {
      this.exitZoomedFit();
      return;
    }
    this.setZoomScaleSignal(1.0);
    if (!this.isHorizontal()) {
      requestAnimationFrame(() => this.updateSlotClearances());
    }
  }
  toggleTheme(): void {
    toggleThemeStore();
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
    this.clearFullscreenRelayoutTimers();
    this.fullscreenRelayoutTimers.push(
      window.setTimeout(() => this.resetToCurrentPage(false), FULLSCREEN_RELAYOUT_FIRST_MS),
      window.setTimeout(() => this.resetToCurrentPage(false), FULLSCREEN_RELAYOUT_SECOND_MS),
    );
  }

  private clearFullscreenRelayoutTimers(): void {
    for (const id of this.fullscreenRelayoutTimers) clearTimeout(id);
    this.fullscreenRelayoutTimers.length = 0;
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
  scheduleToolbarAutoHide(delayMs = 3000): void {
    this.clearToolbarTimer();
    this.toolbarHideTimer = window.setTimeout(() => {
      if (!this.disposedFlag && this.toolbarVisible()) {
        this.setToolbarVisible(false);
      }
      this.toolbarHideTimer = null;
    }, delayMs);
  }

  clearToolbarTimer(): void {
    if (this.toolbarHideTimer !== null) {
      window.clearTimeout(this.toolbarHideTimer);
      this.toolbarHideTimer = null;
    }
  }

  toggleToolbarVisible(): void {
    if (!this.isHorizontal()) {
      // Lock scroll-driven page tracking for the toolbar animation only, then
      // recompute the current page once the layout has settled (RD-M3).
      this.isToolbarAnimating = true;
      if (this.toolbarAnimTimer !== null) {
        clearTimeout(this.toolbarAnimTimer);
      }
      this.toolbarAnimTimer = window.setTimeout(() => {
        this.isToolbarAnimating = false;
        this.toolbarAnimTimer = null;
        this.toolbarAnimEndHook?.();
      }, 260);
    }
    this.setToolbarVisible(!this.toolbarVisible());
    this.clearToolbarTimer();
  }

  /** Reveal the toolbar (if hidden) and focus the page-jump input (QoL-R2). */
  focusPageJump(): void {
    if (!this.toolbarVisible()) this.setToolbarVisible(true);
    requestAnimationFrame(() => this.pageJumpFocusHook?.());
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
