/**
 * Shared color helpers — single source for accent palette math.
 * Used by src/stores/accent-color.ts and mirrored in index.html head script
 * (which must stay sync; see HEAD_SCRIPT_SYNC comment there).
 */

const DEFAULT_RGB: [number, number, number] = [0, 120, 212];

export const PRESET_HEX_MAP: Record<string, string> = {
  default: "#0078d4",
  purple: "#8b5cf6",
  pink: "#ec4899",
  red: "#ef4444",
  orange: "#f97316",
  amber: "#d97706",
  green: "#10b981",
  teal: "#06b6d4",
  slate: "#64748b",
  "green-yuri": "#b1fe00",
};

export function resolveAccentColorHex(color: string | null | undefined): string {
  if (!color || color === "default") return "#0078d4";
  const norm = color.trim().toLowerCase();
  if (PRESET_HEX_MAP[norm]) return PRESET_HEX_MAP[norm];
  const clean = norm.replace("#", "");
  if (/^[0-9a-f]{3,6}$/i.test(clean)) {
    return `#${clean}`;
  }
  return "#0078d4";
}

export function parseHex(color: string): [number, number, number] {
  const hex = resolveAccentColorHex(color);
  let clean = hex.replace("#", "").trim();
  if (clean.length === 3) clean = clean.split("").map((c) => c + c).join("");
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
    return toHex(r + (255 - r) * factor, g + (255 - g) * factor, b + (255 - b) * factor);
  }
  const mult = 1 + factor;
  return toHex(r * mult, g * mult, b * mult);
}

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
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
  let r: number, g: number, b: number;
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

export function getContrastText(hex: string): string {
  const [r, g, b] = parseHex(hex);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 150 ? "#000000" : "#ffffff";
}

export function getDeepAccentText(hex: string, targetLightness = 0.14, maxSaturation = 0.75): string {
  const [r, g, b] = parseHex(hex);
  const hsl = rgbToHsl(r, g, b);
  const isYG = hsl[0] >= 45 && hsl[0] <= 95;
  const effL = isYG ? Math.min(targetLightness, 0.11) : targetLightness;
  const cappedS = Math.min(hsl[1], maxSaturation);
  const rgb = hslToRgb(hsl[0], cappedS, effL);
  return toHex(rgb[0], rgb[1], rgb[2]);
}

export function getAccessibleLinkColor(hex: string, isDark = false): string {
  const [r, g, b] = parseHex(hex);
  const hsl = rgbToHsl(r, g, b);
  const h = hsl[0], s = hsl[1];
  if (isDark) {
    const isYG = h >= 45 && h <= 95;
    const targetL = isYG ? 0.60 : 0.70;
    const targetS = Math.max(0.65, Math.min(s, 0.90));
    const rgb = hslToRgb(h, targetS, targetL);
    return toHex(rgb[0], rgb[1], rgb[2]);
  }
  let targetL = 0.35;
  if (h >= 45 && h <= 95) targetL = 0.22;
  else if (h > 95 && h < 190) targetL = 0.28;
  else if (h >= 190 && h <= 250) targetL = 0.36;
  else targetL = 0.34;
  const targetS = Math.max(0.60, Math.min(s, 0.95));
  const rgb = hslToRgb(h, targetS, targetL);
  return toHex(rgb[0], rgb[1], rgb[2]);
}
