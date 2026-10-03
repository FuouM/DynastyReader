import type {
  ContentProviderAdapter,
  FollowSeriesInput,
  BookmarkInput,
  HistoryInput,
  ReadingProgressInput,
  MarkChapterReadInput,
  FollowedLookup,
  ProviderCacheStats,
  ProviderMetaInfo,
} from "./types";
import * as ipc from "../ipc";
import { MANGADEX_DB_NAME } from "./mangadex/db/client";
import { MANGADEX_UUID_REGEX } from "./mangadex/api/constants";
import {
  getFollowedManga,
  getAllFollowedManga,
  isMangaFollowed,
  followManga,
  unfollowManga,
} from "./mangadex/db/library.repo";
import {
  getMdxBookmarks,
  getMdxBookmark,
  addMdxBookmark,
  removeMdxBookmark,
} from "./mangadex/db/bookmarks.repo";
import {
  getHistory,
  deleteHistoryItem,
  clearHistory as clearMdxHistory,
  recordHistory as recordMdxHistory,
} from "./mangadex/db/history.repo";
import {
  getReadingProgress as getMdxProgress,
  getMangaReadingProgress,
  saveReadingProgress as saveMdxProgress,
  deleteReadingProgress,
} from "./mangadex/db/progress.repo";
import {
  getMangaDexCacheStats,
  getMangaDexDownloadedChapterRows,
  clearMangaDexCachedChapters,
  purgeMangaDexCache,
} from "./mangadex/db/cache.repo";
import { getManga, getAllMangaFeed } from "./mangadex/api/manga";
import { formatMangaTitle, getMangaCoverUrl, getMangaAuthors } from "./mangadex/mapping";
import { loadMangaDexChapterForReader } from "./mangadex/reader";
import {
  notifyFollowedChanged,
  notifyBookmarksChanged,
  notifyHistoryChanged,
  notifyProgressChanged,
} from "../db/library-notifiers";
import { decodeEntities } from "../utils/formatting";
import { inClause } from "../db/paging";
import type { FullyCachedChapterRow } from "../db/cache.repo";
import type {
  FollowedSeriesPageResult,
  ReadingProgressRow,
  SeriesProgressRow,
  HistoryPageResult,
  BookmarkRow,
  BookmarkPageResult,
} from "../types/db";
import type { Series, Chapter, SeriesTag, SeriesTaggings } from "../types/api";

export class MangaDexProvider implements ContentProviderAdapter {
  readonly id = "mangadex" as const;

  readonly meta: ProviderMetaInfo = {
    id: "mangadex",
    name: "MangaDex",
    shortName: "MangaDex",
    description: "Open community aggregator across all genres with multiple scanlation groups.",
    badge: "All Genres",
    isBrowsable: true,
  };

  matchesPermalink(permalink: string): boolean {
    return typeof permalink === "string" && permalink.startsWith("mdx:");
  }

  extractEntityId(permalink: string): string {
    if (!permalink) return "";
    return permalink.startsWith("mdx:") ? permalink.slice(4) : permalink;
  }

  canonicalUrl(path: string, permalink: string): string {
    if (!permalink) return "";
    const id = this.extractEntityId(permalink);
    const isChapter = path === "chapters" || path === "chapter";
    return `https://mangadex.org/${isChapter ? "chapter" : "title"}/${id}`;
  }

  isValidPermalink(candidate: unknown): candidate is string {
    if (typeof candidate !== "string" || !candidate.startsWith("mdx:")) return false;
    const bare = candidate.slice(4);
    return MANGADEX_UUID_REGEX.test(bare);
  }

  // Followed
  async getFollowedPage(page = 1, pageSize = 10): Promise<FollowedSeriesPageResult> {
    const res = await getFollowedManga(page, pageSize);
    return {
      rows: res.rows.map((m) => ({
        permalink: `mdx:${m.manga_id}`,
        name: m.title,
        cover: m.cover_filename,
        last_checked_at: m.last_checked_at,
        latest_chapter_permalink: m.latest_chapter_id ? `mdx:${m.latest_chapter_id}` : null,
        latest_chapter_title: m.latest_chapter_title,
        created_at: m.created_at,
      })),
      totalCount: res.totalCount,
      totalPages: res.totalPages,
      currentPage: res.currentPage,
    };
  }

  async getFollowedLookup(): Promise<FollowedLookup> {
    const mangaList = await getAllFollowedManga().catch(() => []);
    const permalinks = new Set<string>();
    const names = new Set<string>();
    for (const m of mangaList) {
      if (m.manga_id) {
        permalinks.add(m.manga_id);
        permalinks.add(`mdx:${m.manga_id}`);
      }
      if (m.title) {
        names.add(decodeEntities(m.title).trim().toLowerCase());
      }
    }
    return { permalinks, names };
  }

  async isFollowed(permalink: string): Promise<boolean> {
    const mangaId = this.extractEntityId(permalink);
    return isMangaFollowed(mangaId);
  }

  async follow(input: FollowSeriesInput): Promise<void> {
    const mangaId = this.extractEntityId(input.permalink);
    await followManga(mangaId, input.name, input.cover ?? null);
    notifyFollowedChanged();
  }

  async unfollow(permalink: string): Promise<void> {
    const mangaId = this.extractEntityId(permalink);
    await unfollowManga(mangaId);
    notifyFollowedChanged();
  }

  async updateFollowedCover(permalink: string, cover: string | null, notify = false): Promise<void> {
    const mangaId = this.extractEntityId(permalink);
    await ipc.dbExecute(
      MANGADEX_DB_NAME,
      `UPDATE followed_manga SET cover_filename = ? WHERE manga_id = ?`,
      [cover, mangaId],
    );
    if (notify) notifyFollowedChanged();
  }

  // Bookmarks
  async getBookmark(chapterPermalink: string): Promise<BookmarkRow | null> {
    const id = this.extractEntityId(chapterPermalink);
    const row = await getMdxBookmark(id);
    if (!row) return null;
    return {
      chapter_permalink: `mdx:${row.chapter_id}`,
      series_permalink: row.manga_id ? `mdx:${row.manga_id}` : "",
      series_name: row.manga_title,
      chapter_title: row.chapter_title,
      page_index: row.page_index,
      created_at: row.created_at,
    };
  }

  async getBookmarksPage(page = 1, pageSize = 15): Promise<BookmarkPageResult> {
    const res = await getMdxBookmarks(page, pageSize);
    return {
      rows: res.rows.map((b) => ({
        chapter_permalink: `mdx:${b.chapter_id}`,
        chapter_title: b.chapter_title,
        series_permalink: b.manga_id ? `mdx:${b.manga_id}` : "",
        series_name: b.manga_title,
        page_index: b.page_index,
        scanlator_name: b.scanlator_name,
        created_at: b.created_at,
      })),
      totalCount: res.totalCount,
      totalPages: res.totalPages,
      currentPage: res.currentPage,
    };
  }

  async addBookmark(input: BookmarkInput): Promise<void> {
    const chapterId = this.extractEntityId(input.chapterPermalink);
    const mangaId = this.extractEntityId(input.seriesPermalink);
    await addMdxBookmark({
      chapterId,
      mangaId,
      mangaTitle: input.seriesName,
      chapterTitle: input.chapterTitle,
      pageIndex: input.pageIndex,
    });
    notifyBookmarksChanged();
  }

  async removeBookmark(chapterPermalink: string): Promise<void> {
    const chapterId = this.extractEntityId(chapterPermalink);
    await removeMdxBookmark(chapterId);
    notifyBookmarksChanged();
  }

  async removeBookmarksBatch(chapterPermalinks: string[]): Promise<void> {
    if (chapterPermalinks.length === 0) return;
    const mdxIds = chapterPermalinks.map((cp) => this.extractEntityId(cp));
    await ipc.dbExecuteBatch(
      MANGADEX_DB_NAME,
      [`DELETE FROM bookmarks WHERE chapter_id IN (${inClause(mdxIds.length)})`],
      [mdxIds],
    );
    notifyBookmarksChanged();
  }

  // History & Progress
  async getHistoryPage(page = 1, pageSize = 15): Promise<HistoryPageResult> {
    const res = await getHistory(page, pageSize);
    return {
      rows: res.rows.map((h) => ({
        id: h.id,
        chapter_permalink: `mdx:${h.chapter_id}`,
        chapter_title: h.chapter_title,
        series_permalink: h.manga_id ? `mdx:${h.manga_id}` : "",
        series_name: h.manga_title,
        read_at: h.read_at,
        page_index: 0,
        page_total: 0,
        completed: 1,
      })),
      totalCount: res.totalCount,
      totalPages: res.totalPages,
      currentPage: res.currentPage,
    };
  }

  async removeHistory(id: number): Promise<void> {
    await deleteHistoryItem(id);
    notifyHistoryChanged();
  }

  async removeHistoryBatch(ids: number[]): Promise<void> {
    if (ids.length === 0) return;
    await ipc.dbExecuteBatch(
      MANGADEX_DB_NAME,
      [`DELETE FROM reading_history WHERE id IN (${inClause(ids.length)})`],
      [ids],
    );
    notifyHistoryChanged();
  }

  async clearHistory(): Promise<void> {
    await clearMdxHistory();
    notifyHistoryChanged();
  }

  async getProgress(chapterPermalink: string): Promise<ReadingProgressRow | null> {
    const chapterId = this.extractEntityId(chapterPermalink);
    const prog = await getMdxProgress(chapterId);
    if (!prog) return null;
    return {
      chapter_permalink: `mdx:${prog.chapter_id}`,
      series_permalink: prog.manga_id ? `mdx:${prog.manga_id}` : "",
      series_name: prog.manga_title ?? "",
      chapter_title: prog.chapter_title ?? "",
      page_index: prog.page_index,
      page_total: prog.page_total,
      completed: prog.completed ? 1 : 0,
      updated_at: prog.updated_at,
    };
  }

  async getProgressForSeries(seriesPermalink: string): Promise<SeriesProgressRow[]> {
    const mangaId = this.extractEntityId(seriesPermalink);
    const dict = await getMangaReadingProgress(mangaId);
    return Object.values(dict).map((r) => ({
      chapter_permalink: `mdx:${r.chapter_id}`,
      page_index: r.page_index,
      page_total: r.page_total,
      completed: r.completed,
    }));
  }

  async saveProgress(input: ReadingProgressInput): Promise<void> {
    const chapterId = this.extractEntityId(input.chapterPermalink);
    const mangaId = this.extractEntityId(input.seriesPermalink);
    await saveMdxProgress(
      chapterId,
      mangaId,
      input.seriesName,
      input.chapterTitle,
      input.pageIndex,
      input.pageTotal,
      input.completed,
    );
    notifyProgressChanged();
    notifyHistoryChanged();
  }

  async recordHistory(input: HistoryInput): Promise<void> {
    const chapterId = this.extractEntityId(input.chapterPermalink);
    const mangaId = this.extractEntityId(input.seriesPermalink);
    await recordMdxHistory(chapterId, mangaId, input.seriesName, input.chapterTitle);
    notifyHistoryChanged();
  }

  async markChapterRead(input: MarkChapterReadInput): Promise<void> {
    const chapterId = this.extractEntityId(input.chapterPermalink);
    const mangaId = this.extractEntityId(input.seriesPermalink);
    await Promise.all([
      saveMdxProgress(chapterId, mangaId, input.seriesName, input.chapterTitle, 0, input.pageTotal ?? 1, true),
      recordMdxHistory(chapterId, mangaId, input.seriesName, input.chapterTitle),
    ]);
    notifyProgressChanged();
    notifyHistoryChanged();
  }

  async markChapterUnread(chapterPermalink: string): Promise<void> {
    const chapterId = this.extractEntityId(chapterPermalink);
    await Promise.all([
      deleteReadingProgress(chapterId),
      ipc.dbExecute(MANGADEX_DB_NAME, `DELETE FROM reading_history WHERE chapter_id = ?`, [chapterId]),
    ]);
    notifyProgressChanged();
    notifyHistoryChanged();
  }

  // Cache
  async getDownloadedChapterRows(): Promise<FullyCachedChapterRow[]> {
    return getMangaDexDownloadedChapterRows();
  }

  async clearCachedChapters(chapterPermalinks: string[]): Promise<void> {
    const ids = chapterPermalinks.map((cp) => this.extractEntityId(cp));
    return clearMangaDexCachedChapters(ids);
  }

  async getCacheStats(): Promise<ProviderCacheStats> {
    const stats = await getMangaDexCacheStats();
    return {
      pages: stats.pageCount,
      chapters: stats.chapterCount,
      total_bytes: stats.totalBytes,
    };
  }

  async purgeCache(): Promise<void> {
    return purgeMangaDexCache();
  }

  // Fetching
  async fetchSeries(permalink: string, _force = false): Promise<Series> {
    const mangaId = this.extractEntityId(permalink);
    const [manga, feed] = await Promise.all([
      getManga(mangaId),
      getAllMangaFeed(mangaId, { limit: 500, order: { chapter: "asc" } }),
    ]);

    const title = formatMangaTitle(manga);
    const coverUrl = getMangaCoverUrl(manga, "512");
    const authors = getMangaAuthors(manga);

    // Collect scanlator groups across chapters
    const scanlatorSet = new Set<string>();
    for (const ch of feed.data) {
      const groupRel = ch.relationships?.find((r) => r.type === "scanlation_group");
      const attrs = groupRel?.attributes;
      const groupName =
        attrs && typeof attrs === "object" && "name" in attrs && typeof attrs.name === "string"
          ? attrs.name
          : undefined;
      if (groupName) scanlatorSet.add(groupName);
    }

    const tags: SeriesTag[] = [
      ...authors.map((a) => ({ type: "Author", name: a, permalink: `mdx-author:${a}` })),
      ...Array.from(scanlatorSet).map((s) => ({ type: "Scanlator", name: s, permalink: `mdx-group:${s}` })),
      { type: "Format", name: manga.attributes.status, permalink: `mdx-status:${manga.attributes.status}` },
      { type: "Format", name: manga.attributes.contentRating, permalink: `mdx-rating:${manga.attributes.contentRating}` },
      ...(manga.attributes.tags || []).map((t) => ({
        type: "General",
        name: t.attributes.name.en || Object.values(t.attributes.name)[0] || "Tag",
        permalink: `mdx-tag:${t.id}`,
      })),
    ];

    const taggings: SeriesTaggings[] = [];
    let currentVol: string | null = null;
    for (const ch of feed.data) {
      const vol = ch.attributes.volume;
      if (vol && vol !== currentVol) {
        currentVol = vol;
        taggings.push({ header: `Volume ${vol}` });
      }
      const num = ch.attributes.chapter;
      const raw = ch.attributes.title;
      const chTitle = num ? (raw ? `Chapter ${num}: ${raw}` : `Chapter ${num}`) : (raw || "Oneshot");
      const groupRel = ch.relationships?.find((r) => r.type === "scanlation_group");
      const groupAttrs = groupRel?.attributes;
      let groupName: string | undefined;
      if (
        groupAttrs &&
        typeof groupAttrs === "object" &&
        "name" in groupAttrs &&
        typeof groupAttrs.name === "string" &&
        groupAttrs.name
      ) {
        groupName = groupAttrs.name;
      }
      const chTags: SeriesTag[] = [];
      if (groupName && groupRel) {
        chTags.push({
          type: "Scanlator",
          name: groupName,
          permalink: `mdx-group:${groupRel.id}`,
        });
      }
      taggings.push({
        title: chTitle,
        permalink: `mdx:${ch.id}`,
        released_on: ch.attributes.readableAt ? ch.attributes.readableAt.substring(0, 10) : null,
        tags: chTags,
      });
    }

    const descMap = manga.attributes.description;
    const description = descMap?.en || Object.values(descMap || {})[0] || null;

    return {
      name: title,
      type: "Series",
      permalink: `mdx:${manga.id}`,
      tags,
      cover: coverUrl,
      link: `https://mangadex.org/title/${manga.id}`,
      description,
      aliases: (manga.attributes.altTitles || []).map((t) => Object.values(t)[0]).filter(Boolean),
      taggings,
    };
  }

  async fetchChapterForReader(permalink: string): Promise<{ chapter: Chapter; startPage?: number }> {
    const payload = await loadMangaDexChapterForReader(permalink);
    return { chapter: payload.chapter };
  }
}

export const mangadexProvider = new MangaDexProvider();
