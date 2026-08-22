import { navigate } from "../../stores";
import * as ipc from "../../ipc";
import { StorageIcon, BlacklistIcon, ExternalLinkIcon, Icon } from "../Icon";

export interface StorageSettingsProps {
  onClose: () => void;
}

export function StorageSettings(props: StorageSettingsProps) {
  return (
    <div class="group-box" id="ds-settings-sec-storage">
      <div class="group-box-title">
        <StorageIcon /> Storage &amp; Cache
      </div>
      <div class="ds-settings-storage-grid">
        <span style="font-size:12px;color:var(--sys-window-text,#333);">
          Manage disk footprint &amp; scans:
        </span>
        <button
          type="button"
          class="win-button"
          id="ds-settings-goto-cache"
          style="width:100%;justify-content:flex-start;"
          onClick={() => {
            props.onClose();
            navigate({ view: "cache" });
          }}
        >
          <ExternalLinkIcon /> Open Cache Manager
        </button>

        <span style="font-size:12px;color:var(--sys-window-text,#333);">
          Series Blacklist:
        </span>
        <button
          type="button"
          class="win-button"
          id="ds-settings-goto-blacklist"
          style="width:100%;justify-content:flex-start;"
          title="Manage blacklisted series"
          onClick={() => {
            props.onClose();
            navigate({ view: "blacklist" });
          }}
        >
          <BlacklistIcon /> Open Series Blacklist
        </button>

        <span style="font-size:12px;color:var(--sys-window-text,#333);">
          Troubleshooting:
        </span>
        <button
          type="button"
          class="win-button"
          id="ds-settings-open-logs"
          style="width:100%;justify-content:flex-start;"
          title="Reveal the rolling log file in Explorer"
          onClick={() => {
            void ipc.openLogsDir().catch((err) => {
              console.error("dynasty-scans-reader: open logs folder failed:", err);
            });
          }}
        >
          <Icon name="folder2-open" /> Open Logs Folder
        </button>
      </div>
    </div>
  );
}
