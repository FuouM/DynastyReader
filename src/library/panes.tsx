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
import { decodeEntities, formatDate, navigate, showBanner, SITE_ROOT } from "../stores";
import { t } from "../i18n";
import { errorMessage } from "../utils/errors";
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
                    ? `${t("library.latestChapterPrefix", { title: decodeEntities(row.latest_chapter_title) })}${t("library.followedOn", { date: formatDate(Number(row.created_at)) })}`
                    : t("library.followedOn", { date: formatDate(Number(row.created_at)) })
                }
                cover={row.cover}
                coverAlt={row.name}
                onOpen={() => openSeries(row)}
                actionLabel={t("common.open")}
                actionIcon="bi-folder2-open"
                externalUrl={`${SITE_ROOT}/series/${row.permalink}`}
                deleteTitle={t("library.unfollowTooltip")}
                onDelete={async () => {
                  try {
                    await unfollowSeries(row.permalink);
                    showBanner(t("library.unfollowedBanner", { name: row.name }));
                    refetch();
                  } catch (err) {
                    const msg = errorMessage(err);
                    showBanner(t("library.unfollowErrorBanner", { msg }));
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
              subtitle={`${t("library.itemsCount", { count: col.itemCount ?? 0, noun: col.itemCount === 1 ? t("library.nounItem") : t("library.nounItems") })}${
                col.is_default ? t("library.defaultCollectionBadge") : ""
              }`}
              icon={col.is_default ? "bi-star-fill" : "bi-folder2-open"}
              iconColor={col.is_default ? "#d97706" : "var(--sys-primary,#0078d4)"}
              onOpen={() => openDetail(col)}
              actionLabel={t("common.open")}
              actionIcon="bi-folder2-open"
              deleteTitle={t("library.deleteCollectionTooltip")}
              onDelete={
                !col.is_default
                  ? async () => {
                      try {
                        await deleteCollection(col.id);
                        showBanner(t("library.deletedCollectionBanner", { name: col.name }));
                        refetch();
                      } catch (err) {
                        const msg = errorMessage(err);
                        showBanner(t("library.deleteCollectionErrorBanner", { msg }));
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
                    ? `${decodeEntities(row.series_name)} · ${t("library.savedOn", { date: formatDate(Number(row.created_at)) })}`
                    : t("library.savedOn", { date: formatDate(Number(row.created_at)) })
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
                externalUrl={`${SITE_ROOT}/chapters/${row.chapter_permalink}`}
                deleteTitle={t("library.removeBookmarkTooltip")}
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
                subtitle={`${decodeEntities(row.series_name)} · ${t("library.readOn", { date: formatDate(Number(row.read_at)) })}`}
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
                externalUrl={`${SITE_ROOT}/chapters/${row.chapter_permalink}`}
                deleteTitle={t("library.removeFromHistoryTooltip")}
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