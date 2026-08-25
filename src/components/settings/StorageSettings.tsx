import { navigate } from "../../stores";
import { t } from "../../i18n";
import * as ipc from "../../ipc";
import { StorageIcon, BlacklistIcon, ExternalLinkIcon, Icon } from "../Icon";
import { GroupBox } from "../GroupBox";
import { IconText, IconButton } from "../Button";
export interface StorageSettingsProps {
  onClose: () => void;
}

export function StorageSettings(props: StorageSettingsProps) {
  return (
    <GroupBox id="ds-settings-sec-storage" title={<IconText icon={<StorageIcon />}>{t("settings.storage.title")}</IconText>}>
      <div class="ds-settings-storage-grid">
        <span class="ds-label">
          {t("settings.storage.manageDisk")}
        </span>
          <IconButton
            id="ds-settings-goto-cache"
            cssText="width:100%;justify-content:flex-start;"
            icon={<ExternalLinkIcon />}
            text={t("settings.storage.openCacheButton")}
            onClick={() => {
              props.onClose();
              navigate({ view: "cache" });
            }}
          />

        <span class="ds-label">
          {t("settings.storage.seriesBlacklist")}
        </span>
          <IconButton
            id="ds-settings-goto-blacklist"
            cssText="width:100%;justify-content:flex-start;"
            title={t("settings.storage.openBlacklistTooltip")}
            icon={<BlacklistIcon />}
            text={t("settings.storage.openBlacklistButton")}
            onClick={() => {
              props.onClose();
              navigate({ view: "blacklist" });
            }}
          />

        <span class="ds-label">
          {t("settings.storage.troubleshooting")}
        </span>
          <IconButton
            id="ds-settings-open-logs"
            cssText="width:100%;justify-content:flex-start;"
            title={t("settings.storage.openLogsTooltip")}
            icon={<Icon name="folder2-open" />}
            text={t("settings.storage.openLogsButton")}
            onClick={() => {
              void ipc.openLogsDir().catch((err) => {
                console.error("dynasty-scans-reader: open logs folder failed:", err);
              });
            }}
          />
      </div>
    </GroupBox>
  );
}
