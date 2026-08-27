/**
 * Reactive theme store for DynastyReader.
 *
 * Owns the signal, localStorage persistence (`ds-theme`, with legacy
 * `ds-reader-theme` migration), DOM application (`data-theme` attribute +
 * `ds-<theme>` body/root class), and the legacy `THEME_CHANGE_EVENT`
 * dispatch so non-Solid listeners keep working.
 *
 * Extending to a 3rd theme: add to `AppTheme`, `THEME_META`, `VALID_THEMES`,
 * and add a `[data-theme="<name>"]` block in `tokens.css`.
 */
import { makeEventListener } from "@solid-primitives/event-listener";
import { persistedSignal } from "../lib/persisted-signal";

export type AppTheme = "light" | "dark" | "high-contrast";

/** All valid theme ids — single source of truth for validation and cycling. */
const VALID_THEMES: readonly AppTheme[] = ["light", "dark", "high-contrast"];

/** Theme-color meta tag values (Android status bar / PWA chrome). */
const THEME_META: Record<AppTheme, string> = {
  light: "#f5f5f5",
  dark: "#181818",
  "high-contrast": "#000000",
};

const STORAGE_KEY = "ds-theme";
const LEGACY_STORAGE_KEY = "ds-reader-theme";
export const THEME_CHANGE_EVENT = "ds-theme-change";

function isAppTheme(value: unknown): value is AppTheme {
  return VALID_THEMES.includes(value as AppTheme);
}

function deserializeTheme(raw: string): AppTheme {
  let parsed: unknown = raw;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = raw.replace(/^["']|["']$/g, "").trim().toLowerCase();
  }
  return isAppTheme(parsed) ? parsed : "light";
}

function applyThemeToDom(t: AppTheme): void {
  const root = document.documentElement;
  // Clear temporary inline styles from index.html bootstrap script so tokens.css controls it
  root.style.removeProperty("background-color");
  root.style.removeProperty("color");
  root.style.colorScheme = t === "light" ? "light" : "dark";
  // Always set data-theme explicitly so CSS [data-theme="light"] selectors work.
  root.setAttribute("data-theme", t);
  // Swap ds-<theme> class: remove any prior theme class, add the current one.
  const body = document.body;
  const dsRoot = document.getElementById("ds-root");
  VALID_THEMES.forEach((name) => {
    body?.classList.remove(`ds-${name}`);
    dsRoot?.classList.remove(`ds-${name}`);
  });
  body?.classList.add(`ds-${t}`);
  dsRoot?.classList.add(`ds-${t}`);
  // Keep legacy ds-dark in sync so any residual ds-dark CSS still fires.
  body?.classList.toggle("ds-dark", t === "dark" || t === "high-contrast");
  dsRoot?.classList.toggle("ds-dark", t === "dark" || t === "high-contrast");
  const meta = document.getElementById("ds-theme-color-meta") as HTMLMetaElement | null;
  if (meta) {
    meta.setAttribute("content", THEME_META[t] ?? "#f5f5f5");
  }
}

const [themeSignal, setThemeSignal] = persistedSignal<AppTheme>("light", {
  name: STORAGE_KEY,
  deserialize: deserializeTheme,
});

export const theme = themeSignal;

export function setTheme(t: AppTheme): void {
  setThemeSignal(t);
  applyThemeToDom(t);
  window.dispatchEvent(new CustomEvent<{ theme: AppTheme }>(THEME_CHANGE_EVENT, { detail: { theme: t } }));
}
export function getAppTheme(): AppTheme {
  return themeSignal();
}

export function toggleTheme(): void {
  const idx = VALID_THEMES.indexOf(theme());
  setTheme(VALID_THEMES[(idx + 1) % VALID_THEMES.length]);
}

export { toggleTheme as toggleAppTheme };

export function onThemeChange(fn: (t: AppTheme) => void): () => void {
  return makeEventListener(window, THEME_CHANGE_EVENT, (ev) => {
    const custom = ev as CustomEvent<{ theme: AppTheme }>;
    fn(custom.detail?.theme ?? getAppTheme());
  });
}

/** Applies the persisted theme on startup, migrating the legacy reader key. */
export function initAppTheme(): void {
  try {
    if (localStorage.getItem(STORAGE_KEY) == null) {
      const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (isAppTheme(legacy)) {
        localStorage.setItem(STORAGE_KEY, legacy);
      }
    }
  } catch (err) {
    console.debug("[theme] legacy theme migration check failed:", err);
  }
  applyThemeToDom(getAppTheme());
}