import { type Accessor } from "solid-js";
import { createMediaQuery } from "@solid-primitives/media";
import { createConnectivitySignal } from "@solid-primitives/connectivity";
import { persistedSignal } from "../lib/persisted-signal";

export type UiMode = "auto" | "desktop" | "mobile";

const MOBILE_MEDIA_QUERY = "(max-width: 768px), (max-height: 550px) and (orientation: landscape), ((pointer: coarse) and (max-width: 1024px)), ((any-pointer: coarse) and (max-width: 1024px))";

const isNativeMobileDevice = (): boolean => {
  if (typeof window !== "undefined" && "AndroidThemeBridge" in window && Boolean(window.AndroidThemeBridge)) {
    return true;
  }
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const isIPad = /Macintosh/i.test(ua) && (navigator.maxTouchPoints ?? 0) > 1;
  return /Android|iPhone|iPad|iPod|Mobile|Silk|BlackBerry|Opera Mini|IEMobile/i.test(ua) || isIPad;
};
export const isAndroid = (): boolean => {
  if (typeof window !== "undefined" && "AndroidThemeBridge" in window && Boolean(window.AndroidThemeBridge)) {
    return true;
  }
  if (typeof navigator === "undefined") return false;
  return /Android/i.test(navigator.userAgent || "");
};


const [uiModeSignal, setUiModeSignal] = persistedSignal<UiMode>("auto", {
  name: "ds-ui-mode",
  deserialize: (v) => (v === "desktop" || v === "mobile" || v === "auto") ? v : "auto",
});

const matchesMediaQuery = createMediaQuery(MOBILE_MEDIA_QUERY);

export const uiMode: Accessor<UiMode> = uiModeSignal;

export const setUiMode = (mode: UiMode): void => {
  setUiModeSignal(mode);
};

export const isMobile: Accessor<boolean> = () => {
  const mode = uiModeSignal();
  if (mode === "mobile") return true;
  if (mode === "desktop") return false;
  const native = isNativeMobileDevice();
  const mq = matchesMediaQuery();
  const narrow = typeof window !== "undefined" && (window.innerWidth <= 768 || (window.innerHeight <= 550 && window.innerWidth <= 1024));
  return native || mq || narrow;
};

/** Reactive signal for whether the webview has a network connection. */
export const isOnline = createConnectivitySignal();
