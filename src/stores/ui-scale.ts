/**
 * Reactive UI-scale store for the dynasty-scans plugin (Solid port).
 *
 * Self-contained replacement for `src/ui-scale.ts`: owns the signal, the
 * `ds-ui-scale` localStorage persistence, and the 0.5–2.5 clamp. The zoom is
 * applied to `#ds-root` by `App.tsx` via `style={{ zoom }}` (so position:fixed
 * / sticky elements are not displaced), replacing the imperative DOM write.
 */

import { createSignal } from "solid-js";

const STORAGE_KEY_UI_SCALE = "ds-ui-scale";
const MIN_SCALE = 0.5;
const MAX_SCALE = 2.5;

export const [uiScale, setUiScale] = createSignal<number>(getSavedUiScale());

function getSavedUiScale(): number {
  const saved = localStorage.getItem(STORAGE_KEY_UI_SCALE);
  if (saved) {
    const val = parseFloat(saved);
    if (!isNaN(val) && val >= MIN_SCALE && val <= MAX_SCALE) {
      return val;
    }
  }
  return 1.0;
}

export function applyUiScale(scale: number): void {
  const clamped = Math.max(MIN_SCALE, Math.min(MAX_SCALE, Math.round(scale * 100) / 100));
  localStorage.setItem(STORAGE_KEY_UI_SCALE, String(clamped));
  setUiScale(clamped);
}