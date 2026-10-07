import { describe, expect, it } from "vitest";
import { compareCachedChapters } from "../../src/browse/downloads/buildGroups";
import type { ProcessedCachedChapter } from "../../src/browse/downloads/types";

function makeChapter(title: string, volume?: string): ProcessedCachedChapter {
  return {
    chapterPermalink: title.toLowerCase().replace(/\s+/g, "_"),
    chapterTitle: title,
    seriesPermalink: "series_test",
    seriesName: "Series Test",
    coverPath: null,
    pageCount: 20,
    pageTotal: 20,
    totalSizeBytes: 1000,
    lastCachedAt: 1000,
    shortLabel: "",
    volumeHeader: volume,
    isRead: false,
    isBookmarked: false,
  };
}

describe("browse/downloads/buildGroups - compareCachedChapters", () => {
  it("sorts chapters numerically within the same volume", () => {
    const chs = [
      makeChapter("Chapter 10", "Volume 1"),
      makeChapter("Chapter 2", "Volume 1"),
      makeChapter("Chapter 1", "Volume 1"),
    ];

    chs.sort(compareCachedChapters);

    expect(chs.map((c) => c.chapterTitle)).toEqual(["Chapter 1", "Chapter 2", "Chapter 10"]);
  });

  it("prevents volume interleaving when chapter numbering resets across volumes", () => {
    const chs = [
      makeChapter("Chapter 2", "Volume 2"),
      makeChapter("Chapter 1", "Volume 1"),
      makeChapter("Chapter 2", "Volume 1"),
      makeChapter("Chapter 1", "Volume 2"),
    ];

    chs.sort(compareCachedChapters);

    expect(chs.map((c) => `${c.volumeHeader} ${c.chapterTitle}`)).toEqual([
      "Volume 1 Chapter 1",
      "Volume 1 Chapter 2",
      "Volume 2 Chapter 1",
      "Volume 2 Chapter 2",
    ]);
  });

  it("places volume-collected chapters before uncollected chapters", () => {
    const chs = [
      makeChapter("Extra Chapter", undefined),
      makeChapter("Chapter 1", "Volume 1"),
      makeChapter("Chapter 2", "Volume 2"),
    ];

    chs.sort(compareCachedChapters);

    expect(chs.map((c) => c.chapterTitle)).toEqual([
      "Chapter 1",
      "Chapter 2",
      "Extra Chapter",
    ]);
  });
});
