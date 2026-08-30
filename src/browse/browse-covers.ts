import { createSignal } from "solid-js";
import { persistedSignal } from "../lib/persisted-signal";
import { getBatchCached, deleteCached } from "../db";
import { log } from "../utils/log";
import { isSeriesKind, isDoujinTag, getChapterContainerTag } from "../taxonomy";
import { CoverMemoryCache, MAX_MEMORY_CACHE, type CoverState } from "./browse-covers-memory-cache";
import { CoverHydrationPipeline, type CoverTarget, type ItemCoverInfo } from "./browse-covers-hydration";

export type { CoverState } from "./browse-covers-memory-cache";
export type { CoverTarget, ItemCoverInfo } from "./browse-covers-hydration";

/**
 * Module-level reactive signal that mirrors `BrowseCovers.enabled`. Any Solid
 * component that reads `coversEnabledSignal()` will automatically re-run its
 * effect when the user toggles the "Show covers" setting — replacing the old
 * imperative `renderCurrent()` call that was used in the vanilla-JS version.
 */
const [coversEnabledSignal, setCoversEnabledSignal] = persistedSignal(true, {
  name: "ds_covers_enabled",
  deserialize: (v) => v !== null ? v === "true" : true,
});

const [coverPathMap, setCoverPathMap] = createSignal<Map<string, string>>(new Map(), { equals: false });
const [coverStateMap, setCoverStateMap] = createSignal<Map<string, CoverState>>(new Map(), { equals: false });

export { coversEnabledSignal, coverStateMap };

/**
 * Feed cover-hydration engine. Reactive singleton that drives cover image paths
 * through Solid signals instead of mutating raw DOM nodes, preventing unmount
 * flicker and reconciliation race conditions.
 */
export class BrowseCovers {
  private readonly cache = new CoverMemoryCache();
  private readonly pipeline: CoverHydrationPipeline;

  constructor() {
    this.pipeline = new CoverHydrationPipeline({
      coversEnabled: () => this.coversEnabled,
      cache: this.cache,
      setCoverState: (key, state) => this.setCoverState(key, state),
      updateCoverPath: (key, path) => this.updateCoverPath(key, path),
    });

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden && !this.pipeline.isScrolling) {
          this.pipeline.pump();
        }
      });
    }
  }

  private setCoverState(key: string, state: CoverState): void {
    setCoverStateMap((prev) => {
      if (prev.get(key) === state) return prev;
      const next = new Map(prev);
      if (next.size >= MAX_MEMORY_CACHE) {
        const oldest = next.keys().next().value;
        if (oldest !== undefined) next.delete(oldest);
      }
      next.set(key, state);
      return next;
    });
  }

  private updateCoverPath(key: string, path: string): void {
    this.cache.set(key, path);
    this.setCoverState(key, "loading");
    this.cache.deleteFailedAttempt(key);
    setCoverPathMap((prev) => {
      if (prev.get(key) === path) return prev;
      const next = new Map(prev);
      if (next.size >= MAX_MEMORY_CACHE) {
        const oldest = next.keys().next().value;
        if (oldest !== undefined) next.delete(oldest);
      }
      next.set(key, path);
      return next;
    });
  }

  /** Reactively looks up a cached cover path. */
  getCover(coverKey: string): string | undefined {
    return coverPathMap().get(coverKey) || this.cache.get(coverKey) || undefined;
  }

  /** Reactively looks up the current lifecycle state of a cover. */
  getCoverState(coverKey: string): CoverState {
    if (!this.coversEnabled) return "no-cover";
    const path = this.getCover(coverKey);
    if (path) return "loading";
    const explicit = coverStateMap().get(coverKey);
    if (explicit) return explicit;
    if (this.pipeline.queuedKeysRef.has(coverKey)) return "downloading";
    return "no-cover";
  }

  clearMemoryCache(): void {
    this.cache.clearData();
    this.cache.clearFailedAttempts();
    this.pipeline.reset();
    setCoverPathMap(new Map());
    setCoverStateMap(new Map());
  }

  /** Evicts a broken/missing cover path from memory cache and SQLite. */
  evict(coverKey: string): void {
    this.cache.delete(coverKey);
    this.cache.deleteFailedAttempt(coverKey);
    this.pipeline.unqueueKey(coverKey);
    setCoverPathMap((prev) => {
      if (!prev.has(coverKey)) return prev;
      const next = new Map(prev);
      next.delete(coverKey);
      return next;
    });
    setCoverStateMap((prev) => {
      if (!prev.has(coverKey)) return prev;
      const next = new Map(prev);
      next.delete(coverKey);
      return next;
    });
    void deleteCached(`cover:${coverKey}`);
  }

  /** Manually forces a retry for a cover target. */
  retryCover(target: CoverTarget, el?: HTMLElement): void {
    this.evict(target.coverKey);
    this.pipeline.retryCover(target, el);
  }

  get coversEnabled(): boolean {
    return coversEnabledSignal();
  }

  setCoversEnabled(v: boolean): void {
    setCoversEnabledSignal(v);
    if (!v) {
      this.pipeline.disable();
    }
  }

  get currentHydrationHost(): HTMLElement | null {
    return this.pipeline.hydrationHost;
  }

  /** Maps a feed chapter or series search item to its cover key + series metadata. */
  getItemCoverInfo(ch: {
    permalink: string;
    title: string;
    kind?: string;
    series?: string | null;
    tags?: { type?: string; name?: string; permalink?: string }[];
  }): ItemCoverInfo {
    const isDirectSeriesKind = isSeriesKind(ch.kind);
    if (isDirectSeriesKind) {
      return {
        coverKey: `series:${ch.permalink}`,
        chapterPermalink: ch.permalink,
        seriesPermalink: ch.permalink,
        seriesName: ch.title,
        seriesType: ch.kind || "series",
        isStandalone: false,
      };
    }

    const containerTag = getChapterContainerTag(ch.tags);
    const doujinTag = (ch.tags ?? []).find((t) => isDoujinTag(t.type));
    const hasSeriesContainer = Boolean(containerTag || (ch.series && ch.series.trim().length > 0));

    // 1. Chapters that belong to a structured Series, Anthology, or Issue container
    if (hasSeriesContainer) {
      const seriesPermalink =
        containerTag?.permalink ||
        (ch.series
          ? ch.series
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "_")
              .replace(/^_+|_+$/g, "")
          : ch.permalink);
      const seriesName = containerTag?.name || ch.series || "";
      const seriesType = containerTag?.type?.toLowerCase() === "anthology" ? "anthology" : (containerTag?.type || "series");

      return {
        coverKey: `series:${seriesPermalink}`,
        chapterPermalink: ch.permalink,
        seriesPermalink,
        seriesName,
        seriesType,
        isStandalone: false,
      };
    }

    // 2. Standalone doujins, fan works, and oneshots (no Series/Anthology container)
    // The Doujin tag represents the franchise being parodied (e.g. Touhou, BanG Dream),
    // and the cover is the chapter's own Page 1 cover art.
    const franchisePermalink = doujinTag?.permalink || "";
    const franchiseName = doujinTag?.name || "";
    const franchiseType = doujinTag?.type || "doujin";

    return {
      coverKey: `chapter:${ch.permalink}`,
      chapterPermalink: ch.permalink,
      seriesPermalink: franchisePermalink,
      seriesName: franchiseName,
      seriesType: franchiseType,
      isStandalone: true,
    };
  }

  /** Resets per-page hydration state and attaches scroll tracking once. */
  beginPage(host: HTMLElement): void {
    this.pipeline.beginPage(host);
  }

  /** Pre-loads locally cached covers from SQLite in a single batch query. */
  async preloadBatch(coverTargets: CoverTarget[]): Promise<void> {
    if (!this.coversEnabled) return;
    const uniqueCoverKeys = new Map<string, CoverTarget>();
    const keysToQuery: string[] = [];

    for (const ct of coverTargets) {
      if (!uniqueCoverKeys.has(ct.coverKey)) {
        uniqueCoverKeys.set(ct.coverKey, ct);
        if (!this.cache.has(ct.coverKey)) {
          keysToQuery.push(`cover:${ct.coverKey}`);
        }
      }
    }

    if (keysToQuery.length > 0) {
      try {
        const cachedMap = await getBatchCached(keysToQuery);
        let changed = false;
        const currentMap = coverPathMap();
        for (const [fullKey, payload] of cachedMap) {
          const rawKey = fullKey.replace(/^cover:/, "");
          if (payload) {
            this.cache.set(rawKey, payload);
            if (currentMap.get(rawKey) !== payload) {
              currentMap.set(rawKey, payload);
              changed = true;
            }
          }
        }
        if (changed) {
          while (currentMap.size > MAX_MEMORY_CACHE) {
            const oldest = currentMap.keys().next().value;
            if (oldest !== undefined) currentMap.delete(oldest);
            else break;
          }
          setCoverPathMap(new Map(currentMap));
        }
      } catch (err) {
        log.warn("browse-covers", "preloadBatch failed:", err);
      }
    }
  }

  /** Observes a cover wrap; enqueues hydration when it nears the viewport. */
  observe(wrap: HTMLElement): void {
    this.pipeline.observe(wrap);
  }

  /** Pauses hydration pumps during the scroll-to-top animation. */
  scrollToTop(): void {
    this.pipeline.scrollToTop();
  }

  /**
   * Re-arms cover observation after a scroll-to-top has fully settled, then
   * resumes the normal idle-gated pump so covers only load once scrolling is
   * genuinely stable again.
   */
  resumeAfterScrollToTop(host: HTMLElement): void {
    this.pipeline.resumeAfterScrollToTop(host);
  }

  /** Re-observes wraps that never got an image (e.g. after scroll-to-top). */
  reobserveUnloadedCovers(host: HTMLElement): void {
    this.pipeline.reobserveUnloadedCovers(host);
  }
}

export const browseCovers = new BrowseCovers();
