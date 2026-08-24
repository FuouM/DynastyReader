/**
 * Solid Browse view container. Port of `browse-controller.ts`'s `renderBrowse`:
 *
 *  - Search & Go panel (search typeahead + open-by-URL), collapsible
 *  - sub-tabs row with the persistent top pager + Check Updates button
 *  - six always-mounted tab panes (lazy-load on first activation, instant on
 *    return; data kept alive via `useTabPane`)
 *  - transient search directives consumed at this dispatch boundary
 */

const CHECK_UPDATES_POLL_DEADLINE_MS = 15_000;
const CHECK_UPDATES_POLL_INTERVAL_MS = 50;
const CHECK_BTN_AUTO_DISMISS_MS = 1500;

import { createEffect, createSignal, onCleanup, Show, untrack, type JSX } from "solid-js";
import { navigate, route, setRoute, showBanner } from "../stores";
import { t } from "../i18n";
import { parseDynastyUrl, suggest } from "../api";
import { useMediaQuery } from "../hooks/useImageRetry";
import { Pager } from "../components/Pager";
import { SubTabs } from "../components/SubTabs";
import { Typeahead } from "../components/Typeahead";
import { IconText, IconButton } from "../components/Button";
import {
  SearchIcon,
  RefreshIcon,
  CheckIcon,
  WarningIcon,
  ChevronDownIcon,
  CloseIcon,
  ClipboardIcon,
  ArrowDownIcon,
  ExternalLinkIcon,
} from "../components/Icon";
import {
  getPaneError,
  getPaneLoading,
  getTopPagerFor,
  scrollBrowseToBottom,
  scrollBrowseToTop,
  useBlacklistRevision,
} from "./browse-state";
import { BrowseFeed } from "./BrowseFeed";
import { BrowseDirectory } from "./BrowseDirectory";
import { BrowseDownloaded } from "./BrowseDownloaded";
import { BrowseSearch } from "./BrowseSearch";

export type BrowseTabId =
  | "releases"
  | "added"
  | "downloaded"
  | "series-dir"
  | "tags-dir"
  | "search";

export interface BrowseTabDef {
  id: BrowseTabId;
  label: string;
  shortLabel?: string;
}

export const getBrowseTabs = (): readonly BrowseTabDef[] => [
  { id: "releases", label: t("browse.tabs.releases"), shortLabel: t("browse.tabsShort.releases") },
  { id: "added", label: t("browse.tabs.added"), shortLabel: t("browse.tabsShort.added") },
  { id: "downloaded", label: t("browse.tabs.downloaded"), shortLabel: t("browse.tabsShort.downloaded") },
  { id: "series-dir", label: t("browse.tabs.seriesDir"), shortLabel: t("browse.tabsShort.seriesDir") },
  { id: "tags-dir", label: t("browse.tabs.tagsDir"), shortLabel: t("browse.tabsShort.tagsDir") },
  { id: "search", label: t("browse.tabs.search"), shortLabel: t("browse.tabsShort.search") },
];

export function BrowseView() {
  const [searchGoCollapsed, setSearchGoCollapsed] = createSignal(
    localStorage.getItem("ds-search-go-collapsed") === "true",
  );
  const [searchBoxValue, setSearchBoxValue] = createSignal("");
  const [urlValue, setUrlValue] = createSignal("");
  const [checkBtn, setCheckBtn] = createSignal<"idle" | "checking" | "updated" | "error">("idle");
  const [forceTick, setForceTick] = createSignal(0);
  let checkTimer: number | null = null;
  let pollTimer: number | null = null;

  onCleanup(() => {
    if (checkTimer !== null) window.clearTimeout(checkTimer);
    if (pollTimer !== null) window.clearTimeout(pollTimer);
  });
  const revision = useBlacklistRevision();
  const isCompact = useMediaQuery("(max-width: 680px)");

  const [pendingSearch, setPendingSearch] = createSignal<{
    searchQuery?: string;
    withTag?: string;
    searchClass?: string;
  } | null>(null);

  const activeTab = (): BrowseTabId => (route().browseTab ?? "releases") as BrowseTabId;

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
    } else {
      navigate({ view: "series", seriesPermalink: parsed.permalink, seriesName: parsed.permalink });
    }
  };

  const pasteUrl = async (): Promise<void> => {
    try {
      const text = (await navigator.clipboard.readText()) || "";
      if (text) setUrlValue(text.trim());
    } catch (err) {
      console.warn("[ds-browse] clipboard read failed:", err);
    }
  };

  const toggleSearchGo = (): void => {
    const next = !searchGoCollapsed();
    setSearchGoCollapsed(next);
    localStorage.setItem("ds-search-go-collapsed", String(next));
  };

  const checkUpdates = async (): Promise<void> => {
    setCheckBtn("checking");
    setForceTick((t) => t + 1);
    const tabId = activeTab();
    await new Promise<void>((resolve) => {
      const deadline = Date.now() + CHECK_UPDATES_POLL_DEADLINE_MS;
      let sawLoading = false;
      const tick = (): void => {
        const loading = getPaneLoading(tabId);
        if (loading) sawLoading = true;
        if (sawLoading && !loading) {
          resolve();
          return;
        }
        if (Date.now() > deadline) {
          resolve();
          return;
        }
        pollTimer = window.setTimeout(tick, CHECK_UPDATES_POLL_INTERVAL_MS);
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
    <>
      {/* ── Search + Open-by-URL ─────────────────────────────────────────── */}
      <div
        class="group-box"
        style="margin-bottom:8px;"
        classList={{ collapsed: searchGoCollapsed() }}
      >
        <div class="group-box-title" onClick={toggleSearchGo}>
          <IconText icon={<SearchIcon />}>{t("browse.searchAndGo.title")}</IconText>
          <button
            type="button"
            class="group-box-collapse-btn"
            title={t("browse.searchAndGo.toggleCollapse")}
            onClick={(ev) => {
              ev.stopPropagation();
              toggleSearchGo();
            }}
          >
            <ChevronDownIcon />
          </button>
        </div>
        <div class="group-box-body">
          <div class="ds-row">
            <div class="ds-search-wrap" style="flex:1;">
              <Typeahead
                fetcher={suggest}
                onSelect={(item) => runSearch(item.name)}
                onEnter={(value) => runSearch(value)}
                onInputValue={(value) => setSearchBoxValue(value)}
                placeholder={t("browse.searchAndGo.inputPlaceholder")}
                maxItems={8}
                debounceMs={250}
              />
            </div>
            <IconButton
              id="ds-search-btn"
              icon={<SearchIcon />}
              text={t("browse.searchAndGo.searchButton")}
              cssText="width:86px;justify-content:center;flex-shrink:0;"
              onClick={() => runSearch(searchBoxValue())}
            />
          </div>
          <div class="ds-row">
            <div class="input-wrapper" style="flex:1;">
              <input
                type="text"
                id="ds-url-input"
                class="input-field has-clear"
                placeholder={t("browse.searchAndGo.urlPlaceholder")}
                style="width:100%;"
                value={urlValue()}
                onInput={(ev) => setUrlValue((ev.target as HTMLInputElement).value)}
                onKeyDown={(ev) => {
                  if (ev.key === "Enter") openByUrl();
                }}
              />
              <button
                type="button"
                class="input-clear-btn"
                tabIndex={-1}
                title={t("common.clear")}
                onClick={() => setUrlValue("")}
              >
                <CloseIcon />
              </button>
            </div>
            <IconButton
              id="ds-url-paste-btn"
              icon={<ClipboardIcon />}
              text={t("browse.searchAndGo.pasteButton")}
              title={t("browse.searchAndGo.pasteTooltip")}
              onClick={() => void pasteUrl()}
            />
            <IconButton
              id="ds-url-btn"
              icon={<ExternalLinkIcon />}
              text={t("browse.searchAndGo.openButton")}
              cssText="width:86px;justify-content:center;flex-shrink:0;"
              onClick={openByUrl}
            />
          </div>
          <div class="ds-muted" style="margin-top:2px;">
            {t("browse.searchAndGo.acceptedNotice")}
          </div>
        </div>
      </div>

      {/* ── Sub-tabs ────────────────────────────────────────────────────── */}
      <SubTabs
        tabs={getBrowseTabs()}
        activeTab={activeTab()}
        onSwitch={(id) => switchTab(id as BrowseTabId)}
        compact={isCompact()}
        right={
          <>
            <IconButton
              id="ds-browse-check-updates-btn"
              className="ds-btn-sm"
              title={t("browse.feed.checkBtnTooltip")}
              disabled={checkBtn() === "checking"}
              onClick={() => void checkUpdates()}
              icon={checkBtnIcon()}
              text={checkBtnText()}
            />
            <div id="ds-browse-top-pager" style="display:flex;align-items:center;gap:8px;margin-left:auto;">
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
                  title={t("browse.searchAndGo.scrollToBottomTooltip")}
                  onClick={scrollBrowseToBottom}
                />
              </Show>
            </div>
          </>
        }
      />

      {/* ── Persistent tab panes ────────────────────────────────────────── */}
      <div id="ds-browse-content" style="margin-top:8px;">
        <div
          id="ds-browse-tab-releases"
          class="ds-browse-tab-pane"
          classList={{ "ds-hidden": !activeFor("releases")() }}
        >
          <BrowseFeed
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
          <BrowseFeed
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
          <BrowseDownloaded
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
          <BrowseDirectory
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
          <BrowseDirectory
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
          <BrowseSearch
            active={activeFor("search")}
            revision={revision}
            forceTick={forceTick}
            transient={pendingSearch()}
            onTransientConsumed={() => setPendingSearch(null)}
          />
        </div>
      </div>
    </>
  );
}
