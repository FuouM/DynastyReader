/**
 * Router & navigation types for the dynasty-scans plugin.
 */
import type { SearchClass } from "./api";


export type ViewName = "library" | "browse" | "series" | "reader" | "cache" | "blacklist" | "whitelist";

export type BrowseTabId =
  | "releases"
  | "added"
  | "downloaded"
  | "series-dir"
  | "tags-dir"
  | "search";

export type LibraryTabId = "followed" | "collections" | "bookmarks" | "history" | "local";

export interface ChapterRef {
  title: string;
  permalink: string;
  released_on?: string;
  /** MangaDex scanlation group id for sticky-scanlator navigation. */
  scanlatorGroup?: string;
  /** MangaDex scanlation group display name. */
  scanlatorGroupName?: string;
}

export interface Route {
  view: ViewName;
  /** Which browse sub-tab to show. */
  browseTab?: BrowseTabId;
  /** Which library sub-tab to show on mobile/narrow view. */
  libraryTab?: LibraryTabId;
  /** Collection ID when viewing a single custom collection in library. */
  collectionId?: number;
  seriesPermalink?: string;
  seriesName?: string;
  chapterPermalink?: string;
  chapterTitle?: string;
  /** Ordered chapter list of the containing series (drives prev/next). */
  chapterList?: ChapterRef[];
  /** Page index to jump to when opening the reader. */
  startPage?: number;
  /** Active search query when opening browse with search tab. */
  searchQuery?: string;
  /** Class filter for search tab. */
  searchClass?: SearchClass;
  /** Initial included tag filter for search tab. */
  withTag?: string;
}

export interface SessionMangaTab {
  title: string;
  route: Route;
}
