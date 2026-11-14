/**
 * Consolidated Library Tab Panes:
 * - CollectionsPane: Custom user collections & favorites
 * - BookmarksPane: Bookmarked chapters with bulk delete
 * - FollowedPane: Followed series with cover hydration and quick continue
 * - HistoryPane: Reading history with page progress and bulk delete
 */

import { createEffect, createSignal, For, Show, type JSX } from "solid-js";
import { navigate } from "../stores/router";
import { showBanner } from "../stores/topbar";
import { activeProvider } from "../stores/provider";
import { decodeEntities, formatDate, canonicalUrl, errorMessage } from "../utils/formatting";
import { t } from "../i18n";
import { getOrHydrateSeriesCover } from "../api/series";
import {
  getCollections,
  getCollectionsRevision,
  deleteCollection,
} from "../db/collections.repo";
import {
  getBookmarksPage,
  getBookmarksRevision,
  removeBookmark,
  removeBookmarksBatch,
  getFollowedSeriesPage,
  getFollowedRevision,
  unfollowSeries,
  updateFollowedSeriesCover,
  getHistoryPage,
  getHistoryRevision,
  getProgressRevision,
  removeHistory,
  removeHistoryBatch,
} from "../db/library.repo";
import { getFullyCachedChapterPermalinks } from "../db/cache.repo";
import { deleteCached } from "../db/metadata.repo";
import { seriesCoverKey } from "../lib/cache-keys";
import type {
  BookmarkRow,
  BookmarkSortMode,
  FollowedSeriesRow,
  FollowedSortMode,
  HistoryRow,
  HistorySortMode,
} from "../types/db";
import { Button, ConfirmDeleteButton, Select, InputField, Icon, type SelectOption } from "soulwindow/solid";
import { Pager } from "../components/Pager";
import { LibraryItemRow } from "./LibraryItemRow";
import { useLibraryPaneResource, type LibraryPaneProps } from "./useLibraryPaneResource";
import { useBulkSelection } from "../hooks/useBulkSelection";
import { persistedSignal } from "../lib/persisted-signal";
import { FolderIcon, TrashIcon, BookmarkIcon } from "../components/icons";
import { BulkSelectionBar, PaneLoadGate, longPressSelect, type BulkSelection } from "./LibraryPaneParts";

// ── Shared pane chrome ───────────────────────────────────────────────────────

/** A page of chapter rows plus which of them are fully cached offline. */
interface ChapterPaneData<R> {
  res: R;
  fullyCachedSet: Set<string>;
}

async function withFullyCachedSet<R extends { rows: { chapter_permalink: string }[] }>(
  res: R,
): Promise<ChapterPaneData<R>> {
  const permalinks = res.rows.map((r) => r.chapter_permalink);
  const fullyCachedSet = await getFullyCachedChapterPermalinks(permalinks).catch(() => new Set<string>());
  return { res, fullyCachedSet };
}

/** Search + sort controls (hidden in select mode) and the bulk-selection bar. */
function PaneToolbar<K>(props: {
  selection: BulkSelection<K>;
  keys: K[];
  query: string;
  onQuery: (value: string) => void;
  placeholder: string;
  sort: string;
  onSort: (value: string) => void;
  sortOptions: SelectOption[];
  children?: JSX.Element;
}) {
  return (
    <div
      class="ds-library-pane-toolbar"
      style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:4px;margin-bottom:4px;"
    >
      <Show when={!props.selection.selectMode()} fallback={<div />}>
        <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;">
          <InputField
            value={props.query}
            onInput={props.onQuery}
            placeholder={props.placeholder}
            style="width:180px;"
          />
          <Select value={props.sort} onChange={props.onSort} options={props.sortOptions} />
        </div>
      </Show>
      <BulkSelectionBar selection={props.selection} keys={props.keys} style="margin-left:auto;">
        {props.children}
      </BulkSelectionBar>
    </div>
  );
}

/** Empty-pane notice, or the "no search results" line when a filter is active. */
function PaneEmpty(props: { filtered: boolean; query: string; icon: JSX.Element; message: string }) {
  return (
    <Show
      when={props.filtered}
      fallback={
        <div class="ds-library-empty">
          {props.icon}
          <span>{props.message}</span>
        </div>
      }
    >
      <div class="ds-muted" style="padding:12px;text-align:center;">
        {t("library.noSearchResults", { query: props.query })}
      </div>
    </Show>
  );
}

function PanePager(props: {
  page: { totalPages: number; currentPage: number } | undefined;
  onPage: (page: number) => void;
}) {
  return (
    <Show when={props.page !== undefined && props.page.totalPages > 1}>
      <Pager
        totalPages={props.page!.totalPages}
        currentPage={props.page!.currentPage}
        onPage={props.onPage}
        cssText="justify-content:flex-end;margin-top:4px;"
      />
    </Show>
  );
}

// ── 1. Collections Pane ──────────────────────────────────────────────────────

export interface CollectionsPaneProps extends LibraryPaneProps {
  onOpenDetail: (id: number) => void;
  onExportCollection?: (id: number, name: string) => void;
}

export function CollectionsPane(props: CollectionsPaneProps) {
  const { data, refetch, showSpinner, error } = useLibraryPaneResource({
    getRevision: getCollectionsRevision,
    fetcher: async () => getCollections(),
    register: props.register,
  });

  return (
    <PaneLoadGate
      loaded={data() !== undefined}
      error={error()}
      showSpinner={showSpinner()}
      onRetry={() => void refetch()}
    >
      <Show
        when={data()!.length > 0}
        fallback={
          <div class="ds-library-empty">
            <FolderIcon size={28} />
            <span>{t("library.emptyCollections")}</span>
          </div>
        }
      >
        <For each={data()!}>
          {(col) => (
            <LibraryItemRow
              title={col.name}
              subtitle={`${t("library.itemsCount", { count: col.itemCount ?? 0, noun: col.itemCount === 1 ? t("library.nounItem") : t("library.nounItems") })}${
                col.is_default ? t("library.defaultCollectionBadge") : ""
              }`}
              icon={col.is_default ? "bi-star-fill" : "bi-folder2-open"}
              iconColor={col.is_default ? "#d97706" : "var(--sys-link, #0078d4)"}
              onOpen={() => props.onOpenDetail(col.id)}
              actionLabel={t("common.open")}
              actionIcon="bi-folder2-open"
              exportTitle={t("library.exportCollectionTooltip")}
              onExport={
                props.onExportCollection
                  ? () => props.onExportCollection!(col.id, col.name)
                  : undefined
              }
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
    </PaneLoadGate>
  );
}

// ── 2. Bookmarks Pane ────────────────────────────────────────────────────────

export interface BookmarksPaneProps extends LibraryPaneProps {
  onExport?: () => void;
}

export function BookmarksPane(props: BookmarksPaneProps) {
  const [searchQuery, setSearchQuery] = createSignal("");
  const [sortMode, setSortMode] = persistedSignal<BookmarkSortMode>("recent", {
    name: "ds_bookmarks_sort",
    deserialize: (v) => (v === "oldest" || v === "alphabetical" ? v : "recent"),
  });

  const { setPage, data, refetch, showSpinner, error } = useLibraryPaneResource({
    getRevision: getBookmarksRevision,
    deps: () => ({ q: searchQuery(), sort: sortMode() }),
    fetcher: async (p) =>
      withFullyCachedSet(
        await getBookmarksPage(p, 15, activeProvider(), {
          query: searchQuery(),
          sort: sortMode(),
        }),
      ),
    register: props.register,
  });
  const selection = useBulkSelection<string>(removeBookmarksBatch, refetch);

  const isFiltered = () => searchQuery().trim().length > 0;
  const hasRows = () => (data()?.res.rows.length ?? 0) > 0;
  const showControls = () => data() !== undefined && (data()!.res.totalCount > 0 || isFiltered());

  return (
    <>
      <Show when={showControls()}>
        <PaneToolbar
          selection={selection}
          keys={data()?.res.rows.map((r) => r.chapter_permalink) ?? []}
          query={searchQuery()}
          onQuery={setSearchQuery}
          placeholder={t("library.searchBookmarksPlaceholder")}
          sort={sortMode()}
          onSort={(v) => setSortMode(v as BookmarkSortMode)}
          sortOptions={[
            { value: "recent", label: t("library.sortRecentlySaved") },
            { value: "oldest", label: t("library.sortOldestSaved") },
            { value: "alphabetical", label: t("library.sortAlphabetical") },
          ]}
        >
          <Show when={props.onExport}>
            <Button
              icon={<Icon name="box-arrow-up" />}
              text={t("library.exportButton")}
              title={t("library.exportBookmarksTooltip")}
              onClick={props.onExport}
            />
          </Show>
        </PaneToolbar>
      </Show>

      <PaneLoadGate
        loaded={data() !== undefined}
        error={error()}
        showSpinner={showSpinner()}
        onRetry={() => void refetch()}
      >
        <Show
          when={hasRows()}
          fallback={
            <PaneEmpty
              filtered={isFiltered()}
              query={searchQuery()}
              icon={<BookmarkIcon size={28} />}
              message={t("library.emptyBookmarks")}
            />
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
                externalUrl={canonicalUrl("chapters", row.chapter_permalink)}
                selectionMode={selection.selectMode()}
                selected={selection.selected().has(row.chapter_permalink)}
                onToggleSelect={() => selection.toggleRow(row.chapter_permalink)}
                onLongPress={() => longPressSelect(selection, row.chapter_permalink)}
                deleteTitle={t("library.removeBookmarkTooltip")}
                onDelete={async () => {
                  await removeBookmark(row.chapter_permalink);
                  refetch();
                }}
              />
            )}
          </For>
        </Show>
      </PaneLoadGate>
      <PanePager page={data()?.res} onPage={setPage} />
    </>
  );
}

// ── 3. Followed Series Pane ──────────────────────────────────────────────────

export function FollowedPane(props: LibraryPaneProps) {
  const [searchQuery, setSearchQuery] = createSignal("");
  const [sortMode, setSortMode] = persistedSignal<FollowedSortMode>("alphabetical", {
    name: "ds_followed_sort",
    deserialize: (v) =>
      v === "recent_checked" || v === "recent_added" ? v : "alphabetical",
  });

  const { setPage, data, refetch, showSpinner, error } = useLibraryPaneResource({
    getRevision: getFollowedRevision,
    deps: () => ({ q: searchQuery(), sort: sortMode() }),
    fetcher: (p) =>
      getFollowedSeriesPage(p, 10, activeProvider(), {
        query: searchQuery(),
        sort: sortMode(),
      }),
    register: props.register,
  });
  const selection = useBulkSelection<string>(async (perms) => {
    for (const p of perms) {
      await unfollowSeries(p);
    }
  }, refetch);

  const isFiltered = () => searchQuery().trim().length > 0;
  const hasRows = () => (data()?.rows.length ?? 0) > 0;
  const showControls = () => data() !== undefined && (data()!.totalCount > 0 || isFiltered());

  return (
    <>
      <Show when={showControls()}>
        <PaneToolbar
          selection={selection}
          keys={data()?.rows.map((r) => r.permalink) ?? []}
          query={searchQuery()}
          onQuery={setSearchQuery}
          placeholder={t("library.searchFollowedPlaceholder")}
          sort={sortMode()}
          onSort={(v) => setSortMode(v as FollowedSortMode)}
          sortOptions={[
            { value: "alphabetical", label: t("library.sortAlphabetical") },
            { value: "recent_added", label: t("library.sortDateAdded") },
            { value: "recent_checked", label: t("library.sortRecentlyUpdated") },
          ]}
        />
      </Show>

      <PaneLoadGate
        loaded={data() !== undefined}
        error={error()}
        showSpinner={showSpinner()}
        onRetry={() => void refetch()}
      >
        <Show
          when={hasRows()}
          fallback={
            <PaneEmpty
              filtered={isFiltered()}
              query={searchQuery()}
              icon={<Icon name="bookmark-heart" />}
              message={t("library.emptyFollowed")}
            />
          }
        >
          <For each={data()!.rows}>
            {(row) => (
              <FollowedSeriesRowCard
                row={row}
                refetch={refetch}
                selectionMode={selection.selectMode()}
                selected={selection.selected().has(row.permalink)}
                onToggleSelect={() => selection.toggleRow(row.permalink)}
                onLongPress={() => longPressSelect(selection, row.permalink)}
              />
            )}
          </For>
        </Show>
      </PaneLoadGate>
      <PanePager page={data()} onPage={setPage} />
    </>
  );
}

function FollowedSeriesRowCard(props: {
  row: FollowedSeriesRow;
  refetch: () => void;
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  onLongPress?: () => void;
}) {
  const [cover, setCover] = createSignal(props.row.cover);

  createEffect(() => {
    setCover(props.row.cover);
  });

  const hydrate = async () => {
    try {
      const freshPath = await getOrHydrateSeriesCover(props.row.permalink);
      if (freshPath) {
        setCover(freshPath);
        void updateFollowedSeriesCover(props.row.permalink, freshPath, false);
      }
    } catch {
      // Keep placeholder
    }
  };

  createEffect(() => {
    const c = cover();
    if (c && (c.includes("/") || c.includes("\\"))) return;
    void hydrate();
  });

  const handleCoverError = async () => {
    await updateFollowedSeriesCover(props.row.permalink, null, false);
    await deleteCached(seriesCoverKey(props.row.permalink));
    setCover(null);
    void hydrate();
  };

  const openSeries = (): void => {
    navigate({ view: "series", seriesPermalink: props.row.permalink, seriesName: props.row.name });
  };

  const continueReading = (): void => {
    if (props.row.latest_chapter_permalink) {
      navigate({
        view: "reader",
        seriesPermalink: props.row.permalink,
        chapterPermalink: props.row.latest_chapter_permalink,
        chapterTitle: props.row.latest_chapter_title ?? props.row.latest_chapter_permalink,
        seriesName: props.row.name,
      });
    } else {
      openSeries();
    }
  };

  return (
    <LibraryItemRow
      title={props.row.name}
      subtitle={
        props.row.latest_chapter_title
          ? `${t("library.latestChapterPrefix", { title: decodeEntities(props.row.latest_chapter_title) })}${t("library.followedOn", { date: formatDate(Number(props.row.created_at)) })}`
          : t("library.followedOn", { date: formatDate(Number(props.row.created_at)) })
      }
      cover={cover()}
      coverAlt={props.row.name}
      onOpen={openSeries}
      onCoverError={handleCoverError}
      onCoverRetry={handleCoverError}
      actionLabel={t("common.open")}
      actionIcon="bi-folder2-open"
      playTitle={t("library.continueReading")}
      onPlay={props.row.latest_chapter_permalink ? continueReading : undefined}
      externalUrl={canonicalUrl("series", props.row.permalink)}
      deleteTitle={t("library.unfollowTooltip")}
      selectionMode={props.selectionMode}
      selected={props.selected}
      onToggleSelect={props.onToggleSelect}
      onLongPress={props.onLongPress}
      onDelete={async () => {
        try {
          await unfollowSeries(props.row.permalink);
          showBanner(t("library.unfollowedBanner", { name: props.row.name }));
          props.refetch();
        } catch (err) {
          const msg = errorMessage(err);
          showBanner(t("library.unfollowErrorBanner", { msg }));
          throw err;
        }
      }}
    />
  );
}

// ── 4. Reading History Pane ──────────────────────────────────────────────────

export interface HistoryPaneProps extends LibraryPaneProps {
  onClearHistory?: () => Promise<void>;
}

export function HistoryPane(props: HistoryPaneProps) {
  const [searchQuery, setSearchQuery] = createSignal("");
  const [sortMode, setSortMode] = persistedSignal<HistorySortMode>("recent", {
    name: "ds_history_sort",
    deserialize: (v) => (v === "oldest" || v === "alphabetical" ? v : "recent"),
  });

  const { setPage, data, refetch, showSpinner, error } = useLibraryPaneResource({
    id: "history",
    getRevision: () => getHistoryRevision() + getProgressRevision(),
    deps: () => ({ q: searchQuery(), sort: sortMode() }),
    fetcher: async (p) =>
      withFullyCachedSet(
        await getHistoryPage(p, 15, activeProvider(), {
          query: searchQuery(),
          sort: sortMode(),
        }),
      ),
    register: props.register,
  });
  const selection = useBulkSelection<number>(removeHistoryBatch, refetch);

  const isFiltered = () => searchQuery().trim().length > 0;
  const hasRows = () => (data()?.res.rows.length ?? 0) > 0;
  const showControls = () => data() !== undefined && (data()!.res.totalCount > 0 || isFiltered());

  return (
    <>
      <Show when={showControls()}>
        <PaneToolbar
          selection={selection}
          keys={data()?.res.rows.map((r) => r.id) ?? []}
          query={searchQuery()}
          onQuery={setSearchQuery}
          placeholder={t("library.searchHistoryPlaceholder")}
          sort={sortMode()}
          onSort={(v) => setSortMode(v as HistorySortMode)}
          sortOptions={[
            { value: "recent", label: t("library.sortRecentlyRead") },
            { value: "oldest", label: t("library.sortOldestRead") },
            { value: "alphabetical", label: t("library.sortAlphabetical") },
          ]}
        >
          <Show when={props.onClearHistory}>
            <ConfirmDeleteButton
              icon={<TrashIcon />}
              text={t("library.clearHistoryButton")}
              title={t("library.clearHistoryTooltip")}
              onConfirm={props.onClearHistory!}
            />
          </Show>
        </PaneToolbar>
      </Show>

      <PaneLoadGate
        loaded={data() !== undefined}
        error={error()}
        showSpinner={showSpinner()}
        onRetry={() => void refetch()}
      >
        <Show
          when={hasRows()}
          fallback={
            <PaneEmpty
              filtered={isFiltered()}
              query={searchQuery()}
              icon={<Icon name="clock-history" />}
              message={t("library.emptyHistory")}
            />
          }
        >
          <For each={data()!.res.rows}>
            {(row: HistoryRow) => (
              <LibraryItemRow
                title={row.chapter_title}
                subtitle={`${decodeEntities(row.series_name)} · ${t("library.readOn", { date: formatDate(Number(row.read_at)) })}`}
                badge={
                  row.completed === 1
                    ? `✓ ${t("series.completedBadge")}`
                    : typeof row.page_index === "number" && typeof row.page_total === "number" && row.page_total > 0
                      ? `Pg ${row.page_index + 1}/${row.page_total}`
                      : undefined
                }
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
                externalUrl={canonicalUrl("chapters", row.chapter_permalink)}
                selectionMode={selection.selectMode()}
                selected={selection.selected().has(row.id)}
                onToggleSelect={() => selection.toggleRow(row.id)}
                onLongPress={() => longPressSelect(selection, row.id)}
                deleteTitle={t("library.removeFromHistoryTooltip")}
                onDelete={async () => {
                  await removeHistory(row.id);
                  refetch();
                }}
              />
            )}
          </For>
        </Show>
      </PaneLoadGate>
      <PanePager page={data()?.res} onPage={setPage} />
    </>
  );
}
