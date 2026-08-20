/**
 * Solid Browse feed pane (Recent Releases / Recently Added). Port of
 * `browse-feed.ts`:
 *
 *  - cache-first `fetchFeedWithRevalidation`, per-item read/bookmark/fully-
 *    cached state, lazy cover hydration via the `browseCovers` service
 *  - blacklist split (hide = collapsible hidden list, warn = inline badges)
 *  - revalidation status footer with live session traffic, head revalidation
 *    banner, manual Check Updates, and the scroll-to-top cover pause/resume
 */

import {
  createEffect,
  createSignal,
  For,
  Show,
  onMount,
  onCleanup,
  type Accessor,
  type JSX,
} from "solid-js";
import {
  decodeEntities,
  formatBytes,
  formatDateTime,
  navigate,
  setBanner,
  sortTagsByCategory,
} from "../stores";
import {
  checkFeedOnline,
  fetchFeedWithRevalidation,
  getSessionTraffic,
  openExternal,
  subscribeSessionTraffic,
} from "../api";
import {
  addBookmark,
  getBlacklistMode,
  getBookmarkPermalinks,
  getCached,
  getFullyCachedChapterPermalinks,
  getHistoryPermalinks,
  isItemBlacklisted,
  removeBookmark,
  type BlacklistMode,
  type CollectionItemKind,
} from "../db";
import { browseCovers, coversEnabledSignal } from "./browse-covers";
import {
  setPaneError,
  setPaneLoading,
  setTopPagerFor,
  useDelayedSpinner,
  useTabPane,
} from "./browse-state";
import { Pager } from "../components/Pager";
import { TagPill } from "../components/TagPill";
import { Loading } from "../components/Loading";
import { TriggerWarningModal } from "../components/TriggerWarning";
import { AddToCollectionModal, type AddToCollectionItem } from "../components/AddToCollectionModal";
import type { Feed, FeedChapter, FeedRevalidationResult } from "../types/api";

const FEED_TAB_TO_URL: Record<string, string> = {
  releases: "/chapters.json",
  added: "/chapters/added.json",
};
const FEED_TAB_TO_KEY: Record<string, string> = {
  releases: "feed:releases",
  added: "feed:added",
};

/**
 * Revalidates the feed HEAD (page 1) to detect genuinely new chapters. New
 * releases always land at position 0 of page 1, so only its top permalink can
 * signal "new chapters". Port of the same helper in legacy `browse-feed.ts`.
 */
async function revalidateFeedHead(tabId: string): Promise<{
  hasNew: boolean;
  etag?: string;
  status: "unchanged" | "new-chapters" | "no-baseline" | "error";
}> {
  const url = FEED_TAB_TO_URL[tabId];
  const key = `${FEED_TAB_TO_KEY[tabId]}:1`;
  const cached = await getCached(key);
  const cachedTop = cached ? parseFeedTop(cached.json_payload) : undefined;
  try {
    const res = await checkFeedOnline(url, key, cached?.etag);
    if (res.status === 200 && res.data) {
      const freshTop = res.data.chapters?.[0]?.permalink;
      if (cachedTop !== undefined && freshTop && freshTop !== cachedTop) {
        return { hasNew: true, etag: res.etag, status: "new-chapters" };
      }
      return {
        hasNew: false,
        etag: res.etag,
        status: cachedTop === undefined ? "no-baseline" : "unchanged",
      };
    }
    if (res.status === 304) {
      return { hasNew: false, etag: res.etag ?? cached?.etag, status: "unchanged" };
    }
    return { hasNew: false, etag: cached?.etag, status: "error" };
  } catch {
    return { hasNew: false, etag: cached?.etag, status: "error" };
  }
}

function parseFeedTop(json: string): string | undefined {
  try {
    return (JSON.parse(json) as Feed).chapters?.[0]?.permalink;
  } catch {
    return undefined;
  }
}

interface FeedRowData {
  ch: FeedChapter;
  isRead: boolean;
  isBookmarked: boolean;
  isBlacklisted: boolean;
  matchedTags: string[];
  isFullyCached: boolean;
}

interface FeedModel {
  feed: Feed;
  feedResult: FeedRevalidationResult;
  blMode: BlacklistMode;
  rows: FeedRowData[];
  blacklistedRows: FeedRowData[];
}

async function loadFeedModel(tabId: string, page: number): Promise<FeedModel> {
  const url = `${FEED_TAB_TO_URL[tabId]}?page=${page}`;
  const key = `${FEED_TAB_TO_KEY[tabId]}:${page}`;
  const feedResult = await fetchFeedWithRevalidation(url, key);
  const feed = feedResult.data;
  if (!feed.chapters) feed.chapters = [];

  const permalinks = feed.chapters.map((c) => c.permalink);
  let readSet = new Set<string>();
  let bookmarkSet = new Set<string>();
  let fullyCachedSet = new Set<string>();
  try {
    const [h, b, fc] = await Promise.all([
      getHistoryPermalinks(permalinks),
      getBookmarkPermalinks(permalinks),
      getFullyCachedChapterPermalinks(),
    ]);
    readSet = h;
    bookmarkSet = b;
    fullyCachedSet = fc;
  } catch {
    readSet = new Set();
    bookmarkSet = new Set();
    fullyCachedSet = new Set();
  }

  if (browseCovers.coversEnabled) {
    const coverTargets = feed.chapters.map((c) => browseCovers.getItemCoverInfo(c));
    await browseCovers.preloadBatch(coverTargets);
  }

  const blMode = getBlacklistMode();
  const blacklistedRows: FeedRowData[] = [];
  const rows: FeedRowData[] = [];
  for (const ch of feed.chapters) {
    const check = isItemBlacklisted(ch.tags, { name: ch.series });
    const row: FeedRowData = {
      ch,
      isRead: readSet.has(ch.permalink),
      isBookmarked: bookmarkSet.has(ch.permalink),
      isBlacklisted: check.blacklisted,
      matchedTags: check.matchedTags,
      isFullyCached: fullyCachedSet.has(ch.permalink),
    };
    rows.push(row);
    if (check.blacklisted) blacklistedRows.push(row);
  }

  return { feed, feedResult, blMode, rows, blacklistedRows };
}

interface FeedStatusFooterState {
  cachedAt?: number;
  etag?: string;
  status: string;
  etagStatus?: string;
  isStale: boolean;
}

function FeedStatusFooter(props: {
  state: FeedStatusFooterState;
  pager?: JSX.Element;
  getHost: () => HTMLElement | null;
  onCheckUpdates: () => Promise<string>;
}) {
  const [traffic, setTraffic] = createSignal(getSessionTraffic());
  const [checkState, setCheckState] = createSignal<"idle" | "checking" | "ready" | "synced" | "failed">("idle");

  onMount(() => {
    const unsub = subscribeSessionTraffic((t) => setTraffic(t));
    onCleanup(unsub);
  });

  const handleCheck = async (): Promise<void> => {
    setCheckState("checking");
    try {
      const outcome = await props.onCheckUpdates();
      if (outcome === "new-chapters") {
        setCheckState("ready");
      } else if (outcome === "unchanged") {
        setCheckState("synced");
        window.setTimeout(() => setCheckState("idle"), 2000);
      } else {
        setCheckState("idle");
      }
    } catch {
      setCheckState("failed");
      window.setTimeout(() => setCheckState("idle"), 2000);
    }
  };

  const onScrollTop = (): void => {
    const dsView = document.getElementById("ds-pane-browse") || document.getElementById("ds-view");
    if (!dsView || dsView.scrollTop <= 0) return;

    // Pause hydration pumps during the smooth scroll so flying elements never
    // trigger observations; resume only once the view has genuinely settled.
    browseCovers.scrollToTop();
    dsView.scrollTo({ top: 0, behavior: "smooth" });

    let settled = false;
    let topTimer: number | null = null;
    const settle = (): void => {
      if (settled) return;
      settled = true;
      dsView.removeEventListener("scroll", checkArrival);
      dsView.removeEventListener("scrollend", settle);
      if (topTimer !== null) {
        window.clearInterval(topTimer);
        topTimer = null;
      }
      const host = props.getHost();
      if (host && host === browseCovers.currentHydrationHost) {
        browseCovers.resumeAfterScrollToTop(host);
      }
    };
    const checkArrival = (): void => {
      if (dsView.scrollTop <= 0) settle();
    };
    dsView.addEventListener("scrollend", settle, { passive: true });
    dsView.addEventListener("scroll", checkArrival, { passive: true });
    topTimer = window.setInterval(() => {
      if (dsView.scrollTop <= 0) settle();
    }, 200);
  };

  const checkBtnLabel = (): JSX.Element => {
    if (checkState() === "checking") {
      return (
        <>
          <i class="bi bi-arrow-clockwise ds-spin"></i> Checking...
        </>
      );
    }
    if (checkState() === "ready") {
      return (
        <>
          <i class="bi bi-arrow-up-circle"></i> Update Ready
        </>
      );
    }
    if (checkState() === "synced") {
      return (
        <>
          <i class="bi bi-check-lg"></i> Up to Date
        </>
      );
    }
    if (checkState() === "failed") {
      return (
        <>
          <i class="bi bi-exclamation-triangle"></i> Failed
        </>
      );
    }
    return (
      <>
        <i class="bi bi-arrow-clockwise"></i> Check Updates
      </>
    );
  };

  return (
    <div class="ds-feed-status-bar">
      <div class="ds-feed-status-left">
        <span
          class="ds-status-item ds-status-db"
          title="Timestamp when metadata was stored in local SQLite database"
        >
          <i class="bi bi-database"></i> DB Cache: <b>{formatDateTime(props.state.cachedAt)}</b>
        </span>
        <span class="ds-status-item ds-status-state" title="Current cache state">
          <i class="bi bi-hdd-network"></i> Status:{" "}
          <span class={`ds-status-pill ${props.state.isStale ? "stale" : "fresh"}`}>
            {props.state.status}
          </span>
        </span>
        <span class="ds-status-item ds-status-etag-wrap" title="HTTP ETag conditional caching status">
          <i class="bi bi-shield-check"></i> ETag:{" "}
          <span class="ds-etag-status-label">{props.state.etagStatus || "Cached"}</span>
          <Show when={props.state.etag}>
            <span class="ds-etag-tag" title={`HTTP ETag: ${props.state.etag}`}>
              <i class="bi bi-hash"></i>{" "}
              <span class="ds-etag-hash">
                {props.state.etag!.replace(/^"|"$/g, "").slice(0, 8)}
              </span>
            </span>
          </Show>
        </span>
        <span
          class="ds-status-item ds-status-traffic"
          title="Online network bandwidth consumed in this session"
        >
          <i class="bi bi-arrow-down-up"></i> Traffic:{" "}
          <b class="ds-traffic-bytes">{formatBytes(traffic().bytesDownloaded, "", 1)}</b>{" "}
          <span class="ds-traffic-counts ds-muted" style="font-size:10px;">
            ({traffic().networkRequests} reqs{traffic().cacheHits > 0 ? `, ${traffic().cacheHits} cached` : ""})
          </span>
        </span>
      </div>
      <div class="ds-feed-status-right">
        <div class="ds-feed-status-pager-wrap">
          <Show when={props.pager}>{props.pager}</Show>
        </div>
        <button
          type="button"
          class="win-button ds-status-refresh-btn"
          title="Force check for updates online without reloading page"
          disabled={checkState() === "checking"}
          onClick={() => void handleCheck()}
        >
          {checkBtnLabel()}
        </button>
        <button
          type="button"
          class="win-button ds-scroll-top-btn"
          title="Scroll to top of list"
          onClick={onScrollTop}
        >
          <i class="bi bi-arrow-up"></i> Top
        </button>
      </div>
    </div>
  );
}

function FeedItemRow(props: {
  row: FeedRowData;
  onWarn: (title: string, matchedTags: string[], proceed: () => void) => void;
  onAddToCol: (item: AddToCollectionItem, anchorEl: HTMLElement) => void;
}) {
  const { ch, isBlacklisted, matchedTags, isFullyCached } = props.row;
  const [bookmarked, setBookmarked] = createSignal(props.row.isBookmarked);

  const coverInfo = browseCovers.getItemCoverInfo(ch);
  const blMode = getBlacklistMode();

  const openChapter = (): void => {
    navigate({
      view: "reader",
      chapterPermalink: ch.permalink,
      chapterTitle: ch.title,
    });
  };

  const openSeries = (permalink: string, name: string): void => {
    navigate({
      view: "series",
      seriesPermalink: permalink,
      seriesName: name,
    });
  };

  const guardedOpen = (title: string, proceed: () => void): void => {
    if (isBlacklisted && matchedTags.length > 0) {
      props.onWarn(title, matchedTags, proceed);
    } else {
      proceed();
    }
  };

  const toggleBookmark = async (): Promise<void> => {
    try {
      if (bookmarked()) {
        await removeBookmark(ch.permalink);
        setBookmarked(false);
        setBanner(`Removed "${ch.title}" from bookmarks.`);
      } else {
        await addBookmark({
          chapterPermalink: ch.permalink,
          seriesPermalink: "",
          seriesName: ch.series ?? "",
          chapterTitle: ch.title,
          pageIndex: 0,
        });
        setBookmarked(true);
        setBanner(`Saved "${ch.title}" to Read Later!`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setBanner(`Bookmark failed: ${msg}`);
    }
  };

  const openAddToCol = (anchorEl: HTMLElement): void => {
    if (!coverInfo.isStandalone) {
      const sPermalink =
        coverInfo.seriesPermalink ||
        (ch.series ? ch.series.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") : ch.permalink);
      props.onAddToCol(
        {
          permalink: sPermalink,
          title: coverInfo.seriesName || ch.series || ch.title,
          kind: (coverInfo.seriesType === "anthology" ? "anthology" : "series") as CollectionItemKind,
          cover: coverInfo.coverKey,
        },
        anchorEl,
      );
    } else {
      const doujinTag = (ch.tags ?? []).find((t) => {
        const type = (t.type ?? "").toLowerCase();
        return type === "doujin" || type === "doujinshi";
      });
      const anthologyTag = (ch.tags ?? []).find((t) => (t.type ?? "").toLowerCase() === "anthology");
      const kind: CollectionItemKind = doujinTag
        ? "doujin"
        : anthologyTag
          ? "anthology"
          : "oneshot";
      props.onAddToCol(
        {
          permalink: ch.permalink,
          title: ch.title,
          kind,
          cover: coverInfo.coverKey,
        },
        anchorEl,
      );
    }
  };

  const tags = sortTagsByCategory(
    (ch.tags ?? []).filter((t) => (t.type ?? "").toLowerCase() !== "series"),
  ).slice(0, 8);

  const coverTitle = coverInfo.isStandalone
    ? `Read "${decodeEntities(ch.title)}"`
    : `View series: ${decodeEntities(coverInfo.seriesName || coverInfo.seriesPermalink)}`;

  return (
    <div
      class={`ds-item ds-feed-item${props.row.isRead ? " ds-item-read" : ""}`}
      style={`display:flex;align-items:center;gap:10px;padding:6px 8px;${
        isBlacklisted ? "opacity:0.8;background:var(--sys-bg-active,#fcf8f8);" : ""
      }`}
      onClick={() => guardedOpen(ch.title, openChapter)}
    >
      <div
        ref={(el) => browseCovers.observe(el)}
        class="ds-feed-cover-wrap"
        style="flex-shrink:0;cursor:pointer;"
        data-feed-cover={coverInfo.coverKey}
        data-chapter-permalink={coverInfo.chapterPermalink}
        data-series-permalink={coverInfo.seriesPermalink}
        data-series-type={coverInfo.seriesType || ""}
        title={coverTitle}
        onClick={(ev) => {
          ev.stopPropagation();
          if (coverInfo.isStandalone) {
            guardedOpen(ch.title, openChapter);
          } else {
            guardedOpen(coverInfo.seriesName || ch.title, () =>
              openSeries(coverInfo.seriesPermalink, coverInfo.seriesName || coverInfo.seriesPermalink),
            );
          }
        }}
      >
        <div class="ds-feed-cover-placeholder">
          <i class="bi bi-book"></i>
        </div>
      </div>

      <div class="ds-fill" style="display:flex;flex-direction:column;gap:4px;">
        <div
          class="ds-item-title"
          style="font-weight:600;cursor:pointer;display:flex;align-items:center;gap:4px;flex-wrap:wrap;"
          onClick={(ev) => {
            ev.stopPropagation();
            guardedOpen(ch.title, openChapter);
          }}
        >
          <span>{decodeEntities(ch.title)}</span>
          <Show when={isFullyCached}>
            <i
              class="bi bi-cloud-check-fill ds-offline-icon"
              style="color:var(--sys-primary,#0078d4);font-size:11px;"
              title="Available Offline (Fully Cached)"
            ></i>
          </Show>
        </div>

        <div class="ds-flex-row" style="flex-wrap:wrap;">
          <Show when={ch.series}>
            <span
              class="ds-series-link"
              title={`Go to series: ${decodeEntities(ch.series!)}`}
              onClick={(ev) => {
                ev.stopPropagation();
                guardedOpen(ch.series!, () =>
                  openSeries(coverInfo.seriesPermalink || ch.series!, ch.series!),
                );
              }}
            >
              {decodeEntities(ch.series!)}
            </span>
          </Show>
          <For each={tags}>
            {(t) => <TagPill type={t.type} name={t.name} permalink={t.permalink} />}
          </For>
          <Show when={isBlacklisted && matchedTags.length > 0}>
            <span
              style="font-size:9px;background:var(--ds-danger-bg);color:var(--ds-danger-text);padding:1px 5px;border-radius:2px;border:1px solid var(--ds-danger-border);display:inline-flex;align-items:center;gap:3px;font-weight:600;"
            >
              <i class="bi bi-exclamation-triangle-fill"></i>{" "}
              {blMode === "warn" ? "Content Warning" : "Blacklisted"}: {decodeEntities(matchedTags.join(", "))}
            </span>
          </Show>
        </div>
      </div>

      <button
        type="button"
        class={`win-button ds-btn-compact${bookmarked() ? " primary" : ""}`}
        title={bookmarked() ? "Remove from Read Later" : "Save for Read Later"}
        onClick={(ev) => {
          ev.stopPropagation();
          void toggleBookmark();
        }}
      >
        {bookmarked() ? <i class="bi bi-bookmark-fill"></i> : <i class="bi bi-bookmark-plus"></i>}
        {bookmarked() ? " Saved" : " Read Later"}
      </button>
      <button
        type="button"
        class="win-button ds-btn-compact"
        style="flex-shrink:0;"
        title={
          !coverInfo.isStandalone
            ? `Add series "${decodeEntities(coverInfo.seriesName || ch.series || "")}" to collection`
            : "Add to Favorites or custom collections"
        }
        onClick={(ev) => {
          ev.stopPropagation();
          openAddToCol(ev.currentTarget as HTMLElement);
        }}
      >
        <i class="bi bi-folder-plus"></i>
      </button>
      <button
        type="button"
        class="win-button ds-btn-compact"
        style="flex-shrink:0;"
        title={`Open "${decodeEntities(ch.title)}" on Dynasty Scans in browser`}
        onClick={(ev) => {
          ev.stopPropagation();
          openExternal(`https://dynasty-scans.com/chapters/${ch.permalink}`);
        }}
      >
        <i class="bi bi-box-arrow-up-right"></i>
      </button>
    </div>
  );
}

export interface BrowseFeedProps {
  tabId: "releases" | "added";
  active: Accessor<boolean>;
  revision: Accessor<number>;
  forceTick: Accessor<number>;
}

export function BrowseFeed(props: BrowseFeedProps) {
  const pane = useTabPane<FeedModel>({
    active: props.active,
    revision: props.revision,
    forceTick: props.forceTick,
    load: (page) => loadFeedModel(props.tabId, page),
  });
  const showSpinner = useDelayedSpinner(pane.loading);

  const [updateBanner, setUpdateBanner] = createSignal(false);
  const [showHidden, setShowHidden] = createSignal(false);
  const [footerState, setFooterState] = createSignal<FeedStatusFooterState>({
    cachedAt: undefined,
    etag: undefined,
    status: "",
    etagStatus: "Cached",
    isStale: false,
  });
  const [warning, setWarning] = createSignal<{
    title: string;
    matchedTags: string[];
    onProceed: () => void;
  } | null>(null);
  const [addToCol, setAddToCol] = createSignal<{
    item: AddToCollectionItem;
    anchorEl: HTMLElement;
  } | null>(null);

  let hostEl: HTMLElement | null = null;

  createEffect(() => {
    setPaneLoading(props.tabId, pane.loading());
    setPaneError(props.tabId, pane.error() !== undefined);
  });

  // Model change: refresh top pager, footer state, banners, and re-arm cover
  // hydration for the freshly rendered page (beginPage resets the observer,
  // reobserve re-attaches every placeholder wrap).
  createEffect(() => {
    const model = pane.data();
    if (!model) return;
    setTopPagerFor(props.tabId, {
      totalPages: model.feed.total_pages,
      currentPage: model.feed.current_page,
      onPage: (p) => pane.goToPage(p),
    });
    setFooterState({
      cachedAt: model.feedResult.cachedAt,
      etag: model.feedResult.etag,
      status:
        model.feedResult.source === "sqlite"
          ? model.feedResult.isStale
            ? "Stale (Revalidating...)"
            : "SQLite (Cached)"
          : "Fresh (Dynasty Scans)",
      etagStatus: model.feedResult.etag ? "Cached" : "None",
      isStale: model.feedResult.isStale,
    });
    setUpdateBanner(false);
    setShowHidden(false);
    if (hostEl) {
      browseCovers.beginPage(hostEl);
      browseCovers.reobserveUnloadedCovers(hostEl);
    }
  });

  // Covers toggle: re-arm hydration when the setting is turned on, or scrub
  // all <img> placeholders when turned off. Mirrors the old renderCurrent()
  // call that the vanilla-JS settings modal used to force a page rebuild.
  createEffect(() => {
    const enabled = coversEnabledSignal();
    if (!hostEl) return;
    if (enabled) {
      // Re-arm: kick off a fresh hydration pass on the current DOM.
      browseCovers.beginPage(hostEl);
      browseCovers.reobserveUnloadedCovers(hostEl);
    } else {
      // Scrub all cover <img> elements from the rendered list so the UI
      // instantly reflects the disabled state without a full page reload.
      hostEl.querySelectorAll<HTMLImageElement>("img.ds-feed-cover").forEach((img) => {
        img.remove();
      });
    }
  });

  // Background revalidation (stale-while-revalidate). Page 1's promise may
  // drive the "new chapters available" banner; deeper pages keep their own
  // footer fresh and re-check the head separately.
  createEffect(() => {
    const model = pane.data();
    if (!model) return;
    const revalidatePromise = model.feedResult.revalidatePromise;
    if (!revalidatePromise) return;
    const page = pane.page();
    const currentTop = model.feed.chapters?.[0]?.permalink;
    const preserveEtag = (): string | undefined => footerState().etag;

    if (page === 1) {
      void revalidatePromise.then((reval) => {
        if (hostEl !== browseCovers.currentHydrationHost) return;
        if (reval) {
          const freshTop = reval.data.chapters?.[0]?.permalink;
          if (freshTop && freshTop !== currentTop) setUpdateBanner(true);
          setFooterState({
            cachedAt: Date.now(),
            etag: reval.etag || preserveEtag(),
            status: "Updated (200 OK)",
            etagStatus: "Updated (200 OK)",
            isStale: false,
          });
        } else {
          setFooterState({
            cachedAt: model.feedResult.cachedAt,
            etag: preserveEtag(),
            status: "Synced (304 Not Modified)",
            etagStatus: "Matches Server (304)",
            isStale: false,
          });
        }
      });
    } else {
      void revalidatePromise.then((reval) => {
        if (hostEl !== browseCovers.currentHydrationHost) return;
        if (reval) {
          setFooterState({
            cachedAt: Date.now(),
            etag: reval.etag || preserveEtag(),
            status: "Updated (200 OK)",
            etagStatus: "Updated (200 OK)",
            isStale: false,
          });
        } else {
          setFooterState({
            cachedAt: model.feedResult.cachedAt,
            etag: preserveEtag(),
            status: "Synced (304 Not Modified)",
            etagStatus: "Matches Server (304)",
            isStale: false,
          });
        }
      });
      void revalidateFeedHead(props.tabId).then((head) => {
        if (hostEl !== browseCovers.currentHydrationHost) return;
        if (head.hasNew) setUpdateBanner(true);
      });
    }
  });

  // Stale (>90s) head revalidation when returning to an already-loaded tab.
  const [loadedAt, setLoadedAt] = createSignal(0);
  createEffect(() => {
    const m = pane.data();
    if (m !== undefined && !pane.loading()) setLoadedAt(Date.now());
  });
  let prevActive = false;
  createEffect(() => {
    const act = props.active();
    if (act && !prevActive && pane.data() !== undefined) {
      const last = loadedAt();
      if (last > 0 && Date.now() - last > 90_000) {
        setLoadedAt(Date.now());
        void revalidateFeedHead(props.tabId).then((head) => {
          if (props.active() && head.hasNew) setUpdateBanner(true);
        });
      }
    }
    prevActive = act;
  });

  const handleFooterCheck = async (): Promise<string> => {
    try {
      const head = await revalidateFeedHead(props.tabId);
      if (head.status === "new-chapters") {
        setFooterState({
          cachedAt: Date.now(),
          etag: head.etag || footerState().etag,
          status: "New releases available",
          etagStatus: "Updated (200 OK)",
          isStale: false,
        });
        setUpdateBanner(true);
        return "new-chapters";
      } else if (head.status === "unchanged") {
        setFooterState({
          cachedAt: Date.now(),
          etag: footerState().etag,
          status: "Synced (304 Not Modified)",
          etagStatus: "Matches Server (304)",
          isStale: false,
        });
        return "unchanged";
      }
      return "none";
    } catch (err) {
      console.warn("Manual check updates failed:", err);
      throw err;
    }
  };

  const model = (): FeedModel | undefined => pane.data();

  const normalRows = (): FeedRowData[] => {
    const m = model();
    if (!m) return [];
    if (m.blMode === "hide") return m.rows.filter((r) => !r.isBlacklisted);
    return m.rows;
  };

  const renderRow = (row: FeedRowData): JSX.Element => (
    <FeedItemRow
      row={row}
      onWarn={(title, matchedTags, proceed) => setWarning({ title, matchedTags, onProceed: proceed })}
      onAddToCol={(item, anchorEl) => setAddToCol({ item, anchorEl })}
    />
  );

  return (
    <div ref={(el) => { hostEl = el; }}>
      <Show when={model() !== undefined && model()!.feed.chapters.length > 0}>
        <Show when={updateBanner()}>
          <div class="ds-feed-update-banner">
            <button
              type="button"
              class="win-button ds-feed-update-btn"
              onClick={() => pane.goToPage(1)}
            >
              <i class="bi bi-arrow-clockwise"></i> New chapters available — Click to update
            </button>
          </div>
        </Show>

        <Show when={model()!.blMode === "hide" && model()!.blacklistedRows.length > 0}>
          <div
            class="ds-row ds-blacklist-notice"
            style="background:var(--ds-warn-bg);border:1px solid var(--ds-warn-border);color:var(--ds-warn-text);border-radius:3px;padding:4px 10px;justify-content:space-between;align-items:center;margin-bottom:6px;font-size:11px;"
          >
            <div class="ds-flex-row">
              <i class="bi bi-shield-slash-fill" style="color:#dc3545;"></i>
              <span>
                <b>{model()!.blacklistedRows.length}</b> chapter
                {model()!.blacklistedRows.length === 1 ? "" : "s"} hidden by blacklist.
              </span>
            </div>
            <button
              type="button"
              class="win-button ds-btn-sm"
              onClick={() => setShowHidden(!showHidden())}
            >
              <i class={`bi bi-${showHidden() ? "eye-slash" : "eye"}`}></i>{" "}
              {showHidden()
                ? "Hide Blacklisted"
                : `Show Blacklisted (${model()!.blacklistedRows.length})`}
            </button>
          </div>
          <Show when={showHidden()}>
            <div style="display:flex;flex-direction:column;gap:4px;margin-bottom:8px;">
              <For each={model()!.blacklistedRows}>{renderRow}</For>
            </div>
          </Show>
        </Show>

        <Show
          when={model()!.blMode === "hide" && normalRows().length === 0 && model()!.blacklistedRows.length > 0}
        >
          <div class="ds-muted" style="padding:12px 0;text-align:center;font-size:11px;">
            All chapters on this page were hidden by your blacklist.
          </div>
        </Show>

        <Show when={normalRows().length > 0}>
          <For each={normalRows()}>{renderRow}</For>
        </Show>

        <FeedStatusFooter
          state={footerState()}
          pager={
            <Pager
              totalPages={model()!.feed.total_pages}
              currentPage={model()!.feed.current_page}
              onPage={(p) => pane.goToPage(p)}
              cssText="margin:0;"
            />
          }
          getHost={() => hostEl}
          onCheckUpdates={handleFooterCheck}
        />
      </Show>

      <Show when={model() !== undefined && model()!.feed.chapters.length === 0}>
        <div class="ds-muted">No chapters on this page.</div>
      </Show>

      <Show when={showSpinner() && model() === undefined}>
        <Loading message="Loading chapters..." />
      </Show>

      <TriggerWarningModal
        open={warning() !== null}
        title={warning()?.title ?? ""}
        matchedTags={warning()?.matchedTags ?? []}
        onClose={() => setWarning(null)}
        onProceed={warning()?.onProceed ?? (() => {})}
      />
      <AddToCollectionModal
        open={addToCol() !== null}
        item={addToCol()?.item ?? { permalink: "", title: "" }}
        anchorEl={addToCol()?.anchorEl ?? null}
        onClose={() => setAddToCol(null)}
      />
    </div>
  );
}