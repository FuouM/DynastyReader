import { describe, expect, it } from "vitest";
import { validateAndParseImport } from "../../src/db/import.repo";

describe("db/import.repo - validateAndParseImport", () => {
  const MDX_UUID = "f98660a1-d2e1-461c-9371-730c96b8a950";

  it("rejects empty text", () => {
    const res = validateAndParseImport("");
    expect(res.valid).toBe(false);
    expect(res.detectedFormat).toBe("none");
    expect(res.errors).toContain("Input is empty.");
  });

  it("handles malformed JSON syntax with descriptive error", () => {
    const res = validateAndParseImport("{ broken json: [");
    expect(res.valid).toBe(false);
    expect(res.detectedFormat).toBe("json");
    expect(res.errors[0]).toMatch(/Invalid JSON syntax/);
  });

  it("parses valid JSON with Dynasty followed series and collections", () => {
    const json = JSON.stringify({
      version: 1,
      followed: [
        { name: "Bloom Into You", permalink: "bloom_into_you" },
        { name: "Citrus", permalink: "citrus" },
      ],
      collections: [
        {
          name: "Favorites",
          items: [
            { title: "Chapter 1", permalink: "chap_1", kind: "chapter" },
          ],
        },
      ],
    });

    const res = validateAndParseImport(json);
    expect(res.valid).toBe(true);
    expect(res.detectedFormat).toBe("json");
    expect(res.stats.followedCount).toBe(2);
    expect(res.stats.collectionsCount).toBe(1);
    expect(res.stats.collectionItemsCount).toBe(1);
    expect(res.followed.map((f) => f.permalink)).toEqual(["bloom_into_you", "citrus"]);
  });

  it("parses and retains MangaDex and Local permalinks (Item 8 regression test)", () => {
    const json = JSON.stringify({
      version: 1,
      followed: [
        { name: "MangaDex Manga", permalink: `mdx:${MDX_UUID}` },
        { name: "Local Manga", permalink: "local:my_downloaded_folder" },
      ],
      collections: [
        {
          name: "Mixed Collection",
          items: [
            { title: "MDX Chapter", permalink: `mdx:${MDX_UUID}`, kind: "chapter" },
            { title: "Local Item", permalink: "local:my_archive", kind: "series" },
          ],
        },
      ],
    });

    const res = validateAndParseImport(json);
    expect(res.valid).toBe(true);
    expect(res.stats.followedCount).toBe(2);
    expect(res.stats.collectionItemsCount).toBe(2);
    expect(res.followed.find((f) => f.permalink === `mdx:${MDX_UUID}`)).toBeDefined();
    expect(res.followed.find((f) => f.permalink === "local:my_downloaded_folder")).toBeDefined();
  });

  it("parses plain URL lists and extracts entities", () => {
    const text = [
      "https://dynasty-scans.com/series/bloom_into_you",
      "https://dynasty-scans.com/chapters/chapter_1",
      "https://google.com/unrelated", // Should be ignored
    ].join("\n");

    const res = validateAndParseImport(text, { defaultTarget: "followed" });
    expect(res.valid).toBe(true);
    expect(res.detectedFormat).toBe("urls");
    expect(res.stats.followedCount).toBe(2);
    expect(res.followed[0].permalink).toBe("bloom_into_you");
    expect(res.followed[1].permalink).toBe("chapter_1");
    expect(res.stats.ignoredCount).toBe(1); // google.com
  });

  it("deduplicates duplicate followed series in import payload", () => {
    const json = JSON.stringify({
      version: 1,
      followed: [
        { name: "Bloom Into You", permalink: "bloom_into_you" },
        { name: "Bloom Into You Dup", permalink: "bloom_into_you" },
      ],
    });

    const res = validateAndParseImport(json);
    expect(res.valid).toBe(true);
    expect(res.stats.followedCount).toBe(1);
    expect(res.followed.length).toBe(1);
  });
});

describe("db/export.repo - filter logic (Item 9 regression test)", () => {
  it("distinguishes empty collection filter from undefined filter", () => {
    // When ids is undefined, export ALL collections
    const allFilter = (ids?: number[]) => ids !== undefined;
    expect(allFilter(undefined)).toBe(false); // No filter -> export all

    // When ids is an empty array [], export ZERO collections (Item 9 fix)
    expect(allFilter([])).toBe(true); // Has filter -> apply ids.includes(...)
  });
});
