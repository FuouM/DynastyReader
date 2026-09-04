import { DB_NAME } from "../constants";
import * as ipc from "../ipc";
import { query, execute } from "./client";
import { notifyFollowedChanged, updateFollowedSeriesCover } from "./library.repo";
import { notifyCollectionsChanged, updateCollectionItemCoverByPermalink } from "./collections.repo";
import { decodeEntities } from "../utils/html";
import { KIND_BY_PATH_SEGMENT, type EntityKind } from "../taxonomy";
import { getOrHydrateSeriesCover } from "../api";

export interface ValidatedFollowedItem {
  permalink: string;
  name: string;
  cover?: string | null;
  latestChapterPermalink: string | null;
  latestChapterTitle: string | null;
  followedAt: number;
}

export interface ValidatedCollectionItem {
  permalink: string;
  title: string;
  kind: string;
  cover?: string | null;
  parentSeriesPermalink: string | null;
  parentSeriesName: string | null;
  addedAt: number;
}

export interface ValidatedCollection {
  name: string;
  isDefault: boolean;
  items: ValidatedCollectionItem[];
}

export interface ValidatedImportPayload {
  valid: boolean;
  detectedFormat: "json" | "urls" | "none";
  followed: ValidatedFollowedItem[];
  collections: ValidatedCollection[];
  stats: {
    followedCount: number;
    collectionsCount: number;
    collectionItemsCount: number;
    ignoredCount: number;
  };
  warnings: string[];
  errors: string[];
}

export interface ExecuteImportOptions {
  targetMode?: "auto" | "followed" | "collection";
  targetCollectionId?: number;
  newCollectionName?: string;
}

export interface ImportExecutionResult {
  success: boolean;
  followedImported: number;
  collectionsCreated: number;
  itemsImported: number;
  totalImported: number;
}

const PERMALINK_REGEX = /^[a-zA-Z0-9_\-]+$/;

/**
 * Checks if a candidate string is a safe, valid Dynasty Scans permalink slug.
 */
export function isValidPermalink(p: unknown): p is string {
  if (typeof p !== "string") return false;
  const clean = p.trim();
  return clean.length > 0 && clean.length <= 256 && PERMALINK_REGEX.test(clean);
}

/**
 * Derives a clean human-readable title from a permalink slug (e.g. "bloom_into_you" -> "Bloom Into You").
 */
export function titleFromPermalink(permalink: string): string {
  return permalink
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Strict validator for Dynasty Scans URLs.
 * Ensures protocol is http/https, host is dynasty-scans.com, and path matches a valid domain entity.
 */
export function parseValidDynastyUrl(input: string): {
  kind: EntityKind;
  permalink: string;
} | null {
  try {
    const trimmed = input.trim();
    if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
      return null;
    }
    const url = new URL(trimmed);
    const host = url.hostname.toLowerCase();
    if (host !== "dynasty-scans.com" && host !== "www.dynasty-scans.com") {
      return null;
    }
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return null;

    const endpoint = parts[0].toLowerCase();
    const rawKind = KIND_BY_PATH_SEGMENT[endpoint];
    if (!rawKind) return null;

    const rawPermalink = parts[1].replace(/\.json$/i, "").trim();
    if (!isValidPermalink(rawPermalink)) return null;

    return { kind: rawKind, permalink: rawPermalink };
  } catch {
    return null;
  }
}

/**
 * Validates and parses raw import text into a structured, validated payload.
 * Accepts either JSON or Dynasty Scans URL lists.
 * Rejects any non-Dynasty URLs and malformed inputs to protect the database.
 */
export function validateAndParseImport(
  rawText: string,
  opts: {
    defaultTarget?: "followed" | "collection";
    targetCollectionName?: string;
  } = {},
): ValidatedImportPayload {
  const text = rawText.trim();
  const errors: string[] = [];

  if (!text) {
    return {
      valid: false,
      detectedFormat: "none",
      followed: [],
      collections: [],
      stats: { followedCount: 0, collectionsCount: 0, collectionItemsCount: 0, ignoredCount: 0 },
      warnings: [],
      errors: ["Input is empty."],
    };
  }

  // ── Mode 1: JSON Input ───────────────────────────────────────────────────
  if (text.startsWith("{") || text.startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(text);
      return parseJsonImport(parsed, opts);
    } catch (err) {
      errors.push(`Invalid JSON syntax: ${err instanceof Error ? err.message : String(err)}`);
      return {
        valid: false,
        detectedFormat: "json",
        followed: [],
        collections: [],
        stats: { followedCount: 0, collectionsCount: 0, collectionItemsCount: 0, ignoredCount: 0 },
        warnings: [],
        errors,
      };
    }
  }

  // ── Mode 2: URL List / Plain Text Input ──────────────────────────────────
  return parseUrlListImport(text, opts);
}

function parseJsonImport(
  data: unknown,
  opts: { defaultTarget?: "followed" | "collection"; targetCollectionName?: string },
): ValidatedImportPayload {
  const followedMap = new Map<string, ValidatedFollowedItem>();
  const collectionsMap = new Map<string, ValidatedCollection>();
  const warnings: string[] = [];
  const errors: string[] = [];
  let ignoredCount = 0;

  const getOrCreateCollection = (name: string, isDefault = false): ValidatedCollection => {
    const cleanName = decodeEntities(name).trim();
    const key = cleanName.toLowerCase();
    let col = collectionsMap.get(key);
    if (!col) {
      col = { name: cleanName, isDefault, items: [] };
      collectionsMap.set(key, col);
    }
    return col;
  };

  const addFollowed = (item: unknown): boolean => {
    if (typeof item === "string") {
      const parsedUrl = parseValidDynastyUrl(item);
      const permalink = parsedUrl ? parsedUrl.permalink : item.trim();
      if (!isValidPermalink(permalink)) {
        ignoredCount++;
        return false;
      }
      if (!followedMap.has(permalink)) {
        followedMap.set(permalink, {
          permalink,
          name: titleFromPermalink(permalink),
          latestChapterPermalink: null,
          latestChapterTitle: null,
          followedAt: Date.now(),
        });
      }
      return true;
    }

    if (typeof item === "object" && item !== null) {
      const obj = item as Record<string, unknown>;
      let permalink = typeof obj.permalink === "string" ? obj.permalink.trim() : "";
      if (!permalink && typeof obj.url === "string") {
        const parsedUrl = parseValidDynastyUrl(obj.url);
        if (parsedUrl) permalink = parsedUrl.permalink;
      }

      if (!isValidPermalink(permalink)) {
        ignoredCount++;
        return false;
      }

      const rawName = typeof obj.name === "string" ? obj.name : "";
      const name = rawName.trim() ? decodeEntities(rawName.trim()) : titleFromPermalink(permalink);
      const latestChapterPermalink = typeof obj.latestChapterPermalink === "string" ? obj.latestChapterPermalink.trim() : null;
      const latestChapterTitle = typeof obj.latestChapterTitle === "string" ? decodeEntities(obj.latestChapterTitle.trim()) : null;
      const rawCover = typeof obj.cover === "string" ? obj.cover.trim() : null;
      const followedAt = typeof obj.followedAt === "number" && Number.isFinite(obj.followedAt) ? obj.followedAt : Date.now();

      if (!followedMap.has(permalink)) {
        followedMap.set(permalink, {
          permalink,
          name,
          cover: rawCover || null,
          latestChapterPermalink: latestChapterPermalink && isValidPermalink(latestChapterPermalink) ? latestChapterPermalink : null,
          latestChapterTitle: latestChapterTitle || null,
          followedAt,
        });
      }
      return true;
    }

    ignoredCount++;
    return false;
  };

  const addCollectionItem = (col: ValidatedCollection, item: unknown): boolean => {
    if (typeof item === "string") {
      const parsedUrl = parseValidDynastyUrl(item);
      const permalink = parsedUrl ? parsedUrl.permalink : item.trim();
      if (!isValidPermalink(permalink)) {
        ignoredCount++;
        return false;
      }
      // Check if already in collection
      if (col.items.some((i) => i.permalink === permalink)) return false;
      col.items.push({
        permalink,
        title: titleFromPermalink(permalink),
        kind: parsedUrl ? parsedUrl.kind : "series",
        parentSeriesPermalink: null,
        parentSeriesName: null,
        addedAt: Date.now(),
      });
      return true;
    }

    if (typeof item === "object" && item !== null) {
      const obj = item as Record<string, unknown>;
      let permalink = typeof obj.permalink === "string" ? obj.permalink.trim() : "";
      let kind = typeof obj.kind === "string" ? obj.kind.trim() : "series";

      if (!permalink && typeof obj.url === "string") {
        const parsedUrl = parseValidDynastyUrl(obj.url);
        if (parsedUrl) {
          permalink = parsedUrl.permalink;
          kind = parsedUrl.kind;
        }
      }

      if (!isValidPermalink(permalink)) {
        ignoredCount++;
        return false;
      }

      if (col.items.some((i) => i.permalink === permalink)) return false;

      const rawTitle = typeof obj.title === "string" ? obj.title : typeof obj.name === "string" ? obj.name : "";
      const title = rawTitle.trim() ? decodeEntities(rawTitle.trim()) : titleFromPermalink(permalink);
      const parentSeriesPermalink = typeof obj.parentSeriesPermalink === "string" && isValidPermalink(obj.parentSeriesPermalink.trim())
        ? obj.parentSeriesPermalink.trim()
        : null;
      const parentSeriesName = typeof obj.parentSeriesName === "string" && obj.parentSeriesName.trim()
        ? decodeEntities(obj.parentSeriesName.trim())
        : null;
      const rawCover = typeof obj.cover === "string" ? obj.cover.trim() : null;
      const addedAt = typeof obj.addedAt === "number" && Number.isFinite(obj.addedAt) ? obj.addedAt : Date.now();

      col.items.push({
        permalink,
        title,
        kind: kind || "series",
        cover: rawCover || null,
        parentSeriesPermalink,
        parentSeriesName,
        addedAt,
      });
      return true;
    }

    ignoredCount++;
    return false;
  };

  // Case A: Array input
  if (Array.isArray(data)) {
    if (opts.defaultTarget === "collection") {
      const col = getOrCreateCollection(opts.targetCollectionName || "Imported Items");
      for (const item of data) {
        addCollectionItem(col, item);
      }
    } else {
      for (const item of data) {
        addFollowed(item);
      }
    }
  } else if (typeof data === "object" && data !== null) {
    const root = data as Record<string, unknown>;

    // Case B: Standard ExportPayload or object with followed / collections
    if (Array.isArray(root.followed)) {
      for (const item of root.followed) {
        addFollowed(item);
      }
    }

    if (Array.isArray(root.collections)) {
      for (const rawCol of root.collections) {
        if (typeof rawCol === "object" && rawCol !== null) {
          const colObj = rawCol as Record<string, unknown>;
          const colName = typeof colObj.name === "string" && colObj.name.trim() ? colObj.name.trim() : "Custom Collection";
          const isDefault = colObj.isDefault === true;
          const col = getOrCreateCollection(colName, isDefault);
          if (Array.isArray(colObj.items)) {
            for (const item of colObj.items) {
              addCollectionItem(col, item);
            }
          }
        }
      }
    }

    // Case C: Single collection object { collection: { name, items } }
    if (typeof root.collection === "object" && root.collection !== null) {
      const colObj = root.collection as Record<string, unknown>;
      const colName = typeof colObj.name === "string" && colObj.name.trim() ? colObj.name.trim() : "Imported Collection";
      const isDefault = colObj.isDefault === true;
      const col = getOrCreateCollection(colName, isDefault);
      if (Array.isArray(colObj.items)) {
        for (const item of colObj.items) {
          addCollectionItem(col, item);
        }
      }
    }
  } else {
    errors.push("JSON must be an object or array.");
  }

  const followed = Array.from(followedMap.values());
  const collections = Array.from(collectionsMap.values());
  const collectionItemsCount = collections.reduce((acc, c) => acc + c.items.length, 0);
  const valid = followed.length > 0 || collectionItemsCount > 0;

  if (!valid && errors.length === 0) {
    errors.push("No valid Dynasty Scans series or collections found in JSON.");
  }

  if (ignoredCount > 0) {
    warnings.push(`Ignored ${ignoredCount} invalid or malformed item(s).`);
  }

  return {
    valid,
    detectedFormat: "json",
    followed,
    collections,
    stats: {
      followedCount: followed.length,
      collectionsCount: collections.length,
      collectionItemsCount,
      ignoredCount,
    },
    warnings,
    errors,
  };
}

function parseUrlListImport(
  text: string,
  opts: { defaultTarget?: "followed" | "collection"; targetCollectionName?: string },
): ValidatedImportPayload {
  const lines = text.split(/\r?\n/);
  const followedMap = new Map<string, ValidatedFollowedItem>();
  const collectionsMap = new Map<string, ValidatedCollection>();
  const warnings: string[] = [];
  const errors: string[] = [];
  let ignoredCount = 0;

  let currentTarget: "followed" | "collection" = opts.defaultTarget ?? "followed";
  let activeCollectionName = opts.targetCollectionName || "Imported Items";

  const getOrCreateCollection = (name: string): ValidatedCollection => {
    const cleanName = decodeEntities(name).trim();
    const key = cleanName.toLowerCase();
    let col = collectionsMap.get(key);
    if (!col) {
      col = { name: cleanName, isDefault: false, items: [] };
      collectionsMap.set(key, col);
    }
    return col;
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i].trim();
    if (!rawLine) continue;

    // Detect section headers e.g. "=== Followed Series ===" or "# Followed"
    const sectionMatch = rawLine.match(/^(?:===|#+)\s*(.*?)\s*(?:===|#*)$/);
    if (sectionMatch) {
      const headerTitle = sectionMatch[1].trim().toLowerCase();
      if (headerTitle.includes("followed")) {
        currentTarget = "followed";
      } else {
        currentTarget = "collection";
        const cleanTitle = sectionMatch[1].replace(/\(\d+\)/g, "").trim();
        activeCollectionName = cleanTitle || "Imported Items";
      }
      continue;
    }

    // Extract URL and optional title
    // Pattern 1: Markdown link `[Title](URL)`
    // Pattern 2: Title separator URL `Title — URL` or `Title: URL`
    // Pattern 3: Bare URL `https://dynasty-scans.com/...`
    let urlStr = "";
    let parsedTitle = "";

    const mdMatch = rawLine.match(/\[([^\]]+)\]\((https?:\/\/[^\s\)]+)\)/i);
    if (mdMatch) {
      parsedTitle = mdMatch[1].trim();
      urlStr = mdMatch[2].trim();
    } else {
      const sepMatch = rawLine.match(/^(.*?)\s*(?:—|–|-|:)\s*(https?:\/\/[^\s]+)$/i);
      if (sepMatch) {
        parsedTitle = sepMatch[1].trim();
        urlStr = sepMatch[2].trim();
      } else {
        const urlOnlyMatch = rawLine.match(/(https?:\/\/[^\s]+)/i);
        if (urlOnlyMatch) {
          urlStr = urlOnlyMatch[1].trim();
        }
      }
    }

    if (!urlStr) {
      ignoredCount++;
      continue;
    }

    const parsedUrl = parseValidDynastyUrl(urlStr);
    if (!parsedUrl) {
      ignoredCount++;
      continue;
    }

    const title = parsedTitle ? decodeEntities(parsedTitle) : titleFromPermalink(parsedUrl.permalink);

    if (currentTarget === "collection") {
      const col = getOrCreateCollection(activeCollectionName);
      if (!col.items.some((it) => it.permalink === parsedUrl.permalink)) {
        col.items.push({
          permalink: parsedUrl.permalink,
          title,
          kind: parsedUrl.kind,
          parentSeriesPermalink: null,
          parentSeriesName: null,
          addedAt: Date.now(),
        });
      }
    } else {
      if (!followedMap.has(parsedUrl.permalink)) {
        followedMap.set(parsedUrl.permalink, {
          permalink: parsedUrl.permalink,
          name: title,
          latestChapterPermalink: null,
          latestChapterTitle: null,
          followedAt: Date.now(),
        });
      }
    }
  }

  const followed = Array.from(followedMap.values());
  const collections = Array.from(collectionsMap.values());
  const collectionItemsCount = collections.reduce((acc, c) => acc + c.items.length, 0);
  const valid = followed.length > 0 || collectionItemsCount > 0;

  if (!valid) {
    errors.push("No valid Dynasty Scans URLs found (URLs must begin with https://dynasty-scans.com/).");
  }

  if (ignoredCount > 0) {
    warnings.push(`Ignored ${ignoredCount} invalid line(s) (only valid dynasty-scans.com URLs are accepted).`);
  }

  return {
    valid,
    detectedFormat: valid ? "urls" : "none",
    followed,
    collections,
    stats: {
      followedCount: followed.length,
      collectionsCount: collections.length,
      collectionItemsCount,
      ignoredCount,
    },
    warnings,
    errors,
  };
}

/**
 * Executes a verified import into the SQLite database.
 * All inserts run in single batched transactions to ensure speed and prevent corruption.
 */
export async function executeImport(
  payload: ValidatedImportPayload,
  opts: ExecuteImportOptions = {},
): Promise<ImportExecutionResult> {
  if (!payload.valid) {
    throw new Error("Cannot execute import on an invalid payload.");
  }

  const targetMode = opts.targetMode ?? "auto";
  let followedImported = 0;
  let collectionsCreated = 0;
  let itemsImported = 0;

  // Mode: All items forced into Followed Series
  if (targetMode === "followed") {
    const toFollow: ValidatedFollowedItem[] = [...payload.followed];
    for (const col of payload.collections) {
      for (const item of col.items) {
        if (!toFollow.some((f) => f.permalink === item.permalink)) {
          toFollow.push({
            permalink: item.permalink,
            name: item.title,
            latestChapterPermalink: null,
            latestChapterTitle: null,
            followedAt: item.addedAt,
          });
        }
      }
    }

    followedImported = await importFollowedSeriesBatch(toFollow);
    return {
      success: true,
      followedImported,
      collectionsCreated: 0,
      itemsImported: 0,
      totalImported: followedImported,
    };
  }

  // Mode: All items forced into a specific Collection
  if (targetMode === "collection") {
    let collectionId = opts.targetCollectionId;
    if (collectionId === undefined) {
      const colName = opts.newCollectionName?.trim() || "Imported Items";
      collectionId = await getOrCreateCollectionId(colName);
      collectionsCreated++;
    }

    const toCollect: ValidatedCollectionItem[] = [];
    for (const f of payload.followed) {
      toCollect.push({
        permalink: f.permalink,
        title: f.name,
        kind: "series",
        parentSeriesPermalink: null,
        parentSeriesName: null,
        addedAt: f.followedAt,
      });
    }
    for (const col of payload.collections) {
      for (const item of col.items) {
        if (!toCollect.some((c) => c.permalink === item.permalink)) {
          toCollect.push(item);
        }
      }
    }

    itemsImported = await importItemsIntoCollectionBatch(collectionId, toCollect);
    return {
      success: true,
      followedImported: 0,
      collectionsCreated,
      itemsImported,
      totalImported: itemsImported,
    };
  }

  // Mode: Auto (followed items to followed_series, collections to collection_items)
  if (payload.followed.length > 0) {
    followedImported = await importFollowedSeriesBatch(payload.followed);
  }

  if (payload.collections.length > 0) {
    for (const col of payload.collections) {
      const colId = await getOrCreateCollectionId(col.name, col.isDefault);
      const count = await importItemsIntoCollectionBatch(colId, col.items);
      itemsImported += count;
    }
  }
  triggerBackgroundCoverHydration(payload);

  return {
    success: true,
    followedImported,
    collectionsCreated,
    itemsImported,
    totalImported: followedImported + itemsImported,
  };
}

/**
 * Batches insertion of followed series into followed_series within a single transaction.
 */
async function importFollowedSeriesBatch(items: ValidatedFollowedItem[]): Promise<number> {
  if (items.length === 0) return 0;

  // Look up cached covers in bulk for items that have no cover provided
  const missingPermalinks = items
    .filter((it) => !it.cover || (!it.cover.includes("/") && !it.cover.includes("\\")))
    .map((it) => it.permalink);

  const cachedCoverMap = new Map<string, string>();
  if (missingPermalinks.length > 0) {
    try {
      const keys = missingPermalinks.map((p) => `'cover:series:${p.replace(/'/g, "''")}'`).join(",");
      const cachedRows = await query<{ cache_key: string; json_payload: string }>(
        `SELECT cache_key, json_payload FROM cached_metadata WHERE cache_key IN (${keys})`,
      );
      for (const row of cachedRows) {
        if (row.json_payload && (row.json_payload.includes("/") || row.json_payload.includes("\\"))) {
          const permalink = row.cache_key.replace("cover:series:", "");
          cachedCoverMap.set(permalink, row.json_payload.trim());
        }
      }
    } catch {
      // ignore
    }
  }

  const sql = `INSERT INTO followed_series
    (permalink, name, cover, last_checked_at, latest_chapter_permalink, latest_chapter_title, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(permalink) DO UPDATE SET
    name = excluded.name,
    cover = COALESCE(excluded.cover, followed_series.cover),
    last_checked_at = excluded.last_checked_at,
    latest_chapter_permalink = COALESCE(excluded.latest_chapter_permalink, followed_series.latest_chapter_permalink),
    latest_chapter_title = COALESCE(excluded.latest_chapter_title, followed_series.latest_chapter_title)`;

  const statements: string[] = [];
  const batchParams: unknown[][] = [];
  const now = Date.now();

  for (const item of items) {
    const resolvedCover = (item.cover && (item.cover.includes("/") || item.cover.includes("\\")))
      ? item.cover
      : cachedCoverMap.get(item.permalink) ?? null;

    statements.push(sql);
    batchParams.push([
      item.permalink,
      item.name,
      resolvedCover,
      now,
      item.latestChapterPermalink,
      item.latestChapterTitle,
      item.followedAt || now,
    ]);
  }

  await ipc.dbExecuteBatch(DB_NAME, statements, batchParams);
  notifyFollowedChanged();
  return items.length;
}

/**
 * Batches insertion of items into a specific collection within a single transaction.
 */
async function importItemsIntoCollectionBatch(
  collectionId: number,
  items: ValidatedCollectionItem[],
): Promise<number> {
  if (items.length === 0) return 0;

  const missingPermalinks = items
    .filter((it) => !it.cover || (!it.cover.includes("/") && !it.cover.includes("\\")))
    .map((it) => it.permalink);

  const cachedCoverMap = new Map<string, string>();
  if (missingPermalinks.length > 0) {
    try {
      const keys = missingPermalinks.map((p) => `'cover:series:${p.replace(/'/g, "''")}'`).join(",");
      const cachedRows = await query<{ cache_key: string; json_payload: string }>(
        `SELECT cache_key, json_payload FROM cached_metadata WHERE cache_key IN (${keys})`,
      );
      for (const row of cachedRows) {
        if (row.json_payload && (row.json_payload.includes("/") || row.json_payload.includes("\\"))) {
          const permalink = row.cache_key.replace("cover:series:", "");
          cachedCoverMap.set(permalink, row.json_payload.trim());
        }
      }
    } catch {
      // ignore
    }
  }

  const sql = `INSERT INTO collection_items
    (collection_id, item_permalink, item_title, item_kind, cover, parent_series_permalink, parent_series_name, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(collection_id, item_permalink) DO UPDATE SET
    item_title = excluded.item_title,
    item_kind = excluded.item_kind,
    cover = COALESCE(excluded.cover, collection_items.cover),
    parent_series_permalink = COALESCE(excluded.parent_series_permalink, collection_items.parent_series_permalink),
    parent_series_name = COALESCE(excluded.parent_series_name, collection_items.parent_series_name)`;

  const statements: string[] = [];
  const batchParams: unknown[][] = [];
  const now = Date.now();

  for (const item of items) {
    const resolvedCover = (item.cover && (item.cover.includes("/") || item.cover.includes("\\")))
      ? item.cover
      : cachedCoverMap.get(item.permalink) ?? null;

    statements.push(sql);
    batchParams.push([
      collectionId,
      item.permalink,
      item.title,
      item.kind || "series",
      resolvedCover,
      item.parentSeriesPermalink,
      item.parentSeriesName,
      item.addedAt || now,
    ]);
  }

  await ipc.dbExecuteBatch(DB_NAME, statements, batchParams);
  notifyCollectionsChanged();
  return items.length;
}

/**
 * Opportunistically hydrates covers in the background after an import finishes.
 * Processes with bounded concurrency (3 at a time) to prevent network congestion.
 */
export function triggerBackgroundCoverHydration(items: {
  followed?: Array<{ permalink: string; cover?: string | null }>;
  collections?: Array<{ items: Array<{ permalink: string; kind?: string; cover?: string | null }> }>;
}): void {
  void (async () => {
    const seriesPermalinks = new Set<string>();

    if (items.followed) {
      for (const f of items.followed) {
        if (!f.cover || (!f.cover.includes("/") && !f.cover.includes("\\"))) {
          seriesPermalinks.add(f.permalink);
        }
      }
    }
    if (items.collections) {
      for (const col of items.collections) {
        for (const item of col.items) {
          const kind = (item.kind ?? "series").toLowerCase();
          if (kind === "series" || kind === "doujin" || kind === "anthology") {
            if (!item.cover || (!item.cover.includes("/") && !item.cover.includes("\\"))) {
              seriesPermalinks.add(item.permalink);
            }
          }
        }
      }
    }

    const list = Array.from(seriesPermalinks);
    if (list.length === 0) return;

    const CONCURRENCY = 3;
    let cursor = 0;

    async function worker() {
      while (cursor < list.length) {
        const permalink = list[cursor++];
        try {
          const freshPath = await getOrHydrateSeriesCover(permalink);
          if (freshPath) {
            await updateFollowedSeriesCover(permalink, freshPath, false);
            await updateCollectionItemCoverByPermalink(permalink, freshPath);
          }
        } catch {
          // ignore background failure
        }
      }
    }

    const workers = Array.from({ length: Math.min(CONCURRENCY, list.length) }, () => worker());
    await Promise.all(workers);
  })();
}

/**
 * Finds an existing collection ID by name (case-insensitive) or creates a new one.
 */
async function getOrCreateCollectionId(name: string, isDefault = false): Promise<number> {
  const cleanName = name.trim();
  const rows = await query<{ id: number }>(
    `SELECT id FROM collections WHERE name = ? COLLATE NOCASE`,
    [cleanName],
  );
  if (rows.length > 0) {
    return rows[0].id;
  }

  const now = Date.now();
  await execute(
    `INSERT INTO collections (name, is_default, created_at) VALUES (?, ?, ?)`,
    [cleanName, isDefault ? 1 : 0, now],
  );

  const created = await query<{ id: number }>(
    `SELECT id FROM collections WHERE name = ? COLLATE NOCASE`,
    [cleanName],
  );
  if (created.length === 0) {
    throw new Error(`Failed to create collection "${cleanName}".`);
  }
  notifyCollectionsChanged();
  return created[0].id;
}
