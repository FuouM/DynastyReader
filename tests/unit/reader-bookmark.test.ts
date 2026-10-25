import { describe, expect, it, vi, beforeEach } from "vitest";
import { createRoot } from "solid-js";
import { ReaderSession } from "../../src/reader/reader-session";
import * as libraryRepo from "../../src/db/library.repo";

vi.mock("../../src/db/library.repo", () => ({
  addBookmark: vi.fn().mockResolvedValue(undefined),
  removeBookmark: vi.fn().mockResolvedValue(undefined),
  getBookmark: vi.fn().mockResolvedValue(null),
  addHistory: vi.fn().mockResolvedValue(undefined),
  getReadingProgress: vi.fn().mockResolvedValue(null),
}));

describe("reader/reader-session - bookmark controls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("bookmarks a non-series chapter with empty seriesPermalink and updates reactive bookmarked signal", async () => {
    await createRoot(async (dispose) => {
      const session = new ReaderSession({
        view: "reader",
        chapterPermalink: "standalone-chapter",
        chapterTitle: "My Standalone One-Shot",
      });

      expect(session.bookmarked()).toBe(false);
      expect(session.seriesPermalink()).toBeNull();

      // Bookmark the non-series chapter
      await session.toggleBookmark();

      expect(libraryRepo.addBookmark).toHaveBeenCalledTimes(1);
      expect(libraryRepo.addBookmark).toHaveBeenCalledWith({
        chapterPermalink: "standalone-chapter",
        seriesPermalink: "",
        seriesName: "",
        chapterTitle: "My Standalone One-Shot",
        pageIndex: 0,
      });
      expect(session.bookmarked()).toBe(true);

      // Toggle again to remove bookmark
      await session.toggleBookmark();

      expect(libraryRepo.removeBookmark).toHaveBeenCalledTimes(1);
      expect(libraryRepo.removeBookmark).toHaveBeenCalledWith("standalone-chapter");
      expect(session.bookmarked()).toBe(false);

      dispose();
    });
  });

  it("bookmarks a series chapter preserving series context", async () => {
    await createRoot(async (dispose) => {
      const session = new ReaderSession({
        view: "reader",
        chapterPermalink: "series-ch-1",
        chapterTitle: "Chapter 1",
        seriesPermalink: "great-manga",
        seriesName: "Great Manga",
      });

      session.setSeriesPermalink("great-manga");
      session.setSeriesName("Great Manga");
      session.setChapterTitle("Chapter 1");

      await session.toggleBookmark();

      expect(libraryRepo.addBookmark).toHaveBeenCalledWith({
        chapterPermalink: "series-ch-1",
        seriesPermalink: "great-manga",
        seriesName: "Great Manga",
        chapterTitle: "Chapter 1",
        pageIndex: 0,
      });
      expect(session.bookmarked()).toBe(true);

      dispose();
    });
  });
});
