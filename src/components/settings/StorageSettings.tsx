import { Show } from "solid-js";
import { navigate } from "../../stores/router";
import { t } from "../../i18n";
import * as ipc from "../../ipc";
import {
  downloadWifiOnly,
  setDownloadWifiOnly,
  downloadScheduleEnabled,
  setDownloadScheduleEnabled,
  downloadScheduleStart,
  setDownloadScheduleStart,
  downloadScheduleEnd,
  setDownloadScheduleEnd,
  pushDownloadConstraints,
} from "../../utils/download-constraints";
import { StorageIcon, BlacklistIcon, ExternalLinkIcon, Icon, DownloadIcon } from "../Icon";
import { GroupBox } from "../GroupBox";
import { IconText, IconButton, DsSwitch } from "../Button";
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

      <fieldset class="group-box" style="margin-top:8px;">
        <legend class="group-box-title">
          <IconText icon={<DownloadIcon />}>{t("settings.downloads.title")}</IconText>
        </legend>
        <div class="ds-col">
          <SettingsRow
            label={<>{t("settings.downloads.wifiOnly")}:</>}
            desc={t("settings.downloads.wifiOnlyDesc")}
          >
            <DsSwitch
              id="ds-settings-download-wifi-only"
              checked={downloadWifiOnly()}
              title={t("settings.downloads.wifiOnlyTooltip")}
              onChange={(next) => {
                setDownloadWifiOnly(next);
                void pushDownloadConstraints();
              }}
            />
          </SettingsRow>

          <SettingsRow
            divider
            label={<>{t("settings.downloads.scheduleEnabled")}:</>}
            desc={t("settings.downloads.scheduleEnabledDesc")}
          >
            <DsSwitch
              id="ds-settings-download-schedule-enabled"
              checked={downloadScheduleEnabled()}
              title={t("settings.downloads.scheduleEnabledTooltip")}
              onChange={(next) => {
                setDownloadScheduleEnabled(next);
                void pushDownloadConstraints();
              }}
            />
          </SettingsRow>

          <Show when={downloadScheduleEnabled()}>
            <SettingsRow
              divider
              label={<>{t("settings.downloads.scheduleWindow")}:</>}
              desc={t("settings.downloads.scheduleWindowDesc")}
            >
              <div class="ds-row" style="gap:6px;align-items:center;">
                <input
                  id="ds-settings-download-schedule-start"
                  type="time"
                  class="input-field ds-select"
                  value={downloadScheduleStart()}
                  onChange={(ev) => {
                    setDownloadScheduleStart(ev.currentTarget.value);
                    void pushDownloadConstraints();
                  }}
                />
                <span class="ds-muted">–</span>
                <input
                  id="ds-settings-download-schedule-end"
                  type="time"
                  class="input-field ds-select"
                  value={downloadScheduleEnd()}
                  onChange={(ev) => {
                    setDownloadScheduleEnd(ev.currentTarget.value);
                    void pushDownloadConstraints();
                  }}
                />
              </div>
            </SettingsRow>
          </Show>
        </div>
      </fieldset>
    </GroupBox>
  );
}
