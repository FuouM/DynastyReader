/**
 * Legacy cache-path standardization. Older cache versions wrote pages under
 * several ad-hoc directory layouts; this background pass (zero network
 * traffic) locates those files, moves them to the canonical path, and re-indexes
 * them so `pageOutputPath` becomes the single source of truth.
 */

import type { ReaderSession } from "./reader-session";
import { PAGES_PREFIX } from "../stores";
import { fileMove, fileResolve, fileResolveWithStat } from "../api/fs";
import { pageOutputPath } from "../api/navigation";
import { setCachedPage } from "../db";
import { log } from "../utils/log";

/** Background legacy-filename standardization. Zero network traffic. */
export function standardizeCachePaths(session: ReaderSession): void {
  window.setTimeout(async () => {
    if (session.disposed) return;
    const seriesPermalink = session.seriesPermalink();
    const cleanSeries = (seriesPermalink || "_singles").replace(/[^a-zA-Z0-9_-]/g, "_");
    const cleanChapter = session.permalink.replace(/[^a-zA-Z0-9_-]/g, "_");
    const pages = session.pages();

    for (let i = 0; i < pages.length; i++) {
      if (session.disposed) return;
      const page = pages[i];
      if (!page) continue;
      const targetPath = pageOutputPath(seriesPermalink ?? "", session.permalink, i, page.url);

      // Skip if already at canonical path. `cachedPages` holds absolute paths,
      // so compare against the resolved absolute form (not the relative `targetPath`).
      const alreadyThere = await fileResolveWithStat(targetPath);
      if (alreadyThere) {
        if (session.getCachedPath(i) !== alreadyThere.absolutePath) {
          await setCachedPage(session.permalink, i, alreadyThere.absolutePath, alreadyThere.sizeBytes);
          session.setCachedPath(i, alreadyThere.absolutePath);
        }
        continue;
      }

      // Build candidate legacy paths from the original URL filename
      const origName = page.url.split("/").pop() || "";
      const ext = origName.split(".").pop()?.split("?")[0] || "webp";
      const pad3 = String(i + 1).padStart(3, "0");
      const pad4 = String(i + 1).padStart(4, "0");
      const candidates = [
        `${PAGES_PREFIX}/${cleanSeries}/${cleanChapter}/${pad3}_${origName}`,
        `${PAGES_PREFIX}/${cleanChapter}/${origName}`,
        `${PAGES_PREFIX}/_singles/${cleanChapter}/${origName}`,
        `${PAGES_PREFIX}/${cleanSeries}/${cleanChapter}/${origName}`,
        `${PAGES_PREFIX}/${cleanChapter}/page_${pad4}.${ext}`,
      ];

      let found: string | null = null;
      for (const candidate of candidates) {
        found = await fileResolve(candidate);
        if (found) break;
      }

      if (found) {
        try {
          const newAbsPath = await fileMove(found, targetPath);
          const moveStat = await fileResolveWithStat(targetPath);
          await setCachedPage(session.permalink, i, newAbsPath, moveStat?.sizeBytes ?? 0);
          session.setCachedPath(i, newAbsPath);
        } catch (e) {
          log.warn("path-migration", `could not move page ${i + 1} to canonical path:`, e);
        }
      }
      // If nothing found: downloadPage already handles this via the queue
    }
  }, 2500);
}