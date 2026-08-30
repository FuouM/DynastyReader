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
import { CloudDownloadIcon, RefreshIcon } from "../components/Icon";

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
  const [isPaused, setIsPaused] = createSignal(false);
  const [expandedSeries, setExpandedSeries] = createSignal<Set<string>>(new Set());
  const [activeProgress, setActiveProgress] = createSignal<Record<string, { done: number; total: number; bytes: number }>>({});
  const [speedBps, setSpeedBps] = createSignal(0);
  const [etaSeconds, setEtaSeconds] = createSignal(0);
  const [sessionBytes, setSessionBytes] = createSignal(0);

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

          if (pageBytes > 0) {
            totalDownloadedBytes += pageBytes;
            totalDownloadedPages += 1;
            setSessionBytes(totalDownloadedBytes);

            const dt = (now - lastSampleTime) / 1000;
            if (dt > 0.15) {
              const instantSpeed = pageBytes / dt;
              setSpeedBps((cur) => (cur === 0 ? instantSpeed : cur * 0.65 + instantSpeed * 0.35));
              lastSampleTime = now;

              // Calculate ETA across active/pending chapters in queue
              const activeSpeed = speedBps();
              if (activeSpeed > 0) {
                const list = items();
                let remainingPages = 0;
                for (const item of list) {
                  if (item.status === "pending") {
                    remainingPages += item.total_pages > 0 ? item.total_pages : 24;
                  } else if (item.status === "downloading") {
                    const chTotal = payload.total_pages || item.total_pages || 24;
                    remainingPages += Math.max(0, chTotal - payload.pages_done);
                  }
                }
                const avgBytesPerPage = totalDownloadedPages > 0 ? totalDownloadedBytes / totalDownloadedPages : 250_000;
                const estRemainingBytes = remainingPages * avgBytesPerPage;
                setEtaSeconds(estRemainingBytes / activeSpeed);
              }
            }
          }

          setActiveProgress((prev) => ({
            ...prev,
            [payload.chapter_permalink]: {
              done: payload.pages_done,
              total: payload.total_pages,
              bytes: payload.bytes_done || (prev[payload.chapter_permalink]?.bytes ?? 0) + pageBytes,
            },
          }));

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
    if (pollTimer !== null) window.clearInterval(pollTimer);
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

    // Sort series groups: active on top, then most recent queued_at DESC
    groups.sort((a, b) => {
      const aActive = a.status === "downloading" || (a.status === "paused" && a.downloadingItem !== undefined);
      const bActive = b.status === "downloading" || (b.status === "paused" && b.downloadingItem !== undefined);
      if (aActive && !bActive) return -1;
      if (!aActive && bActive) return 1;
      return b.latestQueuedAt - a.latestQueuedAt;
    });

    return groups;
  };

  const toggleExpand = (perm: string) => {
    const s = new Set(expandedSeries());
    if (s.has(perm)) s.delete(perm);
    else s.add(perm);
    setExpandedSeries(s);
  };

  const handlePauseResume = async () => {
    try {
      if (isPaused()) {
        await resumeDownloads();
        setIsPaused(false);
        showBanner("Downloads resumed");
      } else {
        await pauseDownloads();
        setIsPaused(true);
        setSpeedBps(0);
        setEtaSeconds(0);
        showBanner("Downloads paused");
      }
      await refreshQueue();
    } catch (err) {
      showBanner(errorMessage(err));
    }
  };

  const handleCancelChapter = async (perm: string) => {
    try {
      await cancelDownload(perm);
      await refreshQueue();
    } catch (err) {
      showBanner(errorMessage(err));
    }
  };

  const handleCancelSeries = async (group: SeriesDownloadGroup) => {
    try {
      for (const item of group.items) {
        if (item.status === "downloading" || item.status === "pending") {
          await cancelDownload(item.chapter_permalink);
        }
      }
      await refreshQueue();
    } catch (err) {
      showBanner(errorMessage(err));
    }
  };

  const handleRetrySeries = async (seriesPerm: string) => {
    try {
      await retryFailedDownloads(seriesPerm);
      setIsPaused(false);
      await refreshQueue();
      showBanner("Retrying failed downloads for series");
    } catch (err) {
      showBanner(errorMessage(err));
    }
  };

  const handleClearSeries = async (seriesPerm: string) => {
    try {
      await clearCompletedDownloads(seriesPerm);
      await refreshQueue();
    } catch (err) {
      showBanner(errorMessage(err));
    }
  };

  const handleRetryAll = async () => {
    const groups = seriesGroups().filter((g) => g.failedChapters > 0);
    try {
      for (const g of groups) {
        await retryFailedDownloads(g.series_permalink);
      }
      setIsPaused(false);
      await refreshQueue();
      showBanner(`Retrying all failed downloads`);
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
      <div class="ds-download-manager">
        {/* Global Toolbar Header */}
        <div class="ds-download-manager-header">
          <CloudDownloadIcon
            class={activeOrPendingCount() > 0 && !isPaused() ? "ds-spin" : ""}
            style="font-size:16px;color:var(--sys-primary,#0078d4);flex-shrink:0;"
          />

          <div style="flex:1;min-width:0;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <span style="font-weight:600;">Download Queue</span>
            <span class="ds-status-pill" style="font-size:10px;padding:1px 6px;">
              {activeOrPendingCount()} active · {seriesGroups().length} series
            </span>

            {/* Live Speed & ETA Badges */}
            <Show when={activeOrPendingCount() > 0 && !isPaused() && speedBps() > 0}>
              <span
                style="font-size:11px;font-weight:600;color:var(--sys-primary,#0078d4);display:inline-flex;align-items:center;gap:4px;background:rgba(0,120,212,0.08);padding:1px 6px;border-radius:4px;"
              >
                <span>⚡ {formatSpeed(speedBps())}</span>
                <Show when={etaSeconds() > 0}>
                  <span class="ds-muted" style="font-weight:normal;">({formatEta(etaSeconds())} left)</span>
                </Show>
                <Show when={sessionBytes() > 0}>
                  <span class="ds-muted" style="font-weight:normal;">· {formatBytes(sessionBytes())}</span>
                </Show>
              </span>
            </Show>
          </div>

          <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
            <Show when={activeOrPendingCount() > 0}>
              <button
                class="win-button ds-btn-sm"
                onClick={handlePauseResume}
                title={isPaused() ? "Resume downloads" : "Pause downloads"}
              >
                {isPaused() ? "▶ Resume All" : "⏸ Pause All"}
              </button>
            </Show>

            <Show when={allFailedCount() > 0}>
              <button
                class="win-button ds-btn-sm"
                onClick={handleRetryAll}
                title="Retry all failed downloads"
                style="color:var(--ds-warn-text,#d97706);"
              >
                <RefreshIcon /> Retry All Failed
              </button>
            </Show>

            <Show when={allCompletedCount() > 0 && activeOrPendingCount() === 0}>
              <button
                class="win-button ds-btn-sm"
                onClick={handleClearAllCompleted}
                title="Clear all completed download entries"
              >
                Clear Completed
              </button>
            </Show>
          </div>
        </div>

        {/* Series Grouped Download Cards */}
        <div style="display:flex;flex-direction:column;gap:1px;background:var(--sys-border-light,#e8e8e8);">
          <For each={seriesGroups()}>
            {(group) => {
              const isExpanded = () => expandedSeries().has(group.series_permalink);
              const isAct = () => group.status === "downloading";
              const isFail = () => group.status === "failed";
              const isDone = () => group.status === "done";
              const isPsd = () => group.status === "paused";

              return (
                <div style="background:var(--sys-window-bg,#fff);padding:8px 12px;display:flex;flex-direction:column;gap:6px;">
                  {/* Series Info Row */}
                  <div style="display:flex;align-items:center;gap:10px;">
                    <div style="flex:1;min-width:0;">
                      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                        <span style="font-weight:600;font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                          {group.series_title}
                        </span>
                        <Show when={isAct()}>
                          <span class="ds-status-pill fresh" style="font-size:9.5px;padding:0 5px;">
                            Downloading
                          </span>
                        </Show>
                        <Show when={isPsd()}>
                          <span class="ds-status-pill" style="font-size:9.5px;padding:0 5px;">
                            Paused
                          </span>
                        </Show>
                        <Show when={isDone()}>
                          <span class="ds-status-pill" style="font-size:9.5px;padding:0 5px;color:var(--ds-success-text,#22c55e);">
                            ✓ Complete
                          </span>
                        </Show>
                        <Show when={isFail()}>
                          <span class="ds-status-pill" style="font-size:9.5px;padding:0 5px;color:var(--ds-warn-text,#ef4444);">
                            {group.failedChapters} Failed
                          </span>
                        </Show>
                        <Show when={isAct() && speedBps() > 0}>
                          <span class="ds-muted" style="font-size:10.5px;font-weight:600;color:var(--sys-primary,#0078d4);">
                            ⚡ {formatSpeed(speedBps())}
                          </span>
                        </Show>
                      </div>

                      <div class="ds-muted" style="font-size:11px;margin-top:2px;">
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
                              <Show when={isAct() && etaSeconds() > 0}>
                                {" "}· {formatEta(etaSeconds())} remaining
                              </Show>
                            </span>
                          )}
                        </Show>
                      </div>
                    </div>

                    {/* Progress Percentage Badge */}
                    <div style="font-size:12px;font-weight:700;color:var(--sys-primary,#0078d4);white-space:nowrap;">
                      {group.overallPercent}%
                    </div>

                    {/* Series Actions */}
                    <div style="display:flex;align-items:center;gap:4px;flex-shrink:0;">
                      <Show when={group.failedChapters > 0}>
                        <button
                          class="win-button ds-btn-sm"
                          onClick={() => void handleRetrySeries(group.series_permalink)}
                          title="Retry failed chapters in this series"
                          style="color:var(--ds-warn-text,#d97706);padding:0 6px;"
                        >
                          <RefreshIcon /> Retry
                        </button>
                      </Show>

                      <Show when={isDone()}>
                        <button
                          class="win-button ds-btn-sm"
                          onClick={() => void handleClearSeries(group.series_permalink)}
                          title="Clear completed chapters"
                          style="padding:0 6px;"
                        >
                          Clear
                        </button>
                      </Show>

                      <Show when={!isDone()}>
                        <button
                          class="win-button ds-btn-sm"
                          onClick={() => void handleCancelSeries(group)}
                          title="Cancel all pending chapters in this series"
                          style="padding:0 6px;"
                        >
                          Cancel
                        </button>
                      </Show>

                      <button
                        class="win-button ds-btn-sm ds-btn-icon"
                        onClick={() => toggleExpand(group.series_permalink)}
                        title={isExpanded() ? "Hide chapters" : "Show chapters"}
                      >
                        {isExpanded() ? "▴" : "▾"}
                      </button>
                    </div>
                  </div>

                  {/* Unified Series Progress Bar */}
                  <div class="ds-download-progress-track" style="height:5px;">
                    <div
                      class="ds-download-progress-fill"
                      style={{
                        width: `${group.overallPercent}%`,
                        background: isDone()
                          ? "var(--ds-success-text,#22c55e)"
                          : isFail()
                            ? "var(--ds-warn-text,#ef4444)"
                            : "var(--sys-primary,#0078d4)",
                      }}
                    />
                  </div>

                  {/* Expandable Chapter Detail Rows */}
                  <Show when={isExpanded()}>
                    <div style="display:flex;flex-direction:column;gap:4px;margin-top:4px;padding-top:4px;border-top:1px dashed var(--sys-border-light,#eee);">
                      <For each={group.items}>
                        {(ch) => {
                          const isChAct = () => ch.status === "downloading";
                          const isChDone = () => ch.status === "done";
                          const isChFail = () => ch.status === "failed";
                          const chProg = () => activeProgress()[ch.chapter_permalink];
                          const chDone = () => chProg()?.done ?? ch.progress;
                          const chTotal = () => chProg()?.total ?? ch.total_pages;

                          return (
                            <div
                              style="display:flex;align-items:center;gap:8px;font-size:11px;padding:2px 4px;border-radius:3px;background:var(--sys-surface-2,#f8f9fa);"
                            >
                              <div style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                                <span>{ch.chapter_title}</span>
                                <span class="ds-muted" style="margin-left:6px;">
                                  <Show when={isChAct()}>
                                    <span style="color:var(--sys-primary,#0078d4);font-weight:600;">
                                      Downloading {chDone()}/{chTotal() > 0 ? chTotal() : "?"} pages
                                    </span>
                                  </Show>
                                  <Show when={isChDone()}>
                                    <span style="color:var(--ds-success-text,#22c55e);">✓ Done</span>
                                  </Show>
                                  <Show when={isChFail()}>
                                    <span style="color:var(--ds-warn-text,#ef4444);">
                                      ✕ Failed{ch.error_msg ? `: ${ch.error_msg}` : ""}
                                    </span>
                                  </Show>
                                  <Show when={ch.status === "pending"}>
                                    <span>⏱ Queued</span>
                                  </Show>
                                </span>
                              </div>

                              <Show when={!isChDone()}>
                                <button
                                  class="win-button ds-btn-sm ds-btn-icon"
                                  style="height:20px;min-height:20px;width:20px;font-size:10px;padding:0;"
                                  onClick={() => void handleCancelChapter(ch.chapter_permalink)}
                                  title="Cancel chapter download"
                                >
                                  ✕
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
      </div>
    </Show>
  );
}
