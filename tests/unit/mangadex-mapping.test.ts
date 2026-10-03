import { describe, expect, it } from "vitest";
import {
  formatMangaTitle,
  formatMangaDexChapterTitle,
  getMangaCoverUrl,
  getMangaAuthors,
  mangaDexToStandardSeries,
  mangaDexToStandardChapter,
} from "../../src/providers/mangadex/mapping";
import type { MangaDexChapter, MangaDexManga } from "../../src/providers/mangadex/types";

describe("mangadex/mapping - formatMangaTitle", () => {
  it("prioritizes requested language", () => {
    const manga = {
      attributes: {
        title: { en: "English Title", ja: "日本語タイトル", "ja-ro": "Romaji Title" },
      },
    } as unknown as MangaDexManga;
    expect(formatMangaTitle(manga, "en")).toBe("English Title");
    expect(formatMangaTitle(manga, "ja")).toBe("日本語タイトル");
  });

  it("falls back to ja-ro, en, ja, then first available", () => {
    const mangaNoEn = {
      attributes: {
        title: { "ja-ro": "Romaji Title", fr: "Titre Français" },
      },
    } as unknown as MangaDexManga;
    expect(formatMangaTitle(mangaNoEn, "es")).toBe("Romaji Title");

    const mangaOther = {
      attributes: {
        title: { fr: "Titre Français" },
      },
    } as unknown as MangaDexManga;
    expect(formatMangaTitle(mangaOther, "en")).toBe("Titre Français");
  });

  it("returns Untitled when title object is empty or missing", () => {
    const mangaEmpty = { attributes: { title: {} } } as unknown as MangaDexManga;
    expect(formatMangaTitle(mangaEmpty)).toBe("Untitled");
  });
});

describe("mangadex/mapping - getMangaCoverUrl", () => {
  const mangaWithCover = {
    id: "manga-uuid-1234",
    relationships: [
      {
        type: "cover_art",
        id: "cover-uuid",
        attributes: { fileName: "cover.jpg" },
      },
    ],
  } as unknown as MangaDexManga;

  it("builds 256, 512, and original cover CDN URLs", () => {
    expect(getMangaCoverUrl(mangaWithCover, "256")).toBe(
      "https://uploads.mangadex.org/covers/manga-uuid-1234/cover.jpg.256.jpg",
    );
    expect(getMangaCoverUrl(mangaWithCover, "512")).toBe(
      "https://uploads.mangadex.org/covers/manga-uuid-1234/cover.jpg.512.jpg",
    );
    expect(getMangaCoverUrl(mangaWithCover, "original")).toBe(
      "https://uploads.mangadex.org/covers/manga-uuid-1234/cover.jpg",
    );
  });

  it("returns null when no cover relationship exists", () => {
    const mangaNoCover = { id: "manga-uuid", relationships: [] } as unknown as MangaDexManga;
    expect(getMangaCoverUrl(mangaNoCover)).toBeNull();
  });
});

describe("mangadex/mapping - getMangaAuthors", () => {
  it("extracts and deduplicates author and artist names", () => {
    const manga = {
      relationships: [
        { type: "author", attributes: { name: "Author One" } },
        { type: "artist", attributes: { name: "Author One" } }, // Duplicate
        { type: "artist", attributes: { name: "Artist Two" } },
        { type: "scanlation_group", attributes: { name: "Scan Group" } }, // Non-author
      ],
    } as unknown as MangaDexManga;

    const authors = getMangaAuthors(manga);
    expect(authors).toEqual(["Author One", "Artist Two"]);
  });

  it("returns empty array when relationships are absent or empty", () => {
    expect(getMangaAuthors({} as MangaDexManga)).toEqual([]);
  });
});

describe("mangadex/mapping - mangaDexToStandardSeries", () => {
  it("converts MangaDex manga entity to DynastyReader Series shape", () => {
    const manga = {
      id: "manga-1",
      attributes: {
        title: { en: "Yuri Manga" },
        description: { en: "A nice story." },
        tags: [
          {
            id: "tag-1",
            attributes: {
              group: "genre",
              name: { en: "Girls' Love" },
            },
          },
        ],
        altTitles: [{ ja: "Alternate Title" }],
      },
      relationships: [
        { type: "cover_art", attributes: { fileName: "c.png" } },
      ],
    } as unknown as MangaDexManga;

    const series = mangaDexToStandardSeries(manga, "en");
    expect(series.name).toBe("Yuri Manga");
    expect(series.permalink).toBe("mdx:manga-1");
    expect(series.description).toBe("A nice story.");
    expect(series.tags.length).toBe(1);
    expect(series.tags[0]).toEqual({
      type: "genre",
      name: "Girls' Love",
      permalink: "mdx-tag:tag-1",
    });
    expect(series.aliases).toEqual(["Alternate Title"]);
  });
});

describe("mangadex/mapping - mangaDexToStandardChapter", () => {
  it("formats chapter with number and title", () => {
    const ch = {
      id: "ch-1",
      attributes: {
        chapter: "5",
        title: "The Encounter",
        readableAt: "2026-04-10T15:30:00Z",
      },
    } as unknown as MangaDexChapter;

    const mapped = mangaDexToStandardChapter(ch);
    expect(mapped.title).toBe("Ch. 5 - The Encounter");
    expect(mapped.permalink).toBe("mdx:ch-1");
    expect(mapped.released_on).toBe("2026-04-10");
  });

  it("formats chapter with number but no title", () => {
    const ch = {
      id: "ch-2",
      attributes: {
        chapter: "12",
        title: "",
      },
    } as unknown as MangaDexChapter;

    const mapped = mangaDexToStandardChapter(ch);
    expect(mapped.title).toBe("Chapter 12");
  });

  it("formats chapter 0 properly without treating as falsy", () => {
    const ch = {
      id: "ch-0",
      attributes: {
        chapter: "0",
        title: "Prologue",
      },
    } as unknown as MangaDexChapter;

    const mapped = mangaDexToStandardChapter(ch);
    expect(mapped.title).toBe("Ch. 0 - Prologue");
  });

  it("formats oneshot when chapter number is absent", () => {
    const ch = {
      id: "ch-oneshot",
      attributes: {
        chapter: null,
        title: null,
      },
    } as unknown as MangaDexChapter;

    const mapped = mangaDexToStandardChapter(ch);
    expect(mapped.title).toBe("Oneshot");
  });

  it("extracts scanlation group and attaches series context tags", () => {
    const ch = {
      id: "ch-grp",
      attributes: { chapter: "1" },
      relationships: [
        {
          type: "scanlation_group",
          id: "group-uuid-99",
          attributes: { name: "Yuri Translations" },
        },
      ],
    } as unknown as MangaDexChapter;

    const mapped = mangaDexToStandardChapter(ch, [], {
      mangaId: "manga-uuid-88",
      mangaTitle: "My Yuri Series",
    });

    expect(mapped.tags).toContainEqual({
      type: "Series",
      name: "My Yuri Series",
      permalink: "mdx:manga-uuid-88",
    });
    expect(mapped.tags).toContainEqual({
      type: "Scanlator",
      name: "Yuri Translations",
      permalink: "mdx-group:group-uuid-99",
    });
  });
});

describe("mangadex/mapping - formatMangaDexChapterTitle", () => {
  it("formats with chapter number and subtitle", () => {
    expect(formatMangaDexChapterTitle("1", "Beginning")).toBe("Ch. 1 - Beginning");
  });

  it("formats chapter number only", () => {
    expect(formatMangaDexChapterTitle("1", "")).toBe("Chapter 1");
    expect(formatMangaDexChapterTitle("42", null)).toBe("Chapter 42");
  });

  it("formats chapter 0 correctly", () => {
    expect(formatMangaDexChapterTitle("0", "Prequel")).toBe("Ch. 0 - Prequel");
    expect(formatMangaDexChapterTitle("0", "")).toBe("Chapter 0");
  });

  it("falls back to rawTitle or Oneshot when chapter number is absent", () => {
    expect(formatMangaDexChapterTitle(null, "Special Story")).toBe("Special Story");
    expect(formatMangaDexChapterTitle(null, null)).toBe("Oneshot");
    expect(formatMangaDexChapterTitle("", "")).toBe("Oneshot");
  });
});
