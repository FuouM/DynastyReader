/**
 * Leaf module for the persisted UI scale factor (75%–150% of 100%).
 * Lives on its own so modal/component modules can import it without pulling
 * in the full settings dialog (avoids the former settings-modal <-> update-dialog cycle).
 */

const STORAGE_KEY_UI_SCALE = "ds-ui-scale";
const MIN_SCALE = 0.5;
const MAX_SCALE = 2.5;

export function getSavedUiScale(): number {
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
  // Apply zoom only to #ds-root so that position:fixed / position:sticky elements
  // (reader nav bar, global topbar) are not displaced by a zoomed <html> element.
  const root = document.getElementById("ds-root");
  if (root) root.style.setProperty("zoom", String(clamped));
}