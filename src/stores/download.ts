import { createSignal } from "solid-js";
import { listen } from "@tauri-apps/api/event";
import { getDownloadQueue, pauseDownloads, resumeDownloads, type DownloadQueueItem } from "../ipc";
import { isAndroid } from "./platform";
import { formatSpeed } from "../utils/formatting";
import { maybeAutoPruneCache } from "../utils/cache-quota";
import { pushDownloadConstraints } from "../utils/download-constraints";

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
export {
  activeDownloadCount,
  downloadSpeedBps,
  downloadEtaSeconds,
  sessionDownloadedBytes,
  downloadingChapterPermalinks,
};

export const formatDownloadSpeed = formatSpeed;

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
/** Latest queue snapshot used for ETA estimates (pending page counts). */
let queueSnapshot: DownloadQueueItem[] = [];

export function resetDownloadSpeedAccumulators(): void {
  lastSampleTime = 0;
  lastChapterPermalink = "";
  speedEMA = 0;
  totalDownloadedBytes = 0;
  totalDownloadedPages = 0;
  setDownloadSpeedBps(0);
  setDownloadEtaSeconds(0);
}

/** Feeds the store's ETA estimator with the freshest queue snapshot. */
export function updateDownloadQueueSnapshot(items: DownloadQueueItem[]): void {
  queueSnapshot = items;
}

let initialized = false;
let pollIntervalId: number | null = null;
let unlistenProgress: (() => void) | null = null;
let wasAutoPausedByVisibility = false;

let boundRefreshState: (() => Promise<void>) | null = null;

const onVisibilityChange = () => {
  if (!isAndroid()) return;
  if (document.hidden) {
    if (activeDownloadCount() > 0) {
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
  if (activeDownloadCount() > 0) {
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
      queueSnapshot = res.items;
      const activeOrPending = res.items.filter(
        (i) => i.status === "downloading" || i.status === "pending",
      );
      setActiveDownloadCount(activeOrPending.length);

      setDownloadingChapterPermalinks(
        new Set(res.items.filter((i) => i.status === "downloading").map((i) => i.chapter_permalink)),
      );

      if (!res.items.some((i) => i.status === "downloading")) {
        resetDownloadSpeedAccumulators();
      }
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

        if (pageBytes > 0 && payload.status === "downloading") {
          if (payload.chapter_permalink !== lastChapterPermalink) {
            // Chapter transition: per-page averages from the previous chapter
            // would skew the new chapter's ETA.
            lastSampleTime = 0;
            totalDownloadedBytes = 0;
            totalDownloadedPages = 0;
            lastChapterPermalink = payload.chapter_permalink;
          }
          sessionBytesTotal += pageBytes;
          setSessionDownloadedBytes(sessionBytesTotal);

          // The first sample after a reset only seeds the clock; measuring dt
          // from mount/resume would poison the EMA with a stale interval.
          if (lastSampleTime === 0) {
            lastSampleTime = now;
          } else {
            const dt = (now - lastSampleTime) / 1000;
            if (dt > 0.15) {
              const instant = pageBytes / dt;
              speedEMA = speedEMA === 0 ? instant : speedEMA * 0.65 + instant * 0.35;
              setDownloadSpeedBps(speedEMA);
              lastSampleTime = now;

              // Bytes and pages are gated on the same dt condition so
              // avgBytesPerPage is not systematically underestimated.
              totalDownloadedBytes += pageBytes;
              totalDownloadedPages += 1;

              const pendingItems = queueSnapshot.filter(
                (i) => i.status === "pending" || i.status === "downloading",
              );
              const currentActive = queueSnapshot.find(
                (i) => i.chapter_permalink === payload.chapter_permalink,
              );
              const remainingPagesInCurrent = Math.max(0, payload.total_pages - payload.pages_done);
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
              } else if (currentActive && payload.total_pages > 0) {
                const estTotalBytes = payload.total_pages * pageBytes;
                const estRemaining = Math.max(
                  0,
                  estTotalBytes - (payload.bytes_done || payload.pages_done * pageBytes),
                );
                if (speedEMA > 1000) {
                  setDownloadEtaSeconds(estRemaining / speedEMA);
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
          void refreshState();
          if (payload.status === "done") {
            // Sweep the cache back under the user ceiling once a chapter
            // lands (QoL-D3); no-op unless auto-prune is enabled.
            void maybeAutoPruneCache(downloadingChapterPermalinks());
          }
        }
      }
    }).then((unlisten) => {
      unlistenProgress = unlisten;
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
