/**
 * Global keyboard shortcuts listener for DynastyReader.
 * Registered once at the root Application level.
 */

import { createEventListener } from "@solid-primitives/event-listener";
import {
  canGoBack,
  canGoForward,
  goBack,
  goForward,
  navigate,
  toggleTheme,
  sessionTab,
  closeSessionMangaTab,
} from "../stores";
import { isTextInputTarget, matchesHotkey } from "./hotkeys-store";

export function openSettingsDialog(): void {
  window.dispatchEvent(new CustomEvent("ds-open-settings"));
}

export function GlobalShortcuts() {
  const onKeyDown = (ev: KeyboardEvent): void => {
    // Ignore if user is currently typing in an input or textarea
    if (isTextInputTarget(ev.target)) return;

    if (matchesHotkey(ev, "global.goBack")) {
      if (canGoBack()) {
        ev.preventDefault();
        goBack();
      }
    } else if (matchesHotkey(ev, "global.goForward")) {
      if (canGoForward()) {
        ev.preventDefault();
        goForward();
      }
    } else if (matchesHotkey(ev, "global.toggleTheme")) {
      ev.preventDefault();
      toggleTheme();
    } else if (matchesHotkey(ev, "global.openSettings")) {
      ev.preventDefault();
      openSettingsDialog();
    } else if (matchesHotkey(ev, "global.navBrowse")) {
      ev.preventDefault();
      navigate({ view: "browse" });
    } else if (matchesHotkey(ev, "global.navLibrary")) {
      ev.preventDefault();
      navigate({ view: "library" });
    } else if (matchesHotkey(ev, "global.closeTab")) {
      if (sessionTab() !== null) {
        ev.preventDefault();
        closeSessionMangaTab();
      }
    }
  };

  createEventListener(window, "keydown", onKeyDown);

  return null;
}
