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
import type {
  GetFollowedPageOptions,
  GetBookmarksPageOptions,
  GetHistoryPageOptions,
} from "../types/db";
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
import {
  getManga,
  getAllMangaFeed,
  getAuthor,
  searchAuthors,
  searchManga,
  getScanlationGroup,
  searchScanlationGroups,
  getTags,
} from "./mangadex/api/manga";
import {
  formatMangaTitle,
  getMangaCoverUrl,
  getMangaAuthors,
  getMangaAuthorEntities,
  sortMangaDexChapters,
  formatMangaDexChapterTitle,
} from "./mangadex/mapping";
import { loadMangaDexChapterForReader } from "./mangadex/reader";
import {
  notifyFollowedChanged,
  notifyBookmarksChanged,
  notifyHistoryChanged,
  notifyProgressChanged,
} from "../db/library-notifiers";
import { decodeEntities } from "../utils/formatting";
import { t } from "../i18n";
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
import type { Series, Chapter, SeriesTag, SeriesTaggings, SeriesTaggable } from "../types/api";
import type { MangaDexAuthor, MangaDexManga, MangaDexScanlationGroup } from "./mangadex/types";
import { log } from "../utils/log";

export class MangaDexProvider implements ContentProviderAdapter {
  readonly id = "mangadex" as const;

  get meta(): ProviderMetaInfo {
    return {
      id: "mangadex",
      name: t("providers.mangadex.name"),
      shortName: t("providers.mangadex.shortName"),
      description: t("providers.mangadex.description"),
      badge: t("providers.mangadex.badge"),
      isBrowsable: true,
    };
  }

  matchesPermalink(permalink: string): boolean {
    return typeof permalink === "string" && permalink.startsWith("mdx:");
  }

  extractEntityId(permalink: string): string {
    if (!permalink) return "";
    if (permalink.startsWith("mdx-author:")) return permalink.slice("mdx-author:".length);
    if (permalink.startsWith("mdx-group:")) return permalink.slice("mdx-group:".length);
    if (permalink.startsWith("mdx-tag:")) return permalink.slice("mdx-tag:".length);
    return permalink.startsWith("mdx:") ? permalink.slice(4) : permalink;
  }


  isValidPermalink(candidate: unknown): candidate is string {
    if (typeof candidate !== "string" || !candidate.startsWith("mdx:")) return false;
    const bare = candidate.slice(4);
    return MANGADEX_UUID_REGEX.test(bare);
  }

  // Followed
  async getFollowedPage(page = 1, pageSize = 10, options?: GetFollowedPageOptions): Promise<FollowedSeriesPageResult> {
    const res = await getFollowedManga(page, pageSize, options);
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
  }

  async unfollow(permalink: string): Promise<void> {
    const mangaId = this.extractEntityId(permalink);
    await unfollowManga(mangaId);
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

  async getBookmarksPage(page = 1, pageSize = 15, options?: GetBookmarksPageOptions): Promise<BookmarkPageResult> {
    const res = await getMdxBookmarks(page, pageSize, options);
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
  }

  async removeBookmark(chapterPermalink: string): Promise<void> {
    const chapterId = this.extractEntityId(chapterPermalink);
    await removeMdxBookmark(chapterId);
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
  async getHistoryPage(page = 1, pageSize = 15, options?: GetHistoryPageOptions): Promise<HistoryPageResult> {
    const res = await getHistory(page, pageSize, options);
    return {
      rows: res.rows.map((h) => ({
        id: h.id,
        chapter_permalink: `mdx:${h.chapter_id}`,
        chapter_title: h.chapter_title,
        series_permalink: h.manga_id ? `mdx:${h.manga_id}` : "",
        series_name: h.manga_title,
        read_at: h.read_at,
        page_index: h.page_index ?? 0,
        page_total: h.page_total ?? 0,
        completed: h.completed ? 1 : 0,
      })),
      totalCount: res.totalCount,
      totalPages: res.totalPages,
      currentPage: res.currentPage,
    };
  }

  async removeHistory(id: number): Promise<void> {
    await deleteHistoryItem(id);
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
  }

  async recordHistory(input: HistoryInput): Promise<void> {
    const chapterId = this.extractEntityId(input.chapterPermalink);
    const mangaId = this.extractEntityId(input.seriesPermalink);
    await recordMdxHistory(chapterId, mangaId, input.seriesName, input.chapterTitle);
  }

  async markChapterRead(input: MarkChapterReadInput): Promise<void> {
    const chapterId = this.extractEntityId(input.chapterPermalink);
    const mangaId = this.extractEntityId(input.seriesPermalink);
    await Promise.all([
      saveMdxProgress(chapterId, mangaId, input.seriesName, input.chapterTitle, 0, input.pageTotal ?? 1, true),
      recordMdxHistory(chapterId, mangaId, input.seriesName, input.chapterTitle),
    ]);
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
  async fetchSeries(permalink: string, force = false, _preferredType?: string, page = 1): Promise<Series> {
    if (permalink.startsWith("mdx-author:")) {
      return this.fetchAuthor(permalink, force, page);
    }
    if (permalink.startsWith("mdx-group:")) {
      return this.fetchGroup(permalink, force, page);
    }
    if (permalink.startsWith("mdx-tag:")) {
      return this.fetchTag(permalink, force, page);
    }
    const mangaId = this.extractEntityId(permalink);
    const [manga, feed] = await Promise.all([
      getManga(mangaId),
      getAllMangaFeed(mangaId, { limit: 500, order: { volume: "asc", chapter: "asc" } }),
    ]);

    const title = formatMangaTitle(manga);
    const coverUrl = getMangaCoverUrl(manga, "512");
    const authors = getMangaAuthors(manga);

    const sortedChapters = sortMangaDexChapters(feed.data);

    // Collect scanlator groups across chapters
    const scanlatorMap = new Map<string, string>();
    for (const ch of sortedChapters) {
      const groupRel = ch.relationships?.find((r) => r.type === "scanlation_group");
      const attrs = groupRel?.attributes;
      const groupName =
        attrs && typeof attrs === "object" && "name" in attrs && typeof attrs.name === "string"
          ? attrs.name
          : undefined;
      if (groupName) {
        scanlatorMap.set(groupName, groupRel?.id || groupName);
      }
    }

    const authorEntities = getMangaAuthorEntities(manga);
    const authorTags: SeriesTag[] =
      authorEntities.length > 0
        ? authorEntities.map((a) => ({
            type: "Author",
            name: a.name,
            permalink: `mdx-author:${a.id}`,
          }))
        : authors.map((a) => ({
            type: "Author",
            name: a,
            permalink: `mdx-author:${a}`,
          }));

    const tags: SeriesTag[] = [
      ...authorTags,
      ...Array.from(scanlatorMap.entries()).map(([name, id]) => ({
        type: "Scanlator",
        name,
        permalink: `mdx-group:${id}`,
      })),
      { type: "Format", name: manga.attributes.status, permalink: `mdx-status:${manga.attributes.status}` },
      { type: "Format", name: manga.attributes.contentRating, permalink: `mdx-rating:${manga.attributes.contentRating}` },
      ...(manga.attributes.tags || []).map((t) => ({
        type: "General",
        name: t.attributes.name.en || Object.values(t.attributes.name)[0] || "Tag",
        permalink: `mdx-tag:${t.id}`,
      })),
    ];

    const hasAnyVolume = sortedChapters.some((ch) => Boolean(ch.attributes.volume));
    const taggings: SeriesTaggings[] = [];
    let currentVol: string | null = null;
    for (const ch of sortedChapters) {
      const vol = ch.attributes.volume;
      const effectiveVol = vol ? `Volume ${vol}` : (hasAnyVolume ? "No Volume" : null);
      if (effectiveVol !== currentVol) {
        currentVol = effectiveVol;
        if (effectiveVol) {
          taggings.push({ header: effectiveVol });
        }
      }
      const chTitle = formatMangaDexChapterTitle(ch.attributes.chapter, ch.attributes.title);
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
      aliases: (manga.attributes.altTitles || []).map((t) => Object.values(t)[0]).filter((x): x is string => Boolean(x)),
      taggings,
    };
  }

  async fetchAuthor(permalink: string, _force = false, page = 1): Promise<Series> {
    const raw = permalink.startsWith("mdx-author:")
      ? permalink.slice("mdx-author:".length)
      : permalink;
    let authorId = raw;
    let author: MangaDexAuthor | null = null;

    if (MANGADEX_UUID_REGEX.test(raw)) {
      try {
        author = await getAuthor(raw);
      } catch (err) {
        log.warn("mangadex.provider", "failed to fetch author by UUID", raw, err);
      }
    } else {
      try {
        const matches = await searchAuthors(raw, 5);
        const exact = matches.find(
          (m) => m.attributes.name.toLowerCase() === raw.toLowerCase(),
        );
        author = exact || matches[0] || null;
        if (author) authorId = author.id;
      } catch (err) {
        log.warn("mangadex.provider", "failed to search author by name", raw, err);
      }
    }

    const authorName = author?.attributes?.name || raw;
    const authorBio = author?.attributes?.biography
      ? author.attributes.biography.en ||
        Object.values(author.attributes.biography)[0] ||
        null
      : null;
    const authorCover = author?.attributes?.imageUrl || null;

    const PAGE_SIZE = 48;
    const offset = (page - 1) * PAGE_SIZE;
    let mangaList: MangaDexManga[] = [];
    let totalManga = 0;
    if (MANGADEX_UUID_REGEX.test(authorId)) {
      try {
        const [authorRes, artistRes] = await Promise.allSettled([
          searchManga({ authors: [authorId], limit: PAGE_SIZE, offset }),
          searchManga({ artists: [authorId], limit: PAGE_SIZE, offset }),
        ]);
        const seen = new Set<string>();
        if (authorRes.status === "fulfilled" && authorRes.value?.data) {
          totalManga = Math.max(totalManga, authorRes.value.total ?? 0);
          for (const m of authorRes.value.data) {
            seen.add(m.id);
            mangaList.push(m);
          }
        }
        if (artistRes.status === "fulfilled" && artistRes.value?.data) {
          totalManga = Math.max(totalManga, artistRes.value.total ?? 0);
          for (const m of artistRes.value.data) {
            if (!seen.has(m.id)) {
              seen.add(m.id);
              mangaList.push(m);
            }
          }
        }
      } catch (err) {
        log.warn("mangadex.provider", "failed to fetch manga for author", authorId, err);
      }
    }
    const totalPages = Math.max(1, Math.ceil(totalManga / PAGE_SIZE));

    const taggables: SeriesTaggable[] = mangaList.map((m) => ({
      type: "Series",
      name: formatMangaTitle(m),
      permalink: `mdx:${m.id}`,
      cover: getMangaCoverUrl(m, "256"),
    }));

    return {
      name: authorName,
      type: "Author",
      permalink: `mdx-author:${authorId}`,
      tags: [],
      cover: authorCover,
      link: MANGADEX_UUID_REGEX.test(authorId) ? `https://mangadex.org/author/${authorId}` : null,
      description: authorBio,
      aliases: [],
      taggings: [],
      taggables,
      current_page: page,
      total_pages: totalPages,
    };
  }

  async fetchGroup(permalink: string, _force = false, page = 1): Promise<Series> {
    const raw = permalink.startsWith("mdx-group:")
      ? permalink.slice("mdx-group:".length)
      : permalink;
    let groupId = raw;
    let group: MangaDexScanlationGroup | null = null;

    if (MANGADEX_UUID_REGEX.test(raw)) {
      try {
        group = await getScanlationGroup(raw);
      } catch (err) {
        log.warn("mangadex.provider", "failed to fetch group by UUID", raw, err);
      }
    } else {
      try {
        const matches = await searchScanlationGroups(raw, 5);
        const exact = matches.find(
          (m) => m.attributes.name.toLowerCase() === raw.toLowerCase(),
        );
        group = exact || matches[0] || null;
        if (group) groupId = group.id;
      } catch (err) {
        log.warn("mangadex.provider", "failed to search group by name", raw, err);
      }
    }

    const groupName = group?.attributes?.name || raw;
    const groupDesc = group?.attributes?.description || null;

    const PAGE_SIZE = 48;
    const offset = (page - 1) * PAGE_SIZE;
    let mangaList: MangaDexManga[] = [];
    let totalManga = 0;
    if (MANGADEX_UUID_REGEX.test(groupId)) {
      try {
        const mdxRes = await searchManga({ group: groupId, limit: PAGE_SIZE, offset });
        totalManga = mdxRes.total ?? 0;
        if (mdxRes.data) {
          mangaList = mdxRes.data;
        }
      } catch (err) {
        log.warn("mangadex.provider", "failed to fetch manga for group", groupId, err);
      }
    }
    const totalPages = Math.max(1, Math.ceil(totalManga / PAGE_SIZE));
    const taggables: SeriesTaggable[] = mangaList.map((m) => ({
      type: "Series",
      name: formatMangaTitle(m),
      permalink: `mdx:${m.id}`,
      cover: getMangaCoverUrl(m, "256"),
    }));

    return {
      name: groupName,
      type: "Scanlator",
      permalink: `mdx-group:${groupId}`,
      tags: [],
      cover: null,
      link: MANGADEX_UUID_REGEX.test(groupId) ? `https://mangadex.org/group/${groupId}` : null,
      description: groupDesc,
      aliases: (group?.attributes?.altNames || []).map((t) => Object.values(t)[0]).filter((x): x is string => Boolean(x)),
      taggings: [],
      taggables,
      current_page: page,
      total_pages: totalPages,
    };
  }

  async fetchTag(permalink: string, _force = false, page = 1): Promise<Series> {
    const raw = permalink.startsWith("mdx-tag:")
      ? permalink.slice("mdx-tag:".length)
      : permalink;
    let tagId = raw;
    let tagName = raw;
    let tagDesc: string | null = null;

    try {
      const allTags = await getTags();
      let matchedTag = allTags.find((t) => t.id === raw);
      if (!matchedTag) {
        const lower = raw.toLowerCase();
        matchedTag = allTags.find(
          (t) =>
            t.attributes.name.en?.toLowerCase() === lower ||
            Object.values(t.attributes.name).some((v) => v.toLowerCase() === lower),
        );
      }
      if (matchedTag) {
        tagId = matchedTag.id;
        tagName =
          matchedTag.attributes.name.en ||
          Object.values(matchedTag.attributes.name)[0] ||
          raw;
        tagDesc =
          matchedTag.attributes.description?.en ||
          Object.values(matchedTag.attributes.description || {})[0] ||
          null;
      }
    } catch (err) {
      log.warn("mangadex.provider", "failed to resolve tag for fetchTag", raw, err);
    }

    const PAGE_SIZE = 48;
    const offset = (page - 1) * PAGE_SIZE;
    let mangaList: MangaDexManga[] = [];
    let totalManga = 0;
    if (MANGADEX_UUID_REGEX.test(tagId)) {
      try {
        const mdxRes = await searchManga({ includedTags: [tagId], limit: PAGE_SIZE, offset });
        totalManga = mdxRes.total ?? 0;
        if (mdxRes.data) {
          mangaList = mdxRes.data;
        }
      } catch (err) {
        log.warn("mangadex.provider", "failed to fetch manga for tag", tagId, err);
      }
    }
    const totalPages = Math.max(1, Math.ceil(totalManga / PAGE_SIZE));

    const taggables: SeriesTaggable[] = mangaList.map((m) => ({
      type: "Series",
      name: formatMangaTitle(m),
      permalink: `mdx:${m.id}`,
      cover: getMangaCoverUrl(m, "256"),
    }));

    return {
      name: tagName,
      type: "Tag",
      permalink: `mdx-tag:${tagId}`,
      tags: [],
      cover: null,
      link: MANGADEX_UUID_REGEX.test(tagId) ? `https://mangadex.org/titles?include=${tagId}` : null,
      description: tagDesc,
      aliases: [],
      taggings: [],
      taggables,
      current_page: page,
      total_pages: totalPages,
    };
  }

  async fetchChapterForReader(permalink: string): Promise<{ chapter: Chapter; startPage?: number }> {
    const payload = await loadMangaDexChapterForReader(permalink);
    return { chapter: payload.chapter };
  }
}

export const mangadexProvider = new MangaDexProvider();
