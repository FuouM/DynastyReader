import { restoreStateCurrent, saveWindowState, StateFlags } from "@tauri-apps/plugin-window-state";
import { attachConsole } from "@tauri-apps/plugin-log";
import { initAppTheme } from "./theme";

// Apply the persisted theme before the plugin renders so the first paint is
// already light or dark (no flash from the default light stylesheet).
initAppTheme();

// Mirror browser console output into the tauri-plugin-log backend so the
// daemon-style `data/logs/dynasty-reader.log` file captures frontend errors
// alongside backend tracing output.
attachConsole();

// Restore on open, save on close — handled by the official window-state plugin
// which correctly accounts for DWM extended-frame coordinates on Windows.
restoreStateCurrent(StateFlags.ALL).catch((err) => {
  console.error("dynasty-scans-reader: window state restore error:", err);
});
window.addEventListener("unload", () => {
  saveWindowState(StateFlags.ALL).catch((err) => {
    console.error("dynasty-scans-reader: window state save error:", err);
  });
});

import "./host-shim";
import "./styles/curator-ui-base.css";
import "bootstrap-icons/font/bootstrap-icons.css";


// Plugin entry point — host-shim's registerTab mounts it immediately.
// index.ts imports its per-view CSS via `?inline` and injects a <style>
// element itself, so no per-view stylesheet imports are needed here.
import "./index";
