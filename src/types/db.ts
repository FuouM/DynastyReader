/**
 * SQLite record shapes returned by the plugin's domain repositories.
 */

export type Row = Record<string, unknown>;

export interface CachedMetadata {
  json_payload: string;
  cached_at: number;
  etag?: string;
}

export interface CachedMetadataRow extends CachedMetadata {
  cache_key: string;
  data_type: string;
}

export interface FollowedSeriesRow {
  permalink: string;
  name: string;
  cover: string | null;
  last_checked_at: number;
  latest_chapter_permalink: string | null;
  latest_chapter_title: string | null;
  created_at: number;
}

export interface FollowedSeriesPageResult {
  rows: FollowedSeriesRow[];
  totalPages: number;
  currentPage: number;
  totalCount: number;
}

export type FollowedSortMode = "alphabetical" | "recent_checked" | "recent_added";

export interface GetFollowedPageOptions {
  query?: string;
  sort?: FollowedSortMode;
}

export interface ReadingProgressRow {
  chapter_permalink: string;
  series_permalink: string;
  series_name: string;
  chapter_title: string;
  page_index: number;
  page_total: number;
  completed: number;
  updated_at: number;
}

export interface SeriesProgressRow {
  chapter_permalink: string;
  page_index: number;
  page_total: number;
  completed: number;
}

export interface HistoryRow {
  id: number;
  chapter_permalink: string;
  series_permalink: string;
  series_name: string;
  chapter_title: string;
  read_at: number;
  page_index?: number | null;
  page_total?: number | null;
  completed?: number | null;
}


export type HistorySortMode = "recent" | "oldest" | "alphabetical";

export interface GetHistoryPageOptions {
  query?: string;
  sort?: HistorySortMode;
}
export interface HistoryPageResult {
  rows: HistoryRow[];
  totalPages: number;
  currentPage: number;
  totalCount: number;
}

export interface BookmarkRow {
  chapter_permalink: string;
  series_permalink: string;
  series_name: string;
  chapter_title: string;
  page_index: number;
  created_at: number;
}


export type BookmarkSortMode = "recent" | "oldest" | "alphabetical";

export interface GetBookmarksPageOptions {
  query?: string;
  sort?: BookmarkSortMode;
}
export interface BookmarkPageResult {
  rows: BookmarkRow[];
  totalPages: number;
  currentPage: number;
  totalCount: number;
}

export interface CachedPageRow {
  chapter_permalink: string;
  page_index: number;
  file_path: string;
  cached_at: number;
}

export interface ChapterCacheCount {
  chapter_permalink: string;
  n: number;
}

export interface CacheOverviewStats {
  totalCachedPages: number;
  totalCachedChapters: number;
  totalSizeBytes: number;
  totalMetadataEntries: number;
}

export interface CollectionRow {
  id: number;
  name: string;
  is_default: number;
  created_at: number;
  itemCount?: number;
}

export type CollectionItemKind = "series" | "doujin" | "anthology" | "oneshot" | "chapter";

export interface CollectionItemRow {
  id: number;
  collection_id: number;
  item_permalink: string;
  item_title: string;
  item_kind: CollectionItemKind;
  cover: string | null;
  parent_series_permalink: string | null;
  parent_series_name: string | null;
  created_at: number;
}
