/**
 * Reactive accent color store for DynastyReader.
 *
 * Provides custom accent color customization that persists across sessions
 * and dynamically adapts across Light, Dark, High Contrast, and Windows 7 themes.
 */
import { makeEventListener } from "@solid-primitives/event-listener";
import { persistedSignal } from "../lib/persisted-signal";
import { theme, THEME_CHANGE_EVENT, type AppTheme } from "./theme";
import { log } from "../utils/log";

export interface AccentColorPreset {
  id: string;
  label: string;
  hex: string;
}

export const ACCENT_COLOR_PRESETS: readonly AccentColorPreset[] = [
  { id: "default", label: "Blue (Default)", hex: "#0078d4" },
  { id: "purple", label: "Purple", hex: "#8b5cf6" },
  { id: "pink", label: "Pink", hex: "#ec4899" },
  { id: "red", label: "Red", hex: "#ef4444" },
  { id: "orange", label: "Orange", hex: "#f97316" },
  { id: "amber", label: "Amber", hex: "#d97706" },
  { id: "green", label: "Green", hex: "#10b981" },
  { id: "teal", label: "Teal", hex: "#06b6d4" },
  { id: "slate", label: "Slate", hex: "#64748b" },
  { id: "green-yuri", label: "GreenYuri", hex: "#b1fe00" },
] as const;

export const ACCENT_COLOR_STORAGE_KEY = "ds-accent-color";
export const ACCENT_COLOR_CHANGE_EVENT = "ds-accent-color-change";

const DEFAULT_RGB: [number, number, number] = [0, 120, 212];

export function parseHex(hex: string): [number, number, number] {
  let clean = hex.replace("#", "").trim();
  if (clean.length === 3) {
    clean = clean.split("").map((c) => c + c).join("");
  }
  if (clean.length !== 6) return DEFAULT_RGB;
  const num = parseInt(clean, 16);
  if (isNaN(num)) return DEFAULT_RGB;
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

export function toHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const h = ((clamp(r) << 16) | (clamp(g) << 8) | clamp(b)).toString(16).padStart(6, "0");
  return `#${h}`;
}

export function adjustBrightness(hex: string, percent: number): string {
  const [r, g, b] = parseHex(hex);
  const factor = percent / 100;
  if (factor >= 0) {
    return toHex(
      r + (255 - r) * factor,
      g + (255 - g) * factor,
      b + (255 - b) * factor,
    );
  } else {
    const mult = 1 + factor;
    return toHex(r * mult, g * mult, b * mult);
  }
}

export function hexToRgba(hex: string, alpha: number): string {
  const [r, g, b] = parseHex(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return [h * 360, s, l];
}

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = (h % 360) / 360;
  if (h < 0) h += 1;
  let r: number;
  let g: number;
  let b: number;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

export function getDeepAccentText(hex: string, targetLightness = 0.14, maxSaturation = 0.75): string {
  const [r, g, b] = parseHex(hex);
  const [h, s] = rgbToHsl(r, g, b);
  const isYellowGreen = h >= 45 && h <= 95;
  const effectiveL = isYellowGreen ? Math.min(targetLightness, 0.11) : targetLightness;
  const cappedS = Math.min(s, maxSaturation);
  const [dr, dg, db] = hslToRgb(h, cappedS, effectiveL);
  return toHex(dr, dg, db);
}
export function getAccessibleLinkColor(hex: string, isDark = false): string {
  const [r, g, b] = parseHex(hex);
  const [h, s] = rgbToHsl(r, g, b);

  if (isDark) {
    const isYellowGreen = h >= 45 && h <= 95;
    const targetL = isYellowGreen ? 0.60 : 0.70;
    const targetS = Math.max(0.65, Math.min(s, 0.90));
    const [lr, lg, lb] = hslToRgb(h, targetS, targetL);
    return toHex(lr, lg, lb);
  } else {
    let targetL = 0.35;
    if (h >= 45 && h <= 95) {
      targetL = 0.22;
    } else if (h > 95 && h < 190) {
      targetL = 0.28;
    } else if (h >= 190 && h <= 250) {
      targetL = 0.36;
    } else {
      targetL = 0.34;
    }
    const targetS = Math.max(0.60, Math.min(s, 0.95));
    const [lr, lg, lb] = hslToRgb(h, targetS, targetL);
    return toHex(lr, lg, lb);
  }
}


export function getContrastText(hex: string): string {
  const [r, g, b] = parseHex(hex);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 150 ? "#000000" : "#ffffff";
}

export function computeAccentPalette(hex: string, appTheme: AppTheme = "light"): Record<string, string> {
  const contrastText = getContrastText(hex);
  const isDark = appTheme === "dark";
  const isHighContrast = appTheme === "high-contrast";
  const isWin7 = appTheme === "windows7";

  const accessibleLink = getAccessibleLinkColor(hex, isDark || isHighContrast);
  let primary = isDark || isHighContrast ? hex : accessibleLink;
  let primaryHover = isDark || isHighContrast ? adjustBrightness(hex, 10) : adjustBrightness(accessibleLink, 10);
  let primaryActive = isDark || isHighContrast ? adjustBrightness(hex, -12) : adjustBrightness(accessibleLink, -12);
  let primaryBorder = adjustBrightness(primary, -22);
  let highlightBg = hex;
  let highlightText = contrastText;
  let borderFocus = hex;
  let buttonHover = adjustBrightness(hex, 90);
  let buttonActive = adjustBrightness(hex, 78);
  let link = accessibleLink;
  let linkHover = isDark || isHighContrast ? adjustBrightness(accessibleLink, 15) : adjustBrightness(accessibleLink, -15);
  if (isDark) {
    primary = adjustBrightness(hex, 18);
    primaryHover = adjustBrightness(hex, 28);
    primaryActive = adjustBrightness(hex, 5);
    primaryBorder = adjustBrightness(hex, -15);
    borderFocus = adjustBrightness(hex, 22);
    buttonHover = adjustBrightness(hex, -72);
    buttonActive = adjustBrightness(hex, -55);
    link = adjustBrightness(hex, 18);
    linkHover = adjustBrightness(hex, 32);
  } else if (isHighContrast) {
    primary = adjustBrightness(hex, 25);
    primaryHover = adjustBrightness(hex, 38);
    primaryActive = adjustBrightness(hex, 10);
    primaryBorder = adjustBrightness(hex, -10);
    borderFocus = adjustBrightness(hex, 30);
    buttonHover = adjustBrightness(hex, -60);
    buttonActive = adjustBrightness(hex, -45);
    link = adjustBrightness(hex, 25);
    linkHover = adjustBrightness(hex, 40);
  } else if (isWin7) {
    primary = adjustBrightness(hex, -5);
    primaryHover = adjustBrightness(hex, 14);
    primaryActive = adjustBrightness(hex, -18);
    primaryBorder = adjustBrightness(hex, -25);
    borderFocus = adjustBrightness(hex, 10);
    buttonHover = adjustBrightness(hex, 90);
    buttonActive = adjustBrightness(hex, 78);
  }

  // Windows 7 Aero Colorization Palette
  const aeroLight = adjustBrightness(hex, 25);
  const aeroMid = hex;
  const aeroDark = getAccessibleLinkColor(hex, false);
  const aeroBorder = adjustBrightness(hex, -32);
  const activeGrad1 = adjustBrightness(hex, 90);
  const activeGrad2 = adjustBrightness(hex, 77);
  const activeGrad3 = adjustBrightness(hex, 60);
  const activeGrad4 = adjustBrightness(hex, 41);
  const activeBorder = adjustBrightness(hex, -25);
  const activeText = getDeepAccentText(hex, 0.14, 0.75);
  const hoverGrad1 = adjustBrightness(hex, 92);
  const hoverGrad2 = adjustBrightness(hex, 76);
  const hoverGrad3 = adjustBrightness(hex, 66);
  const hoverBorder = adjustBrightness(hex, 8);
  const subtabGrad1 = adjustBrightness(hex, 85);
  const subtabGrad2 = adjustBrightness(hex, 72);
  const subtabGrad3 = adjustBrightness(hex, 56);
  const subtabGrad4 = adjustBrightness(hex, 78);
  const subtabBorder = adjustBrightness(hex, -25);
  const subtabText = activeText;
  // Frosted, clean, neutral Aero surfaces tinted in the accent family
  const badgeBg = adjustBrightness(hex, 68);
  const badgeBorder = adjustBrightness(hex, 38);
  const badgeText = getDeepAccentText(hex, 0.16, 0.70);
  const boxBg1 = "#ffffff";
  const boxBg2 = adjustBrightness(hex, 75);
  const boxBorder = adjustBrightness(hex, 40);
  const dividerColor = adjustBrightness(hex, 45);
  const wall1 = adjustBrightness(hex, 60);
  const wall2 = adjustBrightness(hex, 42);
  const wall3 = adjustBrightness(hex, 25);
  const topbar1 = adjustBrightness(hex, 32);
  const topbar2 = adjustBrightness(hex, 18);
  const topbar3 = hex;
  const topbar4 = adjustBrightness(hex, 24);
  const taskbar1 = adjustBrightness(hex, 35);
  const taskbar2 = adjustBrightness(hex, 20);
  const [r, g, b] = parseHex(hex);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  const isLightTopbar = yiq >= 125;
  const topbarText = isLightTopbar ? getDeepAccentText(hex, 0.12, 0.75) : "#ffffff";
  const topbarShadow = isLightTopbar
    ? "0 0 8px rgba(255, 255, 255, 0.95), 0 0 3px #ffffff, 0 1px 0 #ffffff"
    : "0 1px 2px rgba(0, 0, 0, 0.65), 0 0 6px rgba(0, 0, 0, 0.35)";


  return {
    "--sys-accent": hex,
    "--sys-primary": primary,
    "--sys-primary-border": primaryBorder,
    "--sys-primary-hover": primaryHover,
    "--sys-primary-active": primaryActive,
    "--sys-highlight-bg": highlightBg,
    "--sys-highlight-text": highlightText,
    "--sys-border-focus": borderFocus,
    "--sys-button-hover": buttonHover,
    "--sys-button-active": buttonActive,
    "--sys-button-primary-bg": primary,
    "--sys-button-primary-border": primaryBorder,
    "--sys-button-primary-hover": primaryHover,
    "--sys-button-primary-active": primaryActive,
    "--sys-link": link,
    "--sys-link-hover": linkHover,
    "--ds-accent-aero-light": aeroLight,
    "--ds-accent-aero-mid": aeroMid,
    "--ds-accent-aero-dark": aeroDark,
    "--ds-accent-aero-border": aeroBorder,
    "--ds-accent-active-grad-1": activeGrad1,
    "--ds-accent-active-grad-2": activeGrad2,
    "--ds-accent-active-grad-3": activeGrad3,
    "--ds-accent-active-grad-4": activeGrad4,
    "--ds-accent-active-border": activeBorder,
    "--ds-accent-active-text": activeText,
    "--ds-accent-hover-grad-1": hoverGrad1,
    "--ds-accent-hover-grad-2": hoverGrad2,
    "--ds-accent-hover-grad-3": hoverGrad3,
    "--ds-accent-hover-border": hoverBorder,
    "--ds-accent-subtab-grad-1": subtabGrad1,
    "--ds-accent-subtab-grad-2": subtabGrad2,
    "--ds-accent-subtab-grad-3": subtabGrad3,
    "--ds-accent-subtab-grad-4": subtabGrad4,
    "--ds-accent-subtab-border": subtabBorder,
    "--ds-accent-subtab-text": subtabText,
    "--ds-accent-badge-bg": badgeBg,
    "--ds-accent-badge-border": badgeBorder,
    "--ds-accent-badge-text": badgeText,
    "--ds-accent-box-bg-1": boxBg1,
    "--ds-accent-box-bg-2": boxBg2,
    "--ds-accent-box-border": boxBorder,
    "--ds-accent-divider": dividerColor,
    "--ds-accent-wall-1": wall1,
    "--ds-accent-wall-2": wall2,
    "--ds-accent-wall-3": wall3,
    "--ds-accent-topbar-1": topbar1,
    "--ds-accent-topbar-2": topbar2,
    "--ds-accent-topbar-3": topbar3,
    "--ds-accent-topbar-4": topbar4,
    "--ds-accent-taskbar-1": taskbar1,
    "--ds-accent-taskbar-2": taskbar2,
    "--ds-accent-topbar-text": topbarText,
    "--ds-accent-topbar-shadow": topbarShadow,
  };
}

/** All CSS custom property names managed by the accent color system — derived from the palette to guarantee sync. */
const MANAGED_VARS = Object.keys(computeAccentPalette("#0078d4")) as readonly string[];

export function applyAccentColorToDom(color: string | null, activeTheme?: AppTheme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (!root) return;

  const curTheme = activeTheme ?? theme();

  if (!color || color === "default") {
    for (const v of MANAGED_VARS) {
      root.style.removeProperty(v);
    }
    return;
  }

  const palette = computeAccentPalette(color, curTheme);
  for (const [key, val] of Object.entries(palette)) {
    root.style.setProperty(key, val);
  }
}

function deserializeAccentColor(raw: string): string {
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === "string") return parsed;
  } catch (err) {
    log.debug("accent-color", "deserialize fallback, raw:", raw, err);
  }
  return raw.replace(/^["']|["']$/g, "").trim();
}

const [accentColorSignal, setAccentColorSignal] = persistedSignal<string>("default", {
  name: ACCENT_COLOR_STORAGE_KEY,
  deserialize: deserializeAccentColor,
});

export const accentColor = accentColorSignal;

export function setAccentColor(color: string): void {
  const norm = color.trim().toLowerCase();
  setAccentColorSignal(norm);
  applyAccentColorToDom(norm, theme());
  window.dispatchEvent(new CustomEvent<{ accentColor: string }>(ACCENT_COLOR_CHANGE_EVENT, { detail: { accentColor: norm } }));
}

export function getAccentColor(): string {
  return accentColorSignal();
}

export function initAccentColor(): void {
  applyAccentColorToDom(getAccentColor(), theme());

  // Listen to theme changes to re-adapt the active accent color
  if (typeof window !== "undefined") {
    makeEventListener(window, THEME_CHANGE_EVENT, (ev) => {
      const custom = ev as CustomEvent<{ theme: AppTheme }>;
      const t = custom.detail?.theme ?? theme();
      applyAccentColorToDom(getAccentColor(), t);
    });
  }
}
