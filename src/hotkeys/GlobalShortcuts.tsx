/**
 * Global keyboard shortcuts listener for DynastyReader.
 * Registered once at the root Application level.
 */

import { makeEventListener } from "@solid-primitives/event-listener";
import { canGoBack, canGoForward, goBack, goForward, navigate, sessionTab, closeSessionMangaTab } from "../stores/router";
import { toggleTheme } from "../stores/theme";
import { consumeHotkeyEvent, isHotkeyEventConsumed, isTextInputTarget, matchesHotkey } from "./hotkeys-store";

export function openSettingsDialog(): void {
  window.dispatchEvent(new CustomEvent("ds-open-settings"));
}

export function GlobalShortcuts() {
  const onKeyDown = (ev: KeyboardEvent): void => {
    // Ignore if user is currently typing in an input or textarea
    if (isTextInputTarget(ev.target)) return;
    // Another listener (e.g. ReaderShortcuts) already handled this event.
    if (isHotkeyEventConsumed(ev)) return;

    if (matchesHotkey(ev, "global.goBack")) {
      if (canGoBack()) {
        consumeHotkeyEvent(ev);
        goBack();
      }
    } else if (matchesHotkey(ev, "global.goForward")) {
      if (canGoForward()) {
        consumeHotkeyEvent(ev);
        goForward();
      }
    } else if (matchesHotkey(ev, "global.toggleTheme")) {
      consumeHotkeyEvent(ev);
      toggleTheme();
    } else if (matchesHotkey(ev, "global.openSettings")) {
      consumeHotkeyEvent(ev);
      openSettingsDialog();
    } else if (matchesHotkey(ev, "global.navBrowse")) {
      consumeHotkeyEvent(ev);
      navigate({ view: "browse" });
    } else if (matchesHotkey(ev, "global.navLibrary")) {
      consumeHotkeyEvent(ev);
      navigate({ view: "library" });
    } else if (matchesHotkey(ev, "global.closeTab")) {
      if (sessionTab() !== null) {
        consumeHotkeyEvent(ev);
        closeSessionMangaTab();
      }
    }
  };

  makeEventListener(window, "keydown", onKeyDown);

  return null;
}
