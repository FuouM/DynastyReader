/**
 * MangaDex Library View
 * Manages user's followed MangaDex series and reading history backed by mangadex.db.
 */

import { createSignal, For, onMount, Show } from "solid-js";
import { getFollowedManga, unfollowManga, type FollowedMangaPageResult } from "../db/library.repo";
import { clearHistory, deleteHistoryItem, getHistory, type HistoryPageResult } from "../db/history.repo";
import { getMdxBookmarks, removeMdxBookmark, type BookmarksPageResult } from "../db/bookmarks.repo";
import { navigate } from "../../../stores/router";
import { SubTabs } from "../../../components/SubTabs";
import { Loading } from "../../../components/Feedback";
import { TrashIcon } from "../../../components/Icon";
import { LibraryItemRow } from "../../../library/LibraryItemRow";

export function MangaDexLibrary() {
  const [activeTab, setActiveTab] = createSignal<"followed" | "bookmarks" | "history">("followed");
  const [followedData, setFollowedData] = createSignal<FollowedMangaPageResult | null>(null);
  const [bookmarksData, setBookmarksData] = createSignal<BookmarksPageResult | null>(null);
  const [historyData, setHistoryData] = createSignal<HistoryPageResult | null>(null);
  const [loading, setLoading] = createSignal(false);
  const [page, setPage] = createSignal(1);

  const loadData = async (): Promise<void> => {
    setLoading(true);
    try {
      if (activeTab() === "followed") {
        const res = await getFollowedManga(page(), 24);
        setFollowedData(res);
      } else if (activeTab() === "bookmarks") {
        const res = await getMdxBookmarks(page(), 24);
        setBookmarksData(res);
      } else {
        const res = await getHistory(page(), 30);
        setHistoryData(res);
      }
    } finally {
      setLoading(false);
    }
  };

  onMount(() => {
    void loadData();
  });

  const handleTabChange = (tabId: string): void => {
    setActiveTab(tabId as "followed" | "bookmarks" | "history");
    setPage(1);
    void loadData();
  };


  const handleClearHistory = async (): Promise<void> => {
    await clearHistory();
    void loadData();
  };

  return (
    <div id="ds-pane-library" class="ds-pane" style="padding: 12px; overflow-y: auto;">
      {/* SubTabs Header */}
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
        <SubTabs
          tabs={[
            { id: "followed", label: "Followed Manga", shortLabel: "Followed" },
            { id: "bookmarks", label: "Bookmarks", shortLabel: "Bookmarks" },
            { id: "history", label: "Reading History", shortLabel: "History" },
          ]}
          activeTab={activeTab()}
          onSwitch={handleTabChange}
        />

        <Show when={activeTab() === "history" && (historyData()?.totalCount ?? 0) > 0}>
          <button
            type="button"
            class="win-button ds-btn-sm"
            onClick={handleClearHistory}
            style="display: flex; align-items: center; gap: 4px; font-size: 11px;"
          >
            <TrashIcon size={12} />
            <span>Clear History</span>
          </button>
        </Show>
      </div>

      <Show when={loading()}>
        <div style="display: flex; justify-content: center; padding: 40px 0;">
          <Loading />
        </div>
      </Show>

      {/* Followed Tab Content */}
      <Show when={!loading() && activeTab() === "followed"}>
        <Show
          when={(followedData()?.rows.length ?? 0) > 0}
          fallback={
            <div class="ds-empty" style="text-align: center; padding: 40px 0;">
              You have not followed any MangaDex titles yet.
            </div>
          }
        >
          <div class="ds-library-panel" style="display: flex; flex-direction: column; gap: 2px;">
            <For each={followedData()?.rows}>
              {(row) => (
                <LibraryItemRow
                  title={row.title}
                  subtitle={row.latest_chapter_title ? `Latest: ${row.latest_chapter_title}` : undefined}
                  cover={row.cover_filename}
                  onOpen={() => {
                    navigate({
                      view: "series",
                      seriesPermalink: `mdx:${row.manga_id}`,
                      seriesName: row.title,
                    });
                  }}
                  onDelete={async () => {
                    await unfollowManga(row.manga_id);
                    void loadData();
                  }}
                  deleteTitle="Unfollow"
                  externalUrl={`https://mangadex.org/title/${row.manga_id}`}
                />
              )}
            </For>
          </div>
        </Show>
      </Show>

      {/* Bookmarks Tab Content */}
      <Show when={!loading() && activeTab() === "bookmarks"}>
        <Show
          when={(bookmarksData()?.rows.length ?? 0) > 0}
          fallback={
            <div class="ds-empty" style="text-align: center; padding: 40px 0;">
              You have no bookmarked MangaDex chapters.
            </div>
          }
        >
          <div class="ds-library-panel" style="display: flex; flex-direction: column; gap: 2px;">
            <For each={bookmarksData()?.rows}>
              {(bm) => (
                <LibraryItemRow
                  title={bm.manga_title}
                  subtitle={`${bm.chapter_title} (Page ${bm.page_index + 1})`}
                  onOpen={() => {
                    navigate({
                      view: "reader",
                      chapterPermalink: `mdx:${bm.chapter_id}`,
                      chapterTitle: bm.chapter_title,
                      seriesPermalink: `mdx:${bm.manga_id}`,
                      seriesName: bm.manga_title,
                      startPage: bm.page_index,
                    });
                  }}
                  onDelete={async () => {
                    await removeMdxBookmark(bm.chapter_id);
                    void loadData();
                  }}
                  deleteTitle="Remove bookmark"
                  externalUrl={`https://mangadex.org/chapter/${bm.chapter_id}`}
                />
              )}
            </For>
          </div>
        </Show>
      </Show>

      {/* History Tab Content */}
      <Show when={!loading() && activeTab() === "history"}>
        <Show
          when={(historyData()?.rows.length ?? 0) > 0}
          fallback={
            <div class="ds-empty" style="text-align: center; padding: 40px 0;">
              Your MangaDex reading history is empty.
            </div>
          }
        >
          <div class="ds-library-panel" style="display: flex; flex-direction: column; gap: 2px;">
            <For each={historyData()?.rows}>
              {(item) => (
                <LibraryItemRow
                  title={item.manga_title}
                  subtitle={`${item.chapter_title}${item.scanlator_name ? ` — [${item.scanlator_name}]` : ""} • ${new Date(item.read_at).toLocaleDateString()}`}
                  onOpen={() => {
                    navigate({
                      view: "reader",
                      chapterPermalink: `mdx:${item.chapter_id}`,
                      chapterTitle: item.chapter_title,
                      seriesPermalink: `mdx:${item.manga_id}`,
                      seriesName: item.manga_title,
                    });
                  }}
                  onDelete={async () => {
                    await deleteHistoryItem(item.id);
                    void loadData();
                  }}
                  deleteTitle="Remove from history"
                  externalUrl={`https://mangadex.org/chapter/${item.chapter_id}`}
                />
              )}
            </For>
          </div>
        </Show>
      </Show>
    </div>
  );
}
