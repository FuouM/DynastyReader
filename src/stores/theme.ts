/**
 * Reactive theme store for the dynasty-scans plugin (Solid port).
 *
 * Self-contained replacement for `src/theme.ts`: owns the signal, the
 * localStorage persistence (`ds-theme`, with legacy `ds-reader-theme`
 * migration), the DOM application (`data-theme` + `.ds-dark`), and the legacy
 * `THEME_CHANGE_EVENT` dispatch so non-Solid listeners keep working.
 * Independent of `src/theme.ts` so the flip can deprecate that module cleanly.
 */

import { createSignal } from "solid-js";

export type AppTheme = "light" | "dark";

const STORAGE_KEY = "ds-theme";
const LEGACY_STORAGE_KEY = "ds-reader-theme";
export const THEME_CHANGE_EVENT = "ds-theme-change";

function isAppTheme(value: string | null): value is AppTheme {
  return value === "light" || value === "dark";
}

function getAppTheme(): AppTheme {
  const saved = localStorage.getItem(STORAGE_KEY);
  return isAppTheme(saved) ? saved : "light";
}

function applyThemeToDom(theme: AppTheme): void {
  const root = document.documentElement;
  if (theme === "dark") {
    root.setAttribute("data-theme", "dark");
    document.body?.classList.add("ds-dark");
    document.getElementById("ds-root")?.classList.add("ds-dark");
  } else {
    root.removeAttribute("data-theme");
    document.body?.classList.remove("ds-dark");
    document.getElementById("ds-root")?.classList.remove("ds-dark");
  }
}

const [_theme, _setTheme] = createSignal<AppTheme>(getAppTheme());
export const theme = _theme;

export function setTheme(t: AppTheme): void {
  _setTheme(t);
  localStorage.setItem(STORAGE_KEY, t);
  applyThemeToDom(t);
  window.dispatchEvent(new CustomEvent<{ theme: AppTheme }>(THEME_CHANGE_EVENT, { detail: { theme: t } }));
}

export function toggleTheme(): void {
  setTheme(theme() === "light" ? "dark" : "light");
}

export { getAppTheme, toggleTheme as toggleAppTheme };

export function onThemeChange(fn: (t: AppTheme) => void): () => void {
  const handler = (ev: Event) => {
    const custom = ev as CustomEvent<{ theme: AppTheme }>;
    fn(custom.detail?.theme ?? getAppTheme());
  };
  window.addEventListener(THEME_CHANGE_EVENT, handler);
  return () => window.removeEventListener(THEME_CHANGE_EVENT, handler);
}

/** Applies the persisted theme on startup, migrating the legacy reader key. */
export function initAppTheme(): void {
  if (localStorage.getItem(STORAGE_KEY) == null) {
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (isAppTheme(legacy)) {
      localStorage.setItem(STORAGE_KEY, legacy);
    }
  }
  applyThemeToDom(getAppTheme());
}