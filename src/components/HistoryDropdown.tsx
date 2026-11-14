/**
 * Long-press / right-click history dropdown for Topbar Back and Forward buttons.
 * Allows quick jumping to any previous or forward history entry.
 */

import { createSignal, onCleanup, For, Show, type JSX } from "solid-js";
import { canGoBack, canGoForward, goBack, goForward, goBackTo, goForwardTo, historyBackStack, historyForwardStack, routeLabel } from "../stores/router";
import { isMobile } from "../stores/platform";
import { t, type TranslationKey } from "../i18n";
import { ArrowLeftIcon, ArrowRightIcon } from "./icons";
import { Icon } from "soulwindow/solid";
import { AnchoredPopover } from "./AnchoredPopover";

type HistoryDirection = "back" | "forward";

interface HistoryDropdownProps {
  direction: HistoryDirection;
  anchorEl: HTMLElement | null;
  onClose: () => void;
}

const NAV_BUTTONS: Record<HistoryDirection, {
  id: string;
  labelKey: TranslationKey;
  tooltipKey: TranslationKey;
  canGo: () => boolean;
  go: () => void;
  icon: () => JSX.Element;
}> = {
  back: {
    id: "ds-nav-back",
    labelKey: "common.back",
    tooltipKey: "topbar.navBackTooltip",
    canGo: canGoBack,
    go: goBack,
    icon: () => <ArrowLeftIcon />,
  },
  forward: {
    id: "ds-nav-forward",
    labelKey: "common.forward",
    tooltipKey: "topbar.navForwardTooltip",
    canGo: canGoForward,
    go: goForward,
    icon: () => <ArrowRightIcon />,
  },
};

function useHistoryHoldMenu() {
  const [historyMenu, setHistoryMenu] = createSignal<{
    direction: HistoryDirection;
    anchorEl: HTMLElement;
  } | null>(null);
  let holdTimer: number | null = null;
  let didHold = false;

  const startHold = (direction: HistoryDirection, anchorEl: HTMLElement): void => {
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
function HistoryDropdown(props: HistoryDropdownProps) {
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
      open={items().length > 0}
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
            const iconName = meta.icon.replace(/^bi-/, "");
            return (
              <div
                class="ds-history-item ds-item"
                role="button"
                tabIndex={0}
                onClick={() => selectItem(entry.index)}
                onKeyDown={(ev) => {
                  if (ev.key === "Enter" || ev.key === " ") {
                    ev.preventDefault();
                    selectItem(entry.index);
                  }
                }}
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

  const navButton = (direction: HistoryDirection) => {
    const nav = NAV_BUTTONS[direction];
    return (
      <button
        type="button"
        class="win-button ds-segmented-btn ds-nav-history-btn"
        id={nav.id}
        aria-label={t(nav.labelKey)}
        title={isMobile() ? undefined : t(nav.tooltipKey)}
        disabled={!nav.canGo()}
        onPointerDown={(ev) => {
          if (ev.button === 0 && nav.canGo()) {
            try { (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId); } catch {}
            startHold(direction, ev.currentTarget);
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
          if (nav.canGo()) {
            markHeld();
            setHistoryMenu({ direction, anchorEl: ev.currentTarget });
          }
        }}
        onClick={() => {
          if (!didHold() && nav.canGo()) {
            nav.go();
          }
        }}
      >
        <span class="ds-btn-icon-wrap">{nav.icon()}</span>
      </button>
    );
  };

  return (
    <>
      <div class="ds-segmented-switch ds-nav-history-switch" id="ds-nav-history">
        {navButton("back")}
        {navButton("forward")}
      </div>
      <Show when={historyMenu() !== null}>
        <HistoryDropdown
          direction={historyMenu()!.direction}
          anchorEl={historyMenu()!.anchorEl}
          onClose={() => setHistoryMenu(null)}
        />
      </Show>
    </>
  );
}
