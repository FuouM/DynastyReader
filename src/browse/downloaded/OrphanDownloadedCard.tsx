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

interface OrphanDownloadedCardProps {
  orphans: ProcessedCachedChapter[];
  defaultCollapsed?: boolean;
  onDeleteChapter?: (chapterPermalink: string) => void;
  onDeleteAll?: () => void;
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
          <span>Individual Chapters / Oneshots ({props.orphans.length})</span>
        </span>
      }
      actions={
        <Show when={props.onDeleteAll}>
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
            />
          )}
        </For>

        {/* Show more / fewer toggle if > 20 items */}
        <Show when={props.orphans.length > 20}>
          <div style="display:flex;justify-content:center;padding:4px 0;margin-top:2px;">
            <button
              type="button"
              class="win-button ds-btn-sm"
              onClick={() => setListLimit((lim) => (lim === -1 ? 20 : -1))}
              style="font-size:11px;padding:1px 10px;"
            >
              {listLimit() === -1
                ? "Show fewer"
                : `Show all ${props.orphans.length} chapters`}
            </button>
          </div>
        </Show>
      </div>
    </GroupBox>
  );
}
