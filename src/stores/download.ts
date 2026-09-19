import { createSignal } from "solid-js";
import { listen } from "@tauri-apps/api/event";
import { getDownloadQueue, pauseDownloads, resumeDownloads, type DownloadQueueItem } from "../ipc";
import { isAndroid } from "./platform";
import { maybeAutoPruneCache } from "../utils/cache-quota";
import { pushDownloadConstraints } from "../utils/download-constraints";
import { notifyCacheChanged } from "../db/cache.repo";
export interface DownloadProgressPayload {
  chapter_permalink: string;
  series_permalink: string;
  pages_done: number;
  total_pages: number;
  bytes_done?: number;
  last_page_bytes?: number;
  status: string;
}

const [activeDownloadCount, setActiveDownloadCount] = createSignal(0);
const [downloadSpeedBps, setDownloadSpeedBps] = createSignal(0);
const [downloadEtaSeconds, setDownloadEtaSeconds] = createSignal(0);
const [sessionDownloadedBytes, setSessionDownloadedBytes] = createSignal(0);
const [downloadingChapterPermalinks, setDownloadingChapterPermalinks] = createSignal<Set<string>>(
  new Set(),
);
const [downloadQueueItems, setDownloadQueueItems] = createSignal<DownloadQueueItem[]>([]);
const [isDownloadPaused, setIsDownloadPaused] = createSignal(false);
const [downloadActiveProgress, setDownloadActiveProgress] = createSignal<
  Record<string, { done: number; total: number; bytes: number }>
>({});

export {
  activeDownloadCount,
  downloadSpeedBps,
  downloadEtaSeconds,
  sessionDownloadedBytes,
  downloadingChapterPermalinks,
  downloadQueueItems,
  isDownloadPaused,
  downloadActiveProgress,
};

export const refreshDownloadQueue = async (): Promise<void> => {
  if (boundRefreshState) await boundRefreshState();
};


/**
 * Single speed/ETA accumulator stream (QoL-D4): the topbar and the download
 * manager both consume these signals instead of running separate timers and
 * smoothing factors. Accumulators are only meaningful within one
 * uninterrupted download run, so they reset on pause/resume, on chapter
 * transitions, and when the queue drains.
 */
let lastSampleTime = 0;
let lastChapterPermalink = "";
let speedEMA = 0;
let totalDownloadedBytes = 0;
let totalDownloadedPages = 0;
let sessionBytesTotal = 0;
let accumulatedBytes = 0;
/** Latest queue snapshot used for ETA estimates (pending page counts). */
let queueSnapshot: DownloadQueueItem[] = [];
export function resetDownloadSpeedAccumulators(): void {
  lastSampleTime = 0;
  lastChapterPermalink = "";
  speedEMA = 0;
  totalDownloadedBytes = 0;
  totalDownloadedPages = 0;
  accumulatedBytes = 0;
  setDownloadSpeedBps(0);
  setDownloadEtaSeconds(0);
}

/** Feeds the store's ETA estimator with the freshest queue snapshot and resets speed if idle. */
export function updateDownloadQueueSnapshot(items: DownloadQueueItem[]): void {
  queueSnapshot = items;
  if (!items.some((i) => i.status === "downloading")) {
    resetDownloadSpeedAccumulators();
  }
}

let initialized = false;
let pollIntervalId: number | null = null;
let unlistenProgress: (() => void) | null = null;
let wasAutoPausedByVisibility = false;

let boundRefreshState: (() => Promise<void>) | null = null;

const onVisibilityChange = () => {
  if (!isAndroid()) return;
  if (document.hidden) {
    // Only auto-pause if downloads are actually active AND the user hasn't
    // explicitly paused them already (we don't want to clobber their intent).
    const queueRes = queueSnapshot;
    const isUserPaused = !queueRes.some((i) => i.status === "downloading");
    if (activeDownloadCount() > 0 && !isUserPaused) {
      wasAutoPausedByVisibility = true;
      void pauseDownloads();
    }
  } else {
    if (wasAutoPausedByVisibility) {
      wasAutoPausedByVisibility = false;
      void resumeDownloads();
      if (boundRefreshState) void boundRefreshState();
    }
  }
};

const onPageHide = () => {
  if (!isAndroid()) return;
  const isUserPaused = !queueSnapshot.some((i) => i.status === "downloading");
  if (activeDownloadCount() > 0 && !isUserPaused) {
    wasAutoPausedByVisibility = true;
    void pauseDownloads();
  }
};

const onPageShow = () => {
  if (!isAndroid()) return;
  if (wasAutoPausedByVisibility) {
    wasAutoPausedByVisibility = false;
    void resumeDownloads();
    if (boundRefreshState) void boundRefreshState();
  }
};

export function disposeGlobalDownloadListener(): void {
  if (!initialized) return;
  if (pollIntervalId !== null) {
    window.clearInterval(pollIntervalId);
    pollIntervalId = null;
  }
  if (unlistenProgress) {
    unlistenProgress();
    unlistenProgress = null;
  }
  if (typeof document !== "undefined") {
    document.removeEventListener("visibilitychange", onVisibilityChange);
    window.removeEventListener("pagehide", onPageHide);
    window.removeEventListener("pageshow", onPageShow);
  }
  boundRefreshState = null;
  initialized = false;
}

export function initGlobalDownloadListener(): void {
  if (initialized) return;
  initialized = true;
  const refreshState = async () => {
    try {
      const res = await getDownloadQueue();
      setDownloadQueueItems(res.items);
      if (typeof res.paused === "boolean") {
        setIsDownloadPaused(res.paused);
      }
      updateDownloadQueueSnapshot(res.items);
      const activeOrPending = res.items.filter(
        (i) => i.status === "downloading" || i.status === "pending",
      );
      setActiveDownloadCount(activeOrPending.length);

      setDownloadingChapterPermalinks(
        new Set(res.items.filter((i) => i.status === "downloading").map((i) => i.chapter_permalink)),
      );
    } catch {
      // Best-effort
    }
  };

  boundRefreshState = refreshState;
  void refreshState();
  // Seed the Rust processor with the user's scheduling / Wi-Fi-only
  // constraints (QoL-D5); re-pushed below while downloads are active.
  void pushDownloadConstraints();

  try {
    void listen<DownloadProgressPayload>("download://progress", (event) => {
      const payload = event.payload;
      if (payload) {
        const now = Date.now();
        const pageBytes = payload.last_page_bytes || 200_000;

        if (payload.status === "downloading") {
          setDownloadingChapterPermalinks((prev) => {
            if (prev.has(payload.chapter_permalink)) return prev;
            const next = new Set(prev);
            next.add(payload.chapter_permalink);
            return next;
          });
        }
        setDownloadActiveProgress((prev) => ({
          ...prev,
          [payload.chapter_permalink]: {
            done: payload.pages_done,
            total: payload.total_pages,
            bytes: payload.bytes_done || 0,
          },
        }));

        setDownloadQueueItems((prev) =>
          prev.map((item) => {
            if (item.chapter_permalink === payload.chapter_permalink) {
              return {
                ...item,
                progress: payload.pages_done,
                total_pages: payload.total_pages || item.total_pages,
                status: payload.status as DownloadQueueItem["status"],
              };
            }
            return item;
          }),
        );

        if (pageBytes > 0 && payload.status === "downloading") {
          if (payload.chapter_permalink !== lastChapterPermalink) {
            lastSampleTime = 0;
            totalDownloadedBytes = 0;
            totalDownloadedPages = 0;
            lastChapterPermalink = payload.chapter_permalink;
            accumulatedBytes = 0;
          }
          sessionBytesTotal += pageBytes;
          setSessionDownloadedBytes(sessionBytesTotal);

          // First sample after reset: seed the clock only.
          if (lastSampleTime === 0) {
            lastSampleTime = now;
            accumulatedBytes = pageBytes;
          } else {
            // Accumulate bytes across sub-150ms intervals so fast pages are not
            // dropped from the speed estimate.
            accumulatedBytes += pageBytes;
            const dt = (now - lastSampleTime) / 1000;
            if (dt > 0.15) {
              const instant = accumulatedBytes / dt;
              speedEMA = speedEMA === 0 ? instant : speedEMA * 0.65 + instant * 0.35;
              setDownloadSpeedBps(speedEMA);
              lastSampleTime = now;
              totalDownloadedBytes += accumulatedBytes;
              totalDownloadedPages += 1;
              accumulatedBytes = 0;

              const pendingItems = queueSnapshot.filter(
                (i) => i.status === "pending" || i.status === "downloading",
              );
              // Fall back to 20 pages if total_pages not yet reported (chapter start).
              const totalPagesInCurrent = payload.total_pages > 0 ? payload.total_pages : 20;
              const remainingPagesInCurrent = Math.max(0, totalPagesInCurrent - payload.pages_done);
              const otherPendingPages = pendingItems
                .filter((i) => i.chapter_permalink !== payload.chapter_permalink)
                .reduce((acc, i) => acc + (i.total_pages > 0 ? i.total_pages : 20), 0);
              const totalRemainingPages = remainingPagesInCurrent + otherPendingPages;

              if (totalDownloadedPages > 0) {
                const avgBytesPerPage = totalDownloadedBytes / totalDownloadedPages;
                const remainingBytesEst = totalRemainingPages * avgBytesPerPage;
                if (speedEMA > 1000) {
                  setDownloadEtaSeconds(remainingBytesEst / speedEMA);
                }
              }
            }
          }
        }

        if (
          payload.status === "done" ||
          payload.status === "failed" ||
          payload.status === "cancelled"
        ) {
          const key = payload.chapter_permalink;
          window.setTimeout(() => {
            setDownloadActiveProgress((prev) => {
              if (!(key in prev)) return prev;
              const next = { ...prev };
              delete next[key];
              return next;
            });
          }, 0);
          void refreshState();
          if (payload.status === "done") {
            notifyCacheChanged();
            void maybeAutoPruneCache(downloadingChapterPermalinks());
          }
        }
      }
    }).then((unlisten) => {
      // Guard against the race where dispose() runs before this promise settles.
      if (!initialized) {
        unlisten();
      } else {
        unlistenProgress = unlisten;
      }
    });
  } catch {
    // Outside Tauri
  }

  // Poll every 3 seconds while downloads exist
  pollIntervalId = window.setInterval(() => {
    if (activeDownloadCount() > 0) {
      void refreshState();
      // Keep metered status / timezone offset fresh while downloading so a
      // Wi-Fi → cellular handoff or DST change is picked up within seconds.
      void pushDownloadConstraints();
    }
  }, 3000);

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
  }
}
