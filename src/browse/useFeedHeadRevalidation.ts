/**
 * Background head revalidation (page 1) to detect new chapters while idle or on tab switches.
 * Extracted from `BrowseFeed.tsx` for modularity.
 */

import { getCached } from "../db/metadata.repo";
import { checkFeedOnline } from "../api/feed";
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

/**
 * Most recent `released_on` timestamp (ms) across a feed page's chapters, or
 * undefined when no chapter carries a parseable timestamp. Comparing this
 * instead of the top permalink avoids false "new chapters" positives when the
 * feed head is merely reordered or a chapter is deleted.
 */
export const feedHeadTimestamp = (chapters: Feed["chapters"] | undefined): number | undefined => {
  if (!chapters || chapters.length === 0) return undefined;
  let max = 0;
  for (const c of chapters) {
    if (!c.released_on) continue;
    const ts = Date.parse(c.released_on);
    if (!Number.isNaN(ts) && ts > max) max = ts;
  }
  return max > 0 ? max : undefined;
};

export interface FeedHeadRevalidationResult {
  hasNew: boolean;
  etag?: string;
  status: "unchanged" | "new-chapters" | "no-baseline" | "error";
}

/**
 * Revalidates the feed HEAD (page 1) to detect genuinely new chapters. The
 * most recent `released_on` timestamp is compared so chapter reordering or
 * deletion at the feed head does not raise a false "new chapters" banner.
 */
export async function revalidateFeedHead(tabId: string): Promise<FeedHeadRevalidationResult> {
  const url = FEED_TAB_TO_URL[tabId];
  const key = `${FEED_TAB_TO_KEY[tabId]}:1`;
  const cached = await getCached(key);
  const cachedFeed = cached ? tryParseJson<Feed>(cached.json_payload) : undefined;
  const cachedTs = feedHeadTimestamp(cachedFeed?.chapters);
  const cachedTop = cachedFeed?.chapters?.[0]?.permalink;
  try {
    const res = await checkFeedOnline(url, key, cached?.etag);
    if (res.status === 200 && res.data) {
      const freshTs = feedHeadTimestamp(res.data.chapters);
      const freshTop = res.data.chapters?.[0]?.permalink;
      // Timestamp comparison is authoritative; fall back to top-permalink
      // identity only when either side lacks parseable timestamps.
      const hasNew =
        cachedTs !== undefined && freshTs !== undefined
          ? freshTs > cachedTs
          : cachedTop !== undefined && freshTop !== undefined && freshTop !== cachedTop;
      if (hasNew) {
        return { hasNew: true, etag: res.etag, status: "new-chapters" };
      }
      return {
        hasNew: false,
        etag: res.etag,
        status: cachedTs === undefined && cachedTop === undefined ? "no-baseline" : "unchanged",
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
