/**
 * Reactive top-bar store for the dynasty-scans plugin (Solid port).
 *
 * Replaces the imperative DOM writes in `src/topbar.ts`. The `<Topbar/>`
 * component consumes these signals; views publish through the same API names
 * (`setTitle`, `showBanner`, `setActions`).
 */

import { createSignal, type JSX } from "solid-js";
import { debounce } from "@solid-primitives/scheduled";

const [_banner, _setBanner] = createSignal<string | null>(null);
export { _banner as banner };

const dismissBanner = debounce(() => {
  _setBanner(null);
}, 4000);

export type ActionsContent = JSX.Element | null;

const [_actions, _setActions] = createSignal<ActionsContent>(null);
export const actions = _actions;

export const [title, setTitle] = createSignal<string>("Browse");

export function setActions(content: ActionsContent): void {
  _setActions(content);
}

/** Shows a transient error/info banner in the top navigation bar. */
export function showBanner(message: string): void {
  dismissBanner.clear();
  _setBanner(message);
  dismissBanner();
}
