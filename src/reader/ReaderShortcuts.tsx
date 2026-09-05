/**
 * Reader keyboard shortcuts: Navigation and view control bindings.
 * Unified with the centralized hotkeys store.
 */
import { makeEventListener } from "@solid-primitives/event-listener";
import type { ReaderSession } from "./reader-session";
import { isMobile } from "../stores/platform";
import { triggerHaptic } from "../utils/haptics";
import {
  consumeHotkeyEvent,
  isHotkeyEventConsumed,
  isTextInputTarget,
  matchesHotkey,
} from "../hotkeys/hotkeys-store";

/** Navigation actions must not auto-repeat at the OS key-repeat rate (RD-M6). */
function isNavigationHotkey(ev: KeyboardEvent): boolean {
  return (
    matchesHotkey(ev, "reader.nextPage") ||
    matchesHotkey(ev, "reader.prevPage") ||
    matchesHotkey(ev, "reader.firstPage") ||
    matchesHotkey(ev, "reader.lastPage") ||
    matchesHotkey(ev, "reader.nextChapter") ||
    matchesHotkey(ev, "reader.prevChapter") ||
    matchesHotkey(ev, "reader.jumpToPercent")
  );
}

export function ReaderShortcuts(props: { session: ReaderSession }) {
  const c = props.session;

  const onKeyDown = (ev: KeyboardEvent): void => {
    // Ignore if user is currently typing in an input or textarea
    if (isTextInputTarget(ev.target)) return;
    // Another listener (e.g. GlobalShortcuts) already handled this event.
    if (isHotkeyEventConsumed(ev)) return;
    // Holding a navigation key would flip pages at the OS repeat rate (RD-M6).
    if (ev.repeat && isNavigationHotkey(ev)) {
      ev.preventDefault();
      return;
    }
    // Space on a focused button/link activates that control on keyup — let it
    // handle the key instead of also turning the page (RD-M6).
    if (
      ev.key === " " &&
      (ev.target as HTMLElement | null)?.closest("button, a, [role='button']")
    ) {
      return;
    }

    if (matchesHotkey(ev, "reader.nextPage")) {
      consumeHotkeyEvent(ev);
      if (isMobile()) triggerHaptic("page-turn");
      if (c.isSpread()) {
        c.stepSpread(1);
      } else {
        c.setPage(c.currentIndex() + 1);
      }
    } else if (matchesHotkey(ev, "reader.prevPage")) {
      consumeHotkeyEvent(ev);
      if (isMobile()) triggerHaptic("page-turn");
      if (c.isSpread()) {
        c.stepSpread(-1);
      } else {
        c.setPage(c.currentIndex() - 1);
      }
    } else if (matchesHotkey(ev, "reader.firstPage")) {
      consumeHotkeyEvent(ev);
      c.setPage(0, true);
    } else if (matchesHotkey(ev, "reader.lastPage")) {
      consumeHotkeyEvent(ev);
      c.setPage(c.pages().length - 1, true);
    } else if (matchesHotkey(ev, "reader.nextChapter")) {
      consumeHotkeyEvent(ev);
      c.gotoNextChapter();
    } else if (matchesHotkey(ev, "reader.prevChapter")) {
      consumeHotkeyEvent(ev);
      c.gotoPrevChapter();
    } else if (matchesHotkey(ev, "reader.jumpToPage")) {
      consumeHotkeyEvent(ev);
      c.focusPageJump();
    } else if (matchesHotkey(ev, "reader.jumpToPercent")) {
      consumeHotkeyEvent(ev);
      const digit = parseInt(ev.key, 10);
      const total = c.pages().length;
      if (digit >= 1 && digit <= 9 && total > 0) {
        c.setPage(Math.round((digit / 10) * (total - 1)), true);
      }
    } else if (matchesHotkey(ev, "reader.toggleMode")) {
      consumeHotkeyEvent(ev);
      if (c.mode() === "scroll") {
        c.setPagedLayout("single");
        c.setMode("paged");
      } else if (c.pagedLayout() === "single") {
        c.setPagedLayout("spread");
      } else {
        c.setMode("scroll");
      }
    } else if (matchesHotkey(ev, "reader.toggleSpread")) {
      consumeHotkeyEvent(ev);
      if (c.mode() === "paged") {
        c.setPagedLayout(c.pagedLayout() === "spread" ? "single" : "spread");
      }
    } else if (matchesHotkey(ev, "reader.toggleDirection")) {
      consumeHotkeyEvent(ev);
      c.setDirection(c.direction() === "rtl" ? "ltr" : "rtl");
    } else if (matchesHotkey(ev, "reader.toggleCoverOffset")) {
      consumeHotkeyEvent(ev);
      if (c.mode() === "paged") c.toggleCoverOffset();
    } else if (matchesHotkey(ev, "reader.toggleScrollLock")) {
      consumeHotkeyEvent(ev);
      c.setScrollLock();
    } else if (matchesHotkey(ev, "reader.toggleFullscreen")) {
      consumeHotkeyEvent(ev);
      c.setFullscreen(!c.isFullscreen());
    } else if (matchesHotkey(ev, "reader.toggleToolbar")) {
      consumeHotkeyEvent(ev);
      c.toggleToolbarVisible();
    } else if (matchesHotkey(ev, "reader.zoomIn")) {
      if (c.fitMode() === "original") {
        consumeHotkeyEvent(ev);
        c.zoomIn();
      }
    } else if (matchesHotkey(ev, "reader.zoomOut")) {
      if (c.fitMode() === "original") {
        consumeHotkeyEvent(ev);
        c.zoomOut();
      }
    } else if (matchesHotkey(ev, "reader.resetZoom")) {
      if (c.fitMode() === "original") {
        consumeHotkeyEvent(ev);
        c.resetZoom();
      }
    } else if (ev.key === "Escape" && c.isFullscreen()) {
      consumeHotkeyEvent(ev);
      c.setFullscreen(false);
    }
  };

  makeEventListener(window, "keydown", onKeyDown);

  return null;
}
