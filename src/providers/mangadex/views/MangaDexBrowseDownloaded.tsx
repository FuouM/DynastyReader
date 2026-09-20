/**
 * MangaDex Browse Downloaded Pane
 * Visual & structural parity with Dynasty's BrowseDownloaded:
 * - Offline chapters from mangadex.db grouped by series
 * - Quick filter input and pagination
 * - Displays page counts, cached size, and delete actions
 */

import { createEffect, createSignal, For, Show, type Accessor } from "solid-js";
import { getMangaDexDownloadedChapters, type MangaDexDownloadedChapter } from "../db/cache.repo";
import { execute } from "../db/client";
import { navigate } from "../../../stores/router";
import { formatBytes } from "../../../utils/formatting";
import {
  setPaneError,
  setPaneLoading,
  setTopPagerFor,
  useDelayedSpinner,
  useTabPane,
} from "../../../browse/browse-state";
import { Pager } from "../../../components/Pager";
import { Loading, ErrorRetryRow, EmptyState } from "../../../components/Feedback";
import { ListItem } from "../../../components/ListItem";
import { TrashIcon } from "../../../components/Icon";
import { OfflineBadge } from "../../../components/Badges";

export interface MangaDexBrowseDownloadedProps {
  tabId: string;
  active: Accessor<boolean>;
  revision: Accessor<number>;
  forceTick: Accessor<number>;
}

const PAGE_SIZE = 20;

export function MangaDexBrowseDownloaded(props: MangaDexBrowseDownloadedProps) {
  const [filterQuery, setFilterQuery] = createSignal("");

  const pane = useTabPane<{ rows: MangaDexDownloadedChapter[]; totalPages: number; totalCount: number }>({
    active: props.active,
    revision: props.revision,
    forceTick: props.forceTick,
    load: async (page) => {
      const all = await getMangaDexDownloadedChapters();
      const q = filterQuery().trim().toLowerCase();
      const filtered = q
        ? all.filter(
            (c) =>
              c.chapterTitle.toLowerCase().includes(q) ||
              c.mangaTitle.toLowerCase().includes(q),
          )
        : all;

      const totalCount = filtered.length;
      const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
      const offset = (page - 1) * PAGE_SIZE;
      const rows = filtered.slice(offset, offset + PAGE_SIZE);

      return { rows, totalPages, totalCount };
    },
  });

  const showSpinner = useDelayedSpinner(() => pane.loading());

  createEffect(() => {
    setPaneLoading(props.tabId, pane.loading());
    setPaneError(props.tabId, !!pane.error());
  });

  createEffect(() => {
    if (props.active()) {
      const data = pane.data();
      if (data) {
        setTopPagerFor(props.tabId, {
          totalPages: data.totalPages,
          currentPage: pane.page(),
          onPage: pane.goToPage,
        });
      }
    }
  });

  const handleDelete = async (chapterId: string, ev: MouseEvent): Promise<void> => {
    ev.stopPropagation();
    await execute("DELETE FROM cached_pages WHERE chapter_id = ?1", [chapterId]);
    pane.reload();
  };

  return (
    <div class="ds-downloaded-pane">
      {/* Quick Filter */}
      <div style="display: flex; gap: 8px; margin-bottom: 12px; align-items: center;">
        <input
          type="text"
          class="win-input"
          placeholder="Filter downloaded chapters..."
          value={filterQuery()}
          onInput={(e) => {
            setFilterQuery(e.currentTarget.value);
            pane.goToPage(1);
            pane.reload();
          }}
          style="flex: 1; height: 24px; padding: 0 8px;"
        />
      </div>

      <Show when={showSpinner()}>
        <div style="display: flex; justify-content: center; padding: 40px 0;">
          <Loading />
        </div>
      </Show>

      <Show when={pane.error()}>
        <ErrorRetryRow
          message={pane.error() instanceof Error ? (pane.error() as Error).message : "Failed to load downloaded chapters"}
          onRetry={pane.reload}
        />
      </Show>

      <Show when={!pane.loading() && !pane.error()}>
        <Show
          when={(pane.data()?.rows.length ?? 0) > 0}
          fallback={<EmptyState>No downloaded MangaDex chapters found.</EmptyState>}
        >
          <div style="display: flex; flex-direction: column; gap: 4px;">
            <For each={pane.data()?.rows}>
              {(ch) => {
                const handleOpen = () => {
                  navigate({
                    view: "reader",
                    chapterPermalink: `mdx:${ch.chapterId}`,
                    chapterTitle: ch.chapterTitle,
                    seriesPermalink: ch.mangaId ? `mdx:${ch.mangaId}` : undefined,
                    seriesName: ch.mangaTitle,
                  });
                };

                return (
                  <ListItem
                    cssText="justify-content:space-between;padding:6px 10px;cursor:pointer;"
                    onClick={handleOpen}
                    leading={
                      <div style="display: flex; align-items: center;">
                        <OfflineBadge />
                      </div>
                    }
                    title={
                      <div style="display: flex; flex-direction: column; gap: 2px;">
                        <span class="ds-item-title" style="font-weight: 600;">
                          {ch.mangaTitle} — {ch.chapterTitle}
                        </span>
                        <span class="ds-muted" style="font-size: 11px;">
                          {ch.pageCount} pages • {formatBytes(ch.totalBytes)} • {new Date(ch.lastCachedAt).toLocaleDateString()}
                        </span>
                      </div>
                    }
                    actions={
                      <button
                        type="button"
                        class="win-button ds-btn-icon"
                        onClick={(e) => void handleDelete(ch.chapterId, e)}
                        title="Delete cached chapter"
                        style="padding: 2px;"
                      >
                        <TrashIcon size={13} />
                      </button>
                    }
                  />
                );
              }}
            </For>
          </div>

          <Show when={(pane.data()?.totalPages ?? 0) > 1}>
            <div style="margin-top: 16px; display: flex; justify-content: center;">
              <Pager
                totalPages={pane.data()!.totalPages}
                currentPage={pane.page()}
                onPage={pane.goToPage}
              />
            </div>
          </Show>
        </Show>
      </Show>
    </div>
  );
}
