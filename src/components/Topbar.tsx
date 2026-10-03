import { createSignal, lazy, Show, Suspense } from "solid-js";
import { Portal } from "solid-js/web";
import { makeEventListener } from "@solid-primitives/event-listener";
import { route, navigate, closeSessionMangaTab, isInMangaView, sessionTab } from "../stores/router";
import { title, banner, bannerAction, dismissBanner, actions } from "../stores/topbar";
import { activeDownloadCount, downloadSpeedBps } from "../stores/download";
import { formatSpeed, decodeEntities } from "../utils/formatting";
import { isMobile, isOnline } from "../stores/platform";
import { activeProvider } from "../stores/provider";
import { uiScale } from "../stores/ui-scale";
import { t } from "../i18n";
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
import { Button, SegmentedSwitch } from "./Button";
import type { SettingsSectionId } from "./settings/settings-shared";
import type { OpenSettingsDetail } from "../hotkeys/GlobalShortcuts";
const SettingsModal = lazy(() => import("./SettingsModal").then((m) => ({ default: m.SettingsModal })));
const SourceSwitcherModal = lazy(() => import("./SourceSwitcherModal").then((m) => ({ default: m.SourceSwitcherModal })));
export function Topbar() {
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  const [settingsPage, setSettingsPage] = createSignal<"main" | "hotkeys" | "advanced">("main");
  const [settingsSection, setSettingsSection] = createSignal<SettingsSectionId | undefined>(undefined);
  const [sourceSwitcherOpen, setSourceSwitcherOpen] = createSignal(false);
  makeEventListener(window, "ds-open-settings", (ev: Event) => {
    const custom = ev as CustomEvent<OpenSettingsDetail | undefined>;
    setSettingsPage(custom.detail?.page ?? "main");
    setSettingsSection(custom.detail?.section);
    setSettingsOpen(true);
  });
  makeEventListener(window, "ds-open-source-switcher", () => setSourceSwitcherOpen(true));

  return (
    <>
      <div id="ds-topbar">
        <div id="ds-topbar-main">
          <SegmentedSwitch<"browse" | "library">
            id="ds-view-switch"
            value={route().view === "library" ? "library" : "browse"}
            onChange={(val) => navigate({ view: val })}
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
          <button
            type="button"
            id="ds-provider-pill"
            class="win-button ds-provider-pill"
            onClick={() => setSourceSwitcherOpen(true)}
            title={t("topbar.sourceSwitcherTooltip")}
            aria-label={t("topbar.sourceSwitcherAriaLabel", {
              provider: activeProvider() === "mangadex" ? "MangaDex" : "Dynasty Scans",
            })}
            aria-haspopup="dialog"
          >
            <span class="ds-provider-pill-name">
              {activeProvider() === "mangadex" ? "MangaDex" : "Dynasty"}
            </span>
            <Icon name="chevron-down" class="ds-provider-pill-chevron" />
          </button>
          <Show when={sessionTab()}>
            {(tab) => (
              <button
                type="button"
                class="win-button ds-nav-tab ds-session-tab"
                classList={{ active: isInMangaView() }}
                title={tab().title}
                onClick={() => navigate(tab().route)}
              >
                <DoublePageIcon />
                <span class="ds-truncate">{decodeEntities(tab().title)}</span>
                <CloseIcon
                  class="ds-tab-close"
                  title={t("topbar.closeTabTooltip")}
                  onClick={(ev: MouseEvent) => {
                    ev.stopPropagation();
                    closeSessionMangaTab();
                  }}
                />
              </button>
            )}
          </Show>
          <span id="ds-title">
            {title()}
          </span>
          <div id="ds-topbar-right">
            <Show when={actions() !== null}>
              <div id="ds-actions">{actions()}</div>
            </Show>
            <div id="ds-topbar-tools">
              <Show when={!isOnline()}>
                <span
                  class="win-button ds-offline-pill"
                  id="ds-topbar-offline-pill"
                  title={t("topbar.offlineTooltip")}
                  aria-label={t("topbar.offlineTooltip")}
                >
                  <Icon name="wifi-off" />
                  <span class="ds-offline-text">{t("topbar.offline")}</span>
                </span>
              </Show>
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
                    <span class="ds-topbar-download-speed ds-muted">{formatSpeed(downloadSpeedBps())}</span>
                  </Show>
                </button>
              </Show>
              <Show when={route().view !== "reader" && route().view !== "cache" && route().view !== "blacklist"}>
                <Button
                  className="ds-btn-icon"
                  id="ds-page-refresh-btn"
                  icon={<RefreshIcon />}
                  title={t("topbar.refreshPageTooltip")}
                  onClick={() => window.location.reload()}
                />
              </Show>
              <Button
                className="ds-btn-icon"
                id="ds-settings-btn"
                icon={<SettingsIcon />}
                title={t("topbar.settingsTooltip")}
                onClick={() => {
                  setSettingsPage("main");
                  setSettingsSection(undefined);
                  setSettingsOpen(true);
                }}
              />
            </div>
          </div>
        </div>
      </div>
      <Show when={settingsOpen()}>
        <Suspense>
          <SettingsModal
            open={settingsOpen()}
            onClose={() => setSettingsOpen(false)}
            initialPage={settingsPage()}
            initialSection={settingsSection()}
          />
        </Suspense>
      </Show>
      <Show when={sourceSwitcherOpen()}>
        <Suspense>
          <SourceSwitcherModal open={sourceSwitcherOpen()} onClose={() => setSourceSwitcherOpen(false)} />
        </Suspense>
      </Show>
      <Show when={banner() !== null}>
        <Portal mount={document.body}>
          <div
            id="ds-banner"
            role="status"
            aria-live="polite"
            classList={{ "ds-banner--mobile": isMobile(), "ds-banner--clickable": !!bannerAction() }}
            style={{
              ...(uiScale() !== 1.0 ? { zoom: String(uiScale()) } : {}),
              ...(bannerAction() ? { cursor: "pointer" } : {}),
            }}
            onClick={() => {
              const action = bannerAction();
              if (action) {
                action();
                dismissBanner();
              }
            }}
          >
            {banner()}
          </div>
        </Portal>
      </Show>
    </>
  );
}
