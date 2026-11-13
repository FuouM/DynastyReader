/**
 * Theme, accent and density for DynastyReader: a thin layer over the SoulWindow controller.
 *
 * SoulWindow owns persistence (`ds-theme`, `ds-accent-color`), the `data-theme` / `data-density`
 * attributes, the theme-color meta tag, the Android status bar and the accent palette. The same
 * options feed the pre-paint boot script that vite.config.ts injects into index.html.
 */
import { createRoot } from "solid-js";
import { createSoulWindow, type ThemeDef } from "soulwindow/runtime";
import { useSoulWindow } from "soulwindow/solid/store";
import { SOULWINDOW_OPTIONS, THEMES } from "../soulwindow-options";

export type AppTheme = keyof typeof THEMES;

export const THEME_REGISTRY: Readonly<Record<AppTheme, ThemeDef>> = THEMES;

function isAppTheme(id: string): id is AppTheme {
  return id in THEME_REGISTRY;
}

export const sw = createSoulWindow(SOULWINDOW_OPTIONS);

// App-lifetime subscription: the root is never disposed.
const signals = createRoot(() => useSoulWindow(sw));

export function theme(): AppTheme {
  const id = signals.theme();
  return isAppTheme(id) ? id : "light";
}

export function setTheme(t: AppTheme): void {
  sw.setTheme(t);
}

export function toggleTheme(): void {
  sw.cycleTheme();
}

export const accentColor = signals.accent;

export function setAccentColor(color: string): void {
  sw.setAccent(color);
}

export const ACCENT_COLOR_PRESETS = sw.kit.PRESETS;
