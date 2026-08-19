/**
 * "Add to..." Pseudo Dropdown Modal for DynastyReader:
 * Positions as a clean floating dropdown directly adjacent to the trigger button
 * with a transparent overlay (no dark/opaque background) and UI-scale / zoom compensation.
 */

import { safeHtml, setBanner } from "../state";
import {
  getCollections,
  createCollection,
  getItemCollectionIds,
  toggleItemInCollection,
  CollectionItemKind,
} from "../db";
import { getSavedUiScale } from "../ui-scale";

export interface AddToCollectionItem {
  permalink: string;
  title: string;
  kind?: CollectionItemKind;
  cover?: string | null;
  parentSeriesPermalink?: string | null;
  parentSeriesName?: string | null;
}

export async function openAddToCollectionModal(
  item: AddToCollectionItem,
  anchorEl?: HTMLElement,
): Promise<void> {
  const existing = document.getElementById("ds-add-to-collection-overlay");
  if (existing) existing.remove();

  const root = document.getElementById("ds-root") || document.body;
  const scale = (root && root.id === "ds-root" ? getSavedUiScale() : 1.0) || 1.0;

  // Transparent, non-opaque backdrop to capture outside clicks
  const overlay = document.createElement("div");
  overlay.id = "ds-add-to-collection-overlay";
  overlay.style.cssText =
    "position:fixed;inset:0;background:transparent;z-index:10000;pointer-events:auto;";

  const dropdown = document.createElement("div");
  dropdown.className = "ds-add-to-collection-dropdown";
  dropdown.style.cssText =
    "position:fixed;width:290px;max-width:94vw;background:var(--sys-window-bg,#fff);border:1px solid var(--sys-border-dark,#999);border-radius:3px;box-shadow:0 4px 16px rgba(0,0,0,0.22);display:flex;flex-direction:column;overflow:hidden;font-size:12px;color:var(--sys-window-text,#222);z-index:10001;";

  // Calculate anchored dropdown positioning with zoom scale compensation
  if (anchorEl) {
    const rect = anchorEl.getBoundingClientRect();
    const width = 290;
    const estHeight = 260;

    const screenBottom = rect.bottom / scale;
    const screenTop = rect.top / scale;
    const screenLeft = rect.left / scale;
    const screenRight = rect.right / scale;
    const vpWidth = window.innerWidth / scale;
    const vpHeight = window.innerHeight / scale;

    let left = screenLeft;

    // Align to right edge of button if extending past right edge
    if (left + width > vpWidth - 8) {
      left = Math.max(8, screenRight - width);
    }

    // Flip above button if in the lower half or not enough space below
    if (screenBottom + estHeight > vpHeight - 8 && screenTop > 100) {
      dropdown.style.bottom = `${Math.max(4, Math.round(vpHeight - screenTop + 4))}px`;
      dropdown.style.top = "";
    } else {
      dropdown.style.top = `${Math.max(4, Math.round(screenBottom + 4))}px`;
      dropdown.style.bottom = "";
    }

    dropdown.style.left = `${Math.max(4, Math.round(left))}px`;
  } else {
    dropdown.style.top = "20%";
    dropdown.style.left = "50%";
    dropdown.style.transform = "translateX(-50%)";
  }

  dropdown.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:4px 8px;background:var(--sys-control-bg,#f0f0f0);border-bottom:1px solid var(--sys-border-light,#ddd);font-weight:600;font-size:11px;">
      <span style="display:flex;align-items:center;gap:5px;">
        <i class="bi bi-folder-plus" style="color:var(--sys-primary,#0078d4);"></i> Add to Collection
      </span>
      <button type="button" class="win-button ds-dropdown-close" style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;padding:0;font-size:9px;line-height:1;min-width:18px;box-sizing:border-box;" title="Close">
        <i class="bi bi-x-lg" style="display:inline-flex;align-items:center;justify-content:center;line-height:1;"></i>
      </button>
    </div>
    <div style="padding:4px 8px;border-bottom:1px solid var(--sys-border-light,#eee);background:var(--sys-window-bg,#fafafa);">
      <div class="ds-truncate" style="font-weight:600;font-size:11px;color:var(--sys-window-text,#111);" title="${safeHtml(item.title)}">
        ${safeHtml(item.title)}
      </div>
    </div>
    <div id="ds-add-to-col-list" style="max-height:180px;overflow-y:auto;padding:3px 4px;display:flex;flex-direction:column;gap:1px;">
      <span class="ds-muted" style="font-size:10px;padding:6px;text-align:center;">Loading collections…</span>
    </div>
    <div style="padding:5px 6px;border-top:1px solid var(--sys-border-light,#ddd);background:var(--sys-control-bg,#f9f9f9);display:flex;gap:3px;">
      <div class="input-wrapper" style="flex:1;">
        <input type="text" id="ds-add-to-col-new-input" class="input-field has-clear" placeholder="New collection..." style="width:100%;box-sizing:border-box;font-size:10px;height:20px;" />
        <button type="button" class="input-clear-btn" tabindex="-1" title="Clear"><i class="bi bi-x-lg"></i></button>
      </div>
      <button type="button" class="win-button" id="ds-add-to-col-create-btn" style="display:inline-flex;align-items:center;justify-content:center;gap:3px;font-size:10px;padding:0 6px;height:20px;box-sizing:border-box;flex-shrink:0;">
        <i class="bi bi-plus-lg" style="display:inline-flex;align-items:center;justify-content:center;line-height:1;font-size:10px;"></i> <span>Create</span>
      </button>
    </div>
  `;

  overlay.appendChild(dropdown);
  root.appendChild(overlay);

  const close = () => {
    overlay.remove();
    document.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("scroll", close, true);
  };

  const onKeyDown = (ev: KeyboardEvent) => {
    if (ev.key === "Escape") close();
  };
  document.addEventListener("keydown", onKeyDown);
  window.addEventListener("scroll", close, { capture: true, once: true });

  overlay.addEventListener("click", (ev) => {
    if (ev.target === overlay) close();
  });

  dropdown.querySelector(".ds-dropdown-close")?.addEventListener("click", close);

  const listEl = dropdown.querySelector<HTMLElement>("#ds-add-to-col-list")!;
  const newColInput = dropdown.querySelector<HTMLInputElement>("#ds-add-to-col-new-input")!;
  const createBtn = dropdown.querySelector<HTMLButtonElement>("#ds-add-to-col-create-btn")!;

  const renderCollectionsList = async () => {
    try {
      const [collections, activeIds] = await Promise.all([
        getCollections(),
        getItemCollectionIds(item.permalink),
      ]);

      listEl.innerHTML = "";

      for (const col of collections) {
        const isMember = activeIds.includes(col.id);
        const row = document.createElement("div");
        row.className = `ds-item${isMember ? " active" : ""}`;
        row.style.cssText =
          "display:flex;align-items:center;justify-content:space-between;padding:3px 6px;border-radius:2px;cursor:pointer;user-select:none;";

        const left = document.createElement("div");
        left.style.cssText = "display:flex;align-items:center;gap:6px;min-width:0;flex:1;";

        const icon = document.createElement("i");
        icon.className = isMember ? "bi bi-check-circle-fill" : "bi bi-circle";
        icon.style.cssText = isMember
          ? "color:var(--sys-primary,#0078d4);font-size:12px;flex-shrink:0;"
          : "color:var(--sys-text-muted,#888);font-size:12px;flex-shrink:0;";
        left.appendChild(icon);

        const nameSpan = document.createElement("span");
        nameSpan.className = "ds-truncate";
        nameSpan.style.cssText = col.is_default ? "font-weight:600;font-size:11px;" : "font-size:11px;";
        nameSpan.innerHTML = col.is_default
          ? `<i class="bi bi-star-fill" style="color:#d97706;font-size:10px;margin-right:2px;"></i> ${safeHtml(col.name)}`
          : safeHtml(col.name);
        left.appendChild(nameSpan);

        row.appendChild(left);

        const countBadge = document.createElement("span");
        countBadge.className = "ds-muted";
        countBadge.style.cssText = "font-size:10px;";
        countBadge.textContent = `${col.itemCount ?? 0}`;
        row.appendChild(countBadge);

        row.addEventListener("click", async () => {
          row.style.pointerEvents = "none";
          try {
            const added = await toggleItemInCollection(col.id, {
              item_permalink: item.permalink,
              item_title: item.title,
              item_kind: item.kind || "series",
              cover: item.cover,
              parent_series_permalink: item.parentSeriesPermalink,
              parent_series_name: item.parentSeriesName,
            });
            setBanner(
              added
                ? `Added to "${col.name}".`
                : `Removed from "${col.name}".`,
            );
            await renderCollectionsList();
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            setBanner(`Collection update failed: ${msg}`);
          } finally {
            row.style.pointerEvents = "auto";
          }
        });

        listEl.appendChild(row);
      }
    } catch (err) {
      listEl.innerHTML = `<span class="ds-muted" style="color:var(--ds-danger-text);padding:6px;font-size:10px;">Failed to load collections.</span>`;
    }
  };

  await renderCollectionsList();

  const handleCreate = async () => {
    const val = newColInput.value.trim();
    if (!val) return;
    createBtn.disabled = true;
    try {
      const created = await createCollection(val);
      await toggleItemInCollection(created.id, {
        item_permalink: item.permalink,
        item_title: item.title,
        item_kind: item.kind || "series",
        cover: item.cover,
        parent_series_permalink: item.parentSeriesPermalink,
        parent_series_name: item.parentSeriesName,
      });
      newColInput.value = "";
      setBanner(`Created collection "${created.name}" and added item.`);
      await renderCollectionsList();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setBanner(`Could not create collection: ${msg}`);
    } finally {
      createBtn.disabled = false;
    }
  };

  createBtn.addEventListener("click", () => void handleCreate());
  newColInput.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") void handleCreate();
  });
}
