/**
 * Shared types for active downloads and downloaded/cached chapters.
 */

import type { DownloadQueueItem } from "../../ipc";
import type { FullyCachedChapterRow } from "../../db/cache.repo";

// ── 1. Active Download Queue Types ─────────────────────────────────────────────

export interface SeriesDownloadGroup {
  series_permalink: string;
  series_title: string;
  items: DownloadQueueItem[];
  latestQueuedAt: number;
  totalChapters: number;
  completedChapters: number;
  failedChapters: number;
  downloadingItem?: DownloadQueueItem;
  overallPercent: number;
  status: "downloading" | "paused" | "failed" | "pending" | "done";
}

// ── 2. Stored / Cached Download Types ──────────────────────────────────────────

export type DownloadedSortMode = "download-desc" | "name-asc" | "read-desc" | "size-desc" | "size-asc";

export interface DownloadedModel {
  rows: FullyCachedChapterRow[];
  bookmarkSet: Set<string>;
  readHistorySet: Set<string>;
  readHistoryMap: Map<string, number>;
  volumeMap: Map<string, string>;
}

export interface ProcessedCachedChapter extends FullyCachedChapterRow {
  shortLabel: string;
  volumeHeader?: string;
  isRead: boolean;
  isBookmarked: boolean;
}

export interface DownloadedSeriesGroup {
  seriesPermalink: string;
  seriesName: string | null;
  coverPath: string | null;
  chapters: ProcessedCachedChapter[];
  totalSizeBytes: number;
  lastCachedAt: number;
  lastReadAt: number;
  readCount: number;
}
