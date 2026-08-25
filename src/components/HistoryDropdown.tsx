/**
 * Long-press / right-click history dropdown for Topbar Back and Forward buttons.
 * Allows quick jumping to any previous or forward history entry.
 */

import { createEffect, createSignal, For, Show } from "solid-js";
import { Portal } from "solid-js/web";
import {
  goBackTo,
  goForwardTo,
  historyBackStack,
  historyForwardStack,
  routeLabel,
  uiScale,
} from "../stores";
import { t } from "../i18n";
import { ArrowLeftIcon, ArrowRightIcon, Icon, type BootstrapIconName } from "./Icon";

export interface HistoryDropdownProps {
  direction: "back" | "forward";
  anchorEl: HTMLElement | null;
  open?: boolean;
  onClose: () => void;
}
export function HistoryDropdown(props: HistoryDropdownProps) {
  const [positionStyle, setPositionStyle] = createSignal("");

  const items = () => {
    if (props.direction === "back") {
      const back = historyBackStack();
      // Most recent back item is at the end of the array, so reverse for top-down list
      return back
        .map((r, originalIdx) => ({ route: r, index: originalIdx }))
        .slice()
        .reverse();
    } else {
      const forward = historyForwardStack();
      // Most recent forward item is at the end of the array, so reverse for top-down list
      return forward
        .map((r, originalIdx) => ({ route: r, index: originalIdx }))
        .slice()
        .reverse();
    }
  };

  createEffect(() => {
    if (props.open === false) return;
    const scale = uiScale() || 1;
    const baseStyle = `width:240px;max-width:90vw;zoom:${scale};`;
    const anchor = props.anchorEl;
    if (!anchor) {
      setPositionStyle(`${baseStyle}top:36px;left:80px;`);
      return;
    }

    const rect = anchor.getBoundingClientRect();
    const width = 240;
    const screenBottom = rect.bottom / scale;
    const screenLeft = rect.left / scale;
    const screenRight = rect.right / scale;

    let x = props.direction === "back" ? screenLeft : screenRight - width;
    if (x + width > window.innerWidth / scale - 8) {
      x = window.innerWidth / scale - width - 8;
    }
    if (x < 8) x = 8;

    const y = screenBottom + 4;
    setPositionStyle(`${baseStyle}top:${y}px;left:${x}px;`);
  });

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
    <Show when={(props.open !== false) && items().length > 0}>
      <Portal mount={document.body}>
        <div
          id="ds-history-dropdown-overlay"
          class="ds-overlay"
          onClick={(ev) => {
            if (ev.target === ev.currentTarget) props.onClose();
          }}
          onContextMenu={(ev) => {
            ev.preventDefault();
            props.onClose();
          }}
        >
          <div
            class="ds-popup-card ds-history-dropdown"
            style={positionStyle()}
            onClick={(ev) => ev.stopPropagation()}
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
          </div>
        </div>
      </Portal>
    </Show>
  );
}
