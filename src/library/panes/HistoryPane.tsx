/**
 * Library Reading History panel.
 */

import { For, Show } from "solid-js";
import { navigate } from "../../stores";
import { decodeEntities } from "../../utils/html";
import { formatDate, dynastyUrl } from "../../utils/formatting";
import { t } from "../../i18n";
import {
  getHistoryPage,
  getHistoryRevision,
  onHistoryChanged,
  getFullyCachedChapterPermalinks,
  removeHistory,
  type HistoryRow,
  type HistoryPageResult,
} from "../../db";
import { Loading } from "../../components/Loading";
import { Pager } from "../../components/Pager";
import { LibraryItemRow } from "../LibraryItemRow";
import { useLibraryPaneResource, type LibraryPaneProps } from "../useLibraryPaneResource";

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
                externalUrl={dynastyUrl("chapters", row.chapter_permalink)}
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
