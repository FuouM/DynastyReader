import { describe, expect, it } from "vitest";
import { isSeriesBlacklisted, isItemBlacklisted } from "../../src/db/blacklist.repo";

describe("db/blacklist.repo - synchronous blacklist checking", () => {
  it("returns false for undefined or empty arguments", () => {
    expect(isSeriesBlacklisted(undefined, undefined)).toBe(false);
    expect(isSeriesBlacklisted("", "")).toBe(false);

    const itemRes = isItemBlacklisted(undefined, undefined);
    expect(itemRes.blacklisted).toBe(false);
    expect(itemRes.matchedTags).toEqual([]);
  });

  it("checks items with empty tag lists safely", () => {
    const itemRes = isItemBlacklisted([], { permalink: "some_clean_manga", name: "Clean Manga" });
    expect(itemRes.blacklisted).toBe(false);
    expect(itemRes.matchedTags).toEqual([]);
  });

  it("handles malformed tag entries without crashing", () => {
    const tags = [
      { name: "", permalink: "" },
      { name: "NonBlacklistedTag" },
    ];
    const res = isItemBlacklisted(tags);
    expect(res.blacklisted).toBe(false);
  });
});
