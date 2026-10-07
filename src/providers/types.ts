import type {
  FollowedSeriesPageResult,
  GetFollowedPageOptions,
  ReadingProgressRow,
  SeriesProgressRow,
  HistoryPageResult,
  GetHistoryPageOptions,
  BookmarkRow,
  BookmarkPageResult,
  GetBookmarksPageOptions,
} from "../types/db";
import type { FullyCachedChapterRow } from "../db/cache.repo";
import type { Series, Chapter } from "../types/api";

export type ContentProviderId = "dynasty" | "mangadex" | "local";

export interface ProviderMetaInfo {
  readonly id: ContentProviderId;
  readonly name: string;
  readonly shortName: string;
  readonly description: string;
  readonly badge: string;
  readonly isBrowsable: boolean;
}

export interface FollowedLookup {
  readonly permalinks: Set<string>;
  readonly names: Set<string>;
}

export interface FollowSeriesInput {
  readonly permalink: string;
  readonly name: string;
  readonly cover?: string | null;
  readonly latestChapterPermalink?: string | null;
  readonly latestChapterTitle?: string | null;
}

export interface BookmarkInput {
  readonly chapterPermalink: string;
  readonly seriesPermalink: string;
  readonly seriesName: string;
  readonly chapterTitle: string;
  readonly pageIndex: number;
}

export interface HistoryInput {
  readonly chapterPermalink: string;
  readonly seriesPermalink: string;
  readonly seriesName: string;
  readonly chapterTitle: string;
}

export interface ReadingProgressInput {
  readonly chapterPermalink: string;
  readonly seriesPermalink: string;
  readonly seriesName: string;
  readonly chapterTitle: string;
  readonly pageIndex: number;
  readonly pageTotal: number;
  readonly completed: boolean;
}

export interface MarkChapterReadInput {
  readonly chapterPermalink: string;
  readonly seriesPermalink: string;
  readonly seriesName: string;
  readonly chapterTitle: string;
  readonly pageTotal?: number;
}

export interface ProviderCacheStats {
  pages: number;
  chapters: number;
  total_bytes: number;
  cached_metadata_count?: number;
}

/**
 * Common adapter interface for content providers (Dynasty Scans, MangaDex, Local import).
 * All provider-specific branching is encapsulated within each implementation.
 */
export interface ContentProviderAdapter {
  readonly id: ContentProviderId;
  readonly meta: ProviderMetaInfo;

  // Permalinks & URLs
  matchesPermalink(permalink: string): boolean;
  extractEntityId(permalink: string): string;
  canonicalUrl(path: string, permalink: string): string;
  isValidPermalink(candidate: unknown): candidate is string;

  // Followed series
  getFollowedPage(page?: number, pageSize?: number, options?: GetFollowedPageOptions): Promise<FollowedSeriesPageResult>;
  getFollowedLookup(): Promise<FollowedLookup>;
  isFollowed(permalink: string): Promise<boolean>;
  follow(input: FollowSeriesInput): Promise<void>;
  unfollow(permalink: string): Promise<void>;
  updateFollowedCover(permalink: string, cover: string | null, notify?: boolean): Promise<void>;

  // Bookmarks
  getBookmark(chapterPermalink: string): Promise<BookmarkRow | null>;
  getBookmarksPage(page?: number, pageSize?: number, options?: GetBookmarksPageOptions): Promise<BookmarkPageResult>;
  addBookmark(input: BookmarkInput): Promise<void>;
  removeBookmark(chapterPermalink: string): Promise<void>;
  removeBookmarksBatch(chapterPermalinks: string[]): Promise<void>;

  // History & Progress
  getHistoryPage(page?: number, pageSize?: number, options?: GetHistoryPageOptions): Promise<HistoryPageResult>;
  removeHistory(id: number): Promise<void>;
  removeHistoryBatch(ids: number[]): Promise<void>;
  clearHistory(): Promise<void>;
  getProgress(chapterPermalink: string): Promise<ReadingProgressRow | null>;
  getProgressForSeries(seriesPermalink: string): Promise<SeriesProgressRow[]>;
  saveProgress(input: ReadingProgressInput): Promise<void>;
  recordHistory(input: HistoryInput): Promise<void>;
  markChapterRead(input: MarkChapterReadInput): Promise<void>;
  markChapterUnread(chapterPermalink: string): Promise<void>;

  // Cache & Pruning
  getDownloadedChapterRows(): Promise<FullyCachedChapterRow[]>;
  clearCachedChapters(chapterPermalinks: string[]): Promise<void>;
  getCacheStats(): Promise<ProviderCacheStats>;
  purgeCache(): Promise<void>;

  // Data fetching
  fetchSeries(permalink: string, force?: boolean, preferredType?: string): Promise<Series>;
  fetchChapterForReader(permalink: string): Promise<{ chapter: Chapter; startPage?: number }>;
}
