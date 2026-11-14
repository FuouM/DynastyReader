import { createChangeNotifier } from "../lib/change-notifier";

const followedNotifier = createChangeNotifier();
export const getFollowedRevision = followedNotifier.getRevision;
export const notifyFollowedChanged = followedNotifier.notifyChanged;

const bookmarksNotifier = createChangeNotifier();
export const getBookmarksRevision = bookmarksNotifier.getRevision;
export const notifyBookmarksChanged = bookmarksNotifier.notifyChanged;

const historyNotifier = createChangeNotifier();
export const getHistoryRevision = historyNotifier.getRevision;
export const notifyHistoryChanged = historyNotifier.notifyChanged;

const progressNotifier = createChangeNotifier();
export const getProgressRevision = progressNotifier.getRevision;
export const notifyProgressChanged = progressNotifier.notifyChanged;
