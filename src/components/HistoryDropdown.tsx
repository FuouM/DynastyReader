/**
 * Long-press / right-click history dropdown for Topbar Back and Forward buttons.
 * Allows quick jumping to any previous or forward history entry.
 */

import { createSignal, onCleanup, For, Show } from "solid-js";
import { canGoBack, canGoForward, goBack, goForward, goBackTo, goForwardTo, historyBackStack, historyForwardStack, routeLabel } from "../stores/router";
import { isMobile } from "../stores/platform";
import { t } from "../i18n";
import { ArrowLeftIcon, ArrowRightIcon, Icon, type BootstrapIconName } from "./Icon";
import { AnchoredPopover } from "./AnchoredPopover";

export interface HistoryDropdownProps {
  direction: "back" | "forward";
  anchorEl: HTMLElement | null;
  open?: boolean;
  onClose: () => void;
}
export function useHistoryHoldMenu() {
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

  const markHeld = (): void => {
    didHold = true;
  };

  onCleanup(() => cancelHold());

  return { historyMenu, setHistoryMenu, startHold, cancelHold, didHold: () => didHold, markHeld };
}
export function HistoryDropdown(props: HistoryDropdownProps) {
  const items = () => {
    const stack = props.direction === "back" ? historyBackStack() : historyForwardStack();
    return stack.map((route, index) => ({ route, index })).reverse();
  };

  const selectItem = (originalIdx: number): void => {
    const dir = props.direction;
    props.onClose();
    if (dir === "back") {
      goBackTo(originalIdx);
    } else {
      goForwardTo(originalIdx);
    }
  };

  return (
    <AnchoredPopover
      open={!!((props.open ?? true) && items().length > 0)}
      anchorEl={props.anchorEl}
      onClose={props.onClose}
      width={240}
      align={props.direction === "back" ? "left" : "right"}
      overlayId="ds-history-dropdown-overlay"
      popoverClass="ds-popup-card ds-history-dropdown"
    >
      <div class="ds-history-header">
        <span class="ds-history-header-label">
          {props.direction === "back" ? <ArrowLeftIcon /> : <ArrowRightIcon />}
          <span>{props.direction === "back" ? t("topbar.backHistoryTitle") : t("topbar.forwardHistoryTitle")}</span>
        </span>
        <span>{t("topbar.historyEntries", { count: items().length })}</span>
      </div>

      <div class="ds-history-list">
        <For each={items()}>
          {(entry) => {
            const meta = routeLabel(entry.route);
            const iconName = meta.icon.replace(/^bi-/, "") as BootstrapIconName;
            return (
              <div
                class="ds-history-item ds-item"
                onClick={() => selectItem(entry.index)}
              >
                <Icon
                  name={iconName}
                  class="ds-history-icon"
                />
                <div class="ds-fill ds-history-item-main">
                  <div
                    class="ds-truncate ds-history-item-title"
                    title={meta.title}
                  >
                    {meta.title}
                  </div>
                  <Show when={meta.subtitle}>
                    <div
                      class="ds-truncate ds-history-item-sub"
                    >
                      {meta.subtitle}
                    </div>
                  </Show>
                </div>
              </div>
            );
          }}
        </For>
      </div>
    </AnchoredPopover>
  );
}

export function HistoryNavButtons() {
  const { historyMenu, setHistoryMenu, startHold, cancelHold, didHold, markHeld } = useHistoryHoldMenu();

  return (
    <>
      <div class="ds-segmented-switch ds-nav-history-switch" id="ds-nav-history">
        <button
          type="button"
          class="win-button ds-segmented-btn ds-nav-history-btn"
          id="ds-nav-back"
          aria-label={t("common.back")}
          title={isMobile() ? undefined : t("topbar.navBackTooltip")}
          disabled={!canGoBack()}
          onPointerDown={(ev) => {
            if (ev.button === 0 && canGoBack()) {
              try { (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId); } catch {}
              startHold("back", ev.currentTarget);
            }
          }}
          onPointerUp={(ev) => {
            try { (ev.currentTarget as HTMLElement).releasePointerCapture(ev.pointerId); } catch {}
            if (didHold()) ev.preventDefault();
            cancelHold();
          }}
          onPointerCancel={() => cancelHold()}
          onPointerLeave={() => cancelHold()}
          onContextMenu={(ev) => {
            ev.preventDefault();
            if (canGoBack()) {
              markHeld();
              setHistoryMenu({ direction: "back", anchorEl: ev.currentTarget });
            }
          }}
          onClick={() => {
            if (!didHold() && canGoBack()) {
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
          aria-label={t("common.forward")}
          title={isMobile() ? undefined : t("topbar.navForwardTooltip")}
          disabled={!canGoForward()}
          onPointerDown={(ev) => {
            if (ev.button === 0 && canGoForward()) {
              try { (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId); } catch {}
              startHold("forward", ev.currentTarget);
            }
          }}
          onPointerUp={(ev) => {
            try { (ev.currentTarget as HTMLElement).releasePointerCapture(ev.pointerId); } catch {}
            if (didHold()) ev.preventDefault();
            cancelHold();
          }}
          onPointerCancel={() => cancelHold()}
          onPointerLeave={() => cancelHold()}
          onContextMenu={(ev) => {
            ev.preventDefault();
            if (canGoForward()) {
              markHeld();
              setHistoryMenu({ direction: "forward", anchorEl: ev.currentTarget });
            }
          }}
          onClick={() => {
            if (!didHold() && canGoForward()) {
              goForward();
            }
          }}
        >
          <span class="ds-btn-icon-wrap"><ArrowRightIcon /></span>
        </button>
      </div>
      <Show when={historyMenu() !== null}>
        <HistoryDropdown
          open={true}
          direction={historyMenu()!.direction}
          anchorEl={historyMenu()!.anchorEl}
          onClose={() => setHistoryMenu(null)}
        />
      </Show>
    </>
  );
}
