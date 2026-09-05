import type { BootstrapIconName } from "../Icon";
import { t } from "../../i18n";

export type SettingsSectionId =
  | "display"
  | "blacklist"
  | "reading"
  | "hotkeys"
  | "storage"
  | "advanced"
  | "about";

export interface SettingsSection {
  id: SettingsSectionId;
  label: string;
  icon: BootstrapIconName;
}

export const getSettingsSections = (): SettingsSection[] => [
  { id: "display", get label() { return t("settings.sections.display"); }, icon: "aspect-ratio" },
  { id: "blacklist", get label() { return t("settings.sections.blacklist"); }, icon: "shield-slash" },
  { id: "reading", get label() { return t("settings.sections.reading"); }, icon: "book" },
  { id: "hotkeys", get label() { return t("settings.sections.hotkeys"); }, icon: "keyboard" },
  { id: "storage", get label() { return t("settings.sections.storage"); }, icon: "hdd-stack" },
  { id: "advanced", get label() { return t("settings.sections.advanced"); }, icon: "sliders" },
  { id: "about", get label() { return t("settings.sections.about"); }, icon: "info-circle" },
];

export const SETTINGS_SECTIONS: readonly SettingsSection[] = getSettingsSections();

export const SCALE_PRESETS = [0.75, 0.85, 1.0, 1.15, 1.25, 1.5];
