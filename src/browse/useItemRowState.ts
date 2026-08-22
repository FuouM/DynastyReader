/**
 * Shared item row state lookup and flag resolution for Browse and Search feeds.
 */

import {
  getBookmarkPermalinks,
  getFullyCachedChapterPermalinks,
  getHistoryPermalinks,
  isItemBlacklisted,
  type BlacklistMode,
} from "../db";
import type { ChapterTag } from "../types/api";

export interface ItemStateSets {
  readHistorySet: Set<string>;
  bookmarkSet: Set<string>;
  fullyCachedSet: Set<string>;
}

export interface ItemRowFlags {
  isRead: boolean;
  isBookmarked: boolean;
  isFullyCached: boolean;
  isBlacklisted: boolean;
}

/** Fetches read history, bookmark, and fully-cached chapter sets concurrently for a list of permalinks. */
export async function fetchItemStateSets(
  permalinks: string[],
): Promise<ItemStateSets> {
  const [readHistorySet, bookmarkSet, fullyCachedSet] = await Promise.all([
    getHistoryPermalinks(permalinks).catch(() => new Set<string>()),
    getBookmarkPermalinks(permalinks).catch(() => new Set<string>()),
    getFullyCachedChapterPermalinks().catch(() => new Set<string>()),
  ]);

  return {
    readHistorySet,
    bookmarkSet,
    fullyCachedSet,
  };
}

/** Computes display flags for a feed/search item row. */
export function computeItemFlags(
  permalink: string,
  tags: ChapterTag[] | undefined,
  name: string | undefined,
  sets: ItemStateSets,
  blacklistMode: BlacklistMode,
): ItemRowFlags {
  const isRead = sets.readHistorySet.has(permalink);
  const isBookmarked = sets.bookmarkSet.has(permalink);
  const isFullyCached = sets.fullyCachedSet.has(permalink);
  const isBlacklisted = isItemBlacklisted(tags, name, blacklistMode);

  return {
    isRead,
    isBookmarked,
    isFullyCached,
    isBlacklisted,
  };
}
