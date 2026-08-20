/**
 * Solid Series detail view. Port of `ui-series.ts`:
 *
 *  - metadata + categorized tag rows, sanitized description, cover
 *  - Series & Anthologies taggables grid
 *  - volume-grouped chapter list with sort toggle and per-chapter badges
 *  - top-bar actions: Follow / Add to... / Blacklist / Refresh / open-external
 *  - standalone chapter/oneshot permalink fallback → reader
 */

import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  For,
  Show,
  type Accessor,
  type JSX,
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
import { fetchChapter, fetchSeries, getSeriesCover, openExternal } from "../api";
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
import type { Series, SeriesTag } from "../types/api";
import type { ChapterRef } from "../types/routes";
import { useDelayedSpinner } from "../browse/browse-state";
import { TagPill } from "../components/TagPill";
import { Cover } from "../components/Cover";
import { Loading } from "../components/Loading";
import { OfflineBadge } from "../components/OfflineBadge";
import { ExternalLinkButton } from "../components/ExternalLinkButton";
import { AddToCollectionButton } from "../components/AddToCollectionButton";
import { useAddToCollection } from "../components/hooks/useAddToCollection";

interface ChapterMeta extends ChapterRef {
  volumeHeader?: string;
}

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

function groupTags(
  series: Series,
): {
  authorTags: SeriesTag[];
  groupTags: SeriesTag[];
  doujinTags: SeriesTag[];
  pairingTags: SeriesTag[];
  characterTags: SeriesTag[];
  statusTags: SeriesTag[];
  otherTags: SeriesTag[];
} {
  const authorTags: SeriesTag[] = [];
  const groupMap = new Map<string, SeriesTag>();
  const doujinTags: SeriesTag[] = [];
  const pairingTags: SeriesTag[] = [];
  const characterTags: SeriesTag[] = [];
  const statusTags: SeriesTag[] = [];
  const otherTags: SeriesTag[] = [];

  for (const t of series.tags ?? []) {
    const type = (t.type ?? "").toLowerCase();
    const nameLower = (t.name ?? "").toLowerCase();
    if (type === "author" || type === "artist") {
      authorTags.push(t);
    } else if (type === "scanlator" || type === "group") {
      groupMap.set(t.permalink || t.name, t);
    } else if (
      type === "doujin" ||
      type === "doujinshi" ||
      type === "copyright" ||
      type === "parody"
    ) {
      doujinTags.push(t);
    } else if (type === "pairing") {
      pairingTags.push(t);
    } else if (type === "character") {
      characterTags.push(t);
    } else if (
      type === "status" ||
      type === "format" ||
      nameLower === "oneshot" ||
      nameLower === "one-shot" ||
      nameLower === "anthology" ||
      nameLower === "completed" ||
      nameLower === "ongoing" ||
      nameLower === "discontinued" ||
      nameLower === "hiatus"
    ) {
      statusTags.push(t);
    } else {
      otherTags.push(t);
    }
  }

  // Also collect any scanlation groups from chapter taggings if not in series.tags
  for (const tagging of series.taggings ?? []) {
    for (const t of tagging.tags ?? []) {
      const type = (t.type ?? "").toLowerCase();
      if (type === "scanlator" || type === "group") {
        if (!groupMap.has(t.permalink || t.name)) {
          groupMap.set(t.permalink || t.name, t);
        }
      }
    }
  }
  const groupTags = Array.from(groupMap.values());

  return { authorTags, groupTags, doujinTags, pairingTags, characterTags, statusTags, otherTags };
}

/** Recursively renders a sanitized (tag-whitelist) description tree. */
function renderSanitizedNodes(nodes: Node[]): JSX.Element[] {
  const out: JSX.Element[] = [];
  for (const node of nodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = decodeEntities(node.textContent || "");
      if (text) out.push(text);
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      const tag = el.tagName.toLowerCase();
      const kids = () => renderSanitizedNodes(Array.from(el.childNodes));
      if (tag === "p") {
        const children = kids();
        if (children.length > 0) out.push(<p style="margin:4px 0;">{children}</p>);
      } else if (tag === "br") {
        out.push(<br />);
      } else if (tag === "a") {
        const href = el.getAttribute("href") || "";
        const text = decodeEntities(el.textContent?.trim() || "");
        if (href) {
          out.push(
            <a
              class="ds-external-link"
              style="color:var(--sys-primary,#0078d4);text-decoration:underline;cursor:pointer;word-break:break-all;"
              title={href}
              onClick={(ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                void openExternal(href);
              }}
            >
              {text && text !== href ? `${text} — ${href}` : href}
            </a>,
          );
        } else {
          out.push(text);
        }
      } else if (tag === "b" || tag === "strong") {
        out.push(<strong>{kids()}</strong>);
      } else if (tag === "i" || tag === "em") {
        out.push(<em>{kids()}</em>);
      } else {
        out.push(...kids());
      }
    }
  }
  return out;
}

function SanitizedDescription(props: { html: string }) {
  const nodes = createMemo<JSX.Element[]>(() => {
    if (!props.html) return [];
    const parser = new DOMParser();
    const doc = parser.parseFromString(props.html, "text/html");
    return renderSanitizedNodes(Array.from(doc.body.childNodes));
  });

  return <div class="ds-series-desc">{nodes()}</div>;
}

function MetaRow(props: { label: string; tags: SeriesTag[] }) {
  return (
    <Show when={props.tags.length > 0}>
      <div class="ds-meta-row">
        <span class="ds-meta-label">{props.label}</span>
        <div class="ds-meta-pills">
          <For each={props.tags}>
            {(t) => <TagPill type={t.type} name={t.name} permalink={t.permalink} compact={false} />}
          </For>
        </div>
      </div>
    </Show>
  );
}

function ChapterRow(props: {
  ch: ChapterMeta;
  prog: SeriesProgressRow | undefined;
  cachedCount: number;
  chapters: ChapterMeta[];
  seriesPermalink: string;
  seriesName: string;
  isReadInHistory: boolean;
}) {
  const isCompleted = props.prog?.completed === 1;
  const isRead = isCompleted || props.isReadInHistory;
  const isFullyCached =
    props.cachedCount > 0 &&
    (props.prog && props.prog.page_total > 0 ? props.cachedCount >= props.prog.page_total : true);

  const badges: string[] = [];
  if (isCompleted) {
    badges.push("✓ Completed");
  } else if (props.prog && props.prog.page_index > 0) {
    badges.push(`page ${props.prog.page_index + 1}/${props.prog.page_total}`);
  } else if (props.isReadInHistory) {
    badges.push("✓ Read");
  }
  if (props.cachedCount > 0) {
    badges.push(`${props.cachedCount} cached`);
  }
  if (props.ch.released_on) {
    badges.push(props.ch.released_on);
  }

  return (
    <div
      class={`ds-chapter-row${isRead ? " ds-chapter-read" : ""}`}
      onClick={() =>
        navigate({
          view: "reader",
          seriesPermalink: props.seriesPermalink,
          chapterPermalink: props.ch.permalink,
          chapterTitle: props.ch.title,
          seriesName: props.seriesName,
          chapterList: props.chapters,
          startPage: props.prog && props.prog.completed !== 1 ? props.prog.page_index : 0,
        })
      }
    >
      <div class="ds-chapter-title" style="display:inline-flex;align-items:center;gap:4px;">
        <span>{decodeEntities(props.ch.title)}</span>
        <OfflineBadge when={isFullyCached} />
      </div>
      {badges.length > 0 ? <div class="ds-chapter-badge">{badges.join(" · ")}</div> : null}
    </div>
  );
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
          {followed ? (
            <i class="bi bi-bookmark-check-fill"></i>
          ) : (
            <i class="bi bi-bookmark"></i>
          )}{" "}
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
            <i class="bi bi-shield-slash-fill" style="color:var(--ds-warn-text,#d97706);"></i>
          ) : (
            <i class="bi bi-shield-slash"></i>
          )}{" "}
          <span class="ds-btn-text">{blacklisted ? "Blacklisted" : "Blacklist"}</span>
        </button>
        <button
          type="button"
          class="win-button"
          title="Re-fetch series data from the server"
          onClick={() => setForceTick((t) => t + 1)}
        >
          <i class="bi bi-arrow-clockwise"></i> <span class="ds-btn-text">Refresh</span>
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
            <i class="bi bi-arrow-clockwise"></i> Retry
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
  const series = () => props.data.series;
  const coverPath = () => props.data.coverPath;
  const blacklisted = () => props.data.blacklisted;
  const chapters = () => props.data.chapters;
  const progress = () => props.data.progress;
  const cacheCounts = () => props.data.cacheCounts;
  const readHistorySet = () => props.data.readHistorySet;

  const tags = createMemo(() => groupTags(series()));
  const hasMetaRows = createMemo(() => {
    const t = tags();
    return (
      t.authorTags.length > 0 ||
      t.groupTags.length > 0 ||
      t.doujinTags.length > 0 ||
      t.pairingTags.length > 0 ||
      t.characterTags.length > 0 ||
      t.statusTags.length > 0 ||
      t.otherTags.length > 0
    );
  });

  return (
    <>
      <Show when={blacklisted()}>
        <div
          class="ds-row ds-blacklist-notice"
          style="background:var(--ds-warn-bg);border:1px solid var(--ds-warn-border);color:var(--ds-warn-text);border-radius:3px;padding:6px 12px;margin-bottom:10px;display:flex;align-items:center;gap:8px;font-size:11px;"
        >
          <i
            class="bi bi-shield-slash-fill"
            style="font-size:14px;color:var(--ds-warn-text,#d97706);flex-shrink:0;"
          ></i>
          <span>
            This series is on your <b>blacklist</b>. Its releases are hidden from browse feeds and
            search results.
          </span>
        </div>
      </Show>

      <div class="ds-series-head">
        <Cover
          path={coverPath()}
          alt={series().name}
          imgClass="ds-cover"
          placeholderClass="ds-cover-placeholder"
        />
        <div class="ds-fill">
          <div style="font-size:14px;font-weight:600;">{decodeEntities(series().name)}</div>
          <div class="ds-muted">{series().type ?? "Series"}</div>
          <Show when={series().description}>
            <SanitizedDescription html={series().description!} />
          </Show>
          <Show when={series().link}>
            <div class="ds-series-desc" style="margin:4px 0;">
              <a
                class="ds-external-link"
                style="color:var(--sys-primary,#0078d4);text-decoration:underline;cursor:pointer;word-break:break-all;"
                title={series().link!}
                onClick={(ev) => {
                  ev.preventDefault();
                  ev.stopPropagation();
                  void openExternal(series().link!);
                }}
              >
                Official / Source Link — {series().link}
              </a>
            </div>
          </Show>
          <Show when={hasMetaRows()}>
            <div class="ds-meta-rows">
              <MetaRow label="Author:" tags={tags().authorTags} />
              <MetaRow label="Scanlation Group:" tags={tags().groupTags} />
              <MetaRow label="Doujin:" tags={tags().doujinTags} />
              <MetaRow label="Pairings:" tags={tags().pairingTags} />
              <MetaRow label="Characters:" tags={tags().characterTags} />
              <MetaRow label="Status / Format:" tags={tags().statusTags} />
              <MetaRow label="Tags:" tags={tags().otherTags} />
            </div>
          </Show>
        </div>
      </div>

      <Show when={series().taggables && series().taggables!.length > 0}>
        <div class="group-box" style="margin-top:10px;">
          <div class="group-box-title">
            <i class="bi bi-collection"></i> Series &amp; Anthologies ({series().taggables!.length})
          </div>
          <div
            style="display:grid;grid-template-columns:repeat(auto-fill, minmax(220px, 1fr));gap:6px;margin-top:4px;"
          >
            <For each={series().taggables}>
              {(tg) => (
                <div
                  class="ds-row"
                  style="padding:5px 8px;background:var(--sys-bg-active, #f5f5f5);border:1px solid var(--sys-border-light, #e0e0e0);border-radius:3px;cursor:pointer;align-items:flex-start;gap:6px;"
                  title={decodeEntities(tg.name)}
                  onClick={() =>
                    navigate({
                      view: "series",
                      seriesPermalink: tg.permalink,
                      seriesName: tg.name,
                    })
                  }
                >
                  <i class="bi bi-book" style="color:var(--sys-primary,#0078d4);margin-top:1px;flex-shrink:0;"></i>
                  <span
                    style="flex:1;min-width:0;line-height:1.3;word-break:break-word;font-size:11px;font-weight:500;"
                  >
                    {decodeEntities(tg.name)}
                  </span>
                  <span class="ds-muted" style="font-size:10px;flex-shrink:0;margin-top:1px;">{tg.type}</span>
                </div>
              )}
            </For>
          </div>
        </div>
      </Show>

      <Show
        when={chapters().length === 0}
        fallback={
          <div style="display:flex;flex-direction:column;gap:6px;margin-top:10px;">
            <div
              class="ds-row"
              style="justify-content:space-between;align-items:center;padding:4px 2px;border-bottom:1px solid var(--sys-border-light, #ddd);"
            >
              <div style="font-size:12px;font-weight:600;">Chapters ({chapters().length})</div>
              <button
                type="button"
                class="win-button ds-btn-compact"
                title={
                  props.sortOrder() === "asc"
                    ? "Oldest first (click to sort newest first)"
                    : "Newest first (click to sort oldest first)"
                }
                onClick={() =>
                  props.setSortOrder(props.sortOrder() === "asc" ? "desc" : "asc")
                }
              >
                {props.sortOrder() === "asc" ? (
                  <i class="bi bi-sort-numeric-down"></i>
                ) : (
                  <i class="bi bi-sort-numeric-down-alt"></i>
                )}{" "}
                Sort: {props.sortOrder() === "asc" ? "Ascending" : "Descending"}
              </button>
            </div>
            <div style="display:flex;flex-direction:column;">
              <For each={props.ordered()}>
                {(ch, i) => (
                  <>
                    <Show
                      when={
                        ch.volumeHeader &&
                        (i() === 0 || props.ordered()[i() - 1].volumeHeader !== ch.volumeHeader)
                      }
                    >
                      <div class="ds-vol-header">{ch.volumeHeader}</div>
                    </Show>
                    <ChapterRow
                      ch={ch}
                      prog={progress().get(ch.permalink)}
                      cachedCount={cacheCounts().get(ch.permalink) ?? 0}
                      chapters={chapters()}
                      seriesPermalink={series().permalink}
                      seriesName={series().name}
                      isReadInHistory={readHistorySet().has(ch.permalink)}
                    />
                  </>
                )}
              </For>
            </div>
          </div>
        }
      >
        <Show when={!(series().taggables && series().taggables!.length > 0)}>
          <div class="ds-muted" style="margin-top:12px;">
            This entry has no chapters or series listed here.
          </div>
        </Show>
      </Show>
    </>
  );
}