/**
 * Entry point for the dynasty-scans plugin.
 *
 * Registers the sidebar tab, injects plugin-scoped styles, initializes the
 * SQLite schema, and wires the top-bar + view router. esbuild bundles this
 * (and its imports) into the root index.js IIFE via:
 *
 *   cd plugins && node build.js --plugin dynasty-scans
 */

import {
  TAB_ID,
  navigate,
  registerRenderer,
  loadPluginView,
} from "./state";
import { renderLibrary } from "./ui-library";
import { renderBrowse } from "./browse";
import { renderSeries } from "./ui-series";
import { renderReader } from "./reader/reader-controller";
import { renderCache } from "./ui-cache";
import { renderBlacklist } from "./ui-blacklist";
import { openSettingsModal, getSavedUiScale } from "./components/settings-modal";

import indexCss from "./styles/index.css?inline";
import libraryCss from "./styles/library.css?inline";
import browseCss from "./styles/browse.css?inline";
import cacheCss from "./styles/cache.css?inline";
import readerCss from "./styles/reader.css?inline";

const PLUGIN_STYLES = [indexCss, libraryCss, browseCss, cacheCss, readerCss];

const PH = window.PluginHost;
if (!PH) {
  console.error("dynasty-scans: PluginHost not available; aborting.");
} else {
  registerRenderer("library", renderLibrary);
  registerRenderer("browse", renderBrowse);
  registerRenderer("series", renderSeries);
  registerRenderer("reader", renderReader);
  registerRenderer("cache", renderCache);
  registerRenderer("blacklist", renderBlacklist);

  injectStyles();

  PH.registerTab(TAB_ID, "Dynasty Scans", "bi bi-book", renderTab);
}

function injectStyles(): void {
  if (document.getElementById("ds-style")) return;
  const style = document.createElement("style");
  style.id = "ds-style";
  style.textContent = PLUGIN_STYLES.join("\n");
  document.head.appendChild(style);
}

/**
 * Constructs the plugin tab DOM. Called on tab activation by the
 * Plugin Host; immediately initializes and loads the view.
 */
function renderTab(): HTMLElement {
  const container = document.createElement("div");
  container.id = "ds-root";
  // Apply persisted UI scale now that #ds-root element exists
  container.style.setProperty("zoom", String(getSavedUiScale()));
  container.innerHTML =
    '<div id="ds-topbar">' +
    '  <div id="ds-topbar-main">' +
    '    <div class="ds-flex-row" id="ds-nav-tabs">' +
    '      <div class="ds-segmented-switch" id="ds-view-switch">' +
    '        <button type="button" class="ds-segmented-btn" id="ds-tab-browse" title="Browse &amp; Recent">' +
    '          <i class="bi bi-compass"></i> <span class="ds-tab-text-full">Browse &amp; Recent</span><span class="ds-tab-text-short">Browse</span>' +
    "        </button>" +
    '        <button type="button" class="ds-segmented-btn" id="ds-tab-library" title="Library">' +
    '          <i class="bi bi-collection"></i> <span class="ds-tab-text-full">Library</span><span class="ds-tab-text-short">Library</span>' +
    "        </button>" +
    "      </div>" +
    '      <div id="ds-session-tab-wrap" style="display:none;margin-left:2px;"></div>' +
    "    </div>" +
    '    <span id="ds-title" style="margin-left:8px;"></span>' +
    '    <div id="ds-banner"></div>' +
    '    <div id="ds-actions"></div>' +
    '    <div id="ds-topbar-tools">' +
    '      <button type="button" class="win-button ds-btn-sm" id="ds-page-refresh-btn" title="Refresh Page">' +
    '        <i class="bi bi-arrow-clockwise"></i>' +
    '      </button>' +
    '      <button type="button" class="win-button ds-btn-sm" id="ds-settings-btn" title="Settings (UI Scale &amp; Preferences)">' +
    '        <i class="bi bi-gear-fill"></i>' +
    '      </button>' +
    "    </div>" +
    "  </div>" +
    "</div>" +
    '<div id="ds-view"></div>';

  const libBtn = container.querySelector<HTMLButtonElement>("#ds-tab-library");
  libBtn?.addEventListener("click", () => {
    navigate({ view: "library" });
  });

  const browseBtn = container.querySelector<HTMLButtonElement>("#ds-tab-browse");
  browseBtn?.addEventListener("click", () => {
    navigate({ view: "browse" });
  });

  const refreshPageBtn = container.querySelector<HTMLButtonElement>("#ds-page-refresh-btn");
  refreshPageBtn?.addEventListener("click", () => {
    window.location.reload();
  });

  const settingsBtn = container.querySelector<HTMLButtonElement>("#ds-settings-btn");
  settingsBtn?.addEventListener("click", () => {
    openSettingsModal();
  });

  const topbar = container.querySelector<HTMLElement>("#ds-topbar");
  if (topbar && typeof ResizeObserver !== "undefined") {
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        if (width < 780) {
          topbar.classList.add("ds-narrow");
        } else {
          topbar.classList.remove("ds-narrow");
        }
      }
    });
    ro.observe(topbar);
  }

  setTimeout(() => {
    void loadPluginView();
  }, 0);

  return container;
}
