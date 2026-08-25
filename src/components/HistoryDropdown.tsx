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
            <div style="display:flex;align-items:center;justify-content:space-between;padding:4px 8px;background:var(--sys-control-bg,#f0f0f0);border-bottom:1px solid var(--sys-border-light,#ddd);font-weight:600;font-size:10px;color:var(--sys-text-secondary,#555);">
              <span style="display:flex;align-items:center;gap:4px;">
                {props.direction === "back" ? <ArrowLeftIcon /> : <ArrowRightIcon />}
                <span>{props.direction === "back" ? t("topbar.backHistoryTitle") : t("topbar.forwardHistoryTitle")}</span>
              </span>
              <span>{t("topbar.historyEntries", { count: items().length })}</span>
            </div>

            <div style="max-height:280px;overflow-y:auto;display:flex;flex-direction:column;padding:2px 0;">
              <For each={items()}>
                {(entry) => {
                  const meta = routeLabel(entry.route);
                  const iconName = meta.icon.replace(/^bi-/, "") as BootstrapIconName;
                  return (
                    <div
                      class="ds-history-item ds-item"
                      style="display:flex;align-items:center;gap:8px;padding:5px 8px;cursor:pointer;border:none;border-bottom:1px solid var(--sys-border-light,#f0f0f0);margin-bottom:0;"
                      onClick={() => selectItem(entry.index)}
                    >
                      <Icon
                        name={iconName}
                        style={{
                          "font-size": "13px",
                          color: "var(--sys-primary,#0078d4)",
                          "flex-shrink": 0,
                        }}
                      />
                      <div class="ds-fill" style="overflow:hidden;line-height:1.2;">
                        <div
                          class="ds-truncate"
                          style="font-weight:600;font-size:11px;color:var(--sys-text-primary,#111);"
                          title={meta.title}
                        >
                          {meta.title}
                        </div>
                        <Show when={meta.subtitle}>
                          <div
                            class="ds-truncate"
                            style="font-size:10px;color:var(--sys-text-muted,#777);"
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
