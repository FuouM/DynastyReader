import { createSignal, onCleanup, onMount, Show } from "solid-js";
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
  decodeEntities,
} from "../stores";
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
import { IconButton } from "./Button";

export function Topbar() {
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  const [isNarrow, setIsNarrow] = createSignal(false);
  const [isCompact, setIsCompact] = createSignal(false);
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

  makeEventListener(window, "ds-open-settings", () => setSettingsOpen(true));

  onMount(() => {
    if (!topbarEl || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        setIsNarrow(width < 620);
        setIsCompact(width < 760);
      }
    });
    ro.observe(topbarEl);
    onCleanup(() => ro.disconnect());
  });

  return (
    <>
      <div id="ds-topbar" ref={topbarEl} classList={{ "ds-narrow": isNarrow(), "ds-compact": isCompact() }}>
        <div id="ds-topbar-main">
          <div class="ds-segmented-switch" id="ds-view-switch">
            <IconButton
              icon={<Icon name="compass" />}
              text={isNarrow() ? t("topbar.browse") : t("topbar.browseRecent")}
              id="ds-tab-browse"
              className="ds-segmented-btn"
              classList={{ active: route().view === "browse" }}
              title={t("topbar.browseRecent")}
              onClick={() => navigate({ view: "browse" })}
            />
            <IconButton
              icon={<StorageIcon />}
              text={t("topbar.library")}
              id="ds-tab-library"
              className="ds-segmented-btn"
              classList={{ active: route().view === "library" }}
              title={t("topbar.library")}
              onClick={() => navigate({ view: "library" })}
            />
          </div>
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
          <span id="ds-title" style="margin-left:8px;">
            {title()}
          </span>
          <Show when={banner() !== null}>
            <div id="ds-banner">{banner()}</div>
          </Show>
          <div id="ds-actions">{actions()}</div>
          <div id="ds-topbar-tools">
            <IconButton
              className="ds-btn-icon"
              id="ds-page-refresh-btn"
              icon={<RefreshIcon />}
              title={t("topbar.refreshPageTooltip")}
              onClick={() => window.location.reload()}
            />
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