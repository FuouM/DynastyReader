/**
 * HTML escaping / entity decoding helpers shared across views.
 * Uses the audited, zero-dependency `html-entities` library.
 */

import { decode as heDecode, encode as heEncode } from "html-entities";

/**
 * Decodes HTML entities and then re-escapes the result so the decoded text can be
 * safely interpolated into innerHTML or attribute templates without markup injection.
 * Use for any server-provided (entity-encoded) string that is rendered as HTML.
 */
export function safeHtml(s: string | null | undefined): string {
  return heEncode(decodeEntities(s ?? ""), { mode: "specialChars", level: "html5" });
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
