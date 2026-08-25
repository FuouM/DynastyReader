import { createSignal, type Accessor } from "solid-js";

export type UiMode = "auto" | "desktop" | "mobile";

const MOBILE_MEDIA_QUERY = "(max-width: 680px)";

const getSavedUiMode = (): UiMode => {
  if (typeof localStorage === "undefined") return "auto";
  const saved = localStorage.getItem("ds-ui-mode");
  if (saved === "desktop" || saved === "mobile" || saved === "auto") {
    return saved;
  }
  return "auto";
};

const [uiModeSignal, setUiModeSignal] = createSignal<UiMode>(getSavedUiMode());
const [matchesMediaQuery, setMatchesMediaQuery] = createSignal<boolean>(
  typeof window !== "undefined"
    ? window.matchMedia(MOBILE_MEDIA_QUERY).matches
    : false,
);

if (typeof window !== "undefined") {
  const mq = window.matchMedia(MOBILE_MEDIA_QUERY);
  const update = (e: MediaQueryListEvent | MediaQueryList) => {
    setMatchesMediaQuery(e.matches);
  };
  if (typeof mq.addEventListener === "function") {
    mq.addEventListener("change", update);
  }
}

export const uiMode: Accessor<UiMode> = uiModeSignal;

export const setUiMode = (mode: UiMode): void => {
  setUiModeSignal(mode);
  if (typeof localStorage !== "undefined") {
    localStorage.setItem("ds-ui-mode", mode);
  }
};

export const isMobile: Accessor<boolean> = () => {
  const mode = uiModeSignal();
  if (mode === "mobile") return true;
  if (mode === "desktop") return false;
  return matchesMediaQuery();
};
