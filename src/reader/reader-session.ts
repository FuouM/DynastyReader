/**
 * Reactive reader session for the Solid reader.
 *
 * Coordinates one chapter-reading session: owns every piece of reactive
 * state and orchestrates the download queue, persistence, chapter navigation,
 * and topbar actions. DOM viewport operations (slide/reset/layout) are
 * delegated to reader-viewport.ts.
 */

import { batch, createComponent, createRoot, createSignal, getOwner, runWithOwner } from "solid-js";
import { showBanner, setActions } from "../stores/topbar";
import { convertFileSrc } from "../ipc";
import { t } from "../i18n";
import { toggleTheme as toggleThemeStore } from "../stores/theme";
import type { ChapterRef, Route } from "../types/routes";
import type {
  FitMode,
  PagedLayout,
  ReaderMode,
  ReadingDirection,
} from "../types/reader";
import { anchorPageOf, spreadIndexOf } from "./reader-spread";
import { ReaderQueue, type ReaderQueueHost, type SlotStateKind } from "./reader-queue";
import {
  getPrefetchBuffer,
  isReaderPrefetchEnabled,
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
import { createReaderState, type ReaderState } from "./reader-state";
import { createReaderPersistence, type ReaderPersistence } from "./reader-persistence";
import { log } from "../utils/log";
import { ReaderActions, type ReaderActionsController } from "../components/ReaderActions";

const FULLSCREEN_RELAYOUT_FIRST_MS = 60;
const FULLSCREEN_RELAYOUT_SECOND_MS = 180;

export function createReaderSession(route: Route): ReaderSession {
  return new ReaderSession(route);
}
export interface ReaderSession extends ReaderState {}
export class ReaderSession implements ReaderQueueHost, ReaderActionsController {
  readonly permalink: string;
  readonly route: Route;
  readonly state: ReaderState;
  private toolbarHideTimer: number | null = null;
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
  private slotObserver: IntersectionObserver | null = null;
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
  /** Invoked to force synchronous computation of current page from scroll position. */
  computeScrollProgress: (() => void) | null = null;
  private fullscreenRelayoutTimers: number[] = [];
  private readonly cleanupFns: (() => void)[] = [];
  containerTagPermalink: string | null = null;
  containerTagType: string | null = null;
  chapterListPromise: Promise<ChapterRef[]> | null = null;
  /** Sticky MangaDex scanlator group id for adjacent chapter preference (Decision 3D). */
  readonly activeScanlatorGroup: () => string | null;
  readonly setActiveScanlatorGroup: (v: string | null) => void;
  private actionsDispose: (() => void) | null = null;
  private readonly sessionOwner = getOwner();
  constructor(route: Route) {
    this.route = route;
    this.permalink = route.chapterPermalink ?? "";
    this.state = createReaderState();
    Object.assign(this, this.state);
    const [scanlatorGroup, setScanlatorGroup] = createSignal<string | null>(null);
    this.activeScanlatorGroup = scanlatorGroup;
    this.setActiveScanlatorGroup = setScanlatorGroup;
    this.queue = new ReaderQueue(this);
    this.persistence = createReaderPersistence(this.state, this.permalink);
  }
  /** Internal property accessor used by reader lifecycle guards (RD-M3). */
  get disposed(): boolean {
    return this.disposedFlag;
  }

  getCachedPath(index: number): string | undefined {
    return this.cachedPages[0][index];
  }

  setCachedPath(index: number, path: string): void {
    if (this.cachedPages[0][index] === path) {
      return;
    }
    this.retrying.delete(index);
    this.cachedPages[1](index, path);
    this.slotStates[1](index, undefined);
    this.recountCached();
    if (typeof window !== "undefined") {
      const img = new Image();
      img.src = convertFileSrc(path);
      if (typeof img.decode === "function") {
        img.decode().then(() => {
          if (!this.disposedFlag && img.naturalWidth > 0) {
            this.imgErrorCount.delete(index);
            this.setPageDimension(index, img.naturalWidth, img.naturalHeight);
          }
        }).catch(() => {
          if (img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
            this.imgErrorCount.delete(index);
            this.setPageDimension(index, img.naturalWidth, img.naturalHeight);
          }
        });
      } else if (img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
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
    this.computeScrollProgress = null;
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
    if (this.slotObserver) {
      this.slotObserver.disconnect();
      this.slotObserver = null;
    }
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
    if (index < 0 || index >= this.pages().length) return;
    if (this.getCachedPath(index) !== undefined) return;
    const slotState = this.slotStates[0][index];
    if (
      !this.queue.isFailed(index) &&
      slotState?.kind === "idle"
    ) {
      this.setSlotState(index, "spinner", t("reader.session.slotState.downloading"));
    }
    this.queue.enqueue(index, priority);
  }

  observeSlot(el: HTMLElement): void {
    if (this.isHorizontal() || this.disposedFlag || typeof IntersectionObserver === "undefined") return;
    if (!this.slotObserver) {
      this.slotObserver = new IntersectionObserver(
        (entries) => {
          if (this.isHorizontal() || this.disposedFlag) return;
          const prefetchEnabled = isReaderPrefetchEnabled();
          const prefetchCount = prefetchEnabled ? Math.max(1, getPrefetchBuffer()) : 0;
          let anyEnqueued = false;

          for (const entry of entries) {
            if (entry.isIntersecting) {
              const idx = Number((entry.target as HTMLElement).dataset.index);
              if (!Number.isNaN(idx)) {
                if (this.getCachedPath(idx) === undefined) {
                  this.enqueue(idx, true);
                  anyEnqueued = true;
                }
                if (prefetchEnabled) {
                  for (let offset = 1; offset <= prefetchCount; offset++) {
                    const nextIdx = idx + offset;
                    if (nextIdx < this.pages().length && this.getCachedPath(nextIdx) === undefined) {
                      this.enqueue(nextIdx, true);
                      anyEnqueued = true;
                    }
                  }
                }
              }
            }
          }
          if (anyEnqueued) {
            this.queue.resort();
          }
        },
        {
          root: this.viewportEl ?? undefined,
          rootMargin: "3000px 0px 3000px 0px",
          threshold: 0.01,
        },
      );
    }
    this.slotObserver.observe(el);
  }

  unobserveSlot(el: HTMLElement): void {
    if (this.slotObserver) {
      this.slotObserver.unobserve(el);
    }
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
  get lastPersistedIndex(): number {
    return this.persistence.lastPersistedIndex;
  }
  set lastPersistedIndex(v: number) {
    this.persistence.lastPersistedIndex = v;
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
      this.prioritizeReadingWindow(index);
    }
    this.slideTo(index, instant, scrollToBottom);
  }

  setPageFromScroll(index: number): void {
    const clamped = Math.max(0, Math.min(index, this.pages().length - 1));
    if (this.pages().length === 0) return;
    this.updateIndexAndNotifyEnd(clamped);
    this.schedulePersist();
    if (this.atEnd()) void this.persistNow();
    if (!this.isSpread()) {
      this.prioritizeReadingWindow(clamped);
    }
  }

  /** Prioritizes immediate reading window and nearby pages for instant loading. */
  prioritizeReadingWindow(index: number): void {
    const pageCount = this.pages().length;
    if (pageCount === 0) return;
    let anyEnqueued = false;
    // 1. Current page: highest priority (always loaded)
    if (this.getCachedPath(index) === undefined) {
      this.enqueue(index, true);
      anyEnqueued = true;
    }
    // 2. Prefetch upcoming pages ahead if Read Pre-Fetch is enabled
    if (isReaderPrefetchEnabled()) {
      const prefetchCount = Math.max(1, getPrefetchBuffer());
      for (let offset = 1; offset <= prefetchCount; offset++) {
        const nextIdx = index + offset;
        if (nextIdx < pageCount && this.getCachedPath(nextIdx) === undefined) {
          this.enqueue(nextIdx, true);
          anyEnqueued = true;
        }
      }
      for (let offset = 1; offset <= Math.min(2, prefetchCount); offset++) {
        const prevIdx = index - offset;
        if (prevIdx >= 0 && this.getCachedPath(prevIdx) === undefined) {
          this.enqueue(prevIdx, true);
          anyEnqueued = true;
        }
      }
    }
    if (anyEnqueued) {
      this.queue.resort();
    }
  }

  /** Enqueues spreads near the current position, respecting read prefetch settings. */
  private enqueueSpreadNeighborhood(): void {
    if (this.spreads().length === 0) return;
    const cur = spreadIndexOf(this.spreads(), this.currentIndex());
    const prefetchEnabled = isReaderPrefetchEnabled();
    const prefetchCount = prefetchEnabled ? Math.max(1, getPrefetchBuffer()) : 0;
    const spreadsAhead = Math.ceil(prefetchCount / 2);
    const end = Math.min(this.spreads().length - 1, cur + spreadsAhead);
    // 1. Enqueue active spread pages with top priority
    const active = this.spreads()[cur];
    if (active) {
      for (const pageIndex of active.pageIndices) {
        if (this.getCachedPath(pageIndex) === undefined) {
          this.enqueue(pageIndex, true);
        }
      }
    }

    if (!prefetchEnabled) return;
    // 2. Enqueue immediate next spread with priority so next page turn is instant
    if (cur + 1 < this.spreads().length) {
      const next = this.spreads()[cur + 1];
      for (const pageIndex of next.pageIndices) {
        if (this.getCachedPath(pageIndex) === undefined) {
          this.enqueue(pageIndex, true);
        }
      }
    }

    // 3. Prefetch further upcoming spreads with priority
    for (let s = cur + 2; s <= end; s++) {
      const spread = this.spreads()[s];
      if (spread) {
        for (const pageIndex of spread.pageIndices) {
          if (this.getCachedPath(pageIndex) === undefined) {
            this.enqueue(pageIndex, true);
          }
        }
      }
    }
    // 4. Preload previous spread if uncached
    if (cur > 0) {
      const prev = this.spreads()[cur - 1];
      if (prev) {
        for (const pageIndex of prev.pageIndices) {
          if (this.getCachedPath(pageIndex) === undefined) {
            this.enqueue(pageIndex, true);
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
  /** Returns true if stepSpread(delta) would actually navigate to a new spread. */
  canStepSpread(delta: 1 | -1): boolean {
    if (!this.isSpread() || this.spreads().length === 0) return false;
    const cur = spreadIndexOf(this.spreads(), this.currentIndex());
    const next = cur + delta;
    return next >= 0 && next < this.spreads().length;
  }


  // Layout controls ---------------------------------------------------------
  setMode(mode: ReaderMode): void {
    if (mode === this.mode()) return;
    if (mode === "paged" && this.slotObserver) {
      this.slotObserver.disconnect();
      this.slotObserver = null;
    }
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

  applyFitClass(fit: FitMode): void {
    if (this.containerEl) {
      this.containerEl.classList.remove("fit-width", "fit-height", "fit-original");
      this.containerEl.classList.add(`fit-${fit}`);
    }
  }

  setFitMode(fit: FitMode): void {
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


  /** Multiplicative zoom (trackpad ctrl+wheel / pinch) in original fit mode only. */
  zoomByFactor(f: number): void {
    if (this.fitMode() !== "original") return;
    if (!isFinite(f) || f <= 0) return;
    this.setZoomScaleClamped(this.zoomScale() * f);
  }

  /** Absolute zoom target for two-finger pinch in original fit mode only. */
  applyPinchZoom(target: number): void {
    if (this.fitMode() !== "original") return;
    if (!isFinite(target)) return;
    this.setZoomScaleClamped(target);
  }

  setZoomScaleClamped(scale: number): void {
    const clamped = Math.max(0.25, Math.min(4, scale));
    if (Math.abs(clamped - this.zoomScale()) < 0.0001) return;
    this.setZoomScaleSignal(clamped);
    if (!this.isHorizontal()) {
      if (typeof requestAnimationFrame !== "undefined") {
        requestAnimationFrame(() => this.updateSlotClearances());
      } else {
        this.updateSlotClearances();
      }
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
    if (width > 0 && height > 0 && this.estimatedAspectRatio() === 0) {
      this.setEstimatedAspectRatio(width / height);
    }
    if (index === 0) {
      this.updateFirstSlotHeight();
    }
    if (index === this.pages().length - 1) {
      this.updateLastSlotHeight();
    }
    if (this.restoring() && !this.isHorizontal()) {
      this.slideTo(this.currentIndex(), true);
    }
  }

  zoomIn(): void {
    if (this.fitMode() !== "original") return;
    this.setZoomScaleSignal((prev) => Math.min(3.0, Math.round((prev + 0.1) * 10) / 10));
    if (!this.isHorizontal()) {
      if (typeof requestAnimationFrame !== "undefined") {
        requestAnimationFrame(() => this.updateSlotClearances());
      } else {
        this.updateSlotClearances();
      }
    }
  }

  zoomOut(): void {
    if (this.fitMode() !== "original") return;
    this.setZoomScaleSignal((prev) => Math.max(0.25, Math.round((prev - 0.1) * 10) / 10));
    if (!this.isHorizontal()) {
      if (typeof requestAnimationFrame !== "undefined") {
        requestAnimationFrame(() => this.updateSlotClearances());
      } else {
        this.updateSlotClearances();
      }
    }
  }

  resetZoom(): void {
    if (this.fitMode() !== "original") return;
    this.setZoomScaleSignal(1.0);
    if (!this.isHorizontal()) {
      if (typeof requestAnimationFrame !== "undefined") {
        requestAnimationFrame(() => this.updateSlotClearances());
      } else {
        this.updateSlotClearances();
      }
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
    if (typeof requestAnimationFrame !== "undefined") {
      requestAnimationFrame(() => this.pageJumpFocusHook?.());
    } else {
      this.pageJumpFocusHook?.();
    }
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
        bookmarked: () => this.bookmarked(),
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
