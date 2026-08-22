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

} from "solid-js";
import { decodeEntities, formatDate, navigate, showBanner } from "../stores";
import { t } from "../i18n";
import {
  getFollowedSeriesPage,
  getFollowedRevision,
  onFollowedChanged,
  getBookmarksPage,
  getBookmarksRevision,
  onBookmarksChanged,
  getHistoryPage,
  getHistoryRevision,
  onHistoryChanged,
  getFullyCachedChapterPermalinks,
  getCollections,
  getCollectionsRevision,
  onCollectionsChanged,
  deleteCollection,
  removeBookmark,
  removeHistory,
  unfollowSeries,
  type FollowedSeriesRow,
  type BookmarkRow,
  type HistoryRow,
  type CollectionRow,
} from "../db";
import { useDelayedSpinner } from "../browse/browse-state";
import { Loading } from "../components/Loading";
import { Pager } from "../components/Pager";
import { LibraryItemRow } from "./LibraryItemRow";

export interface LibraryPaneApi {
  /** Forces a refetch of the panel data (keeps current page). */
  refetch: () => Promise<unknown>;
  /** Resets pagination back to page 1. */
  reset: () => void;
}

export interface LibraryPaneProps {
  register: (api: LibraryPaneApi) => void;
}

// ---------------------------------------------------------------------------
// 1. Followed Series
// ---------------------------------------------------------------------------

export function FollowedPane(props: LibraryPaneProps) {
  const [page, setPage] = createSignal(1);
  const [rev, setRev] = createSignal(getFollowedRevision());
  onMount(() => {
    const unsub = onFollowedChanged(() => setRev(getFollowedRevision()));
    onCleanup(unsub);
  });
  const [data, { refetch }] = createResource(
    () => ({ page: page(), rev: rev() }),
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
              {t("library.emptyFollowed")}
            </div>
          }
        >
          <For each={data()!.rows}>
            {(row) => (
              <LibraryItemRow
                title={row.name}
                subtitle={
                  row.latest_chapter_title
                    ? `Latest: ${decodeEntities(row.latest_chapter_title)} · Followed on ${formatDate(Number(row.created_at))}`
                    : `Followed on ${formatDate(Number(row.created_at))}`
                }
                cover={row.cover}
                coverAlt={row.name}
                onOpen={() => openSeries(row)}
                actionLabel="Open"
                actionIcon="bi-folder2-open"
                externalUrl={`https://dynasty-scans.com/series/${row.permalink}`}
                deleteTitle="Unfollow series"
                onDelete={async () => {
                  try {
                    await unfollowSeries(row.permalink);
                    showBanner(`Unfollowed "${row.name}".`);
                    refetch();
                  } catch (err) {
                    const msg = err instanceof Error ? err.message : String(err);
                    showBanner(`Could not unfollow: ${msg}`);
                    throw err;
                  }
                }}
              />
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
    rev,
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
        fallback={<div class="ds-muted">{t("library.emptyCollections")}</div>}
      >
        <For each={data()!}>
          {(col) => (
            <LibraryItemRow
              title={col.name}
              subtitle={`${col.itemCount ?? 0} items${
                col.is_default ? " · Default Collection" : ""
              }`}
              icon={col.is_default ? "bi-star-fill" : "bi-folder2-open"}
              iconColor={col.is_default ? "#d97706" : "var(--sys-primary,#0078d4)"}
              onOpen={() => openDetail(col)}
              actionLabel="Open"
              actionIcon="bi-folder2-open"
              deleteTitle="Delete collection"
              onDelete={
                !col.is_default
                  ? async () => {
                      try {
                        await deleteCollection(col.id);
                        showBanner(`Deleted collection "${col.name}".`);
                        refetch();
                      } catch (err) {
                        const msg = err instanceof Error ? err.message : String(err);
                        showBanner(`Could not delete collection: ${msg}`);
                        throw err;
                      }
                    }
                  : undefined
              }
            />
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
  const [rev, setRev] = createSignal(getBookmarksRevision());
  onMount(() => {
    const unsub = onBookmarksChanged(() => setRev(getBookmarksRevision()));
    onCleanup(unsub);
  });
  const [data, { refetch }] = createResource(
    () => ({ page: page(), rev: rev() }),
    async ({ page: p }) => {
      const res = await getBookmarksPage(p, 15);
      const permalinks = res.rows.map((r) => r.chapter_permalink);
      const fullyCachedSet = await getFullyCachedChapterPermalinks(permalinks).catch(() => new Set<string>());
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
              {t("library.emptyBookmarks")}
            </div>
          }
        >
          <For each={data()!.res.rows}>
            {(row: BookmarkRow) => (
              <LibraryItemRow
                title={row.chapter_title}
                subtitle={
                  row.series_name
                    ? `${decodeEntities(row.series_name)} · Saved on ${formatDate(Number(row.created_at))}`
                    : `Saved on ${formatDate(Number(row.created_at))}`
                }
                isFullyCached={data()!.fullyCachedSet.has(row.chapter_permalink)}
                onOpen={() =>
                  navigate({
                    view: "reader",
                    chapterPermalink: row.chapter_permalink,
                    chapterTitle: row.chapter_title,
                    seriesPermalink: row.series_permalink,
                    seriesName: row.series_name,
                    startPage: row.page_index,
                  })
                }
                externalUrl={`https://dynasty-scans.com/chapters/${row.chapter_permalink}`}
                deleteTitle="Remove bookmark"
                onDelete={async () => {
                  await removeBookmark(row.chapter_permalink);
                  refetch();
                }}
              />
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
  const [rev, setRev] = createSignal(getHistoryRevision());
  onMount(() => {
    const unsub = onHistoryChanged(() => setRev(getHistoryRevision()));
    onCleanup(unsub);
  });
  const [data, { refetch }] = createResource(
    () => ({ page: page(), rev: rev() }),
    async ({ page: p }) => {
      const res = await getHistoryPage(p, 15);
      const permalinks = res.rows.map((r) => r.chapter_permalink);
      const fullyCachedSet = await getFullyCachedChapterPermalinks(permalinks).catch(() => new Set<string>());
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
          fallback={<div class="ds-muted">{t("library.emptyHistory")}</div>}
        >
          <For each={data()!.res.rows}>
            {(row: HistoryRow) => (
              <LibraryItemRow
                title={row.chapter_title}
                subtitle={`${decodeEntities(row.series_name)} · ${formatDate(Number(row.read_at))}`}
                isFullyCached={data()!.fullyCachedSet.has(row.chapter_permalink)}
                onOpen={() =>
                  navigate({
                    view: "reader",
                    chapterPermalink: row.chapter_permalink,
                    chapterTitle: row.chapter_title,
                    seriesPermalink: row.series_permalink,
                    seriesName: row.series_name,
                  })
                }
                externalUrl={`https://dynasty-scans.com/chapters/${row.chapter_permalink}`}
                deleteTitle="Remove from history"
                onDelete={async () => {
                  await removeHistory(row.id);
                  refetch();
                }}
              />
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