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
import { extractVolumeHeader } from "../utils/volume";
import {
  isMobile,
  navigate,
  route,
  setActions,
  setSessionTab,
  setTitle,
  showBanner,
} from "../stores";
import { decodeEntities } from "../utils/html";
import { dynastyUrl } from "../utils/formatting";
import { seriesTypeToPath } from "../taxonomy";
import { t } from "../i18n";
import { errorMessage } from "../utils/errors";
import { fetchChapter } from "../api/chapter";
import { fetchSeries, getSeriesCover } from "../api/series";
import { enqueueChapters } from "../ipc";
import { persistedSignal } from "../lib/persisted-signal";
import { getQueuePageTotals } from "../db/cache-aggregate";
import {
  addBlacklistedSeries,
  followSeries,
  getCachedPageCounts,
  getFollowedSeriesRow,
  getHistoryPermalinks,
  getProgressForSeries,
  isSeriesBlacklisted,
  removeBlacklistedSeries,
  unfollowSeries,
  type SeriesProgressRow,
} from "../db";
import type { Series } from "../types/api";
import { useDelayedSpinner } from "../browse/browse-state";
import { Loading } from "../components/Loading";
import { Button } from "../components/Button";
import { ExternalLinkButton } from "../components/ExternalLinkButton";
import { AddToCollectionButton } from "../components/AddToCollectionButton";
import { useAddToCollection } from "../components/hooks/useAddToCollection";
import { ErrorRetryRow } from "../components/ErrorRetryRow";
import {
  BookmarkIcon,
  BlacklistIcon,
  RefreshIcon,
  CloudDownloadIcon,
} from "../components/Icon";
import { SeriesHeader } from "./SeriesHeader";
import { SeriesChapterList, type ChapterMeta } from "./SeriesChapterList";
import { SeriesTaggables } from "./SeriesTaggables";

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

/**
 * Chapters in chronological release order. Taggings order is not guaranteed
 * to match release order (anthology series interleave headers/collections),
 * so sort by released_on with a stable fallback to the original order.
 */
function chronologicalChapters(chapters: ChapterMeta[]): ChapterMeta[] {
  return chapters
    .map((ch, idx) => {
      const ts = ch.released_on ? Date.parse(ch.released_on) : NaN;
      return { ch, idx, ts: Number.isNaN(ts) ? -Infinity : ts };
    })
    .sort((a, b) => (a.ts !== b.ts ? a.ts - b.ts : a.idx - b.idx))
    .map((x) => x.ch);
}

export function SeriesView() {
  const [forceTick, setForceTick] = createSignal(0);
  const [busyFollow, setBusyFollow] = createSignal(false);
  const [busyBlacklist, setBusyBlacklist] = createSignal(false);
  const [sortOrder, setSortOrder] = persistedSignal<"asc" | "desc">("asc", {
    name: "ds_series_sort_order",
    deserialize: (v) => (v === "desc" ? "desc" : "asc"),
  });
  const [followed, setFollowed] = createSignal(false);
  const [blacklisted, setBlacklisted] = createSignal(false);
  const addToCol = useAddToCollection();

  const [data, { refetch }] = createResource(
    () => ({ permalink: route().seriesPermalink, forceTick: forceTick() }),
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
    const d = data();
    if (!d) return;
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
  const dataErrorText = (): string => errorMessage(data.error);

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
          message={t("series.loadError", { msg: dataErrorText() })}
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
      />
    </>
  );
}

interface SeriesActionsProps {
  followed: () => boolean;
  busyFollow: () => boolean;
  onToggleFollow: () => void;
  blacklisted: () => boolean;
  busyBlacklist: () => boolean;
  onToggleBlacklist: () => void;
  onRefresh: () => void;
  onOpenAddToCol: (anchorEl: HTMLElement) => void;
  openUrl: string;
  seriesType?: string;
  onDownloadAll?: () => void;
}
function SeriesActions(props: SeriesActionsProps) {
  return (
    <>
      <Button
        icon={props.followed() ? <BookmarkIcon filled={true} /> : <BookmarkIcon />}
        text={props.followed() ? t("series.following") : t("series.follow")}
        disabled={props.busyFollow()}
        onClick={props.onToggleFollow}
      />
      <AddToCollectionButton
        text={t("series.addToButton")}
        onOpen={props.onOpenAddToCol}
      />
      <Button
        icon={props.blacklisted() ? <BlacklistIcon filled={true} color="var(--ds-warn-text,#d97706)" /> : <BlacklistIcon />}
        text={props.blacklisted() ? t("series.blacklistedBadge") : t("blacklist.title").split(" ")[0]}
        classList={{ active: props.blacklisted() }}
        title={props.blacklisted() ? t("series.unblacklistTooltip") : t("series.blacklistTooltip")}
        disabled={props.busyBlacklist()}
        onClick={props.onToggleBlacklist}
      />
      <Button
        icon={<RefreshIcon />}
        text={t("common.refresh")}
        title={t("series.reloadTooltip")}
        onClick={props.onRefresh}
      />
      <Show when={props.onDownloadAll}>
        <Button
          icon={<CloudDownloadIcon />}
          text={t("series.downloadAll")}
          title={t("series.downloadAllTooltip")}
          onClick={props.onDownloadAll}
        />
      </Show>
      <Show when={props.openUrl}>
        <ExternalLinkButton
          className="ds-btn-icon"
          title={t("series.openInBrowserTooltip", { type: props.seriesType ? props.seriesType.toLowerCase() : "series" })}
          url={props.openUrl}
        />
      </Show>
    </>
  );
}
