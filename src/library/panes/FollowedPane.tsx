/**
 * Library Followed Series panel.
 */

import { For, Show } from "solid-js";
import { navigate, showBanner } from "../../stores";
import { decodeEntities } from "../../utils/html";
import { formatDate, dynastyUrl } from "../../utils/formatting";
import { t } from "../../i18n";
import { errorMessage } from "../../utils/errors";
import {
  getFollowedSeriesPage,
  getFollowedRevision,
  onFollowedChanged,
  unfollowSeries,
  type FollowedSeriesRow,
} from "../../db";
import { Loading } from "../../components/Loading";
import { Pager } from "../../components/Pager";
import { LibraryItemRow } from "../LibraryItemRow";
import { useLibraryPaneResource, type LibraryPaneProps } from "../useLibraryPaneResource";

export function FollowedPane(props: LibraryPaneProps) {
  const { setPage, data, refetch, showSpinner } = useLibraryPaneResource({
    getRevision: getFollowedRevision,
    onChanged: onFollowedChanged,
    fetcher: (p) => getFollowedSeriesPage(p, 10),
    register: props.register,
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
                externalUrl={dynastyUrl("series", row.permalink)}
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
