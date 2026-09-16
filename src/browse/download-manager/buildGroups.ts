import type { DownloadQueueItem } from "../../ipc";
import type { SeriesDownloadGroup } from "./types";

export function buildSeriesDownloadGroups(
  list: DownloadQueueItem[],
  progMap: Record<string, { done: number; total: number; bytes: number }>,
  paused: boolean,
): SeriesDownloadGroup[] {
  const map = new Map<string, DownloadQueueItem[]>();
  for (const item of list) {
    const key = item.series_permalink || "_singles";
    let arr = map.get(key);
    if (!arr) {
      arr = [];
      map.set(key, arr);
    }
    arr.push(item);
  }

  const groups: SeriesDownloadGroup[] = [];

  for (const [perm, chs] of map.entries()) {
    chs.sort((a, b) => a.chapter_index - b.chapter_index);

    const series_title = chs[0]?.series_title || (perm === "_singles" ? "Individual Chapters" : perm);
    const latestQueuedAt = Math.max(...chs.map((c) => c.queued_at));
    const totalChapters = chs.length;
    const completedChapters = chs.filter((c) => c.status === "done").length;
    const failedChapters = chs.filter((c) => c.status === "failed").length;
    const downloadingItem = chs.find((c) => c.status === "downloading");

    let currentChapterRatio = 0;
    if (downloadingItem) {
      const prog = progMap[downloadingItem.chapter_permalink];
      const done = prog?.done ?? downloadingItem.progress;
      const total = (prog?.total ?? downloadingItem.total_pages) || 1;
      currentChapterRatio = Math.min(1, done / total);
    }

    const overallPercent =
      totalChapters > 0
        ? Math.min(100, Math.round(((completedChapters + currentChapterRatio) / totalChapters) * 100))
        : 0;

    let status: SeriesDownloadGroup["status"] = "pending";
    const hasPending = chs.some((c) => c.status === "pending");
    if (downloadingItem) {
      status = paused ? "paused" : "downloading";
    } else if (paused && hasPending) {
      status = "paused";
    } else if (hasPending && (completedChapters > 0 || list.some((i) => i.status === "downloading"))) {
      status = paused ? "paused" : "downloading";
    } else if (failedChapters > 0 && completedChapters + failedChapters === totalChapters) {
      status = "failed";
    } else if (completedChapters === totalChapters) {
      status = "done";
    } else if (failedChapters > 0) {
      status = "failed";
    }

    groups.push({
      series_permalink: perm,
      series_title,
      items: chs,
      latestQueuedAt,
      totalChapters,
      completedChapters,
      failedChapters,
      downloadingItem,
      overallPercent,
      status,
    });
  }

  return groups.sort((a, b) => {
    const getPriority = (g: SeriesDownloadGroup) => {
      if (g.status === "downloading") return 1;
      if (g.status === "paused" || g.status === "pending") return 2;
      if (g.status === "failed") return 3;
      return 4;
    };
    const priA = getPriority(a);
    const priB = getPriority(b);
    if (priA !== priB) return priA - priB;
    return b.latestQueuedAt - a.latestQueuedAt;
  });
}
