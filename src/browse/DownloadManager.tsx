import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  cancelDownload,
  clearCompletedDownloads,
  getDownloadQueue,
  pauseDownloads,
  resumeDownloads,
  retryChapterDownload,
  retryFailedDownloads,
  type DownloadQueueItem,
} from "../ipc";
import { formatBytes, formatSpeed, formatEta } from "../utils/formatting";
import { errorMessage } from "../utils/errors";
import { showBanner } from "../stores/topbar";
import { t } from "../i18n";
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
import {
  downloadSpeedBps as speedBps,
  downloadEtaSeconds as etaSeconds,
  sessionDownloadedBytes as sessionBytes,
  resetDownloadSpeedAccumulators,
  updateDownloadQueueSnapshot,
  type DownloadProgressPayload,
} from "../stores/download";

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

export type { DownloadProgressPayload };

export function DownloadManager(props: { onComplete?: () => void }) {
  const [items, setItems] = createSignal<DownloadQueueItem[]>([]);
  const QUEUE_COLLAPSED_KEY = "ds_download_queue_collapsed";
  const [isCollapsed, setIsCollapsed] = createSignal(
    typeof window !== "undefined" ? localStorage.getItem(QUEUE_COLLAPSED_KEY) === "true" : false,
  );
  const [isPaused, setIsPaused] = createSignal(false);
  const [expandedSeries, setExpandedSeries] = createSignal<Set<string>>(new Set());
  const [activeProgress, setActiveProgress] = createSignal<Record<string, { done: number; total: number; bytes: number }>>({});
  // Speed/ETA/session-bytes come from the single store stream (QoL-D4);
  // pause/resume and queue drains reset them centrally.
  // Per-row in-flight guards for retry/cancel buttons (QoL-D2).
  const [rowBusy, setRowBusy] = createSignal<Set<string>>(new Set());

  const handleToggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(QUEUE_COLLAPSED_KEY, String(next));
      } catch {}
      return next;
    });
  };

  const withRowGuard = async (key: string, fn: () => Promise<void>) => {
    if (rowBusy().has(key)) return;
    setRowBusy((prev) => new Set(prev).add(key));
    try {
      await fn();
    } catch (err) {
      showBanner(errorMessage(err));
    } finally {
      setRowBusy((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  let unlisten: UnlistenFn | null = null;
  let pollTimer: number | null = null;
  let mounted = true;

  const refreshQueue = async () => {
    try {
      const res = await getDownloadQueue();
      setItems(res.items);
      if (typeof res.paused === "boolean") {
        setIsPaused(res.paused);
      }
      updateDownloadQueueSnapshot(res.items);
      if (!res.items.some((i) => i.status === "downloading")) {
        resetDownloadSpeedAccumulators();
      }
    } catch {
      // Best-effort
    }
  };

  onMount(() => {
    void refreshQueue();

    try {
      void listen<DownloadProgressPayload>("download://progress", (event) => {
        const payload = event.payload;
        if (payload) {

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
            // Let the final state render once, then evict the entry so the
            // map does not grow for the whole session.
            const key = payload.chapter_permalink;
            window.setTimeout(() => {
              if (!mounted) return;
              setActiveProgress((prev) => {
                if (!(key in prev)) return prev;
                const next = { ...prev };
                delete next[key];
                return next;
              });
            }, 0);
            void refreshQueue();
            if (payload.status === "done") {
              props.onComplete?.();
            }
          }
        }
      }).then((fn) => {
        if (mounted) {
          unlisten = fn;
        } else {
          // Unmounted before registration resolved — release immediately.
          fn();
        }
      }).catch(() => {
        // Listener registration failed
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
    mounted = false;
    if (unlisten) unlisten();
    if (pollTimer !== null) clearInterval(pollTimer);
  });
  const totalCount = () => items().length;
  const activeOrPendingCount = () =>
    items().filter((i) => i.status === "downloading" || i.status === "pending").length;
  const allFailedCount = () => items().filter((i) => i.status === "failed").length;
  const allCompletedCount = () => items().filter((i) => i.status === "done").length;

  // Group items by Series, sorted by most recent activity (active first, then latestQueuedAt DESC)
  const seriesGroups = createMemo((): SeriesDownloadGroup[] => {
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
  });

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
      resetDownloadSpeedAccumulators();
      if (isPaused()) {
        await resumeDownloads();
        setIsPaused(false);
      } else {
        await pauseDownloads();
        setIsPaused(true);
      }
      await refreshQueue();
    } catch (err) {
      showBanner(errorMessage(err));
    }
  };

  const handleCancelChapter = async (chapterPermalink: string) => {
    await withRowGuard(`cancel:${chapterPermalink}`, async () => {
      await cancelDownload(chapterPermalink);
      await refreshQueue();
    });
  };

  const handleRetryChapter = async (chapterPermalink: string) => {
    await withRowGuard(`retry:${chapterPermalink}`, async () => {
      await retryChapterDownload(chapterPermalink);
      await refreshQueue();
    });
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
        class="ds-download-manager-group ds-mb-6"
        collapsible={true}
        collapsed={isCollapsed()}
        onToggle={handleToggleCollapse}
        title={
          <span class="ds-icon-text">
            <DownloadIcon />
            <span>{t("download.queueTitle", { count: activeOrPendingCount() })}</span>
          </span>
        }
        actions={
          <div class="ds-download-manager-header-actions">
            <Show when={activeOrPendingCount() > 0}>
              <button
                type="button"
                class="win-button ds-btn-sm"
                onClick={handlePauseResume}
                title={isPaused() ? t("download.resumeTooltip") : t("download.pauseTooltip")}
              >
                <Show when={isPaused()} fallback={<><PauseIcon /> {t("download.pause")}</>}>
                  <PlayIcon /> {t("download.resume")}
                </Show>
              </button>
            </Show>

            <Show when={allFailedCount() > 0}>
              <button
                type="button"
                class="win-button ds-btn-sm"
                onClick={handleRetryAll}
                title={t("download.retryAllFailedTooltip")}
                style="color:var(--ds-warn-text);"
              >
                <RefreshIcon /> {t("download.retryFailed")}
              </button>
            </Show>

            <Show when={allCompletedCount() > 0 && activeOrPendingCount() === 0}>
              <button
                type="button"
                class="win-button ds-btn-sm"
                onClick={handleClearAllCompleted}
                title={t("download.clearCompletedTooltip")}
              >
                <TrashIcon /> {t("download.clearCompleted")}
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
                <div class={`ds-download-series-item${isDone() ? " ds-download-series-item--done" : ""}${isAct() ? " ds-download-series-item--active" : ""}`}>
                  {/* Top Row: Series Title + Status + Action Buttons */}
                  <div class="ds-download-series-header">
                    <div class="ds-download-series-title-row">
                      <span class="ds-download-series-title" title={group.series_title}>
                        {group.series_title}
                      </span>
                      <Show when={isAct()}>
                        <span class="ds-status-pill fresh">
                          {t("download.statusDownloading")}
                        </span>
                      </Show>
                      <Show when={isPsd()}>
                        <span class="ds-status-pill">
                          {t("download.statusPaused")}
                        </span>
                      </Show>
                      <Show when={isDone()}>
                        <span class="ds-status-pill fresh">
                          <CheckIcon size={10} /> {t("download.statusComplete")}
                        </span>
                        <span class="ds-muted ds-download-series-count" style="font-size:10.5px;">
                          ({group.totalChapters} {t("downloaded.chaptersAbbrev")})
                        </span>
                      </Show>
                      <Show when={isFail()}>
                        <span class="ds-status-pill" style="color:var(--ds-danger-text);">
                          {t("download.statusFailed", { count: group.failedChapters })}
                        </span>
                      </Show>
                    </div>

                    <div class="ds-download-series-actions">
                      <Show when={group.failedChapters > 0}>
                        <button
                          type="button"
                          class="win-button ds-btn-sm"
                          onClick={() => void handleRetrySeries(group.series_permalink)}
                          title={t("download.retrySeriesFailedTooltip")}
                          style="color:var(--ds-warn-text);"
                        >
                          <RefreshIcon /> {t("common.retry")}
                        </button>
                      </Show>

                      <Show when={isDone()}>
                        <button
                          type="button"
                          class="win-button ds-btn-sm"
                          onClick={() => void handleClearSeries(group.series_permalink)}
                          title={t("download.clearSeriesCompletedTooltip")}
                        >
                          <TrashIcon /> {t("common.clear")}
                        </button>
                      </Show>

                      <Show when={!isDone()}>
                        <button
                          type="button"
                          class="win-button ds-btn-sm"
                          onClick={() => void handleCancelSeries(group)}
                          title={t("download.cancelSeriesPendingTooltip")}
                        >
                          {t("common.cancel")}
                        </button>
                      </Show>

                      <button
                        type="button"
                        class="win-button ds-btn-sm ds-btn-icon"
                        onClick={() => toggleExpand(group.series_permalink)}
                        title={isExpanded() ? t("download.hideChapters") : t("download.showChapters")}
                      >
                        <ChevronDownIcon class={isExpanded() ? "ds-rotate-180" : ""} />
                      </button>
                    </div>
                  </div>

                  {/* Live Status & Metrics + Progress Bar (for non-completed items) */}
                  <Show when={!isDone()}>
                    {/* Second Row: Detailed Status & Live Metrics + Percent */}
                    <div class="ds-download-series-subrow">
                      <div class="ds-download-series-subtext ds-muted">
                        <Show
                          when={group.downloadingItem}
                          fallback={
                            <span>
                              {t("download.chaptersComplete", { done: group.completedChapters, total: group.totalChapters })}
                              <Show when={group.status === "downloading" && group.completedChapters < group.totalChapters}>
                                {" "}· {t("download.preparingNextChapter")}
                              </Show>
                              <Show when={group.failedChapters > 0}> · {group.failedChapters} {t("download.failed")}</Show>
                            </span>
                          }
                        >
                          {(down) => (
                            <span>
                              {group.completedChapters + 1}/{group.totalChapters}: {down().chapter_title} ({activeProgress()[down().chapter_permalink]?.done ?? down().progress}/{(activeProgress()[down().chapter_permalink]?.total ?? down().total_pages) || 1} {t("downloaded.pagesLabel")})
                              <Show when={isAct() && speedBps() > 0}>
                                {" "}· <span style="color:var(--sys-link);font-weight:600;"><SpeedIcon size={10} /> {formatSpeed(speedBps())}</span>
                                <Show when={sessionBytes() > 0}>
                                  <span class="ds-muted"> ({formatBytes(sessionBytes())})</span>
                                </Show>
                              </Show>
                              <Show when={isAct() && etaSeconds() > 0}>
                                {" "}· {formatEta(etaSeconds())} {t("download.remaining")}
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
                        class={`ds-progress-fill${isFail() ? " fail" : ""}`}
                        style={{
                          width: `${group.overallPercent}%`,
                        }}
                      />
                    </div>
                  </Show>
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
                                    <span style="color:var(--sys-link);font-weight:600;">
                                      {t("download.downloadingPages", { done: chDone(), total: chTotal() > 0 ? chTotal() : "?" })}
                                    </span>
                                  </Show>
                                  <Show when={isChDone()}>
                                    <span style="color:var(--ds-status-fresh-text);">
                                      <CheckIcon size={10} /> {t("download.statusComplete")}
                                    </span>
                                  </Show>
                                  <Show when={isChFail()}>
                                    <span style="color:var(--ds-danger-text);">
                                      <CloseIcon size={10} /> {t("download.statusFailed", { count: 1 })}{ch.error_msg ? `: ${ch.error_msg}` : ""}
                                    </span>
                                  </Show>
                                  <Show when={ch.status === "pending"}>
                                    <span><HourglassIcon size={10} /> {t("download.statusQueued")}</span>
                                  </Show>
                                </span>
                              </div>

                              <Show when={isChFail()}>
                                <button
                                  type="button"
                                  class="win-button ds-btn-sm ds-btn-icon ds-chapter-retry-btn"
                                  disabled={rowBusy().has(`retry:${ch.chapter_permalink}`)}
                                  onClick={() => void handleRetryChapter(ch.chapter_permalink)}
                                  title={t("download.retryChapterTooltip")}
                                  style="color:var(--ds-warn-text);"
                                >
                                  <RefreshIcon size={10} />
                                </button>
                              </Show>
                              <Show when={!isChDone()}>
                                <button
                                  type="button"
                                  class="win-button ds-btn-sm ds-btn-icon ds-chapter-cancel-btn"
                                  disabled={rowBusy().has(`cancel:${ch.chapter_permalink}`)}
                                  onClick={() => void handleCancelChapter(ch.chapter_permalink)}
                                  title={t("download.cancelChapterTooltip")}
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
