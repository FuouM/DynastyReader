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
  Show,
  type Accessor,
} from "solid-js";
import {
  decodeEntities,
  navigate,
  route,
  setActions,
  setSessionTab,
  setTitle,
  showBanner,
} from "../stores";
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
    if (t.title && t.permalink) {
      out.push({
        title: t.title,
        permalink: t.permalink,
        released_on: t.released_on,
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
      if (!permalink) throw new Error("Missing series permalink.");

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
        coverPath = await getSeriesCover(permalink, series.cover);
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
        const msg = err instanceof Error ? err.message : String(err);
        showBanner(`Progress data failed to load: ${msg}`);
      }

      return { series, coverPath, followed, blacklisted, chapters, progress, cacheCounts, readHistorySet };
    },
  );
  const showSpinner = useDelayedSpinner(() => data.loading);

  // Publish the series top-bar actions and update title whenever the data is ready.
  createEffect(() => {
    const d = data();
    if (!d) return;
    const { series, coverPath, followed, blacklisted, chapters } = d;
    const seriesPermalink = series.permalink;
    const seriesName = series.name;
    const latest = chapters[chapters.length - 1];
    const rawType = (series.type ?? "series").toLowerCase();
    const segmentMap: Record<string, string> = {
      series: "series",
      anthology: "anthologies",
      doujin: "doujins",
      doujinshi: "doujins",
      issue: "issues",
      author: "authors",
      artist: "authors",
      scanlator: "scanlators",
      group: "scanlators",
      pairing: "pairings",
      tag: "tags",
      general: "tags",
    };
    const openUrl = `https://dynasty-scans.com/${segmentMap[rawType] || "series"}/${encodeURIComponent(seriesPermalink)}`;

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
          showBanner(`Unfollowed "${seriesName}".`);
        } else {
          await followSeries({
            permalink: seriesPermalink,
            name: seriesName,
            cover: coverPath,
            latestChapterPermalink: latest?.permalink ?? null,
            latestChapterTitle: latest?.title ?? null,
          });
          showBanner(`Following "${seriesName}".`);
        }
        await refetch();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        showBanner(`Follow toggle failed: ${msg}`);
        setBusyFollow(false);
      }
    };

    const toggleBlacklist = async (): Promise<void> => {
      setBusyBlacklist(true);
      try {
        if (blacklisted) {
          await removeBlacklistedSeries(seriesPermalink);
          showBanner(`Removed "${seriesName}" from blacklist.`);
        } else {
          await addBlacklistedSeries(seriesPermalink, seriesName);
          showBanner(`Blacklisted series "${seriesName}".`);
        }
        await refetch();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        showBanner(`Blacklist toggle failed: ${msg}`);
        setBusyBlacklist(false);
      }
    };

    setActions(
      <>
        <button
          type="button"
          class="win-button"
          disabled={busyFollow()}
          onClick={() => void toggleFollow()}
        >
          {followed ? <BookmarkIcon filled={true} /> : <BookmarkIcon />}{" "}
          <span class="ds-btn-text">{followed ? "Following" : "Follow"}</span>
        </button>
        <AddToCollectionButton
          class=""
          onOpen={(anchorEl) =>
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
        >
          <span class="ds-btn-text">Add to...</span>
        </AddToCollectionButton>
        <button
          type="button"
          class={`win-button${blacklisted ? " active" : ""}`}
          title={
            blacklisted
              ? "Remove series from blacklist"
              : "Add series to blacklist (hides releases from browse & search)"
          }
          disabled={busyBlacklist()}
          onClick={() => void toggleBlacklist()}
        >
          {blacklisted ? (
            <BlacklistIcon filled={true} color="var(--ds-warn-text,#d97706)" />
          ) : (
            <BlacklistIcon />
          )}{" "}
          <span class="ds-btn-text">{blacklisted ? "Blacklisted" : "Blacklist"}</span>
        </button>
        <button
          type="button"
          class="win-button"
          title="Re-fetch series data from the server"
          onClick={() => setForceTick((t) => t + 1)}
        >
          <RefreshIcon /> <span class="ds-btn-text">Refresh</span>
        </button>
        <ExternalLinkButton
          class=""
          title={`Open this ${series.type ? series.type.toLowerCase() : "series"} in your browser`}
          url={openUrl}
        />
      </>,
    );
  });

  const isRedirected = (): boolean =>
    data.error !== undefined && data.error instanceof SeriesRedirected;
  const errorMessage = (): string => {
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
        <div class="ds-row" style="padding:12px;gap:8px;align-items:center;">
          <span class="ds-muted">Failed to load series: {errorMessage()}</span>
          <button
            type="button"
            class="win-button"
            onClick={() => void refetch()}
          >
            <RefreshIcon /> Retry
          </button>
        </div>
      </Show>
      <Show when={!data.loading && data() !== undefined}>
        <SeriesBody
          data={data()!}
          ordered={ordered}
          sortOrder={sortOrder}
          setSortOrder={setSortOrder}
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
    blacklisted: boolean;
    chapters: ChapterMeta[];
    progress: Map<string, SeriesProgressRow>;
    cacheCounts: Map<string, number>;
    readHistorySet: Set<string>;
  };
  ordered: Accessor<ChapterMeta[]>;
  sortOrder: Accessor<"asc" | "desc">;
  setSortOrder: (v: "asc" | "desc") => void;
}) {
  return (
    <>
      <Show when={props.data.blacklisted}>
        <div
          class="ds-row ds-blacklist-notice"
          style="background:var(--ds-warn-bg);border:1px solid var(--ds-warn-border);color:var(--ds-warn-text);border-radius:3px;padding:6px 12px;margin-bottom:10px;display:flex;align-items:center;gap:8px;font-size:11px;"
        >
          <BlacklistIcon
            filled={true}
            style={{
              "font-size": "14px",
              color: "var(--ds-warn-text,#d97706)",
              "flex-shrink": 0,
            }}
          />
          <span>
            This series is on your <b>blacklist</b>. Its releases are hidden from browse feeds and
            search results.
          </span>
        </div>
      </Show>

      <SeriesHeader series={props.data.series} coverPath={props.data.coverPath} />

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
