import type { GetTextOptions, HttpResponseText } from "../types/api";
import { getCached, setCached } from "../db/metadata.repo";
import { recordNetworkTraffic, recordCacheHit } from "./traffic";
import { tryParseJson } from "../utils/json";
import * as ipc from "../ipc";
import { log } from "../utils/log";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Fetches a text/JSON payload via the service. Throws on service error. */
export async function httpGetText(
  url: string,
  opts: GetTextOptions = {},
): Promise<HttpResponseText> {
  const params: ipc.HttpGetArgs = {
    url,
    timeoutMs: opts.timeoutMs ?? 15000,
  };
  if (opts.method === "POST") {
    params.method = "POST";
    params.body = opts.body ?? "";
    params.contentType = opts.contentType ?? "application/x-www-form-urlencoded";
  }
  if (opts.headers) {
    params.headers = opts.headers;
  }
  const maxRetries = opts.method === "POST" ? 0 : 2;
  let attempt = 0;
  while (true) {
    const resp = await ipc.httpGet(params);
    const status = Number(resp.status ?? 0);
    const body = String(resp.body ?? "");
    const etag = resp.etag ? String(resp.etag) : undefined;
    if (status === 200 && body) {
      recordNetworkTraffic(body.length);
    }
    if (attempt < maxRetries && (status === 502 || status === 503 || status === 504 || status === 429)) {
      attempt++;
      await sleep(attempt * 600);
      continue;
    }
    return { status, body, etag };
  }
}

/**
 * Downloads a binary payload to the plugin's on-disk cache and returns both the
 * resolved absolute path and the exact written size in bytes.
 */
export async function httpDownloadFull(
  url: string,
  outputPath: string,
  timeoutMs = 30000,
): Promise<{ absolutePath: string; sizeBytes: number }> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= 2; attempt++) {
    try {
      const resp = await ipc.httpDownload({ url, outputPath, timeoutMs });
      const sizeBytes = Number(resp.size_bytes ?? 0);
      if (sizeBytes > 0) recordNetworkTraffic(sizeBytes);
      const result = {
        absolutePath: String(resp.absolute_path ?? ""),
        sizeBytes,
      };
      return result;
    } catch (err) {
      lastErr = err;
      log.debug("http", `httpDownloadFull attempt ${attempt + 1} failed for ${url}:`, err);
      if (attempt < 2) {
        await sleep((attempt + 1) * 600);
      }
    }
  }
  log.warn("http", `httpDownloadFull failed for ${url}:`, lastErr);
  throw lastErr;
}

/** Cache-first JSON getter: returns a fresh non-expired copy or fetches + stores with ETag revalidation. */
export async function cachedJson<T>(key: string, url: string, ttlMs?: number, dataType?: string): Promise<T> {
  const cached = await getCached(key);
  if (cached && (ttlMs === undefined || Date.now() - cached.cached_at < ttlMs)) {
    recordCacheHit(cached.json_payload.length);
    const parsed = tryParseJson<T>(cached.json_payload);
    if (parsed !== null) return parsed;
  }

  const headers: Record<string, string> = {};
  if (cached?.etag) {
    headers["If-None-Match"] = cached.etag;
  }

  const { status, body, etag } = await httpGetText(url, { headers });

  if (status === 304 && cached) {
    recordCacheHit(cached.json_payload.length);
    const parsed = tryParseJson<T>(cached.json_payload);
    if (parsed !== null) return parsed;
  }

  if (status !== 200) {
    if (cached) {
      const parsed = tryParseJson<T>(cached.json_payload);
      if (parsed !== null) return parsed;
    }
    throw new Error(`HTTP ${status} for ${url}`);
  }

  const fresh = tryParseJson<T>(body);
  if (fresh === null) throw new Error(`Invalid JSON from ${url}`);
  const computedType = dataType ?? key.split(":")[0].replace(/_v\d+$/, "");
  await setCached(key, computedType, body, etag);
  return fresh;
}