/**
 * In-app update checker and interactive install modal for DynastyReader. Port of `update-dialog.ts`.
 */

import { createSignal, onCleanup, onMount, Show, type JSX } from "solid-js";
import { listen } from "@tauri-apps/api/event";
import type { UpdateInfo, DownloadProgress } from "../types/api";
import { formatBytes } from "../lib/format";
import { Modal } from "./Modal";
import { CheckIcon, CloudDownloadIcon, Icon } from "./Icon";
import * as ipc from "../ipc";

export const [updateDialogInfo, setUpdateDialogInfo] = createSignal<UpdateInfo | null>(null);
export const [upToDateVersion, setUpToDateVersion] = createSignal<string | null>(null);

export async function checkUpdates(manual = false): Promise<UpdateInfo | null> {
  try {
    const info = await ipc.checkForUpdates();
    if (info.has_update) {
      setUpdateDialogInfo(info);
      return info;
    } else if (manual) {
      setUpToDateVersion(info.current_version);
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

function UpToDateModal() {
  const version = upToDateVersion();
  return (
    <Modal
      open={upToDateVersion() !== null}
      backdropId="ds-update-modal-backdrop"
      title={<><CheckIcon color="var(--sys-primary,#0078d4)" /> Check for Updates</>}
      width={360}
      footer={
        <button type="button" class="win-button primary ds-modal-done" style="min-width:70px;" onClick={() => setUpToDateVersion(null)}>
          OK
        </button>
      }
    >
      <div style="padding:4px;display:flex;flex-direction:column;gap:8px;">
        <div style="font-size:13px;font-weight:600;color:var(--sys-window-text,#222);">DynastyReader is up to date!</div>
        <div class="ds-muted" style="font-size:11px;">
          You are currently running version <strong>v{version}</strong>.
        </div>
      </div>
    </Modal>
  );
}

function UpdateModal(props: { info: UpdateInfo }) {
  const [progress, setProgress] = createSignal<DownloadProgress | null>(null);
  const [isUpdating, setIsUpdating] = createSignal(false);
  const [failed, setFailed] = createSignal(false);
  const [statusText, setStatusText] = createSignal<string>("");
  let unlisten: (() => void) | null = null;

  const info = props.info;

  onMount(() => {
    void listen<DownloadProgress>("update-progress", (event) => {
      setProgress(event.payload);
      if (event.payload.percentage >= 100) {
        setStatusText("Installing update & restarting...");
      }
    }).then((fn) => {
      unlisten = fn;
    });
  });

  onCleanup(() => {
    unlisten?.();
  });

  const close = (): void => {
    if (isUpdating()) return;
    setUpdateDialogInfo(null);
    setProgress(null);
    setStatusText("");
  };

  const install = async (): Promise<void> => {
    if (isUpdating()) return;
    setIsUpdating(true);
    setFailed(false);
    const sizeFormatted = info.asset_size ? ` (${formatBytes(info.asset_size)})` : "";
    setStatusText(`Downloading update${sizeFormatted}...`);
    try {
      await ipc.installUpdate(info.download_url);
    } catch (err) {
      setIsUpdating(false);
      setFailed(true);
      console.error("Failed to install update:", err);
      alert(`Update failed: ${err instanceof Error ? err.message : String(err)}`);
      setStatusText("Update installation failed. Please try again.");
    }
  };

  const pct = progress() ? Math.round(progress()!.percentage) : 0;

  return (
    <Modal
      open={true}
      backdropId="ds-update-modal-backdrop"
      title={<><CloudDownloadIcon /> Software Update Available</>}
      width={480}
      canClose={() => !isUpdating()}
      onClose={close}
      footer={
        <div style="display:flex;justify-content:flex-end;gap:8px;width:100%;">
          <button
            type="button"
            class="win-button"
            id="ds-update-cancel-btn"
            style="min-width:75px;"
            disabled={isUpdating()}
            onClick={close}
          >
            Later
          </button>
          <button
            type="button"
            class="win-button primary"
            id="ds-update-install-btn"
            style="min-width:110px;"
            disabled={isUpdating()}
            onClick={() => void install()}
          >
            <Show
              when={!isUpdating()}
              fallback={<><Icon name="hourglass-split" /> Updating...</>}
            >
              <CloudDownloadIcon /> {failed() ? "Retry Update" : "Update & Restart"}
            </Show>
          </button>
        </div>
      }
    >
      <div style="padding:4px;display:flex;flex-direction:column;gap:12px;">
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <div>
            <div style="font-size:14px;font-weight:bold;color:var(--sys-window-text,#222);">DynastyReader v{info.latest_version}</div>
            <div class="ds-muted" style="font-size:11px;">Current installed version: v{info.current_version}</div>
          </div>
          <span class="ds-etag-tag" style="font-size:11px;padding:2px 8px;font-weight:600;">Update Available</span>
        </div>

        <div class="group-box" style="margin:0;">
          <div class="group-box-title"><Icon name="journal-text" /> Release Notes</div>
          <div style="max-height:160px;overflow-y:auto;font-size:11px;line-height:1.4;white-space:pre-wrap;background:var(--sys-bg-window,#fff);padding:6px;border:1px solid var(--sys-border-light,#e2e2e2);border-radius:3px;" id="ds-update-notes">
            {info.release_notes || "No release notes provided for this version."}
          </div>
        </div>

        <Show when={isUpdating() || failed()}>
          <div id="ds-update-progress-container" style="display:flex;flex-direction:column;gap:6px;">
            <div style="display:flex;justify-content:space-between;font-size:11px;">
              <span id="ds-update-progress-label">
                <Show
                  when={progress() !== null && progress()!.percentage < 100}
                  fallback={statusText()}
                >
                  Downloading ({formatBytes(progress()!.downloaded_bytes)} / {formatBytes(progress()!.total_bytes)})...
                </Show>
              </span>
              <span id="ds-update-progress-pct" style="font-weight:600;">{pct}%</span>
            </div>
            <div style="width:100%;height:14px;background:var(--sys-border-light,#e2e2e2);border-radius:3px;overflow:hidden;border:1px solid var(--sys-border-mid,#ccc);">
              <div id="ds-update-progress-bar" style={`width:${pct}%;height:100%;background:var(--ds-accent,#2c7be5);transition:width 0.2s ease;`}></div>
            </div>
          </div>
        </Show>
      </div>
    </Modal>
  );
}

/** Renders the update dialog (shows whichever of the two states is active). */
export function UpdateDialog(): JSX.Element {
  return (
    <>
      <Show when={updateDialogInfo() !== null}>
        <UpdateModal info={updateDialogInfo()!} />
      </Show>
      <Show when={upToDateVersion() !== null}>
        <UpToDateModal />
      </Show>
    </>
  );
}