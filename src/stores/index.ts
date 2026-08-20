/**
 * Reactive store barrel for the dynasty-scans plugin (Solid port).
 *
 * Replaces the old `src/state.ts` import surface for the Solid world: views and
 * components import their stores/constants/helpers from `./stores` while the
 * legacy modules keep importing `./state` (which still resolves to the old
 * `src/state.ts` until the flip). Helpers that were re-exported by the old
 * barrel are re-exported here so the public surface stays identical.
 */

export const TAB_ID = "dynasty-scans" as const;
export const SITE_ROOT = "https://dynasty-scans.com";
export const DB_NAME = "dynasty_reader.db";

/** Relative path prefix (backend-side convention) under the portable data root. */
export const PAGES_PREFIX = "pages";
export const COVERS_PREFIX = "covers";

export {
  route,
  setRoute,
  historyBackStack,
  historyForwardStack,
  sessionTab,
  setSessionTab,
  dbReady,
  setDbReady,
  canGoBack,
  canGoForward,
  isPersistentView,
  isInMangaView,
  navigate,
  goBack,
  goBackTo,
  goForward,
  goForwardTo,
  isSameRoute,
  closeSessionMangaTab,
  routeTitle,
  routeLabel,
} from "./router";
export type { Route, ViewName, ChapterRef, SessionMangaTab, RouteLabel } from "./router";

export {
  title,
  setTitle,
  banner,
  setBanner,
  actions,
  setActions,
  showBanner,
  clearBanner,
  clearActions,
} from "./topbar";

export { theme, setTheme, toggleTheme, initAppTheme, THEME_CHANGE_EVENT } from "./theme";
export type { AppTheme } from "./theme";

export { uiScale, setUiScale, applyUiScale } from "./ui-scale";

export { tagClass, sortTagsByCategory } from "../tags";

/** Returns true when the webview believes it has a network connection. */
export function isOnline(): boolean {
  return typeof navigator !== "undefined" ? navigator.onLine : true;
}

/** Absolute URL from a possibly-relative site path (e.g. `/system/.../01.webp`). */
export function absUrl(u: string): string {
  if (/^https?:\/\//i.test(u)) return u;
  return SITE_ROOT + u;
}

export { formatBytes } from "../lib";
export { decodeEntities, esc, safeHtml } from "../utils/html";
export { formatDate, formatDateTime } from "../utils/formatting";