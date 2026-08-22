/**
 * HTML escaping / entity decoding helpers shared across views.
 */

let cachedParser: DOMParser | null = null;
function getDomParser(): DOMParser | null {
  if (cachedParser) return cachedParser;
  if (typeof DOMParser !== "undefined") {
    cachedParser = new DOMParser();
    return cachedParser;
  }
  return null;
}

const ESC_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
  "`": "&#96;",
};

/** Escapes a string for safe use inside HTML text or attribute values. */
export function esc(s: string): string {
  return String(s).replace(/[&<>"'`]/g, (c) => ESC_MAP[c] ?? c);
}

/**
 * Decodes HTML entities and then re-escapes the result so the decoded text can be
 * safely interpolated into innerHTML or attribute templates without markup injection.
 * Use for any server-provided (entity-encoded) string that is rendered as HTML.
 */
export function safeHtml(s: string | null | undefined): string {
  return esc(decodeEntities(s));
}

/**
 * Decodes HTML entities into clean human-readable unicode text for safe DOM textContent rendering.
 * Uses browser-native DOMParser to handle all HTML5 named entities, numeric codes, hex codes,
 * and surrogate pairs cleanly without manual regex lists.
 */
export function decodeEntities(str: string | null | undefined): string {
  if (!str) return "";
  const s = String(str);
  if (!s.includes("&")) return s;
  const parser = getDomParser();
  if (parser) {
    const doc = parser.parseFromString(s, "text/html");
    let decoded = doc.body.textContent ?? "";
    // Iterative unescape for double-escaped payloads (e.g. &amp;quot; -> &quot; -> ")
    if (decoded.includes("&")) {
      const doc2 = parser.parseFromString(decoded, "text/html");
      decoded = doc2.body.textContent ?? "";
    }
    return decoded;
  }

  // Fallback for non-browser environments
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#039;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
