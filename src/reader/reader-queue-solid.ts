import { absUrl } from "../stores";
import { fileResolve, httpDownloadFull, pageOutputPath } from "../api";
import { setCachedPage } from "../db";
import type { ChapterPage } from "../types/api";

export type SlotStateKind = "spinner" | "offline" | "error" | "idle";

/**
 * The host a `ReaderQueue` drives: a Solid `ReaderSession`. Downloads update
 * reactive cache/slot state through the host instead of mutating DOM slots
 * directly, so the JSX slot components re-render on their own.
 */
export interface ReaderQueueHost {
  getPages(): ChapterPage[];
  permalink: string;
  getSeriesPermalink(): string | null;
  getCurrentIndex(): number;
  isDisposed(): boolean;
  getCachedPath(index: number): string | undefined;
  setCachedPath(index: number, path: string): void;
  setSlotState(index: number, kind: SlotStateKind, message: string): void;
  showErrorBanner(message: string): void;
}

/**
 * Bounded page download pool for a single chapter session.
 *
 * Every page is fetched exactly once via `HttpDownload` (written to
 * `.curator/plugin_data/dynasty-scans/pages/` and indexed in `cached_pages`),
 * then rendered from disk through `convertFileSrc`. A small concurrency cap
 * keeps the request rate polite while overlapping downloads for a 30-60 page
 * chapter (the priority-sorted queue keeps order sensible).
 */
export class ReaderQueue {
  private static readonly MAX_CONCURRENT = 3;
  private readonly queue: number[] = [];
  private readonly inFlight = new Set<number>();
  private readonly retrying = new Set<number>();
  private readonly failed = new Set<number>();
  private firstErrorShown = false;

  constructor(private readonly c: ReaderQueueHost) {}

  get failedSet(): Set<number> {
    return this.failed;
  }

  isFailed(index: number): boolean {
    return this.failed.has(index);
  }

  clearFailed(index: number): void {
    this.failed.delete(index);
  }

  isRetrying(index: number): boolean {
    return this.retrying.has(index);
  }

  markRetrying(index: number): void {
    this.retrying.add(index);
  }

  /** Marks a page as needing a (re)download. Priorities jump to the queue head. */
  enqueue(index: number, priority = false): void {
    const pages = this.c.getPages();
    if (index < 0 || index >= pages.length) return;
    if (this.inFlight.has(index) || this.failed.has(index)) return;
    if (!this.queue.includes(index)) {
      if (priority) {
        this.queue.unshift(index);
      } else {
        this.queue.push(index);
      }
    }
    // Keep queue sorted by proximity to the user's reading position
    const current = this.c.getCurrentIndex();
    this.queue.sort((a, b) => {
      const distA = Math.abs(a - current) + (a < current ? 1000 : 0);
      const distB = Math.abs(b - current) + (b < current ? 1000 : 0);
      return distA - distB;
    });
    this.pump();
  }

  private pump(): void {
    while (this.inFlight.size < ReaderQueue.MAX_CONCURRENT && this.queue.length > 0) {
      const idx = this.queue.shift() as number;
      if (this.inFlight.has(idx)) continue;
      this.inFlight.add(idx);
      void this.downloadPage(idx).finally(() => {
        this.inFlight.delete(idx);
        this.pump();
      });
    }
  }

  private async downloadPage(index: number): Promise<void> {
    const c = this.c;
    const pages = c.getPages();
    const page = pages[index];
    if (!page) return;
    const outPath = pageOutputPath(c.getSeriesPermalink() ?? "", c.permalink, index, page.url);
    try {
      // If the file already exists at the canonical path, skip the network entirely
      const existing = await fileResolve(outPath);
      let absPath: string;
      let sizeBytes = 0;
      if (existing) {
        absPath = existing;
      } else {
        const res = await httpDownloadFull(absUrl(page.url), outPath);
        absPath = res.absolutePath;
        sizeBytes = res.sizeBytes;
      }
      await setCachedPage(c.permalink, index, absPath, sizeBytes);
      c.setCachedPath(index, absPath);
    } catch (err) {
      if (c.isDisposed()) return;
      this.failed.add(index);
      const msg = err instanceof Error ? err.message : String(err);
      c.setSlotState(index, "error", `Download failed: ${msg}`);
      if (!this.firstErrorShown) {
        this.firstErrorShown = true;
        c.showErrorBanner(
          `Page download failed (page ${index + 1} of ${pages.length}). Use the slot's Retry.`,
        );
      }
    }
  }
}
