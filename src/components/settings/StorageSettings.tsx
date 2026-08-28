import { navigate } from "../../stores";
import { t } from "../../i18n";
import * as ipc from "../../ipc";
import { StorageIcon, BlacklistIcon, ExternalLinkIcon, Icon } from "../Icon";
import { GroupBox } from "../GroupBox";
import { IconText, IconButton } from "../Button";
import { SettingsRow } from "../SettingsRow";
export interface StorageSettingsProps {
  onClose: () => void;
}

export function StorageSettings(props: StorageSettingsProps) {
  return (
    <GroupBox id="ds-settings-sec-storage" title={<IconText icon={<StorageIcon />}>{t("settings.storage.title")}</IconText>}>
      <div class="ds-col">
        <SettingsRow label={t("settings.storage.manageDisk")}>
          <IconButton
            id="ds-settings-goto-cache"
            icon={<ExternalLinkIcon />}
            text={t("settings.storage.openCacheButton")}
            onClick={() => {
              props.onClose();
              navigate({ view: "cache" });
            }}
          />
        </SettingsRow>

        <SettingsRow label={t("settings.storage.seriesBlacklist")} divider>
          <IconButton
            id="ds-settings-goto-blacklist"
            title={t("settings.storage.openBlacklistTooltip")}
            icon={<BlacklistIcon />}
            text={t("settings.storage.openBlacklistButton")}
            onClick={() => {
              props.onClose();
              navigate({ view: "blacklist" });
            }}
          />
        </SettingsRow>

        <SettingsRow label={t("settings.storage.troubleshooting")} divider>
          <IconButton
            id="ds-settings-open-logs"
            title={t("settings.storage.openLogsTooltip")}
            icon={<Icon name="folder2-open" />}
            text={t("settings.storage.openLogsButton")}
            onClick={() => {
              void ipc.openLogsDir().catch((err) => {
                console.error("[dynasty-reader] open logs folder failed:", err);
              });
            }}
          />
        </SettingsRow>
      </div>
    </GroupBox>
  );
}
