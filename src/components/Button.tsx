/**
 * Solid button components: standard push buttons and the two-click confirm-delete
 * pattern shared by the Library and Cache views. Port of `button.ts`.
 */

import { createSignal, onCleanup, Show, type JSX } from "solid-js";
import { CheckIcon, Icon } from "./Icon";

export interface DsButtonProps {
  id?: string;
  className?: string;
  cssText?: string;
  title?: string;
  disabled?: boolean;
  onClick?: (ev: MouseEvent) => void;
  children?: JSX.Element;
}

/**
 * Standard WinForms desktop-style command button (`.win-button`).
 */
export function DsButton(props: DsButtonProps) {
  return (
    <button
      type="button"
      id={props.id}
      class={`win-button ${props.className ?? "ds-btn-compact"}`.trim()}
      style={props.cssText}
      title={props.title}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}

export interface ConfirmDeleteButtonProps {
  onConfirm: () => Promise<void> | void;
  title?: string;
  class?: string;
  cssText?: string;
  children?: JSX.Element;
}

/**
 * Two-stage confirmation button: first click shows a "Delete?" prompt with a
 * checkmark; clicking again within 3 seconds invokes `onConfirm()`.
 */
export function ConfirmDeleteButton(props: ConfirmDeleteButtonProps) {
  const [confirming, setConfirming] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  let timer: number | null = null;

  onCleanup(() => {
    if (timer !== null) window.clearTimeout(timer);
  });

  const handleClick = async (): Promise<void> => {
    if (busy()) return;
    if (!confirming()) {
      setConfirming(true);
      timer = window.setTimeout(() => setConfirming(false), 3000);
      return;
    }
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
    setConfirming(false);
    setBusy(true);
    try {
      await props.onConfirm();
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      class={`win-button ${props.class ?? "ds-btn-compact"}${confirming() ? " ds-btn-danger" : ""}`}
      style={props.cssText}
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
      <Show when={busy()} fallback={<Show when={confirming()} fallback={props.children}><CheckIcon /> Delete?</Show>}>
        <Icon name="hourglass-split" />
      </Show>
    </button>
  );
}