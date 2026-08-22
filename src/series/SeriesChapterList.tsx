/**
 * Volume-grouped chapter list with sort toggle, reading progress badges, and offline indicators.
 */

import { For, Show, type Accessor } from "solid-js";
import { decodeEntities, navigate } from "../stores";
import type { ChapterRef } from "../types/routes";
import type { Series } from "../types/api";
import type { SeriesProgressRow } from "../db";
import { OfflineBadge } from "../components/OfflineBadge";
import { Icon } from "../components/Icon";

export interface ChapterMeta extends ChapterRef {
  volumeHeader?: string;
}

export function ChapterRow(props: {
  ch: ChapterMeta;
  prog: SeriesProgressRow | undefined;
  cachedCount: number;
  chapters: ChapterMeta[];
  seriesPermalink: string;
  seriesName: string;
  isReadInHistory: boolean;
}) {
  const isCompleted = props.prog?.completed === 1;
  const isRead = isCompleted || props.isReadInHistory;
  const isFullyCached =
    props.cachedCount > 0 &&
    (props.prog && props.prog.page_total > 0 ? props.cachedCount >= props.prog.page_total : true);

  const badges: string[] = [];
  if (isCompleted) {
    badges.push("✓ Completed");
  } else if (props.prog && props.prog.page_index > 0) {
    badges.push(`page ${props.prog.page_index + 1}/${props.prog.page_total}`);
  } else if (props.isReadInHistory) {
    badges.push("✓ Read");
  }
  if (props.cachedCount > 0) {
    badges.push(`${props.cachedCount} cached`);
  }
  if (props.ch.released_on) {
    badges.push(props.ch.released_on);
  }

  return (
    <div
      class={`ds-chapter-row${isRead ? " ds-chapter-read" : ""}`}
      onClick={() =>
        navigate({
          view: "reader",
          seriesPermalink: props.seriesPermalink,
          chapterPermalink: props.ch.permalink,
          chapterTitle: props.ch.title,
          seriesName: props.seriesName,
          chapterList: props.chapters,
          startPage: props.prog && props.prog.completed !== 1 ? props.prog.page_index : 0,
        })
      }
    >
      <div class="ds-chapter-title" style="display:inline-flex;align-items:center;gap:4px;">
        <span>{decodeEntities(props.ch.title)}</span>
        <OfflineBadge when={isFullyCached} />
      </div>
      {badges.length > 0 ? <div class="ds-chapter-badge">{badges.join(" · ")}</div> : null}
    </div>
  );
}

export interface SeriesChapterListProps {
  series: Series;
  chapters: ChapterMeta[];
  ordered: Accessor<ChapterMeta[]>;
  progress: Map<string, SeriesProgressRow>;
  cacheCounts: Map<string, number>;
  readHistorySet: Set<string>;
  sortOrder: Accessor<"asc" | "desc">;
  setSortOrder: (v: "asc" | "desc") => void;
}

export function SeriesChapterList(props: SeriesChapterListProps) {
  return (
    <Show
      when={props.chapters.length === 0}
      fallback={
        <div style="display:flex;flex-direction:column;gap:6px;margin-top:10px;">
          <div
            class="ds-row"
            style="justify-content:space-between;align-items:center;padding:4px 2px;border-bottom:1px solid var(--sys-border-light, #ddd);"
          >
            <div style="font-size:12px;font-weight:600;">Chapters ({props.chapters.length})</div>
            <button
              type="button"
              class="win-button ds-btn-compact"
              title={
                props.sortOrder() === "asc"
                  ? "Oldest first (click to sort newest first)"
                  : "Newest first (click to sort oldest first)"
              }
              onClick={() =>
                props.setSortOrder(props.sortOrder() === "asc" ? "desc" : "asc")
              }
            >
              <Icon name={props.sortOrder() === "asc" ? "sort-numeric-down" : "sort-numeric-down-alt"} />{" "}
              Sort: {props.sortOrder() === "asc" ? "Ascending" : "Descending"}
            </button>
          </div>
          <div style="display:flex;flex-direction:column;">
            <For each={props.ordered()}>
              {(ch, i) => (
                <>
                  <Show
                    when={
                      ch.volumeHeader &&
                      (i() === 0 || props.ordered()[i() - 1].volumeHeader !== ch.volumeHeader)
                    }
                  >
                    <div class="ds-vol-header">{ch.volumeHeader}</div>
                  </Show>
                  <ChapterRow
                    ch={ch}
                    prog={props.progress.get(ch.permalink)}
                    cachedCount={props.cacheCounts.get(ch.permalink) ?? 0}
                    chapters={props.chapters}
                    seriesPermalink={props.series.permalink}
                    seriesName={props.series.name}
                    isReadInHistory={props.readHistorySet.has(ch.permalink)}
                  />
                </>
              )}
            </For>
          </div>
        </div>
      }
    >
      <Show when={!(props.series.taggables && props.series.taggables!.length > 0)}>
        <div class="ds-muted" style="margin-top:12px;">
          This entry has no chapters or series listed here.
        </div>
      </Show>
    </Show>
  );
}
