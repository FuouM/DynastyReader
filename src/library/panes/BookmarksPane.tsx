/**
 * Library Bookmarks panel.
 */

import { createSignal, For, Show } from "solid-js";
import { navigate } from "../../stores/router";
import { decodeEntities } from "../../utils/html";
import { formatDate } from "../../utils/formatting";
import { dynastyUrl } from "../../utils/url";
import { t } from "../../i18n";
import { getBookmarksPage, getBookmarksRevision, onBookmarksChanged, removeBookmark, removeBookmarksBatch } from "../../db/library.repo";
import { getFullyCachedChapterPermalinks } from "../../db/cache.repo";
import type { BookmarkRow, BookmarkPageResult } from "../../types/db";
import { Loading } from "../../components/Loading";
import { Pager } from "../../components/Pager";
import { LibraryItemRow } from "../LibraryItemRow";
import { useLibraryPaneResource, type LibraryPaneProps } from "../useLibraryPaneResource";
import { Button, ConfirmDeleteButton } from "../../components/Button";
import { TrashIcon } from "../../components/Icon";

interface BookmarksPaneData {
  res: BookmarkPageResult;
  fullyCachedSet: Set<string>;
}

export function BookmarksPane(props: LibraryPaneProps) {
  const { setPage, data, refetch, showSpinner } = useLibraryPaneResource<BookmarksPaneData>({
    getRevision: getBookmarksRevision,
    onChanged: onBookmarksChanged,
    fetcher: async (p) => {
      const res = await getBookmarksPage(p, 15);
      const permalinks = res.rows.map((r) => r.chapter_permalink);
      const fullyCachedSet = await getFullyCachedChapterPermalinks(permalinks).catch(() => new Set<string>());
      return { res, fullyCachedSet };
    },
    register: props.register,
  });

  // QoL-L3: bulk-select mode for deleting multiple bookmarks at once.
  const [selectMode, setSelectMode] = createSignal(false);
  const [selected, setSelected] = createSignal<Set<string>>(new Set());

  const toggleSelectMode = (): void => {
    setSelectMode((v) => !v);
    setSelected(new Set<string>());
  };

  const toggleRow = (chapterPermalink: string): void => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(chapterPermalink)) next.delete(chapterPermalink);
      else next.add(chapterPermalink);
      return next;
    });
  };

  const deleteSelected = async (): Promise<void> => {
    const permalinks = [...selected()];
    if (permalinks.length === 0) return;
    await removeBookmarksBatch(permalinks);
    setSelected(new Set<string>());
    setSelectMode(false);
    refetch();
  };

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
          <div style="display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-bottom:6px;">
            <Show when={!selectMode()}>
              <Button text={t("library.selectModeButton")} onClick={toggleSelectMode} />
            </Show>
            <Show when={selectMode()}>
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
                externalUrl={dynastyUrl("chapters", row.chapter_permalink)}
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
