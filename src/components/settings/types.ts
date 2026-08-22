import type { BootstrapIconName } from "../Icon";
import { t } from "../../i18n";
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

export const getSettingsSections = (): SettingsSection[] => [
  { id: "display", label: t("settings.sections.display"), icon: "aspect-ratio" },
  { id: "blacklist", label: t("settings.sections.blacklist"), icon: "shield-slash" },
  { id: "reading", label: t("settings.sections.reading"), icon: "book" },
  { id: "hotkeys", label: t("settings.sections.hotkeys"), icon: "keyboard" },
  { id: "storage", label: t("settings.sections.storage"), icon: "hdd-stack" },
  { id: "about", label: t("settings.sections.about"), icon: "info-circle" },
];
export const SETTINGS_SECTIONS = getSettingsSections();

export const SCALE_PRESETS = [0.75, 0.85, 1.0, 1.15, 1.25, 1.5];
