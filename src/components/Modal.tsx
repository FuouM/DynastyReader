/**
 * Solid modal component shared by every dialog in the app. Port of `modal.ts`.
 *
 * Renders the standard native WinForms-style scaffold through a `<Portal>`
 * mounted to `document.body`:
 *   .ds-modal-backdrop
 *     └─ .ds-modal-window
 *          ├─ .ds-modal-header (title + close button)
 *          ├─ .ds-modal-body
 *          └─ .ds-modal-footer
 *
 * One Escape keydown listener + one backdrop-click listener are registered per
 * open modal and torn down on close. The window is zoom-scaled to match the
 * saved UI scale and its max-height/max-width are compensated so it stays
 * within the visible viewport.
 */

import { createEffect, createUniqueId, onCleanup, Show, type JSX } from "solid-js";
import { Portal } from "solid-js/web";
import { t } from "../i18n";
import { makeEventListener } from "@solid-primitives/event-listener";
import { CloseIcon } from "./Icon";
import { IconButton } from "./Button";
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

  const titleId = createUniqueId();

  const close = (): void => {
    if (props.canClose && !props.canClose()) return;
    props.onClose?.();
  };

  // Capture the element that had focus when the modal opened and restore it
  // on close (WCAG 2.4.3). Cleanup runs when `open` flips false or on dispose.
  createEffect(() => {
    if (!props.open) return;
    const triggerEl = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    onCleanup(() => {
      if (triggerEl && triggerEl.isConnected) {
        triggerEl.focus();
      }
    });
  });

  createEffect(() => {
    if (!props.open) return;

    const onKeyDown = (ev: KeyboardEvent): void => {
      if (ev.key === "Escape") {
        ev.preventDefault();
        close();
      } else if (ev.key === "Tab" && windowEl) {
        const focusable = windowEl.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) {
          ev.preventDefault();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (ev.shiftKey) {
          if (document.activeElement === first || document.activeElement === windowEl) {
            ev.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            ev.preventDefault();
            first.focus();
          }
        }
      }
    };
    makeEventListener(window, "keydown", onKeyDown);
  });

  createEffect(() => {
    if (!props.open || !windowEl) return;
    if (document.activeElement && windowEl.contains(document.activeElement)) {
      return;
    }
    const autoFocusEl = windowEl.querySelector<HTMLElement>("[autofocus]");
    if (autoFocusEl) {
      autoFocusEl.focus();
    } else {
      windowEl.focus();
    }
  });

  return (
    <Show when={props.open}>
      <Portal mount={document.getElementById("ds-root") ?? document.body}>
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
            role="dialog"
            aria-modal="true"
            aria-labelledby={props.title !== undefined ? titleId : undefined}
            tabIndex={-1}
            style={props.width ? { width: `${props.width}px` } : undefined}
          >
            <Show when={props.title !== undefined}>
              <div class="ds-modal-header">
                <span class="ds-modal-title" id={titleId}>{props.title}</span>
                <IconButton
                  className="ds-modal-close"
                  title={`${t("common.close")} (Esc)`}
                  onClick={close}
                  icon={<CloseIcon />}
                />
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