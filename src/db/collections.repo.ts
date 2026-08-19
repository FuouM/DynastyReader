import { query, execute } from "./client";
import type { CollectionRow, CollectionItemRow, CollectionItemKind } from "../types/db";

/**
 * Returns all collections sorted with Favorites (is_default = 1) first, then alphabetical.
 * Includes total item count per collection.
 */
export async function getCollections(): Promise<CollectionRow[]> {
  const rows = await query<CollectionRow>(
    `SELECT c.id, c.name, c.is_default, c.created_at, COUNT(ci.id) as itemCount
     FROM collections c
     LEFT JOIN collection_items ci ON c.id = ci.collection_id
     GROUP BY c.id
     ORDER BY c.is_default DESC, c.name COLLATE NOCASE ASC`,
    [],
  );
  return rows;
}

/**
 * Retrieves a single collection by ID.
 */
export async function getCollectionById(id: number): Promise<CollectionRow | null> {
  const rows = await query<CollectionRow>(
    `SELECT c.id, c.name, c.is_default, c.created_at, COUNT(ci.id) as itemCount
     FROM collections c
     LEFT JOIN collection_items ci ON c.id = ci.collection_id
     WHERE c.id = ?
     GROUP BY c.id`,
    [id],
  );
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Creates a new custom collection. Throws if name already exists.
 */
export async function createCollection(name: string): Promise<CollectionRow> {
  const cleanName = name.trim();
  if (!cleanName) {
    throw new Error("Collection name cannot be empty.");
  }
  const now = Date.now();
  await execute(
    "INSERT INTO collections (name, is_default, created_at) VALUES (?, 0, ?)",
    [cleanName, now],
  );
  const rows = await query<CollectionRow>(
    "SELECT id, name, is_default, created_at FROM collections WHERE name = ? COLLATE NOCASE",
    [cleanName],
  );
  if (rows.length === 0) {
    throw new Error("Failed to create collection.");
  }
  return { ...rows[0], itemCount: 0 };
}

/**
 * Renames a custom collection. Default collections cannot be renamed.
 */
export async function renameCollection(id: number, newName: string): Promise<void> {
  const cleanName = newName.trim();
  if (!cleanName) {
    throw new Error("Collection name cannot be empty.");
  }
  const existing = await getCollectionById(id);
  if (!existing) {
    throw new Error("Collection not found.");
  }
  if (existing.is_default) {
    throw new Error("The default Favorites collection cannot be renamed.");
  }
  await execute("UPDATE collections SET name = ? WHERE id = ?", [cleanName, id]);
}

/**
 * Deletes a custom collection and all its item associations.
 * Default collections cannot be deleted.
 */
export async function deleteCollection(id: number): Promise<void> {
  const existing = await getCollectionById(id);
  if (!existing) return;
  if (existing.is_default) {
    throw new Error("The default Favorites collection cannot be deleted.");
  }
  await execute("DELETE FROM collections WHERE id = ?", [id]);
}

/**
 * Returns all items belonging to a collection, ordered by most recently added.
 */
export async function getCollectionItems(collectionId: number): Promise<CollectionItemRow[]> {
  return query<CollectionItemRow>(
    `SELECT id, collection_id, item_permalink, item_title, item_kind, cover,
            parent_series_permalink, parent_series_name, created_at
     FROM collection_items
     WHERE collection_id = ?
     ORDER BY created_at DESC`,
    [collectionId],
  );
}

export async function updateCollectionItemCover(
  id: number,
  coverPath: string,
): Promise<void> {
  await execute("UPDATE collection_items SET cover = ? WHERE id = ?", [coverPath, id]);
}

/**
 * Adds an item to a collection.
 */
export async function addItemToCollection(
  collectionId: number,
  item: {
    item_permalink: string;
    item_title: string;
    item_kind?: CollectionItemKind;
    cover?: string | null;
    parent_series_permalink?: string | null;
    parent_series_name?: string | null;
  },
): Promise<void> {
  const now = Date.now();
  let resolvedCover = item.cover || null;

  // If cover is a coverKey (e.g. series:xxx or chapter:xxx), check if actual path is cached
  if (resolvedCover && !resolvedCover.includes("/") && !resolvedCover.includes("\\")) {
    try {
      const rows = await query<{ json_payload: string }>(
        "SELECT json_payload FROM cached_metadata WHERE cache_key = ?",
        [`cover:${resolvedCover}`],
      );
      if (rows.length > 0 && rows[0].json_payload) {
        resolvedCover = rows[0].json_payload;
      } else {
        resolvedCover = null;
      }
    } catch {
      resolvedCover = null;
    }
  }

  await execute(
    `INSERT INTO collection_items
     (collection_id, item_permalink, item_title, item_kind, cover, parent_series_permalink, parent_series_name, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(collection_id, item_permalink) DO UPDATE SET
       item_title = excluded.item_title,
       item_kind = excluded.item_kind,
       cover = excluded.cover,
       parent_series_permalink = excluded.parent_series_permalink,
       parent_series_name = excluded.parent_series_name,
       created_at = excluded.created_at`,
    [
      collectionId,
      item.item_permalink.trim(),
      item.item_title.trim(),
      item.item_kind || "series",
      resolvedCover,
      item.parent_series_permalink || null,
      item.parent_series_name || null,
      now,
    ],
  );
}

/**
 * Removes an item from a collection.
 */
export async function removeItemFromCollection(
  collectionId: number,
  itemPermalink: string,
): Promise<void> {
  await execute(
    "DELETE FROM collection_items WHERE collection_id = ? AND item_permalink = ?",
    [collectionId, itemPermalink.trim()],
  );
}

/**
 * Returns the array of collection IDs that contain a given item.
 */
export async function getItemCollectionIds(itemPermalink: string): Promise<number[]> {
  const rows = await query<{ collection_id: number }>(
    "SELECT collection_id FROM collection_items WHERE item_permalink = ?",
    [itemPermalink.trim()],
  );
  return rows.map((r) => r.collection_id);
}

/**
 * Toggles an item in a collection: removes if present, adds if missing.
 * Returns true if added, false if removed.
 */
export async function toggleItemInCollection(
  collectionId: number,
  item: {
    item_permalink: string;
    item_title: string;
    item_kind?: CollectionItemKind;
    cover?: string | null;
    parent_series_permalink?: string | null;
    parent_series_name?: string | null;
  },
): Promise<boolean> {
  const ids = await getItemCollectionIds(item.item_permalink);
  if (ids.includes(collectionId)) {
    await removeItemFromCollection(collectionId, item.item_permalink);
    return false;
  } else {
    await addItemToCollection(collectionId, item);
    return true;
  }
}
