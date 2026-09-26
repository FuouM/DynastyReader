/**
 * MangaDex API Constants
 */

export const MANGADEX_API_BASE = "https://api.mangadex.org";
export const MANGADEX_NETWORK_REPORT = "https://api.mangadex.network/report";
export const MANGADEX_UPLOADS_BASE = "https://uploads.mangadex.org";

/** MangaDex UUID for "Girls' Love" genre tag */
export const GIRLS_LOVE_TAG_ID = "a3c67850-4684-404e-9b7f-c69850ee5da6";

/** User-Agent header required by MangaDex API policy */
export const MANGADEX_USER_AGENT = "DynastyReader/1.0.0 (https://github.com/DynastyReader)";

/** Max requests per second allowed (polite client threshold) */
export const MANGADEX_RATE_LIMIT_DELAY_MS = 250; // 4 req/sec

/** Default feed page limit (MangaDex max is 500) */
export const MANGADEX_FEED_PAGE_LIMIT = 100;

/** Standard MangaDex v4/v5 entity UUID pattern (8-4-4-4-12 hex). */
export const MANGADEX_UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/**
 * Strips the optional `mdx:` prefix and validates that the result is a strict UUID
 * before URL interpolation to prevent path traversal or API parameter injection.
 */
export function cleanMangaDexId(id: string): string {
  const clean = id.startsWith("mdx:") ? id.slice(4) : id;
  if (!MANGADEX_UUID_REGEX.test(clean)) {
    throw new Error(`Invalid MangaDex entity UUID: "${id}"`);
  }
  return encodeURIComponent(clean);
}
