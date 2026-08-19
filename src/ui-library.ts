/**
 * Library view: Followed series, Custom Collections / Favorites, Bookmarks, and Reading history.
 * All data is local (SQLite) — fully offline-safe, no network traffic.
 */

import { Route, decodeEntities, formatDate, navigate, safeHtml, setActions, setBanner, setTitle } from "./state";
import {
  openExternal,
  refreshFollowedSeriesCover,
  getOrHydrateSeriesCover,
  getOrHydrateItemCover,
} from "./api";
import {
  FollowedSeriesRow,
  BookmarkRow,
  HistoryRow,
  CollectionRow,
  CollectionItemRow,
  getFollowedSeriesPage,
  getBookmarksPage,
  getHistoryPage,
  getFullyCachedChapterPermalinks,
  removeBookmark,
  removeHistory,
  clearHistory,
  getCollections,
  getCollectionById,
  createCollection,
  deleteCollection,
  getCollectionItems,
  removeItemFromCollection,
  updateCollectionItemCover,
} from "./db";
import { createConfirmDeleteButton } from "./components/button";
import { renderCoverImage } from "./components/cover";
import { renderPager } from "./components/pager";
import { attachDelayedLoading } from "./components/loading";
import { openModal } from "./components/modal";
import { createBackRefreshActions } from "./components/action-bar";

function createLibraryPanel(titleHtml: string): {
  panel: HTMLElement;
  head: HTMLElement;
  body: HTMLElement;
  footer: HTMLElement;
} {
  const panel = document.createElement("div");
  panel.className = "group-box ds-library-panel";

  const head = document.createElement("div");
  head.className = "group-box-title";
  head.innerHTML = titleHtml;

  const body = document.createElement("div");
  body.className = "ds-library-panel-body";

  const footer = document.createElement("div");
  footer.className = "ds-library-panel-footer";
  footer.classList.add("ds-hidden");

  panel.appendChild(head);
  panel.appendChild(body);
  panel.appendChild(footer);
  return { panel, head, body, footer };
}

export function renderLibrary(container: HTMLElement, route: Route): void {
  // If viewing a specific collection, mount the single collection view
  if (route.collectionId !== undefined) {
    container.innerHTML = "";
    void openCollectionDetailView(container, route.collectionId);
    return;
  }

  // If library panels are already mounted, refresh rows and actions in-place without rebuilding grid
  const existingGrid = container.querySelector<HTMLElement>(".ds-library-grid");
  if (existingGrid) {
    const bodies = container.querySelectorAll<HTMLElement>(".ds-library-panel-body");
    const footers = container.querySelectorAll<HTMLElement>(".ds-library-panel-footer");
    if (bodies.length >= 4 && footers.length >= 4) {
      setupLibraryActions(
        bodies[0],
        footers[0],
        bodies[1],
        footers[1],
        bodies[2],
        footers[2],
        bodies[3],
        footers[3],
        container,
      );
      void loadAll(
        bodies[0],
        footers[0],
        bodies[1],
        footers[1],
        bodies[2],
        footers[2],
        bodies[3],
        footers[3],
        container,
      );
      return;
    }
  }

  container.innerHTML = "";

  const root = document.createElement("div");
  root.id = "ds-library-container";
  container.appendChild(root);

  const grid = document.createElement("div");
  grid.className = "ds-library-grid";
  root.appendChild(grid);

  // 1. Followed Series
  const {
    panel: followedPanel,
    body: followedBody,
    footer: followedFooter,
  } = createLibraryPanel('<i class="bi bi-bookmark-heart"></i> Followed Series');
  grid.appendChild(followedPanel);

  // 2. Collections & Favorites
  const {
    panel: collectionsPanel,
    head: collectionsHead,
    body: collectionsBody,
    footer: collectionsFooter,
  } = createLibraryPanel('<i class="bi bi-folder-fill"></i> Collections');

  const newColBtn = document.createElement("button");
  newColBtn.type = "button";
  newColBtn.className = "win-button";
  newColBtn.style.cssText =
    "font-size:10px;padding:0 5px;height:18px;line-height:18px;margin-left:auto;display:inline-flex;align-items:center;justify-content:center;gap:3px;";
  newColBtn.innerHTML = '<i class="bi bi-plus-lg" style="font-size:9px;line-height:1;"></i> <span>New</span>';
  newColBtn.title = "Create a new custom collection";
  newColBtn.addEventListener("click", () => {
    openCreateCollectionDialog(() => {
      void loadCollections(collectionsBody, collectionsFooter, container);
    });
  });

  collectionsHead.style.cssText =
    "display:flex;align-items:center;justify-content:space-between;width:calc(100% - 16px);right:8px;";
  collectionsHead.appendChild(newColBtn);
  grid.appendChild(collectionsPanel);

  // 3. Bookmarks
  const {
    panel: bookmarksPanel,
    body: bookmarksBody,
    footer: bookmarksFooter,
  } = createLibraryPanel('<i class="bi bi-bookmark"></i> Bookmarks');
  grid.appendChild(bookmarksPanel);

  // 4. Reading History
  const {
    panel: historyPanel,
    head: historyHead,
    body: historyBody,
    footer: historyFooter,
  } = createLibraryPanel('<i class="bi bi-clock-history"></i> Reading History');

  const clearHistoryBtn = createConfirmDeleteButton(
    "Clear all reading history",
    async () => {
      await clearHistory();
      setBanner("All reading history cleared.");
      void loadHistoryPage(historyBody, historyFooter, 1);
    },
    '<i class="bi bi-trash3" style="line-height:1;"></i> Clear',
  );
  clearHistoryBtn.style.cssText =
    "font-size:10px;padding:0 6px;height:18px;margin-left:auto;display:inline-flex;align-items:center;justify-content:center;gap:3px;";
  historyHead.style.cssText =
    "display:flex;align-items:center;justify-content:space-between;width:calc(100% - 16px);right:8px;";
  historyHead.appendChild(clearHistoryBtn);
  grid.appendChild(historyPanel);

  setupLibraryActions(
    followedBody,
    followedFooter,
    collectionsBody,
    collectionsFooter,
    bookmarksBody,
    bookmarksFooter,
    historyBody,
    historyFooter,
    container,
  );

  void loadAll(
    followedBody,
    followedFooter,
    collectionsBody,
    collectionsFooter,
    bookmarksBody,
    bookmarksFooter,
    historyBody,
    historyFooter,
    container,
  );
}

function setupLibraryActions(
  followedBody: HTMLElement,
  followedFooter: HTMLElement,
  collectionsBody: HTMLElement,
  collectionsFooter: HTMLElement,
  bookmarksBody: HTMLElement,
  bookmarksFooter: HTMLElement,
  historyBody: HTMLElement,
  historyFooter: HTMLElement,
  container: HTMLElement,
): void {
  setActions((host) => {
    const refreshBtn = document.createElement("button");
    refreshBtn.type = "button";
    refreshBtn.id = "ds-library-refresh-btn";
    refreshBtn.className = "win-button ds-btn-sm";
    refreshBtn.title = "Refresh library from local database";
    refreshBtn.innerHTML = '<i class="bi bi-arrow-clockwise"></i> Refresh Library';
    refreshBtn.addEventListener("click", async () => {
      refreshBtn.disabled = true;
      const prevHtml = refreshBtn.innerHTML;
      refreshBtn.innerHTML = '<i class="bi bi-arrow-clockwise ds-spin"></i> Refreshing...';
      try {
        await loadAll(
          followedBody,
          followedFooter,
          collectionsBody,
          collectionsFooter,
          bookmarksBody,
          bookmarksFooter,
          historyBody,
          historyFooter,
          container,
        );
        refreshBtn.innerHTML = '<i class="bi bi-check2"></i> Updated';
        setTimeout(() => {
          refreshBtn.innerHTML = prevHtml;
          refreshBtn.disabled = false;
        }, 1200);
      } catch {
        refreshBtn.innerHTML = prevHtml;
        refreshBtn.disabled = false;
      }
    });
    host.appendChild(refreshBtn);

    const cacheBtn = document.createElement("button");
    cacheBtn.type = "button";
    cacheBtn.className = "win-button ds-btn-compact";
    cacheBtn.innerHTML = '<i class="bi bi-hdd-stack"></i> Cache Management';
    cacheBtn.title = "View cache storage statistics and manage cached series/pages";
    cacheBtn.addEventListener("click", () => {
      navigate({ view: "cache" });
    });
    host.appendChild(cacheBtn);

    const blacklistBtn = document.createElement("button");
    blacklistBtn.type = "button";
    blacklistBtn.className = "win-button ds-btn-compact";
    blacklistBtn.innerHTML = '<i class="bi bi-shield-slash"></i> Series Blacklist';
    blacklistBtn.title = "Manage blacklisted series and view hidden works";
    blacklistBtn.addEventListener("click", () => {
      navigate({ view: "blacklist" });
    });
    host.appendChild(blacklistBtn);
  });
}

async function loadAll(
  followedBody: HTMLElement,
  followedFooter: HTMLElement,
  collectionsBody: HTMLElement,
  collectionsFooter: HTMLElement,
  bookmarksBody: HTMLElement,
  bookmarksFooter: HTMLElement,
  historyBody: HTMLElement,
  historyFooter: HTMLElement,
  container: HTMLElement,
): Promise<void> {
  try {
    await Promise.all([
      loadFollowedPage(followedBody, followedFooter, 1),
      loadCollections(collectionsBody, collectionsFooter, container),
      loadBookmarksPage(bookmarksBody, bookmarksFooter, 1),
      loadHistoryPage(historyBody, historyFooter, 1),
    ]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    setBanner(`Library failed to load: ${msg}`);
  }
}

// ---------------------------------------------------------------------------
// 1. Followed Series
// ---------------------------------------------------------------------------

async function loadFollowedPage(
  body: HTMLElement,
  footer: HTMLElement,
  page: number,
): Promise<void> {
  footer.innerHTML = "";
  footer.classList.add("ds-hidden");
  const cancelLoading = attachDelayedLoading(body, 140);

  try {
    const res = await getFollowedSeriesPage(page, 10);
    cancelLoading();
    renderFollowed(
      body,
      footer,
      res.rows,
      res.totalPages,
      res.currentPage,
      (p) => void loadFollowedPage(body, footer, p),
    );
  } catch (err) {
    cancelLoading();
    const msg = err instanceof Error ? err.message : String(err);
    body.innerHTML = "";
    const errEl = document.createElement("div");
    errEl.className = "ds-muted";
    errEl.textContent = `Failed to load followed series: ${msg}`;
    body.appendChild(errEl);
  }
}

function renderFollowed(
  body: HTMLElement,
  footer: HTMLElement,
  rows: FollowedSeriesRow[],
  totalPages: number,
  currentPage: number,
  onPage: (p: number) => void,
): void {
  footer.innerHTML = "";
  if (rows.length === 0) {
    footer.classList.add("ds-hidden");
    const empty = document.createElement("div");
    empty.className = "ds-muted";
    empty.textContent = "No followed series yet. Open a series and click Follow to see it here.";
    body.replaceChildren(empty);
    return;
  }

  const frag = document.createDocumentFragment();

  for (const row of rows) {
    const item = document.createElement("div");
    item.className = "ds-item ds-flex-row";
    item.style.cssText = "padding:4px 6px;";

    const cover = renderCoverImage(row.cover, row.name, "ds-followed-cover");
    cover.style.cursor = "pointer";
    cover.addEventListener("click", () => {
      navigate({
        view: "series",
        seriesPermalink: row.permalink,
        seriesName: row.name,
      });
    });

    const info = document.createElement("div");
    info.className = "ds-fill ds-clickable";
    const title = document.createElement("div");
    title.className = "ds-item-title";
    title.textContent = decodeEntities(row.name);
    const meta = document.createElement("div");
    meta.className = "ds-item-meta";
    meta.textContent = row.latest_chapter_title
      ? `Latest: ${decodeEntities(row.latest_chapter_title)}`
      : `Followed on ${formatDate(Number(row.created_at))}`;
    info.appendChild(title);
    info.appendChild(meta);
    info.addEventListener("click", () => {
      navigate({
        view: "series",
        seriesPermalink: row.permalink,
        seriesName: row.name,
      });
    });

    const refreshCoverBtn = document.createElement("button");
    refreshCoverBtn.type = "button";
    refreshCoverBtn.className = "win-button";
    refreshCoverBtn.style.cssText = "font-size:10px;padding:2px 6px;flex-shrink:0;";
    refreshCoverBtn.title = "Re-fetch series cover";
    refreshCoverBtn.innerHTML = '<i class="bi bi-image"></i>';
    refreshCoverBtn.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      refreshCoverBtn.disabled = true;
      try {
        await refreshFollowedSeriesCover(row.permalink, row.cover);
        setBanner(`Cover updated for "${row.name}".`);
        void loadFollowedPage(body, footer, currentPage);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setBanner(`Cover refresh failed: ${msg}`);
        refreshCoverBtn.disabled = false;
      }
    });

    const extBtn = document.createElement("button");
    extBtn.type = "button";
    extBtn.className = "win-button";
    extBtn.style.cssText = "font-size:10px;padding:2px 6px;flex-shrink:0;";
    extBtn.title = "Open on Dynasty Scans in browser";
    extBtn.innerHTML = '<i class="bi bi-box-arrow-up-right"></i>';
    extBtn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      openExternal(`https://dynasty-scans.com/series/${row.permalink}`);
    });

    item.appendChild(cover);
    item.appendChild(info);
    item.appendChild(refreshCoverBtn);
    item.appendChild(extBtn);
    frag.appendChild(item);
  }

  body.replaceChildren(frag);

  if (totalPages > 1) {
    footer.classList.remove("ds-hidden");
    footer.appendChild(renderPager(totalPages, currentPage, onPage));
  } else {
    footer.classList.add("ds-hidden");
  }
}

// ---------------------------------------------------------------------------
// 2. Collections & Favorites
// ---------------------------------------------------------------------------

async function loadCollections(
  body: HTMLElement,
  footer: HTMLElement,
  container: HTMLElement,
): Promise<void> {
  footer.innerHTML = "";
  footer.classList.add("ds-hidden");
  const cancelLoading = attachDelayedLoading(body, 140);

  try {
    const list = await getCollections();
    cancelLoading();
    renderCollections(body, footer, list, container);
  } catch (err) {
    cancelLoading();
    const msg = err instanceof Error ? err.message : String(err);
    body.innerHTML = "";
    const errEl = document.createElement("div");
    errEl.className = "ds-muted";
    errEl.textContent = `Failed to load collections: ${msg}`;
    body.appendChild(errEl);
  }
}

function renderCollections(
  body: HTMLElement,
  footer: HTMLElement,
  collections: CollectionRow[],
  container: HTMLElement,
): void {
  footer.innerHTML = "";
  footer.classList.add("ds-hidden");

  if (collections.length === 0) {
    const empty = document.createElement("div");
    empty.className = "ds-muted";
    empty.textContent = "No collections found.";
    body.replaceChildren(empty);
    return;
  }

  const frag = document.createDocumentFragment();

  for (const col of collections) {
    const item = document.createElement("div");
    item.className = "ds-item ds-flex-row";
    item.style.cssText = "padding:5px 8px;border-radius:2px;gap:8px;";

    const icon = document.createElement("i");
    icon.className = col.is_default ? "bi bi-star-fill" : "bi bi-folder2-open";
    icon.style.cssText = col.is_default
      ? "color:#d97706;font-size:14px;flex-shrink:0;"
      : "color:var(--sys-primary,#0078d4);font-size:14px;flex-shrink:0;";
    item.appendChild(icon);

    const info = document.createElement("div");
    info.className = "ds-fill ds-clickable";
    const title = document.createElement("div");
    title.className = "ds-item-title";
    title.style.cssText = col.is_default ? "font-weight:700;" : "font-weight:600;";
    title.textContent = decodeEntities(col.name);

    const meta = document.createElement("div");
    meta.className = "ds-item-meta";
    meta.textContent = `${col.itemCount ?? 0} item${col.itemCount === 1 ? "" : "s"}${col.is_default ? " · Default Collection" : ""}`;

    info.appendChild(title);
    info.appendChild(meta);
    info.addEventListener("click", () => {
      navigate({ view: "library", collectionId: col.id });
    });
    item.appendChild(info);

    const openBtn = document.createElement("button");
    openBtn.type = "button";
    openBtn.className = "win-button ds-btn-sm";
    openBtn.style.cssText = "font-size:10px;padding:2px 8px;flex-shrink:0;";
    openBtn.innerHTML = '<i class="bi bi-folder2-open"></i> Open';
    openBtn.addEventListener("click", () => {
      navigate({ view: "library", collectionId: col.id });
    });
    item.appendChild(openBtn);

    if (!col.is_default) {
      const delBtn = createConfirmDeleteButton("Delete collection", async () => {
        try {
          await deleteCollection(col.id);
          setBanner(`Deleted collection "${col.name}".`);
          void loadCollections(body, footer, container);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          setBanner(`Could not delete collection: ${msg}`);
        }
      });
      delBtn.style.cssText =
        "font-size:10px;padding:0;width:20px;height:20px;min-width:20px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;";
      item.appendChild(delBtn);
    }

    frag.appendChild(item);
  }

  body.replaceChildren(frag);
}

/**
 * Opens a sleek, native WinForms modal dialog to create a new custom collection.
 */
export function openCreateCollectionDialog(onCreated: () => void): void {
  if (document.getElementById("ds-create-collection-overlay")) return;

  const { modal, close } = openModal({
    backdropId: "ds-create-collection-overlay",
    title:
      '<i class="bi bi-folder-plus" style="color:var(--sys-primary,#0078d4);"></i> New Collection',
    width: 320,
    body: `
      <div style="padding:10px 12px 8px;display:flex;flex-direction:column;gap:6px;">
        <label style="font-size:11px;font-weight:600;color:var(--sys-window-text,#111);">Collection Name:</label>
        <div class="input-wrapper" style="width:100%;">
          <input type="text" id="ds-new-col-name-input" class="input-field has-clear" placeholder="e.g. Yuri Gems, Read Later..." style="width:100%;box-sizing:border-box;font-size:11px;height:24px;" autofocus />
          <button type="button" class="input-clear-btn" tabindex="-1" title="Clear"><i class="bi bi-x-lg"></i></button>
        </div>
      </div>
    `,
    footer: `
      <div style="display:flex;align-items:center;justify-content:flex-end;gap:6px;width:100%;">
        <button type="button" class="win-button ds-modal-cancel" style="font-size:11px;padding:2px 10px;">Cancel</button>
        <button type="button" class="win-button primary ds-modal-submit" style="font-size:11px;padding:2px 10px;display:inline-flex;align-items:center;gap:4px;">
          <i class="bi bi-plus-lg" style="font-size:10px;line-height:1;"></i> <span>Create</span>
        </button>
      </div>
    `,
  });

  const input = modal.querySelector<HTMLInputElement>("#ds-new-col-name-input")!;
  const submitBtn = modal.querySelector<HTMLButtonElement>(".ds-modal-submit")!;
  const cancelBtn = modal.querySelector<HTMLButtonElement>(".ds-modal-cancel")!;

  setTimeout(() => input?.focus(), 50);

  input.addEventListener("keydown", (ev: KeyboardEvent) => {
    if (ev.key === "Enter") void handleSubmit();
  });
  cancelBtn.addEventListener("click", close);

  const handleSubmit = async () => {
    const name = input.value.trim();
    if (!name) return;
    submitBtn.disabled = true;
    try {
      await createCollection(name);
      setBanner(`Created collection "${name}".`);
      close();
      onCreated();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setBanner(`Failed to create collection: ${msg}`);
      submitBtn.disabled = false;
    }
  };

  submitBtn.addEventListener("click", () => void handleSubmit());
}

/**
 * Renders the dedicated, categorized detail view for a collection inside the Library.
 * Series, Doujins & Anthologies, and One-shots are separated cleanly into distinct sections.
 */
export async function openCollectionDetailView(
  container: HTMLElement,
  collectionId: number,
): Promise<void> {
  container.innerHTML = "";

  const root = document.createElement("div");
  root.id = "ds-collection-detail-container";
  container.appendChild(root);

  const cancelLoading = attachDelayedLoading(root, 140);

  let collection: CollectionRow | null = null;
  let items: CollectionItemRow[] = [];
  try {
    [collection, items] = await Promise.all([
      getCollectionById(collectionId),
      getCollectionItems(collectionId),
    ]);
  } catch (err) {
    cancelLoading();
    const msg = err instanceof Error ? err.message : String(err);
    setBanner(`Failed to load collection: ${msg}`);
    return;
  }
  cancelLoading();

  if (!collection) {
    setBanner("Collection not found.");
    renderLibrary(container, { view: "library" });
    return;
  }
  setTitle(collection.name);

  // Setup Top Bar Action for returning to the main Library
  setActions((host) => {
    for (const btn of createBackRefreshActions(
      "Back to Collections",
      () => {
        navigate({ view: "library" });
      },
      () => {
        void openCollectionDetailView(container, collectionId);
      },
    )) {
      host.appendChild(btn);
    }
  });

  // Top summary header bar with live search filter
  const headerBar = document.createElement("div");
  headerBar.className = "ds-collection-header-bar";

  const statsSpan = document.createElement("div");
  statsSpan.className = "ds-collection-stats";
  headerBar.appendChild(statsSpan);

  const filterWrap = document.createElement("div");
  filterWrap.className = "input-wrapper";
  filterWrap.style.cssText = "width:220px;max-width:100%;";
  filterWrap.innerHTML = `
    <input type="text" class="input-field has-clear" placeholder="Filter items in collection..." style="width:100%;box-sizing:border-box;font-size:11px;height:22px;" />
    <button type="button" class="input-clear-btn" tabindex="-1" title="Clear"><i class="bi bi-x-lg"></i></button>
  `;
  headerBar.appendChild(filterWrap);

  root.appendChild(headerBar);

  const contentArea = document.createElement("div");
  contentArea.style.cssText = "display:flex;flex-direction:column;gap:10px;flex:1;";
  root.appendChild(contentArea);

  let filterQuery = "";

  const renderContent = () => {
    contentArea.innerHTML = "";

    const q = filterQuery.trim().toLowerCase();
    const filtered = q
      ? items.filter(
          (it) =>
            it.item_title.toLowerCase().includes(q) ||
            (it.parent_series_name && it.parent_series_name.toLowerCase().includes(q)) ||
            it.item_permalink.toLowerCase().includes(q),
        )
      : items;

    statsSpan.innerHTML = `
      <i class="${collection?.is_default ? "bi bi-star-fill" : "bi bi-folder2-open"}" style="color:${collection?.is_default ? "#d97706" : "var(--sys-primary,#0078d4)"};font-size:13px;"></i>
      <span><b>${safeHtml(collection?.name || "")}</b> — <b>${items.length}</b> item${items.length === 1 ? "" : "s"}</span>
    `;

    if (items.length === 0) {
      const empty = document.createElement("div");
      empty.className = "ds-muted";
      empty.style.cssText = "padding:16px 8px;font-size:11px;";
      empty.innerHTML =
        'No items in this collection yet. Click <b><i class="bi bi-folder-plus"></i> Add to...</b> on any series or chapter in Browse / Search / Series pages to add items here.';
      contentArea.appendChild(empty);
      return;
    }

    if (filtered.length === 0) {
      const noMatch = document.createElement("div");
      noMatch.className = "ds-muted";
      noMatch.style.cssText = "padding:16px 8px;text-align:center;font-size:11px;";
      noMatch.textContent = `No items matched "${filterQuery}".`;
      contentArea.appendChild(noMatch);
      return;
    }

    const list = document.createElement("div");
    list.className = "ds-feed-list";
    list.style.cssText = "display:flex;flex-direction:column;gap:4px;";

    for (const it of filtered) {
      list.appendChild(
        renderCollectionItemCard(it, collectionId, async () => {
          items = await getCollectionItems(collectionId);
          renderContent();
        }),
      );
    }

    contentArea.appendChild(list);
  };

  const filterInput = filterWrap.querySelector<HTMLInputElement>("input")!;
  filterInput.addEventListener("input", () => {
    filterQuery = filterInput.value;
    renderContent();
  });

  renderContent();
}

function renderCollectionItemCard(
  it: CollectionItemRow,
  collectionId: number,
  onRefresh: () => Promise<void>,
): HTMLElement {
  const item = document.createElement("div");
  item.className = "ds-item ds-flex-row ds-clickable";
  item.style.cssText = "padding:5px 8px;border-radius:2px;gap:8px;cursor:pointer;";

  const isChapterLike =
    it.item_kind === "chapter" ||
    it.item_kind === "oneshot" ||
    it.item_kind === "doujin";

  const onOpen = () => {
    if (isChapterLike) {
      navigate({
        view: "reader",
        chapterPermalink: it.item_permalink,
        chapterTitle: it.item_title,
        seriesPermalink: it.parent_series_permalink || undefined,
        seriesName: it.parent_series_name || undefined,
      });
    } else {
      navigate({
        view: "series",
        seriesPermalink: it.item_permalink,
        seriesName: it.item_title,
      });
    }
  };

  // Fixed cover container to avoid dynamic replaceChild detachment losing listeners
  const coverWrap = document.createElement("div");
  coverWrap.style.cssText = "flex-shrink:0;cursor:pointer;";

  let coverEl = renderCoverImage(
    it.cover,
    it.item_title,
    "ds-collection-cover",
    "ds-collection-cover-placeholder",
  );
  coverWrap.appendChild(coverEl);

  // Lazy cover hydration if no local file path is cached yet
  if (!it.cover || (!it.cover.includes("/") && !it.cover.includes("\\"))) {
    const hydrateTask =
      !isChapterLike && it.item_kind === "series"
        ? getOrHydrateSeriesCover(it.item_permalink)
        : getOrHydrateItemCover(
            it.cover || `chapter:${it.item_permalink}`,
            it.item_permalink,
            it.parent_series_permalink,
            it.item_kind,
          );
    void hydrateTask.then((freshPath) => {
      if (freshPath) {
        it.cover = freshPath;
        void updateCollectionItemCover(it.id, freshPath);
        const newCover = renderCoverImage(
          freshPath,
          it.item_title,
          "ds-collection-cover",
          "ds-collection-cover-placeholder",
        );
        coverWrap.replaceChildren(newCover);
      }
    });
  }

  const info = document.createElement("div");
  info.className = "ds-fill";

  const titleRow = document.createElement("div");
  titleRow.className = "ds-flex-row";
  titleRow.style.cssText = "align-items:center;gap:6px;flex-wrap:wrap;";

  const title = document.createElement("span");
  title.className = "ds-item-title";
  title.style.cssText = "font-weight:600;font-size:12px;";
  title.textContent = decodeEntities(it.item_title);
  titleRow.appendChild(title);

  const kindBadge = document.createElement("span");
  kindBadge.className = "ds-muted";
  kindBadge.style.cssText =
    "font-size:10px;background:var(--sys-control-bg,#eaeaea);padding:1px 5px;border-radius:2px;text-transform:capitalize;";
  kindBadge.textContent =
    it.item_kind === "oneshot"
      ? "One-shot"
      : it.item_kind === "chapter"
        ? "Chapter"
        : it.item_kind === "doujin"
          ? "Doujin"
          : it.item_kind === "anthology"
            ? "Anthology"
            : "Series";
  titleRow.appendChild(kindBadge);

  const meta = document.createElement("div");
  meta.className = "ds-item-meta";
  meta.textContent = it.parent_series_name
    ? `${decodeEntities(it.parent_series_name)} · Added on ${formatDate(Number(it.created_at))}`
    : `Added on ${formatDate(Number(it.created_at))}`;

  info.appendChild(titleRow);
  info.appendChild(meta);

  // Click on the entire row opens the item
  item.addEventListener("click", () => onOpen());

  const openBtn = document.createElement("button");
  openBtn.type = "button";
  openBtn.className = "win-button ds-btn-sm";
  openBtn.style.cssText = "font-size:10px;padding:2px 8px;flex-shrink:0;";
  openBtn.innerHTML = isChapterLike
    ? '<i class="bi bi-book"></i> Read'
    : '<i class="bi bi-folder2-open"></i> Open';
  openBtn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    onOpen();
  });

  const extBtn = document.createElement("button");
  extBtn.type = "button";
  extBtn.className = "win-button";
  extBtn.style.cssText = "font-size:10px;padding:2px 6px;flex-shrink:0;";
  extBtn.title = "Open on Dynasty Scans in browser";
  extBtn.innerHTML = '<i class="bi bi-box-arrow-up-right"></i>';
  extBtn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    const endpoint = isChapterLike
      ? "chapters"
      : it.item_kind === "doujin"
        ? "doujins"
        : it.item_kind === "anthology"
          ? "anthologies"
          : "series";
    openExternal(`https://dynasty-scans.com/${endpoint}/${it.item_permalink}`);
  });

  const removeBtn = createConfirmDeleteButton("Remove from collection", async (ev?: Event) => {
    ev?.stopPropagation();
    try {
      await removeItemFromCollection(collectionId, it.item_permalink);
      setBanner(`Removed "${it.item_title}" from collection.`);
      await onRefresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setBanner(`Could not remove item: ${msg}`);
    }
  });
  removeBtn.style.cssText = "font-size:10px;padding:2px 6px;flex-shrink:0;";
  removeBtn.addEventListener("click", (ev) => ev.stopPropagation());

  item.appendChild(coverWrap);
  item.appendChild(info);
  item.appendChild(openBtn);
  item.appendChild(extBtn);
  item.appendChild(removeBtn);

  return item;
}

// ---------------------------------------------------------------------------
// 3. Bookmarks
// ---------------------------------------------------------------------------

async function loadBookmarksPage(
  body: HTMLElement,
  footer: HTMLElement,
  page: number,
): Promise<void> {
  footer.innerHTML = "";
  footer.classList.add("ds-hidden");
  const cancelLoading = attachDelayedLoading(body, 140);

  try {
    const [res, fullyCachedSet] = await Promise.all([
      getBookmarksPage(page, 15),
      getFullyCachedChapterPermalinks(),
    ]);
    cancelLoading();
    renderBookmarks(
      body,
      footer,
      res.rows,
      res.totalPages,
      res.currentPage,
      (p) => void loadBookmarksPage(body, footer, p),
      fullyCachedSet,
    );
  } catch (err) {
    cancelLoading();
    body.innerHTML = "";
    const msg = err instanceof Error ? err.message : String(err);
    setBanner(`Failed to load bookmarks: ${msg}`);
  }
}

function renderBookmarks(
  body: HTMLElement,
  footer: HTMLElement,
  rows: BookmarkRow[],
  totalPages: number,
  currentPage: number,
  onPage: (p: number) => void,
  fullyCachedSet: Set<string> = new Set(),
): void {
  footer.innerHTML = "";
  if (rows.length === 0) {
    footer.classList.add("ds-hidden");
    const empty = document.createElement("div");
    empty.className = "ds-muted";
    empty.textContent = "No bookmarks yet. Click Read Later on any chapter to bookmark it.";
    body.replaceChildren(empty);
    return;
  }

  const frag = document.createDocumentFragment();

  for (const row of rows) {
    const item = document.createElement("div");
    item.className = "ds-item ds-flex-row";
    item.style.cssText = "padding:4px 6px;";

    const isFullyCached = fullyCachedSet.has(row.chapter_permalink);
    const info = document.createElement("div");
    info.className = "ds-fill ds-clickable";
    const title = document.createElement("div");
    title.className = "ds-item-title";
    title.style.cssText = "display:inline-flex;align-items:center;gap:4px;flex-wrap:wrap;";
    title.innerHTML = `<span>${safeHtml(row.chapter_title)}</span>${
      isFullyCached
        ? '<i class="bi bi-cloud-check-fill ds-offline-icon" style="color:var(--sys-primary,#0078d4);font-size:11px;" title="Available Offline (Fully Cached)"></i>'
        : ""
    }`;
    const meta = document.createElement("div");
    meta.className = "ds-item-meta";
    meta.textContent = row.series_name
      ? `${decodeEntities(row.series_name)} · Saved on ${formatDate(Number(row.created_at))}`
      : `Saved on ${formatDate(Number(row.created_at))}`;
    info.appendChild(title);
    info.appendChild(meta);
    info.addEventListener("click", () => {
      navigate({
        view: "reader",
        chapterPermalink: row.chapter_permalink,
        chapterTitle: row.chapter_title,
        seriesPermalink: row.series_permalink,
        seriesName: row.series_name,
        startPage: row.page_index,
      });
    });

    const extBtn = document.createElement("button");
    extBtn.type = "button";
    extBtn.className = "win-button";
    extBtn.style.cssText = "font-size:10px;padding:2px 6px;flex-shrink:0;";
    extBtn.title = "Open chapter on Dynasty Scans in browser";
    extBtn.innerHTML = '<i class="bi bi-box-arrow-up-right"></i>';
    extBtn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      openExternal(`https://dynasty-scans.com/chapters/${row.chapter_permalink}`);
    });

    const removeBtn = createConfirmDeleteButton("Remove bookmark", async () => {
      await removeBookmark(row.chapter_permalink);
      void loadBookmarksPage(body, footer, currentPage);
    });

    item.appendChild(info);
    item.appendChild(extBtn);
    item.appendChild(removeBtn);
    frag.appendChild(item);
  }

  body.replaceChildren(frag);

  if (totalPages > 1) {
    footer.classList.remove("ds-hidden");
    footer.appendChild(renderPager(totalPages, currentPage, onPage));
  } else {
    footer.classList.add("ds-hidden");
  }
}

// ---------------------------------------------------------------------------
// 4. Reading History
// ---------------------------------------------------------------------------

async function loadHistoryPage(
  body: HTMLElement,
  footer: HTMLElement,
  page: number,
): Promise<void> {
  footer.innerHTML = "";
  footer.classList.add("ds-hidden");
  const cancelLoading = attachDelayedLoading(body, 140);

  try {
    const [res, fullyCachedSet] = await Promise.all([
      getHistoryPage(page, 15),
      getFullyCachedChapterPermalinks(),
    ]);
    cancelLoading();
    renderHistory(
      body,
      footer,
      res.rows,
      res.totalPages,
      res.currentPage,
      (p) => void loadHistoryPage(body, footer, p),
      fullyCachedSet,
    );
  } catch (err) {
    cancelLoading();
    body.innerHTML = "";
    const msg = err instanceof Error ? err.message : String(err);
    setBanner(`Failed to load history: ${msg}`);
  }
}

function renderHistory(
  body: HTMLElement,
  footer: HTMLElement,
  rows: HistoryRow[],
  totalPages: number,
  currentPage: number,
  onPage: (p: number) => void,
  fullyCachedSet: Set<string> = new Set(),
): void {
  footer.innerHTML = "";
  if (rows.length === 0) {
    footer.classList.add("ds-hidden");
    const empty = document.createElement("div");
    empty.className = "ds-muted";
    empty.textContent = "Nothing read yet.";
    body.replaceChildren(empty);
    return;
  }

  const frag = document.createDocumentFragment();

  for (const row of rows) {
    const item = document.createElement("div");
    item.className = "ds-item ds-flex-row";
    item.style.cssText = "padding:4px 6px;";

    const isFullyCached = fullyCachedSet.has(row.chapter_permalink);
    const info = document.createElement("div");
    info.className = "ds-fill ds-clickable";
    const title = document.createElement("div");
    title.className = "ds-item-title";
    title.style.cssText = "display:inline-flex;align-items:center;gap:4px;flex-wrap:wrap;";
    title.innerHTML = `<span>${safeHtml(row.chapter_title)}</span>${
      isFullyCached
        ? '<i class="bi bi-cloud-check-fill ds-offline-icon" style="color:var(--sys-primary,#0078d4);font-size:11px;" title="Available Offline (Fully Cached)"></i>'
        : ""
    }`;
    const meta = document.createElement("div");
    meta.className = "ds-item-meta";
    meta.textContent = `${decodeEntities(row.series_name)} · ${formatDate(Number(row.read_at))}`;
    info.appendChild(title);
    info.appendChild(meta);
    info.addEventListener("click", () => {
      navigate({
        view: "reader",
        chapterPermalink: row.chapter_permalink,
        chapterTitle: row.chapter_title,
        seriesPermalink: row.series_permalink,
        seriesName: row.series_name,
      });
    });

    const extBtn = document.createElement("button");
    extBtn.type = "button";
    extBtn.className = "win-button";
    extBtn.style.cssText = "font-size:10px;padding:2px 6px;flex-shrink:0;";
    extBtn.title = "Open chapter on Dynasty Scans in browser";
    extBtn.innerHTML = '<i class="bi bi-box-arrow-up-right"></i>';
    extBtn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      openExternal(`https://dynasty-scans.com/chapters/${row.chapter_permalink}`);
    });

    const removeBtn = createConfirmDeleteButton("Remove from history", async () => {
      await removeHistory(row.id);
      void loadHistoryPage(body, footer, currentPage);
    });

    item.appendChild(info);
    item.appendChild(extBtn);
    item.appendChild(removeBtn);
    frag.appendChild(item);
  }

  body.replaceChildren(frag);

  if (totalPages > 1) {
    footer.classList.remove("ds-hidden");
    footer.appendChild(renderPager(totalPages, currentPage, onPage));
  } else {
    footer.classList.add("ds-hidden");
  }
}
