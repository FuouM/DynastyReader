import { Show } from "solid-js";
import type { DownloadQueueItem } from "../../ipc";
import { CheckIcon, CloseIcon, HourglassIcon, RefreshIcon } from "../../components/Icon";
import { t } from "../../i18n";

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
          <Show when={ch().status === "pending"}>
            <span><HourglassIcon size={10} /> {t("download.statusQueued")}</span>
          </Show>
        </span>
      </div>

      <Show when={isChFail()}>
        <button
          type="button"
          class="win-button ds-btn-sm ds-btn-icon ds-chapter-retry-btn"
          disabled={props.isBusy}
          onClick={() => void props.onRetry(ch().chapter_permalink)}
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
          disabled={props.isBusy}
          onClick={() => void props.onCancel(ch().chapter_permalink)}
          title={t("download.cancelChapterTooltip")}
        >
          <CloseIcon size={10} />
        </button>
      </Show>
    </div>
  );
}
