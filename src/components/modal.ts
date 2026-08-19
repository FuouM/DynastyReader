import { getSavedUiScale } from "../ui-scale";

/**
 * Modal factory shared by every dialog in the app. Builds the standard native
 * WinForms-style scaffold:
 *
 *   .ds-modal-backdrop
 *     └─ .ds-modal-window
 *          ├─ .ds-modal-header (title + close button)
 *          ├─ .ds-modal-body
 *          └─ .ds-modal-footer
 *
 * One Escape keydown listener + one backdrop-click listener are registered
 * per modal and torn down on close. The window is zoom-scaled to match the
 * saved UI scale and its max-height/max-width are compensated so it stays
 * inside the viewport even when zoomed.
 */

export interface ModalOptions {
  /** HTML for the title area (trusted icon + label). Omit to skip the header. */
  title?: string;
  /** HTML for the body region. */
  body?: string;
  /** HTML for the footer region. */
  footer?: string;
  /** Window width in px. */
  width?: number;
  /** Zoom scale to apply to the window (defaults to the saved UI scale). */
  scale?: number;
  /** Backdrop element id. If an element with this id exists it is replaced. */
  backdropId?: string;
  /** Called before the modal closes; return false to keep it open. */
  canClose?: () => boolean;
  /** Called after the modal is removed from the DOM. */
  onClose?: () => void;
}

export interface ModalHandle {
  backdrop: HTMLElement;
  modal: HTMLElement;
  close: () => void;
}

export function openModal(opts: ModalOptions): ModalHandle {
  if (opts.backdropId) {
    document.getElementById(opts.backdropId)?.remove();
  }

  const backdrop = document.createElement("div");
  backdrop.className = "ds-modal-backdrop";
  if (opts.backdropId) backdrop.id = opts.backdropId;

  const modal = document.createElement("div");
  modal.className = "ds-modal-window";
  if (opts.width) modal.style.width = `${opts.width}px`;

  const scale = opts.scale ?? getSavedUiScale();
  applyModalZoom(modal, scale);

  const parts: string[] = [];

  if (opts.title !== undefined) {
    parts.push(
      '<div class="ds-modal-header">' +
        `<span class="ds-modal-title">${opts.title}</span>` +
        '<button type="button" class="win-button ds-modal-close" title="Close (Esc)">' +
        '<i class="bi bi-x-lg"></i>' +
        "</button>" +
        "</div>",
    );
  }

  if (opts.body !== undefined) {
    parts.push(`<div class="ds-modal-body">${opts.body}</div>`);
  }

  if (opts.footer !== undefined) {
    parts.push(`<div class="ds-modal-footer">${opts.footer}</div>`);
  }

  modal.innerHTML = parts.join("");

  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);

  let closed = false;
  const close = (): void => {
    if (closed) return;
    if (opts.canClose && !opts.canClose()) return;
    closed = true;
    window.removeEventListener("keydown", onKeyDown);
    backdrop.remove();
    opts.onClose?.();
  };

  const onKeyDown = (ev: KeyboardEvent): void => {
    if (ev.key === "Escape") {
      ev.preventDefault();
      close();
    }
  };
  window.addEventListener("keydown", onKeyDown);

  backdrop.addEventListener("click", (ev) => {
    if (ev.target === backdrop) close();
  });
  modal.querySelector(".ds-modal-close")?.addEventListener("click", close);

  return { backdrop, modal, close };
}

/** Applies zoom + viewport-compensated max-size to a modal window element. */
export function applyModalZoom(modal: HTMLElement, scale: number): void {
  modal.style.setProperty("zoom", String(scale));
  modal.style.maxHeight = `calc((100vh - 40px) / ${scale})`;
  modal.style.maxWidth = `calc((100vw - 40px) / ${scale})`;
}