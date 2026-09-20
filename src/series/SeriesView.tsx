/**
 * Solid Series detail view. Port of `ui-series.ts`:
 * - metadata + categorized tag rows, sanitized description, cover
 * - Series & Anthologies taggables grid
 * - volume-grouped chapter list with sort toggle and per-chapter badges
 * - top-bar actions: Follow / Add to... / Blacklist / Refresh / open-external
 * - standalone chapter/oneshot permalink fallback -> reader
 */

import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  onCleanup,
  Show,
  type Accessor,
  type JSX,
} from "solid-js";
import { extractVolumeHeader, decodeEntities, dynastyUrl, errorMessage } from "../utils/formatting";
import { isMobile } from "../stores/platform";
import { navigate, route, setSessionTab } from "../stores/router";
import { setActions, setTitle, showBanner } from "../stores/topbar";
import { seriesTypeToPath } from "../taxonomy";
import { t } from "../i18n";
import { fetchChapter, fetchSeries, getSeriesCover } from "../api/series";
import { enqueueChapters } from "../ipc";
import { persistedSignal } from "../lib/persisted-signal";
import { getQueuePageTotals } from "../db/cache-aggregate";
import { addBlacklistedSeries, isSeriesBlacklisted, removeBlacklistedSeries } from "../db/blacklist.repo";
import { followSeries, getFollowedSeriesRow, getHistoryPermalinks, getProgressForSeries, unfollowSeries, markChapterRead, markChapterUnread, getProgressRevision, getHistoryRevision, getBookmarksRevision } from "../db/library.repo";
import { getCachedPageCounts, getCacheRevision } from "../db/cache.repo";
import type { SeriesProgressRow } from "../types/db";
import type { Series } from "../types/api";
import { useDelayedSpinner } from "../browse/browse-state";
import { Loading, ErrorRetryRow } from "../components/Feedback";
import { useAddToCollection } from "../hooks/useAddToCollection";
import { BlacklistIcon } from "../components/Icon";
import { SeriesHeader } from "./SeriesHeader";
import { SeriesChapterList, type ChapterMeta } from "./SeriesChapterList";
import { SeriesTaggables } from "./SeriesTaggables";
import { SeriesActions } from "./SeriesActions";
import { SeriesResumeBanner, chronologicalChapters } from "./SeriesResumeBanner";

/** Thrown when the permalink turned out to be a standalone chapter (redirected). */
class SeriesRedirected extends Error {}

function collectChapters(series: Series): ChapterMeta[] {
  const out: ChapterMeta[] = [];
  let volumeHeader: string | undefined;
  for (const t of series.taggings ?? []) {
    if (t.header) {
      volumeHeader = t.header;
      continue;
    }
    if (t.permalink) {
      out.push({
        title: t.title || t.permalink,
        permalink: t.permalink,
        released_on: t.released_on ?? undefined,
        volumeHeader: volumeHeader || extractVolumeHeader(t.title || t.permalink),
      });
    }
  }
  return out;
}


export function SeriesView() {
  const [forceTick, setForceTick] = createSignal(0);
  const [busyFollow, setBusyFollow] = createSignal(false);
  const [busyBlacklist, setBusyBlacklist] = createSignal(false);
  const [busyDownload, setBusyDownload] = createSignal(false);
  const [sortOrder, setSortOrder] = persistedSignal<"asc" | "desc">("asc", {
    name: "ds_series_sort_order",
    deserialize: (v) => (v === "desc" ? "desc" : "asc"),
  });
  const [followed, setFollowed] = createSignal(false);
  const [blacklisted, setBlacklisted] = createSignal(false);
  const addToCol = useAddToCollection();

  const [data, { refetch }] = createResource(
    () => ({
      permalink: route().seriesPermalink,
      forceTick: forceTick(),
      cacheRev: getCacheRevision(),
      progressRev: getProgressRevision(),
      historyRev: getHistoryRevision(),
      bookmarksRev: getBookmarksRevision(),
    }),
    async ({ permalink, forceTick: tick }) => {
      if (!permalink) throw new Error(t("series.missingPermalinkError"));

      let series: Series;
      try {
        series = await fetchSeries(permalink, tick > 0);
      } catch (err) {
        // If fetching the series failed, check whether this permalink is
        // actually a standalone chapter / oneshot.
        try {
          const ch = await fetchChapter(permalink);
          if (ch && ((ch.pages && ch.pages.length > 0) || ch.title)) {
            navigate({
              view: "reader",
              chapterPermalink: permalink,
              chapterTitle: ch.title || permalink,
            });
            throw new SeriesRedirected();
          }
        } catch (inner) {
          if (inner instanceof SeriesRedirected) throw inner;
        }
        throw err;
      }

      let coverPath: string | null = null;
      try {
        coverPath = await getSeriesCover(permalink, series.cover ?? null);
      } catch {
        // Cover is decorative; a failed download must not block the page.
      }

      const followedRow = (await getFollowedSeriesRow(permalink)) !== null;
      const blacklistedVal = isSeriesBlacklisted(permalink, series.name);
      setFollowed(followedRow);
      setBlacklisted(blacklistedVal);
      const chapters = collectChapters(series);
      const chapterPermalinks = chapters.map((c) => c.permalink);

      let progress = new Map<string, SeriesProgressRow>();
      let cacheCounts = new Map<string, number>();
      let readHistorySet = new Set<string>();
      let queueTotals = new Map<string, number>();
      try {
        const [p, c, h, qt] = await Promise.all([
          getProgressForSeries(permalink),
          getCachedPageCounts(chapterPermalinks),
          getHistoryPermalinks(chapterPermalinks),
          getQueuePageTotals(chapterPermalinks),
        ]);
        progress = new Map(p.map((r) => [r.chapter_permalink, r]));
        cacheCounts = new Map(c.map((r) => [r.chapter_permalink, r.n]));
        readHistorySet = h;
        queueTotals = qt;
      } catch (err) {
        const msg = errorMessage(err);
        showBanner(t("series.progressLoadError", { msg }));
      }

      return { series, coverPath, chapters, progress, cacheCounts, readHistorySet, queueTotals };
    },
  );
  const showSpinner = useDelayedSpinner(() => data.loading);

  // Publish the series top-bar actions and update title whenever the data is ready.
  // On mobile the topbar is too narrow for these buttons — render them in-body
  // instead and clear the topbar slot (Phase 5.2).
  createEffect(() => {
    const d = data();
    if (!d) return;
    const { series, coverPath } = d;
    const seriesPermalink = series.permalink;
    const seriesName = series.name;
    const openUrl = dynastyUrl(seriesTypeToPath(series.type), encodeURIComponent(seriesPermalink));

    setTitle(decodeEntities(seriesName));
    setSessionTab((current) => {
      if (!current || current.route.view !== "series") return current;
      return {
        ...current,
        title: seriesName,
        route: { ...current.route, seriesName },
      };
    });

    if (isMobile()) {
      setActions(null);
      return;
    }
    setActions(
      <SeriesActions
        followed={followed}
        busyFollow={busyFollow}
        onToggleFollow={() => void handleToggleFollow()}
        blacklisted={blacklisted}
        busyBlacklist={busyBlacklist}
        onToggleBlacklist={() => void handleToggleBlacklist()}
        onRefresh={() => setForceTick((t) => t + 1)}
        onOpenAddToCol={(anchorEl) =>
          addToCol.open(
            {
              permalink: seriesPermalink,
              title: seriesName,
              kind: "series",
              cover: coverPath,
            },
            anchorEl,
          )
        }
        openUrl={series.type === "local" ? "" : openUrl}
        seriesType={series.type}
        onDownloadAll={series.type === "local" ? undefined : () => void handleDownloadAll()}
      />,
    );
  });

  onCleanup(() => setActions(null));

  const handleToggleFollow = async (): Promise<void> => {
    const d = data();
    if (!d) return;
    const { series, coverPath, chapters } = d;
    const seriesPermalink = series.permalink;
    const seriesName = series.name;
    const sorted = chronologicalChapters(chapters);
    const latest = sorted[sorted.length - 1];
    setBusyFollow(true);
    try {
      if (followed()) {
        await unfollowSeries(seriesPermalink);
        setFollowed(false);
        showBanner(t("series.unfollowedBanner", { name: seriesName }));
      } else {
        await followSeries({
          permalink: seriesPermalink,
          name: seriesName,
          cover: coverPath,
          latestChapterPermalink: latest?.permalink ?? null,
          latestChapterTitle: latest?.title ?? null,
        });
        setFollowed(true);
        showBanner(t("series.followingBanner", { name: seriesName }));
      }
    } catch (err) {
      const msg = errorMessage(err);
      showBanner(t("series.followErrorBanner", { msg }));
    } finally {
      setBusyFollow(false);
    }
  };

  const handleToggleBlacklist = async (): Promise<void> => {
    const d = data();
    if (!d) return;
    const { series } = d;
    const seriesPermalink = series.permalink;
    const seriesName = series.name;
    setBusyBlacklist(true);
    try {
      if (blacklisted()) {
        await removeBlacklistedSeries(seriesPermalink);
        setBlacklisted(false);
        showBanner(t("series.unblacklistedBanner", { name: seriesName }));
      } else {
        await addBlacklistedSeries(seriesPermalink, seriesName);
        setBlacklisted(true);
        showBanner(t("series.blacklistedBanner", { name: seriesName }));
      }
    } catch (err) {
      const msg = errorMessage(err);
      showBanner(t("series.blacklistErrorBanner", { msg }));
    } finally {
      setBusyBlacklist(false);
    }
  };
  const handleDownloadAll = async (): Promise<void> => {
    if (busyDownload()) return;
    const d = data();
    if (!d) return;
    setBusyDownload(true);
    const { series, chapters } = d;
    const reqs = chronologicalChapters(chapters).map((ch, idx) => ({
      series_permalink: series.permalink,
      series_title: series.name,
      chapter_permalink: ch.permalink,
      chapter_title: ch.title,
      chapter_index: idx,
    }));
    try {
      const result = await enqueueChapters(reqs);
      if (result.already_queued_count > 0) {
        showBanner(
          t("series.downloadQueuedPartialBanner", {
            count: result.queued_count,
            skipped: result.already_queued_count,
          }),
        );
      } else {
        showBanner(t("series.downloadQueuedBanner", { count: result.queued_count }));
      }
    } catch (err) {
      showBanner(errorMessage(err));
    } finally {
      setBusyDownload(false);
    }
  };
  const handleDownloadSingleChapter = async (ch: ChapterMeta): Promise<void> => {
    if (busyDownload()) return;
    const d = data();
    if (!d) return;
    setBusyDownload(true);
    const sorted = chronologicalChapters(d.chapters);
    const idx = sorted.findIndex((c) => c.permalink === ch.permalink);
    const reqs = [
      {
        series_permalink: d.series.permalink,
        series_title: d.series.name,
        chapter_permalink: ch.permalink,
        chapter_title: ch.title,
        chapter_index: idx >= 0 ? idx : 0,
      },
    ];
    try {
      const result = await enqueueChapters(reqs);
      if (result.already_queued_count > 0) {
        showBanner(t("series.downloadQueuedPartialBanner", { count: 0, skipped: 1 }));
      } else {
        showBanner(t("series.downloadQueuedSingleBanner"));
      }
      refetch();
    } catch (err) {
      showBanner(errorMessage(err));
    } finally {
      setBusyDownload(false);
    }
  };

  const handleToggleRead = async (ch: ChapterMeta, isCurrentlyRead: boolean): Promise<void> => {
    const d = data();
    if (!d) return;
    try {
      if (isCurrentlyRead) {
        await markChapterUnread(ch.permalink);
      } else {
        await markChapterRead({
          chapterPermalink: ch.permalink,
          seriesPermalink: d.series.permalink,
          seriesName: d.series.name,
          chapterTitle: ch.title,
          pageTotal: d.progress.get(ch.permalink)?.page_total,
        });
      }
      refetch();
    } catch (err) {
      showBanner(errorMessage(err));
    }
  };



  const handleOpenAddToCol = (anchorEl: HTMLElement): void => {
    const d = data();
    if (!d) return;
    addToCol.open(
      {
        permalink: d.series.permalink,
        title: d.series.name,
        kind: "series",
        cover: d.coverPath,
      },
      anchorEl,
    );
  };

  const isRedirected = (): boolean =>
    data.error !== undefined && data.error instanceof SeriesRedirected;

  const ordered = createMemo<ChapterMeta[]>(() => {
    const chs = data()?.chapters ?? [];
    return sortOrder() === "asc" ? chs : [...chs].reverse();
  });

  return (
    <>
      <Show when={!isRedirected() && (showSpinner() || (!data() && data.loading))}>
        <Loading />
      </Show>
      <Show when={!isRedirected() && !data.loading && data.error !== undefined && !data()}>
        <ErrorRetryRow
          message={t("series.loadError", { msg: errorMessage(data.error) })}
          onRetry={() => void refetch()}
        />
      </Show>
      <Show when={!data.loading && data() !== undefined}>
      <SeriesBody
        data={data()!}
        ordered={ordered}
        sortOrder={sortOrder}
        setSortOrder={setSortOrder}
        followed={followed}
        blacklisted={blacklisted}
        mobileActions={
          <SeriesActions
            followed={followed}
            busyFollow={busyFollow}
            onToggleFollow={() => void handleToggleFollow()}
            blacklisted={blacklisted}
            busyBlacklist={busyBlacklist}
            onToggleBlacklist={() => void handleToggleBlacklist()}
            onRefresh={() => setForceTick((t) => t + 1)}
            onOpenAddToCol={handleOpenAddToCol}
            openUrl={data()!.series.type === "local" ? "" : dynastyUrl(seriesTypeToPath(data()!.series.type), encodeURIComponent(data()!.series.permalink))}
            seriesType={data()!.series.type}
            onDownloadAll={data()!.series.type === "local" ? undefined : () => void handleDownloadAll()}
          />
        }
        onDownloadChapter={handleDownloadSingleChapter}
        onToggleRead={handleToggleRead}
      />
      </Show>

      {addToCol.host}
    </>
  );
}

function SeriesBody(props: {
  data: {
    series: Series;
    coverPath: string | null;
    chapters: ChapterMeta[];
    progress: Map<string, SeriesProgressRow>;
    cacheCounts: Map<string, number>;
    readHistorySet: Set<string>;
    queueTotals: Map<string, number>;
  };
  followed: () => boolean;
  blacklisted: () => boolean;
  ordered: Accessor<ChapterMeta[]>;
  sortOrder: Accessor<"asc" | "desc">;
  setSortOrder: (v: "asc" | "desc") => void;
  mobileActions?: JSX.Element;
  onDownloadChapter?: (ch: ChapterMeta) => Promise<void> | void;
  onToggleRead?: (ch: ChapterMeta, isCurrentlyRead: boolean) => Promise<void> | void;
}) {
  return (
    <>
      <Show when={props.blacklisted()}>
        <div class="ds-row ds-blacklist-notice">
          <BlacklistIcon
            filled={true}
            class="ds-bl-series-icon"
          />
          <span>
            {t("series.blacklistNotice")}
          </span>
        </div>
      </Show>

      <SeriesHeader series={props.data.series} coverPath={props.data.coverPath} />

      <Show when={isMobile() && props.mobileActions}>
        <div class="ds-series-mobile-actions">
          {props.mobileActions}
        </div>
      </Show>

      <SeriesResumeBanner
        series={props.data.series}
        chapters={props.data.chapters}
        progress={props.data.progress}
        readHistorySet={props.data.readHistorySet}
      />

      <SeriesTaggables series={props.data.series} />

      <SeriesChapterList
        series={props.data.series}
        chapters={props.data.chapters}
        ordered={props.ordered}
        progress={props.data.progress}
        cacheCounts={props.data.cacheCounts}
        readHistorySet={props.data.readHistorySet}
        queueTotals={props.data.queueTotals}
        sortOrder={props.sortOrder}
        setSortOrder={props.setSortOrder}
        onDownloadChapter={props.onDownloadChapter}
        onToggleRead={props.onToggleRead}
      />
    </>
  );
}

