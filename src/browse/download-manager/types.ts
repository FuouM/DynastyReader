import type { DownloadQueueItem } from "../../ipc";

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
