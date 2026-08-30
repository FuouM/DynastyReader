/**
 * Background head revalidation (page 1) to detect new chapters while idle or on tab switches.
 * Extracted from `BrowseFeed.tsx` for modularity.
 */

import { getCached } from "../db";
import { checkFeedOnline } from "../api";
import { tryParseJson } from "../utils/json";
import { log } from "../utils/log";
import type { Feed } from "../types/api";

export const STALE_REVALIDATION_THRESHOLD_MS = 90_000;

export const FEED_TAB_TO_URL: Record<string, string> = {
  releases: "/chapters.json",
  added: "/chapters/added.json",
};

export const FEED_TAB_TO_KEY: Record<string, string> = {
  releases: "feed:releases",
  added: "feed:added",
};

const parseFeedTop = (json: string): string | undefined =>
  tryParseJson<Feed>(json)?.chapters?.[0]?.permalink;

export interface FeedHeadRevalidationResult {
  hasNew: boolean;
  etag?: string;
  status: "unchanged" | "new-chapters" | "no-baseline" | "error";
}

/**
 * Revalidates the feed HEAD (page 1) to detect genuinely new chapters. New
 * releases always land at position 0 of page 1, so only its top permalink can
 * signal "new chapters".
 */
export async function revalidateFeedHead(tabId: string): Promise<FeedHeadRevalidationResult> {
  const url = FEED_TAB_TO_URL[tabId];
  const key = `${FEED_TAB_TO_KEY[tabId]}:1`;
  const cached = await getCached(key);
  const cachedTop = cached ? parseFeedTop(cached.json_payload) : undefined;
  try {
    const res = await checkFeedOnline(url, key, cached?.etag);
    if (res.status === 200 && res.data) {
      const freshTop = res.data.chapters?.[0]?.permalink;
      if (cachedTop !== undefined && freshTop && freshTop !== cachedTop) {
        return { hasNew: true, etag: res.etag, status: "new-chapters" };
      }
      return {
        hasNew: false,
        etag: res.etag,
        status: cachedTop === undefined ? "no-baseline" : "unchanged",
      };
    }
    if (res.status === 304) {
      return { hasNew: false, etag: res.etag ?? cached?.etag, status: "unchanged" };
    }
    return { hasNew: false, etag: cached?.etag, status: "error" };
  } catch (err) {
    log.debug("feed-head-revalidation", "revalidateFeedHead failed for", tabId, err);
    return { hasNew: false, etag: cached?.etag, status: "error" };
  }
}
