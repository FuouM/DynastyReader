/**
 * Date/time and file-size formatting helpers.
 */
import { t } from "../i18n";
export { dynastyUrl } from "./url";

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

