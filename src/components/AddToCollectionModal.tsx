/**
 * "Add to..." Pseudo Dropdown Modal for DynastyReader: positions as a clean
 * floating dropdown directly adjacent to the trigger button with a transparent
 * overlay (no dark/opaque background) and UI-scale / zoom compensation.
 * Port of `add-to-collection-modal.ts`.
 */

import { createEffect, createSignal, For, Show } from "solid-js";
import { Portal } from "solid-js/web";
import { makeEventListener } from "@solid-primitives/event-listener";
import {
  FolderIcon,
  CloseIcon,
  StarIcon,
  AddIcon,
  Icon,
} from "./Icon";
import {
  getCollections,
  createCollection,
  getItemCollectionIds,
  toggleItemInCollection,
  type CollectionItemKind,
} from "../db";
import { showBanner, uiScale } from "../stores";

export interface AddToCollectionItem {
  permalink: string;
  title: string;
  kind?: CollectionItemKind;
  cover?: string | null;
  parentSeriesPermalink?: string | null;
  parentSeriesName?: string | null;
}

export interface AddToCollectionModalProps {
  open: boolean;
  item: AddToCollectionItem;
  anchorEl?: HTMLElement | null;
  onClose: () => void;
}

interface CollectionRow {
  id: number;
  name: string;
  is_default: number;
  itemCount?: number;
  active: boolean;
}

export function AddToCollectionModal(props: AddToCollectionModalProps) {
  const [rows, setRows] = createSignal<CollectionRow[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [loadError, setLoadError] = createSignal(false);
  const [newName, setNewName] = createSignal("");
  const [creating, setCreating] = createSignal(false);
  const [positionStyle, setPositionStyle] = createSignal(
    "top:20%;left:50%;transform:translateX(-50%);",
  );

  createEffect(() => {
    if (!props.open) return;

    const onKeyDown = (ev: KeyboardEvent): void => {
      if (ev.key === "Escape") {
        ev.preventDefault();
        props.onClose();
      }
    };

    const onScroll = (): void => {
      props.onClose();
    };

    makeEventListener(window, "keydown", onKeyDown);
    makeEventListener(window, "scroll", onScroll, { capture: true, once: true, passive: true });
  });

  createEffect(() => {
    if (props.open) {
      setLoading(true);
      void loadRows();
    }
  });

  createEffect(() => {
    if (!props.open) return;
    const scale = uiScale() || 1;
    const baseStyle = `position:fixed;width:290px;max-width:94vw;background:var(--sys-window-bg,#fff);border:1px solid var(--sys-border-dark,#999);border-radius:3px;box-shadow:0 4px 16px rgba(0,0,0,0.22);display:flex;flex-direction:column;overflow:hidden;font-size:12px;color:var(--sys-window-text,#222);z-index:10001;zoom:${scale};`;

    const anchor = props.anchorEl;
    if (!anchor) {
      setPositionStyle(`${baseStyle}top:20%;left:50%;transform:translateX(-50%);`);
      return;
    }

    const rect = anchor.getBoundingClientRect();
    const width = 290;
    const estHeight = 260;
    const screenBottom = rect.bottom / scale;
    const screenTop = rect.top / scale;
    const screenLeft = rect.left / scale;
    const screenRight = rect.right / scale;
    const vpWidth = window.innerWidth / scale;
    const vpHeight = window.innerHeight / scale;

    let left = screenLeft;
    if (left + width > vpWidth - 8) {
      left = Math.max(8, screenRight - width);
    }

    let vertical = "";
    if (screenBottom + estHeight > vpHeight - 8 && screenTop > 100) {
      vertical = `bottom:${Math.max(4, Math.round(vpHeight - screenTop + 4))}px;`;
    } else {
      vertical = `top:${Math.max(4, Math.round(screenBottom + 4))}px;`;
    }

    setPositionStyle(
      `${baseStyle}${vertical}left:${Math.max(4, Math.round(left))}px;`,
    );
  });

  const loadRows = async (): Promise<void> => {
    try {
      const [collections, activeIds] = await Promise.all([
        getCollections(),
        getItemCollectionIds(props.item.permalink),
      ]);
      setRows(
        collections.map((col) => ({
          id: col.id,
          name: col.name,
          is_default: col.is_default,
          itemCount: col.itemCount,
          active: activeIds.includes(col.id),
        })),
      );
      setLoadError(false);
    } catch (err) {
      console.error("dynasty-scans-reader: failed to load collections:", err);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  const toggle = async (col: CollectionRow): Promise<void> => {
    try {
      const added = await toggleItemInCollection(col.id, {
        item_permalink: props.item.permalink,
        item_title: props.item.title,
        item_kind: props.item.kind || "series",
        cover: props.item.cover,
        parent_series_permalink: props.item.parentSeriesPermalink,
        parent_series_name: props.item.parentSeriesName,
      });
      showBanner(added ? `Added to "${col.name}".` : `Removed from "${col.name}".`);
      await loadRows();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      showBanner(`Collection update failed: ${msg}`);
    }
  };

  const handleCreate = async (): Promise<void> => {
    const val = newName().trim();
    if (!val || creating()) return;
    setCreating(true);
    try {
      const created = await createCollection(val);
      await toggleItemInCollection(created.id, {
        item_permalink: props.item.permalink,
        item_title: props.item.title,
        item_kind: props.item.kind || "series",
        cover: props.item.cover,
        parent_series_permalink: props.item.parentSeriesPermalink,
        parent_series_name: props.item.parentSeriesName,
      });
      setNewName("");
      showBanner(`Created collection "${created.name}" and added item.`);
      await loadRows();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      showBanner(`Could not create collection: ${msg}`);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Show when={props.open}>
      <Portal mount={document.body}>
        <div
          id="ds-add-to-collection-overlay"
          style="position:fixed;inset:0;background:transparent;z-index:10000;pointer-events:auto;"
          onClick={(ev) => {
            if (ev.target === ev.currentTarget) props.onClose();
          }}
        >
          <div class="ds-add-to-collection-dropdown" style={positionStyle()}>
            <div style="display:flex;align-items:center;justify-content:space-between;padding:4px 8px;background:var(--sys-control-bg,#f0f0f0);border-bottom:1px solid var(--sys-border-light,#ddd);font-weight:600;font-size:11px;">
              <span style="display:flex;align-items:center;gap:5px;">
                <FolderIcon color="var(--sys-primary,#0078d4)" /> Add to Collection
              </span>
              <button type="button" class="win-button ds-dropdown-close" style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;padding:0;font-size:9px;line-height:1;min-width:18px;box-sizing:border-box;" title="Close" onClick={props.onClose}>
                <CloseIcon style={{ display: "inline-flex", "align-items": "center", "justify-content": "center", "line-height": 1 }} />
              </button>
            </div>
            <div style="padding:4px 8px;border-bottom:1px solid var(--sys-border-light,#eee);background:var(--sys-window-bg,#fafafa);">
              <div class="ds-truncate" style="font-weight:600;font-size:11px;color:var(--sys-window-text,#111);" title={props.item.title}>
                {props.item.title}
              </div>
            </div>
            <div id="ds-add-to-col-list" style="max-height:180px;overflow-y:auto;padding:3px 4px;display:flex;flex-direction:column;gap:1px;">
              <Show when={loading()} fallback={null}>
                <span class="ds-muted" style="font-size:10px;padding:6px;text-align:center;">Loading collections…</span>
              </Show>
              <Show when={loadError()}>
                <span class="ds-muted" style="color:var(--ds-danger-text);padding:6px;font-size:10px;">Failed to load collections.</span>
              </Show>
              <For each={rows()}>
                {(col) => (
                  <div
                    class={`ds-item${col.active ? " active" : ""}`}
                    role="checkbox"
                    tabIndex={0}
                    aria-checked={col.active}
                    style="display:flex;align-items:center;justify-content:space-between;padding:3px 6px;border-radius:2px;cursor:pointer;user-select:none;"
                    onClick={() => void toggle(col)}
                    onKeyDown={(ev) => {
                      if (ev.key === "Enter" || ev.key === " ") {
                        ev.preventDefault();
                        void toggle(col);
                      }
                    }}
                  >
                    <div style="display:flex;align-items:center;gap:6px;min-width:0;flex:1;">
                      <Icon
                        name={col.active ? "check-circle-fill" : "circle"}
                        style={{
                          color: col.active ? "var(--sys-primary,#0078d4)" : "var(--sys-text-muted,#888)",
                          "font-size": "12px",
                          "flex-shrink": "0",
                        }}
                      />
                      <span class="ds-truncate" style={col.is_default ? "font-weight:600;font-size:11px;" : "font-size:11px;"}>
                        <Show when={col.is_default}>
                          <StarIcon filled={true} style={{ color: "#d97706", "font-size": "10px", "margin-right": "2px" }} />
                        </Show>
                        {col.name}
                      </span>
                    </div>
                    <span class="ds-muted" style="font-size:10px;">{col.itemCount ?? 0}</span>
                  </div>
                )}
              </For>
            </div>
            <div style="padding:5px 6px;border-top:1px solid var(--sys-border-light,#ddd);background:var(--sys-control-bg,#f9f9f9);display:flex;gap:3px;">
              <div class="input-wrapper" classList={{ "has-value": Boolean(newName().trim()) }} style="flex:1;">
                <input
                  type="text"
                  id="ds-add-to-col-new-input"
                  class="input-field has-clear"
                  placeholder="New collection..."
                  style="width:100%;box-sizing:border-box;font-size:10px;height:20px;"
                  value={newName()}
                  onInput={(ev) => setNewName((ev.target as HTMLInputElement).value)}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter") void handleCreate();
                  }}
                />
                <button type="button" class="input-clear-btn" tabIndex={-1} title="Clear" onClick={() => setNewName("")}>
                  <CloseIcon />
                </button>
              </div>
              <button
                type="button"
                class="win-button"
                id="ds-add-to-col-create-btn"
                style="display:inline-flex;align-items:center;justify-content:center;gap:3px;font-size:10px;padding:0 6px;height:20px;box-sizing:border-box;flex-shrink:0;"
                disabled={creating()}
                onClick={() => void handleCreate()}
              >
                <AddIcon style={{ display: "inline-flex", "align-items": "center", "justify-content": "center", "line-height": 1, "font-size": "10px" }} /> <span>Create</span>
              </button>
            </div>
          </div>
        </div>
      </Portal>
    </Show>
  );
}