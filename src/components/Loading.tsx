/**
 * Touhou-style loading component featuring a compact spinning Reimu Hakurei red Yin-Yang orb
 * inline with randomized praying maiden flavor text. Port of `loading.ts`.
 */

import { createEffect, createSignal, onCleanup, Show, type JSX } from "solid-js";

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

export interface DelayedLoadingProps {
  delayMs?: number;
  message?: string;
  loading?: boolean;
  fallback?: JSX.Element;
  children?: JSX.Element;
}

/**
 * Mounts a loading indicator only if an asynchronous task takes longer than
 * `delayMs` (default 140ms). This eliminates visual flicker when navigating
 * to cached tabs or clicking quickly. Port of `attachDelayedLoading`.
 */
export function DelayedLoading(props: DelayedLoadingProps) {
  const [showSpinner, setShowSpinner] = createSignal(false);
  const delayMs = props.delayMs ?? 140;

  createEffect(() => {
    const isLoading = props.loading ?? true;
    if (isLoading) {
      const timer = window.setTimeout(() => {
        setShowSpinner(true);
      }, delayMs);
      onCleanup(() => {
        window.clearTimeout(timer);
        setShowSpinner(false);
      });
    } else {
      setShowSpinner(false);
    }
  });

  return (
    <Show
      when={props.loading !== undefined ? props.loading : true}
      fallback={props.children}
    >
      <Show when={showSpinner()} fallback={props.fallback}>
        <Loading message={props.message} />
      </Show>
    </Show>
  );
}