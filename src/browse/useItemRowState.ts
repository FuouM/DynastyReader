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
    getFullyCachedChapterPermalinks(permalinks).catch(() => new Set<string>()),
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
  _blacklistMode?: BlacklistMode,
): ItemRowFlags {
  return {
    isRead: sets.readHistorySet.has(permalink),
    isBookmarked: sets.bookmarkSet.has(permalink),
    isFullyCached: sets.fullyCachedSet.has(permalink),
    isBlacklisted: isItemBlacklisted(tags, { name }).blacklisted,
  };
}
