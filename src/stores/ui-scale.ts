/**
 * Reactive UI-scale store for the dynasty-scans plugin (Solid port).
 *
 * Self-contained replacement for `src/ui-scale.ts`: owns the signal, the
 * `ds-ui-scale` localStorage persistence, and the 0.5–2.5 clamp. The zoom is
 * applied to `#ds-root` by `App.tsx` via `style={{ zoom }}` (so position:fixed
 * / sticky elements are not displaced), replacing the imperative DOM write.
 */

import { persistedSignal } from "../lib/persisted-signal";

const MIN_SCALE = 0.5;
const MAX_SCALE = 2.5;

const [scaleSignal, setScaleRaw] = persistedSignal(1.0, {
  name: "ds-ui-scale",
  deserialize: (v) => {
    const parsed = parseFloat(v);
    return !isNaN(parsed) && parsed >= MIN_SCALE && parsed <= MAX_SCALE ? parsed : 1.0;
  },
});

export const uiScale = scaleSignal;
export const setUiScale = (scale: number | ((prev: number) => number)) => {
  const next = typeof scale === "function" ? scale(scaleSignal()) : scale;
  setScaleRaw(Math.max(MIN_SCALE, Math.min(MAX_SCALE, Math.round(next * 100) / 100)));
};