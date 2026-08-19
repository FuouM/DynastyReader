import { PAGES_PREFIX } from "../state";
import * as ipc from "../ipc";
import type { ParsedDynastyUrl } from "../types/api";

/** Canonical content kind for each first path segment of a Dynasty Scans URL. */
export const KIND_BY_PATH_SEGMENT: Record<string, string> = {
  series: "series",
  chapters: "chapter",
  anthologies: "anthology",
  doujins: "doujin",
  issues: "issue",
  authors: "author",
  scanlators: "scanlator",
  pairings: "pairing",
  tags: "tag",
};

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
  try {
    await ipc.openUrl(url);
    return;
  } catch {
    window.open(url, "_blank", "noopener");
  }
}

/** Extracts a series/chapter permalink from a dynasty-scans.com URL. */
export function parseDynastyUrl(input: string): ParsedDynastyUrl | null {
  const t = input.trim().replace(/\/+$/, "");
  const m =
    /^https?:\/\/(?:www\.)?dynasty-scans\.com\/(series|chapters|anthologies|doujins|issues)\/([^\/?#]+)$/i.exec(
      t,
    );
  if (!m) return null;
  let permalink = m[2];
  if (permalink.toLowerCase().endsWith(".json")) permalink = permalink.slice(0, -5);
  const kind = normalizeToSeriesKind(KIND_BY_PATH_SEGMENT[m[1].toLowerCase()] ?? "series");
  return { kind, permalink };
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
