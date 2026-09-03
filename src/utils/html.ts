/**
 * HTML escaping / entity decoding helpers shared across views.
 * Uses the audited, zero-dependency `html-entities` library.
 */
import { decode as heDecode } from "html-entities";
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
