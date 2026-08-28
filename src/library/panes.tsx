/**
 * Solid Library panels: Followed Series, Collections, Bookmarks, Reading History.
 * Re-exports the modularized pane components and shared types.
 */

export { FollowedPane } from "./panes/FollowedPane";
export { CollectionsPane, type CollectionsPaneProps } from "./panes/CollectionsPane";
export { BookmarksPane } from "./panes/BookmarksPane";
export { HistoryPane } from "./panes/HistoryPane";
export type { LibraryPaneApi, LibraryPaneProps } from "./useLibraryPaneResource";
