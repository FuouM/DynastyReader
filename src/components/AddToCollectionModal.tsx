/**
 * "Add to..." Pseudo Dropdown Modal for DynastyReader: positions as a clean
 * floating dropdown directly adjacent to the trigger button with a transparent
 * overlay (no dark/opaque background) and UI-scale / zoom compensation.
 * Port of `add-to-collection-modal.ts`.
 */

import { createEffect, createSignal, For, Show } from "solid-js";
import { Portal } from "solid-js/web";
import { makeEventListener } from "@solid-primitives/event-listener";
import { t } from "../i18n";
import { errorMessage } from "../utils/errors";
import { FolderIcon,
  CloseIcon,
  StarIcon,
  AddIcon,
  Icon,
} from "./Icon";
import { Button, IconText } from "./Button";
import { InputField } from "./InputField";
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
  let dropdownRef: HTMLDivElement | undefined;
  createEffect(() => {
    if (!props.open) return;

    const onKeyDown = (ev: KeyboardEvent): void => {
      if (ev.key === "Escape") {
        ev.preventDefault();
        props.onClose();
      }
    };

    const onScroll = (ev: Event): void => {
      const target = ev.target as Node | null;
      if (target && dropdownRef && dropdownRef.contains(target)) {
        return;
      }
      props.onClose();
    };

    makeEventListener(window, "keydown", onKeyDown);
    makeEventListener(window, "scroll", onScroll, { capture: true, passive: true });
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
    const baseStyle = `width:290px;max-width:94vw;zoom:${scale};`;

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
      console.error("[dynasty-reader] failed to load collections:", err);
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
      showBanner(added ? t("dialogs.addToCollection.addedToBanner", { collection: col.name }) : t("dialogs.addToCollection.removedFromBanner", { collection: col.name }));
      await loadRows();
    } catch (err) {
      const msg = errorMessage(err);
      showBanner(t("dialogs.addToCollection.updateError", { msg }));
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
      showBanner(t("dialogs.addToCollection.createdAndAddedBanner", { name: created.name }));
      await loadRows();
    } catch (err) {
      const msg = errorMessage(err);
      showBanner(t("dialogs.addToCollection.createError", { msg }));
    } finally {
      setCreating(false);
    }
  };

  return (
    <Show when={props.open}>
      <Portal mount={document.getElementById("ds-root") ?? document.body}>
        <div
          id="ds-add-to-collection-overlay"
          class="ds-overlay"
          onClick={(ev) => {
            if (ev.target === ev.currentTarget) props.onClose();
          }}
        >
          <div ref={dropdownRef} class="ds-popup-card ds-add-to-collection-dropdown" style={positionStyle()}>
            <div class="ds-dropdown-header">
              <IconText icon={<FolderIcon color="var(--sys-primary,#0078d4)" />}>
                {t("dialogs.addToCollection.title")}
              </IconText>
              <Button className="ds-btn-icon" icon={<CloseIcon />} title={t("common.close")} onClick={props.onClose} />
            </div>
            <div class="ds-add-col-header">
              <div class="ds-truncate ds-add-col-title" title={props.item.title}>
                {props.item.title}
              </div>
            </div>
            <div id="ds-add-to-col-list" class="ds-add-col-list">
              <Show when={loading()} fallback={null}>
                <span class="ds-muted ds-add-col-status">{t("dialogs.addToCollection.loading")}</span>
              </Show>
              <Show when={loadError()}>
                <span class="ds-muted ds-add-col-status--error">{t("dialogs.addToCollection.loadError")}</span>
              </Show>
              <For each={rows()}>
                {(col) => (
                  <div
                    class={`ds-item ds-add-col-row${col.active ? " active" : ""}`}
                    role="checkbox"
                    tabIndex={0}
                    aria-checked={col.active}
                    onClick={() => void toggle(col)}
                    onKeyDown={(ev) => {
                      if (ev.key === "Enter" || ev.key === " ") {
                        ev.preventDefault();
                        void toggle(col);
                      }
                    }}
                  >
                    <div class="ds-add-col-row-main">
                      <Icon
                        name={col.active ? "check-circle-fill" : "circle"}
                        class={col.active ? "ds-add-col-icon--active" : "ds-add-col-icon--inactive"}
                      />
                      <span class={`ds-truncate ds-text-11${col.is_default ? " ds-font-600" : ""}`}>
                        <Show when={col.is_default}>
                          <StarIcon filled={true} class="ds-add-col-star" />
                        </Show>
                        {col.name}
                      </span>
                    </div>
                    <span class="ds-muted ds-text-10">{col.itemCount ?? 0}</span>
                  </div>
                )}
              </For>
            </div>
            <div class="ds-add-col-footer">
              <InputField
                id="ds-add-to-col-new-input"
                placeholder={t("dialogs.addToCollection.createPrompt")}
                wrapperClass="ds-flex-1"
                value={newName()}
                onInput={(val) => setNewName(val)}
                onEnter={() => void handleCreate()}
              />
              <Button
                className="ds-btn-sm"
                id="ds-add-to-col-create-btn"
                disabled={creating()}
                icon={<AddIcon class="ds-add-col-create-icon" />}
                text={t("common.create")}
                onClick={() => void handleCreate()}
              />
            </div>
          </div>
        </div>
      </Portal>
    </Show>
  );
}