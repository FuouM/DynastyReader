/**
 * Long-press / right-click history dropdown for Topbar Back and Forward buttons.
 * Allows quick jumping to any previous or forward history entry.
 */

import { createEffect, createSignal, For, Show } from "solid-js";
import { Portal } from "solid-js/web";
import {
  decodeEntities,
  goBackTo,
  goForwardTo,
  historyBackStack,
  historyForwardStack,
  uiScale,
  type Route,
} from "../stores";

export function formatRouteLabel(r: Route): { title: string; subtitle?: string; icon: string } {
  switch (r.view) {
    case "browse": {
      const tab = r.browseTab || "releases";
      const tabNames: Record<string, string> = {
        releases: "Recent Releases",
        added: "Recently Added",
        downloaded: "Downloaded",
        "series-dir": "Series Directory",
        "tags-dir": "Tags Directory",
        search: "Tag & Search",
      };
      return {
        title: tabNames[tab] || "Browse",
        subtitle: "Browse",
        icon: "bi-compass",
      };
    }
    case "library":
      return {
        title: r.collectionId !== undefined ? "Collection Detail" : "Library",
        subtitle: "Library",
        icon: "bi-collection",
      };
    case "series":
      return {
        title: decodeEntities(r.seriesName || r.seriesPermalink || "Series"),
        subtitle: "Series",
        icon: "bi-collection-play",
      };
    case "reader":
      return {
        title: decodeEntities(r.chapterTitle || r.chapterPermalink || "Reader"),
        subtitle: r.seriesName ? decodeEntities(r.seriesName) : "Chapter",
        icon: "bi-book",
      };
    case "cache":
      return {
        title: "Cache Management",
        icon: "bi-hdd-stack",
      };
    case "blacklist":
      return {
        title: "Series Blacklist",
        icon: "bi-shield-slash",
      };
    default:
      return {
        title: "Unknown",
        icon: "bi-link-45deg",
      };
  }
}

export interface HistoryDropdownProps {
  direction: "back" | "forward";
  anchorEl: HTMLElement | null;
  open: boolean;
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
    if (!props.open) return;
    const scale = uiScale() || 1;
    const baseStyle = `position:fixed;width:240px;max-width:90vw;background:var(--sys-window-bg,#fff);border:1px solid var(--sys-border-dark,#999);border-radius:3px;box-shadow:0 4px 16px rgba(0,0,0,0.22);display:flex;flex-direction:column;overflow:hidden;font-size:12px;color:var(--sys-window-text,#222);z-index:10001;zoom:${scale};`;

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
    const vpWidth = window.innerWidth / scale;

    let left = screenLeft;
    if (left + width > vpWidth - 8) {
      left = Math.max(8, screenRight - width);
    }

    setPositionStyle(
      `${baseStyle}top:${Math.max(4, Math.round(screenBottom + 2))}px;left:${Math.max(4, Math.round(left))}px;`,
    );
  });

  const selectItem = (originalIdx: number) => {
    props.onClose();
    if (props.direction === "back") {
      goBackTo(originalIdx);
    } else {
      goForwardTo(originalIdx);
    }
  };

  return (
    <Show when={props.open && items().length > 0}>
      <Portal mount={document.body}>
        <div
          id="ds-history-dropdown-overlay"
          style="position:fixed;inset:0;background:transparent;z-index:10000;pointer-events:auto;"
          onClick={(ev) => {
            if (ev.target === ev.currentTarget) props.onClose();
          }}
          onContextMenu={(ev) => {
            ev.preventDefault();
            props.onClose();
          }}
        >
          <div
            class="ds-history-dropdown"
            style={positionStyle()}
            onClick={(ev) => ev.stopPropagation()}
          >
            <div style="display:flex;align-items:center;justify-content:space-between;padding:4px 8px;background:var(--sys-control-bg,#f0f0f0);border-bottom:1px solid var(--sys-border-light,#ddd);font-weight:600;font-size:10px;color:var(--sys-text-secondary,#555);">
              <span style="display:flex;align-items:center;gap:4px;">
                <i class={`bi bi-arrow-${props.direction === "back" ? "left" : "right"}`}></i>
                <span>{props.direction === "back" ? "Back History" : "Forward History"}</span>
              </span>
              <span>{items().length} entries</span>
            </div>

            <div style="max-height:280px;overflow-y:auto;display:flex;flex-direction:column;padding:2px 0;">
              <For each={items()}>
                {(entry) => {
                  const meta = formatRouteLabel(entry.route);
                  return (
                    <div
                      class="ds-history-item ds-item"
                      style="display:flex;align-items:center;gap:8px;padding:5px 8px;cursor:pointer;border:none;border-bottom:1px solid var(--sys-border-light,#f0f0f0);margin-bottom:0;"
                      onClick={() => selectItem(entry.index)}
                    >
                      <i
                        class={`bi ${meta.icon}`}
                        style="font-size:13px;color:var(--sys-primary,#0078d4);flex-shrink:0;"
                      ></i>
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
