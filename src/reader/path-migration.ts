/**
 * Legacy cache-path standardization. Older cache versions wrote pages under
 * several ad-hoc directory layouts; this background pass (zero network
 * traffic) locates those files, moves them to the canonical path, and re-indexes
 * them so `pageOutputPath` becomes the single source of truth.
 */

import type { ReaderController } from "./reader-controller";
import { PAGES_PREFIX } from "../state";
import { fileMove, fileResolve, pageOutputPath } from "../api";
import { setCachedPage } from "../db";
import { renderSlotImg, updateCacheCount } from "./reader-slots";

/** Background legacy-filename standardization. Zero network traffic. */
export function standardizeCachePaths(ctrl: ReaderController): void {
  window.setTimeout(async () => {
    if (ctrl.disposed) return;
    const cleanSeries = (ctrl.seriesPermalink || "_singles").replace(/[^a-zA-Z0-9_-]/g, "_");
    const cleanChapter = ctrl.permalink.replace(/[^a-zA-Z0-9_-]/g, "_");

    for (let i = 0; i < ctrl.pages.length; i++) {
      if (ctrl.disposed) return;
      const page = ctrl.pages[i];
      if (!page) continue;
      const targetPath = pageOutputPath(ctrl.seriesPermalink ?? "", ctrl.permalink, i, page.url);

      // Skip if already at canonical path. `cachedMap` holds absolute paths,
      // so compare against the resolved absolute form (not the relative
      // `targetPath`) — otherwise every cached page gets re-rendered here and
      // the visible image flashes.
      const alreadyThere = await fileResolve(targetPath);
      if (alreadyThere) {
        if (ctrl.cachedMap.get(i) !== alreadyThere) {
          await setCachedPage(ctrl.permalink, i, alreadyThere, 0);
          ctrl.cachedMap.set(i, alreadyThere);
          if (!ctrl.disposed && ctrl.slots[i]) {
            renderSlotImg(ctrl, ctrl.slots[i], alreadyThere, i + 1);
          }
          updateCacheCount(ctrl);
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
          await setCachedPage(ctrl.permalink, i, newAbsPath, 0);
          ctrl.cachedMap.set(i, newAbsPath);
          if (!ctrl.disposed && ctrl.slots[i]) {
            renderSlotImg(ctrl, ctrl.slots[i], newAbsPath, i + 1);
          }
          updateCacheCount(ctrl);
        } catch (e) {
          console.warn(`dynasty-scans: could not move page ${i + 1} to canonical path:`, e);
        }
      }
      // If nothing found: downloadPage already handles this via the queue
    }
  }, 2500);
}