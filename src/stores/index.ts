/**
 * Reactive store barrel for the dynasty-scans plugin.
 * Exports views, router, theme, topbar, and utility state stores.
 */

import { createConnectivitySignal } from "@solid-primitives/connectivity";

export const SITE_ROOT = "https://dynasty-scans.com";
export const DB_NAME = "dynasty_reader.db";

export const APP_VERSION = "0.3.1";

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
  hideBanner,
  clearBanner,
  clearActions,
} from "./topbar";

export { theme, setTheme, toggleTheme, initAppTheme, THEME_CHANGE_EVENT } from "./theme";
export type { AppTheme } from "./theme";

export { uiScale, setUiScale, applyUiScale } from "./ui-scale";

export { isMobile, uiMode, setUiMode } from "./platform";
export type { UiMode } from "./platform";


/** Reactive signal for whether the webview has a network connection. */
export const isOnline = createConnectivitySignal();

/** Absolute URL from a possibly-relative site path (e.g. `/system/.../01.webp`). */
export function absUrl(u: string): string {
  if (/^https?:\/\//i.test(u)) return u;
  return SITE_ROOT + u;
}
