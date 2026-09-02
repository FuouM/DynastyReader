/**
 * Series-level downloaded chapters card with cinema-seats matrix and detailed list views.
 */

import { createMemo, createSignal, For, Show } from "solid-js";
import { navigate } from "../../stores";
import { convertFileSrc } from "../../ipc";
import { formatBytes } from "../../lib/format";
import { formatDate } from "../../utils/formatting";
import { GroupBox } from "../../components/GroupBox";
import { ConfirmDeleteButton } from "../../components/Button";
import {
  BookIcon,
  CheckIcon,
  PlayIcon,
  ChevronRightIcon,
  ColumnsGapIcon,
  ListCheckIcon,
  TrashIcon,
} from "../../components/Icon";
import type { DownloadedSeriesGroup, ProcessedCachedChapter } from "./types";
import { DownloadedChapterRow } from "./DownloadedChapterRow";
import { ShowMoreToggle } from "./ShowMoreToggle";

function isNumberedSeries(group: DownloadedSeriesGroup): boolean {
  const chs = group.chapters;
  if (chs.length === 0) return true;
  let numberedCount = 0;
  for (const ch of chs) {
    const t = ch.chapterTitle.trim();
    if (
      /\b(?:chapter|ch\.?|c)\s*\d+/i.test(t) ||
      /\b(?:volume|vol\.?|v)\s*\d+/i.test(t) ||
      /\b(?:act|episode|ep\.?)\s*\d+/i.test(t) ||
      /^\d+(?:\.\d+)?\b/.test(t)
    ) {
      numberedCount++;
    }
  }
  return numberedCount / chs.length >= 0.5;
}

function showVolDivider(
  hasMultipleVolumes: boolean,
  ch: ProcessedCachedChapter,
  list: ProcessedCachedChapter[],
  idx: number,
): boolean {
  if (!hasMultipleVolumes || !ch.volumeHeader) return false;
  if (idx === 0) return false;
  return list[idx - 1].volumeHeader !== ch.volumeHeader;
}

interface SeriesDownloadedCardProps {
  group: DownloadedSeriesGroup;
  defaultViewMode?: "seats" | "list";
  defaultCollapsed?: boolean;
  onDelete?: () => void;
  onDeleteChapter?: (chapterPermalink: string) => void;
}

export function SeriesDownloadedCard(props: SeriesDownloadedCardProps) {
  const isNumbered = createMemo(() => isNumberedSeries(props.group));
  const [viewMode, setViewMode] = createSignal<"seats" | "list">(
    props.defaultViewMode ?? (isNumbered() ? "seats" : "list"),
  );
  const [activeRange, setActiveRange] = createSignal<number>(-1);
  const [isCollapsed, setIsCollapsed] = createSignal<boolean>(props.defaultCollapsed ?? false);
  const [listLimit, setListLimit] = createSignal<number>(15);
  const CHUNK_SIZE = 50;

  const totalChapters = () => props.group.chapters.length;
  const isLarge = () => totalChapters() > CHUNK_SIZE;

  const chunks = createMemo(() => {
    if (!isLarge()) return [];
    const list: { label: string; start: number; end: number; count: number }[] = [];
    const total = totalChapters();
    for (let i = 0; i < total; i += CHUNK_SIZE) {
      const end = Math.min(i + CHUNK_SIZE, total);
      list.push({
        label: `${i + 1}–${end}`,
        start: i,
        end,
        count: end - i,
      });
    }
    return list;
  });

  const displayedChapters = createMemo(() => {
    if (viewMode() === "seats") {
      if (!isLarge() || activeRange() === -1) {
        return props.group.chapters;
      }
      const ch = chunks()[activeRange()];
      if (!ch) return props.group.chapters;
      return props.group.chapters.slice(ch.start, ch.end);
    }
    return props.group.chapters;
  });

  const visibleListChapters = createMemo(() => {
    const list = displayedChapters();
    if (listLimit() === -1 || list.length <= 15) return list;
    return list.slice(0, listLimit());
  });

  const hasMultipleVolumes = createMemo(() => {
    const list = props.group.chapters;
    const volSet = new Set<string>();
    for (const ch of list) {
      if (ch.volumeHeader) volSet.add(ch.volumeHeader);
    }
    return volSet.size > 1;
  });

  const readCount = () => props.group.readCount;
  const firstUnread = createMemo(() =>
    props.group.chapters.find((c) => !c.isRead),
  );

  const navigateToChapter = (ch: ProcessedCachedChapter) =>
    navigate({
      view: "reader",
      seriesPermalink: props.group.seriesPermalink,
      seriesName: props.group.seriesName || props.group.seriesPermalink,
      chapterPermalink: ch.chapterPermalink,
      chapterTitle: ch.chapterTitle,
    });

  const navigateToSeries = () =>
    navigate({
      view: "series",
      seriesPermalink: props.group.seriesPermalink,
      seriesName: props.group.seriesName || props.group.seriesPermalink,
    });

  return (
    <GroupBox
      class="ds-downloaded-series-group ds-mb-8"
      collapsible={true}
      collapsed={isCollapsed()}
      onToggle={() => setIsCollapsed((c) => !c)}
      title={
        <span class="ds-icon-text">
          <BookIcon />
          <span
            class="ds-truncate ds-link-title"
            onClick={navigateToSeries}
            title={props.group.seriesName || props.group.seriesPermalink}
          >
            {props.group.seriesName || props.group.seriesPermalink}
          </span>
          <span class="ds-muted" style="font-weight:normal;font-size:11px;">
            ({props.group.chapters.length} ch{props.group.totalSizeBytes > 0 ? ` · ${formatBytes(props.group.totalSizeBytes)}` : ""})
          </span>
        </span>
      }
      actions={
        <div class="ds-downloaded-series-actions">
          <Show when={firstUnread()}>
            {(next) => (
              <button
                type="button"
                class="win-button primary ds-btn-sm"
                onClick={() =>
                  navigate({
                    view: "reader",
                    seriesPermalink: props.group.seriesPermalink,
                    seriesName: props.group.seriesName || props.group.seriesPermalink,
                    chapterPermalink: next().chapterPermalink,
                    chapterTitle: next().chapterTitle,
                  })
                }
                title={`Continue reading: ${next().chapterTitle}`}
              >
                <PlayIcon /> Read Next
              </button>
            )}
          </Show>

          {/* View Mode Toggle (available for all series) */}
          <button
            type="button"
            class="win-button ds-btn-sm ds-btn-icon"
            onClick={() => setViewMode((m) => (m === "seats" ? "list" : "seats"))}
            title={viewMode() === "seats" ? "Switch to detailed chapter list" : "Switch to compact chapter seats matrix"}
          >
            <Show when={viewMode() === "seats"} fallback={<ColumnsGapIcon />}>
              <ListCheckIcon />
            </Show>
          </button>
          <button
            type="button"
            class="win-button ds-btn-sm"
            onClick={navigateToSeries}
          >
            Series <ChevronRightIcon />
          </button>
          <Show when={props.onDelete}>
            <ConfirmDeleteButton
              icon={<TrashIcon />}
              className="ds-btn-sm ds-btn-icon"
              title={`Clear cached chapters for ${props.group.seriesName || props.group.seriesPermalink}`}
              onConfirm={props.onDelete!}
            />
          </Show>
        </div>
      }
    >
      {/* Series Summary Strip */}
      <div class="ds-downloaded-summary-strip">
        <Show when={props.group.coverPath}>
          <img
            src={convertFileSrc(props.group.coverPath!)}
            alt=""
            decoding="async"
            width="32"
            height="44"
            class="ds-downloaded-cover"
            onClick={navigateToSeries}
          />
        </Show>
        <div class="ds-downloaded-summary-text ds-muted">
          <span>{props.group.chapters.length} chapters</span>
          <Show when={props.group.totalSizeBytes > 0}>
            <span>·</span>
            <span>{formatBytes(props.group.totalSizeBytes)}</span>
          </Show>
          <span>·</span>
          <span>{formatDate(props.group.lastCachedAt)}</span>
          <Show when={readCount() > 0}>
            <span>·</span>
            <span style="color:var(--sys-link);font-weight:600;">
              {readCount()}/{props.group.chapters.length} Read
            </span>
          </Show>
        </div>
      </div>

      {/* Mode 1: Cinema Seats Matrix */}
      <Show when={viewMode() === "seats"}>
        {/* Range Segment Selector for Large Series (>50 chapters) */}
        <Show when={isLarge()}>
          <div class="ds-chapter-range-bar">
            <span class="ds-muted" style="font-size:11px;margin-right:2px;">Range:</span>
            <button
              type="button"
              class={`win-button ds-btn-sm${activeRange() === -1 ? " active primary" : ""}`}
              onClick={() => setActiveRange(-1)}
            >
              All ({totalChapters()})
            </button>
            <For each={chunks()}>
              {(chunk, idx) => (
                <button
                  type="button"
                  class={`win-button ds-btn-sm${activeRange() === idx() ? " active primary" : ""}`}
                  onClick={() => setActiveRange(idx())}
                >
                  {chunk.label}
                </button>
              )}
            </For>
          </div>
        </Show>

        <div class="ds-chapter-matrix">
          <For each={displayedChapters()}>
            {(ch, idx) => {
              const showVol = () => showVolDivider(hasMultipleVolumes(), ch, displayedChapters(), idx());
              const tooltip = `${ch.chapterTitle}${ch.volumeHeader ? ` (${ch.volumeHeader})` : ""}\n${ch.pageCount} pages · ${formatBytes(ch.totalSizeBytes)}${ch.isRead ? " · Read" : " · Unread"}${ch.isBookmarked ? " · Bookmarked" : ""}\nClick to read offline`;

              return (
                <>
                  <Show when={showVol()}>
                    <span
                      class="ds-seat-vol-divider"
                      title={ch.volumeHeader}
                      aria-label={ch.volumeHeader}
                    />
                  </Show>
                  <button
                    type="button"
                    class={`win-button ds-chapter-seat ${ch.isRead ? "ds-chapter-seat--read" : "ds-chapter-seat--downloaded"}${ch.isBookmarked ? " ds-chapter-seat--bookmarked" : ""}`}
                    title={tooltip}
                    onClick={() => navigateToChapter(ch)}
                  >
                    <Show when={ch.isRead}>
                      <CheckIcon size={10} class="ds-seat-check" />
                    </Show>
                    <span>{ch.shortLabel}</span>
                  </button>
                </>
              );
            }}
          </For>
        </div>
      </Show>
      {/* Mode 2: Detailed Chapter List */}
      <Show when={viewMode() === "list"}>
        <div class="ds-downloaded-chapter-list">
          <For each={visibleListChapters()}>
            {(ch, idx) => {
              const showVol = () => showVolDivider(hasMultipleVolumes(), ch, visibleListChapters(), idx());

              return (
                <>
                  <Show when={showVol()}>
                    <div class="ds-vol-divider">
                      <span>{ch.volumeHeader}</span>
                    </div>
                  </Show>
                  <DownloadedChapterRow
                    ch={ch}
                    onClick={() => navigateToChapter(ch)}
                    onDelete={props.onDeleteChapter ? () => props.onDeleteChapter!(ch.chapterPermalink) : undefined}
                  />
                </>
              );
            }}
          </For>

          {/* Show more / fewer toggle if > 15 items */}
          <ShowMoreToggle
            total={props.group.chapters.length}
            threshold={15}
            listLimit={listLimit()}
            onToggle={() => setListLimit((lim) => (lim === -1 ? 15 : -1))}
          />
        </div>
      </Show>
    </GroupBox>
  );
}
