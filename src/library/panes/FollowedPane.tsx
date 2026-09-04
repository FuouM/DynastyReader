/**
 * Library Followed Series panel.
 */

import { createEffect, createSignal, For, Show } from "solid-js";
import { navigate, showBanner } from "../../stores";
import { decodeEntities } from "../../utils/html";
import { formatDate, dynastyUrl } from "../../utils/formatting";
import { t } from "../../i18n";
import { errorMessage } from "../../utils/errors";
import { getOrHydrateSeriesCover } from "../../api";
import {
  getFollowedSeriesPage,
  getFollowedRevision,
  onFollowedChanged,
  unfollowSeries,
  updateFollowedSeriesCover,
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

  createEffect(() => {
    const c = cover();
    if (c && (c.includes("/") || c.includes("\\"))) return;

    void getOrHydrateSeriesCover(props.row.permalink).then((freshPath) => {
      if (freshPath) {
        setCover(freshPath);
        void updateFollowedSeriesCover(props.row.permalink, freshPath, false);
      }
    });
  });

  const openSeries = (): void => {
    navigate({ view: "series", seriesPermalink: props.row.permalink, seriesName: props.row.name });
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
      actionLabel={t("common.open")}
      actionIcon="bi-folder2-open"
      externalUrl={dynastyUrl("series", props.row.permalink)}
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
