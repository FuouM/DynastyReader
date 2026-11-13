/**
 * SoulWindow options, shared by the Vite plugin (pre-paint boot script in vite.config.ts) and the
 * runtime controller (src/stores/theme.ts). Pure data: vite.config.ts loads this file in Node.
 *
 * Adding a theme: add an entry here and a `:root[data-theme="<id>"]` token block in src/styles/themes/.
 */
import { DEFAULT_THEMES, type SoulWindowOptions } from "soulwindow/runtime";

export const THEMES = {
  ...DEFAULT_THEMES,
  // Add-on theme; SoulWindow core ships light, dark and high contrast only.
  windows7: { family: "light", label: "Windows 7", meta: "#3a8bdc", bg: "#d2e6f9", text: "#162030" },
} as const satisfies SoulWindowOptions["themes"];

export const SOULWINDOW_OPTIONS = {
  // "ds-" keeps the theme and accent users already saved (ds-theme, ds-accent-color).
  storagePrefix: "ds-",
  metaId: "ds-theme-color-meta",
  themes: THEMES,
  density: "comfortable",
} as const satisfies SoulWindowOptions;
