import { describe, expect, it } from "vitest";
import { feedHeadTimestamp } from "../../src/browse/useFeedHeadRevalidation";
import type { FeedChapter } from "../../src/types/api";

describe("browse/useFeedHeadRevalidation - feedHeadTimestamp", () => {
  it("returns undefined for empty or undefined chapters", () => {
    expect(feedHeadTimestamp(undefined)).toBeUndefined();
    expect(feedHeadTimestamp([])).toBeUndefined();
  });

  it("returns undefined when no chapters have parseable timestamps", () => {
    const chapters = [
      { permalink: "c1", title: "C1" } as unknown as FeedChapter,
      { permalink: "c2", title: "C2", released_on: "invalid-date" } as unknown as FeedChapter,
    ];
    expect(feedHeadTimestamp(chapters)).toBeUndefined();
  });

  it("extracts the highest timestamp across chapters", () => {
    const t1 = "2026-01-01T00:00:00Z";
    const t2 = "2026-05-10T12:00:00Z";
    const t3 = "2026-03-15T00:00:00Z";

    const chapters = [
      { permalink: "c1", title: "C1", released_on: t1 } as unknown as FeedChapter,
      { permalink: "c2", title: "C2", released_on: t2 } as unknown as FeedChapter,
      { permalink: "c3", title: "C3", released_on: t3 } as unknown as FeedChapter,
    ];

    expect(feedHeadTimestamp(chapters)).toBe(Date.parse(t2));
  });

  it("prioritizes added_on over released_on when available", () => {
    const chapters = [
      {
        permalink: "c1",
        title: "C1",
        added_on: "2026-06-01T00:00:00Z",
        released_on: "2020-01-01T00:00:00Z",
      } as unknown as FeedChapter,
    ];

    expect(feedHeadTimestamp(chapters)).toBe(Date.parse("2026-06-01T00:00:00Z"));
  });
});
