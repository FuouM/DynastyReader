/**
 * Solid modal component shared by every dialog in the app. Port of `modal.ts`.
 *
 * Renders the standard native WinForms-style scaffold through a `<Portal>`
 * mounted to `document.body`:
 *
 *   .ds-modal-backdrop
 *     └─ .ds-modal-window
 *          ├─ .ds-modal-header (title + close button)
 *          ├─ .ds-modal-body
 *          └─ .ds-modal-footer
 *
 * One Escape keydown listener + one backdrop-click listener are registered per
 * open modal and torn down on close. The window is zoom-scaled to match the
 * saved UI scale and its max-height/max-width are compensated so it stays
 * inside the viewport even when zoomed.
 */

import { createEffect, onCleanup, Show, type JSX } from "solid-js";
import { Portal } from "solid-js/web";
import { CloseIcon } from "./Icon";
import { uiScale } from "../stores";

export interface ModalProps {
  /** Controls whether the modal is rendered. */
  open: boolean;
  /** Title content for the header. Omit to skip the header. */
  title?: JSX.Element;
  /** Body content. */
  body?: JSX.Element;
  /** Body content passed as JSX children. */
  children?: JSX.Element;
  /** Footer content. */
  footer?: JSX.Element;
  /** Window width in px. */
  width?: number;
  /** Backdrop element id. */
  backdropId?: string;
  /** Called before the modal closes; return false to keep it open. */
  canClose?: () => boolean;
  /** Called after the modal is closed. */
  onClose?: () => void;
}

export function Modal(props: ModalProps) {
  let backdropEl: HTMLDivElement | undefined;
  let windowEl: HTMLDivElement | undefined;

  const close = (): void => {
    if (props.canClose && !props.canClose()) return;
    props.onClose?.();
  };

  createEffect(() => {
    if (!props.open) return;

    const onKeyDown = (ev: KeyboardEvent): void => {
      if (ev.key === "Escape") {
        ev.preventDefault();
        close();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    onCleanup(() => {
      window.removeEventListener("keydown", onKeyDown);
    });
  });

  createEffect(() => {
    if (!props.open || !windowEl) return;
    const scale = uiScale();
    windowEl.style.setProperty("zoom", String(scale));
    windowEl.style.maxHeight = `calc((100vh - 40px) / ${scale})`;
    windowEl.style.maxWidth = `calc((100vw - 40px) / ${scale})`;
  });

  return (
    <Show when={props.open}>
      <Portal mount={document.body}>
        <div
          ref={backdropEl}
          class="ds-modal-backdrop"
          id={props.backdropId}
          onClick={(ev) => {
            if (ev.target === backdropEl) close();
          }}
        >
          <div
            ref={windowEl}
            class="ds-modal-window"
            style={props.width ? { width: `${props.width}px` } : undefined}
          >
            <Show when={props.title !== undefined}>
              <div class="ds-modal-header">
                <span class="ds-modal-title">{props.title}</span>
                <button type="button" class="win-button ds-modal-close" title="Close (Esc)" onClick={close}>
                  <CloseIcon />
                </button>
              </div>
            </Show>
            <Show when={props.body !== undefined || props.children !== undefined}>
              <div class="ds-modal-body">{props.body ?? props.children}</div>
            </Show>
            <Show when={props.footer !== undefined}>
              <div class="ds-modal-footer">{props.footer}</div>
            </Show>
          </div>
        </div>
      </Portal>
    </Show>
  );
}