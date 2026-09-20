/**
 * MangaDex Reader Integration & At-Home Node Failover
 * Connects ReaderSession and ReaderQueue to MangaDex API and @Home node lifecycle.
 */

import { getChapter, getAtHomeServer, buildPageUrl } from "./api/chapter";
import { reportAtHome } from "./api/report";
import { mangaDexToStandardChapter } from "./mapping";
import { setCachedPage as setMdxCachedPage, getCachedPages as getMdxCachedPages } from "./db/cache.repo";
import { recordHistory as recordMdxHistory } from "./db/history.repo";
import { saveReadingProgress as saveMdxProgress, getReadingProgress as getMdxProgress } from "./db/progress.repo";
import { persistedSignal } from "../../lib/persisted-signal";
import type { Chapter, ChapterPage } from "../../types/api";
import { log } from "../../utils/log";

/** User image quality preference: "data-saver" (default) or "data" (original) */
export const [mdxImageQuality, setMdxImageQuality] = persistedSignal<"data" | "data-saver">(
  "data-saver",
  { name: "mdx:imageQuality" },
);

export interface MangaDexReaderPayload {
  chapter: Chapter;
  chapterId: string;
  mangaId: string | null;
  mangaTitle: string;
  baseUrl: string;
  hash: string;
  filenames: string[];
  quality: "data" | "data-saver";
}

/** Active @Home session metadata cached by chapterId for rapid node failover */
const atHomeSessions = new Map<string, { baseUrl: string; hash: string; filenames: string[] }>();

/**
 * Loads a MangaDex chapter for the reader session.
 * Resolves metadata and MangaDex@Home baseUrl lazily.
 */
export async function loadMangaDexChapterForReader(
  permalink: string,
): Promise<MangaDexReaderPayload> {
  const chapterId = permalink.replace(/^mdx:/, "");
  const mdxChapter = await getChapter(chapterId);

  // Extract mangaId from relationships
  const mangaRel = mdxChapter.relationships?.find((r) => r.type === "manga");
  const mangaId = mangaRel?.id || null;
  let mangaTitle = "Manga";
  if (mangaRel?.attributes && typeof mangaRel.attributes === "object" && "title" in mangaRel.attributes) {
    const rawTitle = mangaRel.attributes.title;
    if (typeof rawTitle === "object" && rawTitle !== null) {
      mangaTitle = Object.values(rawTitle)[0] || "Manga";
    }
  }

  const atHome = await getAtHomeServer(chapterId);
  const quality = mdxImageQuality();
  const filenames = quality === "data-saver" ? atHome.chapter.dataSaver : atHome.chapter.data;

  atHomeSessions.set(chapterId, {
    baseUrl: atHome.baseUrl,
    hash: atHome.chapter.hash,
    filenames,
  });

  const pages: ChapterPage[] = filenames.map((fn, idx) => ({
    name: `Page ${idx + 1}`,
    url: buildPageUrl(atHome.baseUrl, atHome.chapter.hash, fn, quality),
  }));

  const standardChapter = mangaDexToStandardChapter(mdxChapter, pages);

  return {
    chapter: standardChapter,
    chapterId,
    mangaId,
    mangaTitle,
    baseUrl: atHome.baseUrl,
    hash: atHome.chapter.hash,
    filenames,
    quality,
  };
}

/**
 * Refreshes the MangaDex@Home server assignment when a node fails or times out.
 * Returns the fresh baseUrl and rewrites remaining page URLs.
 */
export async function refreshMangaDexNode(
  chapterId: string,
): Promise<{ baseUrl: string; hash: string } | null> {
  try {
    log.info("mangadex-failover", `Refreshing dead @Home node for chapter ${chapterId}...`);
    const atHome = await getAtHomeServer(chapterId);
    const existing = atHomeSessions.get(chapterId);
    if (existing) {
      existing.baseUrl = atHome.baseUrl;
      existing.hash = atHome.chapter.hash;
    }
    log.info("mangadex-failover", `Assigned new @Home node: ${atHome.baseUrl}`);
    return { baseUrl: atHome.baseUrl, hash: atHome.chapter.hash };
  } catch (err) {
    log.warn("mangadex-failover", `Failed refreshing @Home node for chapter ${chapterId}:`, err);
    return null;
  }
}

export {
  setMdxCachedPage,
  getMdxCachedPages,
  recordMdxHistory,
  saveMdxProgress,
  getMdxProgress,
  reportAtHome,
};
