import { query } from "./client";
import { dynastyUrl } from "../utils/formatting";
import { seriesTypeToPath } from "../taxonomy";
import { decodeEntities } from "../utils/html";

export type ExportScope = "all" | "followed" | "collections" | "collection";
export type ExportFormat = "json-pretty" | "json-compact" | "text" | "markdown" | "urls";

export interface ExportFollowedItem {
  name: string;
  permalink: string;
  url: string;
  cover?: string | null;
  followedAt: number;
  latestChapterTitle: string | null;
  latestChapterPermalink: string | null;
}

export interface ExportCollectionItem {
  title: string;
  permalink: string;
  kind: string;
  url: string;
  cover?: string | null;
  parentSeriesName: string | null;
  parentSeriesPermalink: string | null;
  addedAt: number;
}

export interface ExportCollection {
  id: number;
  name: string;
  isDefault: boolean;
  createdAt: number;
  itemCount: number;
  items: ExportCollectionItem[];
}

export interface ExportPayload {
  version: 1;
  generator: "DynastyReader";
  exportedAt: string;
  scope: ExportScope;
  counts: {
    followed: number;
    collections: number;
    collectionItems: number;
  };
  followed?: ExportFollowedItem[];
  collections?: ExportCollection[];
}

export interface ExportCounts {
  followed: number;
  collections: number;
  collectionItems: number;
}

/**
 * Resolves the plural URL path segment for an item kind.
 * One-shots and chapters belong under /chapters/ on Dynasty Scans;
 * series-like entities (series, doujins, anthologies) use their taxonomy paths.
 */
export function itemKindToPath(kind: string): string {
  const k = (kind ?? "").toLowerCase().trim();
  if (k === "chapter" || k === "oneshot") {
    return "chapters";
  }
  return seriesTypeToPath(k);
}

/**
 * Retrieves all followed series sorted by name.
 * Executes in a single fast query.
 */
export async function getAllFollowedSeries(): Promise<ExportFollowedItem[]> {
  interface FollowedDbRow {
    permalink: string;
    name: string;
    cover: string | null;
    latest_chapter_permalink: string | null;
    latest_chapter_title: string | null;
    created_at: number;
  }

  const rows = await query<FollowedDbRow>(
    `SELECT permalink, name, cover, latest_chapter_permalink, latest_chapter_title, created_at
     FROM followed_series
     ORDER BY name COLLATE NOCASE ASC`,
  );

  return rows.map((r) => ({
    name: decodeEntities(r.name),
    permalink: r.permalink,
    url: dynastyUrl("series", r.permalink),
    cover: r.cover ?? null,
    followedAt: Number(r.created_at),
    latestChapterTitle: r.latest_chapter_title ? decodeEntities(r.latest_chapter_title) : null,
    latestChapterPermalink: r.latest_chapter_permalink ?? null,
  }));
}

/**
 * Retrieves all collections (or a single collection if collectionId is provided)
 * along with all their items.
 * Uses two fast queries without N+1 loops.
 */
export async function getAllCollections(collectionId?: number): Promise<ExportCollection[]> {
  interface CollectionDbRow {
    id: number;
    name: string;
    is_default: number;
    created_at: number;
  }

  interface CollectionItemDbRow {
    id: number;
    collection_id: number;
    item_permalink: string;
    item_title: string;
    item_kind: string;
    cover: string | null;
    parent_series_permalink: string | null;
    parent_series_name: string | null;
    created_at: number;
  }

  const colQuery = collectionId !== undefined
    ? `SELECT id, name, is_default, created_at FROM collections WHERE id = ?`
    : `SELECT id, name, is_default, created_at FROM collections ORDER BY is_default DESC, name COLLATE NOCASE ASC`;
  const colParams = collectionId !== undefined ? [collectionId] : [];

  const itemQuery = collectionId !== undefined
    ? `SELECT id, collection_id, item_permalink, item_title, item_kind, cover,
              parent_series_permalink, parent_series_name, created_at
       FROM collection_items
       WHERE collection_id = ?
       ORDER BY created_at DESC`
    : `SELECT id, collection_id, item_permalink, item_title, item_kind, cover,
              parent_series_permalink, parent_series_name, created_at
       FROM collection_items
       ORDER BY created_at DESC`;
  const itemParams = collectionId !== undefined ? [collectionId] : [];

  const [cols, items] = await Promise.all([
    query<CollectionDbRow>(colQuery, colParams),
    query<CollectionItemDbRow>(itemQuery, itemParams),
  ]);

  // Group items by collection_id in O(N)
  const itemsByCol = new Map<number, ExportCollectionItem[]>();
  for (const item of items) {
    let list = itemsByCol.get(item.collection_id);
    if (!list) {
      list = [];
      itemsByCol.set(item.collection_id, list);
    }
    const path = itemKindToPath(item.item_kind);
    list.push({
      title: decodeEntities(item.item_title),
      permalink: item.item_permalink,
      kind: item.item_kind,
      url: dynastyUrl(path, item.item_permalink),
      cover: item.cover ?? null,
      parentSeriesName: item.parent_series_name ? decodeEntities(item.parent_series_name) : null,
      parentSeriesPermalink: item.parent_series_permalink ?? null,
      addedAt: Number(item.created_at),
    });
  }

  return cols.map((col) => {
    const colItems = itemsByCol.get(col.id) ?? [];
    return {
      id: col.id,
      name: decodeEntities(col.name),
      isDefault: col.is_default === 1,
      createdAt: Number(col.created_at),
      itemCount: colItems.length,
      items: colItems,
    };
  });
}

/**
 * Fetches the raw data required for the given export scope.
 */
export async function fetchExportData(
  scope: ExportScope,
  collectionId?: number,
): Promise<{
  followed?: ExportFollowedItem[];
  collections?: ExportCollection[];
  counts: ExportCounts;
}> {
  let followed: ExportFollowedItem[] | undefined;
  let collections: ExportCollection[] | undefined;

  if (scope === "all" || scope === "followed") {
    followed = await getAllFollowedSeries();
  }

  if (scope === "all" || scope === "collections" || scope === "collection") {
    collections = await getAllCollections(scope === "collection" ? collectionId : undefined);
  }

  const followedCount = followed ? followed.length : 0;
  const collectionsCount = collections ? collections.length : 0;
  const collectionItemsCount = collections
    ? collections.reduce((acc, c) => acc + c.items.length, 0)
    : 0;

  return {
    followed,
    collections,
    counts: {
      followed: followedCount,
      collections: collectionsCount,
      collectionItems: collectionItemsCount,
    },
  };
}

/**
 * Formats structured export data into copiable text.
 */
export function formatExportData(
  data: {
    scope: ExportScope;
    followed?: ExportFollowedItem[];
    collections?: ExportCollection[];
    counts: ExportCounts;
  },
  format: ExportFormat,
): string {
  const { scope, followed, collections, counts } = data;

  if (format === "json-pretty" || format === "json-compact") {
    const payload: ExportPayload = {
      version: 1,
      generator: "DynastyReader",
      exportedAt: new Date().toISOString(),
      scope,
      counts,
    };
    if (followed !== undefined) payload.followed = followed;
    if (collections !== undefined) payload.collections = collections;

    return format === "json-pretty"
      ? JSON.stringify(payload, null, 2)
      : JSON.stringify(payload);
  }

  if (format === "urls") {
    const urls: string[] = [];
    if (followed) {
      for (const f of followed) {
        urls.push(f.url);
      }
    }
    if (collections) {
      for (const col of collections) {
        for (const item of col.items) {
          urls.push(item.url);
        }
      }
    }
    // Remove duplicate consecutive URLs while preserving order
    return Array.from(new Set(urls)).join("\n");
  }

  if (format === "markdown") {
    const lines: string[] = [];

    if (followed && followed.length > 0) {
      lines.push(`# Followed Series (${followed.length})`);
      lines.push("");
      for (const f of followed) {
        lines.push(`- [${f.name}](${f.url})`);
      }
      lines.push("");
    } else if (scope === "followed") {
      lines.push("# Followed Series (0)");
      lines.push("");
      lines.push("*(No followed series)*");
      lines.push("");
    }

    if (collections && collections.length > 0) {
      if (scope === "all") {
        lines.push(`# Collections (${collections.length})`);
        lines.push("");
      }
      for (const col of collections) {
        const heading = scope === "all" ? "##" : "#";
        lines.push(`${heading} ${col.name} (${col.items.length})`);
        lines.push("");
        if (col.items.length === 0) {
          lines.push("*(Empty collection)*");
        } else {
          for (const item of col.items) {
            const extra = item.parentSeriesName ? ` *(${item.parentSeriesName})*` : "";
            lines.push(`- [${item.title}](${item.url})${extra}`);
          }
        }
        lines.push("");
      }
    } else if (scope === "collections" || scope === "collection") {
      lines.push("# Collections (0)");
      lines.push("");
      lines.push("*(No collections found)*");
      lines.push("");
    }

    return lines.join("\n").trimEnd();
  }

  // Plain text format
  const lines: string[] = [];

  if (followed && followed.length > 0) {
    if (scope === "all") {
      lines.push(`=== Followed Series (${followed.length}) ===`);
    }
    for (const f of followed) {
      lines.push(`${f.name} — ${f.url}`);
    }
    if (scope === "all") {
      lines.push("");
    }
  } else if (scope === "followed") {
    lines.push("(No followed series)");
  }

  if (collections && collections.length > 0) {
    for (const col of collections) {
      lines.push(`=== ${col.name} (${col.items.length}) ===`);
      if (col.items.length === 0) {
        lines.push("(Empty collection)");
      } else {
        for (const item of col.items) {
          const extra = item.parentSeriesName ? ` [${item.parentSeriesName}]` : "";
          lines.push(`${item.title}${extra} — ${item.url}`);
        }
      }
      lines.push("");
    }
  } else if (scope === "collections" || scope === "collection") {
    lines.push("(No collections found)");
  }

  return lines.join("\n").trimEnd();
}

/**
 * High-level helper to fetch and format export data in one call.
 */
export async function fetchAndFormatExport(opts: {
  scope: ExportScope;
  collectionId?: number;
  format: ExportFormat;
}): Promise<{
  text: string;
  counts: ExportCounts;
}> {
  const data = await fetchExportData(opts.scope, opts.collectionId);
  const text = formatExportData(
    {
      scope: opts.scope,
      followed: data.followed,
      collections: data.collections,
      counts: data.counts,
    },
    opts.format,
  );
  return { text, counts: data.counts };
}
