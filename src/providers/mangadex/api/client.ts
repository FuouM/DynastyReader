/**
 * Rate-limited MangaDex API HTTP Client
 * Dispatches via Tauri ipc.httpGet with User-Agent and query serialization.
 */

import * as ipc from "../../../ipc";
import { recordNetworkTraffic } from "../../../api/traffic";
import { log } from "../../../utils/log";
import {
  MANGADEX_API_BASE,
  MANGADEX_RATE_LIMIT_DELAY_MS,
  MANGADEX_USER_AGENT,
} from "./constants";

/** Request queue to enforce polite rate limiting (~4 req/sec) */
let lastRequestTime = 0;
let requestQueue: Promise<void> = Promise.resolve();

function scheduleRateLimited(): Promise<void> {
  const next = requestQueue.then(async () => {
    const now = Date.now();
    const elapsed = now - lastRequestTime;
    if (elapsed < MANGADEX_RATE_LIMIT_DELAY_MS) {
      await new Promise<void>((resolve) =>
        setTimeout(resolve, MANGADEX_RATE_LIMIT_DELAY_MS - elapsed),
      );
    }
    lastRequestTime = Date.now();
  });
  requestQueue = next.catch(() => {});
  return next;
}

/**
 * Serializes query parameters for MangaDex REST API.
 * Handles arrays with bracket notation: `includes[]=cover_art&includes[]=author`.
 * Handles nested objects: `order[chapter]=asc`.
 */
export function buildQueryString(params?: Record<string, unknown>): string {
  if (!params) return "";
  const parts: string[] = [];

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;

    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== undefined && item !== null && item !== "") {
          parts.push(`${encodeURIComponent(`${key}[]`)}=${encodeURIComponent(String(item))}`);
        }
      }
    } else if (typeof value === "object") {
      for (const [subKey, subVal] of Object.entries(value as Record<string, unknown>)) {
        if (subVal !== undefined && subVal !== null && subVal !== "") {
          parts.push(
            `${encodeURIComponent(`${key}[${subKey}]`)}=${encodeURIComponent(String(subVal))}`,
          );
        }
      }
    } else {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    }
  }

  return parts.length > 0 ? `?${parts.join("&")}` : "";
}

export interface FetchOptions {
  method?: "GET" | "POST";
  body?: unknown;
  timeoutMs?: number;
  headers?: Record<string, string>;
}

/**
 * Executes a rate-limited request against MangaDex API.
 */
export async function fetchMangaDex<T>(
  endpoint: string,
  params?: Record<string, unknown>,
  options: FetchOptions = {},
): Promise<T> {
  await scheduleRateLimited();

  const queryString = buildQueryString(params);
  const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const url = `${MANGADEX_API_BASE}${cleanEndpoint}${queryString}`;

  const headers: Record<string, string> = {
    "User-Agent": MANGADEX_USER_AGENT,
    Accept: "application/json",
    ...(options.headers ?? {}),
  };

  const isPost = options.method === "POST";
  let bodyStr: string | undefined;
  let contentType: string | undefined;

  if (isPost && options.body !== undefined) {
    bodyStr = typeof options.body === "string" ? options.body : JSON.stringify(options.body);
    contentType = "application/json";
  }

  try {
    const resp = await ipc.httpGet({
      url,
      method: options.method ?? "GET",
      body: bodyStr,
      contentType,
      headers,
      timeoutMs: options.timeoutMs ?? 20000,
    });

    const status = Number(resp.status ?? 0);
    const text = String(resp.body ?? "");

    if (status >= 200 && status < 300 && text.length > 0) {
      recordNetworkTraffic(text.length);
    }
    if (status < 200 || status >= 300) {
      let errorMsg = `MangaDex API error HTTP ${status}`;
      try {
        const errJson = JSON.parse(text);
        if (Array.isArray(errJson.errors) && errJson.errors.length > 0) {
          const first = errJson.errors[0];
          errorMsg = first.detail || first.title || errorMsg;
        }
      } catch {
        // Body wasn't JSON (e.g. 503 Cloudflare HTML)
        if (text.length > 0 && text.length < 200) {
          errorMsg = `${errorMsg}: ${text}`;
        }
      }
      throw new Error(errorMsg);
    }

    return JSON.parse(text) as T;
  } catch (err) {
    log.warn("mangadex", `Request failed for ${url}:`, err);
    throw err;
  }
}
