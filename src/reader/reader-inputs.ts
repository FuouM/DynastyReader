/**
 * Composable input event handlers for the reader: Keyboard shortcuts and Wheel interactions.
 * Converted from null-returning headless components to idiomatic SolidJS composables.
 */

/**
 * Reader keyboard shortcuts: Navigation and view control bindings.
 * Unified with the centralized hotkeys store.
 */
import { onCleanup } from "solid-js";
import { makeEventListener } from "@solid-primitives/event-listener";
import type { ReaderSession } from "./reader-session";
import { spreadIndexOf } from "./reader-spread";
import { t } from "../i18n";
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

export function useReaderShortcuts(session: ReaderSession): void {
  const c = session;

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

  }


const MOMENTUM_INDICATOR_TIMEOUT_MS = 1200;
const MOMENTUM_PAGE_FLIP_COOLDOWN_MS = 220;
const WHEEL_DELTA_THRESHOLD = 10;
const PAGE_FLIP_COOLDOWN_MS = 220;
const WHEEL_IDLE_RESET_MS = 350;


export function useReaderWheel(session: ReaderSession): void {
  const c = session;
  let wheelCooldown = 0;
  let lastWheelDirection: 1 | -1 | null = null;
  let lastWheelTime = 0;
  let momentumDir: "next" | "prev" | null = null;
  let momentumTimer: number | null = null;
  let indicator: HTMLElement | null = null;

  const showIndicator = (type: "next" | "prev"): void => {
    if (!indicator) {
      indicator = document.createElement("div");
      indicator.className = "ds-snap-indicator";
      if (c.viewportEl) c.viewportEl.appendChild(indicator);
    }
    indicator.className = `ds-snap-indicator ${type === "next" ? "bottom" : "top"} visible`;
    indicator.textContent = "";
    const icon = document.createElement("i");
    icon.className = `bi bi-chevron-double-${type === "next" ? "down" : "up"}`;
    indicator.appendChild(icon);
    const msg = " " + (type === "next" ? t("reader.wheel.scrollAgainForNext") : t("reader.wheel.scrollAgainForPrev"));
    indicator.appendChild(document.createTextNode(msg));
  };

  const hideIndicator = (): void => {
    if (indicator) {
      indicator.classList.remove("visible");
    }
    momentumDir = null;
  };

  onCleanup(() => {
    if (momentumTimer !== null) {
      clearTimeout(momentumTimer);
      momentumTimer = null;
    }
    if (indicator) {
      indicator.remove();
      indicator = null;
    }
  });

  const onWheel = (ev: WheelEvent): void => {
    // If in standard vertical scroll mode without Ctrl zoom or scroll lock, bypass immediately
    if (!c.isHorizontal() && !c.scrollLock() && !ev.ctrlKey) return;

    // Ignore if event target is an input / textarea / select
    const targetTag = (ev.target as HTMLElement)?.tagName;
    if (targetTag === "INPUT" || targetTag === "TEXTAREA" || targetTag === "SELECT") return;
    // Never hijack wheel events inside the controls sheet or a modal — those
    // have their own scroll regions (RD-H7).
    if ((ev.target as HTMLElement | null)?.closest(".ds-reader-sheet-window, .ds-modal-backdrop")) return;

    // When Scroll Lock is active, in horizontal mode, or during Ctrl+Zoom:
    // We completely own the wheel. Prevent browser native scroll IMMEDIATELY
    // so sub-threshold ticks or cooldown intervals never leak a native scroll jerk.
    ev.preventDefault();

    if (ev.ctrlKey) {
      // Ctrl + Wheel (trackpad pinch): smooth zoom in any fit mode.
      c.zoomByFactor(Math.pow(1.0015, -ev.deltaY));
      return;
    }

    const now = Date.now();
    const primaryDelta = Math.abs(ev.deltaY) >= Math.abs(ev.deltaX) ? ev.deltaY : ev.deltaX;
    if (
      Math.abs(primaryDelta) < WHEEL_DELTA_THRESHOLD &&
      Math.abs(ev.deltaY) < WHEEL_DELTA_THRESHOLD &&
      Math.abs(ev.deltaX) < WHEEL_DELTA_THRESHOLD
    ) {
      return;
    }

    if (now - lastWheelTime > WHEEL_IDLE_RESET_MS) {
      lastWheelDirection = null;
    }
    lastWheelTime = now;

    const currentDirection: 1 | -1 = primaryDelta > 0 ? 1 : -1;
    const isDirectionReversal = lastWheelDirection !== null && currentDirection !== lastWheelDirection;

    // Throttle repeated flips in the SAME direction to prevent skipping multiple pages on one trackpad flick.
    // When the user deliberately reverses scroll direction, waive cooldown for immediate responsive turnaround.
    if (!isDirectionReversal && now < wheelCooldown) {
      return;
    }

    if (isDirectionReversal) {
      hideIndicator();
      if (momentumTimer !== null) {
        clearTimeout(momentumTimer);
        momentumTimer = null;
      }
    }

    if (c.isHorizontal()) {
      const slideIndex = c.isSpread() ? spreadIndexOf(c.spreads(), c.currentIndex()) : c.currentIndex();
      const slide = c.isSpread() ? c.spreadSlotEls[slideIndex] : c.slotEls[c.currentIndex()];

      const hasVScroll = !!(slide && slide.scrollHeight > slide.clientHeight + 4);
      const hasHScroll = !!(slide && slide.scrollWidth > slide.clientWidth + 4);

      // Shift + Wheel or horizontal trackpad / tilt wheel
      if (hasHScroll && (ev.shiftKey || Math.abs(ev.deltaX) > Math.abs(ev.deltaY))) {
        ev.preventDefault();
        const delta = ev.shiftKey && ev.deltaX === 0 ? ev.deltaY : ev.deltaX;
        const maxScrollLeft = slide.scrollWidth - slide.clientWidth;
        slide.scrollLeft = Math.max(0, Math.min(maxScrollLeft, slide.scrollLeft + delta));
        return;
      }

      if (hasVScroll) {
        const maxScrollTop = slide.scrollHeight - slide.clientHeight;
        const atTop = slide.scrollTop <= 2 && ev.deltaY < 0;
        const atBottom = slide.scrollTop >= maxScrollTop - 2 && ev.deltaY > 0;

        if (!atTop && !atBottom) {
          // Scroll inside slide programmatically so browser never blocks wheel stream
          ev.preventDefault();
          slide.scrollTop = Math.max(0, Math.min(maxScrollTop, slide.scrollTop + ev.deltaY));
          hideIndicator();
          if (momentumTimer !== null) {
            clearTimeout(momentumTimer);
            momentumTimer = null;
          }
          lastWheelDirection = currentDirection;
          return;
        }

        ev.preventDefault();
        const targetDir: "next" | "prev" = atBottom ? "next" : "prev";

        // If at the first page (no previous) or last page (no next), do not show indicator
        const atFirst = c.isSpread()
          ? spreadIndexOf(c.spreads(), c.currentIndex()) <= 0
          : c.currentIndex() <= 0;
        const atLast = c.isSpread()
          ? spreadIndexOf(c.spreads(), c.currentIndex()) >= c.spreads().length - 1
          : c.currentIndex() >= c.pages().length - 1;
        if ((targetDir === "prev" && atFirst) || (targetDir === "next" && atLast)) {
          hideIndicator();
          return;
        }

        // If at the boundary and not primed in this direction yet
        if (momentumDir !== targetDir) {
          momentumDir = targetDir;
          showIndicator(targetDir);
          clearTimeout(momentumTimer!);
          momentumTimer = window.setTimeout(hideIndicator, MOMENTUM_INDICATOR_TIMEOUT_MS);
          lastWheelDirection = currentDirection;
          return;
        }

        // Second deliberate scroll in the same direction: flip page
        hideIndicator();
        clearTimeout(momentumTimer!);
        momentumTimer = null;
        momentumDir = null;
        lastWheelDirection = currentDirection;
        wheelCooldown = Date.now() + MOMENTUM_PAGE_FLIP_COOLDOWN_MS;
        if (c.isSpread()) {
          c.stepSpread(targetDir === "next" ? 1 : -1);
        } else if (targetDir === "next") {
          c.setPage(c.currentIndex() + 1, false, false);
        } else {
          c.setPage(c.currentIndex() - 1, false, true);
        }
        return;
      }

      // Horizontal overflow scrolling (e.g. wide zoomed spread)
      if (slide && slide.scrollWidth > slide.clientWidth + 4 && Math.abs(ev.deltaX) > Math.abs(ev.deltaY)) {
        ev.preventDefault();
        slide.scrollLeft = Math.max(0, Math.min(slide.scrollWidth - slide.clientWidth, slide.scrollLeft + ev.deltaX));
        return;
      }

      // Standard paged mode without vertical overflow: flip page directly
      hideIndicator();
      ev.preventDefault();
      lastWheelDirection = currentDirection;
      wheelCooldown = Date.now() + PAGE_FLIP_COOLDOWN_MS;
      const delta = Math.abs(ev.deltaY) >= Math.abs(ev.deltaX) ? ev.deltaY : ev.deltaX;
      if (c.isSpread()) {
        c.stepSpread(delta > 0 ? 1 : -1);
      } else if (delta > 0) {
        c.setPage(c.currentIndex() + 1);
      } else {
        c.setPage(c.currentIndex() - 1);
      }
      return;
    }

    hideIndicator();

    // In Continuous Scroll mode, wheel scrolling turns pages when Scroll Lock is active
    if (!c.scrollLock()) return;

    lastWheelDirection = currentDirection;
    wheelCooldown = Date.now() + PAGE_FLIP_COOLDOWN_MS;
    const delta = Math.abs(ev.deltaY) >= Math.abs(ev.deltaX) ? ev.deltaY : ev.deltaX;

    if (delta > 0) {
      c.setPage(Math.min(c.pages().length - 1, c.currentIndex() + 1));
    } else {
      c.setPage(Math.max(0, c.currentIndex() - 1));
    }
  };

  // Register on window only. Registering on both window and viewportEl causes
  // every wheel event to fire onWheel twice (viewport fires, then it bubbles to
  // window), doubling scroll speed and jitter.
  makeEventListener(window, "wheel", onWheel, { passive: false });
  }

