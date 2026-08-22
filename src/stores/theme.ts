/**
 * Reactive theme store for the dynasty-scans plugin (Solid port).
 *
 * Self-contained replacement for `src/theme.ts`: owns the signal, the
 * localStorage persistence (`ds-theme`, with legacy `ds-reader-theme`
 * migration), the DOM application (`data-theme` + `.ds-dark`), and the legacy
 * `THEME_CHANGE_EVENT` dispatch so non-Solid listeners keep working.
 */
import { createSignal } from "solid-js";
import { makeEventListener } from "@solid-primitives/event-listener";

export type AppTheme = "light" | "dark";

const STORAGE_KEY = "ds-theme";
const LEGACY_STORAGE_KEY = "ds-reader-theme";
export const THEME_CHANGE_EVENT = "ds-theme-change";

function isAppTheme(value: unknown): value is AppTheme {
  return value === "light" || value === "dark";
}

function readPersistedTheme(): AppTheme {
  if (typeof localStorage === "undefined") return "light";
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return "light";
    // Parse JSON if quoted ("\"dark\""), else use raw trimmed string ("dark")
    let parsed: unknown = raw;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = raw.replace(/^["']|["']$/g, "").trim().toLowerCase();
    }
    if (isAppTheme(parsed)) return parsed;
  } catch (err) {
    console.error("[theme] failed reading persisted theme:", err);
  }
  return "light";
}

function applyThemeToDom(t: AppTheme): void {
  const root = document.documentElement;
  if (t === "dark") {
    root.setAttribute("data-theme", "dark");
    document.body?.classList.add("ds-dark");
    document.getElementById("ds-root")?.classList.add("ds-dark");
  } else {
    root.removeAttribute("data-theme");
    document.body?.classList.remove("ds-dark");
    document.getElementById("ds-root")?.classList.remove("ds-dark");
  }
}

const [themeSignal, setThemeSignal] = createSignal<AppTheme>(readPersistedTheme());

export const theme = themeSignal;

export function setTheme(t: AppTheme): void {
  setThemeSignal(t);
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, t);
    }
  } catch (err) {
    console.error("[theme] failed saving theme to localStorage:", err);
  }
  applyThemeToDom(t);
  window.dispatchEvent(new CustomEvent<{ theme: AppTheme }>(THEME_CHANGE_EVENT, { detail: { theme: t } }));
}
export function getAppTheme(): AppTheme {
  return themeSignal();
}

export function toggleTheme(): void {
  setTheme(theme() === "light" ? "dark" : "light");
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
  if (localStorage.getItem(STORAGE_KEY) == null) {
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (isAppTheme(legacy)) {
      localStorage.setItem(STORAGE_KEY, legacy);
    }
  }
  applyThemeToDom(getAppTheme());
}