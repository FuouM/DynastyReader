/**
 * Reactive router store for the dynasty-scans plugin (Solid port).
 *
 * Replaces the imperative `src/router.ts` module-scope `state` object and the
 * DOM-driven `renderCurrent`/`renderers` machinery with fine-grained signals.
 * History semantics (back/forward stacks, branch clearing, same-route no-op,
 * session manga tab) are ported verbatim from `router.ts`.
 */

import { createSignal } from "solid-js";
import { clearActions } from "./topbar";
import { decodeEntities } from "../utils/html";
import type { Route, SessionMangaTab } from "../types/routes";
export type { Route, ViewName, ChapterRef, SessionMangaTab } from "../types/routes";

export const [route, setRoute] = createSignal<Route>({ view: "browse" });
export const [historyBackStack, setHistoryBackStack] = createSignal<Route[]>([]);
export const [historyForwardStack, setHistoryForwardStack] = createSignal<Route[]>([]);
export const [sessionTab, setSessionTab] = createSignal<SessionMangaTab | null>(null);
export const [dbReady, setDbReady] = createSignal(false);

export const canGoBack = () => historyBackStack().length > 0;
export const canGoForward = () => historyForwardStack().length > 0;

/** True when the current route is one of the persistent panes (Browse/Library). */
export const isPersistentView = () => {
  const v = route().view;
  return v === "browse" || v === "library";
};

/** True when the current route is inside a manga view (reader or series). */
export const isInMangaView = () => {
  const v = route().view;
  return v === "reader" || v === "series";
};

let isNavigatingHistory = false;

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

/** Navigates to a new route and updates the ephemeral session manga tab if entering a manga/chapter. */
export function navigate(r: Route): void {
  if (r.view === "reader" || r.view === "series") {
    const title = r.seriesName || r.chapterTitle || (r.view === "series" ? "Series" : "Reader");
    setSessionTab({
      title,
      route: { ...r },
    });
  }

  // If already at the exact same route/chapter, do not destroy and rebuild the view
  if (isSameRoute(route(), r)) {
    return;
  }

  // Clear actions before switching routes
  clearActions();

  // Track in history stack if this is a fresh user navigation
  if (!isNavigatingHistory) {
    setHistoryBackStack((s) => [...s, { ...route() }]);
    // Clear forward history on new branch
    setHistoryForwardStack([]);
  }

  setRoute(r);
}

/** Navigates back one step in history stack. */
export function goBack(): void {
  const back = historyBackStack();
  if (back.length === 0) return;
  goBackTo(back.length - 1);
}

/** Navigates back to a specific entry in the back stack by index. */
export function goBackTo(index: number): void {
  const back = historyBackStack();
  if (index < 0 || index >= back.length) return;
  const targetRoute = back[index];
  const popped = back.slice(index + 1);
  const remaining = back.slice(0, index);
  setHistoryBackStack(remaining);
  setHistoryForwardStack((s) => [...s, { ...route() }, ...popped.reverse()]);
  isNavigatingHistory = true;
  navigate(targetRoute);
  isNavigatingHistory = false;
}

/** Navigates forward one step in history stack. */
export function goForward(): void {
  const forward = historyForwardStack();
  if (forward.length === 0) return;
  goForwardTo(forward.length - 1);
}

/** Navigates forward to a specific entry in the forward stack by index. */
export function goForwardTo(index: number): void {
  const forward = historyForwardStack();
  if (index < 0 || index >= forward.length) return;
  const targetRoute = forward[index];
  const remaining = forward.slice(0, index);
  const popped = forward.slice(index + 1);
  setHistoryForwardStack(remaining);
  setHistoryBackStack((s) => [...s, { ...route() }, ...popped.reverse()]);
  isNavigatingHistory = true;
  navigate(targetRoute);
  isNavigatingHistory = false;
}

/** Closes the ephemeral session manga tab. */
export function closeSessionMangaTab(): void {
  setSessionTab(null);
  const v = route().view;
  if (v === "reader" || v === "series") {
    navigate({ view: "browse" });
  }
}

export interface RouteLabel {
  title: string;
  subtitle?: string;
  icon: string;
}

/** Single route-label taxonomy: title, optional subtitle, and icon per view. */
export function routeLabel(r: Route): RouteLabel {
  switch (r.view) {
    case "browse": {
      const tab = r.browseTab || "releases";
      const tabNames: Record<string, string> = {
        releases: "Recent Releases",
        added: "Recently Added",
        downloaded: "Downloaded",
        "series-dir": "Series Directory",
        "tags-dir": "Tags Directory",
        search: "Tag & Search",
      };
      return {
        title: tabNames[tab] || "Browse",
        subtitle: "Browse",
        icon: "bi-compass",
      };
    }
    case "library":
      return {
        title: r.collectionId !== undefined ? "Collection Detail" : "Library",
        subtitle: "Library",
        icon: "bi-collection",
      };
    case "series":
      return {
        title: decodeEntities(r.seriesName || r.seriesPermalink || "Series"),
        subtitle: "Series",
        icon: "bi-collection-play",
      };
    case "reader":
      return {
        title: decodeEntities(r.chapterTitle || r.chapterPermalink || "Reader"),
        subtitle: r.seriesName ? decodeEntities(r.seriesName) : "Chapter",
        icon: "bi-book",
      };
    case "cache":
      return {
        title: "Cache Management",
        icon: "bi-hdd-stack",
      };
    case "blacklist":
      return {
        title: "Series Blacklist",
        icon: "bi-shield-slash",
      };
    default:
      return {
        title: "Unknown",
        icon: "bi-link-45deg",
      };
  }
}

/** Site title shown in the plugin top bar. */
export function routeTitle(r: Route): string {
  if (r.view === "browse") return "Browse";
  return routeLabel(r).title;
}