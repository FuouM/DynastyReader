/**
 * MangaDex Provider Type Definitions
 * Covers REST API contracts, MangaDex@Home, SQLite models for mangadex.db, and domain UI models.
 */

// ── 1. MangaDex REST API Contracts ──────────────────────────────────────────

export type MangaDexLocalizedString = Record<string, string>;

export type MangaDexContentRating = "safe" | "suggestive" | "erotica" | "pornographic";

export type MangaDexPublicationStatus = "ongoing" | "completed" | "hiatus" | "cancelled";

export interface MangaDexRelationship {
  id: string;
  type: string;
  related?: string;
  attributes?: Record<string, unknown>;
}

export interface MangaDexTagAttributes {
  name: MangaDexLocalizedString;
  description: MangaDexLocalizedString;
  group: "genre" | "theme" | "format" | "content";
  version: number;
}

export type MangaDexTag = {
  id: string;
  type: "tag";
  attributes: MangaDexTagAttributes;
  relationships?: MangaDexRelationship[];
};

export interface MangaDexMangaAttributes {
  title: MangaDexLocalizedString;
  altTitles: MangaDexLocalizedString[];
  description: MangaDexLocalizedString;
  isLocked: boolean;
  originalLanguage: string;
  lastVolume: string | null;
  lastChapter: string | null;
  publicationDemographic: "shounen" | "shoujo" | "josei" | "seinen" | "none" | null;
  status: MangaDexPublicationStatus;
  year: number | null;
  contentRating: MangaDexContentRating;
  tags: MangaDexTag[];
  state: "draft" | "submitted" | "published" | "rejected";
  chapterNumbersResetOnNewVolume: boolean;
  createdAt: string;
  updatedAt: string;
  version: number;
  availableTranslatedLanguages: string[];
  latestUploadedChapter: string | null;
}

export interface MangaDexEntity<T> {
  id: string;
  type: string;
  attributes: T;
  relationships?: MangaDexRelationship[];
}

export interface MangaDexResponse<T> {
  result: "ok" | "error";
  response?: "collection" | "entity";
  data: T;
  limit?: number;
  offset?: number;
  total?: number;
  errors?: Array<{
    id: string;
    status: number;
    title: string;
    detail: string;
  }>;
}

export interface MangaDexChapterAttributes {
  volume: string | null;
  chapter: string | null;
  title: string | null;
  translatedLanguage: string;
  externalUrl: string | null;
  publishAt: string;
  readableAt: string;
  createdAt: string;
  updatedAt: string;
  pages: number;
  version: number;
}

export type MangaDexManga = MangaDexEntity<MangaDexMangaAttributes>;
export type MangaDexChapter = MangaDexEntity<MangaDexChapterAttributes>;

export interface MangaDexCoverArtAttributes {
  description: string;
  volume: string | null;
  fileName: string;
  locale: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export type MangaDexCoverArt = MangaDexEntity<MangaDexCoverArtAttributes>;

export interface MangaDexAuthorAttributes {
  name: string;
  imageUrl: string | null;
  biography: MangaDexLocalizedString;
  twitter: string | null;
  pixiv: string | null;
  melonBook: string | null;
  fanBox: string | null;
  booth: string | null;
  nicoVideo: string | null;
  skeb: string | null;
  fantia: string | null;
  tumblr: string | null;
  youtube: string | null;
  weibo: string | null;
  naver: string | null;
  website: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export type MangaDexAuthor = MangaDexEntity<MangaDexAuthorAttributes>;

export interface MangaDexScanlationGroupAttributes {
  name: string;
  altNames: MangaDexLocalizedString[];
  website: string | null;
  ircServer: string | null;
  ircChannel: string | null;
  discord: string | null;
  contactEmail: string | null;
  description: string | null;
  twitter: string | null;
  mangaUpdates: string | null;
  focusedLanguages: string[];
  locked: boolean;
  official: boolean;
  verified: boolean;
  inactive: boolean;
  publishDelay: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export type MangaDexScanlationGroup = MangaDexEntity<MangaDexScanlationGroupAttributes>;

// ── 2. MangaDex@Home Contracts ──────────────────────────────────────────────

export interface MangaDexAtHomeResponse {
  result: "ok" | "error";
  baseUrl: string;
  chapter: {
    hash: string;
    data: string[];
    dataSaver: string[];
  };
}

export interface MangaDexAtHomeReport {
  url: string;
  success: boolean;
  bytes: number;
  duration: number;
  cached: boolean;
}

export interface MangaDexAggregateChapter {
  chapter: string;
  id: string;
  others: string[];
  count: number;
}

export interface MangaDexAggregateVolume {
  volume: string;
  count: number;
  chapters: Record<string, MangaDexAggregateChapter>;
}

export interface MangaDexAggregateResponse {
  result: "ok" | "error";
  volumes: Record<string, MangaDexAggregateVolume>;
}

// ── 3. SQLite Database Models (mangadex.db) ─────────────────────────────────

export interface MangaDexFollowedRow {
  manga_id: string;
  title: string;
  cover_filename: string | null;
  last_checked_at: number;
  latest_chapter_id: string | null;
  latest_chapter_title: string | null;
  created_at: number;
}

export interface MangaDexReadingProgressRow {
  chapter_id: string;
  manga_id: string;
  manga_title: string;
  chapter_title: string;
  page_index: number;
  page_total: number;
  completed: number;
  scanlator_name: string | null;
  updated_at: number;
}

export interface MangaDexHistoryRow {
  id: number;
  chapter_id: string;
  manga_id: string;
  manga_title: string;
  chapter_title: string;
  scanlator_name: string | null;
  read_at: number;
  page_index?: number | null;
  page_total?: number | null;
  completed?: number | null;
}

export interface MangaDexCachedPageRow {
  chapter_id: string;
  page_index: number;
  file_path: string;
  size_bytes: number;
  created_at: number;
}

// ── 4. UI Domain Models (Multi-Scanlator Accordion & Search) ────────────────

export interface MangaDexChapterUpload {
  id: string;
  chapterNumber: string | null;
  volume: string | null;
  title: string | null;
  translatedLanguage: string;
  scanlatorName: string;
  scanlatorId: string | null;
  readableAt: string;
  pages: number;
  externalUrl: string | null;
}

export interface MangaDexChapterGroup {
  chapterNumber: string | null;
  displayTitle: string;
  volume: string | null;
  uploads: MangaDexChapterUpload[];
}

export interface MangaDexSearchFilters {
  ids?: string[];
  title?: string;
  includedTags?: string[];
  excludedTags?: string[];
  contentRatings?: MangaDexContentRating[];
  status?: MangaDexPublicationStatus[];
  originalLanguage?: string[];
  translatedLanguage?: string[];
  order?: {
    relevance?: "asc" | "desc";
    latestUploadedChapter?: "asc" | "desc";
    title?: "asc" | "desc";
    rating?: "asc" | "desc";
    followedCount?: "asc" | "desc";
    createdAt?: "asc" | "desc";
    updatedAt?: "asc" | "desc";
  };
  limit?: number;
  offset?: number;
}
