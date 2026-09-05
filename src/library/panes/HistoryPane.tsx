/**
 * Library Reading History panel.
 */

import { createSignal, For, Show } from "solid-js";
import { navigate } from "../../stores/router";
import { decodeEntities } from "../../utils/html";
import { formatDate } from "../../utils/formatting";
import { dynastyUrl } from "../../utils/url";
import { t } from "../../i18n";
import { getHistoryPage, getHistoryRevision, onHistoryChanged, removeHistory, removeHistoryBatch } from "../../db/library.repo";
import { getFullyCachedChapterPermalinks } from "../../db/cache.repo";
import type { HistoryRow, HistoryPageResult } from "../../types/db";
import { Loading } from "../../components/Loading";
import { Pager } from "../../components/Pager";
import { LibraryItemRow } from "../LibraryItemRow";
import { useLibraryPaneResource, type LibraryPaneProps } from "../useLibraryPaneResource";
import { Button, ConfirmDeleteButton } from "../../components/Button";
import { TrashIcon } from "../../components/Icon";

interface HistoryPaneData {
  res: HistoryPageResult;
  fullyCachedSet: Set<string>;
}

export function HistoryPane(props: LibraryPaneProps) {
  const { setPage, data, refetch, showSpinner } = useLibraryPaneResource<HistoryPaneData>({
    getRevision: getHistoryRevision,
    onChanged: onHistoryChanged,
    fetcher: async (p) => {
      const res = await getHistoryPage(p, 15);
      const permalinks = res.rows.map((r) => r.chapter_permalink);
      const fullyCachedSet = await getFullyCachedChapterPermalinks(permalinks).catch(() => new Set<string>());
      return { res, fullyCachedSet };
    },
    register: props.register,
  });

  // QoL-L3: bulk-select mode for deleting multiple history rows at once.
  const [selectMode, setSelectMode] = createSignal(false);
  const [selected, setSelected] = createSignal<Set<number>>(new Set());

  const toggleSelectMode = (): void => {
    setSelectMode((v) => !v);
    setSelected(new Set<number>());
  };

  const toggleRow = (id: number): void => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const deleteSelected = async (): Promise<void> => {
    const ids = [...selected()];
    if (ids.length === 0) return;
    await removeHistoryBatch(ids);
    setSelected(new Set<number>());
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
          fallback={<div class="ds-muted">{t("library.emptyHistory")}</div>}
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
