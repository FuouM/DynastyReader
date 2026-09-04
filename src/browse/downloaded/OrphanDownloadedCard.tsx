/**
 * Orphan/standalone downloaded chapters card (no series grouping).
 */

import { createMemo, createSignal, For, Show } from "solid-js";
import { navigate } from "../../stores";
import { BookIcon, TrashIcon } from "../../components/Icon";
import { GroupBox } from "../../components/GroupBox";
import { ConfirmDeleteButton } from "../../components/Button";
import type { ProcessedCachedChapter } from "./types";
import { DownloadedChapterRow } from "./DownloadedChapterRow";
import { ShowMoreToggle } from "./ShowMoreToggle";

interface OrphanDownloadedCardProps {
  orphans: ProcessedCachedChapter[];
  /** Total orphan count across all pages (defaults to orphans.length). */
  totalCount?: number;
  defaultCollapsed?: boolean;
  onDeleteChapter?: (chapterPermalink: string) => void;
  onDeleteAll?: () => void;
  /** Per-chapter delete disable predicate (e.g. download in progress). */
  isChapterDeleteDisabled?: (chapterPermalink: string) => boolean;
  /** Hides the delete-all action (e.g. while a download is writing pages). */
  hideDeleteAll?: () => boolean;
}

export function OrphanDownloadedCard(props: OrphanDownloadedCardProps) {
  const [isCollapsed, setIsCollapsed] = createSignal<boolean>(props.defaultCollapsed ?? false);
  const [listLimit, setListLimit] = createSignal<number>(20);

  const visibleOrphans = createMemo(() => {
    if (listLimit() === -1 || props.orphans.length <= 20) return props.orphans;
    return props.orphans.slice(0, listLimit());
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
          <span>Individual Chapters / Oneshots ({props.totalCount ?? props.orphans.length})</span>
        </span>
      }
      actions={
        <Show when={props.onDeleteAll && !(props.hideDeleteAll?.() ?? false)}>
          <ConfirmDeleteButton
            icon={<TrashIcon />}
            className="ds-btn-sm ds-btn-icon"
            title="Clear all individual cached chapters"
            onConfirm={props.onDeleteAll!}
          />
        </Show>
      }
    >
      <div class="ds-downloaded-chapter-list">
        <For each={visibleOrphans()}>
          {(ch) => (
            <DownloadedChapterRow
              ch={ch}
              onClick={() =>
                navigate({
                  view: "reader",
                  chapterPermalink: ch.chapterPermalink,
                  chapterTitle: ch.chapterTitle,
                })
              }
              onDelete={props.onDeleteChapter ? () => props.onDeleteChapter!(ch.chapterPermalink) : undefined}
              deleteDisabled={props.isChapterDeleteDisabled ? () => props.isChapterDeleteDisabled!(ch.chapterPermalink) : undefined}
            />
          )}
        </For>

        {/* Show more / fewer toggle if > 20 items */}
        <ShowMoreToggle
          total={props.orphans.length}
          threshold={20}
          listLimit={listLimit()}
          onToggle={() => setListLimit((lim) => (lim === -1 ? 20 : -1))}
        />
      </div>
    </GroupBox>
  );
}
