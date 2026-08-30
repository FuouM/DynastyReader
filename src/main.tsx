import { render } from "solid-js/web";
import { restoreStateCurrent, saveWindowState, StateFlags } from "@tauri-apps/plugin-window-state";
import { attachConsole } from "@tauri-apps/plugin-log";
import { initAppTheme, showBanner } from "./stores";
import { t } from "./i18n";
import { initDb } from "./db";
import { errorMessage } from "./utils/errors";
import { App } from "./App";

// Apply the persisted theme before the plugin renders so the first paint is
// already light or dark (no flash from the default light stylesheet).
initAppTheme();

// Mirror browser console output into the tauri-plugin-log backend so the
// daemon-style `data/logs/dynasty-reader.log` file captures frontend errors
// alongside backend tracing output.
if (typeof window !== "undefined" && ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)) {
  attachConsole().catch(() => {});
}

// Restore on open, save on close — handled by the official window-state plugin on desktop
if (typeof window !== "undefined" && ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)) {
  restoreStateCurrent(StateFlags.ALL).catch((_err) => {
    // Expected to fail silently on mobile (window-state plugin is desktop-only)
  });
  window.addEventListener("unload", () => {
    saveWindowState(StateFlags.ALL).catch((_err) => {});
  });
}

import "./styles/tokens.css";
import "./styles/themes/dark.css";
import "./styles/themes/high-contrast.css";
import "./styles/themes/windows7.css";
import "./styles/reset.css";
import "./styles/curator-ui-base.css";
import "./styles/index.css";
import "./styles/library.css";
import "./styles/browse.css";
import "./styles/cache.css";
import "./styles/reader.css";
import "./styles/utilities.css";
import "./styles/mobile.css";
import "bootstrap-icons/font/bootstrap-icons.css";

// Initialize database schema before mounting so every pane's first query
// (including LocalPane's `local_series`) sees the migrated tables.
async function bootstrap() {
  try {
    await initDb();
    const { setDbReady } = await import("./stores/router");
    setDbReady(true);
  } catch (err) {
    const msg = errorMessage(err);
    console.error("dynasty-scans: db init failed:", msg);
    showBanner(t("main.dbInitFailedBanner", { msg }));
  }

  const appEl = document.getElementById("app");
  if (appEl) {
    render(() => <App />, appEl);
  }
}

void bootstrap();