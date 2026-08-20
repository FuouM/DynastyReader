import {
  Route,
  ChapterRef,
  isOnline,
  navigate,
  setActions,
  setBanner,
} from "../state";
import {
  fetchChapter,
  fetchSeries,
} from "../api";
import {
  addHistory,
  getBookmark,
  getCachedPages,
  getReadingProgress,
  setReadingProgress,
} from "../db";
import type { Chapter, ChapterPage } from "../types/api";
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
import { renderSlotImg, renderSlotState } from "./reader-slots";
import { standardizeCachePaths } from "./path-migration";
import { ReaderQueue } from "./reader-queue";
import { ReaderViewport } from "./reader-viewport";
import { ReaderToolbar } from "./reader-toolbar";
import { ReaderShortcuts } from "./reader-shortcuts";
import { mountLoading } from "../components/Loading";
import { ReaderActions } from "../components/ReaderActions";
import { isAutoCacheChapterEnabled, getPrefetchBuffer } from "./settings";

export { isAutoCacheChapterEnabled, setAutoCacheChapterEnabled, getPrefetchBuffer, setPrefetchBuffer } from "./settings";

/**
 * Coordinates one chapter-reading session: owns the shared DOM/state that the
 * queue, viewport, toolbar, and shortcuts modules operate on, and wires them
 * together once chapter metadata has loaded.
 */
export class ReaderController {
  // Shared reader state ---------------------------------------------------
  disposed = false;
  pages: ChapterPage[] = [];
  permalink = "";
  seriesPermalink: string | null = null;
  seriesName = "";
  chapterTitle = "";
  chapterList: ChapterRef[] = [];

  mode: ReaderMode = "scroll";
  pagedLayout: PagedLayout = "single";
  direction: ReadingDirection = "rtl";
  directionAutoDetected = false;
  coverOffset = false;
  widePages = new Set<number>();
  spreads: SpreadGroup[] = [];
  spreadSlots: HTMLElement[] = [];
  fitMode: FitMode = "width";
  zoomScale = 1.0;
  scrollLock = false;
  currentIndex = 0;
  isFullscreen = false;

  get isHorizontal(): boolean {
    return this.mode === "paged";
  }

  get isSpread(): boolean {
    return this.mode === "paged" && this.pagedLayout === "spread";
  }

  cachedMap = new Map<number, string>();
  cachedCount = 0;
  atEnd = false;
  lastPersistedIndex = -1;
  persistTimer: number | undefined;
  isProgrammaticScroll = false;
  programmaticScrollTimer: number | null = null;
  scrollRaf: number | null = null;

  // DOM -------------------------------------------------------------------
  container: HTMLElement;
  readerContainer!: HTMLElement;
  viewport!: HTMLElement;
  strip!: HTMLElement;
  slots: HTMLElement[] = [];

  prevChapterBtn!: HTMLButtonElement;
  nextChapterBtn!: HTMLButtonElement;
  prevPageBtn!: HTMLButtonElement;
  nextPageBtn!: HTMLButtonElement;
  firstPageBtn!: HTMLButtonElement;
  lastPageBtn!: HTMLButtonElement;
  positionLabel!: HTMLElement;
  progressFill!: HTMLElement;
  scrollLockBtn!: HTMLButtonElement;
  modeBtn!: HTMLButtonElement;
  spreadBtn!: HTMLButtonElement;
  dirBtn!: HTMLButtonElement;
  coverBtn!: HTMLButtonElement;
  fitSelect!: HTMLSelectElement;
  themeBtn!: HTMLButtonElement;
  fullscreenBtn!: HTMLButtonElement;

  queue!: ReaderQueue;
  viewportImpl!: ReaderViewport;
  toolbarImpl!: ReaderToolbar;
  shortcutsImpl!: ReaderShortcuts;

  private readonly cleanup: (() => void)[] = [];

  constructor(
    readonly route: Route,
    container: HTMLElement,
  ) {
    this.container = container;
  }

  onDispose(fn: () => void): void {
    this.cleanup.push(fn);
  }

  // Queue access ------------------------------------------------------------
  enqueue(index: number, priority = false): void {
    if (index >= 0 && index < this.pages.length) {
      const slot = this.slots[index];
      if (slot && !this.cachedMap.has(index) && !this.isPageFailed(index)) {
        // If the slot is in idle state, transition it to the downloading spinner
        if (slot.querySelector(".bi-book")) {
          renderSlotState(this, slot, "spinner", "Downloading…");
        }
      }
    }
    this.queue.enqueue(index, priority);
  }

  isPageFailed(index: number): boolean {
    return this.queue.isFailed(index);
  }

  // Progress + persistence --------------------------------------------------
  updateProgressText(): void {
    const total = this.pages.length;
    const pct = total > 0 ? Math.round(((this.currentIndex + 1) / total) * 100) : 0;
    const cachedNote = this.cachedCount > 0 ? `${this.cachedCount}/${total} cached` : "";

    let fullPageStr = `Page ${this.currentIndex + 1} of ${total}`;
    let shortPageStr = `${this.currentIndex + 1} / ${total}`;

    if (this.isSpread && this.spreads.length > 0) {
      const group = this.spreads[spreadIndexOf(this.spreads, this.currentIndex)];
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

    const cachedHtml = cachedNote
      ? `<span class="ds-prog-cached-dot">·</span><span class="ds-prog-cached">${cachedNote}</span>`
      : "";
    this.positionLabel.innerHTML = `<span class="ds-prog-full">${fullPageStr}</span><span class="ds-prog-short">${shortPageStr}</span><span class="ds-prog-pct">(${pct}%)</span>${cachedHtml}`;
    this.positionLabel.title = `${fullPageStr} (${pct}%)${cachedNote ? ` · ${cachedNote}` : ""}`;

    this.progressFill.style.width = `${pct}%`;
    if (this.isSpread && this.spreads.length > 0) {
      const cur = spreadIndexOf(this.spreads, this.currentIndex);
      this.prevPageBtn.disabled = cur <= 0;
      this.nextPageBtn.disabled = cur >= this.spreads.length - 1;
    } else {
      this.prevPageBtn.disabled = this.currentIndex <= 0;
      this.nextPageBtn.disabled = this.currentIndex >= total - 1;
    }
  }

  schedulePersist(): void {
    window.clearTimeout(this.persistTimer);
    this.persistTimer = window.setTimeout(() => void this.persistNow(), 400);
  }

  async persistNow(): Promise<void> {
    if (this.lastPersistedIndex === this.currentIndex && !this.atEnd) return;
    this.lastPersistedIndex = this.currentIndex;
    try {
      await setReadingProgress({
        chapterPermalink: this.permalink,
        seriesPermalink: this.seriesPermalink ?? "",
        seriesName: this.seriesName ?? "",
        chapterTitle: this.chapterTitle,
        pageIndex: this.currentIndex,
        pageTotal: this.pages.length,
        completed: this.atEnd,
      });
    } catch (err) {
      console.error("dynasty-scans: failed to persist reading progress:", err);
    }
  }

  setPage(index: number, instant = false, scrollToBottom = false): void {
    if (index < 0 || index >= this.pages.length) return;
    this.currentIndex = index;
    this.atEnd = this.currentIndex >= this.pages.length - 1;
    this.updateProgressText();
    this.schedulePersist();
    if (this.atEnd) void this.persistNow();

    if (this.isSpread) {
      this.enqueueSpreadNeighborhood();
    } else {
      this.enqueue(this.currentIndex);
      if (isAutoCacheChapterEnabled()) {
        this.enqueue(this.currentIndex + 1);
        this.enqueue(this.currentIndex + 2);
      } else {
        const prefetchCount = getPrefetchBuffer();
        for (let offset = 1; offset <= prefetchCount; offset++) {
          const nextIdx = this.currentIndex + offset;
          if (nextIdx < this.pages.length && !this.cachedMap.has(nextIdx)) {
            this.enqueue(nextIdx);
          }
        }
      }
    }

    this.viewportImpl.slideTo(index, instant, scrollToBottom);
  }

  /** Enqueues the current and next two spreads so paired pages load together. */
  private enqueueSpreadNeighborhood(): void {
    if (this.spreads.length === 0) return;
    const cur = spreadIndexOf(this.spreads, this.currentIndex);
    const end = Math.min(this.spreads.length - 1, cur + 2);
    for (let s = cur; s <= end; s++) {
      for (const pageIndex of this.spreads[s].pageIndices) {
        this.enqueue(pageIndex);
      }
    }
  }

  /** Steps by one spread in the given reading direction. */
  stepSpread(delta: 1 | -1): void {
    if (!this.isSpread || this.spreads.length === 0) return;
    const cur = spreadIndexOf(this.spreads, this.currentIndex);
    const next = cur + delta;
    if (next < 0 || next >= this.spreads.length) return;
    this.setPage(anchorPageOf(this.spreads, next), false, delta === -1);
  }

  // Layout controls ------------------------------------------------------
  recomputeSpreads(): void {
    this.spreads = computeSpreads(
      this.pages.length,
      this.coverOffset,
      (i) => this.widePages.has(i),
    );
  }

  /**
   * Rebuilds the strip's spread slides from the current spread groups. In
   * single/scroll layouts the page slots are direct strip children (unchanged);
   * in spread layout each group is wrapped in one `.ds-spread-slot`.
   */
  rebuildSpreadSlots(): void {
    for (const wrap of this.spreadSlots) {
      const parent = wrap.parentElement;
      const slots = wrap.querySelectorAll<HTMLElement>(".ds-slot");
      if (parent) {
        for (const s of slots) {
          parent.insertBefore(s, wrap);
        }
      }
      wrap.remove();
    }
    this.spreadSlots = [];
    if (!this.isSpread) return;
    for (const group of this.spreads) {
      const wrap = document.createElement("div");
      const isSingle = group.pageIndices.length === 1;
      wrap.className = `ds-spread-slot ${this.direction}${isSingle ? " ds-spread-single" : ""}`;
      wrap.dataset.spreadIndex = String(group.spreadIndex);

      const canvas = document.createElement("div");
      canvas.className = `ds-spread-canvas ${this.direction}${isSingle ? " ds-spread-single" : ""}`;
      for (const pageIndex of group.pageIndices) {
        const slot = this.slots[pageIndex];
        if (slot) canvas.appendChild(slot);
      }
      wrap.appendChild(canvas);
      this.strip.appendChild(wrap);
      this.spreadSlots.push(wrap);
    }
  }

  setMode(mode: ReaderMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    localStorage.setItem("ds-reader-mode", this.mode === "paged" ? "paged" : "scroll");
    this.recomputeSpreads();
    this.toolbarImpl.updateLayoutBtns();
    this.viewportImpl.applyLayoutMode();
    this.toolbarImpl.updateScrollLockBtn();
  }

  setPagedLayout(layout: PagedLayout): void {
    if (layout === this.pagedLayout) return;
    this.pagedLayout = layout;
    localStorage.setItem("ds-reader-layout", layout);
    this.recomputeSpreads();
    this.toolbarImpl.updateLayoutBtns();
    this.viewportImpl.applyLayoutMode();
  }

  setDirection(dir: ReadingDirection): void {
    this.direction = dir;
    // If the chapter or series has an auto-detected tag (such as 'Read left to right'),
    // changing direction only overrides for the current session and does not clobber the global setting.
    if (!this.directionAutoDetected) {
      localStorage.setItem("ds-reader-direction", dir);
    }
    this.toolbarImpl.updateLayoutBtns();
    if (this.isHorizontal) {
      this.viewportImpl.applyLayoutMode();
      this.viewportImpl.resetToCurrentPage(true);
    }
  }

  toggleCoverOffset(): void {
    this.coverOffset = !this.coverOffset;
    localStorage.setItem("ds-reader-cover-offset", this.coverOffset ? "1" : "0");
    this.recomputeSpreads();
    this.toolbarImpl.updateLayoutBtns();
    if (this.isSpread) {
      this.rebuildSpreadSlots();
      this.viewportImpl.resetToCurrentPage(true);
    }
  }

  /**
   * Reveals the strip once the resume restore has landed. In paged mode the
   * transform is already exact, so the strip is revealed immediately. In scroll
   * mode slot heights are image-driven; if the images near the resume page are
   * still decoding, wait (bounded by a deadline) and re-align the scroll so the
   * restore lands at the correct offset before revealing.
   */
  private revealAfterRestore(): void {
    if (this.isHorizontal) {
      this.readerContainer.classList.remove("ds-restoring");
      return;
    }
    const deadline = window.performance.now() + 1000;
    const poll = (): void => {
      if (this.disposed) return;
      let ready = true;
      const start = Math.max(0, this.currentIndex - 1);
      const end = Math.min(this.pages.length - 1, this.currentIndex + 1);
      for (let i = start; i <= end; i++) {
        const img = this.slots[i]?.querySelector<HTMLImageElement>("img.ds-page-img");
        if (img && !img.complete) {
          ready = false;
          break;
        }
      }
      if (!ready && window.performance.now() < deadline) {
        window.setTimeout(poll, 30);
        return;
      }
      this.viewportImpl.slideTo(this.currentIndex, true);
      this.readerContainer.classList.remove("ds-restoring");
    };
    window.setTimeout(poll, 0);
  }

  // Chapter navigation ------------------------------------------------------
  gotoChapter(c: ChapterRef): void {
    navigate({
      view: "reader",
      seriesPermalink: this.seriesPermalink ?? undefined,
      seriesName: this.seriesName,
      chapterPermalink: c.permalink,
      chapterTitle: c.title,
      chapterList: this.chapterList,
    });
  }

  updateChapterNav(): void {
    const curIdx = this.chapterList.findIndex((c) => c.permalink === this.permalink);
    this.prevChapterBtn.disabled = curIdx <= 0;
    this.nextChapterBtn.disabled = curIdx < 0 || curIdx >= this.chapterList.length - 1;
  }

  // Main bootstrap -----------------------------------------------------------
  async init(): Promise<void> {
    const route = this.route;
    const container = this.container;
    this.permalink = route.chapterPermalink ?? "";

    let chapter: Chapter;
    try {
      chapter = await fetchChapter(this.permalink);
    } catch (err) {
      if (this.disposed) return;
      const msg = err instanceof Error ? err.message : String(err);
      setBanner(`Failed to load chapter: ${msg}`);
      const retry = document.createElement("button");
      retry.type = "button";
      retry.className = "win-button";
      retry.innerHTML = '<i class="bi bi-arrow-clockwise"></i> Retry';
      retry.addEventListener("click", () => this.retry());
      container.appendChild(retry);
      return;
    }

    if (this.disposed) return;

    const seriesTag = (chapter.tags ?? []).find((t) => t.type === "Series");
    this.seriesPermalink = seriesTag?.permalink ?? route.seriesPermalink ?? null;
    this.seriesName = seriesTag?.name ?? route.seriesName ?? chapter.title;
    this.chapterTitle = chapter.title || route.chapterTitle || "Chapter";
    this.chapterList = route.chapterList ?? [];
    this.pages = chapter.pages ?? [];
    // Resolve the starting page: an explicit route `startPage` wins; otherwise
    // fall back to saved reading progress so resuming works from every entry
    // point (History, session tab, browse, search, series).
    let startPage = route.startPage ?? 0;
    if (startPage <= 0) {
      try {
        const prog = await getReadingProgress(this.permalink);
        if (prog && prog.completed !== 1 && prog.page_index > 0) {
          startPage = prog.page_index;
        }
      } catch (err) {
        console.error("dynasty-scans: failed to load reading progress:", err);
      }
    }
    this.currentIndex = Math.min(startPage, Math.max(0, this.pages.length - 1));

    container.innerHTML = "";
    if (this.pages.length === 0) {
      const empty = document.createElement("div");
      empty.className = "ds-muted";
      empty.textContent = "This chapter has no pages.";
      container.appendChild(empty);
      return;
    }

    // If chapterList wasn't provided, lazily fetch the series to populate prev/next
    if (this.chapterList.length === 0 && this.seriesPermalink) {
      void fetchSeries(this.seriesPermalink).then((s) => {
        if (this.disposed) return;
        const cl: ChapterRef[] = [];
        for (const t of s.taggings ?? []) {
          if (t.title && t.permalink) {
            cl.push({ title: t.title, permalink: t.permalink, released_on: t.released_on });
          }
        }
        if (cl.length > 0) {
          this.chapterList = cl;
          this.updateChapterNav();
        }
        // Series-level `Read left to right` detection is only authoritative when
        // the reader has not auto-detected or manually chosen a direction yet.
        if (this.directionAutoDetected) {
          const newDir = detectReadingDirection(chapter.tags ?? [], s.tags ?? []);
          if (newDir !== this.direction) {
            this.direction = newDir;
            this.toolbarImpl.updateLayoutBtns();
            if (this.isSpread) {
              this.rebuildSpreadSlots();
              this.viewportImpl.resetToCurrentPage(true);
            }
          }
        }
      });
    }

    // Display-mode preferences
    this.mode = localStorage.getItem("ds-reader-mode") === "paged" ? "paged" : "scroll";
    this.pagedLayout = localStorage.getItem("ds-reader-layout") === "spread" ? "spread" : "single";
    this.coverOffset = localStorage.getItem("ds-reader-cover-offset") === "1";
    
    // Direction: Check if chapter tags indicate LTR (soft-override).
    // If tagged, soft-override to LTR. Otherwise use saved global preference or RTL default.
    const tagDir = detectReadingDirection(chapter.tags ?? []);
    if (tagDir === "ltr") {
      this.direction = "ltr";
      this.directionAutoDetected = true;
    } else {
      const dirPref = localStorage.getItem("ds-reader-direction");
      if (dirPref === "ltr" || dirPref === "rtl") {
        this.direction = dirPref;
        this.directionAutoDetected = false;
      } else {
        this.direction = "rtl";
        this.directionAutoDetected = true;
      }
    }
    this.recomputeSpreads();
    this.fitMode = (localStorage.getItem("ds-reader-fit") as FitMode) || "width";
    this.scrollLock = localStorage.getItem("ds-reader-scroll-lock") === "1";

    this.readerContainer = document.createElement("div");
    this.readerContainer.id = "ds-reader-container";
    this.readerContainer.className = `fit-${this.fitMode}`;
    container.appendChild(this.readerContainer);

    // Build sub-modules (each constructs its own DOM into this.readerContainer)
    this.toolbarImpl = new ReaderToolbar(this);
    this.viewportImpl = new ReaderViewport(this);
    this.queue = new ReaderQueue(this);
    this.shortcutsImpl = new ReaderShortcuts(this);

    // Restore cached page paths from SQLite
    let cachedRows: Awaited<ReturnType<typeof getCachedPages>> = [];
    try {
      cachedRows = await getCachedPages(this.permalink);
    } catch (err) {
      cachedRows = [];
      setBanner(
        `Page cache lookup failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    for (const row of cachedRows) {
      if (row.page_index >= 0 && row.page_index < this.pages.length && row.file_path) {
        this.cachedMap.set(row.page_index, row.file_path);
      }
    }
    this.cachedCount = this.cachedMap.size;

    // Build slots
    const autoCacheAll = isAutoCacheChapterEnabled();
    for (let i = 0; i < this.pages.length; i++) {
      const slot = document.createElement("div");
      slot.className = "ds-slot";
      slot.dataset.index = String(i);
      const absPath = this.cachedMap.get(i);
      if (absPath) {
        renderSlotImg(this, slot, absPath, i + 1);
      } else if (!isOnline()) {
        renderSlotState(this, slot, "offline", "Offline — not downloaded");
      } else if (autoCacheAll) {
        renderSlotState(this, slot, "spinner", "Queued for download…");
        this.enqueue(i);
      } else {
        renderSlotState(this, slot, "idle", "Waiting to read…");
      }
      this.strip.appendChild(slot);
      this.slots.push(slot);
    }

    // Trigger priority download for uncached start/nearby pages
    if (!this.cachedMap.has(this.currentIndex)) this.enqueue(this.currentIndex, true);
    if (autoCacheAll) {
      if (!this.cachedMap.has(this.currentIndex + 1)) this.enqueue(this.currentIndex + 1, true);
      if (!this.cachedMap.has(this.currentIndex + 2)) this.enqueue(this.currentIndex + 2, true);
    } else {
      const prefetchCount = getPrefetchBuffer();
      for (let offset = 1; offset <= prefetchCount; offset++) {
        const nextIdx = this.currentIndex + offset;
        if (nextIdx < this.pages.length && !this.cachedMap.has(nextIdx)) {
          this.enqueue(nextIdx, true);
        }
      }
    }

    // Hide the strip from the first paint: when resuming, the first page image
    // would otherwise flash before the restore jump below lands.
    if (startPage > 0) {
      this.readerContainer.classList.add("ds-restoring");
    }

    this.toolbarImpl.wireAfterSlots();
    this.viewportImpl.wireAfterSlots();
    this.updateProgressText();
    standardizeCachePaths(this);

    // History + top-bar actions
    try {
      await addHistory({
        chapterPermalink: this.permalink,
        seriesPermalink: this.seriesPermalink ?? "",
        seriesName: this.seriesName ?? "",
        chapterTitle: this.chapterTitle,
      });
    } catch (err) {
      console.error("dynasty-scans: failed to record history:", err);
    }

    let bookmarked = false;
    try {
      const bm = await getBookmark(this.permalink);
      bookmarked = bm !== null;
    } catch {
      bookmarked = false;
    }

    setActions(<ReaderActions ctrl={this} bookmarked={bookmarked} />);

    // Restore the resume page. The awaited history/bookmark calls above gave
    // nearby images time to decode, so the instant scroll lands at the correct
    // offset; the strip stays hidden until it has landed and been revealed.
    if (startPage > 0) {
      this.setPage(startPage, true);
      this.revealAfterRestore();
    }
  }

  retry(): void {
    // Re-render from scratch (used by the load-failure retry button).
    // Mirrors renderReader's bootstrap; the router keeps the original dispose.
    this.dispose();
    this.container.innerHTML = "";
    mountLoading(this.container);
    const fresh = new ReaderController(this.route, this.container);
    void fresh.init();
  }

  dispose(): void {
    this.disposed = true;
    for (const fn of this.cleanup) fn();
  }
}

export function renderReader(container: HTMLElement, route: Route): (() => void) | void {
  container.innerHTML = "";
  const permalink = route.chapterPermalink;
  if (!permalink) {
    setBanner("Missing chapter permalink.");
    return;
  }

  mountLoading(container);

  const ctrl = new ReaderController(route, container);
  void ctrl.init();

  return () => ctrl.dispose();
}
