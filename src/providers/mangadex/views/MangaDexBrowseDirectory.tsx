/**
 * MangaDex Browse Directory Pane (Series Directory & Tags Directory)
 * Visual & structural parity with Dynasty's BrowseDirectory:
 * - Series directory: alphabetical series list, blacklist badges, direct series navigation
 * - Tags directory: categorized tag taxonomy (genres, themes, formats, content)
 * - Top & bottom Pager synchronization
 */

import { createEffect, createMemo, createSignal, For, Show, type Accessor } from "solid-js";
import { searchManga, getTags } from "../api/manga";
import { formatMangaTitle } from "../mapping";
import { isSeriesBlacklisted, getBlacklistMode } from "../../../db/blacklist.repo";
import { navigate } from "../../../stores/router";
import {
  setPaneError,
  setPaneLoading,
  setTopPagerFor,
  useTabPane,
} from "../../../browse/browse-state";
import { Pager } from "../../../components/Pager";
import { Loading, ErrorRetryRow, EmptyState } from "../../../components/Feedback";
import { ListItem } from "../../../components/ListItem";
import { ExternalLinkButton } from "../../../components/Button";
import { BlacklistIcon } from "../../../components/Icon";
import { IconText } from "../../../components/Button";
import { useTriggerWarning } from "../../../hooks/useTriggerWarning";
import type { MangaDexManga, MangaDexTag } from "../types";

export interface MangaDexBrowseDirectoryProps {
  kind: "series" | "tags";
  tabId: string;
  active: Accessor<boolean>;
  revision: Accessor<number>;
  forceTick: Accessor<number>;
}

const PAGE_SIZE = 30;

export function MangaDexBrowseDirectory(props: MangaDexBrowseDirectoryProps) {
  const triggerWarning = useTriggerWarning();
  const [filterQuery, setFilterQuery] = createSignal("");

  // Pane for Series Directory
  const seriesPane = useTabPane<{ rows: MangaDexManga[]; totalPages: number; totalCount: number }>({
    active: () => props.active() && props.kind === "series",
    revision: props.revision,
    forceTick: props.forceTick,
    load: async (page) => {
      const offset = (page - 1) * PAGE_SIZE;
      const resp = await searchManga({
        title: filterQuery().trim() || undefined,
        limit: PAGE_SIZE,
        offset,
        order: { title: "asc" },
      });
      const totalCount = resp.total ?? 0;
      const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
      return { rows: resp.data || [], totalPages, totalCount };
    },
  });

  // Pane for Tags Directory
  const [tags, setTags] = createSignal<MangaDexTag[]>([]);
  const [tagsLoading, setTagsLoading] = createSignal(false);
  const [tagsError, setTagsError] = createSignal<string | null>(null);

  const loadTags = async (): Promise<void> => {
    setTagsLoading(true);
    setTagsError(null);
    try {
      const data = await getTags();
      setTags(data);
    } catch (err) {
      setTagsError(err instanceof Error ? err.message : "Failed to load tags");
    } finally {
      setTagsLoading(false);
    }
  };

  createEffect(() => {
    if (props.active() && props.kind === "tags" && tags().length === 0) {
      void loadTags();
    }
  });

  createEffect(() => {
    if (props.kind === "series") {
      setPaneLoading(props.tabId, seriesPane.loading());
      setPaneError(props.tabId, !!seriesPane.error());
    } else {
      setPaneLoading(props.tabId, tagsLoading());
      setPaneError(props.tabId, !!tagsError());
    }
  });

  createEffect(() => {
    if (props.kind === "series" && props.active()) {
      const data = seriesPane.data();
      if (data) {
        setTopPagerFor(props.tabId, {
          totalPages: data.totalPages,
          currentPage: seriesPane.page(),
          onPage: seriesPane.goToPage,
        });
      }
    }
  });

  const groupedTags = createMemo(() => {
    const list = tags();
    const groups: Record<string, MangaDexTag[]> = {
      genre: [],
      theme: [],
      format: [],
      content: [],
    };
    for (const t of list) {
      const g = t.attributes.group || "genre";
      if (!groups[g]) groups[g] = [];
      groups[g].push(t);
    }
    // Sort each group alphabetically
    for (const g of Object.keys(groups)) {
      groups[g].sort((a, b) => {
        const nameA = a.attributes.name.en || "";
        const nameB = b.attributes.name.en || "";
        return nameA.localeCompare(nameB);
      });
    }
    return groups;
  });

  return (
    <div class="ds-directory-pane">
      <Show when={props.kind === "series"}>
        {/* Series Filter Input */}
        <div style="display: flex; gap: 8px; margin-bottom: 12px; align-items: center;">
          <input
            type="text"
            class="win-input"
            placeholder="Filter series by title..."
            value={filterQuery()}
            onInput={(e) => setFilterQuery(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                seriesPane.goToPage(1);
                seriesPane.reload();
              }
            }}
            style="flex: 1; height: 24px; padding: 0 8px;"
          />
          <button
            type="button"
            class="win-button ds-btn-sm"
            onClick={() => {
              seriesPane.goToPage(1);
              seriesPane.reload();
            }}
          >
            Filter
          </button>
        </div>

        <Show when={seriesPane.loading()}>
          <div style="display: flex; justify-content: center; padding: 40px 0;">
            <Loading />
          </div>
        </Show>

        <Show when={seriesPane.error()}>
          <ErrorRetryRow
            message={seriesPane.error() instanceof Error ? (seriesPane.error() as Error).message : "Failed to load series directory"}
            onRetry={seriesPane.reload}
          />
        </Show>

        <Show when={!seriesPane.loading() && !seriesPane.error()}>
          <Show
            when={(seriesPane.data()?.rows.length ?? 0) > 0}
            fallback={<EmptyState>No series found matching your criteria.</EmptyState>}
          >
            <div style="display: flex; flex-direction: column; gap: 2px;">
              <For each={seriesPane.data()?.rows}>
                {(manga) => {
                  const title = formatMangaTitle(manga);
                  const permalink = `mdx:${manga.id}`;
                  const isBl = () => isSeriesBlacklisted(permalink, title);

                  const handleClick = () => {
                    const proceed = () =>
                      navigate({
                        view: "series",
                        seriesPermalink: permalink,
                        seriesName: title,
                      });
                    if (isBl() && getBlacklistMode() === "warn") {
                      triggerWarning.warn(title, [title], proceed);
                    } else {
                      proceed();
                    }
                  };

                  return (
                    <ListItem
                      cssText="justify-content:space-between;padding:3px 6px;cursor:pointer;"
                      onClick={handleClick}
                      title={
                        <span class="ds-item-title ds-inline-flex-center-6">
                          {title}
                          <Show when={isBl()}>
                            <span class="ds-muted ds-warn-badge">
                              <IconText icon={<BlacklistIcon filled={true} />}>Blacklisted</IconText>
                            </span>
                          </Show>
                        </span>
                      }
                      actions={
                        <ExternalLinkButton
                          className="ds-btn-icon"
                          title="Open on MangaDex"
                          url={`https://mangadex.org/title/${manga.id}`}
                        />
                      }
                    />
                  );
                }}
              </For>
            </div>

            <Show when={(seriesPane.data()?.totalPages ?? 0) > 1}>
              <div style="margin-top: 16px; display: flex; justify-content: center;">
                <Pager
                  totalPages={seriesPane.data()!.totalPages}
                  currentPage={seriesPane.page()}
                  onPage={seriesPane.goToPage}
                />
              </div>
            </Show>
          </Show>
        </Show>
      </Show>

      {/* Tags Directory */}
      <Show when={props.kind === "tags"}>
        <Show when={tagsLoading()}>
          <div style="display: flex; justify-content: center; padding: 40px 0;">
            <Loading />
          </div>
        </Show>

        <Show when={tagsError()}>
          <ErrorRetryRow message={tagsError()!} onRetry={loadTags} />
        </Show>

        <Show when={!tagsLoading() && !tagsError()}>
          <div style="display: flex; flex-direction: column; gap: 16px;">
            <For each={Object.entries(groupedTags())}>
              {([groupName, groupTags]) => (
                <div class="ds-tag-group">
                  <div
                    style="font-size: 12px; font-weight: 700; text-transform: capitalize; margin-bottom: 8px; color: var(--ds-text-muted);"
                  >
                    {groupName} ({groupTags.length})
                  </div>
                  <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                    <For each={groupTags}>
                      {(tag) => {
                        const name = tag.attributes.name.en || Object.values(tag.attributes.name)[0] || "";
                        const handleClick = () => {
                          navigate({
                            view: "browse",
                            browseTab: "search",
                            withTag: name,
                          });
                        };
                        return (
                          <button
                            type="button"
                            class="win-button ds-chip"
                            onClick={handleClick}
                            style="font-size: 11px; padding: 2px 8px; height: 24px;"
                          >
                            {name}
                          </button>
                        );
                      }}
                    </For>
                  </div>
                </div>
              )}
            </For>
          </div>
        </Show>
      </Show>
      {triggerWarning.host}
    </div>
  );
}
