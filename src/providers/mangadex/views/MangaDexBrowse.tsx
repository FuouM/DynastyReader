/**
 * MangaDex Browse View Container
 * 100% visual, layout, and structural parity with Dynasty's BrowseView:
 *
 * - Search & Go collapsible panel (search box + open-by-URL for MangaDex)
 * - SubTabs row with persistent top pager + Check Updates button + scroll-to-bottom
 * - Six always-mounted tab panes (releases, added, downloaded, series-dir, tags-dir, search)
 * - Mobile pull-to-refresh
 */

const CHECK_UPDATES_POLL_DEADLINE_MS = 5_000;
const CHECK_UPDATES_POLL_INTERVAL_MS = 50;
const CHECK_BTN_AUTO_DISMISS_MS = 1500;

import { makeEventListener } from "@solid-primitives/event-listener";
import { createEffect, createSignal, onCleanup, onMount, Show, type JSX } from "solid-js";
import { persistedSignal } from "../../../lib/persisted-signal";
import { isMobile } from "../../../stores/platform";
import { navigate, route, setRoute } from "../../../stores/router";
import { showBanner } from "../../../stores/topbar";
import { t } from "../../../i18n";
import { triggerHaptic } from "../../../utils/haptics";
import { Pager } from "../../../components/Pager";
import { SubTabs } from "../../../components/SubTabs";
import { GroupBox } from "../../../components/GroupBox";
import { InputField } from "../../../components/InputField";
import { IconText, IconButton } from "../../../components/Button";
import {
  SearchIcon,
  RefreshIcon,
  CheckIcon,
  WarningIcon,
  ClipboardIcon,
  ArrowDownIcon,
  ExternalLinkIcon,
} from "../../../components/Icon";
import { log } from "../../../utils/log";
import {
  getPaneError,
  getPaneLoading,
  getTopPagerFor,
  scrollBrowseToBottom,
  scrollBrowseToTop,
  useBlacklistRevision,
} from "../../../browse/browse-state";
import { MangaDexBrowseFeed } from "./MangaDexBrowseFeed";
import { MangaDexBrowseDirectory } from "./MangaDexBrowseDirectory";
import { MangaDexBrowseDownloaded } from "./MangaDexBrowseDownloaded";
import { MangaDexBrowseSearch } from "./MangaDexBrowseSearch";
import { useWhitelistRevision } from "../db/whitelist.repo";

export type MangaDexBrowseTabId =
  | "releases"
  | "added"
  | "downloaded"
  | "series-dir"
  | "tags-dir"
  | "search";

export interface MangaDexBrowseTabDef {
  id: MangaDexBrowseTabId;
  label: string;
  shortLabel?: string;
}

export const getMangaDexBrowseTabs = (): readonly MangaDexBrowseTabDef[] => [
  { id: "releases", label: "Recent Releases", shortLabel: "Releases" },
  { id: "added", label: "Recently Added", shortLabel: "Added" },
  { id: "downloaded", label: "Downloaded", shortLabel: "Downloads" },
  { id: "series-dir", label: "Series Directory", shortLabel: "Series" },
  { id: "tags-dir", label: "Tags Directory", shortLabel: "Tags" },
  { id: "search", label: "Tag & Search", shortLabel: "Search" },
];

/**
 * Parses a MangaDex URL or UUID to extract entity kind and id.
 */
export function parseMangaDexUrl(input: string): { kind: "series" | "chapter"; id: string } | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Pattern 1: https://mangadex.org/title/{uuid} or /title/{uuid}/slug
  const titleMatch = trimmed.match(/(?:mangadex\.org\/title\/|title\/|^)([0-9a-fA-F-]{36})/);
  if (trimmed.includes("title/") && titleMatch) {
    return { kind: "series", id: titleMatch[1] };
  }

  // Pattern 2: https://mangadex.org/chapter/{uuid}
  const chapterMatch = trimmed.match(/(?:mangadex\.org\/chapter\/|chapter\/)([0-9a-fA-F-]{36})/);
  if (chapterMatch) {
    return { kind: "chapter", id: chapterMatch[1] };
  }

  // Pattern 3: Bare UUID (assume series)
  const bareUuidMatch = trimmed.match(/^([0-9a-fA-F-]{36})$/);
  if (bareUuidMatch) {
    return { kind: "series", id: bareUuidMatch[1] };
  }

  return null;
}

export function MangaDexBrowse() {
  const [searchGoCollapsed, setSearchGoCollapsed] = persistedSignal(isMobile(), {
    name: "ds-mdx-search-go-collapsed",
    serialize: String,
    deserialize: (v) => v === "true",
  });
  const [searchGoSearchTabOverride, setSearchGoSearchTabOverride] = createSignal<boolean | null>(null);

  createEffect(() => {
    if (activeTab() !== "search") {
      setSearchGoSearchTabOverride(null);
    }
  });

  const isSearchGoCollapsed = () => {
    if (activeTab() === "search") {
      return searchGoSearchTabOverride() ?? true;
    }
    return searchGoCollapsed();
  };

  const [searchBoxValue, setSearchBoxValue] = createSignal("");
  const [urlValue, setUrlValue] = createSignal("");
  const [checkBtn, setCheckBtn] = createSignal<"idle" | "checking" | "updated" | "error">("idle");
  const [forceTick, setForceTick] = createSignal(0);
  let checkTimer: number | null = null;

  onCleanup(() => {
    if (checkTimer !== null) window.clearTimeout(checkTimer);
  });

  const blacklistRev = useBlacklistRevision();
  const whitelistRev = useWhitelistRevision();
  const revision = () => blacklistRev() + whitelistRev();

  const [pendingSearch, setPendingSearch] = createSignal<{
    searchQuery?: string;
    withTag?: string;
  } | null>(null);

  const activeTab = (): MangaDexBrowseTabId => (route().browseTab ?? "releases") as MangaDexBrowseTabId;

  const activeFor = (tabId: MangaDexBrowseTabId): (() => boolean) => () =>
    route().view === "browse" && activeTab() === tabId;

  const switchTab = (tabId: MangaDexBrowseTabId): void => {
    setRoute((r) => ({ ...r, browseTab: tabId }));
    scrollBrowseToTop();
  };

  const runSearch = (query: string): void => {
    const q = query.trim();
    if (!q) return;
    setPendingSearch({ searchQuery: q });
    setRoute((r) => ({ ...r, browseTab: "search" }));
    scrollBrowseToTop();
  };

  const openByUrl = (): void => {
    const raw = urlValue().trim();
    if (!raw) {
      showBanner("Please enter a MangaDex URL or UUID.");
      return;
    }
    const parsed = parseMangaDexUrl(raw);
    if (!parsed) {
      showBanner("Unrecognized MangaDex URL. Expected mangadex.org/title/... or mangadex.org/chapter/...");
      return;
    }
    if (parsed.kind === "chapter") {
      navigate({
        view: "reader",
        chapterPermalink: `mdx:${parsed.id}`,
        chapterTitle: "MangaDex Chapter",
      });
    } else {
      navigate({
        view: "series",
        seriesPermalink: `mdx:${parsed.id}`,
        seriesName: "MangaDex Series",
      });
    }
  };

  const pasteUrl = async (): Promise<void> => {
    try {
      const text = (await navigator.clipboard.readText()) || "";
      if (text) setUrlValue(text.trim());
    } catch (err) {
      log.warn("mangadex-browse", "clipboard read failed:", err);
    }
  };

  const toggleSearchGo = (): void => {
    if (activeTab() === "search") {
      const next = !(searchGoSearchTabOverride() ?? true);
      setSearchGoSearchTabOverride(next);
      return;
    }
    const next = !searchGoCollapsed();
    setSearchGoCollapsed(next);
    localStorage.setItem("ds-mdx-search-go-collapsed", String(next));
  };

  const checkUpdates = async (): Promise<void> => {
    if (checkBtn() === "checking") return;
    setCheckBtn("checking");
    setForceTick((t) => t + 1);
    const tabId = activeTab();
    await new Promise<void>((resolve) => {
      const deadline = Date.now() + CHECK_UPDATES_POLL_DEADLINE_MS;
      let sawLoading = false;
      let timer: number | null = null;
      const cleanup = () => {
        if (timer !== null) {
          window.clearTimeout(timer);
          timer = null;
        }
      };
      const tick = (): void => {
        const loading = getPaneLoading(tabId);
        if (loading) sawLoading = true;
        if (sawLoading && !loading) {
          cleanup();
          resolve();
          return;
        }
        if (Date.now() > deadline) {
          cleanup();
          resolve();
          return;
        }
        // If we never see loading=true within three intervals, pane data was already fresh
        if (!sawLoading && Date.now() > deadline - CHECK_UPDATES_POLL_DEADLINE_MS + CHECK_UPDATES_POLL_INTERVAL_MS * 3) {
          cleanup();
          resolve();
          return;
        }
        timer = window.setTimeout(tick, CHECK_UPDATES_POLL_INTERVAL_MS);
      };
      tick();
    });
    const hasError = getPaneError(tabId);
    setCheckBtn(hasError ? "error" : "updated");
    if (checkTimer !== null) window.clearTimeout(checkTimer);
    checkTimer = window.setTimeout(() => {
      checkTimer = null;
      setCheckBtn("idle");
    }, CHECK_BTN_AUTO_DISMISS_MS);
  };

  const topCfg = () => getTopPagerFor(activeTab());

  // ── Pull-to-refresh (mobile swipe-down) ──
  const [pullOffset, setPullOffset] = createSignal(0);
  const [pullReady, setPullReady] = createSignal(false);
  const [isPulling, setIsPulling] = createSignal(false);
  let pullStartY = 0;
  let pulling = false;
  const PULL_THRESHOLD_PX = 48;
  const PULL_RELEASE_PX = 36;

  onMount(() => {
    const paneEl = document.getElementById("ds-pane-browse") as HTMLElement | null;
    if (!paneEl) return;
    const onTouchStart = (ev: TouchEvent): void => {
      if (!isMobile()) return;
      if (checkBtn() === "checking") return;
      if (paneEl.scrollTop > 2) return;
      if (ev.touches.length !== 1) return;
      pullStartY = ev.touches[0].clientY;
      pulling = false;
      setIsPulling(false);
      setPullReady(false);
    };
    const onTouchMove = (ev: TouchEvent): void => {
      if (!isMobile()) return;
      if (ev.touches.length !== 1) return;
      const dy = ev.touches[0].clientY - pullStartY;
      if (!pulling && dy > 10 && paneEl.scrollTop <= 2) {
        pulling = true;
        setIsPulling(true);
      }
      if (pulling) {
        if (dy > 0 && paneEl.scrollTop <= 2) {
          const damped = Math.min(56, Math.pow(dy, 0.82));
          setPullOffset(damped);
          const ready = damped >= PULL_THRESHOLD_PX;
          const stillReady = pullReady() && damped >= PULL_RELEASE_PX;
          const newReady = ready || stillReady;
          if (newReady && !pullReady()) {
            triggerHaptic("snap");
          }
          setPullReady(newReady);
          if (damped > 10) ev.preventDefault();
        } else {
          setPullOffset(0);
          setPullReady(false);
        }
      }
    };
    const onTouchEnd = (): void => {
      if (pulling && pullReady() && pullOffset() >= PULL_RELEASE_PX) {
        triggerHaptic("confirm");
        void checkUpdates();
      }
      pulling = false;
      setIsPulling(false);
      setPullOffset(0);
      setPullReady(false);
    };
    const onTouchCancel = (): void => {
      pulling = false;
      setIsPulling(false);
      setPullOffset(0);
      setPullReady(false);
    };
    makeEventListener(paneEl, "touchstart", onTouchStart, { passive: true });
    makeEventListener(paneEl, "touchmove", onTouchMove, { passive: false });
    makeEventListener(paneEl, "touchend", onTouchEnd, { passive: true });
    makeEventListener(paneEl, "touchcancel", onTouchCancel, { passive: true });
  });

  const checkBtnIcon = (): JSX.Element => {
    if (checkBtn() === "checking") return <RefreshIcon spin={true} />;
    if (checkBtn() === "updated") return <CheckIcon />;
    if (checkBtn() === "error") return <WarningIcon />;
    return <RefreshIcon />;
  };

  const checkBtnText = (): string => {
    if (checkBtn() === "checking") return t("browse.feed.checkBtnChecking");
    if (checkBtn() === "updated") return t("browse.feed.checkBtnUpdated");
    if (checkBtn() === "error") return t("browse.feed.checkBtnError");
    return t("browse.feed.checkBtnCheckUpdates");
  };

  return (
    <div
      class="ds-browse-pull-container"
      style={{
        transform: pullOffset() > 0 ? `translateY(${pullOffset()}px)` : undefined,
        transition: isPulling() ? "none" : "transform 0.25s cubic-bezier(0.1, 0.9, 0.2, 1)",
      }}
    >
      <Show when={isMobile() && pullOffset() > 0}>
        <div
          class="ds-pull-refresh-indicator"
          classList={{ ready: pullReady() }}
          style={{
            opacity: String(Math.min(1, pullOffset() / 24)),
          }}
        >
          <RefreshIcon spin={checkBtn() === "checking"} />
          <span>{pullReady() ? t("browse.feed.pullReady") : t("browse.feed.pullHint")}</span>
        </div>
      </Show>

      {/* ── Collapsible Search & Go Panel ─────────────────────────────────── */}
      <GroupBox
        class="ds-mb-8"
        collapsible
        collapsed={isSearchGoCollapsed()}
        onToggle={toggleSearchGo}
        title={<IconText icon={<SearchIcon />}>Search & Go</IconText>}
      >
        <div class="ds-row">
          <div class="ds-search-wrap ds-flex-1" style="position: relative;">
            <input
              type="text"
              class="win-input"
              placeholder="Search MangaDex titles, authors, genres..."
              value={searchBoxValue()}
              onInput={(e) => setSearchBoxValue(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") runSearch(searchBoxValue());
              }}
              style="width: 100%; height: 26px; padding-left: 26px;"
            />
            <div style="position: absolute; left: 7px; top: 50%; transform: translateY(-50%); opacity: 0.5;">
              <SearchIcon size={13} />
            </div>
          </div>
          <IconButton
            id="ds-search-btn"
            icon={<SearchIcon />}
            text="Search"
            onClick={() => runSearch(searchBoxValue())}
          />
        </div>
        <div class="ds-row">
          <InputField
            id="ds-url-input"
            placeholder="MangaDex URL (https://mangadex.org/title/...) or UUID"
            wrapperClass="ds-flex-1"
            value={urlValue()}
            onInput={(val) => setUrlValue(val)}
            onEnter={() => openByUrl()}
          />
          <IconButton
            id="ds-url-paste-btn"
            icon={<ClipboardIcon />}
            text="Paste"
            title="Paste MangaDex URL from clipboard"
            onClick={() => void pasteUrl()}
          />
          <IconButton
            id="ds-url-btn"
            icon={<ExternalLinkIcon />}
            text="Open"
            onClick={openByUrl}
          />
        </div>
        <div class="ds-muted ds-mt-2" style="font-size: 11px;">
          Accepted: MangaDex title (mangadex.org/title/...), chapter (mangadex.org/chapter/...), or UUID
        </div>
      </GroupBox>

      {/* ── Sub-tabs ────────────────────────────────────────────────────── */}
      <SubTabs
        tabs={getMangaDexBrowseTabs()}
        activeTab={activeTab()}
        onSwitch={(id) => switchTab(id as MangaDexBrowseTabId)}
        compact={isMobile()}
        right={
          <>
            <IconButton
              id="ds-browse-check-updates-btn"
              className="ds-btn-sm"
              title="Check for updates"
              disabled={checkBtn() === "checking"}
              onClick={() => void checkUpdates()}
              icon={checkBtnIcon()}
              text={checkBtnText()}
            />
            <div id="ds-browse-top-pager" class="ds-ml-auto">
              <Show when={topCfg() && topCfg()!.totalPages > 1}>
                <Pager
                  totalPages={topCfg()!.totalPages}
                  currentPage={topCfg()!.currentPage}
                  onPage={topCfg()!.onPage}
                  cssText="align-items:center;justify-content:flex-end;margin:0;"
                />
                <IconButton
                  icon={<ArrowDownIcon />}
                  text={t("common.bottom")}
                  className="ds-scroll-top-btn"
                  title="Scroll to bottom"
                  onClick={scrollBrowseToBottom}
                />
              </Show>
            </div>
          </>
        }
      />

      {/* ── Persistent tab panes ────────────────────────────────────────── */}
      <div id="ds-browse-content" class="ds-browse-content">
        <div
          id="ds-browse-tab-releases"
          class="ds-browse-tab-pane"
          classList={{ "ds-hidden": !activeFor("releases")() }}
        >
          <MangaDexBrowseFeed
            tabId="releases"
            active={activeFor("releases")}
            revision={revision}
            forceTick={forceTick}
          />
        </div>
        <div
          id="ds-browse-tab-added"
          class="ds-browse-tab-pane"
          classList={{ "ds-hidden": !activeFor("added")() }}
        >
          <MangaDexBrowseFeed
            tabId="added"
            active={activeFor("added")}
            revision={revision}
            forceTick={forceTick}
          />
        </div>
        <div
          id="ds-browse-tab-downloaded"
          class="ds-browse-tab-pane"
          classList={{ "ds-hidden": !activeFor("downloaded")() }}
        >
          <MangaDexBrowseDownloaded
            tabId="downloaded"
            active={activeFor("downloaded")}
            revision={revision}
            forceTick={forceTick}
          />
        </div>
        <div
          id="ds-browse-tab-series-dir"
          class="ds-browse-tab-pane"
          classList={{ "ds-hidden": !activeFor("series-dir")() }}
        >
          <MangaDexBrowseDirectory
            kind="series"
            tabId="series-dir"
            active={activeFor("series-dir")}
            revision={revision}
            forceTick={forceTick}
          />
        </div>
        <div
          id="ds-browse-tab-tags-dir"
          class="ds-browse-tab-pane"
          classList={{ "ds-hidden": !activeFor("tags-dir")() }}
        >
          <MangaDexBrowseDirectory
            kind="tags"
            tabId="tags-dir"
            active={activeFor("tags-dir")}
            revision={revision}
            forceTick={forceTick}
          />
        </div>
        <div
          id="ds-browse-tab-search"
          class="ds-browse-tab-pane"
          classList={{ "ds-hidden": !activeFor("search")() }}
        >
          <MangaDexBrowseSearch
            active={activeFor("search")}
            revision={revision}
            forceTick={forceTick}
            transient={pendingSearch()}
            onTransientConsumed={() => setPendingSearch(null)}
          />
        </div>
      </div>
    </div>
  );
}
