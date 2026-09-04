/**
 * Shared resource, revision subscription, delayed spinner, and pane API registration
 * lifecycle hook for Library panes. Extracted to eliminate 4x duplication in `panes.tsx`.
 */

import { createEffect, createResource, createSignal, onCleanup, onMount, type Accessor, type Resource } from "solid-js";
import { useDelayedSpinner } from "../browse/browse-state";

/**
 * In-session memory of each pane's current page so navigating away from the
 * Library and back restores the user's place. Keyed by the pane's stable
 * `getRevision` function reference (each pane passes a distinct accessor).
 */
const panePageMemory = new Map<unknown, number>();

/** Reads `totalPages` from a pane fetch result, tolerating a nested `res` wrapper. */
function extractTotalPages(d: unknown): number | undefined {
  if (d && typeof d === "object") {
    const o = d as Record<string, unknown>;
    if (typeof o.totalPages === "number") return o.totalPages;
    const res = o.res;
    if (res && typeof res === "object" && typeof (res as Record<string, unknown>).totalPages === "number") {
      return (res as Record<string, number>).totalPages;
    }
  }
  return undefined;
}

export interface LibraryPaneApi {
  /** Forces a refetch of the panel data (keeps current page). */
  refetch: () => Promise<unknown>;
  /** Resets pagination back to page 1. */
  reset: () => void;
}

export interface LibraryPaneProps {
  register: (api: LibraryPaneApi) => void;
}

export interface UseLibraryPaneResourceOptions<T> {
  getRevision: () => number;
  onChanged: (cb: () => void) => () => void;
  fetcher: (page: number) => Promise<T>;
  register?: (api: LibraryPaneApi) => void;
}

export interface LibraryPaneResourceResult<T> {
  page: Accessor<number>;
  setPage: (p: number | ((prev: number) => number)) => void;
  data: Resource<T>;
  refetch: () => Promise<unknown>;
  showSpinner: Accessor<boolean>;
}

export function useLibraryPaneResource<T>(
  options: UseLibraryPaneResourceOptions<T>,
): LibraryPaneResourceResult<T> {
  const pageKey = options.getRevision;
  const [page, setPageRaw] = createSignal(panePageMemory.get(pageKey) ?? 1);
  const setPage = (p: number | ((prev: number) => number)): void => {
    setPageRaw((prev) => {
      const next = typeof p === "function" ? p(prev) : p;
      panePageMemory.set(pageKey, next);
      return next;
    });
  };
  const [rev, setRev] = createSignal(options.getRevision());

  onMount(() => {
    const unsub = options.onChanged(() => setRev(options.getRevision()));
    onCleanup(unsub);
  });

  const [data, { refetch }] = createResource(
    () => ({ page: page(), rev: rev() }),
    async ({ page: p }) => options.fetcher(p),
  );

  // Clamp the page when deletions shrink the result set, otherwise the user
  // is stranded on an empty page with the pager hidden.
  createEffect(() => {
    const d = data();
    if (d === undefined) return;
    const total = extractTotalPages(d);
    if (total === undefined) return;
    const clamped = Math.max(1, total);
    if (page() > clamped) setPage(clamped);
  });

  const showSpinner = useDelayedSpinner(() => data.loading);

  onMount(() => {
    options.register?.({
      refetch: async () => refetch(),
      reset: () => setPage(1),
    });
  });

  return {
    page,
    setPage,
    data,
    refetch: async () => refetch(),
    showSpinner,
  };
}
