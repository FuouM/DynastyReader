/**
 * Reactive theme store for DynastyReader.
 *
 * Owns the signal, localStorage persistence (`ds-theme`, with legacy
 * `ds-reader-theme` migration), DOM application (`data-theme` attribute +
 * `ds-<theme>` body/root class), and the legacy `THEME_CHANGE_EVENT`
 * dispatch so non-Solid listeners keep working.
 *
 * Adding a new theme (e.g. windows-xp): add one entry to `THEME_REGISTRY`
 * and one file `src/styles/themes/<name>.css` with `:root[data-theme="<name>"]` vars.
 */
import { makeEventListener } from "@solid-primitives/event-listener";
import { persistedSignal } from "../lib/persisted-signal";

/** Registry — single source of truth for theme ids, meta colors, and DOM mapping. */
export const THEME_REGISTRY = {
  light: { meta: "#f5f5f5", bg: "#ececec", text: "#000000", colorScheme: "light" as const, label: "Light" },
  dark: { meta: "#181818", bg: "#1e1e1e", text: "#e0e0e0", colorScheme: "dark" as const, label: "Dark" },
  "high-contrast": { meta: "#000000", bg: "#000000", text: "#ffffff", colorScheme: "dark" as const, label: "High Contrast" },
  windows7: { meta: "#3a8bdc", bg: "#d2e6f9", text: "#162030", colorScheme: "light" as const, label: "Windows 7" },
} as const;

export type AppTheme = keyof typeof THEME_REGISTRY;

/** All valid theme ids — derived from registry. */
const VALID_THEMES: readonly AppTheme[] = Object.keys(THEME_REGISTRY) as AppTheme[];

/** Theme-color meta tag values (Android status bar / PWA chrome). */
const THEME_META: Record<AppTheme, string> = Object.fromEntries(
  Object.entries(THEME_REGISTRY).map(([k, v]) => [k, v.meta]),
) as Record<AppTheme, string>;

const STORAGE_KEY = "ds-theme";
const LEGACY_STORAGE_KEY = "ds-reader-theme";
export const THEME_CHANGE_EVENT = "ds-theme-change";

function isAppTheme(value: unknown): value is AppTheme {
  return (VALID_THEMES as readonly string[]).includes(value as string);
}

function deserializeTheme(raw: string): AppTheme {
  let parsed: unknown = raw;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.debug("[dynasty-reader/theme] deserialize fallback, raw:", raw, err);
    parsed = raw.replace(/^["']|["']$/g, "").trim().toLowerCase();
  }
  return isAppTheme(parsed) ? parsed : "light";
}

function applyThemeToDom(t: AppTheme): void {
  const root = document.documentElement;
  // Clear temporary inline styles from index.html bootstrap script so tokens.css controls it
  root.style.removeProperty("background-color");
  root.style.removeProperty("color");
  const cfg = THEME_REGISTRY[t] ?? THEME_REGISTRY.light;
  root.style.colorScheme = cfg.colorScheme;
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
  const isDark = cfg.colorScheme === "dark";
  body?.classList.toggle("ds-dark", isDark);
  dsRoot?.classList.toggle("ds-dark", isDark);
  const meta = document.getElementById("ds-theme-color-meta") as HTMLMetaElement | null;
  if (meta) {
    meta.setAttribute("content", THEME_META[t] ?? "#f5f5f5");
  }
  const w = window as unknown as { AndroidThemeBridge?: { updateTheme: (isDark: boolean, color: string) => void } };
  if (typeof window !== "undefined" && w.AndroidThemeBridge?.updateTheme) {
    try {
      w.AndroidThemeBridge.updateTheme(isDark, THEME_META[t] ?? "#f5f5f5");
    } catch (err) {
      console.debug("[dynasty-reader/theme] AndroidThemeBridge.updateTheme failed:", err);
    }
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