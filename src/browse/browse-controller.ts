import { esc, state, type Route } from "../state";
import {
  renderFeed,
  revalidateFeedHead,
  showFeedUpdateBanner,
  FEED_TAB_TO_URL,
  FEED_TAB_TO_KEY,
} from "./browse-feed";
import { renderDirectory } from "./browse-directory";
import { renderSearchTab, wireSearchPanel } from "./browse-search";
import { renderDownloadedChapters } from "./browse-downloaded";
import { renderPager } from "../components/pager";
import { attachDelayedLoading } from "../components/loading";
import { getBlacklistRevision, onBlacklistChanged } from "../db";

let currentBrowseSeq = 0;

interface BrowseTab {
  id: string;
  label: string;
  shortLabel?: string;
}

const TABS: BrowseTab[] = [
  { id: "releases", label: "Recent Releases", shortLabel: "Releases" },
  { id: "added", label: "Recently Added", shortLabel: "Added" },
  { id: "downloaded", label: "Downloaded", shortLabel: "Downloaded" },
  { id: "series-dir", label: "Series Directory", shortLabel: "Series" },
  { id: "tags-dir", label: "Tags", shortLabel: "Tags" },
  { id: "search", label: "Search", shortLabel: "Search" },
];

/** Tracks top pager configurations per tab pane so switching tabs updates the bar instantly. */
const topPagerMap = new Map<
  string,
  { totalPages: number; currentPage: number; onPage: (p: number) => void }
>();

/** Updates the top pagination controls in the subtabs bar. */
export function updateBrowseTopPager(
  totalPages: number,
  currentPage: number,
  onPage: (p: number) => void,
  tabId?: string,
): void {
  if (tabId) {
    topPagerMap.set(tabId, { totalPages, currentPage, onPage });
  }
  const topPager = document.getElementById("ds-browse-top-pager");
  if (!topPager) return;
  topPager.innerHTML = "";
  if (totalPages <= 1) return;
  const pager = renderPager(totalPages, currentPage, onPage, {
    cssText: "align-items:center;margin:0;",
  });
  topPager.appendChild(pager);

  const bottomBtn = document.createElement("button");
  bottomBtn.type = "button";
  bottomBtn.className = "win-button ds-scroll-top-btn";
  bottomBtn.title = "Scroll to bottom of list";
  bottomBtn.innerHTML = '<i class="bi bi-arrow-down"></i> Bottom';
  bottomBtn.addEventListener("click", () => {
    const view = document.getElementById("ds-pane-browse") || document.getElementById("ds-view");
    if (view) {
      view.scrollTo({ top: view.scrollHeight, behavior: "smooth" });
    }
  });
  topPager.appendChild(bottomBtn);
}

export function scrollBrowseToTop(): void {
  const dsBrowse = document.getElementById("ds-pane-browse") || document.getElementById("ds-view");
  if (dsBrowse) {
    dsBrowse.scrollTop = 0;
  }
}

export async function renderTabContent(
  host: HTMLElement,
  tabId: string,
  page: number,
): Promise<void> {
  scrollBrowseToTop();
  const seq = ++currentBrowseSeq;

  // Display loading spinner only if the operation takes longer than 140ms
  const cancelLoading = attachDelayedLoading(host, 140);

  try {
    if (tabId === "releases" || tabId === "added") {
      await renderFeed(host, tabId, page, renderTabContent);
    } else if (tabId === "downloaded") {
      await renderDownloadedChapters(host, page, renderTabContent);
    } else if (tabId === "series" || tabId === "series-dir") {
      await renderDirectory(host, "series", page, (h, _k, p) => renderTabContent(h, "series-dir", p));
    } else if (tabId === "tags" || tabId === "tags-dir") {
      await renderDirectory(host, "tags", page, (h, _k, p) => renderTabContent(h, "tags-dir", p));
    } else if (tabId === "search") {
      // Consume the transient search directives at the dispatch boundary and
      // pass them by argument; renderSearchTab does not touch state.route.
      const routeSearch = {
        searchQuery: state.route.searchQuery,
        withTag: state.route.withTag,
        searchClass: state.route.searchClass,
      };
      delete state.route.searchQuery;
      delete state.route.withTag;
      delete state.route.searchClass;
      await renderSearchTab(host, page, renderTabContent, routeSearch);
    }
    cancelLoading();
    if (seq !== currentBrowseSeq) return; // Superseded by a newer tab click
    scrollBrowseToTop();
  } catch (err) {
    cancelLoading();
    if (seq !== currentBrowseSeq) return;
    console.error("[ds-browse] renderTabContent failed:", err);
    host.innerHTML = "";
    const errorBox = document.createElement("div");
    errorBox.style.cssText = "display:flex;flex-direction:column;gap:6px;padding:8px;";
    errorBox.innerHTML = `<span class="ds-muted">Failed to load content: ${esc(err instanceof Error ? err.message : String(err))}</span>`;
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "win-button";
    retry.style.cssText = "width:86px;justify-content:center;";
    retry.innerHTML = '<i class="bi bi-arrow-clockwise"></i> Retry';
    retry.addEventListener("click", () => void renderTabContent(host, tabId, page));
    errorBox.appendChild(retry);
    host.appendChild(errorBox);
  }
}

export function renderBrowse(container: HTMLElement, route: Route): void {
  container.innerHTML = "";

  // ── Search + Open-by-URL ────────────────────────────────────────────────
  const searchBox = document.createElement("div");
  searchBox.className = "group-box";
  searchBox.style.cssText = "margin-bottom:8px;";

  const isSearchGoCollapsed = localStorage.getItem("ds-search-go-collapsed") === "true";
  if (isSearchGoCollapsed) {
    searchBox.classList.add("collapsed");
  }

  searchBox.innerHTML =
    '<div class="group-box-title">' +
    '  <i class="bi bi-search"></i> Search &amp; Go' +
    '  <button type="button" class="group-box-collapse-btn" title="Toggle collapse">' +
    '    <i class="bi bi-chevron-down"></i>' +
    "  </button>" +
    "</div>" +
    '<div class="group-box-body">' +
    '  <div class="ds-row">' +
    '    <div class="ds-search-wrap" style="flex:1;">' +
    '      <div class="input-wrapper">' +
    '        <input type="text" class="input-field has-clear" id="ds-search-input"' +
    '          placeholder="Search dynasty-scans in-app (series, chapters, authors, tags)..." style="width:100%;" />' +
    '        <button type="button" class="input-clear-btn" tabindex="-1" title="Clear">' +
    '          <i class="bi bi-x-lg"></i>' +
    '        </button>' +
    '      </div>' +
    '      <div class="ds-typeahead ds-hidden" id="ds-search-suggest"></div>' +
    "    </div>" +
    '    <button type="button" class="win-button" id="ds-search-btn" style="width:86px;justify-content:center;flex-shrink:0;"><i class="bi bi-search"></i><span>Search</span></button>' +
    "  </div>" +
    '  <div class="ds-row">' +
    '    <div class="input-wrapper" style="flex:1;">' +
    '      <input type="text" class="input-field has-clear" id="ds-url-input"' +
    '        placeholder="Paste a dynasty-scans.com series or chapter URL..." style="width:100%;" />' +
    '      <button type="button" class="input-clear-btn" tabindex="-1" title="Clear">' +
    '        <i class="bi bi-x-lg"></i>' +
    '      </button>' +
    '    </div>' +
    '    <button type="button" class="win-button" id="ds-url-paste-btn" title="Paste URL from clipboard"><i class="bi bi-clipboard"></i><span>Paste</span></button>' +
    '    <button type="button" class="win-button" id="ds-url-btn" style="width:86px;justify-content:center;flex-shrink:0;"><i class="bi bi-box-arrow-in-right"></i><span>Open</span></button>' +
    "  </div>" +
    '  <div class="ds-muted" style="margin-top:2px;">' +
    "    Accepted: https://dynasty-scans.com/series/&lt;permalink&gt; or /chapters/&lt;permalink&gt; (or the .json form)." +
    "  </div>" +
    "</div>";
  container.appendChild(searchBox);

  const toggleSearchGo = (ev: Event) => {
    ev.stopPropagation();
    const isNowCollapsed = searchBox.classList.toggle("collapsed");
    localStorage.setItem("ds-search-go-collapsed", String(isNowCollapsed));
  };
  searchBox.querySelector<HTMLElement>(".group-box-title")?.addEventListener("click", toggleSearchGo);

  // ── Sub-tabs ────────────────────────────────────────────────────────────
  const tabsRow = document.createElement("div");
  tabsRow.className = "ds-subtabs";

  const tabsLeft = document.createElement("div");
  tabsLeft.className = "ds-subtabs-left";
  tabsRow.appendChild(tabsLeft);

  const tabsRight = document.createElement("div");
  tabsRight.className = "ds-subtabs-right";
  tabsRow.appendChild(tabsRight);

  container.appendChild(tabsRow);

  // ── Top Pager Container ────────────────────────────────────────────────
  const topPagerContainer = document.createElement("div");
  topPagerContainer.id = "ds-browse-top-pager";
  topPagerContainer.style.cssText = "display:flex;align-items:center;gap:8px;";
  tabsRight.appendChild(topPagerContainer);

  const content = document.createElement("div");
  content.id = "ds-browse-content";
  content.style.cssText = "margin-top:8px;";
  container.appendChild(content);

  // Persistent subtab panes
  const panes = new Map<string, HTMLElement>();
  for (const tab of TABS) {
    const pane = document.createElement("div");
    pane.id = `ds-browse-tab-${tab.id}`;
    pane.className = "ds-browse-tab-pane";
    pane.classList.add("ds-hidden");
    content.appendChild(pane);
    panes.set(tab.id, pane);
  }

  const loadedPanes = new Set<string>();
  const paneLoadedAt = new Map<string, number>();
  let lastRenderedBlacklistRev = getBlacklistRevision();

  const handleBlacklistChange = () => {
    // Invalidate all cached panes so they re-filter
    loadedPanes.clear();
    lastRenderedBlacklistRev = getBlacklistRevision();
    const activeTab = route.browseTab ?? "releases";
    const activePane = panes.get(activeTab);
    if (activePane) {
      loadedPanes.add(activeTab);
      paneLoadedAt.set(activeTab, Date.now());
      const savedPager = topPagerMap.get(activeTab);
      void renderTabContent(activePane, activeTab, savedPager?.currentPage ?? 1);
    }
  };

  onBlacklistChanged(handleBlacklistChange);

  const switchTab = (tabId: string, forceReload = false) => {
    route.browseTab = tabId;
    for (const b of Array.from(tabsLeft.querySelectorAll<HTMLButtonElement>(".ds-subtab"))) {
      if (b.dataset.tabId === tabId) b.classList.add("active");
      else b.classList.remove("active");
    }

    // Toggle pane visibility
    for (const [id, pane] of panes.entries()) {
      pane.classList.toggle("ds-hidden", id !== tabId);
    }

    const activePane = panes.get(tabId);
    if (!activePane) return;

    // Check if blacklist changed while away
    if (lastRenderedBlacklistRev !== getBlacklistRevision()) {
      loadedPanes.clear();
      lastRenderedBlacklistRev = getBlacklistRevision();
      forceReload = true;
    }

    // Restore top pager for this tab
    const savedPager = topPagerMap.get(tabId);
    if (savedPager) {
      updateBrowseTopPager(savedPager.totalPages, savedPager.currentPage, savedPager.onPage);
    } else {
      topPagerContainer.innerHTML = "";
    }

    if (!loadedPanes.has(tabId) || forceReload) {
      loadedPanes.add(tabId);
      paneLoadedAt.set(tabId, Date.now());
      void renderTabContent(activePane, tabId, 1);
    } else {
      // Already in DOM (0ms instant switch). Check if stale (>90s) for background revalidation
      const lastLoaded = paneLoadedAt.get(tabId) ?? 0;
      if (Date.now() - lastLoaded > 90_000 && (tabId === "releases" || tabId === "added")) {
        paneLoadedAt.set(tabId, Date.now());
        void revalidateFeedHead(tabId).then((res) => {
          if (res.hasNew) {
            showFeedUpdateBanner(activePane, tabId, (h, t, p) => renderTabContent(h, t, p));
          }
        });
      }
    }
  };

  wireSearchPanel(searchBox, (query) => {
    route.searchQuery = query;
    switchTab("search", true);
  });

  const currentTab = route.browseTab ?? "releases";
  for (const tab of TABS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `win-button ds-subtab${tab.id === currentTab ? " active" : ""}`;
    btn.dataset.tabId = tab.id;
    btn.title = tab.label;
    btn.innerHTML = `<span class="ds-subtab-full">${tab.label}</span><span class="ds-subtab-short">${tab.shortLabel ?? tab.label}</span>`;
    btn.addEventListener("click", () => {
      switchTab(tab.id);
    });
    tabsLeft.appendChild(btn);
  }

  // ── Check Updates Button ──────────────────────────────────────────────
  const checkUpdatesBtn = document.createElement("button");
  checkUpdatesBtn.type = "button";
  checkUpdatesBtn.id = "ds-browse-check-updates-btn";
  checkUpdatesBtn.className = "win-button ds-btn-sm";
  checkUpdatesBtn.title = "Force check for updates online";
  checkUpdatesBtn.innerHTML = '<i class="bi bi-arrow-clockwise"></i> Check Updates';
  checkUpdatesBtn.addEventListener("click", async () => {
    checkUpdatesBtn.disabled = true;
    const prevHtml = checkUpdatesBtn.innerHTML;
    checkUpdatesBtn.innerHTML = '<i class="bi bi-arrow-clockwise ds-spin"></i> Checking...';
    try {
      const activeTab = tabsLeft.querySelector<HTMLButtonElement>(".ds-subtab.active");
      const activeTabId = activeTab?.dataset.tabId ?? currentTab;
      const activePane = panes.get(activeTabId) ?? content;
      await renderTabContent(activePane, activeTabId, 1);
      checkUpdatesBtn.innerHTML = '<i class="bi bi-check2"></i> Updated';
      setTimeout(() => {
        checkUpdatesBtn.innerHTML = prevHtml;
        checkUpdatesBtn.disabled = false;
      }, 1500);
    } catch {
      checkUpdatesBtn.innerHTML = '<i class="bi bi-exclamation-triangle"></i> Error';
      setTimeout(() => {
        checkUpdatesBtn.innerHTML = prevHtml;
        checkUpdatesBtn.disabled = false;
      }, 1500);
    }
  });
  tabsRight.appendChild(checkUpdatesBtn);

  // Mount initial active tab
  switchTab(currentTab);
}

// Re-export constants for tooling/tests
export { FEED_TAB_TO_URL, FEED_TAB_TO_KEY };
