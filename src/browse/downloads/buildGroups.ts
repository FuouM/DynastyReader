/**
 * Grouping and sorting algorithms for active downloads and cached chapters.
 */

import type { DownloadQueueItem } from "../../ipc";
import type { FullyCachedChapterRow } from "../../db/cache.repo";
import { extractVolumeHeader } from "../../utils/formatting";
import type {
  DownloadedSeriesGroup,
  DownloadedSortMode,
  ProcessedCachedChapter,
  SeriesDownloadGroup,
} from "./types";

// ── 1. Active Queue Grouping ───────────────────────────────────────────────────

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
      status = "downloading";
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

// ── 2. Stored Chapters Grouping ────────────────────────────────────────────────

const titleCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function extractChapterLabel(title: string, index?: number): string {
  const clean = title.trim();
  const match = clean.match(/\b(?:chapter|ch\.?|c)\s*(\d+(?:\.\d+)?)\b/i);
  if (match) return match[1];
  const volMatch = clean.match(/\b(?:volume|vol\.?|v)\s*(\d+(?:\.\d+)?)\b/i);
  if (volMatch) return `V${volMatch[1]}`;
  const leadingNum = clean.match(/^(\d+(?:\.\d+)?)/);
  if (leadingNum) return leadingNum[1];
  const anyNum = clean.match(/\b(\d+(?:\.\d+)?)\b/);
  if (anyNum) return anyNum[1];
  if (/oneshot|one-shot/i.test(clean)) return "OS";
  if (/prologue/i.test(clean)) return "Pro";
  if (/epilogue/i.test(clean)) return "Epi";
  if (/extra/i.test(clean)) return "Ex";
  if (clean.length <= 4) return clean;
  if (index !== undefined) return `${index + 1}`;
  return "1";
}

export function buildGroups(
  rows: FullyCachedChapterRow[],
  readHistoryMap: Map<string, number>,
  bookmarkSet: Set<string>,
  volumeMap: Map<string, string>,
  sortMode: DownloadedSortMode,
): { groups: DownloadedSeriesGroup[]; orphans: ProcessedCachedChapter[] } {
  const map = new Map<string, DownloadedSeriesGroup>();
  const orphans: ProcessedCachedChapter[] = [];
  for (const r of rows) {
    const vol = volumeMap.get(r.chapterPermalink) || extractVolumeHeader(r.chapterTitle);
    const readAt = readHistoryMap.get(r.chapterPermalink) ?? 0;
    const ch: ProcessedCachedChapter = {
      ...r,
      shortLabel: "",
      volumeHeader: vol,
      isRead: readAt > 0,
      isBookmarked: bookmarkSet.has(r.chapterPermalink),
    };
    if (!r.seriesPermalink) {
      orphans.push(ch);
      continue;
    }
    const key = r.seriesPermalink;
    let g = map.get(key);
    if (!g) {
      g = {
        seriesPermalink: key,
        seriesName: r.seriesName,
        coverPath: r.coverPath,
        chapters: [],
        totalSizeBytes: 0,
        lastCachedAt: 0,
        lastReadAt: 0,
        readCount: 0,
      };
      map.set(key, g);
    }
    g.chapters.push(ch);
    g.totalSizeBytes += r.totalSizeBytes;
    if (ch.isRead) g.readCount++;
    g.lastCachedAt = Math.max(g.lastCachedAt, r.lastCachedAt);
    g.lastReadAt = Math.max(g.lastReadAt, readAt);
    if (!g.coverPath && r.coverPath) g.coverPath = r.coverPath;
    if (!g.seriesName && r.seriesName) g.seriesName = r.seriesName;
  }
  for (const g of map.values()) {
    g.chapters.sort((a, b) => titleCollator.compare(a.chapterTitle, b.chapterTitle));
    const total = g.chapters.length;
    for (let i = 0; i < total; i++) {
      g.chapters[i].shortLabel = extractChapterLabel(g.chapters[i].chapterTitle, i);
    }
  }
  const orphanTotal = orphans.length;
  for (let i = 0; i < orphanTotal; i++) {
    orphans[i].shortLabel = extractChapterLabel(orphans[i].chapterTitle, i);
  }

  const groups = Array.from(map.values());
  if (sortMode === "size-desc") {
    groups.sort((a, b) => b.totalSizeBytes - a.totalSizeBytes);
    orphans.sort((a, b) => b.totalSizeBytes - a.totalSizeBytes);
  } else if (sortMode === "size-asc") {
    groups.sort((a, b) => a.totalSizeBytes - b.totalSizeBytes);
    orphans.sort((a, b) => a.totalSizeBytes - b.totalSizeBytes);
  } else if (sortMode === "name-asc") {
    groups.sort((a, b) => {
      const nameA = a.seriesName || a.seriesPermalink;
      const nameB = b.seriesName || b.seriesPermalink;
      return titleCollator.compare(nameA, nameB);
    });
    orphans.sort((a, b) => titleCollator.compare(a.chapterTitle, b.chapterTitle));
  } else if (sortMode === "read-desc") {
    groups.sort((a, b) => {
      if (b.lastReadAt !== a.lastReadAt) {
        return b.lastReadAt - a.lastReadAt;
      }
      return b.lastCachedAt - a.lastCachedAt;
    });
    orphans.sort((a, b) => {
      const readA = readHistoryMap.get(a.chapterPermalink) ?? 0;
      const readB = readHistoryMap.get(b.chapterPermalink) ?? 0;
      if (readB !== readA) {
        return readB - readA;
      }
      return b.lastCachedAt - a.lastCachedAt;
    });
  } else {
    // "download-desc" (default): newest cached first
    groups.sort((a, b) => b.lastCachedAt - a.lastCachedAt);
    orphans.sort((a, b) => b.lastCachedAt - a.lastCachedAt);
  }

  return { groups, orphans };
}
