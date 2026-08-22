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
        setIsNarrow(width < 680);
        setIsCompact(width < 780);
      }
    });
    ro.observe(topbarEl);
    onCleanup(() => ro.disconnect());
  });

  return (
    <>
      <div id="ds-topbar" ref={topbarEl} classList={{ "ds-narrow": isCompact() }}>
        <div id="ds-topbar-main">
          <div class="ds-flex-row" id="ds-nav-tabs">
            <div class="ds-segmented-switch" id="ds-view-switch">
              <button
                type="button"
                class="ds-segmented-btn"
                id="ds-tab-browse"
                classList={{ active: route().view === "browse" }}
                title="Browse &amp; Recent"
                onClick={() => navigate({ view: "browse" })}
              >
                <Icon name="compass" /> <span>{isNarrow() ? "Browse" : "Browse & Recent"}</span>
              </button>
              <button
                type="button"
                class="ds-segmented-btn"
                id="ds-tab-library"
                classList={{ active: route().view === "library" }}
                title="Library"
                onClick={() => navigate({ view: "library" })}
              >
                <StorageIcon /> <span>Library</span>
              </button>
            </div>
            <div class="ds-segmented-switch ds-nav-history-switch" id="ds-nav-history">
              <button
                type="button"
                class="ds-segmented-btn ds-nav-history-btn"
                id="ds-nav-back"
                title="Back (click to go back, hold or right-click for history)"
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
                title="Forward (click to go forward, hold or right-click for history)"
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
              <div id="ds-session-tab-wrap" style="display:inline-flex;margin-left:2px;">
                <button
                  type="button"
                  class="win-button ds-nav-tab ds-session-tab"
                  classList={{ active: isInMangaView() }}
                  onClick={() => {
                    const tab = sessionTab();
                    if (tab) navigate(tab.route);
                  }}
                >
                  <DoublePageIcon />
                  <span class="ds-truncate">{decodeEntities(sessionTab()!.title)}</span>
                  <CloseIcon
                    class="ds-tab-close"
                    title="Close tab"
                    onClick={(ev: MouseEvent) => {
                      ev.stopPropagation();
                      closeSessionMangaTab();
                    }}
                  />
                </button>
              </div>
            </Show>
          </div>
          <span id="ds-title" style="margin-left:8px;">
            {title()}
          </span>
          <Show when={banner() !== null}>
            <div id="ds-banner">{banner()}</div>
          </Show>
          <div id="ds-actions">{actions()}</div>
          <div id="ds-topbar-tools">
            <button
              type="button"
              class="win-button ds-btn-sm"
              id="ds-page-refresh-btn"
              title="Refresh Page"
              onClick={() => window.location.reload()}
            >
              <RefreshIcon />
            </button>
            <button
              type="button"
              class="win-button ds-btn-sm"
              id="ds-settings-btn"
              title="Settings (UI Scale &amp; Preferences)"
              onClick={() => setSettingsOpen(true)}
            >
              <SettingsIcon />
            </button>
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