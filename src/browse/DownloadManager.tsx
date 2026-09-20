import { createEffect, createMemo, createSignal, For, on, onMount, Show } from "solid-js";
import {
  cancelDownload,
  clearCompletedDownloads,
  pauseDownloads,
  resumeDownloads,
  retryChapterDownload,
  retryFailedDownloads,
} from "../ipc";
import { errorMessage } from "../utils/formatting";
import { showBanner } from "../stores/topbar";
import { t } from "../i18n";
import { GroupBox } from "../components/GroupBox";
import {
  DownloadIcon,
  RefreshIcon,
  TrashIcon,
  PlayIcon,
  PauseIcon,
} from "../components/Icon";
import { buildSeriesDownloadGroups } from "./download-manager/buildGroups";
import { SeriesDownloadCard } from "./download-manager/SeriesDownloadCard";
import type { SeriesDownloadGroup } from "./download-manager/types";
export type { SeriesDownloadGroup };
import {
  downloadSpeedBps as speedBps,
  downloadEtaSeconds as etaSeconds,
  sessionDownloadedBytes as sessionBytes,
  resetDownloadSpeedAccumulators,
  downloadQueueItems as items,
  isDownloadPaused as isPaused,
  downloadActiveProgress as activeProgress,
  refreshDownloadQueue as refreshQueue,
  type DownloadProgressPayload,
} from "../stores/download";


export type { DownloadProgressPayload };

export function DownloadManager(props: { onComplete?: () => void }) {
  const QUEUE_COLLAPSED_KEY = "ds_download_queue_collapsed";
  const [isCollapsed, setIsCollapsed] = createSignal(
    typeof window !== "undefined" ? localStorage.getItem(QUEUE_COLLAPSED_KEY) === "true" : false,
  );
  const [expandedSeries, setExpandedSeries] = createSignal<Set<string>>(new Set());
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

  onMount(() => {
    void refreshQueue();
  });
  const totalCount = () => items().length;
  const activeOrPendingCount = () =>
    items().filter((i) => i.status === "downloading" || i.status === "pending").length;
  const allFailedCount = () => items().filter((i) => i.status === "failed").length;
  const allCompletedCount = () => items().filter((i) => i.status === "done").length;

  createEffect(
    on(
      allCompletedCount,
      (cur, prev) => {
        if (prev !== undefined && cur > prev) {
          props.onComplete?.();
        }
      },
      { defer: true },
    ),
  );

  // Group items by Series, sorted by most recent activity
  const seriesGroups = createMemo(() => buildSeriesDownloadGroups(items(), activeProgress(), isPaused()));

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
      } else {
        await pauseDownloads();
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
            {(group) => (
              <SeriesDownloadCard
                group={group}
                isExpanded={expandedSeries().has(group.series_permalink)}
                activeProgress={activeProgress()}
                speedBps={speedBps()}
                etaSeconds={etaSeconds()}
                sessionBytes={sessionBytes()}
                rowBusy={rowBusy()}
                onToggleExpand={() => toggleExpand(group.series_permalink)}
                onRetrySeries={handleRetrySeries}
                onClearSeries={handleClearSeries}
                onCancelSeries={handleCancelSeries}
                onRetryChapter={handleRetryChapter}
                onCancelChapter={handleCancelChapter}
              />
            )}
          </For>
        </div>
      </GroupBox>
    </Show>
  );
}
