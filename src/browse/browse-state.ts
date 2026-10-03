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

import { createStore } from "solid-js/store";
import type { Accessor } from "solid-js";
import { activeProvider } from "../stores/provider";
export interface TopPagerConfig {
  totalPages: number;
  currentPage: number;
  onPage: (p: number) => void;
}

const [pagers, setPagers] = createStore<Record<string, TopPagerConfig | undefined>>({});

/** Saves the top-pager config for a tab so switching back restores it instantly. */
export function setTopPagerFor(tabId: string, cfg: TopPagerConfig): void {
  setPagers(`${activeProvider()}:${tabId}`, cfg);
}

/** Reads the saved top-pager config for a tab (undefined when never loaded). */
export function getTopPagerFor(tabId: string): TopPagerConfig | undefined {
  return pagers[`${activeProvider()}:${tabId}`];
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

export interface BrowsePaneApi {
  reload: () => Promise<unknown>;
  reset: () => void;
}

export interface TabPaneOptions<T> {
  active: Accessor<boolean>;
  revision: Accessor<number>;
  load: (page: number) => Promise<T>;
}

export interface TabPane<T> {
  page: Accessor<number>;
  goToPage: (p: number) => void;
  reload: () => Promise<unknown>;
  reset: () => void;
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
  let lastLoadedKey = "";

  const source = () => {
    if (!opts.active()) return false;
    const provider = activeProvider();
    const key = `${provider}:${page()}:${loadSeq()}:${opts.revision()}`;
    // If we already satisfied these exact query parameters, do not re-fetch on tab return.
    if (key === lastLoadedKey && data()) return false;
    return {
      key,
      page: page(),
      provider,
    };
  };
  const [data, { mutate, refetch }] = createResource(
    source,
    async (params) => {
      const p = typeof params === "object" && params !== null ? params.page : page();
      if (typeof params === "object" && params !== null) {
        lastLoadedKey = params.key;
      }
      return opts.load(p);
    },
  );

  createEffect(() => {
    activeProvider();
    setPage(1);
    lastLoadedKey = "";
    mutate(undefined);
  });

  const reset = (): void => {
    setPage(1);
    scrollBrowseToTop();
  };

  const reload = async (): Promise<unknown> => {
    lastLoadedKey = "";
    setLoadSeq((s) => s + 1);
    return refetch();
  };

  const goToPage = (p: number): void => {
    lastLoadedKey = "";
    if (p === page()) {
      void reload();
    } else {
      setPage(p);
    }
    scrollBrowseToTop();
  };
  return {
    page,
    goToPage,
    reload,
    reset,
    data,
    loading: () => data.loading,
    error: () => data.error,
  };
}

export { useDelayedSpinner } from "../components/Feedback";