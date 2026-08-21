import type { HotkeyDefinition, HotkeyActionId, CustomHotkeysMap } from "./types";

export const HOTKEY_DEFINITIONS: HotkeyDefinition[] = [
  // ── Reader Controls ──────────────────────────────────────────────────────────
  {
    id: "reader.nextPage",
    label: "Next Page / Step Forward",
    description: "Advance to the next page or spread in reader view.",
    category: "Reader Controls",
    scope: "reader",
    defaultKeys: ["ArrowRight", "Space"],
  },
  {
    id: "reader.prevPage",
    label: "Previous Page / Step Backward",
    description: "Go back to the previous page or spread in reader view.",
    category: "Reader Controls",
    scope: "reader",
    defaultKeys: ["ArrowLeft"],
  },
  {
    id: "reader.firstPage",
    label: "Jump to First Page",
    description: "Jump immediately to the first page of the current chapter.",
    category: "Reader Controls",
    scope: "reader",
    defaultKeys: ["Home"],
  },
  {
    id: "reader.lastPage",
    label: "Jump to Last Page",
    description: "Jump immediately to the last page of the current chapter.",
    category: "Reader Controls",
    scope: "reader",
    defaultKeys: ["End"],
  },
  {
    id: "reader.nextChapter",
    label: "Next Chapter",
    description: "Navigate to the next chapter in the series.",
    category: "Reader Controls",
    scope: "reader",
    defaultKeys: ["]", "Shift+ArrowRight"],
  },
  {
    id: "reader.prevChapter",
    label: "Previous Chapter",
    description: "Navigate to the previous chapter in the series.",
    category: "Reader Controls",
    scope: "reader",
    defaultKeys: ["[", "Shift+ArrowLeft"],
  },
  {
    id: "reader.toggleMode",
    label: "Cycle Reader Mode (Paged / Scroll)",
    description: "Switch between horizontal paged mode and vertical webtoon scroll mode.",
    category: "Reader Controls",
    scope: "reader",
    defaultKeys: ["m"],
  },
  {
    id: "reader.toggleSpread",
    label: "Toggle Spread Layout",
    description: "Toggle between single page and two-page spread in paged mode.",
    category: "Reader Controls",
    scope: "reader",
    defaultKeys: ["s"],
  },
  {
    id: "reader.toggleDirection",
    label: "Toggle Reading Direction (LTR / RTL)",
    description: "Switch page progression between Right-to-Left (Manga) and Left-to-Right.",
    category: "Reader Controls",
    scope: "reader",
    defaultKeys: ["d"],
  },
  {
    id: "reader.toggleCoverOffset",
    label: "Toggle Cover Offset (Cover 1st)",
    description: "In spread mode, show the first page standalone as a cover.",
    category: "Reader Controls",
    scope: "reader",
    defaultKeys: ["c"],
  },
  {
    id: "reader.toggleScrollLock",
    label: "Toggle Scroll Mode / Smooth Slide",
    description: "Toggle discrete page lock or smooth scrolling animation.",
    category: "Reader Controls",
    scope: "reader",
    defaultKeys: ["l"],
  },
  {
    id: "reader.toggleFullscreen",
    label: "Toggle Fullscreen",
    description: "Enter or exit fullscreen reading mode.",
    category: "Reader Controls",
    scope: "reader",
    defaultKeys: ["f", "F11"],
  },
  {
    id: "reader.zoomIn",
    label: "Zoom In (Original Fit)",
    description: "Enlarge original-size page image.",
    category: "Reader Controls",
    scope: "reader",
    defaultKeys: ["+", "=", "Ctrl+="],
  },
  {
    id: "reader.zoomOut",
    label: "Zoom Out (Original Fit)",
    description: "Shrink original-size page image.",
    category: "Reader Controls",
    scope: "reader",
    defaultKeys: ["-", "_", "Ctrl+-"],
  },
  {
    id: "reader.resetZoom",
    label: "Reset Zoom",
    description: "Reset zoom factor back to 100%.",
    category: "Reader Controls",
    scope: "reader",
    defaultKeys: ["0", "Ctrl+0"],
  },

  // ── Navigation & Global Controls ─────────────────────────────────────────────
  {
    id: "global.goBack",
    label: "Navigate Back",
    description: "Return to the previous view in browsing history.",
    category: "Navigation & App",
    scope: "global",
    defaultKeys: ["Alt+ArrowLeft", "Backspace"],
  },
  {
    id: "global.goForward",
    label: "Navigate Forward",
    description: "Advance to the next view in browsing history.",
    category: "Navigation & App",
    scope: "global",
    defaultKeys: ["Alt+ArrowRight"],
  },
  {
    id: "global.toggleTheme",
    label: "Toggle Theme (Light / Dark)",
    description: "Switch application theme between light and dark modes.",
    category: "Navigation & App",
    scope: "global",
    defaultKeys: ["t"],
  },
  {
    id: "global.openSettings",
    label: "Open Settings",
    description: "Open the application settings and preferences dialog.",
    category: "Navigation & App",
    scope: "global",
    defaultKeys: ["Ctrl+,"],
  },
  {
    id: "global.navBrowse",
    label: "Go to Browse & Recent",
    description: "Switch to the Browse & Recent releases view.",
    category: "Navigation & App",
    scope: "global",
    defaultKeys: ["Alt+1"],
  },
  {
    id: "global.navLibrary",
    label: "Go to Library",
    description: "Switch to the Collections & Library view.",
    category: "Navigation & App",
    scope: "global",
    defaultKeys: ["Alt+2"],
  },
  {
    id: "global.closeTab",
    label: "Close Session Tab",
    description: "Close active session manga / reader tab.",
    category: "Navigation & App",
    scope: "global",
    defaultKeys: ["Ctrl+w"],
  },
];

export const HOTKEY_DEFINITIONS_MAP: Record<HotkeyActionId, HotkeyDefinition> =
  HOTKEY_DEFINITIONS.reduce((acc, def) => {
    acc[def.id] = def;
    return acc;
  }, {} as Record<HotkeyActionId, HotkeyDefinition>);

export function getDefaultHotkeys(): CustomHotkeysMap {
  const map: Partial<CustomHotkeysMap> = {};
  for (const def of HOTKEY_DEFINITIONS) {
    map[def.id] = [...def.defaultKeys];
  }
  return map as CustomHotkeysMap;
}
