import { render } from "solid-js/web";
import { restoreStateCurrent, saveWindowState, StateFlags } from "@tauri-apps/plugin-window-state";
import { attachConsole } from "@tauri-apps/plugin-log";
import { initAeroAccent } from "./stores/aero-accent";
import { showBanner } from "./stores/topbar";
import { setDbReady, navigate } from "./stores/router";
import { initGlobalDownloadListener } from "./stores/download";
import { t } from "./i18n";
import { initDb } from "./db/schema";
import { errorMessage } from "./utils/formatting";
import { log } from "./utils/log";
import { App } from "./App";

// SoulWindow's boot script (vite.config.ts) already painted the saved theme and accent;
// importing ./stores/theme hands control to the live controller. Aero tints follow it.
initAeroAccent();
if (typeof window !== "undefined") {
  window.__NAVIGATE__ = navigate;
}

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
  window.addEventListener("pagehide", () => {
    saveWindowState(StateFlags.ALL).catch((_err) => {});
  });
}

import "soulwindow/css";
// DynastyReader-only tokens and theme add-ons, on top of SoulWindow's.
import "./styles/tokens.css";
import "./styles/themes/dark.css";
import "./styles/themes/high-contrast.css";
import "./styles/themes/windows7.css";
import "./styles/themes/windows7-aero.css";
import "./styles/index.css";
import "./styles/settings.css";
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
    setDbReady(true);
    initGlobalDownloadListener();
  } catch (err) {
    const msg = errorMessage(err);
    log.error("main", "db init failed:", msg);
    showBanner(t("main.dbInitFailedBanner", { msg }));
  }

  const appEl = document.getElementById("app");
  if (appEl) {
    render(() => <App />, appEl);
  }
}

void bootstrap();