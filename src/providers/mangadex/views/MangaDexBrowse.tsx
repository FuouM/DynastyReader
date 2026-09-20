/**
 * MangaDex Browse View
 * Browse and search catalog with Girls' Love default filter, rating chips, and blacklist filtering.
 * Uses DynastyReader's native ListItem and Cover components for visual parity.
 */

import { createSignal, For, onMount, Show } from "solid-js";
import { searchManga } from "../api/manga";
import { GIRLS_LOVE_TAG_ID } from "../api/constants";
import { formatMangaTitle, getMangaAuthors, getMangaCoverUrl } from "../mapping";
import { isItemBlacklisted } from "../../../db/blacklist.repo";
import { navigate } from "../../../stores/router";
import { Loading, EmptyState } from "../../../components/Feedback";
import { Cover } from "../../../components/Cover";
import { ListItem } from "../../../components/ListItem";
import { GroupBox } from "../../../components/GroupBox";
import { Pager } from "../../../components/Pager";
import { SearchIcon, ExternalLinkIcon } from "../../../components/Icon";
import type { MangaDexContentRating, MangaDexManga, MangaDexSearchFilters } from "../types";

export function MangaDexBrowse() {
  const [searchQuery, setSearchQuery] = createSignal("");
  const [glOnly, setGlOnly] = createSignal(true); // Decision 4C: GL active by default
  const [ratings, setRatings] = createSignal<MangaDexContentRating[]>([
    "safe",
    "suggestive",
    "erotica",
    "pornographic",
  ]);
  const [mangaList, setMangaList] = createSignal<MangaDexManga[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [page, setPage] = createSignal(1);
  const [totalCount, setTotalCount] = createSignal(0);
  const limit = 24;

  const toggleRating = (r: MangaDexContentRating): void => {
    setRatings((prev) => {
      if (prev.includes(r)) {
        if (prev.length === 1) return prev; // Keep at least one rating
        return prev.filter((item) => item !== r);
      }
      return [...prev, r];
    });
    setPage(1);
    void loadManga();
  };

  const toggleGl = (): void => {
    setGlOnly((prev) => !prev);
    setPage(1);
    void loadManga();
  };

  const loadManga = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const filters: MangaDexSearchFilters = {
        title: searchQuery().trim() || undefined,
        includedTags: glOnly() ? [GIRLS_LOVE_TAG_ID] : undefined,
        contentRatings: ratings(),
        limit,
        offset: (page() - 1) * limit,
        order: { latestUploadedChapter: "desc" },
      };

      const resp = await searchManga(filters);
      // Filter out series that match user's blacklist
      const filtered = resp.data.filter((m) => {
        const title = formatMangaTitle(m);
        const tags = (m.attributes.tags || []).map((t) => ({
          name: t.attributes.name.en || Object.values(t.attributes.name)[0] || "",
        }));
        const check = isItemBlacklisted(tags, { name: title });
        return !check.blacklisted;
      });

      setMangaList(filtered);
      setTotalCount(resp.total ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load MangaDex catalog");
    } finally {
      setLoading(false);
    }
  };

  onMount(() => {
    void loadManga();
  });

  const totalPages = () => Math.max(1, Math.ceil(totalCount() / limit));

  return (
    <div id="ds-pane-browse" class="ds-pane" style="padding: 8px 12px; overflow-y: auto;">
      {/* Search & Filter Controls */}
      <GroupBox title="Search MangaDex" class="ds-mb-8">
        <div style="display: flex; flex-direction: column; gap: 8px;">
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
                    setPage(1);
                    void loadManga();
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
              onClick={() => {
                setPage(1);
                void loadManga();
              }}
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
      </GroupBox>

      {/* Content Area */}
      <Show when={loading()}>
        <div style="display: flex; justify-content: center; padding: 40px 0;">
          <Loading />
        </div>
      </Show>

      <Show when={error()}>
        <div class="ds-banner ds-banner--error" style="margin-bottom: 12px;">
          {error()}
        </div>
      </Show>

      <Show when={!loading() && mangaList().length === 0 && !error()}>
        <EmptyState>No manga found matching your query and filters.</EmptyState>
      </Show>

      <Show when={!loading() && mangaList().length > 0}>
        <div class="ds-feed-list" style="display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px;">
          <For each={mangaList()}>
            {(manga) => {
              const title = formatMangaTitle(manga);
              const coverUrl = getMangaCoverUrl(manga, "256");
              const authors = getMangaAuthors(manga);
              const tags = (manga.attributes.tags || []).map(
                (t) => t.attributes.name.en || Object.values(t.attributes.name)[0] || "",
              ).filter(Boolean);
              const descMap = manga.attributes.description;
              const desc = descMap?.en || Object.values(descMap || {})[0] || "";

              const handleClick = () => {
                navigate({
                  view: "series",
                  seriesPermalink: `mdx:${manga.id}`,
                  seriesName: title,
                });
              };

              return (
                <ListItem
                  class="ds-feed-item"
                  onClick={handleClick}
                  cssText="cursor: pointer; padding: 4px 6px;"
                  leading={
                    <div class="ds-feed-cover-wrap">
                      <Cover
                        path={coverUrl}
                        alt={title}
                        imgClass="ds-feed-cover"
                        placeholderClass="ds-feed-cover-placeholder"
                      />
                    </div>
                  }
                  title={
                    <div class="ds-item-title ds-inline-flex-center-6" style="margin-bottom: 2px;">
                      <span class="ds-truncate" style="font-weight: 600; font-size: 13px;">
                        {title}
                      </span>
                      <span
                        class="ds-chip ds-muted"
                        style="font-size: 10px; padding: 0 4px; text-transform: capitalize; flex-shrink: 0;"
                      >
                        {manga.attributes.contentRating}
                      </span>
                      <span
                        class="ds-chip"
                        style="font-size: 10px; padding: 0 4px; text-transform: capitalize; flex-shrink: 0;"
                      >
                        {manga.attributes.status}
                      </span>
                    </div>
                  }
                  body={
                    <div style="display: flex; flex-direction: column; gap: 2px;">
                      <Show when={authors.length > 0}>
                        <div class="ds-muted" style="font-size: 11px;">
                          By {authors.join(", ")}
                        </div>
                      </Show>
                      <Show when={tags.length > 0}>
                        <div style="display: flex; flex-wrap: wrap; gap: 4px; margin: 2px 0;">
                          <For each={tags.slice(0, 5)}>
                            {(tName) => (
                              <span class="ds-chip ds-muted" style="font-size: 9px; padding: 0 4px;">
                                {tName}
                              </span>
                            )}
                          </For>
                        </div>
                      </Show>
                      <Show when={desc}>
                        <div class="ds-muted ds-truncate-2" style="font-size: 11px; line-height: 1.35;">
                          {desc}
                        </div>
                      </Show>
                    </div>
                  }
                  actions={
                    <a
                      href={`https://mangadex.org/title/${manga.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="win-button ds-btn-icon"
                      title="Open on MangaDex"
                      onClick={(e) => e.stopPropagation()}
                      style="display: inline-flex; align-items: center; justify-content: center;"
                    >
                      <ExternalLinkIcon size={12} />
                    </a>
                  }
                />
              );
            }}
          </For>
        </div>

        {/* Pager */}
        <div style="display: flex; justify-content: center; padding: 8px 0 16px 0;">
          <Pager
            totalPages={totalPages()}
            currentPage={page()}
            onPage={(p) => {
              setPage(p);
              void loadManga();
            }}
          />
        </div>
      </Show>
    </div>
  );
}
