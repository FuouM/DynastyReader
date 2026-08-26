import { type Accessor } from "solid-js";
import { createMediaQuery } from "@solid-primitives/media";
import { persistedSignal } from "../lib/persisted-signal";

export type UiMode = "auto" | "desktop" | "mobile";

const MOBILE_MEDIA_QUERY = "(max-width: 680px), (max-height: 550px) and (orientation: landscape), ((pointer: coarse) and (max-width: 1024px))";

const isNativeMobileDevice = (): boolean => {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /Android|iPhone|iPad|iPod|Mobile|Silk/i.test(ua);
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
  return isNativeMobileDevice() || matchesMediaQuery();
};
