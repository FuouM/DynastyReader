import { PAGES_PREFIX } from "../stores";
import * as ipc from "../ipc";
import type { ParsedDynastyUrl } from "../types/api";

import { KIND_BY_PATH_SEGMENT } from "../taxonomy";
export { KIND_BY_PATH_SEGMENT };

/** Kinds that resolve to a series-style detail page when parsed from a pasted link. */
function normalizeToSeriesKind(kind: string): ParsedDynastyUrl["kind"] {
  return kind === "chapter" ? "chapter" : "series";
}

/**
 * Opens a URL in the user's default browser via the `open_url` Tauri command
 * (which restricts to http/https). Falls back to a new tab if the backend is
 * unavailable or the scheme is rejected.
 */
export async function openExternal(url: string): Promise<void> {
  const lower = url.trim().toLowerCase();
  if (!lower.startsWith("http://") && !lower.startsWith("https://")) {
    console.warn(`[navigation] rejected non-http/https external URL: ${url}`);
    return;
  }
  try {
    await ipc.openUrl(url);
    return;
  } catch {
    window.open(url, "_blank", "noopener");
  }
}

/** Extracts a series/chapter permalink from a dynasty-scans.com URL. */
export function parseDynastyUrl(input: string): ParsedDynastyUrl | null {
  try {
    const url = new URL(input.trim());
    if (!url.hostname.endsWith("dynasty-scans.com")) return null;
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return null;
    const rawKind = KIND_BY_PATH_SEGMENT[parts[0].toLowerCase()];
    if (!rawKind) return null;
    const permalink = parts[1].replace(/\.json$/i, "");
    return { kind: normalizeToSeriesKind(rawKind), permalink };
  } catch {
    return null;
  }
}

/** Builds the on-disk output path for a chapter page image. */
export function pageOutputPath(
  seriesPermalink: string,
  chapterPermalink: string,
  pageIndex: number,
  pageUrl: string,
): string {
  const cleanSeries = (seriesPermalink || "_singles").replace(/[^a-zA-Z0-9_-]/g, "_");
  const cleanChapter = (chapterPermalink || "chapter").replace(/[^a-zA-Z0-9_-]/g, "_");
  const ext = pageUrl.split(".").pop()?.split("?")[0] || "webp";
  const pad = String(pageIndex + 1).padStart(4, "0");
  return `${PAGES_PREFIX}/${cleanSeries}/${cleanChapter}/page_${pad}.${ext}`;
}
