/**
 * Shared color helpers — typed adapter over `window.DSColorBootstrap`.
 *
 * The single source of truth for accent color math is the synchronous
 * bootstrap script in index.html (see COLOR_BOOTSTRAP / HEAD_SCRIPT_SYNC
 * there). It runs pre-paint in the document head, before any app module is
 * evaluated, so the global is guaranteed to exist by the time this module is
 * imported. Used by src/stores/accent-color.ts.
 */

export interface DSColorBootstrapApi {
  PRESET_HEX_MAP: Record<string, string>;
  resolveAccentColorHex(color: string | null | undefined): string;
  parseHex(color: string): [number, number, number];
  toHex(r: number, g: number, b: number): string;
  /** Brightness factor in -1..1 (negative darkens, positive lightens). */
  adjustBrightnessFactor(hex: string, factor: number): string;
  rgbToHsl(r: number, g: number, b: number): [number, number, number];
  hslToRgb(h: number, s: number, l: number): [number, number, number];
  getContrastText(hex: string): string;
  getDeepAccentText(hex: string, targetLightness?: number, maxSaturation?: number): string;
  getAccessibleLinkColor(hex: string, isDark?: boolean): string;
}

declare global {
  interface Window {
    DSColorBootstrap?: DSColorBootstrapApi;
  }
}

function bs(): DSColorBootstrapApi {
  const api = window.DSColorBootstrap;
  if (!api) {
    throw new Error(
      "DSColorBootstrap is missing — the index.html bootstrap script must run before any app module imports lib/color.",
    );
  }
  return api;
}

export const PRESET_HEX_MAP: Record<string, string> = bs().PRESET_HEX_MAP;

export function resolveAccentColorHex(color: string | null | undefined): string {
  return bs().resolveAccentColorHex(color);
}

export function parseHex(color: string): [number, number, number] {
  return bs().parseHex(color);
}

export function toHex(r: number, g: number, b: number): string {
  return bs().toHex(r, g, b);
}

export function adjustBrightness(hex: string, percent: number): string {
  return bs().adjustBrightnessFactor(hex, percent / 100);
}

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  return bs().rgbToHsl(r, g, b);
}

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  return bs().hslToRgb(h, s, l);
}

export function getContrastText(hex: string): string {
  return bs().getContrastText(hex);
}

export function getDeepAccentText(hex: string, targetLightness = 0.14, maxSaturation = 0.75): string {
  return bs().getDeepAccentText(hex, targetLightness, maxSaturation);
}

export function getAccessibleLinkColor(hex: string, isDark = false): string {
  return bs().getAccessibleLinkColor(hex, isDark);
}
