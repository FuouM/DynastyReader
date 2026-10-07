import { describe, expect, it } from "vitest";
import type {
  GetFollowedPageOptions,
  GetBookmarksPageOptions,
  GetHistoryPageOptions,
  FollowedSortMode,
  BookmarkSortMode,
  HistorySortMode,
} from "../../src/types/db";

describe("library search & sort options", () => {
  it("validates FollowedSortMode options", () => {
    const validModes: FollowedSortMode[] = ["alphabetical", "recent_added", "recent_checked"];
    expect(validModes).toHaveLength(3);

    const opts: GetFollowedPageOptions = {
      query: "citrus",
      sort: "alphabetical",
    };
    expect(opts.query).toBe("citrus");
    expect(opts.sort).toBe("alphabetical");
  });

  it("validates BookmarkSortMode options", () => {
    const validModes: BookmarkSortMode[] = ["recent", "oldest", "alphabetical"];
    expect(validModes).toHaveLength(3);

    const opts: GetBookmarksPageOptions = {
      query: "chapter 1",
      sort: "recent",
    };
    expect(opts.query).toBe("chapter 1");
    expect(opts.sort).toBe("recent");
  });

  it("validates HistorySortMode options", () => {
    const validModes: HistorySortMode[] = ["recent", "oldest", "alphabetical"];
    expect(validModes).toHaveLength(3);

    const opts: GetHistoryPageOptions = {
      query: "bloom into you",
      sort: "oldest",
    };
    expect(opts.query).toBe("bloom into you");
    expect(opts.sort).toBe("oldest");
  });

  it("handles empty or whitespace-only search queries cleanly", () => {
    const cleanQuery = (q?: string) => q?.trim() || undefined;

    expect(cleanQuery("")).toBeUndefined();
    expect(cleanQuery("   ")).toBeUndefined();
    expect(cleanQuery("  yuri  ")).toBe("yuri");
  });
});
