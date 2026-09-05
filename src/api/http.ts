import type { GetTextOptions, HttpResponseText } from "../types/api";
import { getCached, setCached } from "../db/metadata.repo";
import { recordNetworkTraffic, recordCacheHit } from "./traffic";
import { tryParseJson } from "../utils/json";
import * as ipc from "../ipc";

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
  const resp = await ipc.httpGet(params);
  const status = Number(resp.status ?? 0);
  const body = String(resp.body ?? "");
  const etag = resp.etag ? String(resp.etag) : undefined;
  if (status === 200 && body) {
    recordNetworkTraffic(body.length);
  }
  return { status, body, etag };
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
  const resp = await ipc.httpDownload({ url, outputPath, timeoutMs });
  const sizeBytes = Number(resp.size_bytes ?? 0);
  if (sizeBytes > 0) recordNetworkTraffic(sizeBytes);
  return {
    absolutePath: String(resp.absolute_path ?? ""),
    sizeBytes,
  };
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