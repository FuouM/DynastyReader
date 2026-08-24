/**
 * Solid button components: standard push buttons, icon+text command buttons,
 * and the two-click confirm-delete pattern shared by the Library and Cache
 * views. Port of `button.ts`.
 */

import { createSignal, type JSX } from "solid-js";
import { debounce } from "@solid-primitives/scheduled";
import { t } from "../i18n";
import { CheckIcon, Icon } from "./Icon";
export interface ButtonProps {
  id?: string;
  className?: string;
  classList?: Record<string, boolean>;
  cssText?: string;
  style?: string | JSX.CSSProperties;
  title?: string;
  disabled?: boolean;
  icon?: JSX.Element;
  text?: string | JSX.Element;
  textClass?: string;
  reverse?: boolean;
  onClick?: (ev: MouseEvent) => void;
  children?: JSX.Element;
}

export type DsButtonProps = ButtonProps;
export type IconButtonProps = ButtonProps;

/**
 * Unified WinForms-style desktop command button (`.win-button`).
 * Automatically defaults className:
 * - Icon-only button (`icon` without `text` or `children`): "ds-btn-icon"
 * - Button with text / children: "ds-btn-compact"
 */
export function Button(props: ButtonProps) {
  const defaultClass = props.icon && !props.text && !props.children
    ? "ds-btn-icon"
    : "ds-btn-compact";

  const resolvedClass = () => {
    if (!props.className) return defaultClass;
    const hasExplicitSize = /(?:^|\s)(ds-btn-(?:compact|sm|xs|icon|icon-xs|icon-sm)|ds-segmented-btn|ds-subtab|ds-bn-tab|ds-nav-btn|ds-modal-close)(?:$|\s)/.test(props.className);
    return hasExplicitSize ? props.className : `${defaultClass} ${props.className}`;
  };

  const iconSpan = props.icon ? <span style="border:1px solid red; display:inline-flex; align-items:center">{props.icon}</span> : null;
  const content = props.text !== undefined && props.text !== "" ? (
    <span style="border:1px solid blue" class={props.textClass ?? "ds-btn-text"}>{props.text}</span>
  ) : props.children !== undefined ? (
    <span style="border:1px solid blue">{props.children}</span>
  ) : null;

  return (
    <button
      type="button"
      id={props.id}
      class={`win-button ${resolvedClass()}`.trim()}
      classList={props.classList}
      style={props.style ?? props.cssText}
      title={props.title}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      {props.reverse ? <>{content}{iconSpan}</> : <>{iconSpan}{content}</>}
    </button>
  );
}

/** Backward-compatible aliases */
export const DsButton = Button;
export const IconButton = Button;

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
      return (props.className ? `${props.className} ds-btn-danger` : "ds-btn-compact ds-btn-danger")
        .replace("ds-btn-icon-sm", "ds-btn-compact")
        .replace("ds-btn-icon", "ds-btn-compact");
    }
    return props.className;
  };

  return (
    <Button
      id={props.id}
      className={currentClassName()}
      style={props.style ?? props.cssText}
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

// ── Icon + Text inline pattern ──────────────────────────────────────────
export interface IconTextProps {
  icon: JSX.Element;
  children: JSX.Element;
  class?: string;
  style?: string | JSX.CSSProperties;
}

/**
 * Unified [Icon][Text] inline pattern. Replaces scattered `<Icon /> {text}`
 * throughout group-box-titles, section headers, and inline labels.
 */
export function IconText(props: IconTextProps) {
  return (
    <span
      class={`ds-icon-text${props.class ? ` ${props.class}` : ""}`}
      style={props.style}
    >
      <span style="border:1px solid red;display:inline-flex;align-items:center;">{props.icon}</span>
      <span style="border:1px solid blue;">{props.children}</span>
    </span>
  );
}