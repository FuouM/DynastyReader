import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  cancelDownload,
  clearCompletedDownloads,
  getDownloadQueue,
  pauseDownloads,
  resumeDownloads,
  retryFailedDownloads,
  type DownloadQueueItem,
} from "../ipc";
import { formatBytes } from "../lib/format";
import { errorMessage } from "../utils/errors";
import { showBanner } from "../stores/topbar";
import { GroupBox } from "../components/GroupBox";
import {
  DownloadIcon,
  RefreshIcon,
  TrashIcon,
  PlayIcon,
  PauseIcon,
  SpeedIcon,
  HourglassIcon,
  CloseIcon,
  CheckIcon,
  ChevronDownIcon,
} from "../components/Icon";

export interface DownloadProgressPayload {
  chapter_permalink: string;
  series_permalink: string;
  pages_done: number;
  total_pages: number;
  bytes_done?: number;
  last_page_bytes?: number;
  status: string;
}

export interface SeriesDownloadGroup {
  series_permalink: string;
  series_title: string;
  items: DownloadQueueItem[];
  latestQueuedAt: number;
  totalChapters: number;
  completedChapters: number;
  failedChapters: number;
  downloadingItem?: DownloadQueueItem;
  overallPercent: number;
  status: "downloading" | "paused" | "failed" | "pending" | "done";
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec <= 0 || !isFinite(bytesPerSec)) return "";
  return `${formatBytes(bytesPerSec)}/s`;
}

function formatEta(seconds: number): string {
  if (seconds <= 0 || !isFinite(seconds) || seconds > 86400) return "";
  if (seconds < 60) return `~${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (mins < 60) return `~${mins}m ${secs > 0 ? `${secs}s` : ""}`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `~${hours}h ${remMins}m`;
}

export function DownloadManager(props: { onComplete?: () => void }) {
  const [items, setItems] = createSignal<DownloadQueueItem[]>([]);
  const QUEUE_COLLAPSED_KEY = "ds_download_queue_collapsed";
  const [isCollapsed, setIsCollapsed] = createSignal(
    typeof window !== "undefined" ? localStorage.getItem(QUEUE_COLLAPSED_KEY) === "true" : false,
  );
  const [isPaused, setIsPaused] = createSignal(false);
  const [expandedSeries, setExpandedSeries] = createSignal<Set<string>>(new Set());
  const [activeProgress, setActiveProgress] = createSignal<Record<string, { done: number; total: number; bytes: number }>>({});
  const [speedBps, setSpeedBps] = createSignal(0);
  const [etaSeconds, setEtaSeconds] = createSignal(0);
  const [sessionBytes, setSessionBytes] = createSignal(0);

  const handleToggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(QUEUE_COLLAPSED_KEY, String(next));
      } catch {}
      return next;
    });
  };

  let unlisten: UnlistenFn | null = null;
  let pollTimer: number | null = null;
  let lastSampleTime = Date.now();
  let totalDownloadedBytes = 0;
  let totalDownloadedPages = 0;

  const refreshQueue = async () => {
    try {
      const res = await getDownloadQueue();
      setItems(res.items);
      if (!res.items.some((i) => i.status === "downloading")) {
        setSpeedBps(0);
        setEtaSeconds(0);
      }
    } catch {
      // Best-effort
    }
  };

  onMount(async () => {
    await refreshQueue();

    try {
      unlisten = await listen<DownloadProgressPayload>("download://progress", (event) => {
        const payload = event.payload;
        if (payload) {
          const now = Date.now();
          const pageBytes = payload.last_page_bytes || 200_000;

          if (pageBytes > 0 && payload.status === "downloading") {
            const dt = (now - lastSampleTime) / 1000;
            if (dt > 0.15) {
              const instantSpeed = pageBytes / dt;
              const prev = speedBps();
              const ema = prev === 0 ? instantSpeed : prev * 0.7 + instantSpeed * 0.3;
              setSpeedBps(ema);
              lastSampleTime = now;

              totalDownloadedBytes += pageBytes;
              setSessionBytes(totalDownloadedBytes);

              const currentQueue = items();
              const pendingItems = currentQueue.filter((i) => i.status === "pending" || i.status === "downloading");
              const currentActive = currentQueue.find((i) => i.chapter_permalink === payload.chapter_permalink);
              const remainingPagesInCurrent = Math.max(0, payload.total_pages - payload.pages_done);
              const otherPendingPages = pendingItems
                .filter((i) => i.chapter_permalink !== payload.chapter_permalink)
                .reduce((acc, i) => acc + (i.total_pages > 0 ? i.total_pages : 20), 0);
              const totalRemainingPages = remainingPagesInCurrent + otherPendingPages;

              if (totalDownloadedPages > 0) {
                const avgBytesPerPage = totalDownloadedBytes / totalDownloadedPages;
                const remainingBytesEst = totalRemainingPages * avgBytesPerPage;
                if (ema > 1000) {
                  setEtaSeconds(remainingBytesEst / ema);
                }
              } else if (currentActive && payload.total_pages > 0) {
                const estTotalBytes = payload.total_pages * pageBytes;
                const estRemaining = Math.max(0, estTotalBytes - (payload.bytes_done || payload.pages_done * pageBytes));
                if (ema > 1000) {
                  setEtaSeconds(estRemaining / ema);
                }
              }
            }
            totalDownloadedPages += 1;
          }

          setActiveProgress((prev) => ({
            ...prev,
            [payload.chapter_permalink]: {
              done: payload.pages_done,
              total: payload.total_pages,
              bytes: payload.bytes_done || 0,
            },
          }));

          setItems((prev) =>
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

          if (payload.status === "done" || payload.status === "failed" || payload.status === "cancelled") {
            void refreshQueue();
            if (payload.status === "done") {
              props.onComplete?.();
            }
          }
        }
      });
    } catch {
      // Outside Tauri
    }

    // Gentle 3s poll when there are active/pending items
    pollTimer = window.setInterval(() => {
      const list = items();
      const hasActive = list.some((i) => i.status === "downloading" || i.status === "pending");
      if (hasActive) {
        void refreshQueue();
      }
    }, 3000);
  });

  onCleanup(() => {
    if (unlisten) unlisten();
    if (pollTimer !== null) clearInterval(pollTimer);
  });
  const totalCount = () => items().length;
  const activeOrPendingCount = () =>
    items().filter((i) => i.status === "downloading" || i.status === "pending").length;
  const allFailedCount = () => items().filter((i) => i.status === "failed").length;
  const allCompletedCount = () => items().filter((i) => i.status === "done").length;

  // Group items by Series, sorted by most recent activity (active first, then latestQueuedAt DESC)
  const seriesGroups = (): SeriesDownloadGroup[] => {
    const list = items();
    const map = new Map<string, DownloadQueueItem[]>();
    for (const item of list) {
      const key = item.series_permalink || "_singles";
      let arr = map.get(key);
      if (!arr) {
        arr = [];
        map.set(key, arr);
      }
      arr.push(item);
    }

    const groups: SeriesDownloadGroup[] = [];
    const progMap = activeProgress();
    const paused = isPaused();

    for (const [perm, chs] of map.entries()) {
      chs.sort((a, b) => a.chapter_index - b.chapter_index);

      const series_title = chs[0]?.series_title || (perm === "_singles" ? "Individual Chapters" : perm);
      const latestQueuedAt = Math.max(...chs.map((c) => c.queued_at));
      const totalChapters = chs.length;
      const completedChapters = chs.filter((c) => c.status === "done").length;
      const failedChapters = chs.filter((c) => c.status === "failed").length;
      const downloadingItem = chs.find((c) => c.status === "downloading");

      let currentChapterRatio = 0;
      if (downloadingItem) {
        const prog = progMap[downloadingItem.chapter_permalink];
        const done = prog?.done ?? downloadingItem.progress;
        const total = (prog?.total ?? downloadingItem.total_pages) || 1;
        currentChapterRatio = Math.min(1, done / total);
      }

      const overallPercent =
        totalChapters > 0
          ? Math.min(100, Math.round(((completedChapters + currentChapterRatio) / totalChapters) * 100))
          : 0;

      let status: SeriesDownloadGroup["status"] = "pending";
      const hasPending = chs.some((c) => c.status === "pending");
      if (downloadingItem) {
        status = paused ? "paused" : "downloading";
      } else if (paused && hasPending) {
        status = "paused";
      } else if (hasPending && (completedChapters > 0 || list.some((i) => i.status === "downloading"))) {
        // Smooth transition between chapters: keep active downloading status
        status = paused ? "paused" : "downloading";
      } else if (failedChapters > 0 && completedChapters + failedChapters === totalChapters) {
        status = "failed";
      } else if (completedChapters === totalChapters) {
        status = "done";
      } else if (failedChapters > 0) {
        status = "failed";
      }

      groups.push({
        series_permalink: perm,
        series_title,
        items: chs,
        latestQueuedAt,
        totalChapters,
        completedChapters,
        failedChapters,
        downloadingItem,
        overallPercent,
        status,
      });
    }

    // Sort order:
    // 1. Actively downloading series
    // 2. Paused / pending series with incomplete chapters
    // 3. Failed series
    // 4. Completed series
    // Sub-sorted by latestQueuedAt descending
    return groups.sort((a, b) => {
      const getPriority = (g: SeriesDownloadGroup) => {
        if (g.status === "downloading") return 1;
        if (g.status === "paused" || g.status === "pending") return 2;
        if (g.status === "failed") return 3;
        return 4; // done
      };
      const priA = getPriority(a);
      const priB = getPriority(b);
      if (priA !== priB) return priA - priB;
      return b.latestQueuedAt - a.latestQueuedAt;
    });
  };

  const toggleExpand = (seriesPerm: string) => {
    setExpandedSeries((prev) => {
      const next = new Set(prev);
      if (next.has(seriesPerm)) {
        next.delete(seriesPerm);
      } else {
        next.add(seriesPerm);
      }
      return next;
    });
  };

  const handlePauseResume = async () => {
    try {
      if (isPaused()) {
        await resumeDownloads();
        setIsPaused(false);
      } else {
        await pauseDownloads();
        setIsPaused(true);
        setSpeedBps(0);
        setEtaSeconds(0);
      }
      await refreshQueue();
    } catch (err) {
      showBanner(errorMessage(err));
    }
  };

  const handleCancelChapter = async (chapterPermalink: string) => {
    try {
      await cancelDownload(chapterPermalink);
      await refreshQueue();
    } catch (err) {
      showBanner(errorMessage(err));
    }
  };

  const handleCancelSeries = async (group: SeriesDownloadGroup) => {
    try {
      for (const item of group.items) {
        if (item.status === "pending" || item.status === "downloading") {
          await cancelDownload(item.chapter_permalink);
        }
      }
      await refreshQueue();
    } catch (err) {
      showBanner(errorMessage(err));
    }
  };

  const handleClearSeries = async (seriesPermalink: string) => {
    try {
      await clearCompletedDownloads(seriesPermalink);
      await refreshQueue();
    } catch (err) {
      showBanner(errorMessage(err));
    }
  };

  const handleRetrySeries = async (seriesPermalink: string) => {
    try {
      await retryFailedDownloads(seriesPermalink);
      await refreshQueue();
    } catch (err) {
      showBanner(errorMessage(err));
    }
  };

  const handleRetryAll = async () => {
    const failed = seriesGroups().filter((g) => g.failedChapters > 0);
    try {
      for (const g of failed) {
        await retryFailedDownloads(g.series_permalink);
      }
      await refreshQueue();
    } catch (err) {
      showBanner(errorMessage(err));
    }
  };

  const handleClearAllCompleted = async () => {
    const groups = seriesGroups().filter((g) => g.completedChapters > 0);
    try {
      for (const g of groups) {
        await clearCompletedDownloads(g.series_permalink);
      }
      await refreshQueue();
    } catch (err) {
      showBanner(errorMessage(err));
    }
  };

  return (
    <Show when={totalCount() > 0}>
      <GroupBox
        class="ds-download-manager-group ds-mb-8"
        collapsible={true}
        collapsed={isCollapsed()}
        onToggle={handleToggleCollapse}
        title={
          <span class="ds-icon-text">
            <DownloadIcon />
            <span>Download Queue ({activeOrPendingCount()} active)</span>
          </span>
        }
        actions={
          <div class="ds-download-manager-header-actions">
            <Show when={activeOrPendingCount() > 0}>
              <button
                type="button"
                class="win-button"
                onClick={handlePauseResume}
                title={isPaused() ? "Resume downloads" : "Pause downloads"}
              >
                <Show when={isPaused()} fallback={<><PauseIcon /> Pause</>}>
                  <PlayIcon /> Resume
                </Show>
              </button>
            </Show>

            <Show when={allFailedCount() > 0}>
              <button
                type="button"
                class="win-button"
                onClick={handleRetryAll}
                title="Retry all failed downloads"
                style="color:var(--ds-warn-text);"
              >
                <RefreshIcon /> Retry Failed
              </button>
            </Show>

            <Show when={allCompletedCount() > 0 && activeOrPendingCount() === 0}>
              <button
                type="button"
                class="win-button"
                onClick={handleClearAllCompleted}
                title="Clear all completed download entries"
              >
                <TrashIcon /> Clear Completed
              </button>
            </Show>
          </div>
        }
      >
        {/* Series Grouped Download Cards */}
        <div class="ds-download-series-list">
          <For each={seriesGroups()}>
            {(group) => {
              const isExpanded = () => expandedSeries().has(group.series_permalink);
              const isAct = () => group.status === "downloading";
              const isFail = () => group.status === "failed";
              const isDone = () => group.status === "done";
              const isPsd = () => group.status === "paused";

              return (
                <div class="ds-download-series-item">
                  {/* Top Row: Series Title + Status + Action Buttons */}
                  <div class="ds-download-series-header">
                    <div class="ds-download-series-title-row">
                      <span class="ds-download-series-title" title={group.series_title}>
                        {group.series_title}
                      </span>
                      <Show when={isAct()}>
                        <span class="ds-status-pill fresh">
                          Downloading
                        </span>
                      </Show>
                      <Show when={isPsd()}>
                        <span class="ds-status-pill">
                          Paused
                        </span>
                      </Show>
                      <Show when={isDone()}>
                        <span class="ds-status-pill" style="color:var(--ds-status-fresh-text);">
                          <CheckIcon size={11} /> Complete
                        </span>
                      </Show>
                      <Show when={isFail()}>
                        <span class="ds-status-pill" style="color:var(--ds-danger-text);">
                          {group.failedChapters} Failed
                        </span>
                      </Show>
                    </div>

                    <div class="ds-download-series-actions">
                      <Show when={group.failedChapters > 0}>
                        <button
                          type="button"
                          class="win-button ds-btn-sm"
                          onClick={() => void handleRetrySeries(group.series_permalink)}
                          title="Retry failed chapters in this series"
                          style="color:var(--ds-warn-text);"
                        >
                          <RefreshIcon /> Retry
                        </button>
                      </Show>

                      <Show when={isDone()}>
                        <button
                          type="button"
                          class="win-button ds-btn-sm"
                          onClick={() => void handleClearSeries(group.series_permalink)}
                          title="Clear completed chapters"
                        >
                          <TrashIcon /> Clear
                        </button>
                      </Show>

                      <Show when={!isDone()}>
                        <button
                          type="button"
                          class="win-button ds-btn-sm"
                          onClick={() => void handleCancelSeries(group)}
                          title="Cancel all pending chapters in this series"
                        >
                          Cancel
                        </button>
                      </Show>

                      <button
                        type="button"
                        class="win-button ds-btn-sm ds-btn-icon"
                        onClick={() => toggleExpand(group.series_permalink)}
                        title={isExpanded() ? "Hide chapter list" : "Show chapter list"}
                      >
                        <ChevronDownIcon class={isExpanded() ? "ds-rotate-180" : ""} />
                      </button>
                    </div>
                  </div>

                  {/* Second Row: Detailed Status & Live Metrics + Percent */}
                  <div class="ds-download-series-subrow">
                    <div class="ds-download-series-subtext ds-muted">
                      <Show
                        when={group.downloadingItem}
                        fallback={
                          <span>
                            {group.completedChapters}/{group.totalChapters} chapters complete
                            <Show when={group.status === "downloading" && group.completedChapters < group.totalChapters}>
                              {" "}· Preparing next chapter…
                            </Show>
                            <Show when={group.failedChapters > 0}> · {group.failedChapters} failed</Show>
                          </span>
                        }
                      >
                        {(down) => (
                          <span>
                            {group.completedChapters + 1}/{group.totalChapters}: {down().chapter_title} ({activeProgress()[down().chapter_permalink]?.done ?? down().progress}/{(activeProgress()[down().chapter_permalink]?.total ?? down().total_pages) || 1} pages)
                            <Show when={isAct() && speedBps() > 0}>
                              {" "}· <span style="color:var(--sys-primary);font-weight:600;"><SpeedIcon size={11} /> {formatSpeed(speedBps())}</span>
                              <Show when={sessionBytes() > 0}>
                                <span class="ds-muted"> ({formatBytes(sessionBytes())})</span>
                              </Show>
                            </Show>
                            <Show when={isAct() && etaSeconds() > 0}>
                              {" "}· {formatEta(etaSeconds())} remaining
                            </Show>
                          </span>
                        )}
                      </Show>
                    </div>

                    <div class="ds-download-percent-badge">
                      {group.overallPercent}%
                    </div>
                  </div>

                  {/* Third Row: Full-width Progress Bar */}
                  <div class="ds-progress-track">
                    <div
                      class={`ds-progress-fill${isDone() ? " done" : isFail() ? " fail" : ""}`}
                      style={{
                        width: `${group.overallPercent}%`,
                      }}
                    />
                  </div>
                  {/* Expandable Chapter Detail Rows */}
                  <Show when={isExpanded()}>
                    <div class="ds-download-chapters-drawer">
                      <For each={group.items}>
                        {(ch) => {
                          const isChAct = () => ch.status === "downloading";
                          const isChDone = () => ch.status === "done";
                          const isChFail = () => ch.status === "failed";
                          const chProg = () => activeProgress()[ch.chapter_permalink];
                          const chDone = () => chProg()?.done ?? ch.progress;
                          const chTotal = () => chProg()?.total ?? ch.total_pages;

                          return (
                            <div class="ds-download-chapter-row">
                              <div class="ds-download-chapter-label">
                                <span>{ch.chapter_title}</span>
                                <span class="ds-muted ds-download-chapter-status">
                                  <Show when={isChAct()}>
                                    <span style="color:var(--sys-primary);font-weight:600;">
                                      Downloading {chDone()}/{chTotal() > 0 ? chTotal() : "?"} pages
                                    </span>
                                  </Show>
                                  <Show when={isChDone()}>
                                    <span style="color:var(--ds-status-fresh-text);">
                                      <CheckIcon size={10} /> Complete
                                    </span>
                                  </Show>
                                  <Show when={isChFail()}>
                                    <span style="color:var(--ds-danger-text);">
                                      <CloseIcon size={10} /> Failed{ch.error_msg ? `: ${ch.error_msg}` : ""}
                                    </span>
                                  </Show>
                                  <Show when={ch.status === "pending"}>
                                    <span><HourglassIcon size={10} /> Queued</span>
                                  </Show>
                                </span>
                              </div>

                              <Show when={!isChDone()}>
                                <button
                                  type="button"
                                  class="win-button ds-btn-sm ds-btn-icon ds-chapter-cancel-btn"
                                  onClick={() => void handleCancelChapter(ch.chapter_permalink)}
                                  title="Cancel chapter download"
                                >
                                  <CloseIcon size={10} />
                                </button>
                              </Show>
                            </div>
                          );
                        }}
                      </For>
                    </div>
                  </Show>
                </div>
              );
            }}
          </For>
        </div>
      </GroupBox>
    </Show>
  );
}
