import { describe, expect, it } from "vitest";
import {
  parseDynastyEntityUrl,
  parseDynastyUrl,
  parseMangaDexUrl,
  pageOutputPath,
  extractMangaDexId,
} from "../../src/api/navigation";
import {
  getProviderForPermalink,
  canonicalUrl,
  extractEntityId,
  isValidPermalink,
} from "../../src/providers/registry";

describe("api/navigation - Dynasty URL parser", () => {
  it("parses valid Dynasty series URLs", () => {
    const res = parseDynastyEntityUrl("https://dynasty-scans.com/series/bloom_into_you");
    expect(res).toEqual({ kind: "series", permalink: "bloom_into_you" });
  });

  it("parses Dynasty URLs with trailing .json", () => {
    const res = parseDynastyEntityUrl("https://dynasty-scans.com/chapters/chapter_1.json");
    expect(res).toEqual({ kind: "chapter", permalink: "chapter_1" });
  });

  it("parses Dynasty URLs without protocol (auto-adds https)", () => {
    const res = parseDynastyEntityUrl("dynasty-scans.com/anthologies/sweet_loves");
    expect(res).toEqual({ kind: "anthology", permalink: "sweet_loves" });
  });

  it("normalizes to series kind in parseDynastyUrl", () => {
    const res = parseDynastyUrl("https://dynasty-scans.com/doujins/my_doujin");
    expect(res).toEqual({ kind: "series", permalink: "my_doujin" });

    const chap = parseDynastyUrl("https://dynasty-scans.com/chapters/chap_one");
    expect(chap).toEqual({ kind: "chapter", permalink: "chap_one" });
  });

  it("rejects non-dynasty hosts", () => {
    expect(parseDynastyEntityUrl("https://google.com/series/test")).toBeNull();
    expect(parseDynastyEntityUrl("https://fake-dynasty-scans.com/series/test")).toBeNull();
  });

  it("rejects URLs with missing parts or invalid permalinks", () => {
    expect(parseDynastyEntityUrl("https://dynasty-scans.com/series/")).toBeNull();
    expect(parseDynastyEntityUrl("https://dynasty-scans.com/unknown_segment/test")).toBeNull();
    expect(parseDynastyEntityUrl("https://dynasty-scans.com/series/invalid@name!")).toBeNull();
  });
});

describe("api/navigation - MangaDex URL parser", () => {
  const SAMPLE_UUID = "f98660a1-d2e1-461c-9371-730c96b8a950";
  const CHAPTER_UUID = "88888888-4444-4444-4444-121212121212";

  it("parses full MangaDex title URLs", () => {
    const res = parseMangaDexUrl(`https://mangadex.org/title/${SAMPLE_UUID}/some-title-slug`);
    expect(res).toEqual({ kind: "series", id: SAMPLE_UUID, isBareUuid: false });
  });

  it("parses full MangaDex chapter URLs", () => {
    const res = parseMangaDexUrl(`https://mangadex.org/chapter/${CHAPTER_UUID}`);
    expect(res).toEqual({ kind: "chapter", id: CHAPTER_UUID, isBareUuid: false });
  });

  it("parses shorthand prefixes (chapter/, ch:, title/, manga:)", () => {
    expect(parseMangaDexUrl(`ch:${CHAPTER_UUID}`)).toEqual({
      kind: "chapter",
      id: CHAPTER_UUID,
      isBareUuid: false,
    });
    expect(parseMangaDexUrl(`chapter/${CHAPTER_UUID}`)).toEqual({
      kind: "chapter",
      id: CHAPTER_UUID,
      isBareUuid: false,
    });
    expect(parseMangaDexUrl(`title/${SAMPLE_UUID}`)).toEqual({
      kind: "series",
      id: SAMPLE_UUID,
      isBareUuid: false,
    });
    expect(parseMangaDexUrl(`mdx:chapter:${CHAPTER_UUID}`)).toEqual({
      kind: "chapter",
      id: CHAPTER_UUID,
      isBareUuid: false,
    });
  });

  it("parses bare UUIDs as series", () => {
    const res = parseMangaDexUrl(SAMPLE_UUID);
    expect(res).toEqual({ kind: "series", id: SAMPLE_UUID, isBareUuid: true });

    const mdxPrefixed = parseMangaDexUrl(`mdx:${SAMPLE_UUID}`);
    expect(mdxPrefixed).toEqual({ kind: "series", id: SAMPLE_UUID, isBareUuid: true });
  });

  it("rejects invalid inputs", () => {
    expect(parseMangaDexUrl("")).toBeNull();
    expect(parseMangaDexUrl("not-a-uuid")).toBeNull();
    expect(parseMangaDexUrl("https://othersite.com/title/1234")).toBeNull();
  });
});

describe("providers/registry - polymorphic resolution", () => {
  const MDX_ID = "f98660a1-d2e1-461c-9371-730c96b8a950";

  it("selects provider adapter by prefix deterministically", () => {
    expect(getProviderForPermalink(`mdx:${MDX_ID}`).id).toBe("mangadex");
    expect(getProviderForPermalink("local:imported_folder").id).toBe("local");
    expect(getProviderForPermalink("bloom_into_you").id).toBe("dynasty");
    expect(getProviderForPermalink("").id).toBe("dynasty");
  });

  it("extracts entity ID cleanly across providers", () => {
    expect(extractEntityId(`mdx:${MDX_ID}`)).toBe(MDX_ID);
    expect(extractMangaDexId(`mdx:${MDX_ID}`)).toBe(MDX_ID);
    expect(extractEntityId("local:my_manga_vol_1")).toBe("my_manga_vol_1");
    expect(extractEntityId("regular_dynasty_slug")).toBe("regular_dynasty_slug");
    expect(extractEntityId("")).toBe("");
  });

  it("resolves canonical external URLs", () => {
    expect(canonicalUrl("series", "bloom_into_you")).toBe(
      "https://dynasty-scans.com/series/bloom_into_you",
    );
    expect(canonicalUrl("series", `mdx:${MDX_ID}`)).toBe(
      `https://mangadex.org/title/${MDX_ID}`,
    );
    expect(canonicalUrl("chapters", `mdx:${MDX_ID}`)).toBe(
      `https://mangadex.org/chapter/${MDX_ID}`,
    );
    expect(canonicalUrl("series", "local:imported")).toBe("");
  });

  it("validates safe permalinks across providers", () => {
    // Dynasty
    expect(isValidPermalink("citrus_anthology")).toBe(true);
    expect(isValidPermalink("chapter-12_part-2")).toBe(true);
    expect(isValidPermalink("invalid slug with spaces")).toBe(false);
    expect(isValidPermalink("")).toBe(false);

    // MangaDex
    expect(isValidPermalink(`mdx:${MDX_ID}`)).toBe(true);
    expect(isValidPermalink("mdx:not-a-uuid")).toBe(false);

    // Local
    expect(isValidPermalink("local:my_archive")).toBe(true);
    expect(isValidPermalink("local:")).toBe(false);
    expect(isValidPermalink("local:bad*char")).toBe(false);
  });
});

describe("api/navigation - pageOutputPath", () => {
  it("formats Dynasty page output paths", () => {
    const path = pageOutputPath("series_a", "chapter_1", 0, "https://example.com/p1.png");
    expect(path).toBe("pages/series_a/chapter_1/page_0001.png");
  });

  it("formats MangaDex page output paths", () => {
    const path = pageOutputPath(
      "mdx:manga_uuid",
      "mdx:chapter_uuid",
      4,
      "https://uploads.mangadex.org/data/hash/x.jpg",
    );
    expect(path).toBe("mangadex/pages/manga_uuid/chapter_uuid/page_0005.jpg");
  });

  it("handles missing series permalink by substituting _singles", () => {
    const path = pageOutputPath("", "chapter_one", 2, "https://example.com/img.webp");
    expect(path).toBe("pages/_singles/chapter_one/page_0003.webp");
  });
});
