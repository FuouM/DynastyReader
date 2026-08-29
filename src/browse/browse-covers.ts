import { createSignal } from "solid-js";
import { persistedSignal } from "../lib/persisted-signal";
import { debounce } from "@solid-primitives/scheduled";
import { getOrHydrateItemCover } from "../api";
import { getBatchCached, deleteCached } from "../db";
import { isSeriesKind, isDoujinTag, getChapterContainerTag } from "../taxonomy";

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

export type CoverState = "no-cover" | "downloading" | "processing" | "loading" | "loaded";

const [coverPathMap, setCoverPathMap] = createSignal<Map<string, string>>(new Map(), { equals: false });
const [coverStateMap, setCoverStateMap] = createSignal<Map<string, CoverState>>(new Map(), { equals: false });

export { coversEnabledSignal, coverStateMap };

export interface CoverTarget {
  coverKey: string;
  chapterPermalink: string;
  seriesPermalink: string | null;
  seriesType: string | null;
}

export interface ItemCoverInfo {
  coverKey: string;
  chapterPermalink: string;
  seriesPermalink: string;
  seriesName: string;
  seriesType: string;
  isStandalone: boolean;
}

// RAM quick win: 100 in-memory cover paths (down from 500) covers 5 full 20-item feed pages
// of smooth scrolling, cutting Map entry overhead without dropping visible cover cache.
const SCROLL_IDLE_MS = 300;
const MAX_MEMORY_CACHE = 100;
const MAX_FAILED_ATTEMPTS = 50;

/**
 * Feed cover-hydration engine. Reactive singleton that drives cover image paths
 * through Solid signals instead of mutating raw DOM nodes, preventing unmount
 * flicker and reconciliation race conditions.
 */
export class BrowseCovers {
  private readonly memoryCache = new Map<string, string>();
  private readonly failedAttempts = new Map<string, { count: number; lastTried: number }>();
  private readonly inflight = new Map<string, Promise<string | null>>();
  private readonly queue: CoverTarget[] = [];
  private readonly queuedKeys = new Set<string>();
  private readonly MAX_CONCURRENCY = 4;

  constructor() {
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden && !this.isScrolling) {
          this.pumpCoverHydration();
        }
      });
    }
  }

  private setMemoryCache(key: string, val: string): void {
    if (this.memoryCache.size >= MAX_MEMORY_CACHE) {
      const oldest = this.memoryCache.keys().next().value;
      if (oldest !== undefined) this.memoryCache.delete(oldest);
    }
    this.memoryCache.set(key, val);
  }

  private setFailedAttempt(key: string, val: { count: number; lastTried: number }): void {
    if (this.failedAttempts.size >= MAX_FAILED_ATTEMPTS) {
      const oldest = this.failedAttempts.keys().next().value;
      if (oldest !== undefined) this.failedAttempts.delete(oldest);
    }
    this.failedAttempts.set(key, val);
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
    this.setMemoryCache(key, path);
    this.setCoverState(key, "loading");
    this.failedAttempts.delete(key);
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
  private activeWorkers = 0;
  private hydrationHost: HTMLElement | null = null;
  private lazyObserver: IntersectionObserver | null = null;
  private isScrolling = false;
  private readonly onScrollIdle = debounce(() => {
    this.isScrolling = false;
    this.pumpCoverHydration();
  }, SCROLL_IDLE_MS);
  private scrollTrackingAttached = false;
  /** Reactively looks up a cached cover path. */
  getCover(coverKey: string): string | undefined {
    return coverPathMap().get(coverKey) || this.memoryCache.get(coverKey) || undefined;
  }

  /** Reactively looks up the current lifecycle state of a cover. */
  getCoverState(coverKey: string): CoverState {
    if (!this.coversEnabled) return "no-cover";
    const path = this.getCover(coverKey);
    if (path) return "loading";
    const explicit = coverStateMap().get(coverKey);
    if (explicit) return explicit;
    if (this.queuedKeys.has(coverKey)) return "downloading";
    return "no-cover";
  }
  clearMemoryCache(): void {
    this.memoryCache.clear();
    this.failedAttempts.clear();
    this.queuedKeys.clear();
    this.queue.length = 0;
    setCoverPathMap(new Map());
    setCoverStateMap(new Map());
    this.detachScrollTracking();
  }

  /** Evicts a broken/missing cover path from memory cache and SQLite. */
  evict(coverKey: string): void {
    this.memoryCache.delete(coverKey);
    this.failedAttempts.delete(coverKey);
    this.queuedKeys.delete(coverKey);
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
    if (el && this.lazyObserver) {
      this.lazyObserver.observe(el);
    }
    if (!this.queuedKeys.has(target.coverKey)) {
      this.queuedKeys.add(target.coverKey);
      this.queue.unshift(target);
      this.pumpCoverHydration();
    }
  }

  get coversEnabled(): boolean {
    return coversEnabledSignal();
  }

  setCoversEnabled(v: boolean): void {
    setCoversEnabledSignal(v);
    if (!v) {
      this.queue.length = 0;
      this.queuedKeys.clear();
      this.detachScrollTracking();
      if (this.lazyObserver) {
        this.lazyObserver.disconnect();
        this.lazyObserver = null;
      }
    }
  }
  get currentHydrationHost(): HTMLElement | null {
    return this.hydrationHost;
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
    this.hydrationHost = host;
    this.queue.length = 0; // reset queue for new page
    this.queuedKeys.clear();
    if (this.lazyObserver) {
      this.lazyObserver.disconnect();
      this.lazyObserver = null;
    }

    // Attach scroll tracking to #ds-view on first ever feed render.
    if (!this.scrollTrackingAttached && this.coversEnabled) {
      this.scrollTrackingAttached = true;
      this.attachScrollTracking();
    }
  }

  /** Pre-loads locally cached covers from SQLite in a single batch query. */
  async preloadBatch(coverTargets: CoverTarget[]): Promise<void> {
    if (!this.coversEnabled) return;
    const uniqueCoverKeys = new Map<string, CoverTarget>();
    const keysToQuery: string[] = [];

    for (const ct of coverTargets) {
      if (!uniqueCoverKeys.has(ct.coverKey)) {
        uniqueCoverKeys.set(ct.coverKey, ct);
        if (!this.memoryCache.has(ct.coverKey)) {
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
            this.setMemoryCache(rawKey, payload);
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
        console.warn("[browse-covers] preloadBatch failed:", err);
      }
    }
  }

  /** Observes a cover wrap; enqueues hydration when it nears the viewport. */
  observe(wrap: HTMLElement): void {
    if (!this.coversEnabled) return;
    this.getLazyObserver().observe(wrap);
  }

  /** Pauses hydration pumps during the scroll-to-top animation. */
  scrollToTop(): void {
    // Keep hydration paused for the whole animation. We must NOT arm the idle
    // timer here: Chromium's programmatic smooth scroll does not emit JS scroll
    // events for its full duration, so a 400ms idle timer would fire mid-flight,
    // flip isScrolling to false, and let the pump run while covers are still
    // flying past — causing scroll jank.
    if (!this.coversEnabled) return;
    this.onScrollIdle.clear();
    this.isScrolling = true;
    // Deliberately keep the observer connected: covers flying past the
    // viewport get queued (not pumped — isScrolling is true), so they hydrate
    // in the background once the scroll settles. Covers that were scrolled past
    // quickly on the way DOWN were queued but never hydrated; dropping them
    // here (the old behavior) forced a fresh re-hydration on the way back up.
    // Keeping the queue + observer lets the idle pump drain them while the user
    // rests at the top, so the return trip is all cache hits.
  }

  /**
   * Re-arms cover observation after a scroll-to-top has fully settled, then
   * resumes the normal idle-gated pump so covers only load once scrolling is
   * genuinely stable again.
   */
  resumeAfterScrollToTop(host: HTMLElement): void {
    if (!this.coversEnabled) return;
    // Force the paused state so re-observed covers only get queued, never
    // pumped immediately — even if the idle timer fired mid-animation (scroll
    // events on a long smooth scroll can be more than SCROLL_IDLE_MS apart).
    this.isScrolling = true;
    this.reobserveUnloadedCovers(host);
    this.onScrollIdle.clear();
    this.onScrollIdle();
  }

  /** Re-observes wraps that never got an image (e.g. after scroll-to-top). */
  reobserveUnloadedCovers(host: HTMLElement): void {
    if (!this.coversEnabled) return;
    const observer = this.getLazyObserver();
    const unmountedWraps = host.querySelectorAll<HTMLElement>(
      ".ds-feed-cover-wrap:not(:has(img.ds-feed-cover))",
    );
    for (const wrap of unmountedWraps) {
      observer.observe(wrap);
    }
  }

  private scrollCleanups: (() => void)[] = [];

  private attachScrollTracking(): void {
    // Primary: attach directly to the scrollable container so the event is guaranteed.
    const dsView = document.getElementById("ds-view");
    if (dsView) {
      dsView.addEventListener("scroll", this.onScrollActive, { passive: true });
      this.scrollCleanups.push(() => dsView.removeEventListener("scroll", this.onScrollActive));
    } else {
      console.warn("[ds-covers] #ds-view not found — scroll tracking may miss events");
    }
    // Fallback: document capture for any other scroll sources.
    document.addEventListener("scroll", this.onScrollActive, { capture: true, passive: true });
    this.scrollCleanups.push(() => document.removeEventListener("scroll", this.onScrollActive, { capture: true }));
  }

  private detachScrollTracking(): void {
    for (const fn of this.scrollCleanups) fn();
    this.scrollCleanups.length = 0;
    this.scrollTrackingAttached = false;
  }

  private readonly onScrollActive = (): void => {
    if (!this.isScrolling) {
      this.isScrolling = true;
    }
    this.onScrollIdle();
  };
  private getLazyObserver(): IntersectionObserver {
    if (!this.lazyObserver) {
      this.lazyObserver = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              const el = entry.target as HTMLElement;
              if (!this.coversEnabled) continue;

              const coverKey = el.dataset.feedCover;
              const chapterPermalink = el.dataset.chapterPermalink;
              const seriesPermalink = el.dataset.seriesPermalink;
              const seriesType = el.dataset.seriesType;

              if (coverKey) {
                const resolved = this.memoryCache.get(coverKey);
                if (resolved) {
                  this.lazyObserver?.unobserve(el);
                  this.updateCoverPath(coverKey, resolved);
                } else if (chapterPermalink) {
                  const fail = this.failedAttempts.get(coverKey);
                  const cooldown = fail ? Math.min(30000, 3000 * fail.count) : 0;
                  const readyToRetry = !fail || Date.now() - fail.lastTried > cooldown;

                  if (readyToRetry && !this.queuedKeys.has(coverKey)) {
                    this.queuedKeys.add(coverKey);
                    this.setCoverState(coverKey, "downloading");
                    this.queue.unshift({
                      coverKey,
                      chapterPermalink,
                      seriesPermalink: seriesPermalink || null,
                      seriesType: seriesType || null,
                    });
                    if (!this.isScrolling) this.pumpCoverHydration();
                  }
                }
              }
            }
          }
        },
        { rootMargin: "300px" },
      );
    }
    return this.lazyObserver;
  }
  private pumpCoverHydration(): void {
    if (
      !this.coversEnabled ||
      this.isScrolling ||
      !this.hydrationHost ||
      this.queue.length === 0 ||
      (typeof document !== "undefined" && document.hidden)
    ) {
      return;
    }
    while (
      !this.isScrolling &&
      !(typeof document !== "undefined" && document.hidden) &&
      this.activeWorkers < this.MAX_CONCURRENCY &&
      this.queue.length > 0
    ) {
      const target = this.queue.shift();
      if (!target) break;

      this.activeWorkers++;

      void (async () => {
        try {
          let task = this.inflight.get(target.coverKey);
          if (!task) {
            this.setCoverState(target.coverKey, "downloading");
            task = getOrHydrateItemCover(
              target.coverKey,
              target.chapterPermalink,
              target.seriesPermalink,
              target.seriesType,
              (phase) => {
                this.setCoverState(target.coverKey, phase);
              },
            );
            this.inflight.set(target.coverKey, task);
          }

          const coverPath = await task;
          if (coverPath) {
            this.updateCoverPath(target.coverKey, coverPath);
          } else {
            this.setCoverState(target.coverKey, "no-cover");
            this.memoryCache.delete(target.coverKey);
            const prevFail = this.failedAttempts.get(target.coverKey);
            const count = (prevFail?.count ?? 0) + 1;
            this.setFailedAttempt(target.coverKey, { count, lastTried: Date.now() });
          }
        } catch (err) {
          console.warn(`[ds-covers] worker error: ${target.coverKey}`, err);
          this.memoryCache.delete(target.coverKey);
          const prevFail = this.failedAttempts.get(target.coverKey);
          const count = (prevFail?.count ?? 0) + 1;
          this.setFailedAttempt(target.coverKey, { count, lastTried: Date.now() });
        } finally {
          this.queuedKeys.delete(target.coverKey);
          this.inflight.delete(target.coverKey);
          this.activeWorkers--;
          setTimeout(() => {
            if (!this.isScrolling) this.pumpCoverHydration();
          }, 0);
        }
      })();
    }
  }
}

export const browseCovers = new BrowseCovers();
