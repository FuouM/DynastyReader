/**
 * Active-view router for the dynasty-scans plugin.
 *
 * Holds the active route, a small back-stack, and the reader's live progress
 * so view modules can coordinate through one mutable object. Views call
 * `navigate` / `back` / `renderCurrent` here without importing `index.ts`
 * (which would create an import cycle); `index.ts` registers the per-view
 * renderers before first mount. Extracted from the old `state.ts` barrel.
 */

import type { Route, ViewName, SessionMangaTab } from "./types/routes";
export type { Route, ViewName, ChapterRef, SessionMangaTab } from "./types/routes";
import { decodeEntities } from "./utils/html";
import { clearActions, clearBanner, setBanner, setTitle } from "./topbar";

export interface PluginState {
  route: Route;
  /** Ephemeral session tab for the last manga opened in this session (does not persist across restarts). */
  lastMangaTab: SessionMangaTab | null;
  /** Cleanup hook installed by the active view (listeners, observers). */
  dispose: (() => void) | null;
  dbInitialized: boolean;
}

export const state: PluginState = {
  route: { view: "browse" },
  lastMangaTab: null,
  dispose: null,
  dbInitialized: false,
};

export async function loadPluginView(customRoute?: Route): Promise<void> {
  if (customRoute) {
    state.route = customRoute;
  }
  if (!state.dbInitialized) {
    try {
      const { initDb } = await import("./db");
      await initDb();
      state.dbInitialized = true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("dynasty-scans: db init failed:", msg);
      setBanner(`Database init failed: ${msg}`);
    }
  }
  renderCurrent();
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export type Renderer = (container: HTMLElement, route: Route) => (() => void) | void;

const renderers: Partial<Record<ViewName, Renderer>> = {};

/** Registers the render function for a view. Called once by index.ts. */
export function registerRenderer(view: ViewName, fn: Renderer): void {
  renderers[view] = fn;
}

const persistentPanes = new Map<string, HTMLElement>();

type RouteChangeHook = (view: ViewName) => void;
const routeChangeHooks: RouteChangeHook[] = [];

/**
 * Registers a hook invoked on every top-level route change, before the new
 * view renders. Views use this to reset their module-scope transient state when
 * the user navigates away (e.g. the browse search/downloaded filter state).
 */
export function onRouteChange(fn: RouteChangeHook): void {
  routeChangeHooks.push(fn);
}

/** Re-renders the current route into #ds-view. Also used for the first paint. */
export function renderCurrent(): void {
  const view = document.getElementById("ds-view");
  if (!view) return;

  clearBanner();
  clearActions();
  const r = state.route;
  setTitle(routeTitle(r));

  const libTab = document.getElementById("ds-tab-library");
  const browseTab = document.getElementById("ds-tab-browse");
  if (libTab) {
    if (r.view === "library") libTab.classList.add("active");
    else libTab.classList.remove("active");
  }
  if (browseTab) {
    if (r.view === "browse") browseTab.classList.add("active");
    else browseTab.classList.remove("active");
  }

  updateSessionMangaTabUI();

  // Handle persistent views (Browse and Library) without tearing down DOM
  if (r.view === "browse" || r.view === "library") {
    state.dispose?.();
    state.dispose = null;

    // Remove any dynamic sub-view (reader / series / cache) from #ds-view
    const dynamicNodes = Array.from(view.children).filter(
      (el) => el.id !== "ds-pane-browse" && el.id !== "ds-pane-library"
    );
    for (const node of dynamicNodes) {
      node.remove();
    }

    // Toggle persistent panes
    for (const [vName, pane] of persistentPanes.entries()) {
      pane.style.display = vName === r.view ? "flex" : "none";
    }

    let targetPane = persistentPanes.get(r.view);
    if (!targetPane) {
      targetPane = document.createElement("div");
      targetPane.id = `ds-pane-${r.view}`;
      targetPane.className = "ds-persistent-view-pane";
      targetPane.style.display = "flex";
      view.appendChild(targetPane);
      persistentPanes.set(r.view, targetPane);

      const renderer = renderers[r.view];
      if (renderer) renderer(targetPane, r);
    } else if (r.view === "library") {
      // Refresh library database lists in-place
      const renderer = renderers.library;
      if (renderer) renderer(targetPane, r);
    }
    return;
  }

  // Dynamic non-persisted routes (reader, series, cache)
  for (const pane of persistentPanes.values()) {
    pane.style.display = "none";
  }

  state.dispose?.();
  state.dispose = null;

  // Remove any previous dynamic nodes
  const dynamicNodes = Array.from(view.children).filter(
    (el) => el.id !== "ds-pane-browse" && el.id !== "ds-pane-library"
  );
  for (const node of dynamicNodes) {
    node.remove();
  }

  const dynamicContainer = document.createElement("div");
  dynamicContainer.id = "ds-pane-dynamic";
  view.appendChild(dynamicContainer);

  const renderer = renderers[r.view];
  const cleanup = renderer ? renderer(dynamicContainer, r) : undefined;
  if (typeof cleanup === "function") state.dispose = cleanup;
}

/** History stack for backward / forward navigation. */
const historyBackStack: Route[] = [];
const historyForwardStack: Route[] = [];
let isNavigatingHistory = false;

/** Returns true if there is at least one previous route to go back to. */
export function canGoBack(): boolean {
  return historyBackStack.length > 0;
}

/** Returns true if there is at least one route to go forward to. */
export function canGoForward(): boolean {
  return historyForwardStack.length > 0;
}

/** Navigates back one step in history stack. */
export function goBack(): void {
  if (historyBackStack.length === 0) return;
  const prevRoute = historyBackStack.pop()!;
  historyForwardStack.push({ ...state.route });
  isNavigatingHistory = true;
  navigate(prevRoute);
  isNavigatingHistory = false;
}

/** Navigates forward one step in history stack. */
export function goForward(): void {
  if (historyForwardStack.length === 0) return;
  const nextRoute = historyForwardStack.pop()!;
  historyBackStack.push({ ...state.route });
  isNavigatingHistory = true;
  navigate(nextRoute);
  isNavigatingHistory = false;
}

/** Checks if two routes represent the exact same view and target. */
export function isSameRoute(a: Route, b: Route): boolean {
  if (a.view !== b.view) return false;
  if (a.view === "reader") {
    return a.chapterPermalink === b.chapterPermalink;
  }
  if (a.view === "series") {
    return a.seriesPermalink === b.seriesPermalink;
  }
  if (a.view === "browse") {
    return (a.browseTab ?? "releases") === (b.browseTab ?? "releases");
  }
  if (a.view === "library") {
    return a.collectionId === b.collectionId;
  }
  return true;
}

/** Updates the top bar history arrows state. */
export function updateHistoryButtonsUI(): void {
  const backBtn = document.getElementById("ds-nav-back") as HTMLButtonElement | null;
  const forwardBtn = document.getElementById("ds-nav-forward") as HTMLButtonElement | null;
  if (backBtn) backBtn.disabled = !canGoBack();
  if (forwardBtn) forwardBtn.disabled = !canGoForward();
}

/** Navigates to a new route and updates the ephemeral session manga tab if entering a manga/chapter. */
export function navigate(r: Route): void {
  if (r.view === "reader" || r.view === "series") {
    const title = r.seriesName || r.chapterTitle || (r.view === "series" ? "Series" : "Reader");
    state.lastMangaTab = {
      title,
      route: { ...r },
    };
  }

  // If already at the exact same route/chapter, do not destroy and rebuild the view
  if (isSameRoute(state.route, r)) {
    updateSessionMangaTabUI();
    updateHistoryButtonsUI();
    return;
  }

  // Track in history stack if this is a fresh user navigation
  if (!isNavigatingHistory) {
    historyBackStack.push({ ...state.route });
    // Clear forward history on new branch
    historyForwardStack.length = 0;
  }

  state.route = r;
  for (const hook of routeChangeHooks) hook(r.view);
  renderCurrent();
  updateHistoryButtonsUI();
}

/** Closes the ephemeral session manga tab. */
export function closeSessionMangaTab(): void {
  state.lastMangaTab = null;
  updateSessionMangaTabUI();
  if (state.route.view === "reader" || state.route.view === "series") {
    navigate({ view: "browse" });
  }
}

/** Updates the session manga tab element in the top bar. */
export function updateSessionMangaTabUI(): void {
  const container = document.getElementById("ds-session-tab-wrap");
  if (!container) return;
  container.innerHTML = "";

  if (!state.lastMangaTab) {
    container.style.display = "none";
    return;
  }

  container.style.display = "inline-flex";

  const tab = document.createElement("button");
  tab.type = "button";
  const isActive = state.route.view === "reader" || state.route.view === "series";
  tab.className = `win-button ds-nav-tab ds-session-tab${isActive ? " active" : ""}`;
  tab.style.cssText =
    "display:inline-flex;align-items:center;gap:6px;max-width:220px;padding:2px 8px;font-size:11px;";

  const icon = document.createElement("i");
  icon.className = "bi bi-book-half";
  tab.appendChild(icon);

  const titleSpan = document.createElement("span");
  titleSpan.className = "ds-truncate";
  titleSpan.textContent = decodeEntities(state.lastMangaTab.title);
  tab.appendChild(titleSpan);

  const closeBtn = document.createElement("i");
  closeBtn.className = "bi bi-x";
  closeBtn.title = "Close tab";
  closeBtn.style.cssText = "cursor:pointer;font-size:13px;opacity:0.75;padding:0 2px;";
  closeBtn.addEventListener("mouseover", () => {
    closeBtn.style.opacity = "1";
  });
  closeBtn.addEventListener("mouseout", () => {
    closeBtn.style.opacity = "0.75";
  });
  closeBtn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    closeSessionMangaTab();
  });
  tab.appendChild(closeBtn);

  tab.addEventListener("click", () => {
    if (state.lastMangaTab) {
      navigate(state.lastMangaTab.route);
    }
  });

  container.appendChild(tab);
}

/** Site title shown in the plugin top bar. */
export function routeTitle(r: Route): string {
  switch (r.view) {
    case "browse":
      return "Browse";
    case "series":
      return r.seriesName ?? "Series";
    case "reader":
      return r.chapterTitle ?? "Reader";
    case "cache":
      return "Cache Management";
    default:
      return "Library";
  }
}