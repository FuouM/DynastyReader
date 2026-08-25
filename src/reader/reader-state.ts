/**
 * Reader state — extracted from `reader-session.ts` (P3-A).
 * Pure reactive state: all `createSignal`/`createStore` + derived `createMemo`
 * (`isHorizontal`, `isSpread`, `spreads`, `slideIndex`, `progress`, `chapterNav`).
 * No DOM, no queue, no persistence — keeps `ReaderSession` as thin orchestrator.
 */

import { createMemo, createSignal } from "solid-js";
import { createStore } from "solid-js/store";
import { t } from "../i18n";
import { computeSpreads, spreadIndexOf } from "./reader-spread";
import type { ChapterPage } from "../types/api";
import type { ChapterRef } from "../types/routes";
import type { FitMode, PagedLayout, ReaderMode, ReadingDirection, SpreadGroup } from "../types/reader";
import type { SlotStateKind } from "./reader-queue";

export interface SlotStateRecord {
  kind: SlotStateKind;
  message: string;
}

export interface ReaderState {
  // Loaded data
  seriesPermalink: () => string | null;
  setSeriesPermalink: (v: string | null) => void;
  seriesName: () => string;
  setSeriesName: (v: string) => void;
  chapterTitle: () => string;
  setChapterTitle: (v: string) => void;
  chapterList: () => ChapterRef[];
  setChapterList: (v: ChapterRef[]) => void;
  pages: () => ChapterPage[];
  setPages: (v: ChapterPage[]) => void;
  // Runtime
  currentIndex: () => number;
  setCurrentIndex: (v: number) => void;
  atEnd: () => boolean;
  setAtEnd: (v: boolean) => void;
  mode: () => ReaderMode;
  setModeSignal: (v: ReaderMode) => void;
  pagedLayout: () => PagedLayout;
  setPagedLayoutSignal: (v: PagedLayout) => void;
  layoutAutoDetected: () => boolean;
  setLayoutAutoDetected: (v: boolean) => void;
  isLongStrip: () => boolean;
  setIsLongStrip: (v: boolean) => void;
  direction: () => ReadingDirection;
  setDirectionSignal: (v: ReadingDirection) => void;
  directionAutoDetected: () => boolean;
  setDirectionAutoDetected: (v: boolean) => void;
  coverOffset: () => boolean;
  setCoverOffsetSignal: (v: boolean) => void;
  widePages: () => ReadonlySet<number>;
  setWidePagesSignal: (v: ReadonlySet<number> | ((prev: ReadonlySet<number>) => ReadonlySet<number>)) => void;
  fitMode: () => FitMode;
  setFitModeSignal: (v: FitMode) => void;
  zoomScale: () => number;
  setZoomScaleSignal: (v: number | ((prev: number) => number)) => void;
  scrollLock: () => boolean;
  setScrollLockSignal: (v: boolean | ((prev: boolean) => boolean)) => void;
  isFullscreen: () => boolean;
  setIsFullscreenSignal: (v: boolean) => void;
  loading: () => boolean;
  setLoading: (v: boolean) => void;
  error: () => string | null;
  setError: (v: string | null) => void;
  empty: () => boolean;
  setEmpty: (v: boolean) => void;
  bookmarked: () => boolean;
  setBookmarked: (v: boolean) => void;
  restoring: () => boolean;
  setRestoring: (v: boolean) => void;
  toolbarVisible: () => boolean;
  setToolbarVisible: (v: boolean) => void;
  controlsOpen: () => boolean;
  setControlsOpen: (v: boolean) => void;
  cachedCount: () => number;
  setCachedCount: (v: number) => void;
  // Stores
  cachedPages: ReturnType<typeof createStore<Record<number, string | undefined>>>;
  slotStates: ReturnType<typeof createStore<Record<number, SlotStateRecord | undefined>>>;
  pageDimensions: ReturnType<typeof createStore<Record<number, { width: number; height: number } | undefined>>>;
  // Derived
  isHorizontal: () => boolean;
  isSpread: () => boolean;
  spreads: () => SpreadGroup[];
  slideIndex: () => number;
  progress: () => {
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
  chapterNav: () => { prevDisabled: boolean; nextDisabled: boolean };
}

export function createReaderState(): ReaderState {
  const [seriesPermalink, setSeriesPermalink] = createSignal<string | null>(null);
  const [seriesName, setSeriesName] = createSignal("");
  const [chapterTitle, setChapterTitle] = createSignal("");
  const [chapterList, setChapterList] = createSignal<ChapterRef[]>([]);
  const [pages, setPages] = createSignal<ChapterPage[]>([]);
  const [currentIndex, setCurrentIndex] = createSignal(0);
  const [atEnd, setAtEnd] = createSignal(false);
  const [mode, setModeSignal] = createSignal<ReaderMode>("scroll");
  const [pagedLayout, setPagedLayoutSignal] = createSignal<PagedLayout>("single");
  const [layoutAutoDetected, setLayoutAutoDetected] = createSignal(false);
  const [isLongStrip, setIsLongStrip] = createSignal(false);
  const [direction, setDirectionSignal] = createSignal<ReadingDirection>("rtl");
  const [directionAutoDetected, setDirectionAutoDetected] = createSignal(false);
  const [coverOffset, setCoverOffsetSignal] = createSignal(false);
  const [widePages, setWidePagesSignal] = createSignal<ReadonlySet<number>>(new Set());
  const [fitMode, setFitModeSignal] = createSignal<FitMode>("width");
  const [zoomScale, setZoomScaleSignal] = createSignal(1.0);
  const [scrollLock, setScrollLockSignal] = createSignal(false);
  const [isFullscreen, setIsFullscreenSignal] = createSignal(false);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  const [empty, setEmpty] = createSignal(false);
  const [bookmarked, setBookmarked] = createSignal(false);
  const [restoring, setRestoring] = createSignal(false);
  const [cachedCount, setCachedCount] = createSignal(0);
  const [toolbarVisible, setToolbarVisible] = createSignal(true);
  const [controlsOpen, setControlsOpen] = createSignal(false);
  const cachedPages = createStore<Record<number, string | undefined>>({});
  const slotStates = createStore<Record<number, SlotStateRecord | undefined>>({});
  const pageDimensions = createStore<Record<number, { width: number; height: number } | undefined>>({});

  const isHorizontal = createMemo(() => mode() === "paged");
  const isSpread = createMemo(() => mode() === "paged" && pagedLayout() === "spread");
  const spreads = createMemo<SpreadGroup[]>(() => computeSpreads(pages().length, coverOffset(), (i) => widePages().has(i)));
  const slideIndex = createMemo(() => (isSpread() ? spreadIndexOf(spreads(), currentIndex()) : currentIndex()));

  const progress = createMemo(() => {
    const total = pages().length;
    const idx = currentIndex();
    const count = cachedCount();
    const cachedNote = count > 0 ? t("reader.session.cachedBadge", { count, total }) : "";
    const isSpreadActive = isSpread() && spreads().length > 0;
    let pct = total > 0 ? Math.round(((idx + 1) / total) * 100) : 0;
    if (isSpreadActive) {
      const spreadsVal = spreads();
      const curSpread = spreadIndexOf(spreadsVal, idx);
      pct = spreadsVal.length > 0 ? Math.round(((curSpread + 1) / spreadsVal.length) * 100) : 0;
    }
    let currentNumStr = `${idx + 1}`;
    let fullPageStr = `Page ${idx + 1} of ${total}`;
    let shortPageStr = `${idx + 1} / ${total}`;
    if (isSpreadActive) {
      const group = spreads()[spreadIndexOf(spreads(), idx)];
      if (group && group.pageIndices.length > 1) {
        const first = group.pageIndices[0] + 1;
        const last = group.pageIndices[group.pageIndices.length - 1] + 1;
        currentNumStr = `${first}–${last}`;
        fullPageStr = `Pages ${first}–${last} of ${total}`;
        shortPageStr = `${first}–${last} / ${total}`;
      } else if (group) {
        const first = group.pageIndices[0] + 1;
        currentNumStr = `${first}`;
        fullPageStr = `Page ${first} of ${total}`;
        shortPageStr = `${first} / ${total}`;
      }
    }
    const maxCurrentChars = isSpreadActive ? `${spreads().length}`.length + 2 : `${total}`.length;
    const title = isSpreadActive ? `Spread ${spreadIndexOf(spreads(), idx) + 1} of ${spreads().length}` : fullPageStr;
    const prevDisabled = isSpreadActive ? spreadIndexOf(spreads(), idx) === 0 : idx === 0;
    const nextDisabled = isSpreadActive ? spreadIndexOf(spreads(), idx) >= spreads().length - 1 : idx >= total - 1;
    return {
      full: fullPageStr,
      short: shortPageStr,
      currentNumStr,
      totalNumStr: `${total}`,
      maxCurrentChars,
      pct,
      width: pct,
      cachedNote,
      title,
      prevDisabled,
      nextDisabled,
    };
  });

  const chapterNav = createMemo(() => {
    const total = pages().length;
    const idx = currentIndex();
    const isSpreadActive = isSpread() && spreads().length > 0;
    if (isSpreadActive) {
      const cur = spreadIndexOf(spreads(), idx);
      return { prevDisabled: cur === 0, nextDisabled: cur >= spreads().length - 1 };
    }
    return { prevDisabled: idx === 0, nextDisabled: idx >= total - 1 };
  });

  return {
    seriesPermalink,
    setSeriesPermalink,
    seriesName,
    setSeriesName,
    chapterTitle,
    setChapterTitle,
    chapterList,
    setChapterList,
    pages,
    setPages,
    currentIndex,
    setCurrentIndex,
    atEnd,
    setAtEnd,
    mode,
    setModeSignal,
    pagedLayout,
    setPagedLayoutSignal,
    layoutAutoDetected,
    setLayoutAutoDetected,
    isLongStrip,
    setIsLongStrip,
    direction,
    setDirectionSignal,
    directionAutoDetected,
    setDirectionAutoDetected,
    coverOffset,
    setCoverOffsetSignal,
    widePages,
    setWidePagesSignal,
    fitMode,
    setFitModeSignal,
    zoomScale,
    setZoomScaleSignal,
    scrollLock,
    setScrollLockSignal,
    isFullscreen,
    setIsFullscreenSignal,
    loading,
    setLoading,
    error,
    setError,
    empty,
    setEmpty,
    bookmarked,
    setBookmarked,
    restoring,
    setRestoring,
    toolbarVisible,
    setToolbarVisible,
    controlsOpen,
    setControlsOpen,
    cachedCount,
    setCachedCount,
    cachedPages,
    slotStates,
    pageDimensions,
    isHorizontal,
    isSpread,
    spreads,
    slideIndex,
    progress,
    chapterNav,
  };
}
