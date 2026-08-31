import type { DownloadQueueItem } from "../../ipc";
export type { DownloadProgressPayload } from "../../stores/download";
export { formatSpeed, formatEta } from "../../lib/format";

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
