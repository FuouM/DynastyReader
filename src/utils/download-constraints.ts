/**
 * Download scheduling & Wi-Fi-only constraints (QoL-D5).
 *
 * Persisted user settings + the bridge that pushes them into the Rust
 * download processor via `setDownloadConstraints`. The processor keeps them
 * in-memory so its loop never reads settings from disk/DB.
 */
import { persistedSignal } from "../lib/persisted-signal";
import * as ipc from "../ipc";
import { log } from "./log";

/** Only download while on an unmetered (Wi-Fi) connection. */
export const [downloadWifiOnly, setDownloadWifiOnly] = persistedSignal<boolean>(false, {
  name: "ds_download_wifi_only",
});

/** Restrict downloads to a daily time window. */
export const [downloadScheduleEnabled, setDownloadScheduleEnabled] = persistedSignal<boolean>(
  false,
  { name: "ds_download_schedule_enabled" },
);

/** Window start, `"HH:mm"` local time. */
export const [downloadScheduleStart, setDownloadScheduleStart] = persistedSignal<string>("22:00", {
  name: "ds_download_schedule_start",
});

/** Window end, `"HH:mm"` local time. May be earlier than start for overnight windows. */
export const [downloadScheduleEnd, setDownloadScheduleEnd] = persistedSignal<string>("07:00", {
  name: "ds_download_schedule_end",
});

/**
 * Whether the current connection is metered.
 *
 * Desktop: there is no reliable metered-connection API without extra
 * dependencies, so desktop is always treated as unmetered.
 * Android: reads `ConnectivityManager.isActiveNetworkMetered` through the
 * `AndroidThemeBridge` JavascriptInterface when present.
 */
export function isConnectionMetered(): boolean {
  try {
    return window.AndroidThemeBridge?.isConnectionMetered?.() === true;
  } catch (err) {
    log.debug("download-constraints", "isConnectionMetered failed:", err);
    return false;
  }
}

/** Pushes the current settings + live metered status into the Rust processor. */
export async function pushDownloadConstraints(): Promise<void> {
  try {
    await ipc.setDownloadConstraints({
      wifiOnly: downloadWifiOnly(),
      metered: isConnectionMetered(),
      scheduleEnabled: downloadScheduleEnabled(),
      scheduleStart: downloadScheduleStart(),
      scheduleEnd: downloadScheduleEnd(),
      // Minutes east of UTC; JS getTimezoneOffset() is west-positive.
      tzOffsetMinutes: -new Date().getTimezoneOffset(),
    });
  } catch (err) {
    // Outside Tauri or backend not ready — constraints simply stay default.
    log.debug("download-constraints", "pushDownloadConstraints failed:", err);
  }
}
