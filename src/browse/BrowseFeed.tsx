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
  type Accessor,
  type JSX,
} from "solid-js";
import { t } from "../i18n";
import { fetchFeedWithRevalidation } from "../api";
import {
  getBlacklistMode,
  isItemBlacklisted,
  type BlacklistMode,
} from "../db";
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
import { IconButton } from "../components/Button";
import { RefreshIcon } from "../components/Icon";
import { BlacklistNotice } from "../components/BlacklistNotice";
import { useTriggerWarning } from "../components/hooks/useTriggerWarning";
import { useAddToCollection } from "../components/hooks/useAddToCollection";
import { FeedItemRow } from "../components/FeedItemRow";
import {
  revalidateFeedHead,
  STALE_REVALIDATION_THRESHOLD_MS,
  FEED_TAB_TO_URL,
  FEED_TAB_TO_KEY,
} from "./useFeedHeadRevalidation";
import { BrowseFeedFooter, type FeedStatusFooterState } from "./BrowseFeedFooter";
import type { Feed, FeedChapter, FeedRevalidationResult } from "../types/api";


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

  // Covers toggle: re-arm hydration when the setting is turned on.
  // Solid's reactive Show primitive in HydratedCover automatically manages
  // mounting/unmounting cover images when coversEnabledSignal() changes.
  createEffect(() => {
    const enabled = coversEnabledSignal();
    if (!hostEl) return;
    if (enabled) {
      browseCovers.beginPage(hostEl);
      browseCovers.reobserveUnloadedCovers(hostEl);
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
    if (m.blMode === "hide" || m.blMode === "ghost") return m.rows.filter((r) => !r.isBlacklisted);
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

        <BrowseFeedFooter
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