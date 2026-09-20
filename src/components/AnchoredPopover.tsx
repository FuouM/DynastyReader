/**
 * Anchored floating popover/dropdown primitive.
 * Portals to document.body, positions relative to anchorEl with uiScale compensation
 * and viewport boundary clamping, and handles click-outside, scroll, and Escape dismissal.
 */

import { createEffect, createSignal, Show, type JSX } from "solid-js";
import { Portal } from "solid-js/web";
import { makeEventListener } from "@solid-primitives/event-listener";
import { uiScale } from "../stores/ui-scale";
import { isMobile } from "../stores/platform";

export interface AnchoredPopoverProps {
  open: boolean;
  anchorEl?: HTMLElement | null;
  onClose: () => void;
  width?: number;
  maxWidth?: string;
  align?: "left" | "right" | "auto";
  overlayId?: string;
  overlayClass?: string;
  popoverId?: string;
  popoverClass?: string;
  children: JSX.Element;
}

export function AnchoredPopover(props: AnchoredPopoverProps) {
  const [positionStyle, setPositionStyle] = createSignal("");
  let popoverRef: HTMLDivElement | undefined;

  createEffect(() => {
    if (!props.open) return;
    const openedAt = Date.now();

    const onKeyDown = (ev: KeyboardEvent): void => {
      if (ev.key === "Escape") {
        ev.preventDefault();
        props.onClose();
      }
    };

    const onScroll = (ev: Event): void => {
      if (Date.now() - openedAt < 250) return;
      if (popoverRef && document.activeElement && popoverRef.contains(document.activeElement)) {
        return;
      }
      const target = ev.target as Node | null;
      if (target && popoverRef && popoverRef.contains(target)) {
        return;
      }
      props.onClose();
    };

    const cleanupKey = makeEventListener(window, "keydown", onKeyDown);
    const cleanupScroll = makeEventListener(window, "scroll", onScroll, { capture: true, passive: true });

    return () => {
      cleanupKey();
      cleanupScroll();
    };
  });

  createEffect(() => {
    if (!props.open) return;
    const scale = uiScale() || 1;
    const width = props.width ?? 260;
    const baseStyle = `width:${width}px;${props.maxWidth ? `max-width:${props.maxWidth};` : "max-width:90vw;"}`;

    if (isMobile() && !props.anchorEl) {
      setPositionStyle("top:20%;left:50%;transform:translateX(-50%);");
      return;
    }

    const anchor = props.anchorEl;
    if (!anchor) {
      setPositionStyle(`${baseStyle}top:36px;left:80px;`);
      return;
    }

    const rect = anchor.getBoundingClientRect();
    const estHeight = 260;
    const screenBottom = rect.bottom / scale;
    const screenTop = rect.top / scale;
    const screenLeft = rect.left / scale;
    const screenRight = rect.right / scale;
    const vpWidth = window.innerWidth / scale;
    const vpHeight = window.innerHeight / scale;

    let left = screenLeft;
    if (props.align === "right") {
      left = screenRight - width;
    } else if (props.align === "left") {
      left = screenLeft;
    } else {
      if (left + width > vpWidth - 8) {
        left = Math.max(8, screenRight - width);
      }
    }

    if (left + width > vpWidth - 8) {
      left = Math.max(8, vpWidth - width - 8);
    }
    if (left < 8) left = 8;

    let vertical = "";
    if (screenBottom + estHeight > vpHeight - 8 && screenTop > 100) {
      vertical = `bottom:${Math.max(4, Math.round(vpHeight - screenTop + 4))}px;`;
    } else {
      vertical = `top:${Math.max(4, Math.round(screenBottom + 4))}px;`;
    }

    setPositionStyle(`${baseStyle}${vertical}left:${Math.max(4, Math.round(left))}px;`);
  });

  return (
    <Show when={props.open}>
      <Portal mount={document.body}>
        <div
          id={props.overlayId}
          class={`ds-overlay${props.overlayClass ? ` ${props.overlayClass}` : ""}`}
          onClick={() => props.onClose()}
        >
          <div
            ref={popoverRef}
            id={props.popoverId}
            class={props.popoverClass ?? "ds-dropdown-menu"}
            style={positionStyle()}
            onClick={(ev) => ev.stopPropagation()}
          >
            {props.children}
          </div>
        </div>
      </Portal>
    </Show>
  );
}
