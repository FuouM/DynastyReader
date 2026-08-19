/**
 * Top-bar action buttons for the reader view: Series, Bookmark, Cache Chapter,
 * Copy link, and Open in browser.
 */

import type { ReaderController } from "./reader-controller";
import { navigate, setBanner } from "../state";
import { addBookmark, removeBookmark } from "../db";
import { openExternal } from "../api";

/** Builds the reader's top-bar actions into `host`. `bookmarked` seeds the toggle state. */
export function buildReaderActions(
  ctrl: ReaderController,
  host: HTMLElement,
  bookmarked: boolean,
): void {
  if (ctrl.seriesPermalink) {
    const seriesBtn = document.createElement("button");
    seriesBtn.type = "button";
    seriesBtn.className = "win-button";
    seriesBtn.title = "Open the containing series";
    seriesBtn.innerHTML = '<i class="bi bi-collection"></i> Series';
    seriesBtn.addEventListener("click", () => {
      navigate({
        view: "series",
        seriesPermalink: ctrl.seriesPermalink ?? undefined,
        seriesName: ctrl.seriesName ?? ctrl.chapterTitle,
      });
    });
    host.appendChild(seriesBtn);
  }

  const bmBtn = document.createElement("button");
  bmBtn.type = "button";
  bmBtn.className = "win-button";
  bmBtn.title = bookmarked ? "Remove bookmark" : "Bookmark this chapter";
  bmBtn.innerHTML = bookmarked
    ? '<i class="bi bi-bookmark-fill"></i>'
    : '<i class="bi bi-bookmark"></i>';
  bmBtn.addEventListener("click", async () => {
    bmBtn.disabled = true;
    try {
      if (bookmarked) {
        await removeBookmark(ctrl.permalink);
        bookmarked = false;
      } else {
        await addBookmark({
          chapterPermalink: ctrl.permalink,
          seriesPermalink: ctrl.seriesPermalink ?? "",
          seriesName: ctrl.seriesName ?? "",
          chapterTitle: ctrl.chapterTitle,
          pageIndex: ctrl.currentIndex,
        });
        bookmarked = true;
      }
      bmBtn.innerHTML = bookmarked
        ? '<i class="bi bi-bookmark-fill"></i>'
        : '<i class="bi bi-bookmark"></i>';
      bmBtn.title = bookmarked ? "Remove bookmark" : "Bookmark this chapter";
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setBanner(`Bookmark failed: ${msg}`);
    }
    bmBtn.disabled = false;
  });
  host.appendChild(bmBtn);

  const cacheBtn = document.createElement("button");
  cacheBtn.type = "button";
  cacheBtn.className = "win-button";
  cacheBtn.title = "Download every uncached page of this chapter";
  cacheBtn.innerHTML = '<i class="bi bi-download"></i> <span class="ds-btn-text">Cache Chapter</span>';
  cacheBtn.addEventListener("click", () => {
    for (let i = 0; i < ctrl.pages.length; i++) {
      if (!ctrl.cachedMap.has(i) && !ctrl.isPageFailed(i)) ctrl.enqueue(i);
    }
    setBanner("Caching chapter…");
  });
  host.appendChild(cacheBtn);

  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.className = "win-button";
  copyBtn.title = "Copy chapter link to clipboard";
  copyBtn.innerHTML = '<i class="bi bi-link-45deg"></i>';
  copyBtn.addEventListener("click", async () => {
    try {
      const url = `https://dynasty-scans.com/chapters/${ctrl.permalink}`;
      await navigator.clipboard.writeText(url);
      copyBtn.innerHTML = '<i class="bi bi-check-lg"></i>';
      setBanner("Copied chapter link to clipboard");
      window.setTimeout(() => {
        if (!copyBtn.isConnected) return;
        copyBtn.innerHTML = '<i class="bi bi-link-45deg"></i>';
      }, 2000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setBanner(`Copy failed: ${msg}`);
    }
  });
  host.appendChild(copyBtn);

  const openBtn = document.createElement("button");
  openBtn.type = "button";
  openBtn.className = "win-button";
  openBtn.title = "Open this chapter in your browser";
  openBtn.innerHTML = '<i class="bi bi-box-arrow-up-right"></i>';
  openBtn.addEventListener("click", () => {
    void openExternal(`https://dynasty-scans.com/chapters/${ctrl.permalink}`);
  });
  host.appendChild(openBtn);
}