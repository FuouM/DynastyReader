import type {
  ContentProviderAdapter,
  FollowSeriesInput,
  FollowedLookup,
  ProviderCacheStats,
  ProviderMetaInfo,
} from "./types";
import { MainDbLibraryProvider } from "./main-db-library";
import { query, execute } from "../db/client";
import { queryPaged } from "../db/paging";
import { decodeEntities } from "../utils/formatting";
import { notifyFollowedChanged } from "../db/library-notifiers";
import {
  getFullyCachedChapters,
  clearCachedGroupPages,
  getCacheOverviewStats,
  clearAllCacheStorage,
  type FullyCachedChapterRow,
} from "../db/cache.repo";
import { t } from "../i18n";
import type {
  FollowedSeriesRow,
  FollowedSeriesPageResult,
  GetFollowedPageOptions,
} from "../types/db";

const DYNASTY_SLUG_REGEX = /^[a-zA-Z0-9_-]+$/;

export class DynastyProvider extends MainDbLibraryProvider implements ContentProviderAdapter {
  readonly id = "dynasty" as const;

  get meta(): ProviderMetaInfo {
    return {
      id: "dynasty",
      name: t("providers.dynasty.name"),
      shortName: t("providers.dynasty.shortName"),
      description: t("providers.dynasty.description"),
      badge: t("providers.dynasty.badge"),
      isBrowsable: true,
    };
  }

  matchesPermalink(permalink: string): boolean {
    return (
      typeof permalink === "string" &&
      !permalink.startsWith("mdx:") &&
      !permalink.startsWith("local:")
    );
  }

  extractEntityId(permalink: string): string {
    return permalink;
  }


  isValidPermalink(candidate: unknown): candidate is string {
    return typeof candidate === "string" && DYNASTY_SLUG_REGEX.test(candidate);
  }

  // Followed
  async getFollowedPage(page = 1, pageSize = 10, options?: GetFollowedPageOptions): Promise<FollowedSeriesPageResult> {
    const q = options?.query?.trim();
    const whereSql = q ? `WHERE name LIKE ?` : "";
    const params: unknown[] = q ? [`%${q}%`] : [];
    let orderSql = `ORDER BY name COLLATE NOCASE ASC`;
    if (options?.sort === "recent_added") orderSql = `ORDER BY created_at DESC`;
    else if (options?.sort === "recent_checked") orderSql = `ORDER BY last_checked_at DESC`;

    return queryPaged<FollowedSeriesRow>(
      `SELECT COUNT(*) as count FROM followed_series ${whereSql}`,
      `SELECT permalink, name, cover, last_checked_at, latest_chapter_permalink,
              latest_chapter_title, created_at
       FROM followed_series
       ${whereSql}
       ${orderSql} LIMIT ? OFFSET ?`,
      page,
      pageSize,
      params,
    );
  }

  async getFollowedLookup(): Promise<FollowedLookup> {
    const rows = await query<{ permalink: string; name: string }>(
      `SELECT permalink, name FROM followed_series`,
    ).catch(() => []);
    const permalinks = new Set<string>();
    const names = new Set<string>();
    for (const r of rows) {
      if (r.permalink) permalinks.add(r.permalink);
      if (r.name) names.add(decodeEntities(r.name).trim().toLowerCase());
    }
    return { permalinks, names };
  }

  async isFollowed(permalink: string): Promise<boolean> {
    const rows = await query<{ c: number }>(
      `SELECT COUNT(*) as c FROM followed_series WHERE permalink = ?`,
      [permalink],
    ).catch(() => []);
    return (rows[0]?.c ?? 0) > 0;
  }

  async follow(input: FollowSeriesInput): Promise<void> {
    await execute(
      `INSERT INTO followed_series (permalink, name, cover, last_checked_at,
         latest_chapter_permalink, latest_chapter_title, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(permalink) DO UPDATE SET
         name = excluded.name,
         cover = COALESCE(excluded.cover, followed_series.cover),
         last_checked_at = excluded.last_checked_at,
         latest_chapter_permalink = excluded.latest_chapter_permalink,
         latest_chapter_title = excluded.latest_chapter_title`,
      [
        input.permalink,
        input.name,
        input.cover ?? null,
        Date.now(),
        input.latestChapterPermalink ?? null,
        input.latestChapterTitle ?? null,
        Date.now(),
      ],
    );
    notifyFollowedChanged();
  }

  async unfollow(permalink: string): Promise<void> {
    await execute(`DELETE FROM followed_series WHERE permalink = ?`, [permalink]);
    notifyFollowedChanged();
  }

  async updateFollowedCover(permalink: string, cover: string | null, notify = false): Promise<void> {
    await execute(`UPDATE followed_series SET cover = ? WHERE permalink = ?`, [cover, permalink]);
    if (notify) notifyFollowedChanged();
  }

  // Cache
  async getDownloadedChapterRows(): Promise<FullyCachedChapterRow[]> {
    return getFullyCachedChapters();
  }

  async clearCachedChapters(chapterPermalinks: string[]): Promise<void> {
    return clearCachedGroupPages(chapterPermalinks);
  }

  async getCacheStats(): Promise<ProviderCacheStats> {
    const s = await getCacheOverviewStats();
    return {
      pages: s.totalCachedPages,
      chapters: s.totalCachedChapters,
      total_bytes: s.totalSizeBytes,
      cached_metadata_count: s.totalMetadataEntries,
    };
  }

  async purgeCache(): Promise<void> {
    return clearAllCacheStorage();
  }
}

export const dynastyProvider = new DynastyProvider();
