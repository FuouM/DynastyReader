/**
 * Type definitions for the unified hotkey management system.
 */

export type HotkeyScope = "reader" | "global";

export type HotkeyCategory = "Reader Controls" | "Navigation & App";

export type ReaderActionId =
  | "reader.nextPage"
  | "reader.prevPage"
  | "reader.firstPage"
  | "reader.lastPage"
  | "reader.nextChapter"
  | "reader.prevChapter"
  | "reader.toggleMode"
  | "reader.toggleSpread"
  | "reader.toggleDirection"
  | "reader.toggleCoverOffset"
  | "reader.toggleScrollLock"
  | "reader.toggleFullscreen"
  | "reader.toggleToolbar"
  | "reader.zoomIn"
  | "reader.zoomOut"
  | "reader.resetZoom";

export type GlobalActionId =
  | "global.goBack"
  | "global.goForward"
  | "global.toggleTheme"
  | "global.openSettings"
  | "global.navBrowse"
  | "global.navLibrary"
  | "global.closeTab";

export type HotkeyActionId = ReaderActionId | GlobalActionId;

export interface HotkeyDefinition {
  id: HotkeyActionId;
  label: string;
  description: string;
  category: HotkeyCategory;
  scope: HotkeyScope;
  defaultKeys: string[];
}

export type CustomHotkeysMap = Record<HotkeyActionId, string[]>;
