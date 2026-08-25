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

const CHECK_STATE_RESET_MS = 2000;
const SCROLL_TOP_POLL_MS = 200;
const STALE_REVALIDATION_THRESHOLD_MS = 90_000;

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
  formatBytes,
  formatDateTime,
} from "../stores";
import { t } from "../i18n";
import {
  checkFeedOnline,
  fetchFeedWithRevalidation,
  getSessionTraffic,
  subscribeSessionTraffic,
} from "../api";
import {
  getBlacklistMode,
  getCached,
  isItemBlacklisted,
  type BlacklistMode,
} from "../db";
import { tryParseJson } from "../utils/json";
import { fetchItemStateSets } from "./useItemRowState";
import { browseCovers, coversEnabledSignal } from "./browse-covers";
import {
  setPaneError,
  setPaneLoading,
  setTopPagerFor,
  useDelayedSpinner,
  useTabPane,
} from "./browse-state";
import { Pager } from "../components/Pager";
import { Loading } from "../components/Loading";
import { IconText, IconButton } from "../components/Button";
import {
  RefreshIcon,
  CheckIcon,
  WarningIcon,
  DatabaseIcon,
  HashIcon,
  TrafficIcon,
  ArrowUpIcon,
} from "../components/Icon";
import { BlacklistNotice } from "../components/BlacklistNotice";
import { useTriggerWarning } from "../components/hooks/useTriggerWarning";
import { useAddToCollection } from "../components/hooks/useAddToCollection";
import { FeedItemRow } from "../components/FeedItemRow";
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

const parseFeedTop = (json: string): string | undefined =>
  tryParseJson<Feed>(json)?.chapters?.[0]?.permalink;

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
  const { readHistorySet: readSet, bookmarkSet, fullyCachedSet } =
    await fetchItemStateSets(permalinks);

  if (browseCovers.coversEnabled) {
    const coverTargets = feed.chapters.map((c) => browseCovers.getItemCoverInfo(c));
    await browseCovers.preloadBatch(coverTargets);
  }

  const blMode = getBlacklistMode();
  const blacklistedRows: FeedRowData[] = [];
  const rows: FeedRowData[] = [];
  for (const ch of feed.chapters) {
    const check = isItemBlacklisted(ch.tags, { name: ch.series ?? undefined });
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

  let cleanupScrollTop: (() => void) | null = null;
  onMount(() => {
    const unsub = subscribeSessionTraffic((t) => setTraffic(t));
    onCleanup(() => {
      unsub();
      cleanupScrollTop?.();
    });
  });

  const handleCheck = async (): Promise<void> => {
    setCheckState("checking");
    try {
      const outcome = await props.onCheckUpdates();
      if (outcome === "new-chapters") {
        setCheckState("ready");
      } else if (outcome === "unchanged") {
        setCheckState("synced");
        window.setTimeout(() => setCheckState("idle"), CHECK_STATE_RESET_MS);
      } else {
        setCheckState("idle");
      }
    } catch {
      setCheckState("failed");
      window.setTimeout(() => setCheckState("idle"), CHECK_STATE_RESET_MS);
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
    cleanupScrollTop?.();

    const settle = (): void => {
      if (settled) return;
      settled = true;
      cleanupScrollTop = null;
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
    cleanupScrollTop = () => {
      dsView.removeEventListener("scroll", checkArrival);
      dsView.removeEventListener("scrollend", settle);
      if (topTimer !== null) {
        window.clearInterval(topTimer);
        topTimer = null;
      }
    };
    dsView.addEventListener("scrollend", settle, { passive: true });
    dsView.addEventListener("scroll", checkArrival, { passive: true });
    topTimer = window.setInterval(() => {
      if (dsView.scrollTop <= 0) settle();
    }, SCROLL_TOP_POLL_MS);
  };

  const CHECK_STATE_CONFIG = {
    checking: { icon: <RefreshIcon spin={true} />, labelKey: "browse.feed.statusCheckChecking" as const },
    ready: { icon: <ArrowUpIcon />, labelKey: "browse.feed.statusCheckReady" as const },
    synced: { icon: <CheckIcon />, labelKey: "browse.feed.statusCheckSynced" as const },
    failed: { icon: <WarningIcon />, labelKey: "browse.feed.statusCheckFailed" as const },
  };

  const checkBtnIcon = (): JSX.Element => {
    const cfg = CHECK_STATE_CONFIG[checkState() as keyof typeof CHECK_STATE_CONFIG];
    return cfg?.icon ?? <RefreshIcon />;
  };

  const checkBtnText = (): string => {
    const cfg = CHECK_STATE_CONFIG[checkState() as keyof typeof CHECK_STATE_CONFIG];
    return t(cfg?.labelKey ?? "browse.feed.statusCheckDefault");
  };

  return (
    <div class="ds-feed-status-bar">
      <div class="ds-feed-status-left">
        <span
          class="ds-status-item ds-status-db"
          title={t("browse.feed.statusDbTitle", { date: formatDateTime(props.state.cachedAt) })}
        >
          <IconText icon={<DatabaseIcon />}>{formatDateTime(props.state.cachedAt)}</IconText>
        </span>
        <Show when={props.state.status}>
          <span
            class={`ds-status-pill ${props.state.isStale ? "stale" : "fresh"}`}
            title={t("browse.feed.statusCacheTitle", { status: props.state.status })}
          >
            {props.state.status}
          </span>
        </Show>
        <Show when={props.state.etag}>
          <span class="ds-etag-tag" title={t("browse.feed.statusEtagTitle", { etag: props.state.etag, status: props.state.etagStatus || "Cached" })}>
            <HashIcon /> <span class="ds-etag-hash">{props.state.etag!.replace(/^"|"$/g, "").slice(0, 8)}</span>
          </span>
        </Show>
        <span
          class="ds-status-item ds-status-traffic"
          title={t("browse.feed.statusTrafficTooltip", {
            sessionBytes: formatBytes(traffic().bytesDownloaded),
            sessionReqs: traffic().networkRequests,
            sessionHits: traffic().cacheHits,
            sessionSaved: formatBytes(traffic().bytesSaved),
            lifetimeBytes: formatBytes(traffic().lifetime.bytesDownloaded),
            lifetimeReqs: traffic().lifetime.networkRequests,
            lifetimeHits: traffic().lifetime.cacheHits,
            lifetimeSaved: formatBytes(traffic().lifetime.bytesSaved),
          })}
        >
          <IconText icon={<TrafficIcon />}>{formatBytes(traffic().bytesDownloaded, "", 1)}</IconText>
        </span>
      </div>
      <div class="ds-feed-status-right">
        <IconButton
          className="ds-status-refresh-btn"
          title={t("browse.feed.statusForceCheckTooltip")}
          disabled={checkState() === "checking"}
          onClick={() => void handleCheck()}
          icon={checkBtnIcon()}
          text={checkBtnText()}
        />
        <div class="ds-feed-status-pager-wrap ds-ml-auto">
          <Show when={props.pager}>{props.pager}</Show>
        </div>
        <IconButton
          icon={<ArrowUpIcon />}
          text={t("common.top")}
          className="ds-scroll-top-btn"
          title={t("browse.feed.statusScrollTopTooltip")}
          onClick={onScrollTop}
        />
      </div>
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
  const triggerWarning = useTriggerWarning();
  const addToCol = useAddToCollection();

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
            ? t("browse.feed.statusStale")
            : t("browse.feed.statusCached")
          : t("browse.feed.statusFresh"),
      etagStatus: model.feedResult.etag ? t("browse.feed.statusCached") : "None",
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
      for (const img of hostEl.querySelectorAll<HTMLImageElement>("img.ds-feed-cover")) {
        img.remove();
      }
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
            status: t("browse.feed.statusUpdated"),
            etagStatus: t("browse.feed.statusUpdated"),
            isStale: false,
          });
        } else {
          setFooterState({
            cachedAt: model.feedResult.cachedAt,
            etag: preserveEtag(),
            status: t("browse.feed.statusSynced"),
            etagStatus: t("browse.feed.statusMatchesServer"),
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
            status: t("browse.feed.statusUpdated"),
            etagStatus: t("browse.feed.statusUpdated"),
            isStale: false,
          });
        } else {
          setFooterState({
            cachedAt: model.feedResult.cachedAt,
            etag: preserveEtag(),
            status: t("browse.feed.statusSynced"),
            etagStatus: t("browse.feed.statusMatchesServer"),
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
      if (last > 0 && Date.now() - last > STALE_REVALIDATION_THRESHOLD_MS) {
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
          status: t("browse.feed.statusNewReleases"),
          etagStatus: t("browse.feed.statusUpdated"),
          isStale: false,
        });
        setUpdateBanner(true);
        return "new-chapters";
      } else if (head.status === "unchanged") {
        setFooterState({
          cachedAt: Date.now(),
          etag: footerState().etag,
          status: t("browse.feed.statusSynced"),
          etagStatus: t("browse.feed.statusMatchesServer"),
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
      item={row.ch}
      isRead={row.isRead}
      isBookmarked={row.isBookmarked}
      isBlacklisted={row.isBlacklisted}
      matchedTags={row.matchedTags}
      isFullyCached={row.isFullyCached}
      onWarn={(title, matchedTags, proceed) => triggerWarning.warn(title, matchedTags, proceed)}
      onAddToCol={addToCol.onAddToCol}
    />
  );

  return (
    <div ref={(el) => { hostEl = el; }}>
      <Show when={model() !== undefined && model()!.feed.chapters.length > 0}>
        <Show when={updateBanner()}>
          <div class="ds-feed-update-banner">
            <IconButton
              icon={<RefreshIcon />}
              text={t("browse.feed.newChaptersNotice")}
              className="ds-feed-update-btn"
              onClick={() => pane.goToPage(1)}
            />
          </div>
        </Show>

        <Show when={model()!.blMode === "hide" && model()!.blacklistedRows.length > 0}>
          <BlacklistNotice
            count={model()!.blacklistedRows.length}
            noun="chapter"
            showHidden={showHidden()}
            onToggle={() => setShowHidden(!showHidden())}
          />
          <Show when={showHidden()}>
            <div class="ds-col-4 ds-mb-8">
              <For each={model()!.blacklistedRows}>{renderRow}</For>
            </div>
          </Show>
        </Show>

        <Show
          when={model()!.blMode === "hide" && normalRows().length === 0 && model()!.blacklistedRows.length > 0}
        >
          <div class="ds-muted ds-empty-muted">
            {t("browse.feed.emptyBlacklist")}
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
        <div class="ds-muted">{t("browse.feed.emptyPage")}</div>
      </Show>

      <Show when={showSpinner() && model() === undefined}>
        <Loading message={t("browse.feed.loadingChapters")} />
      </Show>

      {triggerWarning.host}
      {addToCol.host}
    </div>
  );
}