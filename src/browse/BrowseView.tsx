/**
 * Solid Browse view container. Port of `browse-controller.ts`'s `renderBrowse`:
 *
 *  - Search & Go panel (search typeahead + open-by-URL), collapsible
 *  - sub-tabs row with the persistent top pager + Check Updates button
 *  - six always-mounted tab panes (lazy-load on first activation, instant on
 *    return; data kept alive via `useTabPane`)
 *  - transient search directives consumed at this dispatch boundary
 */

const CHECK_BTN_AUTO_DISMISS_MS = 1500;

import { makeEventListener } from "@solid-primitives/event-listener";
import type { SearchClass } from "../types/api";
import { createEffect, createSignal, onCleanup, onMount, Show, untrack, type JSX } from "solid-js";
import { persistedSignal } from "../lib/persisted-signal";
import { isMobile } from "../stores/platform";
import { navigate, route, setRoute, type BrowseTabId } from "../stores/router";
import { showBanner } from "../stores/topbar";
import { t } from "../i18n";
import { triggerHaptic } from "../utils/haptics";
import { parseDynastyUrl } from "../api/navigation";
import { suggest } from "../api/directory";
import { activeProvider } from "../stores/provider";
import { parseMangaDexUrl } from "../api/navigation";
import { getWhitelistRevision } from "../providers/mangadex/db/whitelist.repo";
import { getBlacklistRevision } from "../db/blacklist.repo";
import { searchManga } from "../providers/mangadex/api/manga";
import { formatMangaTitle } from "../providers/mangadex/mapping";
import { Pager } from "../components/Pager";
import { SubTabs } from "../components/SubTabs";
import { GroupBox } from "../components/GroupBox";
import { Typeahead } from "../components/Typeahead";
import { InputField } from "../components/InputField";
import { IconText, Button } from "../components/Button";
import {
  SearchIcon,
  RefreshIcon,
  CheckIcon,
  WarningIcon,
  ClipboardIcon,
  ArrowDownIcon,
  ExternalLinkIcon,
} from "../components/Icon";
import { log } from "../utils/log";
import {
  getTopPagerFor,
  scrollBrowseToBottom,
  scrollBrowseToTop,

  type BrowsePaneApi,
} from "./browse-state";
import { BrowseFeed } from "./BrowseFeed";
import { BrowseDirectory } from "./BrowseDirectory";
import { BrowseDownloaded } from "./BrowseDownloaded";
import { BrowseSearch } from "./BrowseSearch";
import { getCacheRevision } from "../db/cache.repo";
async function suggestMangaDex(query: string): Promise<Array<{ name: string; type: string }>> {
  if (!query.trim()) return [];
  try {
    const res = await searchManga({ title: query.trim(), limit: 8 });
    return (res.data || []).map((m) => ({
      name: formatMangaTitle(m),
      type: "Series",
    }));
  } catch {
    return [];
  }
}



interface BrowseTabDef {
  id: BrowseTabId;
  label: string;
  shortLabel?: string;
}

const getBrowseTabs = (): readonly BrowseTabDef[] => [
  { id: "releases", label: t("browse.tabs.releases"), shortLabel: t("browse.tabsShort.releases") },
  { id: "added", label: t("browse.tabs.added"), shortLabel: t("browse.tabsShort.added") },
  { id: "downloaded", label: t("browse.tabs.downloaded"), shortLabel: t("browse.tabsShort.downloaded") },
  { id: "series-dir", label: t("browse.tabs.seriesDir"), shortLabel: t("browse.tabsShort.seriesDir") },
  { id: "tags-dir", label: t("browse.tabs.tagsDir"), shortLabel: t("browse.tabsShort.tagsDir") },
  { id: "search", label: t("browse.tabs.search"), shortLabel: t("browse.tabsShort.search") },
];

export function BrowseView() {
  const [searchGoCollapsed, setSearchGoCollapsed] = persistedSignal(isMobile(), {
    name: "ds-search-go-collapsed",
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
  const paneApis: Record<string, BrowsePaneApi> = {};
  const register = (key: string) => (api: BrowsePaneApi) => {
    paneApis[key] = api;
  };
  let checkTimer: number | null = null;

  onCleanup(() => {
    if (checkTimer !== null) window.clearTimeout(checkTimer);
  });
  const revision = () =>
    getBlacklistRevision() +
    getCacheRevision() +
    (activeProvider() === "mangadex" ? getWhitelistRevision() : 0);

  const tabScrollPositions = new Map<string, number>();

  createEffect(() => {
    if (route().view === "browse") {
      const tab = activeTab();
      const saved = tabScrollPositions.get(`${activeProvider()}:${tab}`);
      if (saved !== undefined && saved > 0) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const paneEl = document.getElementById("ds-pane-browse");
            if (paneEl && route().view === "browse") {
              paneEl.scrollTop = saved;
            }
          });
        });
      }
    }
  });
  const [pendingSearch, setPendingSearch] = createSignal<{
    searchQuery?: string;
    withTag?: string;
    searchClass?: SearchClass;
  } | null>(null);

  const activeTab = (): BrowseTabId => route().browseTab ?? "releases";

  const activeFor = (tabId: BrowseTabId): (() => boolean) => () =>
    route().view === "browse" && activeTab() === tabId;

  const switchTab = (tabId: BrowseTabId): void => {
    setRoute((r) => ({ ...r, browseTab: tabId }));
    scrollBrowseToTop();
  };

  // Consume transient search directives (search-box submit, tag pill click,
  // in-app search link) at the dispatch boundary, then clear them from the
  // route so re-activating the tab shows the persisted live-search state.
  createEffect(() => {
    const r = route();
    if (r.view !== "browse") return;
    if ((r.browseTab ?? "releases") !== "search") return;
    if (r.searchQuery === undefined && r.withTag === undefined && r.searchClass === undefined) return;
    setPendingSearch({ searchQuery: r.searchQuery, withTag: r.withTag, searchClass: r.searchClass });
    untrack(() => {
      setRoute({ ...r, searchQuery: undefined, withTag: undefined, searchClass: undefined });
    });
  });

  const runSearch = (query: string): void => {
    const q = query.trim();
    if (!q) return;
    setRoute((r) => ({ ...r, browseTab: "search", searchQuery: q }));
    scrollBrowseToTop();
  };

  const openByUrl = (): void => {
    const raw = urlValue().trim();
    if (!raw) {
      showBanner(t("browse.searchAndGo.emptyUrlWarning"));
      return;
    }
    if (activeProvider() === "mangadex") {
      const parsed = parseMangaDexUrl(raw);
      if (!parsed) {
        showBanner("Unrecognized MangaDex URL. Expected mangadex.org/title/... or mangadex.org/chapter/...");
        return;
      }
      if (parsed.kind === "chapter") {
        navigate({
          view: "reader",
          chapterPermalink: `mdx:${parsed.id}`,
          chapterTitle: `Chapter ${parsed.id}`,
        });
      } else {
        navigate({
          view: "series",
          seriesPermalink: `mdx:${parsed.id}`,
          seriesName: "MangaDex Series",
        });
      }
      return;
    }
    const parsed = parseDynastyUrl(raw);
    if (!parsed) {
      showBanner(t("browse.searchAndGo.unrecognizedUrlWarning"));
      return;
    }
    if (parsed.kind === "chapter") {
      navigate({
        view: "reader",
        chapterPermalink: parsed.permalink,
        chapterTitle: parsed.permalink,
      });
    } else if (parsed.kind === "tag") {
      navigate({
        view: "browse",
        browseTab: "search",
        withTag: parsed.permalink,
      });
    } else {
      navigate({ view: "series", seriesPermalink: parsed.permalink, seriesName: parsed.permalink });
    }
  };

  const pasteUrl = async (): Promise<void> => {
    try {
      const text = (await navigator.clipboard.readText()) || "";
      if (text) setUrlValue(text.trim());
    } catch (err) {
      log.warn("browse-view", "clipboard read failed:", err);
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
    localStorage.setItem("ds-search-go-collapsed", String(next));
  };

  const checkUpdates = async (): Promise<void> => {
    if (checkBtn() === "checking") return;
    setCheckBtn("checking");
    const tabId = activeTab();
    const api = paneApis[tabId];
    let hasError = false;
    if (api) {
      try {
        api.reset();
        await api.reload();
      } catch (err) {
        hasError = true;
        log.warn("browse-view", `Failed checking updates for tab ${tabId}:`, err);
      }
    }
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
    const onScroll = (): void => {
      if (route().view === "browse") {
        tabScrollPositions.set(`${activeProvider()}:${activeTab()}`, paneEl.scrollTop);
      }
    };
    makeEventListener(paneEl, "scroll", onScroll, { passive: true });
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
      <GroupBox
        class="ds-mb-8"
        collapsible
        collapsed={isSearchGoCollapsed()}
        onToggle={toggleSearchGo}
        title={<IconText icon={<SearchIcon />}>{t("browse.searchAndGo.title")}</IconText>}
      >
          <form
            role="search"
            action="javascript:void(0)"
            class="ds-row"
            onSubmit={(ev) => {
              ev.preventDefault();
              (document.activeElement as HTMLElement)?.blur();
              runSearch(searchBoxValue());
            }}
          >
            <div class="ds-search-wrap ds-flex-1">
              <Typeahead
                fetcher={activeProvider() === "mangadex" ? suggestMangaDex : suggest}
                onSelect={(item) => runSearch(item.name)}
                onEnter={(value) => {
                  (document.activeElement as HTMLElement)?.blur();
                  runSearch(value);
                }}
                onInputValue={(value) => setSearchBoxValue(value)}
                placeholder={activeProvider() === "mangadex" ? "Search MangaDex titles, authors, genres..." : t("browse.searchAndGo.inputPlaceholder")}
                maxItems={8}
                debounceMs={250}
              />
            </div>
            <Button
              id="ds-search-btn"
              type="submit"
              icon={<SearchIcon />}
              text={t("browse.searchAndGo.searchButton")}
            />
          </form>
          <form
            action="javascript:void(0)"
            class="ds-row"
            onSubmit={(ev) => {
              ev.preventDefault();
              (document.activeElement as HTMLElement)?.blur();
              openByUrl();
            }}
          >
            <InputField
              id="ds-url-input"
              placeholder={activeProvider() === "mangadex" ? "MangaDex URL (https://mangadex.org/title/...) or UUID" : t("browse.searchAndGo.urlPlaceholder")}
              wrapperClass="ds-flex-1"
              value={urlValue()}
              onInput={(val) => setUrlValue(val)}
              onEnter={() => {
                (document.activeElement as HTMLElement)?.blur();
                openByUrl();
              }}
            />
            <Button
              id="ds-url-paste-btn"
              type="button"
              icon={<ClipboardIcon />}
              text={t("browse.searchAndGo.pasteButton")}
              title={t("browse.searchAndGo.pasteTooltip")}
              onClick={() => void pasteUrl()}
            />
            <Button
              id="ds-url-btn"
              type="submit"
              icon={<ExternalLinkIcon />}
              text={t("browse.searchAndGo.openButton")}
            />
          </form>
          <div class="ds-muted ds-mt-2">
            {activeProvider() === "mangadex" ? "Accepted: MangaDex title (mangadex.org/title/...), chapter (mangadex.org/chapter/...), or UUID" : t("browse.searchAndGo.acceptedNotice")}
          </div>
      </GroupBox>

      {/* ── Sub-tabs ────────────────────────────────────────────────────── */}
      <SubTabs
        tabs={getBrowseTabs()}
        activeTab={activeTab()}
        onSwitch={(id) => switchTab(id)}
        compact={isMobile()}
        right={
          <>
            <Button
              id="ds-browse-check-updates-btn"
              className="ds-btn-sm"
              title={t("browse.feed.checkBtnTooltip")}
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
                <Button
                  icon={<ArrowDownIcon />}
                  text={t("common.bottom")}
                  className="ds-scroll-top-btn"
                  title={t("browse.searchAndGo.scrollToBottomTooltip")}
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
          <BrowseFeed
            tabId="releases"
            active={activeFor("releases")}
            revision={revision}
            register={register("releases")}
          />
        </div>
        <div
          id="ds-browse-tab-added"
          class="ds-browse-tab-pane"
          classList={{ "ds-hidden": !activeFor("added")() }}
        >
          <BrowseFeed
            tabId="added"
            active={activeFor("added")}
            revision={revision}
            register={register("added")}
          />
        </div>
        <div
          id="ds-browse-tab-downloaded"
          class="ds-browse-tab-pane"
          classList={{ "ds-hidden": !activeFor("downloaded")() }}
        >
          <BrowseDownloaded
            tabId="downloaded"
            active={activeFor("downloaded")}
            revision={revision}
            register={register("downloaded")}
          />
        </div>
        <div
          id="ds-browse-tab-series-dir"
          class="ds-browse-tab-pane"
          classList={{ "ds-hidden": !activeFor("series-dir")() }}
        >
          <BrowseDirectory
            kind="series"
            tabId="series-dir"
            active={activeFor("series-dir")}
            revision={revision}
            register={register("series-dir")}
          />
        </div>
        <div
          id="ds-browse-tab-tags-dir"
          class="ds-browse-tab-pane"
          classList={{ "ds-hidden": !activeFor("tags-dir")() }}
        >
          <BrowseDirectory
            kind="tags"
            tabId="tags-dir"
            active={activeFor("tags-dir")}
            revision={revision}
            register={register("tags-dir")}
          />
        </div>
        <div
          id="ds-browse-tab-search"
          class="ds-browse-tab-pane"
          classList={{ "ds-hidden": !activeFor("search")() }}
        >
          <BrowseSearch
            active={activeFor("search")}
            revision={revision}
            transient={pendingSearch()}
            onTransientConsumed={() => setPendingSearch(null)}
            register={register("search")}
          />
        </div>
      </div>
    </div>
  );
}
