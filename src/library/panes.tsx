/**
 * Solid Library panels: Followed Series, Collections, Bookmarks, Reading
 * History. Port of the four `load*Page`/`render*` blocks in `ui-library.ts`.
 *
 * Each panel owns a `createResource` keyed on `{ page, tick }` so the parent
 * grid's "Refresh Library" can force a full reload (`tick` bump + page reset)
 * and wait for every panel to settle before restoring the button.
 */

import {
  createResource,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
  type Accessor,
} from "solid-js";
import { decodeEntities, formatDate, navigate, showBanner } from "../stores";
import {
  getFollowedSeriesPage,
  getBookmarksPage,
  getHistoryPage,
  getFullyCachedChapterPermalinks,
  getCollections,
  getCollectionsRevision,
  onCollectionsChanged,
  deleteCollection,
  removeBookmark,
  removeHistory,
  type FollowedSeriesRow,
  type BookmarkRow,
  type HistoryRow,
  type CollectionRow,
} from "../db";
import { openExternal, refreshFollowedSeriesCover } from "../api";
import { useDelayedSpinner } from "../browse/browse-state";
import { Cover } from "../components/Cover";
import { ConfirmDeleteButton } from "../components/Button";
import { Loading } from "../components/Loading";
import { Pager } from "../components/Pager";

export interface LibraryPaneApi {
  /** Forces a refetch of the panel data (keeps current page). */
  refetch: () => Promise<unknown>;
  /** Resets pagination back to page 1. */
  reset: () => void;
}

export interface LibraryPaneProps {
  /** Bumped by the parent grid to force a full reload of all panels. */
  tick: Accessor<number>;
  register: (api: LibraryPaneApi) => void;
}

// ---------------------------------------------------------------------------
// 1. Followed Series
// ---------------------------------------------------------------------------

export function FollowedPane(props: LibraryPaneProps) {
  const [page, setPage] = createSignal(1);
  const [data, { refetch }] = createResource(
    () => ({ page: page(), tick: props.tick() }),
    async ({ page: p }) => getFollowedSeriesPage(p, 10),
  );
  const showSpinner = useDelayedSpinner(() => data.loading);

  onMount(() => {
    props.register({ refetch: async () => refetch(), reset: () => setPage(1) });
  });

  const openSeries = (row: FollowedSeriesRow): void => {
    navigate({ view: "series", seriesPermalink: row.permalink, seriesName: row.name });
  };

  return (
    <>
      <Show
        when={data() !== undefined}
        fallback={<Show when={showSpinner()}><Loading /></Show>}
      >
        <Show
          when={data()!.rows.length > 0}
          fallback={
            <div class="ds-muted">
              No followed series yet. Open a series and click Follow to see it here.
            </div>
          }
        >
          <For each={data()!.rows}>
            {(row) => (
              <div class="ds-item ds-flex-row" style="padding:4px 6px;">
                <div
                  style="cursor:pointer;flex-shrink:0;"
                  onClick={() => openSeries(row)}
                >
                  <Cover path={row.cover} alt={row.name} imgClass="ds-followed-cover" placeholderClass="ds-followed-cover-placeholder" />
                </div>
                <div
                  class="ds-fill ds-clickable"
                  onClick={() => openSeries(row)}
                >
                  <div class="ds-item-title">{decodeEntities(row.name)}</div>
                  <div class="ds-item-meta">
                    {row.latest_chapter_title
                      ? `Latest: ${decodeEntities(row.latest_chapter_title)}`
                      : `Followed on ${formatDate(Number(row.created_at))}`}
                  </div>
                </div>
                <button
                  type="button"
                  class="win-button"
                  style="font-size:10px;padding:2px 6px;flex-shrink:0;"
                  title="Re-fetch series cover"
                  onClick={async (ev) => {
                    ev.stopPropagation();
                    try {
                      await refreshFollowedSeriesCover(row.permalink, row.cover);
                      showBanner(`Cover updated for "${row.name}".`);
                      refetch();
                    } catch (err) {
                      const msg = err instanceof Error ? err.message : String(err);
                      showBanner(`Cover refresh failed: ${msg}`);
                    }
                  }}
                >
                  <i class="bi bi-image"></i>
                </button>
                <button
                  type="button"
                  class="win-button"
                  style="font-size:10px;padding:2px 6px;flex-shrink:0;"
                  title="Open on Dynasty Scans in browser"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    openExternal(`https://dynasty-scans.com/series/${row.permalink}`);
                  }}
                >
                  <i class="bi bi-box-arrow-up-right"></i>
                </button>
              </div>
            )}
          </For>
        </Show>
      </Show>
      <Show when={data() !== undefined && data()!.totalPages > 1}>
        <Pager
          totalPages={data()!.totalPages}
          currentPage={data()!.currentPage}
          onPage={setPage}
          cssText="justify-content:flex-end;margin-top:4px;"
        />
      </Show>
    </>
  );
}

// ---------------------------------------------------------------------------
// 2. Collections & Favorites
// ---------------------------------------------------------------------------

export interface CollectionsPaneProps extends LibraryPaneProps {
  onOpenDetail: (id: number) => void;
  onCreateNew: () => void;
}

export function CollectionsPane(props: CollectionsPaneProps) {
  const [rev, setRev] = createSignal(getCollectionsRevision());
  onMount(() => {
    const unsub = onCollectionsChanged(() => setRev(getCollectionsRevision()));
    onCleanup(unsub);
  });

  const [data, { refetch }] = createResource(
    () => ({ tick: props.tick(), rev: rev() }),
    async () => getCollections(),
  );
  const showSpinner = useDelayedSpinner(() => data.loading);

  onMount(() => {
    props.register({ refetch: async () => refetch(), reset: () => {} });
  });

  const openDetail = (col: CollectionRow): void => {
    props.onOpenDetail(col.id);
  };

  return (
    <Show
      when={data() !== undefined}
      fallback={<Show when={showSpinner()}><Loading /></Show>}
    >
      <Show
        when={data()!.length > 0}
        fallback={<div class="ds-muted">No collections found.</div>}
      >
        <For each={data()!}>
          {(col) => (
            <div class="ds-item ds-flex-row" style="padding:5px 8px;border-radius:2px;gap:8px;">
              <i
                class={col.is_default ? "bi bi-star-fill" : "bi bi-folder2-open"}
                style={
                  col.is_default
                    ? "color:#d97706;font-size:14px;flex-shrink:0;"
                    : "color:var(--sys-primary,#0078d4);font-size:14px;flex-shrink:0;"
                }
              ></i>
              <div class="ds-fill ds-clickable" onClick={() => openDetail(col)}>
                <div
                  class="ds-item-title"
                  style={col.is_default ? "font-weight:700;" : "font-weight:600;"}
                >
                  {decodeEntities(col.name)}
                </div>
                <div class="ds-item-meta">
                  {col.itemCount ?? 0} item{col.itemCount === 1 ? "" : "s"}
                  {col.is_default ? " · Default Collection" : ""}
                </div>
              </div>
              <button
                type="button"
                class="win-button ds-btn-sm"
                style="font-size:10px;padding:2px 8px;flex-shrink:0;"
                onClick={() => openDetail(col)}
              >
                <i class="bi bi-folder2-open"></i> Open
              </button>
              <Show when={!col.is_default}>
                <ConfirmDeleteButton
                  title="Delete collection"
                  onConfirm={async () => {
                    try {
                      await deleteCollection(col.id);
                      showBanner(`Deleted collection "${col.name}".`);
                      refetch();
                    } catch (err) {
                      const msg = err instanceof Error ? err.message : String(err);
                      showBanner(`Could not delete collection: ${msg}`);
                      throw err;
                    }
                  }}
                >
                  <i class="bi bi-trash3"></i>
                </ConfirmDeleteButton>
              </Show>
            </div>
          )}
        </For>
      </Show>
    </Show>
  );
}

// ---------------------------------------------------------------------------
// 3. Bookmarks
// ---------------------------------------------------------------------------

export function BookmarksPane(props: LibraryPaneProps) {
  const [page, setPage] = createSignal(1);
  const [data, { refetch }] = createResource(
    () => ({ page: page(), tick: props.tick() }),
    async ({ page: p }) => {
      const [res, fullyCachedSet] = await Promise.all([
        getBookmarksPage(p, 15),
        getFullyCachedChapterPermalinks(),
      ]);
      return { res, fullyCachedSet };
    },
  );
  const showSpinner = useDelayedSpinner(() => data.loading);

  onMount(() => {
    props.register({ refetch: async () => refetch(), reset: () => setPage(1) });
  });

  return (
    <>
      <Show
        when={data() !== undefined}
        fallback={<Show when={showSpinner()}><Loading /></Show>}
      >
        <Show
          when={data()!.res.rows.length > 0}
          fallback={
            <div class="ds-muted">
              No bookmarks yet. Click Read Later on any chapter to bookmark it.
            </div>
          }
        >
          <For each={data()!.res.rows}>
            {(row: BookmarkRow) => (
              <div class="ds-item ds-flex-row" style="padding:4px 6px;">
                <div
                  class="ds-fill ds-clickable"
                  onClick={() =>
                    navigate({
                      view: "reader",
                      chapterPermalink: row.chapter_permalink,
                      chapterTitle: row.chapter_title,
                      seriesPermalink: row.series_permalink,
                      seriesName: row.series_name,
                      startPage: row.page_index,
                    })
                  }
                >
                  <div
                    class="ds-item-title"
                    style="display:inline-flex;align-items:center;gap:4px;flex-wrap:wrap;"
                  >
                    <span>{decodeEntities(row.chapter_title)}</span>
                    <Show when={data()!.fullyCachedSet.has(row.chapter_permalink)}>
                      <i
                        class="bi bi-cloud-check-fill ds-offline-icon"
                        style="color:var(--sys-primary,#0078d4);font-size:11px;"
                        title="Available Offline (Fully Cached)"
                      ></i>
                    </Show>
                  </div>
                  <div class="ds-item-meta">
                    {row.series_name
                      ? `${decodeEntities(row.series_name)} · Saved on ${formatDate(Number(row.created_at))}`
                      : `Saved on ${formatDate(Number(row.created_at))}`}
                  </div>
                </div>
                <button
                  type="button"
                  class="win-button"
                  style="font-size:10px;padding:2px 6px;flex-shrink:0;"
                  title="Open chapter on Dynasty Scans in browser"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    openExternal(`https://dynasty-scans.com/chapters/${row.chapter_permalink}`);
                  }}
                >
                  <i class="bi bi-box-arrow-up-right"></i>
                </button>
                <ConfirmDeleteButton
                  title="Remove bookmark"
                  onConfirm={async () => {
                    await removeBookmark(row.chapter_permalink);
                    refetch();
                  }}
                >
                  <i class="bi bi-trash3"></i>
                </ConfirmDeleteButton>
              </div>
            )}
          </For>
        </Show>
      </Show>
      <Show when={data() !== undefined && data()!.res.totalPages > 1}>
        <Pager
          totalPages={data()!.res.totalPages}
          currentPage={data()!.res.currentPage}
          onPage={setPage}
          cssText="justify-content:flex-end;margin-top:4px;"
        />
      </Show>
    </>
  );
}

// ---------------------------------------------------------------------------
// 4. Reading History
// ---------------------------------------------------------------------------

export function HistoryPane(props: LibraryPaneProps) {
  const [page, setPage] = createSignal(1);
  const [data, { refetch }] = createResource(
    () => ({ page: page(), tick: props.tick() }),
    async ({ page: p }) => {
      const [res, fullyCachedSet] = await Promise.all([
        getHistoryPage(p, 15),
        getFullyCachedChapterPermalinks(),
      ]);
      return { res, fullyCachedSet };
    },
  );
  const showSpinner = useDelayedSpinner(() => data.loading);

  onMount(() => {
    props.register({ refetch: async () => refetch(), reset: () => setPage(1) });
  });

  return (
    <>
      <Show
        when={data() !== undefined}
        fallback={<Show when={showSpinner()}><Loading /></Show>}
      >
        <Show
          when={data()!.res.rows.length > 0}
          fallback={<div class="ds-muted">Nothing read yet.</div>}
        >
          <For each={data()!.res.rows}>
            {(row: HistoryRow) => (
              <div class="ds-item ds-flex-row" style="padding:4px 6px;">
                <div
                  class="ds-fill ds-clickable"
                  onClick={() =>
                    navigate({
                      view: "reader",
                      chapterPermalink: row.chapter_permalink,
                      chapterTitle: row.chapter_title,
                      seriesPermalink: row.series_permalink,
                      seriesName: row.series_name,
                    })
                  }
                >
                  <div
                    class="ds-item-title"
                    style="display:inline-flex;align-items:center;gap:4px;flex-wrap:wrap;"
                  >
                    <span>{decodeEntities(row.chapter_title)}</span>
                    <Show when={data()!.fullyCachedSet.has(row.chapter_permalink)}>
                      <i
                        class="bi bi-cloud-check-fill ds-offline-icon"
                        style="color:var(--sys-primary,#0078d4);font-size:11px;"
                        title="Available Offline (Fully Cached)"
                      ></i>
                    </Show>
                  </div>
                  <div class="ds-item-meta">
                    {decodeEntities(row.series_name)} · {formatDate(Number(row.read_at))}
                  </div>
                </div>
                <button
                  type="button"
                  class="win-button"
                  style="font-size:10px;padding:2px 6px;flex-shrink:0;"
                  title="Open chapter on Dynasty Scans in browser"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    openExternal(`https://dynasty-scans.com/chapters/${row.chapter_permalink}`);
                  }}
                >
                  <i class="bi bi-box-arrow-up-right"></i>
                </button>
                <ConfirmDeleteButton
                  title="Remove from history"
                  onConfirm={async () => {
                    await removeHistory(row.id);
                    refetch();
                  }}
                >
                  <i class="bi bi-trash3"></i>
                </ConfirmDeleteButton>
              </div>
            )}
          </For>
        </Show>
      </Show>
      <Show when={data() !== undefined && data()!.res.totalPages > 1}>
        <Pager
          totalPages={data()!.res.totalPages}
          currentPage={data()!.res.currentPage}
          onPage={setPage}
          cssText="justify-content:flex-end;margin-top:4px;"
        />
      </Show>
    </>
  );
}