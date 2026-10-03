import { describe, expect, it } from "vitest";
import {
  computeSpreads,
  spreadIndexOf,
  anchorPageOf,
  detectReadingDirection,
  detectIsLongStrip,
  getAdjacentChapters,
  normalizePermalink,
} from "../../src/reader/reader-spread";

describe("reader/reader-spread - computeSpreads", () => {
  it("returns empty array for pageCount 0", () => {
    expect(computeSpreads(0, false, () => false)).toEqual([]);
    expect(computeSpreads(0, true, () => false)).toEqual([]);
  });

  it("pairs pages evenly when coverOffset is false", () => {
    // 5 pages: [0, 1], [2, 3], [4]
    const spreads = computeSpreads(5, false, () => false);
    expect(spreads.length).toBe(3);
    expect(spreads[0].pageIndices).toEqual([0, 1]);
    expect(spreads[1].pageIndices).toEqual([2, 3]);
    expect(spreads[2].pageIndices).toEqual([4]);
  });

  it("isolates page 0 as standalone cover when coverOffset is true", () => {
    // 5 pages with cover: [0], [1, 2], [3, 4]
    const spreads = computeSpreads(5, true, () => false);
    expect(spreads.length).toBe(3);
    expect(spreads[0].pageIndices).toEqual([0]);
    expect(spreads[0].isStandaloneCover).toBe(true);
    expect(spreads[1].pageIndices).toEqual([1, 2]);
    expect(spreads[2].pageIndices).toEqual([3, 4]);
  });

  it("isolates wide (landscape) pages into their own single-page spread", () => {
    // Page 2 is wide: [0, 1], [2] (wide), [3, 4]
    const isWide = (idx: number) => idx === 2;
    const spreads = computeSpreads(5, false, isWide);
    expect(spreads.length).toBe(3);
    expect(spreads[0].pageIndices).toEqual([0, 1]);
    expect(spreads[1].pageIndices).toEqual([2]);
    expect(spreads[1].isWide).toBe(true);
    expect(spreads[2].pageIndices).toEqual([3, 4]);
  });

  it("handles consecutive wide pages properly", () => {
    // Pages 1 and 2 are wide: [0] (paired with wide -> standalone), [1] (wide), [2] (wide), [3]
    const isWide = (idx: number) => idx === 1 || idx === 2;
    const spreads = computeSpreads(4, false, isWide);
    expect(spreads[0].pageIndices).toEqual([0]);
    expect(spreads[1].pageIndices).toEqual([1]);
    expect(spreads[1].isWide).toBe(true);
    expect(spreads[2].pageIndices).toEqual([2]);
    expect(spreads[2].isWide).toBe(true);
    expect(spreads[3].pageIndices).toEqual([3]);
  });
});

describe("reader/reader-spread - spreadIndexOf and anchorPageOf", () => {
  it("converts page index to spread index accurately", () => {
    // Spreads: [0, 1], [2, 3], [4]
    const spreads = computeSpreads(5, false, () => false);
    expect(spreadIndexOf(spreads, 0)).toBe(0);
    expect(spreadIndexOf(spreads, 1)).toBe(0);
    expect(spreadIndexOf(spreads, 2)).toBe(1);
    expect(spreadIndexOf(spreads, 3)).toBe(1);
    expect(spreadIndexOf(spreads, 4)).toBe(2);
  });

  it("clamps out-of-bounds page indices safely", () => {
    const spreads = computeSpreads(5, false, () => false);
    expect(spreadIndexOf(spreads, -5)).toBe(0);
    expect(spreadIndexOf(spreads, 999)).toBe(2);
  });

  it("retrieves the anchor page for a spread index", () => {
    const spreads = computeSpreads(5, false, () => false);
    expect(anchorPageOf(spreads, 0)).toBe(0);
    expect(anchorPageOf(spreads, 1)).toBe(2);
    expect(anchorPageOf(spreads, 2)).toBe(4);
    expect(anchorPageOf(spreads, 999)).toBe(4); // Clamped
  });
});

describe("reader/reader-spread - reading direction and long strip detection", () => {
  it("defaults to RTL when no tags are present", () => {
    expect(detectReadingDirection([])).toBe("rtl");
  });

  it("detects LTR from chapter or series tags", () => {
    expect(detectReadingDirection([{ type: "tag", name: "Left to Right", permalink: "ltr" }])).toBe("ltr");
    expect(detectReadingDirection([], [{ type: "tag", name: "Read Left to Right", permalink: "read_left_to_right" }])).toBe("ltr");
  });

  it("detects Long Strip / Webtoon format", () => {
    expect(detectIsLongStrip([])).toBe(false);
    expect(detectIsLongStrip([{ type: "tag", name: "Webtoon", permalink: "webtoon" }])).toBe(true);
    expect(detectIsLongStrip([], [{ type: "tag", name: "Long Strip", permalink: "long_strip" }])).toBe(true);
  });
});

describe("reader/reader-spread - getAdjacentChapters", () => {
  const chapterList = [
    { permalink: "chapter_1", title: "Chapter 1" },
    { permalink: "chapter_2", title: "Chapter 2" },
    { permalink: "chapter_3", title: "Chapter 3" },
  ];

  it("finds previous and next chapters for middle chapter", () => {
    const adj = getAdjacentChapters(chapterList, "chapter_2");
    expect(adj.prevCh?.permalink).toBe("chapter_1");
    expect(adj.nextCh?.permalink).toBe("chapter_3");
  });

  it("returns null prevCh for first chapter", () => {
    const adj = getAdjacentChapters(chapterList, "chapter_1");
    expect(adj.prevCh).toBeNull();
    expect(adj.nextCh?.permalink).toBe("chapter_2");
  });

  it("returns null nextCh for last chapter", () => {
    const adj = getAdjacentChapters(chapterList, "chapter_3");
    expect(adj.prevCh?.permalink).toBe("chapter_2");
    expect(adj.nextCh).toBeNull();
  });

  it("does not false-positive match when a slug is a suffix substring of another chapter", () => {
    const chapters = [
      { permalink: "chapter_11", title: "Chapter 11" },
      { permalink: "chapter_1", title: "Chapter 1" },
    ];
    // Asking for chapter_1 should NOT match chapter_11
    const adj = getAdjacentChapters(chapters, "chapter_1");
    expect(adj.prevCh?.permalink).toBe("chapter_11");
    expect(adj.nextCh).toBeNull();
  });

  it("does not false-positive match when a baseSlug is a suffix substring of another chapter", () => {
    const chapters = [
      { permalink: "chapter_11", title: "Chapter 11" },
      { permalink: "chapter_1", title: "Chapter 1" },
      { permalink: "chapter_2", title: "Chapter 2" },
    ];
    const adj = getAdjacentChapters(chapters, "series/1");
    expect(adj.prevCh?.permalink).toBe("chapter_11");
    expect(adj.nextCh?.permalink).toBe("chapter_2");
  });
});

describe("reader/reader-spread - normalizePermalink", () => {
  it("strips leading and trailing slashes even when surrounded by whitespace", () => {
    expect(normalizePermalink("  /chapters/citrus_ch01/  ")).toBe("chapters/citrus_ch01");
    expect(normalizePermalink(" ///series/bloom_into_you/// ")).toBe("series/bloom_into_you");
  });

  it("strips .json extension after trimming", () => {
    expect(normalizePermalink(" /chapters/citrus_ch01.json ")).toBe("chapters/citrus_ch01");
  });
});
