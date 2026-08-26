/**
 * Solid button components: standard push buttons, icon+text command buttons,
 * and the two-click confirm-delete pattern shared by the Library and Cache
 * views. Port of `button.ts`.
 */

import { For, createSignal, type JSX } from "solid-js";
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

/**
 * Unified WinForms-style desktop command button (`.win-button`).
 * Automatically defaults className:
 * - Icon-only button (`icon` without `text` or `children`): "ds-btn-icon"
 * - Button with text / children: "ds-btn-compact"
 */
export function Button(props: ButtonProps) {
  const defaultClass = () => (props.icon && !props.text && !props.children
    ? "ds-btn-icon"
    : "ds-btn-compact");

  const resolvedClass = () => {
    if (!props.className) return defaultClass();
    const hasExplicitSize = /(?:^|\s)(ds-btn-(?:compact|sm|xs|icon|icon-xs|icon-sm)|ds-segmented-btn|ds-subtab|ds-bn-tab|ds-nav-btn|ds-modal-close)(?:$|\s)/.test(props.className);
    return hasExplicitSize ? props.className : `${defaultClass()} ${props.className}`;
  };

  const iconSpan = () => (props.icon ? (
    <span class="ds-btn-icon-wrap" style="display:inline-flex; align-items:center; line-height:1;">
      {props.icon}
    </span>
  ) : null);

  const content = () => (props.text !== undefined && props.text !== "" ? (
    <span class={props.textClass ?? "ds-btn-text"}>{props.text}</span>
  ) : props.children !== undefined ? (
    <span class="ds-btn-text">{props.children}</span>
  ) : null);

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
      {props.reverse ? <>{content()}{iconSpan()}</> : <>{iconSpan()}{content()}</>}
    </button>
  );
}

/** Backward-compatible aliases */
export const DsButton = Button;
export const IconButton = Button;

export interface ConfirmDeleteButtonProps extends Omit<ButtonProps, "onClick"> {
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

export interface SelectOption {
  value: string;
  label: string;
}

export interface DsSelectProps {
  id?: string;
  className?: string;
  style?: string;
  value: string;
  disabled?: boolean;
  options?: SelectOption[];
  onChange?: (value: string) => void;
  children?: JSX.Element;
}

export function DsSelect(props: DsSelectProps) {
  return (
    <select
      id={props.id}
      class={`input-field ds-select ${props.className ?? ""}`.trim()}
      style={props.style}
      value={props.value}
      disabled={props.disabled}
      onChange={(ev) => props.onChange?.(ev.currentTarget.value)}
    >
      {props.options
        ? props.options.map((o) => <option value={o.value}>{o.label}</option>)
        : props.children}
    </select>
  );
}

/**
 * Unified [Icon][Text] inline pattern. Replaces scattered `<Icon /> {text}`
 * throughout group-box-titles, section headers, and inline labels.
 */
export function IconText(props: IconTextProps) {
  return (
    <span class={`ds-icon-text${props.class ? ` ${props.class}` : ""}`} style={props.style}>
      <span class="ds-icon-inline">{props.icon}</span>
      <span>{props.children}</span>
    </span>
  );
}

export interface SegmentedOption {
  value: string;
  id?: string;
  icon?: JSX.Element;
  text?: string | JSX.Element;
  title?: string;
}

export interface SegmentedSwitchProps {
  id?: string;
  style?: string;
  value: string;
  options: SegmentedOption[];
  onChange?: (value: string) => void;
}

export function SegmentedSwitch(props: SegmentedSwitchProps) {
  return (
    <div class="ds-segmented-switch" id={props.id} style={props.style}>
      <For each={props.options}>
        {(opt) => (
          <Button
            id={opt.id}
            className={`ds-segmented-btn${props.value === opt.value ? " active" : ""}`}
            icon={opt.icon}
            text={opt.text}
            title={opt.title}
            onClick={() => props.onChange?.(opt.value)}
          />
        )}
      </For>
    </div>
  );
}

export interface StatCardProps {
  value: string | number;
  label: string;
}

export function StatCard(props: StatCardProps) {
  return (
    <div class="ds-stat-card">
      <span class="ds-stat-val">{props.value}</span>
      <span class="ds-stat-lbl">{props.label}</span>
    </div>
  );
}

export interface ToggleButtonProps {
  id?: string;
  className?: string;
  style?: string;
  disabled?: boolean;
  value: boolean;
  icon: JSX.Element;
  activeIcon: JSX.Element;
  text: string;
  activeText: string;
  title?: string;
  activeTitle?: string;
  onToggle?: (next: boolean) => void;
}

export function ToggleButton(props: ToggleButtonProps) {
  return (
    <Button
      id={props.id}
      className={[props.className, props.value ? "primary" : undefined].filter(Boolean).join(" ")}
      cssText={props.style}
      title={props.value ? props.activeTitle ?? props.title : props.title}
      disabled={props.disabled}
      icon={props.value ? props.activeIcon : props.icon}
      text={props.value ? props.activeText : props.text}
      onClick={() => props.onToggle?.(!props.value)}
    />
  );
}

export interface DsSwitchProps {
  id?: string;
  className?: string;
  style?: string;
  disabled?: boolean;
  checked: boolean;
  onChange?: (next: boolean) => void;
  title?: string;
  label?: JSX.Element;
  name?: string;
}

/**
 * WinForms-styled mobile-friendly toggle switch with rectangular track & thumb.
 */
export function DsSwitch(props: DsSwitchProps) {
  const handleClick = (e: MouseEvent) => {
    e.preventDefault();
    if (props.disabled) return;
    props.onChange?.(!props.checked);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (props.disabled) return;
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      props.onChange?.(!props.checked);
    }
  };

  return (
    <button
      type="button"
      id={props.id}
      class={`ds-switch ${props.checked ? "checked" : ""} ${props.className ?? ""}`.trim()}
      style={props.style}
      role="switch"
      aria-checked={props.checked}
      aria-disabled={props.disabled}
      disabled={props.disabled}
      title={props.title}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      <span class="ds-switch-track">
        <span class="ds-switch-thumb" />
      </span>
      {props.label && <span class="ds-switch-label">{props.label}</span>}
    </button>
  );
}

export const ToggleSwitch = DsSwitch;