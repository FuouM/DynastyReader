import { describe, expect, it } from "vitest";
import {
  itemKindToPath,
  seriesTypeToPath,
  titleFromPermalink,
  getChapterContainerTag,
  tagKindToType,
  tagClass,
  groupSeriesTags,
  isSeriesKind,
  isContentKind,
  isDoujinTag,
} from "../../src/taxonomy";

describe("taxonomy - URL path segment resolution", () => {
  it("resolves chapters and oneshots to chapters", () => {
    expect(itemKindToPath("chapter")).toBe("chapters");
    expect(itemKindToPath("Chapter")).toBe("chapters");
    expect(itemKindToPath("oneshot")).toBe("chapters");
    expect(itemKindToPath("OneShot")).toBe("chapters");
  });

  it("resolves series-like entities to their plural paths", () => {
    expect(itemKindToPath("series")).toBe("series");
    expect(itemKindToPath("anthology")).toBe("anthologies");
    expect(itemKindToPath("anthologies")).toBe("anthologies");
    expect(itemKindToPath("doujin")).toBe("doujins");
    expect(itemKindToPath("doujinshi")).toBe("doujins");
    expect(itemKindToPath("issue")).toBe("issues");
    expect(itemKindToPath("author")).toBe("authors");
  });

  it("defaults unknown or missing kinds to series", () => {
    expect(itemKindToPath("unknown_kind")).toBe("series");
    expect(itemKindToPath("")).toBe("series");
    expect(seriesTypeToPath(null)).toBe("series");
    expect(seriesTypeToPath(undefined)).toBe("series");
  });
});

describe("taxonomy - titleFromPermalink", () => {
  it("capitalizes words separated by underscores", () => {
    expect(titleFromPermalink("bloom_into_you")).toBe("Bloom Into You");
    expect(titleFromPermalink("citrus")).toBe("Citrus");
  });

  it("preserves casing of already capitalized segments", () => {
    expect(titleFromPermalink("fate_stay_night")).toBe("Fate Stay Night");
  });
});

describe("taxonomy - getChapterContainerTag", () => {
  it("returns null for empty, undefined, or missing tags", () => {
    expect(getChapterContainerTag([])).toBeNull();
    expect(getChapterContainerTag(undefined)).toBeNull();
  });

  it("prioritizes Series over Anthology, Issue, and Doujin", () => {
    const tags = [
      { type: "doujin", name: "My Doujin", permalink: "my_doujin" },
      { type: "anthology", name: "My Anthology", permalink: "my_anthology" },
      { type: "series", name: "My Series", permalink: "my_series" },
    ];
    const container = getChapterContainerTag(tags);
    expect(container?.permalink).toBe("my_series");
    expect(container?.type).toBe("series");
  });

  it("prioritizes Anthology over Issue and Doujin", () => {
    const tags = [
      { type: "doujin", name: "My Doujin", permalink: "my_doujin" },
      { type: "issue", name: "My Issue", permalink: "my_issue" },
      { type: "anthology", name: "My Anthology", permalink: "my_anthology" },
    ];
    const container = getChapterContainerTag(tags);
    expect(container?.permalink).toBe("my_anthology");
  });

  it("ignores container tags that have empty or whitespace permalinks", () => {
    const tags = [
      { type: "series", name: "Series No Permalink", permalink: "   " },
      { type: "doujin", name: "Doujin With Permalink", permalink: "doujin_valid" },
    ];
    const container = getChapterContainerTag(tags);
    expect(container?.permalink).toBe("doujin_valid");
  });

  it("ignores non-container tags like Author, Scanlator, Pairing, Character", () => {
    const tags = [
      { type: "author", name: "Nakatani Nio", permalink: "nakatani_nio" },
      { type: "scanlator", name: "Yuri Project", permalink: "yuri_project" },
      { type: "pairing", name: "Yuu x Touko", permalink: "yuu_x_touko" },
    ];
    expect(getChapterContainerTag(tags)).toBeNull();
  });
});

describe("taxonomy - entity classification helpers", () => {
  it("classifies series kinds correctly", () => {
    expect(isSeriesKind("series")).toBe(true);
    expect(isSeriesKind("anthology")).toBe(true);
    expect(isSeriesKind("doujin")).toBe(true);
    expect(isSeriesKind("issue")).toBe(true);
    expect(isSeriesKind("chapter")).toBe(false);
    expect(isSeriesKind(null)).toBe(false);
  });

  it("classifies content vs metadata kinds", () => {
    expect(isContentKind("series")).toBe(true);
    expect(isContentKind("chapter")).toBe(true);
    expect(isContentKind("author")).toBe(false);
    expect(isContentKind("scanlator")).toBe(false);
    expect(isContentKind("tag")).toBe(false);
  });

  it("identifies doujin aliases", () => {
    expect(isDoujinTag("doujin")).toBe(true);
    expect(isDoujinTag("doujinshi")).toBe(true);
    expect(isDoujinTag("copyright")).toBe(true);
    expect(isDoujinTag("parody")).toBe(true);
    expect(isDoujinTag("series")).toBe(false);
  });
});

describe("taxonomy - tagKindToType and tagClass", () => {
  it("maps entity kinds to TagCategory labels", () => {
    expect(tagKindToType("author")).toBe("Author");
    expect(tagKindToType("scanlator")).toBe("Scanlator");
    expect(tagKindToType("pairing")).toBe("Pairing");
    expect(tagKindToType("character")).toBe("Character");
    expect(tagKindToType("doujin")).toBe("Doujin");
    expect(tagKindToType("series")).toBe("Series");
    expect(tagKindToType("tag")).toBe("General");
    expect(tagKindToType("unknown")).toBe("General");
  });

  it("maps tag types to themed CSS pill classes", () => {
    expect(tagClass("author")).toBe("tag-pill tag-artist");
    expect(tagClass("artist")).toBe("tag-pill tag-artist");
    expect(tagClass("character")).toBe("tag-pill tag-character");
    expect(tagClass("pairing")).toBe("tag-pill tag-pairing");
    expect(tagClass("doujin")).toBe("tag-pill tag-copyright");
    expect(tagClass("scanlator")).toBe("tag-pill tag-meta");
    expect(tagClass("status")).toBe("tag-pill tag-status");
    expect(tagClass("general")).toBe("tag-pill tag-rank-3");
  });
});

describe("taxonomy - groupSeriesTags", () => {
  it("partitions mixed tags into categorized buckets", () => {
    const tags = [
      { type: "Author", name: "Author 1", permalink: "a1" },
      { type: "Scanlator", name: "Group 1", permalink: "g1" },
      { type: "Pairing", name: "Pair 1", permalink: "p1" },
      { type: "Character", name: "Char 1", permalink: "c1" },
      { type: "Doujin", name: "Work 1", permalink: "d1" },
      { type: "Status", name: "Completed", permalink: "completed" },
      { type: "General", name: "Yuri", permalink: "yuri" },
    ];

    const grouped = groupSeriesTags(tags);
    expect(grouped.authorTags.length).toBe(1);
    expect(grouped.groupTags.length).toBe(1);
    expect(grouped.pairingTags.length).toBe(1);
    expect(grouped.characterTags.length).toBe(1);
    expect(grouped.doujinTags.length).toBe(1);
    expect(grouped.statusTags.length).toBe(1);
    expect(grouped.otherTags.length).toBe(1);
  });

  it("handles null or undefined input safely", () => {
    const grouped = groupSeriesTags(null, null);
    expect(grouped.authorTags).toEqual([]);
    expect(grouped.groupTags).toEqual([]);
    expect(grouped.otherTags).toEqual([]);
  });
});
