/**
 * In-app update checker and interactive install modal for DynastyReader.
 */

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { UpdateInfo, DownloadProgress } from "../types/api";
import { formatBytes } from "../api/traffic";
import { getSavedUiScale } from "./settings-modal";

let isUpdating = false;

export async function checkUpdates(manual = false): Promise<UpdateInfo | null> {
  try {
    const info = await invoke<UpdateInfo>("check_for_updates");
    if (info.has_update) {
      showUpdateModal(info);
      return info;
    } else if (manual) {
      showUpToDateModal(info.current_version);
    }
    return info;
  } catch (err) {
    console.error("dynasty-scans-reader: update check failed:", err);
    if (manual) {
      alert(`Could not check for updates: ${err instanceof Error ? err.message : String(err)}`);
    }
    return null;
  }
}

function showUpToDateModal(version: string): void {
  const existing = document.getElementById("ds-update-modal-backdrop");
  if (existing) existing.remove();

  const backdrop = document.createElement("div");
  backdrop.id = "ds-update-modal-backdrop";
  backdrop.className = "ds-modal-backdrop";

  const modal = document.createElement("div");
  modal.className = "ds-modal-window";
  modal.style.cssText = "width: 360px;";

  const currentScale = getSavedUiScale();
  modal.style.setProperty("zoom", String(currentScale));

  modal.innerHTML = `
    <div class="ds-modal-header">
      <span class="ds-modal-title"><i class="bi bi-check-circle-fill" style="color:var(--ds-accent,#2c7be5);"></i> Check for Updates</span>
      <button type="button" class="win-button ds-modal-close" title="Close (Esc)">
        <i class="bi bi-x-lg"></i>
      </button>
    </div>
    <div class="ds-modal-body" style="padding:16px;display:flex;flex-direction:column;gap:8px;">
      <div style="font-size:13px;font-weight:600;color:var(--sys-window-text,#222);">DynastyReader is up to date!</div>
      <div class="ds-muted" style="font-size:11px;">You are currently running version <strong>v${version}</strong>.</div>
    </div>
    <div class="ds-modal-footer" style="display:flex;justify-content:flex-end;padding:8px 12px;gap:8px;">
      <button type="button" class="win-button primary ds-modal-done" style="min-width:70px;">OK</button>
    </div>
  `;

  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);

  const close = () => {
    window.removeEventListener("keydown", onKeyDown);
    backdrop.remove();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") close();
  };
  window.addEventListener("keydown", onKeyDown);
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close();
  });
  modal.querySelector(".ds-modal-close")?.addEventListener("click", close);
  modal.querySelector(".ds-modal-done")?.addEventListener("click", close);
}

export function showUpdateModal(info: UpdateInfo): void {
  const existing = document.getElementById("ds-update-modal-backdrop");
  if (existing) existing.remove();

  const backdrop = document.createElement("div");
  backdrop.id = "ds-update-modal-backdrop";
  backdrop.className = "ds-modal-backdrop";

  const modal = document.createElement("div");
  modal.className = "ds-modal-window";
  modal.style.cssText = "width: 480px;";

  const currentScale = getSavedUiScale();
  modal.style.setProperty("zoom", String(currentScale));

  const sizeFormatted = info.asset_size > 0 ? `(${formatBytes(info.asset_size)})` : "";

  modal.innerHTML = `
    <div class="ds-modal-header">
      <span class="ds-modal-title"><i class="bi bi-cloud-arrow-down-fill"></i> Software Update Available</span>
      <button type="button" class="win-button ds-modal-close" title="Close (Esc)">
        <i class="bi bi-x-lg"></i>
      </button>
    </div>
    <div class="ds-modal-body" style="padding:16px;display:flex;flex-direction:column;gap:12px;">
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <div>
          <div style="font-size:14px;font-weight:bold;color:var(--sys-window-text,#222);">DynastyReader v${info.latest_version}</div>
          <div class="ds-muted" style="font-size:11px;">Current installed version: v${info.current_version}</div>
        </div>
        <span class="ds-etag-tag" style="font-size:11px;padding:2px 8px;font-weight:600;">Update Available</span>
      </div>

      <div class="group-box" style="margin:0;">
        <div class="group-box-title"><i class="bi bi-journal-text"></i> Release Notes</div>
        <div style="max-height:160px;overflow-y:auto;font-size:11px;line-height:1.4;white-space:pre-wrap;background:var(--sys-bg-window,#fff);padding:6px;border:1px solid var(--sys-border-light,#e2e2e2);border-radius:3px;" id="ds-update-notes">
          ${escapeHtml(info.release_notes || "No release notes provided for this version.")}
        </div>
      </div>

      <div id="ds-update-progress-container" style="display:none;flex-direction:column;gap:6px;">
        <div style="display:flex;justify-content:space-between;font-size:11px;">
          <span id="ds-update-progress-label">Downloading update ${sizeFormatted}...</span>
          <span id="ds-update-progress-pct" style="font-weight:600;">0%</span>
        </div>
        <div style="width:100%;height:14px;background:var(--sys-border-light,#e2e2e2);border-radius:3px;overflow:hidden;border:1px solid var(--sys-border-mid,#ccc);">
          <div id="ds-update-progress-bar" style="width:0%;height:100%;background:var(--ds-accent,#2c7be5);transition:width 0.2s ease;"></div>
        </div>
      </div>
    </div>
    <div class="ds-modal-footer" style="display:flex;justify-content:flex-end;gap:8px;padding:8px 16px;">
      <button type="button" class="win-button" id="ds-update-cancel-btn" style="min-width:75px;">Later</button>
      <button type="button" class="win-button primary" id="ds-update-install-btn" style="min-width:110px;">
        <i class="bi bi-download"></i> Update &amp; Restart
      </button>
    </div>
  `;

  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);

  const close = () => {
    if (isUpdating) return;
    window.removeEventListener("keydown", onKeyDown);
    backdrop.remove();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") close();
  };
  window.addEventListener("keydown", onKeyDown);

  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close();
  });

  const closeBtn = modal.querySelector<HTMLButtonElement>(".ds-modal-close");
  const cancelBtn = modal.querySelector<HTMLButtonElement>("#ds-update-cancel-btn");
  const installBtn = modal.querySelector<HTMLButtonElement>("#ds-update-install-btn");
  const progressContainer = modal.querySelector<HTMLElement>("#ds-update-progress-container");
  const progressBar = modal.querySelector<HTMLElement>("#ds-update-progress-bar");
  const progressPct = modal.querySelector<HTMLElement>("#ds-update-progress-pct");
  const progressLabel = modal.querySelector<HTMLElement>("#ds-update-progress-label");

  closeBtn?.addEventListener("click", close);
  cancelBtn?.addEventListener("click", close);

  installBtn?.addEventListener("click", async () => {
    if (isUpdating) return;
    isUpdating = true;

    if (installBtn) {
      installBtn.disabled = true;
      installBtn.innerHTML = '<i class="bi bi-hourglass-split"></i> Updating...';
    }
    if (cancelBtn) cancelBtn.disabled = true;
    if (closeBtn) closeBtn.disabled = true;
    if (progressContainer) progressContainer.style.display = "flex";

    const unlisten = await listen<DownloadProgress>("update-progress", (event) => {
      const p = event.payload;
      if (progressBar) progressBar.style.width = `${p.percentage.toFixed(1)}%`;
      if (progressPct) progressPct.textContent = `${Math.round(p.percentage)}%`;
      if (progressLabel && p.total_bytes > 0) {
        progressLabel.textContent = `Downloading (${formatBytes(p.downloaded_bytes)} / ${formatBytes(p.total_bytes)})...`;
      }
    });

    try {
      if (progressLabel) progressLabel.textContent = "Installing update & restarting...";
      await invoke("install_update", { downloadUrl: info.download_url });
    } catch (err) {
      unlisten();
      isUpdating = false;
      console.error("Failed to install update:", err);
      alert(`Update failed: ${err instanceof Error ? err.message : String(err)}`);
      if (installBtn) {
        installBtn.disabled = false;
        installBtn.innerHTML = '<i class="bi bi-download"></i> Retry Update';
      }
      if (cancelBtn) cancelBtn.disabled = false;
      if (closeBtn) closeBtn.disabled = false;
    }
  });
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
