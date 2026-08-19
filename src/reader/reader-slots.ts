/**
 * Page-slot rendering for the reader strip: cached-page images, per-slot
 * states (spinner / offline / error / idle), and the cached-count sweep that
 * promotes newly downloaded pages into `<img>` elements.
 */

import type { ReaderController } from "./reader-controller";
import { WIDE_RATIO } from "./reader-spread";
import { convertFileSrc } from "../ipc";

/** Renders a cached page image into a slot, wiring wide-image spread detection. */
export function renderSlotImg(
  ctrl: ReaderController,
  slot: HTMLElement,
  absPath: string,
  pageNum: number,
): void {
  slot.classList.remove("ds-slot-loading");
  slot.innerHTML = "";
  const badge = document.createElement("div");
  badge.className = "ds-slot-page-badge";
  badge.textContent = `${pageNum} / ${ctrl.pages.length}`;
  slot.appendChild(badge);

  const img = document.createElement("img");
  img.className = "ds-page-img";
  img.alt = `Page ${pageNum}`;
  img.addEventListener("error", () => {
    const idx = Number(slot.dataset.index);
    ctrl.cachedMap.delete(idx);
    if (ctrl.queue.isRetrying(idx)) return;
    ctrl.queue.markRetrying(idx);
    renderSlotState(ctrl, slot, "spinner", "Re-downloading…");
    ctrl.queue.enqueue(idx, true);
  });
  img.addEventListener("load", () => {
    if (ctrl.disposed) return;
    const idx = Number(slot.dataset.index);
    const isWide = img.naturalWidth > img.naturalHeight * WIDE_RATIO;
    if (isWide !== ctrl.widePages.has(idx)) {
      if (isWide) {
        ctrl.widePages.add(idx);
      } else {
        ctrl.widePages.delete(idx);
      }
      ctrl.recomputeSpreads();
      // Rebuild only once every slot exists so page order stays intact.
      if (ctrl.isSpread && ctrl.slots.length === ctrl.pages.length) {
        ctrl.rebuildSpreadSlots();
        ctrl.viewportImpl.resetToCurrentPage(true);
      }
    }
  });
  img.src = convertFileSrc(absPath);
  slot.appendChild(img);
}

/** Renders a non-image slot state (download spinner, offline, error, idle). */
export function renderSlotState(
  ctrl: ReaderController,
  slot: HTMLElement,
  kind: "spinner" | "offline" | "error" | "idle",
  message: string,
): void {
  slot.innerHTML = "";
  const idx = Number(slot.dataset.index);
  const badge = document.createElement("div");
  badge.className = "ds-slot-page-badge";
  badge.textContent = `${idx + 1} / ${ctrl.pages.length}`;
  slot.appendChild(badge);

  const state = document.createElement("div");
  state.className = `ds-slot-state${kind === "error" ? " ds-slot-error" : ""}`;
  if (kind === "spinner") {
    state.innerHTML =
      '<i class="bi bi-cloud-arrow-down" style="font-size:20px;color:var(--sys-primary,#0078d4);"></i>' +
      '<div class="ds-slot-pulse-wrap"><div class="ds-slot-pulse-bar"></div></div>';
  } else if (kind === "offline") {
    state.innerHTML = '<i class="bi bi-wifi-off" style="font-size:20px;"></i>';
  } else if (kind === "idle") {
    state.innerHTML = '<i class="bi bi-book" style="font-size:20px;color:var(--sys-text-muted,#888);"></i>';
  } else {
    state.innerHTML = '<i class="bi bi-exclamation-triangle" style="font-size:20px;"></i>';
  }
  const text = document.createElement("span");
  if (kind === "spinner") {
    const pct =
      ctrl.pages.length > 0 ? Math.round((ctrl.cachedCount / ctrl.pages.length) * 100) : 0;
    text.textContent = `Downloading page ${idx + 1} of ${ctrl.pages.length} (${ctrl.cachedCount}/${ctrl.pages.length} cached · ${pct}%)`;
  } else if (kind === "idle") {
    text.textContent = `Page ${idx + 1} of ${ctrl.pages.length} · Waiting to read…`;
  } else {
    text.textContent = message;
  }
  state.appendChild(text);
  if (kind === "error") {
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "win-button";
    retry.style.cssText = "font-size:10px;padding:1px 8px;";
    retry.textContent = "Retry";
    retry.addEventListener("click", () => {
      ctrl.queue.clearFailed(idx);
      renderSlotState(ctrl, slot, "spinner", "Downloading…");
      ctrl.queue.enqueue(idx);
    });
    state.appendChild(retry);
  }
  slot.appendChild(state);
}

/** Sweeps all slots after a cache mutation: promote downloads, refresh counts. */
export function updateCacheCount(ctrl: ReaderController): void {
  ctrl.cachedCount = ctrl.cachedMap.size;
  ctrl.updateProgressText();
  const pct =
    ctrl.pages.length > 0 ? Math.round((ctrl.cachedCount / ctrl.pages.length) * 100) : 0;
  for (const slot of ctrl.slots) {
    const idx = Number(slot.dataset.index);
    const absPath = ctrl.cachedMap.get(idx);
    if (absPath) {
      // If cached but not yet rendered as an image, render it immediately
      if (!slot.querySelector("img.ds-page-img")) {
        renderSlotImg(ctrl, slot, absPath, idx + 1);
      }
    } else {
      const spinner = slot.querySelector<HTMLElement>(".ds-slot-state:not(.ds-slot-error) span");
      if (spinner) {
        spinner.textContent = `Downloading page ${idx + 1} of ${ctrl.pages.length} (${ctrl.cachedCount}/${ctrl.pages.length} cached · ${pct}%)`;
      }
    }
  }
}