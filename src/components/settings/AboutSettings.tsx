import { Show } from "solid-js";
import { APP_VERSION, SITE_ROOT } from "../../constants";
import { t } from "../../i18n";
import { formatBytes } from "../../utils/formatting";
import { openExternal } from "../../api/navigation";
import {
  checkUpdates,
  installUpdate,
  updateInfo,
  upToDateVersion,
  updateChecking,
  updateError,
  updateProgress,
  isUpdating,
  updateStatusText,
} from "../UpdateDialog";
import { ExternalLinkButton } from "../ExternalLinkButton";
import { GroupBox } from "../GroupBox";
import { IconText, IconButton } from "../Button";
import { RefreshIcon, CloudDownloadIcon, Icon } from "../Icon";

export function AboutSettings() {
  return (
    <GroupBox id="ds-settings-sec-about" title={<IconText icon={<Icon name="info-circle" />}>{t("settings.about.title")}</IconText>}>
      <div class="ds-settings-about-header">
        <img
          src="/icon.svg"
          width="34"
          height="34"
          alt="DynastyReader"
          class="ds-about-logo"
        />
        <div class="ds-fill">
          <div
            class="ds-label ds-about-header"
          >
            DynastyReader{" "}
            <span
              class="ds-etag-tag ds-about-etag"
            >
              v{APP_VERSION}
            </span>
          </div>
          <div class="ds-muted ds-about-muted">
            {t("settings.about.subtitle")}
          </div>
        </div>
        <div class="ds-settings-about-actions">
          <IconButton
            className="ds-btn-compact"
            id="ds-about-check-update"
            title={t("settings.about.checkUpdates")}
            disabled={updateChecking() || isUpdating()}
            icon={<Show when={updateChecking()} fallback={<RefreshIcon />}><RefreshIcon spin={true} /></Show>}
            text={<Show when={updateChecking()} fallback={t("settings.about.checkUpdates")}>{t("settings.about.checkingUpdates")}</Show>}
            onClick={() => void checkUpdates(true)}
          />
          <IconButton
            className="ds-btn-compact"
            id="ds-about-open-github"
            title={t("settings.about.githubTooltip")}
            icon={<Icon name="github" />}
            text={t("settings.about.github")}
            onClick={() => void openExternal("https://github.com/FuouM/DynastyReader")}
          />
          <ExternalLinkButton
            id="ds-about-open-site"
            title={t("settings.about.websiteTooltip")}
            url={SITE_ROOT}
            text="dynasty-scans.com"
          />
        </div>
      </div>

      {/* Update Status Container */}
      <div id="ds-about-update-target">
        {/* Up-to-date notice */}
        <Show when={upToDateVersion() !== null}>
          <div
            class="ds-row ds-status-row ds-status-row--fresh"
          >
            <Icon name="check-circle-fill" class="ds-status-icon" />
            <div class="ds-flex-1">
              <strong>{t("settings.about.upToDate", { version: upToDateVersion() })}</strong>
            </div>
          </div>
        </Show>

        {/* Update Available & Download Progress */}
        <Show when={updateInfo() !== null}>
          <div
            class="ds-update-card"
          >
            <div class="ds-row-between">
              <div>
                <div class="ds-update-version">
                  DynastyReader v{updateInfo()!.latest_version}
                </div>
                <div class="ds-muted ds-text-10">
                  Current: v{updateInfo()!.current_version}
                  {updateInfo()!.asset_size
                    ? t("settings.about.sizeLabel", { size: formatBytes(updateInfo()!.asset_size) })
                    : ""}
                </div>
              </div>
              <span
                class="ds-etag-tag ds-update-etag"
              >
                {t("settings.about.updateAvailable", { version: updateInfo()!.latest_version })}
              </span>
            </div>

            <Show when={updateInfo()!.release_notes}>
              <div
                class="ds-update-notes"
              >
                {updateInfo()!.release_notes}
              </div>
            </Show>

            <Show when={isUpdating() || updateError()}>
              <div class="ds-progress-col">
                <div class="ds-progress-header">
                  <span>
                    {updateStatusText() ||
                      (updateProgress()
                        ? t("settings.about.downloadingProgress", { downloaded: formatBytes(updateProgress()!.downloaded_bytes), total: formatBytes(updateProgress()!.total_bytes) })
                        : t("settings.about.downloadingUpdate"))}
                  </span>
                  <span class="ds-progress-pct">
                    {updateProgress() ? Math.round(updateProgress()!.percentage) : 0}%
                  </span>
                </div>
                <div
                  class="ds-progress-track"
                >
                  <div
                    class="ds-progress-fill"
                    style={{
                      width: `${updateProgress() ? Math.round(updateProgress()!.percentage) : 0}%`,
                    }}
                  ></div>
                </div>
              </div>
            </Show>

            <div class="ds-update-actions">
              <IconButton
                className="primary ds-btn-sm"
                cssText="min-width:120px;"
                disabled={isUpdating()}
                icon={<Show when={!isUpdating()} fallback={<Icon name="hourglass-split" spin />}><CloudDownloadIcon /></Show>}
                text={<Show when={!isUpdating()} fallback={t("settings.about.updating")}>{updateError() ? t("settings.about.retryUpdate") : t("settings.about.downloadAndRestart")}</Show>}
                onClick={() => void installUpdate()}
              />
            </div>
          </div>
        </Show>

        {/* Error Notice */}
        <Show when={updateError() !== null && updateInfo() === null}>
          <div
            class="ds-row ds-status-row ds-status-row--danger"
          >
            <Icon
              name="exclamation-circle-fill"
              class="ds-status-icon"
            />
            <div class="ds-flex-1">{updateError()}</div>
            <button
              type="button"
              class="win-button ds-btn-sm"
              onClick={() => void checkUpdates(true)}
            >
              {t("common.retry")}
            </button>
          </div>
        </Show>
      </div>
    </GroupBox>
  );
}
