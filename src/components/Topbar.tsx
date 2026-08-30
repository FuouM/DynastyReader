import { createSignal, onCleanup, Show } from "solid-js";
import { Portal } from "solid-js/web";
import { makeEventListener } from "@solid-primitives/event-listener";
import {
  route,
  navigate,
  goBack,
  goForward,
  canGoBack,
  canGoForward,
  closeSessionMangaTab,
  isInMangaView,
  sessionTab,
  title,
  banner,
  actions,
  activeDownloadCount,
  downloadSpeedBps,
  formatDownloadSpeed,
} from "../stores";
import { decodeEntities } from "../utils/html";
import { t } from "../i18n";
import { SettingsModal } from "./SettingsModal";
import { HistoryDropdown } from "./HistoryDropdown";
import {
  StorageIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  DoublePageIcon,
  CloseIcon,
  RefreshIcon,
  SettingsIcon,
  CloudDownloadIcon,
  Icon,
} from "./Icon";
import { IconButton, SegmentedSwitch } from "./Button";
export function Topbar() {
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  const [historyMenu, setHistoryMenu] = createSignal<{
    direction: "back" | "forward";
    anchorEl: HTMLElement;
  } | null>(null);
  let holdTimer: number | null = null;
  let didHold = false;

  const startHold = (direction: "back" | "forward", anchorEl: HTMLElement): void => {
    didHold = false;
    if (holdTimer !== null) window.clearTimeout(holdTimer);
    holdTimer = window.setTimeout(() => {
      didHold = true;
      setHistoryMenu({ direction, anchorEl });
    }, 450);
  };

  const cancelHold = (): void => {
    if (holdTimer !== null) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
    if (didHold) {
      window.setTimeout(() => {
        didHold = false;
      }, 200);
    }
  };

  onCleanup(() => cancelHold());
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
          <div class="ds-segmented-switch ds-nav-history-switch" id="ds-nav-history">
            <button
              type="button"
              class="win-button ds-segmented-btn ds-nav-history-btn"
              id="ds-nav-back"
              title={t("topbar.navBackTooltip")}
              disabled={!canGoBack()}
              onPointerDown={(ev) => {
                if (ev.button === 0 && canGoBack()) {
                  startHold("back", ev.currentTarget);
                }
              }}
              onPointerUp={(ev) => {
                if (didHold) ev.preventDefault();
                cancelHold();
              }}
              onPointerCancel={() => cancelHold()}
              onPointerLeave={() => cancelHold()}
              onContextMenu={(ev) => {
                ev.preventDefault();
                if (canGoBack()) {
                  setHistoryMenu({ direction: "back", anchorEl: ev.currentTarget });
                }
              }}
              onClick={() => {
                if (!didHold && canGoBack()) {
                  goBack();
                }
              }}
            >
              <span class="ds-btn-icon-wrap"><ArrowLeftIcon /></span>
            </button>
            <button
              type="button"
              class="win-button ds-segmented-btn ds-nav-history-btn"
              id="ds-nav-forward"
              title={t("topbar.navForwardTooltip")}
              disabled={!canGoForward()}
              onPointerDown={(ev) => {
                if (ev.button === 0 && canGoForward()) {
                  startHold("forward", ev.currentTarget);
                }
              }}
              onPointerUp={(ev) => {
                if (didHold) ev.preventDefault();
                cancelHold();
              }}
              onPointerCancel={() => cancelHold()}
              onPointerLeave={() => cancelHold()}
              onContextMenu={(ev) => {
                ev.preventDefault();
                if (canGoForward()) {
                  setHistoryMenu({ direction: "forward", anchorEl: ev.currentTarget });
                }
              }}
              onClick={() => {
                if (!didHold && canGoForward()) {
                  goForward();
                }
              }}
            >
              <span class="ds-btn-icon-wrap"><ArrowRightIcon /></span>
            </button>
          </div>
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
                  class="win-button ds-btn-sm"
                  id="ds-topbar-downloads-btn"
                  onClick={() => navigate({ view: "browse", browseTab: "downloaded" })}
                  title="Downloads in progress — click to view in Downloaded tab"
                  style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:600;color:var(--sys-primary,#0078d4);background:rgba(0,120,212,0.1);border:1px solid var(--sys-primary,#0078d4);border-radius:4px;height:24px;padding:0 7px;box-sizing:border-box;"
                >
                  <CloudDownloadIcon class="ds-spin" style="font-size:12px;" />
                  <span>{activeDownloadCount()}</span>
                  <Show when={downloadSpeedBps() > 0}>
                    <span style="font-weight:normal;opacity:0.85;font-size:10.5px;">{formatDownloadSpeed(downloadSpeedBps())}</span>
                  </Show>
                </button>
              </Show>
              <Show when={route().view !== "reader"}>
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
      <Show when={historyMenu()}>
        {(menu) => (
          <HistoryDropdown
            direction={menu().direction}
            anchorEl={menu().anchorEl}
            onClose={() => setHistoryMenu(null)}
          />
        )}
      </Show>
      <Show when={banner() !== null}>
        <Portal mount={document.body}>
          <div id="ds-banner">{banner()}</div>
        </Portal>
      </Show>
    </>
  );
}