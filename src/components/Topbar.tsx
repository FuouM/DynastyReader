import { createSignal, onCleanup, Show } from "solid-js";
import { makeEventListener } from "@solid-primitives/event-listener";
import { createElementSize } from "@solid-primitives/resize-observer";
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
  };

  onCleanup(() => cancelHold());

  let topbarEl: HTMLDivElement | undefined;
  const size = createElementSize(() => topbarEl);
  const isNarrow = () => (size.width ?? 0) < 620;
  const isCompact = () => (size.width ?? 0) < 760;

  makeEventListener(window, "ds-open-settings", () => setSettingsOpen(true));

  return (
    <>
      <div id="ds-topbar" ref={topbarEl} classList={{ "ds-narrow": isNarrow(), "ds-compact": isCompact() }}>
        <div id="ds-topbar-main">
          <Show when={route().view !== "reader"}>
            <SegmentedSwitch
              id="ds-view-switch"
              value={route().view}
              onChange={(val) => navigate({ view: val as "browse" | "library" })}
              options={[
                { id: "ds-tab-browse", value: "browse", icon: <Icon name="compass" />, text: isNarrow() ? t("topbar.browse") : t("topbar.browseRecent"), title: t("topbar.browseRecent") },
                { id: "ds-tab-library", value: "library", icon: <StorageIcon />, text: t("topbar.library"), title: t("topbar.library") },
              ]}
            />
          </Show>
          <div class="ds-segmented-switch ds-nav-history-switch" id="ds-nav-history">
            <button
              type="button"
              class="ds-segmented-btn ds-nav-history-btn"
              id="ds-nav-back"
              title={t("topbar.navBackTooltip")}
              disabled={!canGoBack()}
              onMouseDown={(ev) => {
                if (ev.button === 0 && canGoBack()) {
                  startHold("back", ev.currentTarget);
                }
              }}
              onMouseUp={() => cancelHold()}
              onMouseLeave={() => cancelHold()}
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
              <ArrowLeftIcon />
            </button>
            <button
              type="button"
              class="ds-segmented-btn ds-nav-history-btn"
              id="ds-nav-forward"
              title={t("topbar.navForwardTooltip")}
              disabled={!canGoForward()}
              onMouseDown={(ev) => {
                if (ev.button === 0 && canGoForward()) {
                  startHold("forward", ev.currentTarget);
                }
              }}
              onMouseUp={() => cancelHold()}
              onMouseLeave={() => cancelHold()}
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
              <ArrowRightIcon />
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
          <Show when={banner() !== null}>
            <div id="ds-banner">{banner()}</div>
          </Show>
          <div id="ds-actions">{actions()}</div>
          <div id="ds-topbar-tools">
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
    </>
  );
}