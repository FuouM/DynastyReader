/**
 * Reader wheel page-flip gesture: Ctrl+Wheel zoom, in-slide vertical/horizontal
 * scrolling, boundary momentum (a second deliberate wheel flips the page), and
 * Scroll-Lock discrete page turning in continuous mode. Effect-only component
 * registering the window wheel listener.
 */

const MOMENTUM_INDICATOR_TIMEOUT_MS = 1200;
const MOMENTUM_PAGE_FLIP_COOLDOWN_MS = 280;
const WHEEL_DELTA_THRESHOLD = 10;
const PAGE_FLIP_COOLDOWN_MS = 220;
const WHEEL_IDLE_RESET_MS = 350;

import { onCleanup } from "solid-js";
import { makeEventListener } from "@solid-primitives/event-listener";
import type { ReaderSession } from "./reader-session";
import { spreadIndexOf } from "./reader-spread";

export function ReaderWheel(props: { session: ReaderSession }) {
  const c = props.session;
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
    indicator.appendChild(document.createTextNode(` Scroll again for ${type === "next" ? "Next" : "Prev"} Page`));
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
    if (ev.ctrlKey) {
      // Ctrl + Wheel: Zoom In / Out when in Original Size
      if (c.fitMode() === "original") {
        ev.preventDefault();
        if (ev.deltaY < 0) {
          c.zoomIn();
        } else if (ev.deltaY > 0) {
          c.zoomOut();
        }
        return;
      }
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
      ev.preventDefault();
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
    ev.preventDefault();
    lastWheelDirection = currentDirection;
    wheelCooldown = Date.now() + PAGE_FLIP_COOLDOWN_MS;
    const delta = Math.abs(ev.deltaY) >= Math.abs(ev.deltaX) ? ev.deltaY : ev.deltaX;

    if (delta > 0) {
      c.setPage(Math.min(c.pages().length - 1, c.currentIndex() + 1));
    } else {
      c.setPage(Math.max(0, c.currentIndex() - 1));
    }
  };

  makeEventListener(window, "wheel", onWheel, { passive: false });

  return null;
}
