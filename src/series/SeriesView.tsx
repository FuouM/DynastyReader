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
import {
  isMobile,
  navigate,
  route,
  setActions,
  setSessionTab,
  setTitle,
  showBanner,
  SITE_ROOT,
} from "../stores";
import { decodeEntities } from "../utils/html";
import { seriesTypeToPath } from "../taxonomy";
import { t } from "../i18n";
import { errorMessage } from "../utils/errors";
import { fetchChapter, fetchSeries, getSeriesCover } from "../api";
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
import {
  BookmarkIcon,
  BlacklistIcon,
  RefreshIcon,
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
        volumeHeader,
      });
    }
  }
  return out;
}

export function SeriesView() {
  const [forceTick, setForceTick] = createSignal(0);
  const [busyFollow, setBusyFollow] = createSignal(false);
  const [busyBlacklist, setBusyBlacklist] = createSignal(false);
  const [sortOrder, setSortOrder] = createSignal<"asc" | "desc">("asc");
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

      const followed = (await getFollowedSeriesRow(permalink)) !== null;
      const blacklisted = isSeriesBlacklisted(permalink, series.name);
      const chapters = collectChapters(series);
      const chapterPermalinks = chapters.map((c) => c.permalink);

      let progress = new Map<string, SeriesProgressRow>();
      let cacheCounts = new Map<string, number>();
      let readHistorySet = new Set<string>();
      try {
        const [p, c, h] = await Promise.all([
          getProgressForSeries(permalink),
          getCachedPageCounts(chapterPermalinks),
          getHistoryPermalinks(chapterPermalinks),
        ]);
        progress = new Map(p.map((r) => [r.chapter_permalink, r]));
        cacheCounts = new Map(c.map((r) => [r.chapter_permalink, r.n]));
        readHistorySet = h;
      } catch (err) {
        const msg = errorMessage(err);
        showBanner(t("series.progressLoadError", { msg }));
      }

      return { series, coverPath, followed, blacklisted, chapters, progress, cacheCounts, readHistorySet };
    },
  );
  const showSpinner = useDelayedSpinner(() => data.loading);

  // Publish the series top-bar actions and update title whenever the data is ready.
  // On mobile the topbar is too narrow for these buttons — render them in-body
  // instead and clear the topbar slot (Phase 5.2).
  createEffect(() => {
    const d = data();
    if (!d) return;
    const { series, coverPath, followed, blacklisted, chapters } = d;
    const seriesPermalink = series.permalink;
    const seriesName = series.name;
    const latest = chapters[chapters.length - 1];
    const openUrl = `${SITE_ROOT}/${seriesTypeToPath(series.type)}/${encodeURIComponent(seriesPermalink)}`;

    setTitle(decodeEntities(seriesName));
    setSessionTab((current) => {
      if (!current || current.route.view !== "series") return current;
      return {
        ...current,
        title: seriesName,
        route: { ...current.route, seriesName },
      };
    });

    const toggleFollow = async (): Promise<void> => {
      setBusyFollow(true);
      try {
        if (followed) {
          await unfollowSeries(seriesPermalink);
          showBanner(t("series.unfollowedBanner", { name: seriesName }));
        } else {
          await followSeries({
            permalink: seriesPermalink,
            name: seriesName,
            cover: coverPath,
            latestChapterPermalink: latest?.permalink ?? null,
            latestChapterTitle: latest?.title ?? null,
          });
          showBanner(t("series.followingBanner", { name: seriesName }));
        }
        await refetch();
      } catch (err) {
        const msg = errorMessage(err);
        showBanner(t("series.followErrorBanner", { msg }));
        setBusyFollow(false);
      }
    };

    const toggleBlacklist = async (): Promise<void> => {
      setBusyBlacklist(true);
      try {
        if (blacklisted) {
          await removeBlacklistedSeries(seriesPermalink);
          showBanner(t("series.unblacklistedBanner", { name: seriesName }));
        } else {
          await addBlacklistedSeries(seriesPermalink, seriesName);
          showBanner(t("series.blacklistedBanner", { name: seriesName }));
        }
        await refetch();
      } catch (err) {
        const msg = errorMessage(err);
        showBanner(t("series.blacklistErrorBanner", { msg }));
        setBusyBlacklist(false);
      }
    };

    if (isMobile()) {
      setActions(null);
      return;
    }
    setActions(
      <SeriesActions
        followed={() => followed}
        busyFollow={busyFollow}
        onToggleFollow={() => void toggleFollow()}
        blacklisted={() => blacklisted}
        busyBlacklist={busyBlacklist}
        onToggleBlacklist={() => void toggleBlacklist()}
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
        openUrl={openUrl}
        seriesType={series.type}
      />,
    );
  });

  onCleanup(() => setActions(null));

  const handleToggleFollow = async (): Promise<void> => {
    const d = data();
    if (!d) return;
    const { series, coverPath, followed, chapters } = d;
    const seriesPermalink = series.permalink;
    const seriesName = series.name;
    const latest = chapters[chapters.length - 1];
    setBusyFollow(true);
    try {
      if (followed) {
        await unfollowSeries(seriesPermalink);
        showBanner(t("series.unfollowedBanner", { name: seriesName }));
      } else {
        await followSeries({
          permalink: seriesPermalink,
          name: seriesName,
          cover: coverPath,
          latestChapterPermalink: latest?.permalink ?? null,
          latestChapterTitle: latest?.title ?? null,
        });
        showBanner(t("series.followingBanner", { name: seriesName }));
      }
      await refetch();
    } catch (err) {
      const msg = errorMessage(err);
      showBanner(t("series.followErrorBanner", { msg }));
      setBusyFollow(false);
    }
  };

  const handleToggleBlacklist = async (): Promise<void> => {
    const d = data();
    if (!d) return;
    const { series, blacklisted } = d;
    const seriesPermalink = series.permalink;
    const seriesName = series.name;
    setBusyBlacklist(true);
    try {
      if (blacklisted) {
        await removeBlacklistedSeries(seriesPermalink);
        showBanner(t("series.unblacklistedBanner", { name: seriesName }));
      } else {
        await addBlacklistedSeries(seriesPermalink, seriesName);
        showBanner(t("series.blacklistedBanner", { name: seriesName }));
      }
      await refetch();
    } catch (err) {
      const msg = errorMessage(err);
      showBanner(t("series.blacklistErrorBanner", { msg }));
      setBusyBlacklist(false);
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
  const dataErrorText = (): string => {
    const e = data.error;
    if (e instanceof Error) return e.message;
    return String(e);
  };

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
        <div class="ds-error-row">
          <span class="ds-muted">{t("series.loadError", { msg: dataErrorText() })}</span>
          <Button
            icon={<RefreshIcon />}
            text={t("common.retry")}
            onClick={() => void refetch()}
          />
        </div>
      </Show>
      <Show when={!data.loading && data() !== undefined}>
        <SeriesBody
          data={data()!}
          ordered={ordered}
          sortOrder={sortOrder}
          setSortOrder={setSortOrder}
          mobileActions={
            <SeriesActions
              followed={() => data()!.followed}
              busyFollow={busyFollow}
              onToggleFollow={() => void handleToggleFollow()}
              blacklisted={() => data()!.blacklisted}
              busyBlacklist={busyBlacklist}
              onToggleBlacklist={() => void handleToggleBlacklist()}
              onRefresh={() => setForceTick((t) => t + 1)}
              onOpenAddToCol={handleOpenAddToCol}
              openUrl={`${SITE_ROOT}/${seriesTypeToPath(data()!.series.type)}/${encodeURIComponent(data()!.series.permalink)}`}
              seriesType={data()!.series.type}
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
    followed: boolean;
    blacklisted: boolean;
    chapters: ChapterMeta[];
    progress: Map<string, SeriesProgressRow>;
    cacheCounts: Map<string, number>;
    readHistorySet: Set<string>;
  };
  ordered: Accessor<ChapterMeta[]>;
  sortOrder: Accessor<"asc" | "desc">;
  setSortOrder: (v: "asc" | "desc") => void;
  mobileActions?: JSX.Element;
}) {
  return (
    <>
      <Show when={props.data.blacklisted}>
        <div class="ds-row ds-blacklist-notice">
          <BlacklistIcon
            filled={true}
            style={{
              "font-size": "14px",
              color: "var(--ds-warn-text,#d97706)",
              "flex-shrink": 0,
            }}
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
      <ExternalLinkButton
        className="ds-btn-icon"
        title={t("series.openInBrowserTooltip", { type: props.seriesType ? props.seriesType.toLowerCase() : "series" })}
        url={props.openUrl}
      />
    </>
  );
}
