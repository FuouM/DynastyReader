/**
 * Shared chapter-row component for the downloaded chapters view.
 * Deduplicates JSX between SeriesDownloadedCard and OrphanDownloadedCard.
 */

import { Show } from "solid-js";
import { formatBytes } from "../../lib/format";
import { formatDate } from "../../utils/formatting";
import { CheckIcon, BookmarkIcon, TrashIcon } from "../../components/Icon";
import type { ProcessedCachedChapter } from "./types";

interface DownloadedChapterRowProps {
  ch: ProcessedCachedChapter;
  seriesPermalink?: string | null;
  seriesName?: string | null;
  onClick: () => void;
  onDelete?: () => void;
}

export function DownloadedChapterRow(props: DownloadedChapterRowProps) {
  return (
    <div
      class={`ds-chapter-row${props.ch.isRead ? " ds-chapter-read" : ""}`}
      onClick={props.onClick}
    >
      <div class="ds-chapter-title ds-inline-flex-center-4" style="flex:1;min-width:0;">
        <Show when={props.ch.isRead}>
          <CheckIcon size={11} class="ds-seat-check" style="flex-shrink:0;" />
        </Show>
        <Show when={props.ch.isBookmarked}>
          <BookmarkIcon filled size={11} style="color:var(--ds-warn-text,#d97706);flex-shrink:0;" />
        </Show>
        <span class="ds-truncate" style="font-size:12px;font-weight:500;">{props.ch.chapterTitle}</span>
      </div>
      <div class="ds-chapter-badge ds-muted" style="font-size:11px;font-style:normal;display:flex;gap:6px;align-items:center;flex-shrink:0;">
        <span>{props.ch.pageCount}p</span>
        <Show when={props.ch.totalSizeBytes > 0}>
          <span>·</span>
          <span>{formatBytes(props.ch.totalSizeBytes)}</span>
        </Show>
        <span>·</span>
        <span>{formatDate(props.ch.lastCachedAt)}</span>
        <Show when={props.onDelete}>
          <button
            type="button"
            class="win-button ds-btn-sm ds-btn-icon"
            style="margin-left:4px;width:18px;height:18px;min-height:18px;padding:0;"
            title={`Delete cached chapter: ${props.ch.chapterTitle}`}
            onClick={(e) => {
              e.stopPropagation();
              props.onDelete?.();
            }}
          >
            <TrashIcon size={10} />
          </button>
        </Show>
      </div>
    </div>
  );
}
