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
