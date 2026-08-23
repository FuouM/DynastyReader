/**
 * In-app update manager for DynastyReader.
 * Provides shared reactive state for update checking, download progress, and installation.
 */

import { createSignal } from "solid-js";
import { listen } from "@tauri-apps/api/event";
import type { UpdateInfo, DownloadProgress } from "../types/api";
import * as ipc from "../ipc";
import { t } from "../i18n";

export const [updateInfo, setUpdateInfo] = createSignal<UpdateInfo | null>(null);
export const [upToDateVersion, setUpToDateVersion] = createSignal<string | null>(null);
export const [updateChecking, setUpdateChecking] = createSignal(false);
export const [updateError, setUpdateError] = createSignal<string | null>(null);
export const [updateProgress, setUpdateProgress] = createSignal<DownloadProgress | null>(null);
export const [isUpdating, setIsUpdating] = createSignal(false);
export const [updateStatusText, setUpdateStatusText] = createSignal<string>("");

let progressUnlisten: (() => void) | null = null;

export async function checkUpdates(manual = false): Promise<UpdateInfo | null> {
  if (updateChecking()) return null;
  setUpdateChecking(true);
  setUpdateError(null);
  if (manual) {
    setUpToDateVersion(null);
  }

  try {
    const info = await ipc.checkForUpdates();
    if (info.has_update) {
      setUpdateInfo(info);
      setUpToDateVersion(null);
      return info;
    } else {
      setUpdateInfo(null);
      if (manual) {
        setUpToDateVersion(info.current_version);
      }
    }
    return info;
  } catch (err) {
    console.error("dynasty-scans-reader: update check failed:", err);
    setUpdateError(err instanceof Error ? err.message : String(err));
    return null;
  } finally {
    setUpdateChecking(false);
  }
}

export async function installUpdate(): Promise<void> {
  const info = updateInfo();
  if (!info || isUpdating()) return;

  setIsUpdating(true);
  setUpdateError(null);
  setUpdateStatusText(t("settings.about.downloadStarting"));

  if (!progressUnlisten) {
    try {
      progressUnlisten = await listen<DownloadProgress>("update-progress", (event) => {
        setUpdateProgress(event.payload);
        if (event.payload.percentage >= 100) {
          setUpdateStatusText(t("settings.about.installingRestarting"));
        }
      });
    } catch (err) {
      console.error("Failed to setup update-progress listener:", err);
    }
  }

  try {
    await ipc.installUpdate(info.download_url);
  } catch (err) {
    setIsUpdating(false);
    const msg = err instanceof Error ? err.message : String(err);
    setUpdateError(t("settings.about.installError", { msg }));
    setUpdateStatusText(t("settings.about.updateFailedNotice"));
    console.error("Failed to install update:", err);
  }
}
