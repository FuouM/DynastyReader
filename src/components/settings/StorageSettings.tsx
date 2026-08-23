import { navigate } from "../../stores";
import { t } from "../../i18n";
import * as ipc from "../../ipc";
import { StorageIcon, BlacklistIcon, ExternalLinkIcon, Icon } from "../Icon";
export interface StorageSettingsProps {
  onClose: () => void;
}

export function StorageSettings(props: StorageSettingsProps) {
  return (
    <div class="group-box" id="ds-settings-sec-storage">
      <div class="group-box-title">
        <StorageIcon /> {t("settings.storage.title")}
      </div>
      <div class="ds-settings-storage-grid">
        <span style="font-size:12px;color:var(--sys-window-text,#333);font-weight:600;">
          {t("settings.storage.manageDisk")}
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
          <ExternalLinkIcon /> {t("settings.storage.openCacheButton")}
        </button>

        <span style="font-size:12px;color:var(--sys-window-text,#333);font-weight:600;">
          {t("settings.storage.seriesBlacklist")}
        </span>
        <button
          type="button"
          class="win-button"
          id="ds-settings-goto-blacklist"
          style="width:100%;justify-content:flex-start;"
          title={t("settings.storage.openBlacklistTooltip")}
          onClick={() => {
            props.onClose();
            navigate({ view: "blacklist" });
          }}
        >
          <BlacklistIcon /> {t("settings.storage.openBlacklistButton")}
        </button>

        <span style="font-size:12px;color:var(--sys-window-text,#333);font-weight:600;">
          {t("settings.storage.troubleshooting")}
        </span>
        <button
          type="button"
          class="win-button"
          id="ds-settings-open-logs"
          style="width:100%;justify-content:flex-start;"
          title={t("settings.storage.openLogsTooltip")}
          onClick={() => {
            void ipc.openLogsDir().catch((err) => {
              console.error("dynasty-scans-reader: open logs folder failed:", err);
            });
          }}
        >
          <Icon name="folder2-open" /> {t("settings.storage.openLogsButton")}
        </button>
      </div>
    </div>
  );
}
