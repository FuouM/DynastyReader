import { createChangeNotifier } from "../lib/change-notifier";

const followedNotifier = createChangeNotifier("library.repo:followed");
export const getFollowedRevision = followedNotifier.getRevision;
export const onFollowedChanged = followedNotifier.onChanged;
export const notifyFollowedChanged = followedNotifier.notifyChanged;

const bookmarksNotifier = createChangeNotifier("library.repo:bookmarks");
export const getBookmarksRevision = bookmarksNotifier.getRevision;
export const onBookmarksChanged = bookmarksNotifier.onChanged;
export const notifyBookmarksChanged = bookmarksNotifier.notifyChanged;

const historyNotifier = createChangeNotifier("library.repo:history");
export const getHistoryRevision = historyNotifier.getRevision;
export const onHistoryChanged = historyNotifier.onChanged;
export const notifyHistoryChanged = historyNotifier.notifyChanged;

const progressNotifier = createChangeNotifier("library.repo:progress");
export const getProgressRevision = progressNotifier.getRevision;
export const onProgressChanged = progressNotifier.onChanged;
export const notifyProgressChanged = progressNotifier.notifyChanged;
