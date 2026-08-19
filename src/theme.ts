/**
 * App-wide theme: single source of truth for light/dark mode.
 *
 * State lives in `localStorage["ds-theme"]`. `ds-reader-theme` (the legacy
 * reader-only key) is migrated once at startup so existing users keep their
 * choice. The theme is applied at the document level (`data-theme` on
 * `<html>` + `ds-dark` on `<body>` / `#ds-root`) so every surface — including
 * modals that mount to `document.body` — switches together.
 */

export type AppTheme = "light" | "dark";

const STORAGE_KEY = "ds-theme";
const LEGACY_STORAGE_KEY = "ds-reader-theme";
export const THEME_CHANGE_EVENT = "ds-theme-change";

function isAppTheme(value: string | null): value is AppTheme {
  return value === "light" || value === "dark";
}

export function getAppTheme(): AppTheme {
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

export function setAppTheme(theme: AppTheme): void {
  localStorage.setItem(STORAGE_KEY, theme);
  applyThemeToDom(theme);
  window.dispatchEvent(new CustomEvent<{ theme: AppTheme }>(THEME_CHANGE_EVENT, { detail: { theme } }));
}

export function toggleAppTheme(): AppTheme {
  const next = getAppTheme() === "light" ? "dark" : "light";
  setAppTheme(next);
  return next;
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

/** Subscribes to app-wide theme changes; returns an unsubscribe function. */
export function onThemeChange(listener: (theme: AppTheme) => void): () => void {
  const handler = (ev: Event): void => {
    const detail = (ev as CustomEvent<{ theme: AppTheme }>).detail;
    if (detail) listener(detail.theme);
  };
  window.addEventListener(THEME_CHANGE_EVENT, handler);
  return () => window.removeEventListener(THEME_CHANGE_EVENT, handler);
}