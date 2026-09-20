/**
 * MangaDex Library View
 * Manages user's followed MangaDex series and reading history backed by mangadex.db.
 */

import { createSignal, For, onMount, Show } from "solid-js";
import { getFollowedManga, unfollowManga, type FollowedMangaPageResult } from "../db/library.repo";
import { clearHistory, deleteHistoryItem, getHistory, type HistoryPageResult } from "../db/history.repo";
import { navigate } from "../../../stores/router";
import { SubTabs } from "../../../components/SubTabs";
import { Loading } from "../../../components/Feedback";
import { TrashIcon } from "../../../components/Icon";

export function MangaDexLibrary() {
  const [activeTab, setActiveTab] = createSignal<"followed" | "history">("followed");
  const [followedData, setFollowedData] = createSignal<FollowedMangaPageResult | null>(null);
  const [historyData, setHistoryData] = createSignal<HistoryPageResult | null>(null);
  const [loading, setLoading] = createSignal(false);
  const [page, setPage] = createSignal(1);

  const loadData = async (): Promise<void> => {
    setLoading(true);
    try {
      if (activeTab() === "followed") {
        const res = await getFollowedManga(page(), 24);
        setFollowedData(res);
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
    setActiveTab(tabId as "followed" | "history");
    setPage(1);
    void loadData();
  };

  const handleUnfollow = async (mangaId: string, ev: MouseEvent): Promise<void> => {
    ev.stopPropagation();
    await unfollowManga(mangaId);
    void loadData();
  };

  const handleDeleteHistory = async (id: number, ev: MouseEvent): Promise<void> => {
    ev.stopPropagation();
    await deleteHistoryItem(id);
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
          <div
            style="display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 12px; margin-bottom: 16px;"
          >
            <For each={followedData()?.rows}>
              {(row) => {
                const coverUrl = row.cover_filename;
                const handleClick = () => {
                  navigate({
                    view: "series",
                    seriesPermalink: `mdx:${row.manga_id}`,
                    seriesName: row.title,
                  });
                };

                return (
                  <div
                    class="ds-card win-button"
                    style="display: flex; flex-direction: column; padding: 6px; cursor: pointer; text-align: left; position: relative;"
                    onClick={handleClick}
                  >
                    <div style="width: 100%; aspect-ratio: 2/3; overflow: hidden; margin-bottom: 6px; background: var(--ds-bg-sunken); border-radius: 2px;">
                      <Show when={coverUrl} fallback={<div class="ds-cover-placeholder" />}>
                        <img
                          src={coverUrl!}
                          alt={row.title}
                          loading="lazy"
                          style="width: 100%; height: 100%; object-fit: cover;"
                        />
                      </Show>
                    </div>
                    <span
                      class="ds-truncate-2"
                      style="font-size: 11px; font-weight: 600; line-height: 1.3;"
                      title={row.title}
                    >
                      {row.title}
                    </span>
                    <button
                      type="button"
                      class="win-button ds-btn-sm"
                      onClick={(e) => handleUnfollow(row.manga_id, e)}
                      style="margin-top: auto; padding: 2px 4px; font-size: 10px; width: 100%;"
                    >
                      Unfollow
                    </button>
                  </div>
                );
              }}
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
          <div style="display: flex; flex-direction: column; gap: 4px;">
            <For each={historyData()?.rows}>
              {(item) => {
                const handleOpen = () => {
                  navigate({
                    view: "reader",
                    chapterPermalink: `mdx:${item.chapter_id}`,
                    chapterTitle: item.chapter_title,
                    seriesPermalink: `mdx:${item.manga_id}`,
                    seriesName: item.manga_title,
                  });
                };

                return (
                  <div
                    class="ds-chapter-row"
                    style="display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; cursor: pointer;"
                    onClick={handleOpen}
                  >
                    <div style="display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0;">
                      <span class="ds-truncate" style="font-size: 12px; font-weight: 600;">
                        {item.manga_title}
                      </span>
                      <span class="ds-truncate ds-muted" style="font-size: 11px;">
                        {item.chapter_title}
                        {item.scanlator_name ? ` — [${item.scanlator_name}]` : ""}
                      </span>
                    </div>

                    <div style="display: flex; align-items: center; gap: 12px; flex-shrink: 0;">
                      <span class="ds-muted" style="font-size: 10px;">
                        {new Date(item.read_at).toLocaleDateString()}
                      </span>
                      <button
                        type="button"
                        class="win-button ds-btn-icon"
                        onClick={(e) => handleDeleteHistory(item.id, e)}
                        title="Remove from history"
                        style="padding: 2px;"
                      >
                        <TrashIcon size={12} />
                      </button>
                    </div>
                  </div>
                );
              }}
            </For>
          </div>
        </Show>
      </Show>
    </div>
  );
}
