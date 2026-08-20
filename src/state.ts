/**
 * Thin re-export barrel for the dynasty-scans plugin.
 *
 * Preserves the historic public import surface (views import `navigate`,
 * `setBanner`, `decodeEntities`, … from `./state`) while the implementations
 * now live in focused modules: `router.ts`, `topbar.ts`, and `tags.ts`.
 */

export const TAB_ID = "dynasty-scans" as const;
export const SITE_ROOT = "https://dynasty-scans.com";
export const DB_NAME = "dynasty_reader.db";

/** Relative path prefix (backend-side convention) under the portable data root. */
export const PAGES_PREFIX = "pages";
export const COVERS_PREFIX = "covers";

export {
  navigate,
  goBack,
  goForward,
  canGoBack,
  canGoForward,
  closeSessionMangaTab,
  routeTitle,
} from "./stores/router";
export type { Route, ViewName, ChapterRef, SessionMangaTab } from "./stores/router";

export { setTitle, setBanner, setActions, clearBanner, clearActions } from "./stores/topbar";

export { tagClass, sortTagsByCategory } from "./tags";

/** Returns true when the webview believes it has a network connection. */
export function isOnline(): boolean {
  return typeof navigator !== "undefined" ? navigator.onLine : true;
}

/** Absolute URL from a possibly-relative site path (e.g. `/system/.../01.webp`). */
export function absUrl(u: string): string {
  if (/^https?:\/\//i.test(u)) return u;
  return SITE_ROOT + u;
}

export { formatBytes } from "./lib";
export { decodeEntities, esc, safeHtml } from "./utils/html";
export { formatDate, formatDateTime } from "./utils/formatting";