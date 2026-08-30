/**
 * Shared types for the downloaded chapters feature.
 */

import type { FullyCachedChapterRow } from "../../db";

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
