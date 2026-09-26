/**
 * Consolidated Library Tab Panes:
 * - CollectionsPane: Custom user collections & favorites
 * - BookmarksPane: Bookmarked chapters with bulk delete
 * - FollowedPane: Followed series with cover hydration and quick continue
 * - HistoryPane: Reading history with page progress and bulk delete
 */

import { createEffect, createSignal, For, Show } from "solid-js";
import { navigate } from "../stores/router";
import { showBanner } from "../stores/topbar";
import { activeProvider } from "../stores/provider";
import { decodeEntities, formatDate, dynastyUrl, errorMessage } from "../utils/formatting";
import { t } from "../i18n";
import { getOrHydrateSeriesCover } from "../api/series";
import {
  getCollections,
  getCollectionsRevision,
  onCollectionsChanged,
  deleteCollection,
} from "../db/collections.repo";
import {
  getBookmarksPage,
  getBookmarksRevision,
  onBookmarksChanged,
  removeBookmark,
  removeBookmarksBatch,
  getFollowedSeriesPage,
  getFollowedRevision,
  onFollowedChanged,
  unfollowSeries,
  updateFollowedSeriesCover,
  getHistoryPage,
  getHistoryRevision,
  onHistoryChanged,
  getProgressRevision,
  onProgressChanged,
  removeHistory,
  removeHistoryBatch,
} from "../db/library.repo";
import { getFullyCachedChapterPermalinks } from "../db/cache.repo";
import { getFullyCachedMdxChapterIds } from "../providers/mangadex/db/cache.repo";
import { deleteCached } from "../db/metadata.repo";
import { seriesCoverKey } from "../lib/cache-keys";
import type {
  CollectionRow,
  BookmarkRow,
  BookmarkPageResult,
  FollowedSeriesRow,
  HistoryRow,
  HistoryPageResult,
} from "../types/db";
import { Loading } from "../components/Feedback";
import { Pager } from "../components/Pager";
import { LibraryItemRow } from "./LibraryItemRow";
import { useLibraryPaneResource, type LibraryPaneProps } from "./useLibraryPaneResource";
import { useBulkSelection } from "../hooks/useBulkSelection";
import { Button, ConfirmDeleteButton } from "../components/Button";
import { FolderIcon, TrashIcon, BookmarkIcon, Icon } from "../components/Icon";

// ── 1. Collections Pane ──────────────────────────────────────────────────────

export interface CollectionsPaneProps extends LibraryPaneProps {
  onOpenDetail: (id: number) => void;
  onCreateNew: () => void;
  onExportCollection?: (id: number, name: string) => void;
}

export function CollectionsPane(props: CollectionsPaneProps) {
  const { data, refetch, showSpinner } = useLibraryPaneResource({
    getRevision: getCollectionsRevision,
    onChanged: onCollectionsChanged,
    fetcher: async () => getCollections(),
    register: props.register,
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
              onOpen={() => openDetail(col)}
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
    </Show>
  );
}

// ── 2. Bookmarks Pane ────────────────────────────────────────────────────────

interface BookmarksPaneData {
  res: BookmarkPageResult;
  fullyCachedSet: Set<string>;
}

export interface BookmarksPaneProps extends LibraryPaneProps {
  onExport?: () => void;
}

export function BookmarksPane(props: BookmarksPaneProps) {
  const { setPage, data, refetch, showSpinner } = useLibraryPaneResource<BookmarksPaneData>({
    getRevision: getBookmarksRevision,
    onChanged: onBookmarksChanged,
    fetcher: async (p) => {
      const res = await getBookmarksPage(p, 15);
      const permalinks = res.rows.map((r) => r.chapter_permalink);
      let fullyCachedSet: Set<string>;
      if (activeProvider() === "mangadex") {
        const chapterIds = permalinks.map((pl) => pl.replace(/^mdx:/, ""));
        const mdxCached = await getFullyCachedMdxChapterIds(chapterIds).catch(() => new Set<string>());
        fullyCachedSet = new Set(Array.from(mdxCached).map((id) => `mdx:${id}`));
      } else {
        fullyCachedSet = await getFullyCachedChapterPermalinks(permalinks).catch(() => new Set<string>());
      }
      return { res, fullyCachedSet };
    },
    register: props.register,
  });

  const { selectMode, selected, toggleSelectMode, toggleRow, deleteSelected, isAllSelected, toggleSelectAll } =
    useBulkSelection<string>(removeBookmarksBatch, refetch);

  const rowKeys = () => data()?.res.rows.map((r) => r.chapter_permalink) ?? [];
  return (
    <>
      <Show
        when={data() !== undefined}
        fallback={<Show when={showSpinner()}><Loading /></Show>}
      >
        <Show
          when={data()!.res.rows.length > 0}
          fallback={
            <div class="ds-library-empty">
              <BookmarkIcon size={28} />
              <span>{t("library.emptyBookmarks")}</span>
            </div>
          }
        >
          <div class="ds-bulk-actions-bar">
            <Show when={!selectMode()}>
              <Show when={props.onExport}>
                <Button
                  icon={<Icon name="box-arrow-up" />}
                  text={t("library.exportButton")}
                  title={t("library.exportBookmarksTooltip")}
                  onClick={props.onExport}
                />
              </Show>
              <Button text={t("library.selectModeButton")} onClick={toggleSelectMode} />
            </Show>
            <Show when={selectMode()}>
              <Button
                text={isAllSelected(rowKeys()) ? t("common.deselectAll") : t("common.selectAll")}
                onClick={() => toggleSelectAll(rowKeys())}
              />
              <span class="ds-muted" style="font-size:12px;">{t("library.selectedCount", { count: selected().size })}</span>
              <ConfirmDeleteButton
                icon={<TrashIcon />}
                text={t("library.deleteSelected", { count: selected().size })}
                disabled={selected().size === 0}
                onConfirm={deleteSelected}
              />
              <Button text={t("common.cancel")} onClick={toggleSelectMode} />
            </Show>
          </div>
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
                externalUrl={
                  row.chapter_permalink.startsWith("mdx:")
                    ? `https://mangadex.org/chapter/${row.chapter_permalink.replace(/^mdx:/, "")}`
                    : dynastyUrl("chapters", row.chapter_permalink)
                }
                selectionMode={selectMode()}
                selected={selected().has(row.chapter_permalink)}
                onToggleSelect={() => toggleRow(row.chapter_permalink)}
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

// ── 3. Followed Series Pane ──────────────────────────────────────────────────

export function FollowedPane(props: LibraryPaneProps) {
  const { setPage, data, refetch, showSpinner } = useLibraryPaneResource({
    getRevision: getFollowedRevision,
    onChanged: onFollowedChanged,
    fetcher: (p) => getFollowedSeriesPage(p, 10),
    register: props.register,
  });

  return (
    <>
      <Show
        when={data() !== undefined}
        fallback={<Show when={showSpinner()}><Loading /></Show>}
      >
        <Show
          when={data()!.rows.length > 0}
          fallback={
            <div class="ds-library-empty">
              <Icon name="bookmark-heart" style="font-size:28px;margin-bottom:4px;" />
              <span>{t("library.emptyFollowed")}</span>
            </div>
          }
        >
          <For each={data()!.rows}>
            {(row) => (
              <FollowedSeriesRowCard row={row} refetch={refetch} />
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

function FollowedSeriesRowCard(props: {
  row: FollowedSeriesRow;
  refetch: () => void;
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
      externalUrl={
        props.row.permalink.startsWith("mdx:")
          ? `https://mangadex.org/title/${props.row.permalink.replace(/^mdx:/, "")}`
          : dynastyUrl("series", props.row.permalink)
      }
      deleteTitle={t("library.unfollowTooltip")}
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

interface HistoryPaneData {
  res: HistoryPageResult;
  fullyCachedSet: Set<string>;
}

export interface HistoryPaneProps extends LibraryPaneProps {
  onClearHistory?: () => Promise<void>;
}

export function HistoryPane(props: HistoryPaneProps) {
  const { setPage, data, refetch, showSpinner } = useLibraryPaneResource<HistoryPaneData>({
    getRevision: () => getHistoryRevision() + getProgressRevision(),
    onChanged: (cb) => {
      const u1 = onHistoryChanged(cb);
      const u2 = onProgressChanged(cb);
      return () => {
        u1();
        u2();
      };
    },
    fetcher: async (p) => {
      const res = await getHistoryPage(p, 15);
      const permalinks = res.rows.map((r) => r.chapter_permalink);
      let fullyCachedSet: Set<string>;
      if (activeProvider() === "mangadex") {
        const chapterIds = permalinks.map((pl) => pl.replace(/^mdx:/, ""));
        const mdxCached = await getFullyCachedMdxChapterIds(chapterIds).catch(() => new Set<string>());
        fullyCachedSet = new Set(Array.from(mdxCached).map((id) => `mdx:${id}`));
      } else {
        fullyCachedSet = await getFullyCachedChapterPermalinks(permalinks).catch(() => new Set<string>());
      }
      return { res, fullyCachedSet };
    },
    register: props.register,
  });

  const { selectMode, selected, toggleSelectMode, toggleRow, deleteSelected, isAllSelected, toggleSelectAll } =
    useBulkSelection<number>(removeHistoryBatch, refetch);

  const rowKeys = () => data()?.res.rows.map((r) => r.id) ?? [];
  return (
    <>
      <Show
        when={data() !== undefined}
        fallback={<Show when={showSpinner()}><Loading /></Show>}
      >
        <Show
          when={data()!.res.rows.length > 0}
          fallback={
            <div class="ds-library-empty">
              <Icon name="clock-history" style="font-size:28px;margin-bottom:4px;" />
              <span>{t("library.emptyHistory")}</span>
            </div>
          }
        >
          <div class="ds-bulk-actions-bar">
            <Show when={!selectMode()}>
              <Show when={props.onClearHistory}>
                <ConfirmDeleteButton
                  icon={<TrashIcon />}
                  text={t("library.clearHistoryButton")}
                  title={t("library.clearHistoryTooltip")}
                  onConfirm={props.onClearHistory!}
                />
              </Show>
              <Button text={t("library.selectModeButton")} onClick={toggleSelectMode} />
            </Show>
            <Show when={selectMode()}>
              <Button
                text={isAllSelected(rowKeys()) ? t("common.deselectAll") : t("common.selectAll")}
                onClick={() => toggleSelectAll(rowKeys())}
              />
              <span class="ds-muted" style="font-size:12px;">{t("library.selectedCount", { count: selected().size })}</span>
              <ConfirmDeleteButton
                icon={<TrashIcon />}
                text={t("library.deleteSelected", { count: selected().size })}
                disabled={selected().size === 0}
                onConfirm={deleteSelected}
              />
              <Button text={t("common.cancel")} onClick={toggleSelectMode} />
            </Show>
          </div>
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
                externalUrl={
                  row.chapter_permalink.startsWith("mdx:")
                    ? `https://mangadex.org/chapter/${row.chapter_permalink.replace(/^mdx:/, "")}`
                    : dynastyUrl("chapters", row.chapter_permalink)
                }
                selectionMode={selectMode()}
                selected={selected().has(row.id)}
                onToggleSelect={() => toggleRow(row.id)}
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
