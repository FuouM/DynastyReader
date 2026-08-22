import type { BootstrapIconName } from "../Icon";

export type SettingsSectionId =
  | "display"
  | "blacklist"
  | "reading"
  | "hotkeys"
  | "storage"
  | "about";

export interface SettingsSection {
  id: SettingsSectionId;
  label: string;
  icon: BootstrapIconName;
}

export const SETTINGS_SECTIONS: SettingsSection[] = [
  { id: "display", label: "Display & Scaling", icon: "aspect-ratio" },
  { id: "blacklist", label: "Tag Blacklist", icon: "shield-slash" },
  { id: "reading", label: "Reading & Cache", icon: "book" },
  { id: "hotkeys", label: "Keyboard Shortcuts", icon: "keyboard" },
  { id: "storage", label: "Storage & Cache", icon: "hdd-stack" },
  { id: "about", label: "About DynastyReader", icon: "info-circle" },
];

export const SCALE_PRESETS = [0.75, 0.85, 1.0, 1.15, 1.25, 1.5];
