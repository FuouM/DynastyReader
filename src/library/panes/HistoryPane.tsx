/**
 * Library Reading History panel.
 */

import { For, Show } from "solid-js";
import { navigate } from "../../stores/router";
import { decodeEntities } from "../../utils/html";
import { formatDate } from "../../utils/formatting";
import { dynastyUrl } from "../../utils/url";
import { t } from "../../i18n";
import { getHistoryPage, getHistoryRevision, onHistoryChanged, getProgressRevision, onProgressChanged, removeHistory, removeHistoryBatch } from "../../db/library.repo";
import { getFullyCachedChapterPermalinks } from "../../db/cache.repo";
import type { HistoryRow, HistoryPageResult } from "../../types/db";
import { Loading } from "../../components/Loading";
import { Pager } from "../../components/Pager";
import { LibraryItemRow } from "../LibraryItemRow";
import { useLibraryPaneResource, type LibraryPaneProps } from "../useLibraryPaneResource";
import { useBulkSelection } from "../../hooks/useBulkSelection";
import { Button, ConfirmDeleteButton } from "../../components/Button";
import { TrashIcon, Icon } from "../../components/Icon";

interface HistoryPaneData {
  res: HistoryPageResult;
  fullyCachedSet: Set<string>;
}

export function HistoryPane(props: LibraryPaneProps) {
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
      const fullyCachedSet = await getFullyCachedChapterPermalinks(permalinks).catch(() => new Set<string>());
      return { res, fullyCachedSet };
    },
    register: props.register,
  });

  // QoL-L3: bulk-select mode for deleting multiple history rows at once.
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
                externalUrl={dynastyUrl("chapters", row.chapter_permalink)}
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
