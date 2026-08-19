/**
 * Settings modal dialog for DynastyReader:
 * - UI Scale multiplier (75% to 150%, persisted in localStorage)
 * - Navigation shortcut to Cache Management
 * - General preferences
 */

import { navigate, renderCurrent, safeHtml } from "../state";
import {
  addBlacklistedTag,
  getBlacklistedTags,
  removeBlacklistedTag,
  getBlacklistMode,
  setBlacklistMode,
} from "../db";
import type { BlacklistedTag } from "../db";
import { openExternal, suggest } from "../api";
import { browseCovers } from "../browse/browse-covers";
import {
  isAutoCacheChapterEnabled,
  setAutoCacheChapterEnabled,
  getPrefetchBuffer,
  setPrefetchBuffer,
  getReaderNavPosition,
  setReaderNavPosition,
} from "../reader/settings";
import { attachTypeahead } from "./typeahead";
import { getAppTheme, toggleAppTheme } from "../theme";
import { checkUpdates } from "./update-dialog";
import * as ipc from "../ipc";
import { getSavedUiScale, applyUiScale } from "../ui-scale";
import { openModal, applyModalZoom } from "./modal";

const SCALE_PRESETS = [0.75, 0.85, 1.0, 1.15, 1.25, 1.5];

export function openSettingsModal(): void {
  if (document.getElementById("ds-settings-modal-backdrop")) return;

  const currentScale = getSavedUiScale();

  // If the saved scale is not one of the presets (e.g. 90% from +/-), add a
  // selected custom option so the dropdown reflects the real value on open.
  const scaleOptionsHtml = SCALE_PRESETS.map(
    (s) =>
      `<option value="${s}" ${Math.abs(s - currentScale) < 0.01 ? "selected" : ""}>${Math.round(s * 100)}%${s === 1.0 ? " (Default)" : ""}</option>`,
  ).join("");
  const hasScalePreset = SCALE_PRESETS.some((s) => Math.abs(s - currentScale) < 0.01);
  const scaleCustomHtml = hasScalePreset
    ? ""
    : `<option value="${currentScale}" selected>${Math.round(currentScale * 100)}% (Custom)</option>`;

  const bodyHtml =
    '<div style="display:flex;flex-direction:column;gap:12px;">' +
    '  <div class="group-box" style="margin-top:4px;">' +
    '    <div class="group-box-title"><i class="bi bi-aspect-ratio"></i> Display &amp; Scaling</div>' +
    '    <div style="display:flex;flex-direction:column;gap:8px;">' +
    '      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">' +
    '        <label for="ds-settings-scale-select" style="font-size:12px;color:var(--sys-window-text,#333);font-weight:600;">UI Scale Factor:</label>' +
    '        <div style="display:flex;align-items:center;gap:4px;flex-shrink:0;">' +
    '          <button type="button" class="win-button ds-btn-sm" id="ds-settings-scale-dec" title="Decrease Scale (-10%)">' +
    '            <i class="bi bi-dash-lg"></i>' +
    "          </button>" +
    '          <select id="ds-settings-scale-select" class="input-field" style="width:115px;height:24px;font-size:11px;">' +
    scaleOptionsHtml + scaleCustomHtml +
    "          </select>" +
    '          <button type="button" class="win-button ds-btn-sm" id="ds-settings-scale-inc" title="Increase Scale (+10%)">' +
    '            <i class="bi bi-plus-lg"></i>' +
    "          </button>" +
    '          <button type="button" class="win-button ds-btn-sm" id="ds-settings-scale-reset" title="Reset to 100%">' +
    "            100%" +
    "          </button>" +
    "        </div>" +
    "      </div>" +
    '      <div class="ds-muted" style="font-size:11px;color:var(--sys-text-muted,#666);">' +
    "        Scales all application typography, panels, buttons, and navigation controls." +
    "      </div>" +
    '      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">' +
    '        <div style="flex:1;min-width:0;">' +
    '          <div style="font-size:12px;color:var(--sys-window-text,#333);font-weight:600;">Theme:</div>' +
    '          <div class="ds-muted" style="font-size:11px;color:var(--sys-text-muted,#666);">Switch the entire application between light and dark mode.</div>' +
    '        </div>' +
    '        <div class="ds-segmented-switch" id="ds-settings-theme-switch" style="flex-shrink:0;">' +
    '          <button type="button" class="ds-segmented-btn" id="ds-settings-theme-light" title="Light theme">' +
    '            <i class="bi bi-sun"></i> Light' +
    '          </button>' +
    '          <button type="button" class="ds-segmented-btn" id="ds-settings-theme-dark" title="Dark theme">' +
    '            <i class="bi bi-moon-fill"></i> Dark' +
    '          </button>' +
    '        </div>' +
    '      </div>' +
    '      <div style="display:flex;align-items:center;justify-content:space-between;padding-top:6px;border-top:1px solid var(--sys-border-light,#eaeaea);gap:8px;">' +
    '        <div style="flex:1;min-width:0;">' +
    '          <div style="font-size:12px;color:var(--sys-window-text,#333);font-weight:600;">Feed Cover Thumbnails:</div>' +
    '          <div class="ds-muted" style="font-size:11px;color:var(--sys-text-muted,#666);">Load and display cover thumbnails in browse feeds.</div>' +
    '        </div>' +
    '        <button type="button" class="win-button" id="ds-settings-covers-toggle" style="font-size:11px;padding:2px 10px;min-width:90px;flex-shrink:0;"></button>' +
    "      </div>" +
    "    </div>" +
    "  </div>" +
    '  <div class="group-box">' +
    '    <div class="group-box-title"><i class="bi bi-shield-slash"></i> Tag Blacklist</div>' +
    '    <div style="display:flex;flex-direction:column;gap:8px;">' +
    '      <div class="ds-muted" style="font-size:11px;color:var(--sys-text-muted,#666);">' +
    "        Hide or show trigger warnings for releases and chapters matching these tags." +
    "      </div>" +
    '      <div style="display:flex;align-items:center;gap:12px;padding:2px 0;background:var(--sys-bg-active,#f8f9fa);border:1px solid var(--sys-border-light,#e2e2e2);border-radius:3px;padding:4px 8px;">' +
    '        <span style="font-size:11px;font-weight:600;color:var(--sys-window-text,#333);">Mode:</span>' +
    '        <label style="display:inline-flex;align-items:center;gap:4px;font-size:11px;cursor:pointer;">' +
    '          <input type="radio" name="ds-bl-mode" value="hide" id="ds-bl-mode-hide" />' +
    '          <span>Hide releases</span>' +
    '        </label>' +
    '        <label style="display:inline-flex;align-items:center;gap:4px;font-size:11px;cursor:pointer;">' +
    '          <input type="radio" name="ds-bl-mode" value="warn" id="ds-bl-mode-warn" />' +
    '          <span>Trigger warning on click</span>' +
    '        </label>' +
    '      </div>' +
    '      <div style="display:flex;gap:6px;position:relative;">' +
    '        <div class="input-wrapper" style="flex:1;">' +
    '          <input type="text" id="ds-settings-blacklist-input" class="input-field has-clear"' +
    '            placeholder="Search or enter tag to blacklist (e.g. NSFW, Het)..." style="width:100%;box-sizing:border-box;font-size:11px;height:24px;" />' +
    '          <button type="button" class="input-clear-btn" tabindex="-1" title="Clear">' +
    '            <i class="bi bi-x-lg"></i>' +
    '          </button>' +
    '          <div id="ds-settings-blacklist-suggest" class="ds-typeahead ds-hidden" style="max-height:160px;"></div>' +
    "        </div>" +
    '        <button type="button" class="win-button" id="ds-settings-blacklist-add" style="font-size:11px;padding:2px 10px;">' +
    '          <i class="bi bi-plus-lg"></i> Add' +
    "        </button>" +
    "      </div>" +
    '      <div id="ds-settings-blacklist-chips" style="display:flex;flex-wrap:wrap;gap:4px;min-height:22px;max-height:120px;overflow-y:auto;padding:2px 0;">' +
    '        <span class="ds-muted" style="font-size:10px;">Loading blacklist…</span>' +
    "      </div>" +
    "    </div>" +
    "  </div>" +
    '  <div class="group-box">' +
    '    <div class="group-box-title"><i class="bi bi-book-half"></i> Reading &amp; Cache</div>' +
    '    <div style="display:flex;flex-direction:column;gap:8px;">' +
    '      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">' +
    '        <div>' +
    '          <div style="font-size:12px;color:var(--sys-window-text,#222);font-weight:600;">Auto-Cache Entire Chapter</div>' +
    '          <div class="ds-muted" style="font-size:11px;color:var(--sys-text-muted,#666);">' +
    "            When ON, pre-downloads all pages in a chapter. When OFF, only caches pages as you read them." +
    "          </div>" +
    "        </div>" +
    '        <button type="button" class="win-button" id="ds-settings-autocache-toggle" style="font-size:11px;padding:2px 10px;min-width:70px;"></button>' +
    "      </div>" +
    '      <div style="display:flex;align-items:center;justify-content:space-between;padding-top:6px;border-top:1px solid var(--sys-border-light,#eaeaea);gap:8px;">' +
    '        <div>' +
    '          <div style="font-size:12px;color:var(--sys-window-text,#222);font-weight:600;">Page Prefetch Buffer:</div>' +
    '          <div class="ds-muted" style="font-size:11px;color:var(--sys-text-muted,#666);">' +
    "            Number of upcoming pages to preload ahead when auto-cache is off (default: 0)." +
    "          </div>" +
    "        </div>" +
    '        <div style="display:flex;align-items:center;gap:4px;">' +
    '          <button type="button" class="win-button ds-btn-sm" id="ds-settings-prefetch-dec">−</button>' +
    '          <span id="ds-settings-prefetch-val" style="font-size:11px;font-weight:600;min-width:54px;text-align:center;">0 (off)</span>' +
    '          <button type="button" class="win-button ds-btn-sm" id="ds-settings-prefetch-inc">+</button>' +
    "        </div>" +
    "      </div>" +
    '      <div style="display:flex;align-items:center;justify-content:space-between;padding-top:6px;border-top:1px solid var(--sys-border-light,#eaeaea);gap:8px;">' +
    '        <div>' +
    '          <div style="font-size:12px;color:var(--sys-window-text,#222);font-weight:600;">Page Navigation Bar Position:</div>' +
    '          <div class="ds-muted" style="font-size:11px;color:var(--sys-text-muted,#666);">' +
    "            Dock page navigation &amp; progress at top or bottom (recommended for mobile/narrow screens)." +
    "          </div>" +
    "        </div>" +
    '        <div class="ds-segmented-switch" id="ds-settings-nav-pos-switch" style="flex-shrink:0;">' +
    '          <button type="button" class="ds-segmented-btn" id="ds-settings-nav-pos-top" title="Top (default)">' +
    '            <i class="bi bi-align-top"></i> Top' +
    '          </button>' +
    '          <button type="button" class="ds-segmented-btn" id="ds-settings-nav-pos-bottom" title="Bottom (mobile / thumb friendly)">' +
    '            <i class="bi bi-align-bottom"></i> Bottom' +
    '          </button>' +
    "        </div>" +
    "      </div>" +
    "    </div>" +
    "  </div>" +
    '  <div class="group-box">' +
    '    <div class="group-box-title"><i class="bi bi-hdd-stack"></i> Storage &amp; Cache</div>' +
    '    <div style="display:flex;align-items:center;justify-content:space-between;padding:2px 0;">' +
    '      <span style="font-size:12px;color:var(--sys-window-text,#333);">Manage disk footprint &amp; scans:</span>' +
    '      <button type="button" class="win-button" id="ds-settings-goto-cache">' +
    '        <i class="bi bi-box-arrow-in-right"></i> Open Cache Manager' +
    '      </button>' +
    "    </div>" +
    '    <div style="display:flex;align-items:center;justify-content:space-between;padding:2px 0;margin-top:4px;">' +
    '      <span style="font-size:12px;color:var(--sys-window-text,#333);">Series Blacklist:</span>' +
    '      <button type="button" class="win-button" id="ds-settings-goto-blacklist" title="Manage blacklisted series">' +
    '        <i class="bi bi-shield-slash"></i> Open Series Blacklist' +
    '      </button>' +
    "    </div>" +
    '    <div style="display:flex;align-items:center;justify-content:space-between;padding:2px 0;margin-top:4px;">' +
    '      <span style="font-size:12px;color:var(--sys-window-text,#333);">Troubleshooting:</span>' +
    '      <button type="button" class="win-button" id="ds-settings-open-logs" title="Reveal the rolling log file in Explorer">' +
    '        <i class="bi bi-folder2-open"></i> Open Logs Folder' +
    '      </button>' +
    "    </div>" +
    "  </div>" +
    '  <div class="group-box">' +
    '    <div class="group-box-title"><i class="bi bi-info-circle"></i> About DynastyReader</div>' +
    '    <div style="display:flex;align-items:center;gap:12px;padding:4px 0;">' +
    '      <img src="/icon.svg" width="34" height="34" alt="DynastyReader" style="border-radius:4px;flex-shrink:0;user-select:none;pointer-events:none;" />' +
    '      <div class="ds-fill">' +
    '        <div style="font-size:12px;font-weight:600;color:var(--sys-window-text,#222);display:flex;align-items:center;gap:6px;">' +
    '          DynastyReader <span class="ds-etag-tag" style="font-size:10px;font-weight:normal;padding:1px 6px;">v0.1.0</span>' +
    "        </div>" +
    '        <div class="ds-muted" style="font-size:11px;margin-top:2px;">' +
    "          Local-first desktop reader &amp; offline manga catalog for Dynasty Scans." +
    "        </div>" +
    "      </div>" +
    '      <div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0;">' +
    '        <button type="button" class="win-button ds-btn-compact" id="ds-about-check-update" title="Check for DynastyReader updates">' +
    '          <i class="bi bi-arrow-repeat"></i> Check Updates' +
    '        </button>' +
    '        <button type="button" class="win-button ds-btn-compact" id="ds-about-open-github" title="Open DynastyReader GitHub repository">' +
    '          <i class="bi bi-github"></i> GitHub' +
    '        </button>' +
    '        <button type="button" class="win-button ds-btn-compact" id="ds-about-open-site" title="Open Dynasty Scans website in browser">' +
    '          <i class="bi bi-box-arrow-up-right"></i> dynasty-scans.com' +
    '        </button>' +
    '      </div>' +
    "    </div>" +
    "  </div>" +
    "</div>";

  const footerHtml =
    '<div style="display:flex;justify-content:flex-end;gap:8px;width:100%;">' +
    '  <button type="button" class="win-button primary ds-modal-done" style="min-width:70px;">Done</button>' +
    "</div>";

  const { modal, close } = openModal({
    backdropId: "ds-settings-modal-backdrop",
    title: '<i class="bi bi-gear-fill"></i> Application Settings',
    width: 480,
    body: bodyHtml,
    footer: footerHtml,
  });

  modal.querySelector(".ds-modal-done")?.addEventListener("click", close);

  const scaleSelect = modal.querySelector<HTMLSelectElement>("#ds-settings-scale-select");
  const scaleDecBtn = modal.querySelector<HTMLButtonElement>("#ds-settings-scale-dec");
  const scaleIncBtn = modal.querySelector<HTMLButtonElement>("#ds-settings-scale-inc");
  const scaleResetBtn = modal.querySelector<HTMLButtonElement>("#ds-settings-scale-reset");

  const syncScaleUI = (scale: number): void => {
    applyUiScale(scale);
    applyModalZoom(modal, scale);
    // Find closest preset or select matching option
    if (scaleSelect) {
      let matched = false;
      for (let i = 0; i < scaleSelect.options.length; i++) {
        if (Math.abs(parseFloat(scaleSelect.options[i].value) - scale) < 0.01) {
          scaleSelect.selectedIndex = i;
          matched = true;
          break;
        }
      }
      if (!matched) {
        // Add or update custom option
        let customOpt = scaleSelect.querySelector<HTMLOptionElement>("option.custom-scale");
        if (!customOpt) {
          customOpt = document.createElement("option");
          customOpt.className = "custom-scale";
          scaleSelect.appendChild(customOpt);
        }
        customOpt.value = String(scale);
        customOpt.textContent = `${Math.round(scale * 100)}% (Custom)`;
        scaleSelect.value = String(scale);
      }
    }
  };

  scaleSelect?.addEventListener("change", () => {
    const val = parseFloat(scaleSelect.value);
    if (!isNaN(val)) {
      applyUiScale(val);
    }
  });

  scaleDecBtn?.addEventListener("click", () => {
    const current = getSavedUiScale();
    const next = Math.max(0.5, Math.round((current - 0.1) * 10) / 10);
    syncScaleUI(next);
  });

  scaleIncBtn?.addEventListener("click", () => {
    const current = getSavedUiScale();
    const next = Math.min(2.0, Math.round((current + 0.1) * 10) / 10);
    syncScaleUI(next);
  });

  scaleResetBtn?.addEventListener("click", () => {
    syncScaleUI(1.0);
  });

  const coversToggleBtn = modal.querySelector<HTMLButtonElement>("#ds-settings-covers-toggle");
  const updateCoversToggleUI = () => {
    if (!coversToggleBtn) return;
    coversToggleBtn.innerHTML = browseCovers.coversEnabled
      ? '<i class="bi bi-image"></i> Covers: ON'
      : '<i class="bi bi-image-slash"></i> Covers: OFF';
    coversToggleBtn.className = `win-button${browseCovers.coversEnabled ? " primary" : ""}`;
  };
  updateCoversToggleUI();
  coversToggleBtn?.addEventListener("click", () => {
    browseCovers.setCoversEnabled(!browseCovers.coversEnabled);
    updateCoversToggleUI();
    renderCurrent();
  });

  const themeLightBtn = modal.querySelector<HTMLButtonElement>("#ds-settings-theme-light");
  const themeDarkBtn = modal.querySelector<HTMLButtonElement>("#ds-settings-theme-dark");
  const updateThemeToggleUI = () => {
    if (!themeLightBtn || !themeDarkBtn) return;
    const theme = getAppTheme();
    themeLightBtn.classList.toggle("active", theme === "light");
    themeDarkBtn.classList.toggle("active", theme === "dark");
  };
  updateThemeToggleUI();
  themeLightBtn?.addEventListener("click", () => {
    toggleAppTheme();
    updateThemeToggleUI();
  });
  themeDarkBtn?.addEventListener("click", () => {
    toggleAppTheme();
    updateThemeToggleUI();
  });

  const autoCacheToggleBtn = modal.querySelector<HTMLButtonElement>("#ds-settings-autocache-toggle");
  const updateAutoCacheToggleUI = () => {
    if (!autoCacheToggleBtn) return;
    const enabled = isAutoCacheChapterEnabled();
    autoCacheToggleBtn.innerHTML = enabled
      ? '<i class="bi bi-cloud-arrow-down-fill"></i> ON'
      : '<i class="bi bi-cloud-slash"></i> OFF';
    autoCacheToggleBtn.className = `win-button${enabled ? " primary" : ""}`;
    autoCacheToggleBtn.title = enabled
      ? "Pre-downloads full chapters in background (click to cache only as you read)"
      : "Only caches pages as you read (click to auto-download full chapters)";
  };
  updateAutoCacheToggleUI();
  autoCacheToggleBtn?.addEventListener("click", () => {
    setAutoCacheChapterEnabled(!isAutoCacheChapterEnabled());
    updateAutoCacheToggleUI();
  });

  const prefetchValSpan = modal.querySelector<HTMLElement>("#ds-settings-prefetch-val");
  const prefetchDecBtn = modal.querySelector<HTMLButtonElement>("#ds-settings-prefetch-dec");
  const prefetchIncBtn = modal.querySelector<HTMLButtonElement>("#ds-settings-prefetch-inc");

  const syncPrefetchUI = (val: number) => {
    setPrefetchBuffer(val);
    if (prefetchValSpan) {
      prefetchValSpan.textContent = val === 0 ? "0 (off)" : `${val} page${val === 1 ? "" : "s"}`;
    }
  };
  syncPrefetchUI(getPrefetchBuffer());

  prefetchDecBtn?.addEventListener("click", () => {
    const cur = getPrefetchBuffer();
    syncPrefetchUI(Math.max(0, cur - 1));
  });
  prefetchIncBtn?.addEventListener("click", () => {
    const cur = getPrefetchBuffer();
    syncPrefetchUI(Math.min(10, cur + 1));
  });

  const navPosTopBtn = modal.querySelector<HTMLButtonElement>("#ds-settings-nav-pos-top");
  const navPosBottomBtn = modal.querySelector<HTMLButtonElement>("#ds-settings-nav-pos-bottom");
  const updateNavPosUI = () => {
    const pos = getReaderNavPosition();
    navPosTopBtn?.classList.toggle("active", pos === "top");
    navPosBottomBtn?.classList.toggle("active", pos === "bottom");
  };
  updateNavPosUI();
  navPosTopBtn?.addEventListener("click", () => {
    setReaderNavPosition("top");
    updateNavPosUI();
  });
  navPosBottomBtn?.addEventListener("click", () => {
    setReaderNavPosition("bottom");
    updateNavPosUI();
  });

  const cacheBtn = modal.querySelector<HTMLButtonElement>("#ds-settings-goto-cache");
  cacheBtn?.addEventListener("click", () => {
    close();
    navigate({ view: "cache" });
  });

  const blacklistBtn = modal.querySelector<HTMLButtonElement>("#ds-settings-goto-blacklist");
  blacklistBtn?.addEventListener("click", () => {
    close();
    navigate({ view: "blacklist" });
  });

  const openLogsBtn = modal.querySelector<HTMLButtonElement>("#ds-settings-open-logs");
  openLogsBtn?.addEventListener("click", () => {
    void ipc.openLogsDir().catch((err) => {
      console.error("dynasty-scans-reader: open logs folder failed:", err);
    });
  });

  const aboutUpdateBtn = modal.querySelector<HTMLButtonElement>("#ds-about-check-update");
  aboutUpdateBtn?.addEventListener("click", async () => {
    if (!aboutUpdateBtn) return;
    aboutUpdateBtn.disabled = true;
    const origHtml = aboutUpdateBtn.innerHTML;
    aboutUpdateBtn.innerHTML = '<i class="bi bi-arrow-repeat spin"></i> Checking...';
    try {
      await checkUpdates(true);
    } finally {
      if (aboutUpdateBtn.isConnected) {
        aboutUpdateBtn.disabled = false;
        aboutUpdateBtn.innerHTML = origHtml;
      }
    }
  });

  const aboutGithubBtn = modal.querySelector<HTMLButtonElement>("#ds-about-open-github");
  aboutGithubBtn?.addEventListener("click", () => {
    void openExternal("https://github.com/FuouM/DynastyReader");
  });

  const aboutSiteBtn = modal.querySelector<HTMLButtonElement>("#ds-about-open-site");
  aboutSiteBtn?.addEventListener("click", () => {
    void openExternal("https://dynasty-scans.com");
  });

  // ── Blacklist Wiring ──────────────────────────────────────────────────
  const blModeHideRadio = modal.querySelector<HTMLInputElement>("#ds-bl-mode-hide");
  const blModeWarnRadio = modal.querySelector<HTMLInputElement>("#ds-bl-mode-warn");
  const currentBlMode = getBlacklistMode();
  if (currentBlMode === "warn") {
    if (blModeWarnRadio) blModeWarnRadio.checked = true;
  } else {
    if (blModeHideRadio) blModeHideRadio.checked = true;
  }

  blModeHideRadio?.addEventListener("change", () => {
    if (blModeHideRadio.checked) {
      setBlacklistMode("hide");
      renderCurrent();
    }
  });
  blModeWarnRadio?.addEventListener("change", () => {
    if (blModeWarnRadio.checked) {
      setBlacklistMode("warn");
      renderCurrent();
    }
  });

  const blInput = modal.querySelector<HTMLInputElement>("#ds-settings-blacklist-input");
  const blSuggest = modal.querySelector<HTMLElement>("#ds-settings-blacklist-suggest");
  const blAddBtn = modal.querySelector<HTMLButtonElement>("#ds-settings-blacklist-add");
  const blChips = modal.querySelector<HTMLElement>("#ds-settings-blacklist-chips");

  const renderBlacklistChips = async () => {
    if (!blChips) return;
    blChips.innerHTML = "";
    let list: BlacklistedTag[];
    try {
      list = await getBlacklistedTags();
    } catch (err) {
      console.error("dynasty-scans-reader: failed to load tag blacklist:", err);
      blChips.innerHTML =
        '<span class="ds-muted" style="font-size:10px;color:var(--ds-danger-text);padding:2px 0;">Could not load blacklist. Check the application log.</span>';
      return;
    }
    if (list.length === 0) {
      blChips.innerHTML = '<span class="ds-muted" style="font-size:10px;padding:2px 0;">No tags blacklisted.</span>';
      return;
    }
    for (const item of list) {
      const chip = document.createElement("span");
      chip.className = "ds-row";
      chip.style.cssText =
        "background:var(--ds-danger-bg);color:var(--ds-danger-text);border:1px solid var(--ds-danger-border);border-radius:3px;padding:1px 6px;font-size:10px;align-items:center;gap:4px;";
      chip.innerHTML = `<span>${safeHtml(item.tag_name)}</span><i class="bi bi-x" style="cursor:pointer;font-size:13px;" title="Remove from blacklist"></i>`;
      chip.querySelector(".bi-x")?.addEventListener("click", async () => {
        await removeBlacklistedTag(item.tag_name);
        void renderBlacklistChips();
        renderCurrent();
      });
      blChips.appendChild(chip);
    }
  };
  void renderBlacklistChips();

  const addTag = async (name: string, permalink?: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    await addBlacklistedTag(trimmed, permalink);
    if (blInput) blInput.value = "";
    if (blSuggest) blSuggest.classList.add("ds-hidden");
    void renderBlacklistChips();
    renderCurrent();
  };

  blAddBtn?.addEventListener("click", () => {
    if (blInput?.value) void addTag(blInput.value);
  });

  // Blacklist Autocomplete
  if (blInput && blSuggest) {
    attachTypeahead(
      blInput,
      blSuggest,
      (q) => suggest(q),
      (item) => void addTag(item.name),
      { maxItems: 6, debounceMs: 200, onEnter: () => void addTag(blInput.value) },
    );
  }
}
