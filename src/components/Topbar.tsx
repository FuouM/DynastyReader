import { createSignal, Show } from "solid-js";
import { Portal } from "solid-js/web";
import { makeEventListener } from "@solid-primitives/event-listener";
import { route, navigate, closeSessionMangaTab, isInMangaView, sessionTab } from "../stores/router";
import { title, banner, actions } from "../stores/topbar";
import { activeDownloadCount, downloadSpeedBps, formatDownloadSpeed } from "../stores/download";
import { isMobile } from "../stores/platform";
import { uiScale } from "../stores/ui-scale";
import { decodeEntities } from "../utils/html";
import { t } from "../i18n";
import { SettingsModal } from "./SettingsModal";
import { HistoryNavButtons } from "./HistoryDropdown";
import {
  StorageIcon,
  DoublePageIcon,
  CloseIcon,
  RefreshIcon,
  SettingsIcon,
  DownloadIcon,
  Icon,
} from "./Icon";
import { IconButton, SegmentedSwitch } from "./Button";
export function Topbar() {
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  makeEventListener(window, "ds-open-settings", () => setSettingsOpen(true));

  return (
    <>
      <div id="ds-topbar">
        <div id="ds-topbar-main">
          <SegmentedSwitch
            id="ds-view-switch"
            value={route().view}
            onChange={(val) => navigate({ view: val as "browse" | "library" })}
            options={[
              {
                id: "ds-tab-browse",
                value: "browse",
                icon: <Icon name="compass" />,
                text: route().view === "reader" ? undefined : t("topbar.browse"),
                title: t("topbar.browseRecent"),
              },
              {
                id: "ds-tab-library",
                value: "library",
                icon: <StorageIcon />,
                text: route().view === "reader" ? undefined : t("topbar.library"),
                title: t("topbar.library"),
              },
            ]}
          />
          <HistoryNavButtons />
          <Show when={sessionTab() !== null}>
            <button
              type="button"
              class="win-button ds-nav-tab ds-session-tab"
              classList={{ active: isInMangaView() }}
              title={sessionTab()!.title}
              onClick={() => {
                const tab = sessionTab();
                if (tab) navigate(tab.route);
              }}
            >
              <DoublePageIcon />
              <span class="ds-truncate">
                {decodeEntities(sessionTab()!.title)}
              </span>
              <CloseIcon
                class="ds-tab-close"
                title={t("topbar.closeTabTooltip")}
                onClick={(ev: MouseEvent) => {
                  ev.stopPropagation();
                  closeSessionMangaTab();
                }}
              />
            </button>
          </Show>
          <span id="ds-title">
            {title()}
          </span>
          <div id="ds-topbar-right">
            <Show when={actions() !== null}>
              <div id="ds-actions">{actions()}</div>
            </Show>
            <div id="ds-topbar-tools">
              <Show when={activeDownloadCount() > 0}>
                <button
                  type="button"
                  class="win-button"
                  id="ds-topbar-downloads-btn"
                  onClick={() => navigate({ view: "browse", browseTab: "downloaded" })}
                  title={t("topbar.downloadsInProgressTooltip")}
                >
                  <DownloadIcon />
                  <span>{activeDownloadCount()}</span>
                  <Show when={downloadSpeedBps() > 0}>
                    <span class="ds-topbar-download-speed ds-muted">{formatDownloadSpeed(downloadSpeedBps())}</span>
                  </Show>
                </button>
              </Show>
              <Show when={route().view !== "reader" && route().view !== "cache" && route().view !== "blacklist"}>
                <IconButton
                  className="ds-btn-icon"
                  id="ds-page-refresh-btn"
                  icon={<RefreshIcon />}
                  title={t("topbar.refreshPageTooltip")}
                  onClick={() => window.location.reload()}
                />
              </Show>
              <IconButton
                className="ds-btn-icon"
                id="ds-settings-btn"
                icon={<SettingsIcon />}
                title={t("topbar.settingsTooltip")}
                onClick={() => setSettingsOpen(true)}
              />
            </div>
          </div>
        </div>
      </div>
      <SettingsModal open={settingsOpen()} onClose={() => setSettingsOpen(false)} />
      <Show when={banner() !== null}>
        <Portal mount={document.body}>
          <div
            id="ds-banner"
            classList={{ "ds-banner--mobile": isMobile() }}
            style={uiScale() !== 1.0 ? { zoom: String(uiScale()) } : undefined}
          >
            {banner()}
          </div>
        </Portal>
      </Show>
    </>
  );
}