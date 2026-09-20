import { For, Show } from "solid-js";
import type { DownloadQueueItem } from "../../ipc";
import type { SeriesDownloadGroup } from "./types";
import {
  CheckIcon,
  ChevronDownIcon,
  CloseIcon,
  RefreshIcon,
  SpeedIcon,
  TrashIcon,
} from "../../components/Icon";
import { formatBytes, formatEta, formatSpeed } from "../../utils/formatting";
import { t } from "../../i18n";

// ── 1. Inlined Chapter Download Row ────────────────────────────────────────────

export interface ChapterDownloadRowProps {
  chapter: DownloadQueueItem;
  progress?: { done: number; total: number; bytes: number };
  isBusy?: boolean;
  onRetry: (chapterPermalink: string) => void;
  onCancel: (chapterPermalink: string) => void;
}

export function ChapterDownloadRow(props: ChapterDownloadRowProps) {
  const ch = () => props.chapter;
  const isChAct = () => ch().status === "downloading";
  const isChDone = () => ch().status === "done";
  const isChFail = () => ch().status === "failed";
  const chDone = () => props.progress?.done ?? ch().progress;
  const chTotal = () => props.progress?.total ?? ch().total_pages;

  return (
    <div class="ds-download-chapter-row">
      <div class="ds-download-chapter-label">
        <span>{ch().chapter_title}</span>
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
              <CloseIcon size={10} /> {t("download.statusFailed", { count: 1 })}{ch().error_msg ? `: ${ch().error_msg}` : ""}
            </span>
          </Show>
        </span>
      </div>

      <div class="ds-download-chapter-actions">
        <Show when={isChFail()}>
          <button
            type="button"
            class="win-button ds-download-action-btn ds-download-action-btn--icon"
            onClick={() => props.onRetry(ch().chapter_permalink)}
            disabled={props.isBusy}
            title={t("download.retryChapterTooltip")}
          >
            <RefreshIcon size={11} />
          </button>
        </Show>

        <Show when={!isChDone()}>
          <button
            type="button"
            class="win-button ds-download-action-btn ds-download-action-btn--icon"
            onClick={() => props.onCancel(ch().chapter_permalink)}
            disabled={props.isBusy}
            title={t("download.cancelChapterTooltip")}
          >
            <CloseIcon size={11} />
          </button>
        </Show>
      </div>
    </div>
  );
}

// ── 2. Series Download Card ────────────────────────────────────────────────────

export interface SeriesDownloadCardProps {
  group: SeriesDownloadGroup;
  isExpanded: boolean;
  activeProgress: Record<string, { done: number; total: number; bytes: number }>;
  speedBps: number;
  etaSeconds: number;
  sessionBytes: number;
  rowBusy: Set<string>;
  onToggleExpand: () => void;
  onRetrySeries: (seriesPermalink: string) => void;
  onClearSeries: (seriesPermalink: string) => void;
  onCancelSeries: (group: SeriesDownloadGroup) => void;
  onRetryChapter: (chapterPermalink: string) => void;
  onCancelChapter: (chapterPermalink: string) => void;
}

export function SeriesDownloadCard(props: SeriesDownloadCardProps) {
  const group = () => props.group;
  const isAct = () => group().status === "downloading";
  const isFail = () => group().status === "failed";
  const isDone = () => group().status === "done";
  const isPsd = () => group().status === "paused";

  return (
    <div
      class={`ds-download-series-item${isDone() ? " ds-download-series-item--done" : ""}${isAct() ? " ds-download-series-item--active" : ""}`}
    >
      {/* Top Row: Series Title + Status + Action Buttons */}
      <div class="ds-download-series-header">
        <div class="ds-download-series-title-row">
          <span class="ds-download-series-title" title={group().series_title}>
            {group().series_title}
          </span>
          <Show when={isAct()}>
            <span class="ds-status-pill fresh">{t("download.statusDownloading")}</span>
          </Show>
          <Show when={isPsd()}>
            <span class="ds-status-pill">{t("download.statusPaused")}</span>
          </Show>
          <Show when={isDone()}>
            <span class="ds-status-pill fresh">
              <CheckIcon size={10} /> {t("download.statusComplete")}
            </span>
            <span class="ds-muted ds-download-series-count" style="font-size:10.5px;">
              ({group().totalChapters} {t("downloaded.chaptersAbbrev")})
            </span>
          </Show>
          <Show when={isFail()}>
            <span class="ds-status-pill" style="color:var(--ds-danger-text);">
              {t("download.statusFailed", { count: group().failedChapters })}
            </span>
          </Show>
        </div>

        <div class="ds-download-series-actions">
          <Show when={group().failedChapters > 0}>
            <button
              type="button"
              class="win-button ds-btn-sm"
              onClick={() => void props.onRetrySeries(group().series_permalink)}
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
              onClick={() => void props.onClearSeries(group().series_permalink)}
              title={t("download.clearSeriesCompletedTooltip")}
            >
              <TrashIcon /> {t("common.clear")}
            </button>
          </Show>

          <Show when={!isDone()}>
            <button
              type="button"
              class="win-button ds-btn-sm"
              onClick={() => void props.onCancelSeries(group())}
              title={t("download.cancelSeriesPendingTooltip")}
            >
              {t("common.cancel")}
            </button>
          </Show>

          <button
            type="button"
            class="win-button ds-btn-sm ds-btn-icon"
            onClick={props.onToggleExpand}
            title={props.isExpanded ? t("download.hideChapters") : t("download.showChapters")}
          >
            <ChevronDownIcon class={props.isExpanded ? "ds-rotate-180" : ""} />
          </button>
        </div>
      </div>

      {/* Live Status & Metrics + Progress Bar (for non-completed items) */}
      <Show when={!isDone()}>
        <div class="ds-download-series-subrow">
          <div class="ds-download-series-subtext ds-muted">
            <Show
              when={group().downloadingItem}
              fallback={
                <span>
                  {t("download.chaptersComplete", {
                    done: group().completedChapters,
                    total: group().totalChapters,
                  })}
                  <Show
                    when={
                      group().status === "downloading" &&
                      group().completedChapters < group().totalChapters
                    }
                  >
                    {" "}· {t("download.preparingNextChapter")}
                  </Show>
                  <Show when={group().failedChapters > 0}>
                    {" "}· {group().failedChapters} {t("download.failed")}
                  </Show>
                </span>
              }
            >
              {(down) => (
                <span>
                  {group().completedChapters + 1}/{group().totalChapters}: {down().chapter_title} (
                  {props.activeProgress[down().chapter_permalink]?.done ?? down().progress}/
                  {(props.activeProgress[down().chapter_permalink]?.total ?? down().total_pages) || 1}{" "}
                  {t("downloaded.pagesLabel")})
                  <Show when={isAct() && props.speedBps > 0}>
                    {" "}·{" "}
                    <span style="color:var(--sys-link);font-weight:600;">
                      <SpeedIcon size={10} /> {formatSpeed(props.speedBps)}
                    </span>
                    <Show when={props.sessionBytes > 0}>
                      <span class="ds-muted"> ({formatBytes(props.sessionBytes)})</span>
                    </Show>
                  </Show>
                  <Show when={isAct() && props.etaSeconds > 0}>
                    {" "}· {formatEta(props.etaSeconds)} {t("download.remaining")}
                  </Show>
                </span>
              )}
            </Show>
          </div>

          <div class="ds-download-percent-badge">{group().overallPercent}%</div>
        </div>

        <div class="ds-progress-track">
          <div
            class={`ds-progress-fill${isFail() ? " fail" : ""}`}
            style={{
              width: `${group().overallPercent}%`,
            }}
          />
        </div>
      </Show>

      {/* Chapters Drawer */}
      <Show when={props.isExpanded}>
        <div class="ds-download-chapters-drawer">
          <For each={group().items}>
            {(ch) => (
              <ChapterDownloadRow
                chapter={ch}
                progress={props.activeProgress[ch.chapter_permalink]}
                isBusy={
                  props.rowBusy.has(`retry:${ch.chapter_permalink}`) ||
                  props.rowBusy.has(`cancel:${ch.chapter_permalink}`)
                }
                onRetry={props.onRetryChapter}
                onCancel={props.onCancelChapter}
              />
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
