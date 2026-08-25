import { absUrl } from "../stores";
import { getCached, setCached, touchCached } from "../db";
import { httpGetText } from "./http";
import { recordCacheHit } from "./traffic";
import { tryParseJson } from "../utils/json";
import { FeedSchema } from "./schemas";
import type { Feed, FeedRevalidationResult, RevalidateOnlineResult } from "../types/api";

export const FEED_TTL_MS = 60 * 60 * 1000;

/**
 * Checks Dynasty Scans online using ETag If-None-Match.
 * Returns 304 (unchanged) or 200 (fresh data).
 */
export async function checkFeedOnline(
  urlPath: string,
  key: string,
  etag?: string,
): Promise<RevalidateOnlineResult> {
  const url = absUrl(urlPath);
  const headers: Record<string, string> = {};
  if (etag) {
    headers["If-None-Match"] = etag;
  }
  const resp = await httpGetText(url, { headers });
  if (resp.status === 304) {
    await touchCached(key);
    return { status: 304, isNew: false, etag };
  }
  if (resp.status === 200 && resp.body) {
    const raw = tryParseJson<unknown>(resp.body);
    if (raw === null) throw new Error("Invalid JSON from feed endpoint");
    const freshData = FeedSchema.parse(raw);
    await setCached(key, "feed", resp.body, resp.etag);

    // Opportunistically index series and tags from new feed chapters into directory_entries
    if (freshData.chapters && freshData.chapters.length > 0) {
      try {
        const { saveSuggestEntries } = await import("../db");
        const itemsToSave: { name: string; type: string }[] = [];
        for (const ch of freshData.chapters) {
          if (ch.series) itemsToSave.push({ name: ch.series, type: "Series" });
          for (const t of ch.tags ?? []) {
            if (t.name) itemsToSave.push({ name: t.name, type: t.type || "Tag" });
          }
        }
        if (itemsToSave.length > 0) {
          void saveSuggestEntries(itemsToSave).catch((err) => {
            console.warn("[api/feed] saveSuggestEntries failed:", err);
          });
        }
      } catch (err) {
        console.warn("[api/feed] failed to import db for saving feed suggestions:", err);
      }
    }

    return { status: 200, data: freshData, isNew: true, etag: resp.etag };
  }
  return { status: resp.status, isNew: false };
}

/**
 * Stale-While-Revalidate feed fetcher:
 * 1. Returns cached SQLite feed data immediately (0ms blocking).
 * 2. If data is stale, silently dispatches a background ETag request (`If-None-Match`).
 * 3. If server returns 304 Not Modified, updates timestamp with 0 bytes transferred.
 * 4. If server returns 200 OK with new chapters, resolves revalidatePromise with new Feed.
 */
export async function fetchFeedWithRevalidation(
  urlPath: string,
  key: string,
): Promise<FeedRevalidationResult> {
  const url = absUrl(urlPath);
  const cached = await getCached(key);
  const isStale = !cached || Date.now() - cached.cached_at >= FEED_TTL_MS;

  if (cached) {
    let parsed: Feed | null = null;
    try {
      const raw = JSON.parse(cached.json_payload);
      parsed = FeedSchema.parse(raw);
    } catch (err) {
      console.warn(`[api/feed] failed to parse cached feed payload for ${key}:`, err);
    }
    if (parsed) {
      recordCacheHit(cached.json_payload.length);
      if (!isStale) {
        return {
          data: parsed,
          isStale: false,
          cachedAt: cached.cached_at,
          etag: cached.etag,
          source: "sqlite",
        };
      }

      const revalidatePromise = (async () => {
        try {
          const res = await checkFeedOnline(urlPath, key, cached.etag);
          if (res.status === 200 && res.data) {
            return { data: res.data, isNew: true, etag: res.etag };
          }
        } catch (err) {
          console.warn("Background feed revalidation failed:", err);
        }
        return null;
      })();

      return {
        data: parsed,
        isStale: true,
        cachedAt: cached.cached_at,
        etag: cached.etag,
        source: "sqlite",
        revalidatePromise,
      };
    }
  }

  // No cache present: fetch directly
  const resp = await httpGetText(url);
  if (resp.status !== 200) throw new Error(`HTTP ${resp.status} for ${url}`);
  const raw = tryParseJson<unknown>(resp.body);
  if (raw === null) throw new Error("Invalid JSON from feed endpoint");
  const freshData = FeedSchema.parse(raw);
  await setCached(key, "feed", resp.body, resp.etag);
  return {
    data: freshData,
    isStale: false,
    cachedAt: Date.now(),
    etag: resp.etag,
    source: "network",
  };
}
