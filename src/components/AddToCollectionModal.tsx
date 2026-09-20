/**
 * "Add to..." Pseudo Dropdown Modal for DynastyReader: positions as a clean
 * floating dropdown directly adjacent to the trigger button with a transparent
 * overlay (no dark/opaque background) and UI-scale / zoom compensation.
 * Port of `add-to-collection-modal.ts`.
 */

import { createEffect, createSignal, For, Show } from "solid-js";
import { t } from "../i18n";
import { errorMessage } from "../utils/formatting";
import { AnchoredPopover } from "./AnchoredPopover";
import { FolderIcon,
  CloseIcon,
  StarIcon,
  AddIcon,
  Icon,
} from "./Icon";
import { Button, IconText } from "./Button";
import { InputField } from "./InputField";
import { getCollections, createCollection, getItemCollectionIds, toggleItemInCollection } from "../db/collections.repo";
import type { CollectionItemKind } from "../types/db";
import { showBanner } from "../stores/topbar";
import { log } from "../utils/log";

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
  createEffect(() => {
    if (props.open) {
      setLoading(true);
      void loadRows();
    }
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
      log.error("add-to-collection", "failed to load collections:", err);
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
    <AnchoredPopover
      open={props.open}
      anchorEl={props.anchorEl}
      onClose={props.onClose}
      width={290}
      maxWidth="94vw"
      overlayId="ds-add-to-collection-overlay"
      popoverClass="ds-popup-card ds-add-to-collection-dropdown"
    >
      <div class="ds-dropdown-header">
        <IconText icon={<FolderIcon color="var(--sys-link,#0078d4)" />}>
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
    </AnchoredPopover>
  );
}