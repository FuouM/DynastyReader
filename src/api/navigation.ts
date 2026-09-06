import { PAGES_PREFIX } from "../constants";
import * as ipc from "../ipc";
import { log } from "../utils/log";
import type { ParsedDynastyUrl } from "../types/api";

import { KIND_BY_PATH_SEGMENT, type EntityKind } from "../taxonomy";

/** Kinds that resolve to a series-style detail page or tag search when parsed from a pasted link. */
function normalizeToSeriesKind(kind: string): ParsedDynastyUrl["kind"] {
  if (kind === "chapter") return "chapter";
  if (kind === "tag") return "tag";
  return "series";
}

/**
 * Opens a URL in the user's default browser.
 * On Android, routes directly to the native Android Intent to trigger the
 * user's default browser app (bypassing in-app webview).
 * On desktop, delegates to the `open_url` Tauri command backed by `tauri-plugin-opener`.
 * Falls back to a new tab if running in a standalone web environment.
 */
export async function openExternal(url: string): Promise<void> {
  const trimmed = url.trim();
  const lower = trimmed.toLowerCase();
  if (!lower.startsWith("http://") && !lower.startsWith("https://")) {
    log.warn("navigation", `rejected non-http/https external URL: ${url}`);
    return;
  }

  // 1. Direct native Android intent if running under Android host (opens system default browser)
  if (typeof window !== "undefined" && window.AndroidThemeBridge?.openUrl) {
    try {
      if (window.AndroidThemeBridge.openUrl(trimmed)) {
        return;
      }
    } catch (err) {
      log.debug("navigation", "AndroidThemeBridge.openUrl failed, falling back to IPC:", err);
    }
  }

  // 2. Tauri IPC openUrl command (backed by tauri-plugin-opener)
  try {
    await ipc.openUrl(trimmed);
    return;
  } catch (err) {
    log.debug("navigation", "openUrl fallback, opening in new tab:", err);
    window.open(trimmed, "_blank", "noopener");
  }
}

const PERMALINK_REGEX = /^[a-zA-Z0-9_\-]+$/;

/**
 * Checks if a candidate string is a safe, valid Dynasty Scans permalink slug.
 */
export function isValidPermalink(p: unknown): p is string {
  if (typeof p !== "string") return false;
  const clean = p.trim();
  return clean.length > 0 && clean.length <= 256 && PERMALINK_REGEX.test(clean);
}

/**
 * Strict validator and parser for Dynasty Scans URLs.
 * Extracts the canonical EntityKind and validated permalink slug.
 */
export function parseDynastyEntityUrl(input: string): {
  kind: EntityKind;
  permalink: string;
} | null {
  try {
    let trimmed = input.trim();
    if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
      trimmed = `https://${trimmed}`;
    }
    const url = new URL(trimmed);
    const host = url.hostname.toLowerCase();
    if (host !== "dynasty-scans.com" && !host.endsWith(".dynasty-scans.com")) {
      return null;
    }
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return null;

    const endpoint = parts[0].toLowerCase();
    const rawKind = KIND_BY_PATH_SEGMENT[endpoint];
    if (!rawKind) return null;

    const rawPermalink = parts[1].replace(/\.json$/i, "").trim();
    if (!isValidPermalink(rawPermalink)) return null;

    return { kind: rawKind, permalink: rawPermalink };
  } catch (err) {
    log.debug("navigation", "parseDynastyEntityUrl failed for", input, err);
    return null;
  }
}

/** Extracts a series/chapter permalink from a dynasty-scans.com URL. */
export function parseDynastyUrl(input: string): ParsedDynastyUrl | null {
  const entity = parseDynastyEntityUrl(input);
  if (!entity) return null;
  return { kind: normalizeToSeriesKind(entity.kind), permalink: entity.permalink };
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
