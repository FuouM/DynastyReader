/**
 * Shared resource, revision subscription, delayed spinner, and pane API registration
 * lifecycle hook for Library panes. Extracted to eliminate 4x duplication in `panes.tsx`.
 */

import { createResource, createSignal, onCleanup, onMount, type Accessor, type Resource } from "solid-js";
import { useDelayedSpinner } from "../browse/browse-state";

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
  const [page, setPage] = createSignal(1);
  const [rev, setRev] = createSignal(options.getRevision());

  onMount(() => {
    const unsub = options.onChanged(() => setRev(options.getRevision()));
    onCleanup(unsub);
  });

  const [data, { refetch }] = createResource(
    () => ({ page: page(), rev: rev() }),
    async ({ page: p }) => options.fetcher(p),
  );

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
