/**
 * Solid button components: standard push buttons, icon+text command buttons,
 * and the two-click confirm-delete pattern shared by the Library and Cache
 * views. Port of `button.ts`.
 */

import { createSignal, type JSX } from "solid-js";
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

export interface IconButtonProps {
  id?: string;
  className?: string;
  classList?: Record<string, boolean>;
  cssText?: string;
  title?: string;
  disabled?: boolean;
  icon: JSX.Element;
  text?: string | JSX.Element;
  textClass?: string;
  onClick?: (ev: MouseEvent) => void;
}

/**
 * WinForms-style command button with a leading icon and optional text label.
 * Renders the icon followed by `<span class={textClass}>{text}</span>`.
 * Omit `text` for icon-only buttons.
 */
export function IconButton(props: IconButtonProps) {
  return (
    <button
      type="button"
      id={props.id}
      class={`win-button ${props.className ?? "ds-btn-compact"}`.trim()}
      classList={props.classList}
      style={props.cssText}
      title={props.title}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      {props.icon ? <span style="border:1px solid red; display:inline-flex; align-items:center">{props.icon}</span> : null}
      {props.text !== undefined && props.text !== "" ? (
        <span style="border:1px solid blue" class={props.textClass ?? "ds-btn-text"}>{props.text}</span>
      ) : null}
    </button>
  );
}

export interface ConfirmDeleteButtonProps extends Omit<IconButtonProps, "onClick"> {
  onConfirm: () => Promise<void> | void;
}

/**
 * Two-stage confirmation button built on IconButton: first click shows a
 * "Delete?" prompt with a checkmark; clicking again within 3 seconds
 * invokes `onConfirm()`.
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

  const currentIcon = () => {
    if (busy()) return <Icon name="hourglass-split" />;
    if (confirming()) return <CheckIcon />;
    return props.icon;
  };

  const currentText = () => {
    if (busy()) return undefined;
    if (confirming()) return t("common.delete") + "?";
    return props.text;
  };

  const currentClassName = () => {
    if (confirming()) {
      return (props.className ? `${props.className} ds-btn-danger` : "ds-btn-compact ds-btn-danger").replace("ds-btn-icon-sm", "ds-btn-compact");
    }
    return props.className;
  };

  return (
    <IconButton
      id={props.id}
      className={currentClassName()}
      cssText={props.cssText}
      title={confirming() ? t("common.confirm") : props.title}
      disabled={busy()}
      icon={currentIcon()}
      text={currentText()}
      textClass={props.textClass}
      onClick={(ev) => {
        ev.stopPropagation();
        void handleClick();
      }}
    />
  );
}