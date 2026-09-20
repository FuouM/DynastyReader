/**
 * MangaDex Browse Feed Pane (Recent Releases / Recently Added)
 * Visual & structural parity with Dynasty's BrowseFeed:
 * - Chapter-level feed with cover thumbnails, scanlator badges, release dates
 * - Integrated read, bookmark, cached, and blacklist states
 * - Top & bottom Pager synchronization
 */

import { createEffect, For, Show, type Accessor } from "solid-js";
import { searchChapters } from "../api/chapter";
import { searchManga } from "../api/manga";
import { mangaDexChapterToFeedItemData } from "../mapping";
import type { MangaDexChapter, MangaDexManga } from "../types";
import { whitelistEnabled, whitelistedTags } from "../db/whitelist.repo";
import { isItemBlacklisted } from "../../../db/blacklist.repo";
import { getMdxHistoryChapterIds } from "../db/history.repo";
import { getMdxBookmarkChapterIds } from "../db/bookmarks.repo";
import { getFullyCachedMdxChapterIds } from "../db/cache.repo";
import {
  setPaneError,
  setPaneLoading,
  setTopPagerFor,
  useDelayedSpinner,
  useTabPane,
} from "../../../browse/browse-state";
import { Pager } from "../../../components/Pager";
import { Loading, ErrorRetryRow, EmptyState } from "../../../components/Feedback";
import { FeedItemRow, type FeedItemData } from "../../../components/FeedItemRow";
import { useTriggerWarning } from "../../../hooks/useTriggerWarning";
import { useAddToCollection } from "../../../hooks/useAddToCollection";
import { BrowseFeedFooter } from "../../../browse/BrowseFeedFooter";
interface FeedRowData {
  item: FeedItemData;
  coverUrl?: string | null;
  isRead: boolean;
  isBookmarked: boolean;
  isBlacklisted: boolean;
  matchedTags: string[];
  isFullyCached: boolean;
}

interface FeedModel {
  rows: FeedRowData[];
  totalPages: number;
  totalCount: number;
}

export interface MangaDexBrowseFeedProps {
  tabId: "releases" | "added";
  active: Accessor<boolean>;
  revision: Accessor<number>;
  forceTick: Accessor<number>;
}

const PAGE_SIZE = 24;

export function MangaDexBrowseFeed(props: MangaDexBrowseFeedProps) {
  const triggerWarning = useTriggerWarning();
  const addToCol = useAddToCollection();
  const pane = useTabPane<FeedModel>({
    active: props.active,
    revision: () =>
      props.revision() +
      (whitelistEnabled() ? 1000 : 0) +
      whitelistedTags().map((t) => t.id).join(",").length,
    forceTick: props.forceTick,
    load: async (page) => {
      const offset = (page - 1) * PAGE_SIZE;
      let chapters: MangaDexChapter[] = [];
      const mangaMap = new Map<string, MangaDexManga>();
      let totalCount = 0;

      if (whitelistEnabled() && whitelistedTags().length > 0) {
        const tagIds = whitelistedTags().map((t) => t.id);
        const mangaResp = await searchManga({
          includedTags: tagIds,
          order: { latestUploadedChapter: "desc" },
          limit: PAGE_SIZE,
          offset,
        });

        totalCount = mangaResp.total ?? 0;
        const mangaList = mangaResp.data || [];
        for (const m of mangaList) {
          mangaMap.set(m.id, m);
        }

        const chapterIds = mangaList
          .map((m) => m.attributes.latestUploadedChapter)
          .filter((id): id is string => Boolean(id));

        if (chapterIds.length > 0) {
          const cResp = await searchChapters({
            ids: chapterIds,
            limit: 100,
            translatedLanguage: ["en"],
            includes: ["scanlation_group", "manga"],
          });
          chapters = cResp.data || [];
        }
      } else {
        const order: Record<string, "asc" | "desc"> =
          props.tabId === "releases" ? { readableAt: "desc" } : { createdAt: "desc" };
        const resp = await searchChapters({
          limit: PAGE_SIZE,
          offset,
          order,
          translatedLanguage: ["en"],
          includes: ["scanlation_group", "manga"],
        });
        chapters = resp.data || [];
        totalCount = resp.total ?? 0;

        const mangaIds = Array.from(
          new Set(
            chapters
              .map((c) => c.relationships?.find((r: { type: string; id: string }) => r.type === "manga")?.id)
              .filter((id): id is string => Boolean(id)),
          ),
        );
        if (mangaIds.length > 0) {
          try {
            const mangaResp = await searchManga({ ids: mangaIds, limit: 100 });
            for (const m of mangaResp.data || []) {
              mangaMap.set(m.id, m);
            }
          } catch (err) {
            console.warn("[MangaDexBrowseFeed] Failed to batch-fetch manga:", err);
          }
        }
      }

      const chapterIds = chapters.map((c) => c.id);
      const [readSet, bookmarkSet, fullyCachedSet] = await Promise.all([
        getMdxHistoryChapterIds(chapterIds).catch(() => new Set<string>()),
        getMdxBookmarkChapterIds(chapterIds).catch(() => new Set<string>()),
        getFullyCachedMdxChapterIds(chapterIds).catch(() => new Set<string>()),
      ]);

      const rows: FeedRowData[] = [];
      for (const ch of chapters) {
        const mId = ch.relationships?.find((r: { type: string; id: string }) => r.type === "manga")?.id;
        const mEntity = mId ? mangaMap.get(mId) : undefined;
        const mapped = mangaDexChapterToFeedItemData(ch, mEntity);
        const tags = (mapped.tags || []).map((t) => ({ name: t.name || "" }));

        const check = isItemBlacklisted(tags, { name: mapped.series || mapped.title });
        rows.push({
          item: mapped,
          coverUrl: mapped.coverUrl,
          isRead: readSet.has(ch.id),
          isBookmarked: bookmarkSet.has(ch.id),
          isBlacklisted: check.blacklisted,
          matchedTags: check.matchedTags,
          isFullyCached: fullyCachedSet.has(ch.id),
        });
      }

      const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

      return { rows, totalPages, totalCount, cachedAt: Date.now() };
    },
  });

  const showSpinner = useDelayedSpinner(() => pane.loading());

  createEffect(() => {
    setPaneLoading(props.tabId, pane.loading());
    setPaneError(props.tabId, !!pane.error());
  });

  createEffect(() => {
    const data = pane.data();
    if (data && props.active()) {
      setTopPagerFor(props.tabId, {
        totalPages: data.totalPages,
        currentPage: pane.page(),
        onPage: pane.goToPage,
      });
    }
  });

  return (
    <div class="ds-feed-pane">
      <Show when={showSpinner()}>
        <div style="display: flex; justify-content: center; padding: 40px 0;">
          <Loading />
        </div>
      </Show>

      <Show when={pane.error()}>
        <ErrorRetryRow
          message={pane.error() instanceof Error ? (pane.error() as Error).message : "Failed to load feed"}
          onRetry={pane.reload}
        />
      </Show>

      <Show when={!pane.loading() && !pane.error()}>
        <Show
          when={(pane.data()?.rows.length ?? 0) > 0}
          fallback={<EmptyState>No chapters found in this feed.</EmptyState>}
        >
          <div class="ds-feed-list">
            <For each={pane.data()?.rows}>
              {(row) => (
                <FeedItemRow
                  item={row.item}
                  coverPath={row.coverUrl}
                  isRead={row.isRead}
                  isBookmarked={row.isBookmarked}
                  isBlacklisted={row.isBlacklisted}
                  matchedTags={row.matchedTags}
                  isFullyCached={row.isFullyCached}
                  onWarn={(title, matchedTags, proceed) => triggerWarning.warn(title, matchedTags, proceed)}
                  onAddToCol={(item, anchorEl) => addToCol.open(item, anchorEl)}
                />
              )}
            </For>
          </div>

          <BrowseFeedFooter
            state={{
              status: "Synced",
              isStale: false,
              cachedAt: Date.now(),
            }}
            pager={
              <Show when={(pane.data()?.totalPages ?? 0) > 1}>
                <Pager
                  totalPages={pane.data()!.totalPages}
                  currentPage={pane.page()}
                  onPage={pane.goToPage}
                  cssText="margin:0;"
                />
              </Show>
            }
            getHost={() => null}
            onCheckUpdates={async () => {
              pane.reload();
              return "unchanged";
            }}
          />
        </Show>
      </Show>
      {triggerWarning.host}
      {addToCol.host}
    </div>
  );
}
