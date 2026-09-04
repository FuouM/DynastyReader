/**
 * Cross-platform status bar utility for DynastyReader.
 *
 * Controls the Android system status bar (immersive mode) via AndroidThemeBridge
 * when running on Android, with safe no-op fallback on other platforms.
 */
import { log } from "./log";

declare global {
  interface AndroidThemeBridge {
    setStatusBarVisible?(visible: boolean): void;
    setStatusBarHidden?(hidden: boolean): void;
  }
}

/**
 * Sets the visibility of the Android system status bar.
 * Safe no-op on non-Android platforms.
 */
export function setAndroidStatusBarVisible(visible: boolean): void {
  if (typeof window !== "undefined" && window.AndroidThemeBridge) {
    try {
      if (typeof window.AndroidThemeBridge.setStatusBarVisible === "function") {
        window.AndroidThemeBridge.setStatusBarVisible(visible);
      } else if (typeof window.AndroidThemeBridge.setStatusBarHidden === "function") {
        window.AndroidThemeBridge.setStatusBarHidden(!visible);
      }
    } catch (err) {
      log.debug("status-bar", "setAndroidStatusBarVisible failed:", err);
    }
  }
}

/**
 * Synchronizes the Android system status bar with the current view state and reader setting.
 * When in reader mode and the hide-status-bar setting is enabled, the status bar is hidden.
 * When leaving reader mode or when the setting is disabled, the status bar is made visible.
 */
export function syncReaderStatusBar(isInReader: boolean, hideStatusBarPref: boolean): void {
  const shouldHide = isInReader && hideStatusBarPref;
  setAndroidStatusBarVisible(!shouldHide);
}
