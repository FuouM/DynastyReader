/**
 * Reactive store barrel for the dynasty-scans plugin.
 * Exports views, router, theme, topbar, and utility state stores.
 */

import { createConnectivitySignal } from "@solid-primitives/connectivity";

export { SITE_ROOT, DB_NAME, APP_VERSION, PAGES_PREFIX, COVERS_PREFIX } from "../constants";
export { absUrl, dynastyUrl } from "../utils/url";


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
  actions,
  setActions,
  showBanner,
  hideBanner,
} from "./topbar";

export { theme, setTheme, toggleTheme, initAppTheme, THEME_CHANGE_EVENT, THEME_REGISTRY } from "./theme";
export type { AppTheme } from "./theme";
export {
  accentColor,
  setAccentColor,
  initAccentColor,
  ACCENT_COLOR_PRESETS,
  getContrastText,
} from "./accent-color";
export { uiScale, setUiScale } from "./ui-scale";
export { isMobile, isAndroid, uiMode, setUiMode } from "./platform";
export type { UiMode } from "./platform";

export {
  activeDownloadCount,
  downloadSpeedBps,
  activeSeriesName,
  activeChapterName,
  formatDownloadSpeed,
  initGlobalDownloadListener,
} from "./download";

/** Reactive signal for whether the webview has a network connection. */
export const isOnline = createConnectivitySignal();
