/**
 * MangaDex Browse View
 * Browse and search catalog with Girls' Love default filter, rating chips, and blacklist filtering.
 */

import { createSignal, For, onMount, Show } from "solid-js";
import { searchManga } from "../api/manga";
import { GIRLS_LOVE_TAG_ID } from "../api/constants";
import { formatMangaTitle, getMangaCoverUrl } from "../mapping";
import { isItemBlacklisted } from "../../../db/blacklist.repo";
import { navigate } from "../../../stores/router";
import { Loading } from "../../../components/Feedback";
import { SearchIcon } from "../../../components/Icon";
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
    <div id="ds-pane-browse" class="ds-pane" style="padding: 12px; overflow-y: auto;">
      {/* Search and Filters Header */}
      <div style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 14px;">
        <div style="display: flex; gap: 8px; align-items: center;">
          <div style="position: relative; flex: 1;">
            <input
              type="text"
              class="win-input"
              placeholder="Search MangaDex titles..."
              value={searchQuery()}
              onInput={(e) => setSearchQuery(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setPage(1);
                  void loadManga();
                }
              }}
              style="width: 100%; padding-left: 28px;"
            />
            <div style="position: absolute; left: 8px; top: 50%; transform: translateY(-50%); opacity: 0.5;">
              <SearchIcon size={14} />
            </div>
          </div>
          <button
            type="button"
            class="win-button"
            onClick={() => {
              setPage(1);
              void loadManga();
            }}
          >
            Search
          </button>
        </div>

        {/* Filter Chips */}
        <div style="display: flex; flex-wrap: wrap; gap: 6px; align-items: center;">
          <button
            type="button"
            class="win-button ds-chip"
            classList={{ "win-button--active": glOnly() }}
            onClick={toggleGl}
            style="font-size: 11px; padding: 2px 8px;"
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
                  style="font-size: 11px; padding: 2px 8px; text-transform: capitalize;"
                >
                  {r}
                </button>
              );
            }}
          </For>
        </div>
      </div>

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
        <div class="ds-empty" style="text-align: center; padding: 40px 0;">
          No manga found matching your query and filters.
        </div>
      </Show>

      <Show when={!loading() && mangaList().length > 0}>
        <div
          style="display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 12px; margin-bottom: 16px;"
        >
          <For each={mangaList()}>
            {(manga) => {
              const title = formatMangaTitle(manga);
              const coverUrl = getMangaCoverUrl(manga, "256");

              const handleClick = () => {
                navigate({
                  view: "series",
                  seriesPermalink: `mdx:${manga.id}`,
                  seriesName: title,
                });
              };

              return (
                <div
                  class="ds-card win-button"
                  style="display: flex; flex-direction: column; padding: 6px; cursor: pointer; text-align: left;"
                  onClick={handleClick}
                >
                  <div style="width: 100%; aspect-ratio: 2/3; overflow: hidden; margin-bottom: 6px; background: var(--ds-bg-sunken); border-radius: 2px;">
                    <Show when={coverUrl} fallback={<div class="ds-cover-placeholder" />}>
                      <img
                        src={coverUrl!}
                        alt={title}
                        loading="lazy"
                        style="width: 100%; height: 100%; object-fit: cover;"
                      />
                    </Show>
                  </div>
                  <span
                    class="ds-truncate-2"
                    style="font-size: 11px; font-weight: 600; line-height: 1.3;"
                    title={title}
                  >
                    {title}
                  </span>
                  <div style="display: flex; gap: 4px; margin-top: auto; padding-top: 4px;">
                    <span
                      class="ds-chip ds-muted"
                      style="font-size: 9px; padding: 0 4px; text-transform: capitalize;"
                    >
                      {manga.attributes.contentRating}
                    </span>
                  </div>
                </div>
              );
            }}
          </For>
        </div>

        {/* Pager */}
        <div style="display: flex; justify-content: center; align-items: center; gap: 12px; padding: 12px 0;">
          <button
            type="button"
            class="win-button"
            disabled={page() <= 1}
            onClick={() => {
              setPage((p) => Math.max(1, p - 1));
              void loadManga();
            }}
          >
            Previous
          </button>
          <span style="font-size: 12px;">
            Page {page()} of {totalPages()}
          </span>
          <button
            type="button"
            class="win-button"
            disabled={page() >= totalPages()}
            onClick={() => {
              setPage((p) => p + 1);
              void loadManga();
            }}
          >
            Next
          </button>
        </div>
      </Show>
    </div>
  );
}
