/**
 * Reader subsystem types: fit modes, layout modes, themes, and download tasks.
 */

export type FitMode = "width" | "height" | "original";

export type ReaderMode = "scroll" | "paged";

/** How many pages each Paged-mode slide shows. */
export type PagedLayout = "single" | "spread";

export type ReadingDirection = "rtl" | "ltr";

/** One slide in spread layout: a cover standalone, a wide scan, or a page pair. */
export interface SpreadGroup {
  spreadIndex: number;
  pageIndices: number[];
  isStandaloneCover: boolean;
  isWide: boolean;
}

export interface PageDownloadTask {
  index: number;
  url: string;
  outputPath: string;
}

export interface ViewportState {
  currentIndex: number;
  pageTotal: number;
  cachedCount: number;
}

export interface PageSlot {
  index: number;
  el: HTMLElement;
}

export type SlotRenderKind = "spinner" | "offline" | "error";
