/**
 * Reactive top-bar store for the dynasty-scans plugin (Solid port).
 *
 * Replaces the imperative DOM writes in `src/topbar.ts`. The `<Topbar/>`
 * component consumes these signals; views publish through the same API names
 * (`setTitle`, `showBanner`, `setActions`).
 */

import { createSignal, type JSX } from "solid-js";

const [_banner, _setBanner] = createSignal<string | null>(null);
export { _banner as banner };

let bannerTimer: ReturnType<typeof setTimeout> | null = null;

export type ActionsContent = JSX.Element | (() => JSX.Element) | null;

const [_actions, _setActions] = createSignal<ActionsContent>(null);
export const actions = _actions;

export const [title, setTitle] = createSignal<string>("Browse");

export function setActions(content: ActionsContent): void {
  _setActions(content);
}

/** Sets the banner message with auto-dismiss matching legacy behavior. */
export function setBanner(message: string | null): void {
  if (bannerTimer !== null) {
    clearTimeout(bannerTimer);
    bannerTimer = null;
  }
  if (!message) {
    _setBanner(null);
    return;
  }
  _setBanner(message);
  bannerTimer = setTimeout(() => {
    _setBanner(null);
    bannerTimer = null;
  }, 4000);
}

/** Shows a transient error/info banner in the top navigation bar (alias for setBanner). */
export function showBanner(message: string): void {
  setBanner(message);
}

/** Hides the transient banner immediately. */
export function clearBanner(): void {
  setBanner(null);
}

/** Empties the top-bar action host. */
export function clearActions(): void {
  setActions(null);
}