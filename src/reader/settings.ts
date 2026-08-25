/**
 * Reader session settings persisted to localStorage.
 *
 * Extracted out of `reader-controller.ts` so `reader-viewport.ts` (which also
 * reads these during render) does not need to import from the controller,
 * breaking the controller ↔ viewport import cycle.
 */
import { isMobile } from "../stores";
import type { FitMode, ReaderMode, PagedLayout } from "../types/reader";

const getBool = (key: string, def = true): boolean => {
  const val = localStorage.getItem(key);
  return val === null ? def : val === "1" || val === "true";
};
const setBool = (key: string, val: boolean): void => localStorage.setItem(key, val ? "1" : "0");

export const isAutoCacheChapterEnabled = (): boolean => {
  const val = localStorage.getItem("ds-auto-cache-chapter");
  if (val === null) return !isMobile();
  return val === "1" || val === "true";
};
export const setAutoCacheChapterEnabled = (enabled: boolean): void => setBool("ds-auto-cache-chapter", enabled);

export function getPrefetchBuffer(): number {
  const val = localStorage.getItem("ds-reader-prefetch");
  if (val === null) return isMobile() ? 3 : 0;
  const num = parseInt(val, 10);
  return isNaN(num) ? 0 : Math.max(0, Math.min(10, num));
}

export function setPrefetchBuffer(count: number): void {
  localStorage.setItem("ds-reader-prefetch", String(Math.max(0, Math.min(10, count))));
}

export type ReaderNavPosition = "top" | "bottom";
export type ReadingDirectionSetting = "auto" | "rtl" | "ltr";

export function getDefaultReaderMode(): ReaderMode {
  return localStorage.getItem("ds-reader-mode") === "paged" ? "paged" : "scroll";
}

export function setDefaultReaderMode(mode: ReaderMode): void {
  localStorage.setItem("ds-reader-mode", mode);
}

export function getDefaultPagedLayout(): PagedLayout {
  return localStorage.getItem("ds-reader-layout") === "spread" ? "spread" : "single";
}

export function setDefaultPagedLayout(layout: PagedLayout): void {
  localStorage.setItem("ds-reader-layout", layout);
}

export const isLongStripSpreadOverrideEnabled = (): boolean => getBool("ds-reader-long-strip-override", true);
export const setLongStripSpreadOverrideEnabled = (enabled: boolean): void => setBool("ds-reader-long-strip-override", enabled);

export const isLongStripFitWidthEnabled = (): boolean => getBool("ds-reader-long-strip-fit-width", true);
export const setLongStripFitWidthEnabled = (enabled: boolean): void => setBool("ds-reader-long-strip-fit-width", enabled);

export function getDefaultReadingDirection(): ReadingDirectionSetting {
  const val = localStorage.getItem("ds-reader-direction-mode") ?? localStorage.getItem("ds-reader-direction");
  if (val === "ltr" || val === "rtl" || val === "auto") return val;
  return "auto";
}

export function setDefaultReadingDirection(dir: ReadingDirectionSetting): void {
  localStorage.setItem("ds-reader-direction-mode", dir);
  if (dir === "ltr" || dir === "rtl") {
    localStorage.setItem("ds-reader-direction", dir);
  } else {
    localStorage.removeItem("ds-reader-direction");
  }
}

export const isCoverOffsetDefaultEnabled = (): boolean => getBool("ds-reader-cover-offset", false);
export const setCoverOffsetDefaultEnabled = (enabled: boolean): void => setBool("ds-reader-cover-offset", enabled);

export function getDefaultFitMode(): FitMode {
  const val = localStorage.getItem("ds-reader-fit");
  if (val === "height" || val === "original") return val;
  return "width";
}

export function setDefaultFitMode(fit: FitMode): void {
  localStorage.setItem("ds-reader-fit", fit);
}

export function getReaderNavPosition(): ReaderNavPosition {
  const val = localStorage.getItem("ds-reader-nav-position");
  return val === "bottom" ? "bottom" : "top";
}

export function setReaderNavPosition(pos: ReaderNavPosition): void {
  localStorage.setItem("ds-reader-nav-position", pos);
  window.dispatchEvent(new CustomEvent("ds-reader-nav-pos-change", { detail: pos }));
}

export type PrevChapterStartPage = "first" | "last";

export function getPrevChapterStartPage(): PrevChapterStartPage {
  const val = localStorage.getItem("ds-reader-prev-chapter-page");
  return val === "last" ? "last" : "first";
}

export function setPrevChapterStartPage(page: PrevChapterStartPage): void {
  localStorage.setItem("ds-reader-prev-chapter-page", page);
}