/**
 * Accent tints for the Windows 7 (Aero) add-on theme.
 *
 * SoulWindow's accent palette covers the core `--sys-*` colours. The Aero chrome in
 * src/styles/themes/windows7*.css also reads `--ds-accent-*` gradients, and Windows 7 shifts the
 * primary colours slightly darker than the plain light theme. Both are derived here from the same
 * colour kit and re-applied after every SoulWindow change.
 */
import type { ColorKit } from "soulwindow/runtime";
import { sw } from "./theme";

function aeroPalette(kit: ColorKit, hex: string): Record<string, string> {
  const a = (percent: number) => kit.adjust(hex, percent);
  const activeText = kit.deepText(hex, 0.14, 0.75);
  const lightTopbar = kit.contrastText(hex) === "#000000";
  return {
    "--ds-accent-aero-light": a(25),
    "--ds-accent-aero-mid": hex,
    "--ds-accent-aero-dark": kit.linkColor(hex, false),
    "--ds-accent-aero-border": a(-32),
    "--ds-accent-active-grad-1": a(90),
    "--ds-accent-active-grad-2": a(77),
    "--ds-accent-active-grad-3": a(60),
    "--ds-accent-active-grad-4": a(41),
    "--ds-accent-active-border": a(-25),
    "--ds-accent-active-text": activeText,
    "--ds-accent-hover-grad-1": a(92),
    "--ds-accent-hover-grad-2": a(76),
    "--ds-accent-hover-grad-3": a(66),
    "--ds-accent-hover-border": a(8),
    "--ds-accent-subtab-grad-1": a(85),
    "--ds-accent-subtab-grad-2": a(72),
    "--ds-accent-subtab-grad-3": a(56),
    "--ds-accent-subtab-grad-4": a(78),
    "--ds-accent-subtab-border": a(-25),
    "--ds-accent-subtab-text": activeText,
    "--ds-accent-badge-bg": a(68),
    "--ds-accent-badge-border": a(38),
    "--ds-accent-badge-text": kit.deepText(hex, 0.16, 0.7),
    "--ds-accent-box-bg-1": "#ffffff",
    "--ds-accent-box-bg-2": a(75),
    "--ds-accent-box-border": a(40),
    "--ds-accent-divider": a(45),
    "--ds-accent-wall-1": a(60),
    "--ds-accent-wall-2": a(42),
    "--ds-accent-wall-3": a(25),
    "--ds-accent-topbar-1": a(32),
    "--ds-accent-topbar-2": a(18),
    "--ds-accent-topbar-3": hex,
    "--ds-accent-topbar-4": a(24),
    "--ds-accent-taskbar-1": a(35),
    "--ds-accent-taskbar-2": a(20),
    "--ds-accent-topbar-text": lightTopbar ? kit.deepText(hex, 0.12, 0.75) : "#ffffff",
    "--ds-accent-topbar-shadow": lightTopbar
      ? "0 0 8px rgba(255, 255, 255, 0.95), 0 0 3px #ffffff, 0 1px 0 #ffffff"
      : "0 1px 2px rgba(0, 0, 0, 0.65), 0 0 6px rgba(0, 0, 0, 0.35)",
  };
}

/** Windows 7 keeps the light-family palette but with these primary shades. */
function windows7Primaries(kit: ColorKit, hex: string): Record<string, string> {
  const border = kit.adjust(hex, -25);
  return {
    "--sys-primary": kit.adjust(hex, -5),
    "--sys-primary-hover": kit.adjust(hex, 14),
    "--sys-primary-active": kit.adjust(hex, -18),
    "--sys-primary-border": border,
    "--sys-border-focus": kit.adjust(hex, 10),
    "--sys-button-primary-border": border,
  };
}

const AERO_VARS = Object.keys(aeroPalette(sw.kit, sw.kit.DEFAULT_HEX));

function applyAeroAccent(): void {
  const root = document.documentElement;
  const accent = sw.accent();
  if (accent === "default") {
    // SoulWindow already cleared its own palette, including the Windows 7 primaries.
    for (const name of AERO_VARS) root.style.removeProperty(name);
    return;
  }
  const hex = sw.kit.resolveHex(accent);
  const vars = sw.theme() === "windows7" ? { ...aeroPalette(sw.kit, hex), ...windows7Primaries(sw.kit, hex) } : aeroPalette(sw.kit, hex);
  for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, value);
}

/** Applies the tints now and after every theme or accent change. Call once at startup. */
export function initAeroAccent(): void {
  applyAeroAccent();
  sw.subscribe(applyAeroAccent);
}
