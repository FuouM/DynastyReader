import type { HotkeyDefinition, HotkeyActionId, HotkeyCategory, CustomHotkeysMap } from "./types";
import { t } from "../i18n";

export const HOTKEY_DEFINITIONS: HotkeyDefinition[] = [
  // ── Reader Controls ──────────────────────────────────────────────────────────
  {
    id: "reader.nextPage",
    get label() { return t("settings.hotkeys.actions.readerNextPage"); },
    get description() { return t("settings.hotkeys.actions.readerNextPageDesc"); },
    get category() { return t("settings.hotkeys.categories.reader") as HotkeyCategory; },
    scope: "reader",
    defaultKeys: ["ArrowRight", "Space"],
  },
  {
    id: "reader.prevPage",
    get label() { return t("settings.hotkeys.actions.readerPrevPage"); },
    get description() { return t("settings.hotkeys.actions.readerPrevPageDesc"); },
    get category() { return t("settings.hotkeys.categories.reader") as HotkeyCategory; },
    scope: "reader",
    defaultKeys: ["ArrowLeft"],
  },
  {
    id: "reader.firstPage",
    get label() { return t("settings.hotkeys.actions.readerFirstPage"); },
    get description() { return t("settings.hotkeys.actions.readerFirstPageDesc"); },
    get category() { return t("settings.hotkeys.categories.reader") as HotkeyCategory; },
    scope: "reader",
    defaultKeys: ["Home"],
  },
  {
    id: "reader.lastPage",
    get label() { return t("settings.hotkeys.actions.readerLastPage"); },
    get description() { return t("settings.hotkeys.actions.readerLastPageDesc"); },
    get category() { return t("settings.hotkeys.categories.reader") as HotkeyCategory; },
    scope: "reader",
    defaultKeys: ["End"],
  },
  {
    id: "reader.nextChapter",
    get label() { return t("settings.hotkeys.actions.readerNextChapter"); },
    get description() { return t("settings.hotkeys.actions.readerNextChapterDesc"); },
    get category() { return t("settings.hotkeys.categories.reader") as HotkeyCategory; },
    scope: "reader",
    defaultKeys: ["]", "Shift+ArrowRight"],
  },
  {
    id: "reader.prevChapter",
    get label() { return t("settings.hotkeys.actions.readerPrevChapter"); },
    get description() { return t("settings.hotkeys.actions.readerPrevChapterDesc"); },
    get category() { return t("settings.hotkeys.categories.reader") as HotkeyCategory; },
    scope: "reader",
    defaultKeys: ["[", "Shift+ArrowLeft"],
  },
  {
    id: "reader.toggleMode",
    get label() { return t("settings.hotkeys.actions.readerToggleMode"); },
    get description() { return t("settings.hotkeys.actions.readerToggleModeDesc"); },
    get category() { return t("settings.hotkeys.categories.reader") as HotkeyCategory; },
    scope: "reader",
    defaultKeys: ["m"],
  },
  {
    id: "reader.toggleSpread",
    get label() { return t("settings.hotkeys.actions.readerToggleSpread"); },
    get description() { return t("settings.hotkeys.actions.readerToggleSpreadDesc"); },
    get category() { return t("settings.hotkeys.categories.reader") as HotkeyCategory; },
    scope: "reader",
    defaultKeys: ["s"],
  },
  {
    id: "reader.toggleDirection",
    get label() { return t("settings.hotkeys.actions.readerToggleDirection"); },
    get description() { return t("settings.hotkeys.actions.readerToggleDirectionDesc"); },
    get category() { return t("settings.hotkeys.categories.reader") as HotkeyCategory; },
    scope: "reader",
    defaultKeys: ["d"],
  },
  {
    id: "reader.toggleCoverOffset",
    get label() { return t("settings.hotkeys.actions.readerToggleCoverOffset"); },
    get description() { return t("settings.hotkeys.actions.readerToggleCoverOffsetDesc"); },
    get category() { return t("settings.hotkeys.categories.reader") as HotkeyCategory; },
    scope: "reader",
    defaultKeys: ["c"],
  },
  {
    id: "reader.toggleScrollLock",
    get label() { return t("settings.hotkeys.actions.readerToggleScrollLock"); },
    get description() { return t("settings.hotkeys.actions.readerToggleScrollLockDesc"); },
    get category() { return t("settings.hotkeys.categories.reader") as HotkeyCategory; },
    scope: "reader",
    defaultKeys: ["l"],
  },
  {
    id: "reader.toggleFullscreen",
    get label() { return t("settings.hotkeys.actions.readerToggleFullscreen"); },
    get description() { return t("settings.hotkeys.actions.readerToggleFullscreenDesc"); },
    get category() { return t("settings.hotkeys.categories.reader") as HotkeyCategory; },
    scope: "reader",
    defaultKeys: ["f", "F11"],
  },
  {
    id: "reader.zoomIn",
    get label() { return t("settings.hotkeys.actions.readerZoomIn"); },
    get description() { return t("settings.hotkeys.actions.readerZoomInDesc"); },
    get category() { return t("settings.hotkeys.categories.reader") as HotkeyCategory; },
    scope: "reader",
    defaultKeys: ["+", "=", "Ctrl+="],
  },
  {
    id: "reader.zoomOut",
    get label() { return t("settings.hotkeys.actions.readerZoomOut"); },
    get description() { return t("settings.hotkeys.actions.readerZoomOutDesc"); },
    get category() { return t("settings.hotkeys.categories.reader") as HotkeyCategory; },
    scope: "reader",
    defaultKeys: ["-", "_", "Ctrl+-"],
  },
  {
    id: "reader.resetZoom",
    get label() { return t("settings.hotkeys.actions.readerResetZoom"); },
    get description() { return t("settings.hotkeys.actions.readerResetZoomDesc"); },
    get category() { return t("settings.hotkeys.categories.reader") as HotkeyCategory; },
    scope: "reader",
    defaultKeys: ["0", "Ctrl+0"],
  },

  // ── Navigation & Global Controls ─────────────────────────────────────────────
  {
    id: "global.goBack",
    get label() { return t("settings.hotkeys.actions.globalGoBack"); },
    get description() { return t("settings.hotkeys.actions.globalGoBackDesc"); },
    get category() { return t("settings.hotkeys.categories.navigation") as HotkeyCategory; },
    scope: "global",
    defaultKeys: ["Alt+ArrowLeft", "Backspace"],
  },
  {
    id: "global.goForward",
    get label() { return t("settings.hotkeys.actions.globalGoForward"); },
    get description() { return t("settings.hotkeys.actions.globalGoForwardDesc"); },
    get category() { return t("settings.hotkeys.categories.navigation") as HotkeyCategory; },
    scope: "global",
    defaultKeys: ["Alt+ArrowRight"],
  },
  {
    id: "global.toggleTheme",
    get label() { return t("settings.hotkeys.actions.globalToggleTheme"); },
    get description() { return t("settings.hotkeys.actions.globalToggleThemeDesc"); },
    get category() { return t("settings.hotkeys.categories.navigation") as HotkeyCategory; },
    scope: "global",
    defaultKeys: ["t"],
  },
  {
    id: "global.openSettings",
    get label() { return t("settings.hotkeys.actions.globalOpenSettings"); },
    get description() { return t("settings.hotkeys.actions.globalOpenSettingsDesc"); },
    get category() { return t("settings.hotkeys.categories.navigation") as HotkeyCategory; },
    scope: "global",
    defaultKeys: ["Ctrl+,"],
  },
  {
    id: "global.navBrowse",
    get label() { return t("settings.hotkeys.actions.globalNavBrowse"); },
    get description() { return t("settings.hotkeys.actions.globalNavBrowseDesc"); },
    get category() { return t("settings.hotkeys.categories.navigation") as HotkeyCategory; },
    scope: "global",
    defaultKeys: ["Alt+1"],
  },
  {
    id: "global.navLibrary",
    get label() { return t("settings.hotkeys.actions.globalNavLibrary"); },
    get description() { return t("settings.hotkeys.actions.globalNavLibraryDesc"); },
    get category() { return t("settings.hotkeys.categories.navigation") as HotkeyCategory; },
    scope: "global",
    defaultKeys: ["Alt+2"],
  },
  {
    id: "global.closeTab",
    get label() { return t("settings.hotkeys.actions.globalCloseTab"); },
    get description() { return t("settings.hotkeys.actions.globalCloseTabDesc"); },
    get category() { return t("settings.hotkeys.categories.navigation") as HotkeyCategory; },
    scope: "global",
    defaultKeys: ["Ctrl+w"],
  },
];

export const HOTKEY_DEFINITIONS_MAP = Object.fromEntries(
  HOTKEY_DEFINITIONS.map((def) => [def.id, def]),
) as Record<HotkeyActionId, HotkeyDefinition>;

export function getDefaultHotkeys(): CustomHotkeysMap {
  return Object.fromEntries(
    HOTKEY_DEFINITIONS.map((def) => [def.id, [...def.defaultKeys]]),
  ) as CustomHotkeysMap;
}
