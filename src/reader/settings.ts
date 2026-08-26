/**
 * Reader session settings persisted to localStorage.
 *
 * Extracted out of `reader-controller.ts` so `reader-viewport.ts` (which also
 * reads these during render) does not need to import from the controller,
 * breaking the controller ↔ viewport import cycle.
 */
import { isMobile } from "../stores";
import { persistedSignal } from "../lib/persisted-signal";
import type { FitMode, ReaderMode, PagedLayout } from "../types/reader";

export type ReaderNavPosition = "top" | "bottom";
export type ReadingDirectionSetting = "auto" | "rtl" | "ltr";
export type PrevChapterStartPage = "first" | "last";

const boolDeserialize = (v: string) => v === "true" || v === "1";

// Auto-cache chapter
const [isAutoCacheChapterEnabled, setAutoCache] = persistedSignal(!isMobile(), {
  name: "ds-auto-cache-chapter",
  serialize: String,
  deserialize: boolDeserialize,
});
export { isAutoCacheChapterEnabled, setAutoCache as setAutoCacheChapterEnabled };

// Prefetch buffer
const [getPrefetchBuffer, _setPrefetch] = persistedSignal(isMobile() ? 3 : 0, {
  name: "ds-reader-prefetch",
  serialize: String,
  deserialize: (v) => Math.max(0, Math.min(10, parseInt(v, 10) || 0)),
});
export { getPrefetchBuffer };
export const setPrefetchBuffer = (count: number) => _setPrefetch(Math.max(0, Math.min(10, count)));

// Reader mode
const [getDefaultReaderMode, setDefaultReaderMode] = persistedSignal<ReaderMode>("scroll", {
  name: "ds-reader-mode",
  deserialize: (v) => v === "paged" ? "paged" : "scroll",
});
export { getDefaultReaderMode, setDefaultReaderMode };

// Paged layout
const [getDefaultPagedLayout, setDefaultPagedLayout] = persistedSignal<PagedLayout>("single", {
  name: "ds-reader-layout",
  deserialize: (v) => v === "spread" ? "spread" : "single",
});
export { getDefaultPagedLayout, setDefaultPagedLayout };

// Long strip spread override
const [isLongStripSpreadOverrideEnabled, setLongStripSpreadOverrideEnabled] = persistedSignal(true, {
  name: "ds-reader-long-strip-override",
  serialize: String,
  deserialize: boolDeserialize,
});
export { isLongStripSpreadOverrideEnabled, setLongStripSpreadOverrideEnabled };

// Long strip fit width
const [isLongStripFitWidthEnabled, setLongStripFitWidthEnabled] = persistedSignal(true, {
  name: "ds-reader-long-strip-fit-width",
  serialize: String,
  deserialize: boolDeserialize,
});
export { isLongStripFitWidthEnabled, setLongStripFitWidthEnabled };

// Reading direction (with legacy key migration)
const [getDefaultReadingDirection, setDefaultReadingDirection] = persistedSignal<ReadingDirectionSetting>("auto", {
  name: "ds-reader-direction-mode",
  deserialize: (v) => {
    if (v === "ltr" || v === "rtl" || v === "auto") return v;
    try {
      const legacy = localStorage.getItem("ds-reader-direction");
      if (legacy === "ltr" || legacy === "rtl") return legacy;
    } catch (err) {
      console.debug("[settings] legacy direction read failed:", err);
    }
    return "auto";
  },
});
export { getDefaultReadingDirection, setDefaultReadingDirection };
// Cover offset
const [isCoverOffsetDefaultEnabled, setCoverOffsetDefaultEnabled] = persistedSignal(false, {
  name: "ds-reader-cover-offset",
  serialize: String,
  deserialize: boolDeserialize,
});
export { isCoverOffsetDefaultEnabled, setCoverOffsetDefaultEnabled };

// Fit mode
const [getDefaultFitMode, setDefaultFitMode] = persistedSignal<FitMode>("width", {
  name: "ds-reader-fit",
  deserialize: (v) => (v === "height" || v === "original") ? v : "width",
});
export { getDefaultFitMode, setDefaultFitMode };

// Nav position
const [getReaderNavPosition, _setNavPos] = persistedSignal<ReaderNavPosition>("top", {
  name: "ds-reader-nav-position",
  deserialize: (v) => v === "bottom" ? "bottom" : "top",
});
export { getReaderNavPosition };
export const setReaderNavPosition = (pos: ReaderNavPosition) => {
  _setNavPos(pos);
  window.dispatchEvent(new CustomEvent("ds-reader-nav-pos-change", { detail: pos }));
};

// Prev chapter start page
const [getPrevChapterStartPage, setPrevChapterStartPage] = persistedSignal<PrevChapterStartPage>("first", {
  name: "ds-reader-prev-chapter-page",
  deserialize: (v) => v === "last" ? "last" : "first",
});
export { getPrevChapterStartPage, setPrevChapterStartPage };

// Scroll lock
const [getScrollLock, setScrollLock] = persistedSignal(false, {
  name: "ds-reader-scroll-lock",
  serialize: String,
  deserialize: (v) => v === "true" || v === "1",
});
export { getScrollLock, setScrollLock };

// Mobile gestures on desktop (tap-to-turn, drag pull overscroll)
const [isMobileGesturesOnDesktopEnabled, setMobileGesturesOnDesktopEnabled] = persistedSignal(false, {
  name: "ds-reader-mobile-gestures-desktop",
  serialize: String,
  deserialize: boolDeserialize,
});
export { isMobileGesturesOnDesktopEnabled, setMobileGesturesOnDesktopEnabled };
