/**
 * Groups downloaded chapters by series and applies sorting.
 * Extracted from BrowseDownloaded.tsx for modularity.
 */

import type { FullyCachedChapterRow } from "../../db/cache.repo";
import { extractVolumeHeader } from "../../utils/volume";
import type { DownloadedSeriesGroup, DownloadedSortMode, ProcessedCachedChapter } from "./types";

function extractChapterLabel(title: string, index?: number, total?: number): string {
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
  if (total === 1) return "1";
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
    g.chapters.sort((a, b) =>
      a.chapterTitle.localeCompare(b.chapterTitle, undefined, { numeric: true, sensitivity: "base" }),
    );
    const total = g.chapters.length;
    for (let i = 0; i < total; i++) {
      g.chapters[i].shortLabel = extractChapterLabel(
        g.chapters[i].chapterTitle,
        i,
        total,
      );
    }
  }
  const orphanTotal = orphans.length;
  for (let i = 0; i < orphanTotal; i++) {
    orphans[i].shortLabel = extractChapterLabel(orphans[i].chapterTitle, i, orphanTotal);
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
      return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: "base" });
    });
    orphans.sort((a, b) =>
      a.chapterTitle.localeCompare(b.chapterTitle, undefined, { numeric: true, sensitivity: "base" }),
    );
  } else if (sortMode === "read-desc") {
    // Most recently read series first; unread series (lastReadAt === 0) after read series
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
