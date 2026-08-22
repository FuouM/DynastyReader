/**
 * Reactive UI-scale store for the dynasty-scans plugin (Solid port).
 *
 * Self-contained replacement for `src/ui-scale.ts`: owns the signal, the
 * `ds-ui-scale` localStorage persistence, and the 0.5–2.5 clamp. The zoom is
 * applied to `#ds-root` by `App.tsx` via `style={{ zoom }}` (so position:fixed
 * / sticky elements are not displaced), replacing the imperative DOM write.
 */

import { createSignal } from "solid-js";

const STORAGE_KEY = "ds-ui-scale";
const MIN_SCALE = 0.5;
const MAX_SCALE = 2.5;

function readPersistedScale(): number {
  if (typeof localStorage === "undefined") return 1.0;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return 1.0;
    let val = raw;
    try {
      val = String(JSON.parse(raw));
    } catch {}
    const parsed = parseFloat(val);
    if (!isNaN(parsed) && parsed >= MIN_SCALE && parsed <= MAX_SCALE) {
      return parsed;
    }
  } catch (err) {
    console.error("[ui-scale] failed reading persisted scale:", err);
  }
  return 1.0;
}

const [scaleSignal, setScaleSignal] = createSignal<number>(readPersistedScale());

export const uiScale = scaleSignal;
export const setUiScale = (scale: number | ((prev: number) => number)) => {
  const next = typeof scale === "function" ? scale(scaleSignal()) : scale;
  const clamped = Math.max(MIN_SCALE, Math.min(MAX_SCALE, Math.round(next * 100) / 100));
  setScaleSignal(clamped);
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, String(clamped));
    }
  } catch (err) {
    console.error("[ui-scale] failed saving scale to localStorage:", err);
  }
};

export function applyUiScale(scale: number): void {
  setUiScale(scale);
}