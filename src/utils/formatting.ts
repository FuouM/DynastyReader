/**
 * Date/time formatting helpers. `formatBytes` lives in the shared plugin
 * library (`plugins/lib/format.ts`) and is not re-implemented here.
 */

import { t } from "../i18n";

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

import { SITE_ROOT } from "../stores";

/** Constructs a full Dynasty Scans URL for the given path and permalink. */
export function dynastyUrl(path: string, permalink: string): string {
  return `${SITE_ROOT}/${path}/${permalink}`;
}
