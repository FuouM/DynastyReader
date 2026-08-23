/**
 * Shared item row state lookup and flag resolution for Browse and Search feeds.
 */

import {
  getBookmarkPermalinks,
  getFullyCachedChapterPermalinks,
  getHistoryPermalinks,
} from "../db";

export interface ItemStateSets {
  readHistorySet: Set<string>;
  bookmarkSet: Set<string>;
  fullyCachedSet: Set<string>;
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
