/**
 * Solid button components: standard push buttons and the two-click confirm-delete
 * pattern shared by the Library and Cache views. Port of `button.ts`.
 */

import { createSignal, Show, type JSX } from "solid-js";
import { debounce } from "@solid-primitives/scheduled";
import { t } from "../i18n";
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
  const resetConfirming = debounce(() => setConfirming(false), 3000);

  const handleClick = async (): Promise<void> => {
    if (busy()) return;
    if (!confirming()) {
      setConfirming(true);
      resetConfirming();
      return;
    }
    resetConfirming.clear();
    setConfirming(false);
    setBusy(true);
    try {
      await props.onConfirm();
    } finally {
      setBusy(false);
    }
  };

  const currentClass = () => {
    if (confirming()) {
      return (props.class ? `${props.class} ds-btn-danger` : "ds-btn-compact ds-btn-danger").replace("ds-btn-icon-sm", "ds-btn-compact");
    }
    if (props.class) return props.class;
    return props.children ? "ds-btn-compact" : "ds-btn-icon-sm";
  };

  return (
    <button
      type="button"
      class={`win-button ${currentClass()}`}
      style={props.cssText}
      title={
        confirming()
          ? t("common.confirm")
          : props.title
      }
      disabled={busy()}
      onClick={(ev) => {
        ev.stopPropagation();
        void handleClick();
      }}
    >
      <Show when={busy()} fallback={<Show when={confirming()} fallback={props.children}><CheckIcon /> {t("common.delete")}?</Show>}>
        <Icon name="hourglass-split" />
      </Show>
    </button>
  );
}