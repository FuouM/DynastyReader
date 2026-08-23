import { Show } from "solid-js";
import { APP_VERSION, SITE_ROOT } from "../../stores";
import { t } from "../../i18n";
import { formatBytes } from "../../lib/format";
import { openExternal } from "../../api";
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
import { RefreshIcon, CloudDownloadIcon, Icon } from "../Icon";

export function AboutSettings() {
  return (
    <div class="group-box" id="ds-settings-sec-about">
      <div class="group-box-title">
        <Icon name="info-circle" /> {t("settings.about.title")}
      </div>
      <div class="ds-settings-about-header">
        <img
          src="/icon.svg"
          width="34"
          height="34"
          alt="DynastyReader"
          style="border-radius:4px;flex-shrink:0;user-select:none;pointer-events:none;"
        />
        <div class="ds-fill">
          <div
            style="font-size:12px;font-weight:600;color:var(--sys-window-text,#222);display:flex;align-items:center;gap:6px;"
          >
            DynastyReader{" "}
            <span
              class="ds-etag-tag"
              style="font-size:10px;font-weight:normal;padding:1px 6px;"
            >
              v{APP_VERSION}
            </span>
          </div>
          <div class="ds-muted" style="font-size:11px;margin-top:2px;">
            {t("settings.about.subtitle")}
          </div>
        </div>
        <div class="ds-settings-about-actions">
          <button
            type="button"
            class="win-button ds-btn-compact"
            id="ds-about-check-update"
            title={t("settings.about.checkUpdates")}
            disabled={updateChecking() || isUpdating()}
            onClick={() => void checkUpdates(true)}
          >
            <Show when={updateChecking()} fallback={<><RefreshIcon /> {t("settings.about.checkUpdates")}</>}>
              <RefreshIcon spin={true} /> {t("settings.about.checkingUpdates")}
            </Show>
          </button>
          <button
            type="button"
            class="win-button ds-btn-compact"
            id="ds-about-open-github"
            title={t("settings.about.githubTooltip")}
            onClick={() => void openExternal("https://github.com/FuouM/DynastyReader")}
          >
            <Icon name="github" /> GitHub
          </button>
          <ExternalLinkButton
            id="ds-about-open-site"
            title={t("settings.about.websiteTooltip")}
            url={SITE_ROOT}
          >
            dynasty-scans.com
          </ExternalLinkButton>
        </div>
      </div>

      {/* Update Status Container */}
      <div id="ds-about-update-target">
        {/* Up-to-date notice */}
        <Show when={upToDateVersion() !== null}>
          <div
            class="ds-row"
            style="background:var(--ds-status-fresh-bg);border:1px solid var(--ds-status-fresh-border);color:var(--ds-status-fresh-text);padding:6px 10px;border-radius:3px;font-size:11px;align-items:center;gap:8px;margin-top:8px;"
          >
            <Icon name="check-circle-fill" style={{ "font-size": "13px", "flex-shrink": "0" }} />
            <div style="flex:1;">
              <strong>{t("settings.about.upToDate", { version: upToDateVersion() })}</strong>
            </div>
          </div>
        </Show>

        {/* Update Available & Download Progress */}
        <Show when={updateInfo() !== null}>
          <div
            style="display:flex;flex-direction:column;gap:8px;background:var(--sys-bg-active,#f8f9fa);border:1px solid var(--sys-border-medium,#ccc);border-radius:3px;padding:8px 10px;margin-top:8px;"
          >
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
              <div>
                <div style="font-size:12px;font-weight:bold;color:var(--sys-window-text,#222);">
                  DynastyReader v{updateInfo()!.latest_version}
                </div>
                <div class="ds-muted" style="font-size:10px;">
                  Current: v{updateInfo()!.current_version}
                  {updateInfo()!.asset_size
                    ? t("settings.about.sizeLabel", { size: formatBytes(updateInfo()!.asset_size) })
                    : ""}
                </div>
              </div>
              <span
                class="ds-etag-tag"
                style="font-size:10px;padding:2px 8px;font-weight:600;background:var(--ds-status-fresh-bg);color:var(--ds-status-fresh-text);border:1px solid var(--ds-status-fresh-border);"
              >
                {t("settings.about.updateAvailable", { version: updateInfo()!.latest_version })}
              </span>
            </div>

            <Show when={updateInfo()!.release_notes}>
              <div
                style="max-height:100px;overflow-y:auto;font-size:10px;line-height:1.4;white-space:pre-wrap;background:var(--sys-window-bg,#fff);padding:6px 8px;border:1px solid var(--sys-border-light,#e2e2e2);border-radius:2px;color:var(--sys-window-text,#333);"
              >
                {updateInfo()!.release_notes}
              </div>
            </Show>

            <Show when={isUpdating() || updateError()}>
              <div style="display:flex;flex-direction:column;gap:4px;">
                <div style="display:flex;justify-content:space-between;font-size:10px;">
                  <span>
                    {updateStatusText() ||
                      (updateProgress()
                        ? t("settings.about.downloadingProgress", { downloaded: formatBytes(updateProgress()!.downloaded_bytes), total: formatBytes(updateProgress()!.total_bytes) })
                        : t("settings.about.downloadingUpdate"))}
                  </span>
                  <span style="font-weight:600;">
                    {updateProgress() ? Math.round(updateProgress()!.percentage) : 0}%
                  </span>
                </div>
                <div
                  style="width:100%;height:10px;background:var(--sys-border-light,#e2e2e2);border-radius:2px;overflow:hidden;border:1px solid var(--sys-border-medium,#ccc);"
                >
                  <div
                    style={{
                      width: `${updateProgress() ? Math.round(updateProgress()!.percentage) : 0}%`,
                      height: "100%",
                      background: "var(--sys-primary,#0078d4)",
                      transition: "width 0.2s ease",
                    }}
                  ></div>
                </div>
              </div>
            </Show>

            <div style="display:flex;justify-content:flex-end;gap:6px;margin-top:2px;">
              <button
                type="button"
                class="win-button primary ds-btn-sm"
                style="min-width:120px;"
                disabled={isUpdating()}
                onClick={() => void installUpdate()}
              >
                <Show
                  when={!isUpdating()}
                  fallback={<><Icon name="hourglass-split" spin /> {t("settings.about.updating")}</>}
                >
                  <CloudDownloadIcon />{" "}
                  {updateError() ? t("settings.about.retryUpdate") : t("settings.about.downloadAndRestart")}
                </Show>
              </button>
            </div>
          </div>
        </Show>

        {/* Error Notice */}
        <Show when={updateError() !== null && updateInfo() === null}>
          <div
            class="ds-row"
            style="background:var(--ds-danger-bg);border:1px solid var(--ds-danger-border);color:var(--ds-danger-text);padding:6px 10px;border-radius:3px;font-size:11px;align-items:center;gap:8px;margin-top:8px;"
          >
            <Icon
              name="exclamation-circle-fill"
              style={{ "font-size": "13px", "flex-shrink": "0" }}
            />
            <div style="flex:1;">{updateError()}</div>
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
    </div>
  );
}
