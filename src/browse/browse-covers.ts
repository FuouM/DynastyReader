import { createSignal } from "solid-js";
import { debounce } from "@solid-primitives/scheduled";
import { getOrHydrateItemCover } from "../api";
import { getBatchCached, deleteCached } from "../db";

/**
 * Module-level reactive signal that mirrors `BrowseCovers.enabled`. Any Solid
 * component that reads `coversEnabledSignal()` will automatically re-run its
 * effect when the user toggles the "Show covers" setting — replacing the old
 * imperative `renderCurrent()` call that was used in the vanilla-JS version.
 */
const [coversEnabledSignal, setCoversEnabledSignal] = createSignal(
  (() => {
    try {
      const saved = localStorage.getItem("ds_covers_enabled");
      return saved !== null ? saved === "true" : true;
    } catch {
      return true;
    }
  })()
);

const [coverPathMap, setCoverPathMap] = createSignal<Map<string, string>>(new Map(), { equals: false });

export { coversEnabledSignal };

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

const SCROLL_IDLE_MS = 300;

/**
 * Feed cover-hydration engine. Reactive singleton that drives cover image paths
 * through Solid signals instead of mutating raw DOM nodes, preventing unmount
 * flicker and reconciliation race conditions.
 */
export class BrowseCovers {
  private readonly memoryCache = new Map<string, string | null>();
  private readonly inflight = new Map<string, Promise<string | null>>();
  private readonly queue: CoverTarget[] = [];
  private readonly queuedKeys = new Set<string>();
  private readonly MAX_CONCURRENCY = 4;
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

  clearMemoryCache(): void {
    this.memoryCache.clear();
    this.queuedKeys.clear();
    this.queue.length = 0;
    setCoverPathMap(new Map());
  }

  /** Evicts a broken/missing cover path from memory cache and SQLite. */
  evict(coverKey: string): void {
    this.memoryCache.delete(coverKey);
    setCoverPathMap((prev) => {
      if (!prev.has(coverKey)) return prev;
      const next = new Map(prev);
      next.delete(coverKey);
      return next;
    });
    void deleteCached(`cover:${coverKey}`);
  }

  get coversEnabled(): boolean {
    return coversEnabledSignal();
  }

  setCoversEnabled(v: boolean): void {
    setCoversEnabledSignal(v);
    try {
      localStorage.setItem("ds_covers_enabled", v ? "true" : "false");
    } catch {}
    if (!v) {
      this.queue.length = 0;
      this.queuedKeys.clear();
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
    const isDirectSeriesKind =
      ch.kind === "series" || ch.kind === "anthology" || ch.kind === "doujin" || ch.kind === "issue";

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

    // A chapter is part of an official series if ch.series is a non-empty string
    const isOfficialSeries = Boolean(ch.series && ch.series.trim().length > 0);

    const seriesTag = (ch.tags ?? []).find((t) => {
      const type = (t.type ?? "").toLowerCase();
      return type === "series" || type === "anthology" || type === "issue";
    });

    const doujinTag = (ch.tags ?? []).find((t) => {
      const type = (t.type ?? "").toLowerCase();
      return type === "doujin" || type === "doujinshi";
    });

    // 1. Official serialized series (e.g. Citrus +, Bloom Into You, The Blue Star on That Day)
    if (isOfficialSeries) {
      const seriesPermalink =
        seriesTag?.permalink ||
        (ch.series
          ? ch.series
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "_")
              .replace(/^_+|_+$/g, "")
          : ch.permalink);
      const seriesName = ch.series || seriesTag?.name || "";
      const seriesType = seriesTag?.type || "series";

      return {
        coverKey: `series:${seriesPermalink}`,
        chapterPermalink: ch.permalink,
        seriesPermalink,
        seriesName,
        seriesType,
        isStandalone: false,
      };
    }

    // 2. Doujins, fan works, and standalone oneshots (ch.series is null)
    // The Doujin tag represents the franchise being parodied (e.g. Kamiina Botan, Touhou, BanG Dream),
    // but the cover must be the chapter's own Page 1 cover art.
    const franchisePermalink = doujinTag?.permalink || seriesTag?.permalink || "";
    const franchiseName = doujinTag?.name || seriesTag?.name || "";
    const franchiseType = doujinTag?.type || seriesTag?.type || "doujin";

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
            this.memoryCache.set(rawKey, payload);
            if (currentMap.get(rawKey) !== payload) {
              currentMap.set(rawKey, payload);
              changed = true;
            }
          }
        }
        if (changed) {
          setCoverPathMap(new Map(currentMap));
        }
      } catch {}
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
    unmountedWraps.forEach((wrap) => observer.observe(wrap));
  }

  private attachScrollTracking(): void {
    // Primary: attach directly to the scrollable container so the event is guaranteed.
    const dsView = document.getElementById("ds-view");
    if (dsView) {
      dsView.addEventListener("scroll", this.onScrollActive, { passive: true });
    } else {
      console.warn("[ds-covers] #ds-view not found — scroll tracking may miss events");
    }
    // Fallback: document capture for any other scroll sources.
    document.addEventListener("scroll", this.onScrollActive, { capture: true, passive: true });
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
                if (resolved !== undefined) {
                  this.lazyObserver?.unobserve(el);
                  if (resolved) {
                    setCoverPathMap((prev) => {
                      if (prev.get(coverKey) === resolved) return prev;
                      const next = new Map(prev);
                      next.set(coverKey, resolved);
                      return next;
                    });
                  }
                } else if (chapterPermalink) {
                  if (!this.queuedKeys.has(coverKey)) {
                    this.queuedKeys.add(coverKey);
                    this.queue.unshift({
                      coverKey,
                      chapterPermalink,
                      seriesPermalink: seriesPermalink || null,
                      seriesType: seriesType || null,
                    });
                  }
                  if (!this.isScrolling) this.pumpCoverHydration();
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
    if (!this.coversEnabled || this.isScrolling || !this.hydrationHost || this.queue.length === 0) return;
    while (
      !this.isScrolling &&
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
            task = getOrHydrateItemCover(
              target.coverKey,
              target.chapterPermalink,
              target.seriesPermalink,
              target.seriesType,
            );
            this.inflight.set(target.coverKey, task);
          }

          const coverPath = await task;
          this.memoryCache.set(target.coverKey, coverPath);

          if (coverPath) {
            setCoverPathMap((prev) => {
              if (prev.get(target.coverKey) === coverPath) return prev;
              const next = new Map(prev);
              next.set(target.coverKey, coverPath);
              return next;
            });
          }
        } catch (err) {
          console.warn(`[ds-covers] worker error: ${target.coverKey}`, err);
        } finally {
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
