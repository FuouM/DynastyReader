import type {
  ContentProviderAdapter,
  FollowSeriesInput,
  FollowedLookup,
  ProviderCacheStats,
  ProviderMetaInfo,
} from "./types";
import { MainDbLibraryProvider } from "./main-db-library";
import { t } from "../i18n";
import type { FullyCachedChapterRow } from "../db/cache.repo";
import type { FollowedSeriesPageResult, GetFollowedPageOptions } from "../types/db";

const LOCAL_SLUG_REGEX = /^local:[a-zA-Z0-9_-]+$/;

export class LocalProvider extends MainDbLibraryProvider implements ContentProviderAdapter {
  readonly id = "local" as const;

  get meta(): ProviderMetaInfo {
    return {
      id: "local",
      name: t("providers.local.name"),
      shortName: t("providers.local.shortName"),
      description: t("providers.local.description"),
      badge: t("providers.local.badge"),
      isBrowsable: false,
    };
  }

  matchesPermalink(permalink: string): boolean {
    return typeof permalink === "string" && permalink.startsWith("local:");
  }

  extractEntityId(permalink: string): string {
    if (!permalink) return "";
    return permalink.startsWith("local:") ? permalink.slice(6) : permalink;
  }

  isValidPermalink(candidate: unknown): candidate is string {
    return typeof candidate === "string" && LOCAL_SLUG_REGEX.test(candidate);
  }

  protected override chapterScope(column: string): string {
    return `${column} LIKE 'local:%'`;
  }

  // Followed (Local files cannot be followed from a remote feed)
  async getFollowedPage(_page = 1, _pageSize = 10, _options?: GetFollowedPageOptions): Promise<FollowedSeriesPageResult> {
    return {
      rows: [],
      totalCount: 0,
      totalPages: 0,
      currentPage: 1,
    };
  }

  async getFollowedLookup(): Promise<FollowedLookup> {
    return { permalinks: new Set(), names: new Set() };
  }

  async isFollowed(_permalink: string): Promise<boolean> {
    return false;
  }

  async follow(_input: FollowSeriesInput): Promise<void> {
    // No-op for local
  }

  async unfollow(_permalink: string): Promise<void> {
    // No-op for local
  }

  async updateFollowedCover(_permalink: string, _cover: string | null, _notify = false): Promise<void> {
    // No-op for local
  }

  // Cache (Local files reside on user filesystem and are not part of network cache storage)
  async getDownloadedChapterRows(): Promise<FullyCachedChapterRow[]> {
    return [];
  }

  async clearCachedChapters(_chapterPermalinks: string[]): Promise<void> {
    // No-op for local
  }

  async getCacheStats(): Promise<ProviderCacheStats> {
    return { pages: 0, chapters: 0, total_bytes: 0 };
  }

  async purgeCache(): Promise<void> {
    // No-op for local
  }
}

export const localProvider = new LocalProvider();
