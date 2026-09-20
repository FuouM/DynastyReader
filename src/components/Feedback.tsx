/**
 * Shared state-feedback UI components: Loading spinner, Empty state, and Error retry row.
 */

import { Show, type JSX } from "solid-js";
import { Icon, type BootstrapIconName, RefreshIcon } from "./Icon";
import { IconButton } from "./Button";
import { t } from "../i18n";

// ── 1. Loading Spinner ──────────────────────────────────────────────────────────

export const PRAYING_MESSAGES = [
  "Girls are now praying",
  "The maidens are praying",
  "The girls are praying",
  "Girls do their best now and are preparing",
  "Please watch warmly until it is ready",
];

/** Returns a random praying maiden loading message. */
export function getRandomLoadingMessage(): string {
  const idx = Math.floor(Math.random() * PRAYING_MESSAGES.length);
  return PRAYING_MESSAGES[idx];
}

export interface LoadingProps {
  message?: string;
}

/** Centered loading element with a small inline spinning Reimu Yin-Yang orb. */
export function Loading(props: LoadingProps) {
  const message = props.message ?? getRandomLoadingMessage();
  return (
    <div class="ds-loading-screen">
      <svg class="ds-yinyang-spinner" viewBox="0 0 100 100" width="18" height="18" aria-hidden="true">
        <circle cx="50" cy="50" r="46" fill="#ffffff" stroke="#c62828" stroke-width="4" />
        <path d="M 50 4 A 46 46 0 0 1 50 96 A 23 23 0 0 1 50 50 A 23 23 0 0 0 50 4 Z" fill="#e53935" />
        <circle cx="50" cy="27" r="7.5" fill="#e53935" />
        <circle cx="50" cy="73" r="7.5" fill="#ffffff" />
      </svg>
      <span class="ds-loading-text">{message}…</span>
    </div>
  );
}

// ── 2. Empty State ─────────────────────────────────────────────────────────────

export interface EmptyStateProps {
  iconName?: BootstrapIconName;
  iconCssText?: string;
  cssText?: string;
  children?: JSX.Element;
}

export function EmptyState(props: EmptyStateProps) {
  return (
    <div class="ds-empty-state" style={props.cssText}>
      <Show when={props.iconName}>
        <Icon name={props.iconName!} style={props.iconCssText} />
      </Show>
      {props.children}
    </div>
  );
}

// ── 3. Error Retry Row ─────────────────────────────────────────────────────────

export interface ErrorRetryRowProps {
  message: string;
  onRetry: () => void;
  className?: string;
}

export function ErrorRetryRow(props: ErrorRetryRowProps) {
  return (
    <div class={`ds-error-row ${props.className ?? ""}`}>
      <span class="ds-muted">{props.message}</span>
      <IconButton
        icon={<RefreshIcon />}
        text={t("common.retry")}
        onClick={props.onRetry}
      />
    </div>
  );
}
