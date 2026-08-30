import { createSignal } from "solid-js";
import { listen } from "@tauri-apps/api/event";
import { getDownloadQueue, pauseDownloads, resumeDownloads } from "../ipc";
import { isAndroid } from "./platform";
import { formatBytes } from "../lib/format";

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
const [activeSeriesName, setActiveSeriesName] = createSignal<string | null>(null);
const [activeChapterName, setActiveChapterName] = createSignal<string | null>(null);

export { activeDownloadCount, downloadSpeedBps, activeSeriesName, activeChapterName };

export function formatDownloadSpeed(bytesPerSec: number): string {
  if (bytesPerSec <= 0 || !isFinite(bytesPerSec)) return "";
  return `${formatBytes(bytesPerSec)}/s`;
}

let initialized = false;
let lastSampleTime = Date.now();
let speedEMA = 0;

let wasAutoPausedByVisibility = false;

export function initGlobalDownloadListener(): void {
  if (initialized) return;
  initialized = true;

  const refreshState = async () => {
    try {
      const res = await getDownloadQueue();
      const activeOrPending = res.items.filter(
        (i) => i.status === "downloading" || i.status === "pending",
      );
      setActiveDownloadCount(activeOrPending.length);

      const active = res.items.find((i) => i.status === "downloading") || activeOrPending[0];
      if (active) {
        setActiveSeriesName(active.series_title);
        setActiveChapterName(active.chapter_title);
      } else {
        setActiveSeriesName(null);
        setActiveChapterName(null);
        setDownloadSpeedBps(0);
        speedEMA = 0;
      }
    } catch {
      // Best-effort
    }
  };

  void refreshState();

  try {
    void listen<DownloadProgressPayload>("download://progress", (event) => {
      const payload = event.payload;
      if (payload) {
        const now = Date.now();
        const pageBytes = payload.last_page_bytes || 200_000;

        if (pageBytes > 0 && payload.status === "downloading") {
          const dt = (now - lastSampleTime) / 1000;
          if (dt > 0.15) {
            const instant = pageBytes / dt;
            speedEMA = speedEMA === 0 ? instant : speedEMA * 0.65 + instant * 0.35;
            setDownloadSpeedBps(speedEMA);
            lastSampleTime = now;
          }
        }

        if (
          payload.status === "done" ||
          payload.status === "failed" ||
          payload.status === "cancelled"
        ) {
          void refreshState();
        }
      }
    });
  } catch {
    // Outside Tauri
  }

  // Poll every 3 seconds while downloads exist
  window.setInterval(() => {
    if (activeDownloadCount() > 0) {
      void refreshState();
    }
  }, 3000);

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
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
          void refreshState();
        }
      }
    });

    window.addEventListener("pagehide", () => {
      if (!isAndroid()) return;
      if (activeDownloadCount() > 0) {
        wasAutoPausedByVisibility = true;
        void pauseDownloads();
      }
    });

    window.addEventListener("pageshow", () => {
      if (!isAndroid()) return;
      if (wasAutoPausedByVisibility) {
        wasAutoPausedByVisibility = false;
        void resumeDownloads();
        void refreshState();
      }
    });
  }
}
