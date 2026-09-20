/**
 * Date/time, file-size, URL, entity decoding, and text formatting helpers.
 */
import { decode as heDecode } from "html-entities";
import { SITE_ROOT } from "../constants";
import { t } from "../i18n";
import { log } from "./log";
const shortDateFormatter = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const fullDateTimeFormatter = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

/** Formats a unix-ms timestamp as a short date (YYYY-MM-DD). */
export function formatDate(ms: number): string {
  if (!ms) return "";
  return shortDateFormatter.format(new Date(ms));
}

/** Formats a unix-ms timestamp as a full date and time (YYYY-MM-DD HH:MM:SS). */
export function formatDateTime(ms?: number | null): string {
  if (!ms) return t("common.never");
  return fullDateTimeFormatter.format(new Date(ms)).replace(",", "");
}

/** Converts a string to a URL-safe slug: lowercase, non-alphanumeric → underscore, trimmed. */
export function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * Human-readable file size formatting.
 * @param bytes    - Raw byte count. null / undefined / NaN are treated as missing and return `fallback`.
 * @param fallback - Returned when bytes is missing or negative. Defaults to "".
 * @param decimals - Number of decimal places. Defaults to 2.
 */
export function formatBytes(bytes: number | null | undefined, fallback = "", decimals = 2): string {
  if (bytes == null || isNaN(bytes) || bytes < 0) return fallback;
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(decimals)} ${units[i]}`;
}

export function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec <= 0 || !isFinite(bytesPerSec)) return "";
  return `${formatBytes(bytesPerSec)}/s`;
}

export function formatEta(seconds: number): string {
  if (seconds <= 0 || !isFinite(seconds) || seconds > 86400) return "";
  if (seconds < 60) return `~${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (mins < 60) return `~${mins}m ${secs > 0 ? `${secs}s` : ""}`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `~${hours}h ${remMins}m`;
}

/**
 * Extracts a human-readable message from an unknown caught value.
 */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Absolute URL from a possibly-relative site path (e.g. `/system/.../01.webp`). */
export function absUrl(u: string): string {
  if (/^https?:\/\//i.test(u)) return u;
  return SITE_ROOT + u;
}

/** Constructs a full Dynasty Scans URL for the given path and permalink. */
export function dynastyUrl(path: string, permalink: string): string {
  return `${SITE_ROOT}/${path}/${permalink}`;
}

/** Parses JSON text; logs and returns null on failure (never throws). */
export function tryParseJson<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch (err) {
    log.error("json", "Failed to parse JSON payload:", err);
    return null;
  }
}

/**
 * Decodes HTML entities into clean human-readable unicode text for safe DOM textContent rendering.
 * Uses html-entities to handle all HTML5 named entities, numeric codes, hex codes,
 * and surrogate pairs cleanly without manual regex lists.
 */
export function decodeEntities(str: string | null | undefined): string {
  if (!str) return "";
  const s = String(str);
  if (!s.includes("&")) return s;
  let decoded = heDecode(s, { level: "html5" });
  // Iterative unescape for double-escaped payloads (e.g. &amp;quot; -> &quot; -> ")
  if (decoded.includes("&")) {
    decoded = heDecode(decoded, { level: "html5" });
  }
  return decoded;
}

/**
 * Extracts a normalized "Volume N" label from a chapter or tag title.
 * Handles bracketed formats [Vol. 1], leading Vol. 1, and embedded Volume 2.
 */
export function extractVolumeHeader(title: string): string | undefined {
  if (!title) return undefined;
  const bracketed = title.match(/[\[\(【]\s*(?:vol(?:ume)?\.?|v)\s*(\d+)\s*[\]\)】]/i);
  if (bracketed) return `Volume ${parseInt(bracketed[1], 10)}`;
  const match = title.match(/\b(?:vol(?:ume)?\.?|v)\s*(\d+)\b/i);
  if (match) return `Volume ${parseInt(match[1], 10)}`;
  return undefined;
}

/**
 * Checks whether a tagging header string from metadata is a genuine volume or story section header.
 */
export function isVolumeOrSectionHeader(header: string): boolean {
  if (!header) return false;
  const h = header.trim();
  if (/^(?:volume|vol\.?|book|part|season|act|arc)\b/i.test(h)) return true;
  if (/^(?:side\s*story|specials?|extras?|oneshots?|pre-?serialis?ation|april\s*fools?|blu-?ray|prologue|epilogue)\b/i.test(h)) return true;
  return false;
}

