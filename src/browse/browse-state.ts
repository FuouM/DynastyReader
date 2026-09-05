/**
 * Shared reactive state for the Solid Browse view. Port of the module-level
 * bookkeeping in `browse-controller.ts`:
 *
 *  - per-tab top pager configuration store (survives tab switches)
 *  - browse scroll helpers (`#ds-pane-browse` / `#ds-view`)
 *  - a blacklist revision signal driven by `onBlacklistChanged`
 *  - `useTabPane`: a resource hook that keeps pane data alive across tab
 *    switches (instant re-activation), reloads on page change / blacklist
 *    revision / force-reload, and never refetches hidden panes.
 */

import { createEffect, createResource, createSignal } from "solid-js";
import { debounce } from "@solid-primitives/scheduled";
import { createStore } from "solid-js/store";
import type { Accessor } from "solid-js";
import { getBlacklistRevision, onBlacklistChanged } from "../db/blacklist.repo";

export interface TopPagerConfig {
  totalPages: number;
  currentPage: number;
  onPage: (p: number) => void;
}

const [pagers, setPagers] = createStore<Record<string, TopPagerConfig | undefined>>({});

/** Saves the top-pager config for a tab so switching back restores it instantly. */
export function setTopPagerFor(tabId: string, cfg: TopPagerConfig): void {
  setPagers(tabId, cfg);
}

/** Reads the saved top-pager config for a tab (undefined when never loaded). */
export function getTopPagerFor(tabId: string): TopPagerConfig | undefined {
  return pagers[tabId];
}

/** Scrolls the browse scroll container to the top. */
export function scrollBrowseToTop(): void {
  const el = document.getElementById("ds-pane-browse") || document.getElementById("ds-view");
  if (el) el.scrollTop = 0;
}

/** Smooth-scrolls the browse scroll container to the bottom. */
export function scrollBrowseToBottom(): void {
  const el = document.getElementById("ds-pane-browse") || document.getElementById("ds-view");
  if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
}

const [blacklistRevision, setBlacklistRevision] = createSignal<number>(getBlacklistRevision());
onBlacklistChanged(() => setBlacklistRevision(getBlacklistRevision()));

/** Reactive blacklist revision; panes key their loads on it. */
export function useBlacklistRevision(): Accessor<number> {
  return blacklistRevision;
}

const [paneLoadingMap, setPaneLoadingMap] = createStore<Record<string, boolean>>({});
const [paneErrorMap, setPaneErrorMap] = createStore<Record<string, boolean>>({});

/** Reports a pane's resource loading state so the Check Updates button can settle. */
export function setPaneLoading(tabId: string, loading: boolean): void {
  setPaneLoadingMap(tabId, loading);
}

/** Reads a pane's current resource loading state. */
export function getPaneLoading(tabId: string): boolean {
  return paneLoadingMap[tabId];
}

/** Reports whether a pane encountered an error during its latest load. */
export function setPaneError(tabId: string, error: boolean): void {
  setPaneErrorMap(tabId, error);
}

/** Reads whether a pane currently has an error state. */
export function getPaneError(tabId: string): boolean {
  return paneErrorMap[tabId] ?? false;
}

export interface TabPaneOptions<T> {
  active: Accessor<boolean>;
  revision: Accessor<number>;
  forceTick: Accessor<number>;
  load: (page: number) => Promise<T>;
}

export interface TabPane<T> {
  page: Accessor<number>;
  goToPage: (p: number) => void;
  reload: () => void;
  data: Accessor<T | undefined>;
  loading: Accessor<boolean>;
  error: Accessor<unknown>;
}

/**
 * Per-tab pane loader. Data is fetched only when the pane is `active` and has
 * not yet satisfied its current request (`loadSeq === loadedSeq`). Returning
 * `null` from the resource source keeps the previous value, so switching away
 * and back never re-renders from scratch.
 *
 * Load triggers: first activation, page change, blacklist revision bump (when
 * active), force-reload tick (when active). Revision bumps while hidden simply
 * mark the pane stale so its next activation refetches.
 */
export function useTabPane<T>(opts: TabPaneOptions<T>): TabPane<T> {
  const [page, setPage] = createSignal(1);
  const [loadSeq, setLoadSeq] = createSignal(0);

  const source = () => {
    if (!opts.active()) return false;
    return {
      page: page(),
      seq: loadSeq(),
      revision: opts.revision(),
      force: opts.forceTick(),
    };
  };

  const [data, { refetch }] = createResource(
    source,
    async (params) => {
      return opts.load(params.page);
    },
  );

  createEffect(() => {
    if (opts.forceTick() > 0 && opts.active()) {
      setPage(1);
      setLoadSeq((s) => s + 1);
      scrollBrowseToTop();
    }
  });

  const goToPage = (p: number): void => {
    setPage(p);
    setLoadSeq((s) => s + 1);
    scrollBrowseToTop();
  };

  const reload = (): void => {
    setLoadSeq((s) => s + 1);
    void refetch();
  };

  return {
    page,
    goToPage,
    reload,
    data,
    loading: () => data.loading,
    error: () => data.error,
  };
}

/**
 * Returns true once `loading` has stayed true for `delayMs`, false otherwise.
 * Matches `attachDelayedLoading`'s 140ms no-flicker threshold.
 */
export function useDelayedSpinner(loading: Accessor<boolean>, delayMs = 140): Accessor<boolean> {
  const [show, setShow] = createSignal(false);
  const triggerShow = debounce(() => setShow(true), delayMs);
  createEffect(() => {
    if (loading()) {
      triggerShow();
    } else {
      triggerShow.clear();
      setShow(false);
    }
  });
  return show;
}