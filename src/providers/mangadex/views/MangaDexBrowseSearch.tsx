/**
 * MangaDex Browse Search Pane
 * Visual & structural parity with Dynasty's BrowseSearch:
 * - Search query input with search button and keyboard shortcuts
 * - Girls' Love (GL) default toggle chip and Content Rating filter chips
 * - Series search results with covers, authors, tags, and blacklist warnings
 * - Top & bottom Pager synchronization
 */

import { createEffect, createSignal, For, Show, type Accessor } from "solid-js";
import { searchManga } from "../api/manga";
import { GIRLS_LOVE_TAG_ID } from "../api/constants";
import { formatMangaTitle, getMangaAuthors, getMangaCoverUrl } from "../mapping";
import { isItemBlacklisted, getBlacklistMode } from "../../../db/blacklist.repo";
import { navigate } from "../../../stores/router";
import {
  setPaneError,
  setPaneLoading,
  setTopPagerFor,
  useDelayedSpinner,
  useTabPane,
} from "../../../browse/browse-state";
import { Pager } from "../../../components/Pager";
import { Loading, ErrorRetryRow, EmptyState } from "../../../components/Feedback";
import { Cover } from "../../../components/Cover";
import { ListItem } from "../../../components/ListItem";
import { ExternalLinkButton } from "../../../components/Button";
import { SearchIcon, BlacklistIcon } from "../../../components/Icon";
import { IconText } from "../../../components/Button";
import { useTriggerWarning } from "../../../hooks/useTriggerWarning";
import type { MangaDexContentRating, MangaDexManga, MangaDexSearchFilters } from "../types";

export interface MangaDexBrowseSearchProps {
  active: Accessor<boolean>;
  revision: Accessor<number>;
  forceTick: Accessor<number>;
  transient: { searchQuery?: string; withTag?: string } | null;
  onTransientConsumed: () => void;
}

const PAGE_SIZE = 24;

export function MangaDexBrowseSearch(props: MangaDexBrowseSearchProps) {
  const triggerWarning = useTriggerWarning();
  const [searchQuery, setSearchQuery] = createSignal("");
  const [glOnly, setGlOnly] = createSignal(true);
  const [ratings, setRatings] = createSignal<MangaDexContentRating[]>([
    "safe",
    "suggestive",
    "erotica",
    "pornographic",
  ]);

  // Consume transient search parameters from route (e.g. tag clicks or search-go submit)
  createEffect(() => {
    const tr = props.transient;
    if (tr) {
      if (tr.searchQuery !== undefined) {
        setSearchQuery(tr.searchQuery);
      }
      props.onTransientConsumed();
      pane.goToPage(1);
      pane.reload();
    }
  });

  const pane = useTabPane<{ rows: MangaDexManga[]; totalPages: number; totalCount: number }>({
    active: props.active,
    revision: props.revision,
    forceTick: props.forceTick,
    load: async (page) => {
      const offset = (page - 1) * PAGE_SIZE;
      const filters: MangaDexSearchFilters = {
        title: searchQuery().trim() || undefined,
        includedTags: glOnly() ? [GIRLS_LOVE_TAG_ID] : undefined,
        contentRatings: ratings(),
        limit: PAGE_SIZE,
        offset,
        order: { latestUploadedChapter: "desc" },
      };

      const resp = await searchManga(filters);
      const totalCount = resp.total ?? 0;
      const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

      // Filter out blacklisted items if in 'hide' mode
      const blMode = getBlacklistMode();
      const filtered = (resp.data || []).filter((m) => {
        if (blMode !== "hide") return true;
        const title = formatMangaTitle(m);
        const tags = (m.attributes.tags || []).map((t) => ({
          name: t.attributes.name.en || Object.values(t.attributes.name)[0] || "",
        }));
        const check = isItemBlacklisted(tags, { name: title });
        return !check.blacklisted;
      });

      return { rows: filtered, totalPages, totalCount };
    },
  });

  const showSpinner = useDelayedSpinner(() => pane.loading());

  createEffect(() => {
    setPaneLoading("search", pane.loading());
    setPaneError("search", !!pane.error());
  });

  createEffect(() => {
    if (props.active()) {
      const data = pane.data();
      if (data) {
        setTopPagerFor("search", {
          totalPages: data.totalPages,
          currentPage: pane.page(),
          onPage: pane.goToPage,
        });
      }
    }
  });

  const toggleRating = (r: MangaDexContentRating): void => {
    setRatings((prev) => {
      if (prev.includes(r)) {
        if (prev.length === 1) return prev;
        return prev.filter((item) => item !== r);
      }
      return [...prev, r];
    });
    pane.goToPage(1);
    pane.reload();
  };

  const toggleGl = (): void => {
    setGlOnly((prev) => !prev);
    pane.goToPage(1);
    pane.reload();
  };

  const handleSearchSubmit = (): void => {
    pane.goToPage(1);
    pane.reload();
  };

  return (
    <div class="ds-search-pane">
      {/* Search Input and Filter Chips Header */}
      <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px;">
        <div style="display: flex; gap: 6px; align-items: center;">
          <div style="position: relative; flex: 1;">
            <input
              type="text"
              class="win-input"
              placeholder="Search MangaDex titles, authors, genres..."
              value={searchQuery()}
              onInput={(e) => setSearchQuery(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleSearchSubmit();
                }
              }}
              style="width: 100%; padding-left: 26px; height: 26px;"
            />
            <div style="position: absolute; left: 7px; top: 50%; transform: translateY(-50%); opacity: 0.5;">
              <SearchIcon size={13} />
            </div>
          </div>
          <button
            type="button"
            class="win-button"
            onClick={handleSearchSubmit}
            style="height: 26px; padding: 0 12px;"
          >
            Search
          </button>
        </div>

        {/* Filter Chips */}
        <div style="display: flex; flex-wrap: wrap; gap: 4px; align-items: center;">
          <button
            type="button"
            class="win-button ds-chip"
            classList={{ "win-button--active": glOnly() }}
            onClick={toggleGl}
            style="font-size: 11px; padding: 1px 8px; height: 22px;"
          >
            Girls' Love (GL) Only
          </button>

          <span class="ds-muted" style="font-size: 11px; margin: 0 4px;">|</span>

          <For each={(["safe", "suggestive", "erotica", "pornographic"] as MangaDexContentRating[])}>
            {(r) => {
              const active = () => ratings().includes(r);
              return (
                <button
                  type="button"
                  class="win-button ds-chip"
                  classList={{ "win-button--active": active() }}
                  onClick={() => toggleRating(r)}
                  style="font-size: 11px; padding: 1px 7px; height: 22px; text-transform: capitalize;"
                >
                  {r}
                </button>
              );
            }}
          </For>
        </div>
      </div>

      <Show when={showSpinner()}>
        <div style="display: flex; justify-content: center; padding: 40px 0;">
          <Loading />
        </div>
      </Show>

      <Show when={pane.error()}>
        <ErrorRetryRow
          message={pane.error() instanceof Error ? (pane.error() as Error).message : "Search failed"}
          onRetry={pane.reload}
        />
      </Show>

      <Show when={!pane.loading() && !pane.error()}>
        <Show
          when={(pane.data()?.rows.length ?? 0) > 0}
          fallback={<EmptyState>No manga found matching your search.</EmptyState>}
        >
          <div style="display: flex; flex-direction: column; gap: 4px;">
            <For each={pane.data()?.rows}>
              {(manga) => {
                const title = formatMangaTitle(manga);
                const coverUrl = getMangaCoverUrl(manga, "256");
                const authors = getMangaAuthors(manga);
                const permalink = `mdx:${manga.id}`;
                const tags = (manga.attributes.tags || []).map((t) => ({
                  name: t.attributes.name.en || Object.values(t.attributes.name)[0] || "",
                }));
                const blCheck = isItemBlacklisted(tags, { name: title });

                const handleOpen = () => {
                  const proceed = () =>
                    navigate({
                      view: "series",
                      seriesPermalink: permalink,
                      seriesName: title,
                    });
                  if (blCheck.blacklisted && getBlacklistMode() === "warn") {
                    triggerWarning.warn(title, blCheck.matchedTags, proceed);
                  } else {
                    proceed();
                  }
                };

                return (
                  <ListItem
                    onClick={handleOpen}
                    class="ds-feed-item"
                    cssText="cursor:pointer;padding:6px;min-height:56px;"
                    leading={
                      <Cover
                        path={coverUrl}
                        alt={title}
                      />
                    }
                    title={
                      <div style="display: flex; flex-direction: column; gap: 2px;">
                        <div style="display: flex; align-items: center; gap: 6px;">
                          <span class="ds-item-title" style="font-weight: 600; font-size: 13px;">
                            {title}
                          </span>
                          <Show when={blCheck.blacklisted}>
                            <span class="ds-muted ds-warn-badge">
                              <IconText icon={<BlacklistIcon filled={true} />}>Blacklisted</IconText>
                            </span>
                          </Show>
                        </div>
                        <Show when={authors.length > 0}>
                          <span class="ds-muted" style="font-size: 11px;">
                            By {authors.join(", ")}
                          </span>
                        </Show>
                      </div>
                    }
                    body={
                      <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px;">
                        <span class="ds-chip ds-chip-sm" style="text-transform: capitalize; font-size: 10px;">
                          {manga.attributes.status}
                        </span>
                        <span class="ds-chip ds-chip-sm" style="text-transform: capitalize; font-size: 10px;">
                          {manga.attributes.contentRating}
                        </span>
                      </div>
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
      {triggerWarning.host}
    </div>
  );
}
