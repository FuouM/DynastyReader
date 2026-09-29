/**
 * Reactive top-bar store for the dynasty-scans plugin (Solid port).
 *
 * Replaces the imperative DOM writes in `src/topbar.ts`. The `<Topbar/>`
 * component consumes these signals; views publish through the same API names
 * (`setTitle`, `showBanner`, `setActions`).
 */

import { createSignal, type JSX } from "solid-js";
import { debounce } from "@solid-primitives/scheduled";

export const [banner, setBanner] = createSignal<string | null>(null);
export const [bannerAction, setBannerAction] = createSignal<(() => void) | null>(null);

export const dismissBanner = debounce(() => {
  setBanner(null);
  setBannerAction(null);
}, 4000);

export type ActionsContent = JSX.Element | null;

export const [actions, setActions] = createSignal<ActionsContent>(null);
export const [title, setTitle] = createSignal<string>("Browse");

export interface ShowBannerOptions {
  onClick?: () => void;
}

/** Shows a transient error/info banner in the top navigation bar. */
export function showBanner(message: string, options?: ShowBannerOptions): void {
  dismissBanner.clear();
  setBanner(message);
  setBannerAction(() => (options?.onClick ?? null));
  dismissBanner();
}

