import { debounce } from "@solid-primitives/scheduled";
import { getOrHydrateItemCover } from "../api";
import { log } from "../utils/log";
import type { CoverState, CoverMemoryCache } from "./browse-covers-memory-cache";

export const SCROLL_IDLE_MS = 300;
const MAX_CONCURRENCY = 4;

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

/**
 * Callback context that the hydration pipeline uses to interact with the
 * parent BrowseCovers instance (signals + cache).
 */
export interface PipelineContext {
  coversEnabled: () => boolean;
  cache: CoverMemoryCache;
  setCoverState: (key: string, state: CoverState) => void;
  updateCoverPath: (key: string, path: string) => void;
}

/**
 * Cover hydration pipeline. Owns the work queue, concurrency-limited async
 * workers, IntersectionObserver-based lazy loading, and scroll-aware
 * pump gating. Delegates cache and signal mutations back to the parent
 * through {@link PipelineContext} callbacks.
 */
export class CoverHydrationPipeline {
  private queue: CoverTarget[] = [];
  private queuedKeys = new Set<string>();
  private activeWorkers = 0;
  private _hydrationHost: HTMLElement | null = null;
  private lazyObserver: IntersectionObserver | null = null;
  private _isScrolling = false;
  private scrollTrackingAttached = false;
  private scrollTrackedEl: Element | null = null;
  private scrollCleanups: (() => void)[] = [];

  private readonly onScrollIdle = debounce(() => {
    this._isScrolling = false;
    this.pumpCoverHydration();
  }, SCROLL_IDLE_MS);

  constructor(private readonly ctx: PipelineContext) {}

  get isScrolling(): boolean {
    return this._isScrolling;
  }

  get hydrationHost(): HTMLElement | null {
    return this._hydrationHost;
  }

  get queuedKeysRef(): ReadonlySet<string> {
    return this.queuedKeys;
  }

  /** Resets per-page hydration state and attaches scroll tracking once. */
  beginPage(host: HTMLElement): void {
    this._hydrationHost = host;
    this.queue.length = 0;
    this.queuedKeys.clear();
    if (this.lazyObserver) {
      this.lazyObserver.disconnect();
      this.lazyObserver = null;
    }

    // Re-attach when #ds-view was unmounted/remounted (view switch) since we
    // last attached — the listener on the detached node would otherwise stay
    // dead while scrollTrackingAttached blocks re-attachment.
    if (this.scrollTrackingAttached && this.scrollTrackedEl !== document.getElementById("ds-view")) {
      this.detachScrollTracking();
    }

    // Attach scroll tracking to #ds-view on first ever feed render.
    if (!this.scrollTrackingAttached && this.ctx.coversEnabled()) {
      this.scrollTrackingAttached = true;
      this.attachScrollTracking();
    }
  }

  /** Observes a cover wrap; enqueues hydration when it nears the viewport. */
  observe(wrap: HTMLElement): void {
    if (!this.ctx.coversEnabled()) return;
    this.getLazyObserver().observe(wrap);
  }

  /** Pauses hydration pumps during the scroll-to-top animation. */
  scrollToTop(): void {
    // Keep hydration paused for the whole animation. We must NOT arm the idle
    // timer here: Chromium's programmatic smooth scroll does not emit JS scroll
    // events for its full duration, so a 400ms idle timer would fire mid-flight,
    // flip isScrolling to false, and let the pump run while covers are still
    // flying past — causing scroll jank.
    if (!this.ctx.coversEnabled()) return;
    this.onScrollIdle.clear();
    this._isScrolling = true;
  }

  /**
   * Re-arms cover observation after a scroll-to-top has fully settled, then
   * resumes the normal idle-gated pump so covers only load once scrolling is
   * genuinely stable again.
   */
  resumeAfterScrollToTop(host: HTMLElement): void {
    if (!this.ctx.coversEnabled()) return;
    // Force the paused state so re-observed covers only get queued, never
    // pumped immediately — even if the idle timer fired mid-animation (scroll
    // events on a long smooth scroll can be more than SCROLL_IDLE_MS apart).
    this._isScrolling = true;
    this.reobserveUnloadedCovers(host);
    this.onScrollIdle.clear();
    this.onScrollIdle();
  }

  /** Re-observes wraps that never got an image (e.g. after scroll-to-top). */
  reobserveUnloadedCovers(host: HTMLElement): void {
    if (!this.ctx.coversEnabled()) return;
    const observer = this.getLazyObserver();
    const unmountedWraps = host.querySelectorAll<HTMLElement>(
      ".ds-feed-cover-wrap:not(:has(img.ds-feed-cover))",
    );
    for (const wrap of unmountedWraps) {
      observer.observe(wrap);
    }
  }

  /** Manually forces a retry for a cover target. */
  retryCover(target: CoverTarget, el?: HTMLElement): void {
    if (el && this.lazyObserver) {
      this.lazyObserver.observe(el);
    }
    if (!this.queuedKeys.has(target.coverKey)) {
      this.queuedKeys.add(target.coverKey);
      this.queue.unshift(target);
      this.pumpCoverHydration();
    }
  }

  /** Clears the queue and scroll tracking (used when covers are disabled). */
  disable(): void {
    this.queue.length = 0;
    this.queuedKeys.clear();
    this.detachScrollTracking();
    if (this.lazyObserver) {
      this.lazyObserver.disconnect();
      this.lazyObserver = null;
    }
  }

  /** Resets queue and scroll tracking without disconnecting the observer. */
  reset(): void {
    this.queuedKeys.clear();
    this.queue.length = 0;
    this.detachScrollTracking();
  }

  /** Removes a single key from the queued set. */
  unqueueKey(key: string): void {
    this.queuedKeys.delete(key);
  }

  /** Public entry point for triggering a hydration pump cycle. */
  pump(): void {
    this.pumpCoverHydration();
  }

  // ---------------------------------------------------------------------------
  // Scroll tracking
  // ---------------------------------------------------------------------------

  private attachScrollTracking(): void {
    // Primary: attach directly to the scrollable container so the event is guaranteed.
    const dsView = document.getElementById("ds-view");
    this.scrollTrackedEl = dsView;
    if (dsView) {
      dsView.addEventListener("scroll", this.onScrollActive, { passive: true });
      this.scrollCleanups.push(() => dsView.removeEventListener("scroll", this.onScrollActive));
    } else {
      log.warn("browse-covers", "#ds-view not found — scroll tracking may miss events");
    }
    // Fallback: document capture for any other scroll sources.
    document.addEventListener("scroll", this.onScrollActive, { capture: true, passive: true });
    this.scrollCleanups.push(() => document.removeEventListener("scroll", this.onScrollActive, { capture: true }));
  }

  private detachScrollTracking(): void {
    for (const fn of this.scrollCleanups) fn();
    this.scrollCleanups.length = 0;
    this.scrollTrackingAttached = false;
    this.scrollTrackedEl = null;
  }

  private readonly onScrollActive = (): void => {
    if (!this._isScrolling) {
      this._isScrolling = true;
    }
    this.onScrollIdle();
  };

  // ---------------------------------------------------------------------------
  // Lazy observer
  // ---------------------------------------------------------------------------

  private getLazyObserver(): IntersectionObserver {
    if (!this.lazyObserver) {
      this.lazyObserver = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              const el = entry.target as HTMLElement;
              if (!this.ctx.coversEnabled()) continue;

              const coverKey = el.dataset.feedCover;
              const chapterPermalink = el.dataset.chapterPermalink;
              const seriesPermalink = el.dataset.seriesPermalink;
              const seriesType = el.dataset.seriesType;

              if (coverKey) {
                const resolved = this.ctx.cache.get(coverKey);
                if (resolved) {
                  this.lazyObserver?.unobserve(el);
                  this.ctx.updateCoverPath(coverKey, resolved);
                } else if (chapterPermalink) {
                  const fail = this.ctx.cache.getFailedAttempt(coverKey);
                  const cooldown = fail ? Math.min(30000, 3000 * fail.count) : 0;
                  const readyToRetry = !fail || Date.now() - fail.lastTried > cooldown;

                  if (readyToRetry && !this.queuedKeys.has(coverKey)) {
                    this.queuedKeys.add(coverKey);
                    this.ctx.setCoverState(coverKey, "downloading");
                    this.queue.unshift({
                      coverKey,
                      chapterPermalink,
                      seriesPermalink: seriesPermalink || null,
                      seriesType: seriesType || null,
                    });
                    if (!this._isScrolling) this.pumpCoverHydration();
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

  // ---------------------------------------------------------------------------
  // Hydration pump
  // ---------------------------------------------------------------------------

  private pumpCoverHydration(): void {
    if (
      !this.ctx.coversEnabled() ||
      this._isScrolling ||
      !this._hydrationHost ||
      this._hydrationHost.offsetParent === null ||
      this.queue.length === 0 ||
      (typeof document !== "undefined" && document.hidden)
    ) {
      return;
    }
    while (
      !this._isScrolling &&
      !(typeof document !== "undefined" && document.hidden) &&
      this._hydrationHost?.offsetParent !== null &&
      this.activeWorkers < MAX_CONCURRENCY &&
      this.queue.length > 0
    ) {
      const target = this.queue.shift();
      if (!target) break;

      this.activeWorkers++;

      void (async () => {
        try {
          let task = this.ctx.cache.getInflight(target.coverKey);
          if (!task) {
            this.ctx.setCoverState(target.coverKey, "downloading");
            task = getOrHydrateItemCover({
              coverKey: target.coverKey,
              chapterPermalink: target.chapterPermalink,
              seriesOrGroupPermalink: target.seriesPermalink,
              seriesType: target.seriesType,
              onPhase: (phase) => {
                this.ctx.setCoverState(target.coverKey, phase);
              },
            });
            this.ctx.cache.setInflight(target.coverKey, task);
          }

          const coverPath = await task;
          if (coverPath) {
            this.ctx.updateCoverPath(target.coverKey, coverPath);
          } else {
            this.ctx.setCoverState(target.coverKey, "no-cover");
            this.ctx.cache.delete(target.coverKey);
            const prevFail = this.ctx.cache.getFailedAttempt(target.coverKey);
            const count = (prevFail?.count ?? 0) + 1;
            this.ctx.cache.setFailedAttempt(target.coverKey, { count, lastTried: Date.now() });
          }
        } catch (err) {
          log.warn("browse-covers", `worker error: ${target.coverKey}`, err);
          this.ctx.cache.delete(target.coverKey);
          const prevFail = this.ctx.cache.getFailedAttempt(target.coverKey);
          const count = (prevFail?.count ?? 0) + 1;
          this.ctx.cache.setFailedAttempt(target.coverKey, { count, lastTried: Date.now() });
        } finally {
          this.queuedKeys.delete(target.coverKey);
          this.ctx.cache.deleteInflight(target.coverKey);
          this.activeWorkers--;
          setTimeout(() => {
            if (!this._isScrolling) this.pumpCoverHydration();
          }, 0);
        }
      })();
    }
  }
}
