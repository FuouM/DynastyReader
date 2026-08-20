/**
 * Solid button components: standard push buttons and the two-click confirm-delete
 * pattern shared by the Library and Cache views. Port of `button.ts`.
 */

import { createSignal, onCleanup, Show, type JSX } from "solid-js";
import { showBanner } from "../stores";

export interface DsButtonProps {
  html?: JSX.Element;
  title?: string;
  cssText?: string;
  className?: string;
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
  onClick?: (ev: MouseEvent) => void;
  children?: JSX.Element;
  /** Optional DOM id (preserved for any legacy element hooks). */
  id?: string;
}

/** Standard WinForms-style push button. */
export function DsButton(props: DsButtonProps) {
  return (
    <button
      id={props.id}
      type={props.type ?? "button"}
      class={["win-button", props.className ?? "ds-btn-compact"].join(" ")}
      style={props.cssText}
      title={props.title}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      {props.children ?? props.html}
    </button>
  );
}

export interface ConfirmDeleteButtonProps {
  title: string;
  onConfirm: () => Promise<void>;
  cssText?: string;
  children?: JSX.Element;
}

/**
 * Two-click destructive button: first click arms the "Delete?" confirmation,
 * a second click inside the button confirms. Clicking anywhere else cancels.
 */
export function ConfirmDeleteButton(props: ConfirmDeleteButtonProps) {
  const [confirming, setConfirming] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  let btnEl: HTMLButtonElement | undefined;

  const onDocClick = (ev: MouseEvent): void => {
    if (!btnEl?.contains(ev.target as Node)) {
      setConfirming(false);
      document.removeEventListener("click", onDocClick);
    }
  };

  onCleanup(() => {
    document.removeEventListener("click", onDocClick);
  });

  const handleClick = async (): Promise<void> => {
    if (!confirming()) {
      setConfirming(true);
      setTimeout(() => {
        document.addEventListener("click", onDocClick);
      }, 0);
      return;
    }

    document.removeEventListener("click", onDocClick);
    setBusy(true);
    try {
      await props.onConfirm();
    } catch (err) {
      setBusy(false);
      setConfirming(false);
      const msg = err instanceof Error ? err.message : String(err);
      showBanner(`Deletion failed: ${msg}`);
    }
  };

  return (
    <button
      ref={btnEl}
      type="button"
      class={confirming() ? "win-button primary ds-danger ds-btn-compact" : "win-button ds-btn-compact"}
      style={`flex-shrink:0;${props.cssText ?? ""}`}
      title={
        confirming()
          ? "Click again to confirm deletion, or click outside to cancel"
          : props.title
      }
      disabled={busy()}
      onClick={(ev) => {
        ev.stopPropagation();
        void handleClick();
      }}
    >
      <Show when={busy()} fallback={<Show when={confirming()} fallback={props.children}><i class="bi bi-check-lg"></i> Delete?</Show>}>
        <i class="bi bi-hourglass-split"></i>
      </Show>
    </button>
  );
}