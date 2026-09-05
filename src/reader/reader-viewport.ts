/**
 * Reader viewport engine — extracted from `reader-session.ts` (P3-A).
 *
 * Pure DOM imperative operations: CSS custom-property updates, strip transform
 * animation, smooth/instant scroll-to-page, layout-class toggling.
 * No Solid reactivity, no network, no queue.  Every function takes the session
 * as its first argument and accesses DOM refs + reactive state through it.
 */

import type { ReaderSession } from "./reader-session";
import { isMobile } from "../stores";
import { spreadIndexOf } from "./reader-spread";
import { setStripAnimated, setStripInstant, stripTranslateX } from "./reader-transform";

// ---------------------------------------------------------------------------
// Timing constants (previously module-level in reader-session.ts)
// ---------------------------------------------------------------------------

/** Duration budget for the eased scroll animation in continuous-scroll mode. */
export const SCROLL_ANIMATION_DURATION_MS = 220;

/** How long to hold `isProgrammaticScroll = true` after a non-animated jump. */
export const PROGRAMMATIC_SCROLL_LOCK_MS = 350;

// ---------------------------------------------------------------------------
// CSS custom property helpers
// ---------------------------------------------------------------------------

export function updateViewportHeight(s: ReaderSession): void {
  const h = s.viewportEl?.clientHeight;
  if (h && h > 50 && s.containerEl) {
    s.containerEl.style.setProperty("--ds-viewport-full", `${h}px`);
    s.containerEl.style.setProperty("--ds-viewport-height", `${h}px`);
    updateSlotClearances(s);
  }
}

export function updateFirstSlotHeight(s: ReaderSession): void {
  if (!s.containerEl || s.isHorizontal()) return;
  const firstSlot = s.slotEls[0];
  if (firstSlot) {
    const h = firstSlot.offsetHeight;
    if (h > 0) {
      s.containerEl.style.setProperty("--ds-first-slot-height", `${h}px`);
    }
  }
}

export function updateLastSlotHeight(s: ReaderSession): void {
  if (!s.containerEl || s.isHorizontal()) return;
  const lastIdx = s.pages().length - 1;
  if (lastIdx < 0) return;
  const lastSlot = s.slotEls[lastIdx];
  if (lastSlot) {
    const h = lastSlot.offsetHeight;
    if (h > 0) {
      s.containerEl.style.setProperty("--ds-last-slot-height", `${h}px`);
    }
  }
}

export function updateSlotClearances(s: ReaderSession): void {
  updateFirstSlotHeight(s);
  updateLastSlotHeight(s);
}

// ---------------------------------------------------------------------------
// Strip transform / scroll navigation
// ---------------------------------------------------------------------------

export function slideTo(
  s: ReaderSession,
  index: number,
  instant = false,
  scrollToBottom = false,
): void {
  if (s.isHorizontal()) {
    const slideIndex = s.isSpread() ? spreadIndexOf(s.spreads(), index) : index;
    const targetSlide = s.isSpread() ? s.spreadSlotEls[slideIndex] : s.slotEls[index];
    if (targetSlide) {
      if (scrollToBottom) {
        targetSlide.scrollTop = Math.max(0, targetSlide.scrollHeight - targetSlide.clientHeight);
      } else {
        targetSlide.scrollTop = 0;
      }
      if (
        s.isSpread() &&
        s.direction() === "rtl" &&
        targetSlide.scrollWidth > targetSlide.clientWidth
      ) {
        targetSlide.scrollLeft = targetSlide.scrollWidth - targetSlide.clientWidth;
      } else {
        targetSlide.scrollLeft = 0;
      }
    }
    if (s.stripEl) {
      if (!s.scrollLock() || instant) {
        setStripInstant(s.stripEl, slideIndex, s.direction());
      } else {
        setStripAnimated(s.stripEl, slideIndex, s.direction(), isMobile);
      }
    }
  } else {
    s.isProgrammaticScroll = true;
    if (s.programmaticScrollTimer !== null) {
      clearTimeout(s.programmaticScrollTimer);
      s.programmaticScrollTimer = null;
    }
    if (s.scrollAnimRaf !== null) {
      cancelAnimationFrame(s.scrollAnimRaf);
      s.scrollAnimRaf = null;
    }

    const target = s.slotEls[index];
    if (target && s.viewportEl) {
      const vp = s.viewportEl;
      const vpRect = vp.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const startScrollTop = vp.scrollTop;
      const centerOffset = s.isLongStrip() ? 0 : Math.max(0, (vpRect.height - targetRect.height) / 2);
      const targetScrollTop = index === 0
        ? 0
        : Math.max(0, startScrollTop + (targetRect.top - vpRect.top) - centerOffset);

      if (instant || !s.scrollLock()) {
        vp.scrollTop = targetScrollTop;
        s.isProgrammaticScroll = false;
      } else {
        const distance = targetScrollTop - startScrollTop;
        if (Math.abs(distance) < 2) {
          vp.scrollTop = targetScrollTop;
          s.isProgrammaticScroll = false;
          return;
        }

        const startTime = performance.now();
        const fullSpan = Math.max(1, vpRect.height);
        const normalizedDist = Math.min(1, Math.abs(distance) / fullSpan);
        const duration = Math.max(
          90,
          Math.round(SCROLL_ANIMATION_DURATION_MS * Math.sqrt(normalizedDist)),
        );

        const easeInOutQuad = (t: number): number =>
          t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

        const step = (currentTime: number) => {
          const elapsed = currentTime - startTime;
          const progress = Math.min(1, elapsed / duration);
          vp.scrollTop = startScrollTop + distance * easeInOutQuad(progress);
          if (progress < 1) {
            s.scrollAnimRaf = requestAnimationFrame(step);
          } else {
            vp.scrollTop = targetScrollTop;
            s.scrollAnimRaf = null;
            s.isProgrammaticScroll = false;
          }
        };

        s.scrollAnimRaf = requestAnimationFrame(step);
      }
    } else {
      // Target slot is missing (strip mid-rebuild): never leave the
      // programmatic-scroll flag stuck on — it would permanently disable
      // computeCurrentPageFromScroll until the chapter is reopened.
      s.isProgrammaticScroll = false;
    }
  }
}

export function resetToCurrentPage(s: ReaderSession, smooth = false): void {
  updateViewportHeight(s);
  if (s.isHorizontal()) {
    const slideIndex = s.isSpread()
      ? spreadIndexOf(s.spreads(), s.currentIndex())
      : s.currentIndex();
    if (s.stripEl) {
      if (!smooth) {
        setStripInstant(s.stripEl, slideIndex, s.direction());
        requestAnimationFrame(() => {
          if (s.stripEl) s.stripEl.style.transition = "";
        });
      } else {
        s.stripEl.style.transform = stripTranslateX(slideIndex, s.direction());
      }
    }
  } else {
    s.isProgrammaticScroll = true;
    if (s.programmaticScrollTimer !== null) {
      clearTimeout(s.programmaticScrollTimer);
      s.programmaticScrollTimer = null;
    }
    s.programmaticScrollTimer = window.setTimeout(() => {
      s.isProgrammaticScroll = false;
      s.programmaticScrollTimer = null;
    }, PROGRAMMATIC_SCROLL_LOCK_MS);

    const target = s.slotEls[s.currentIndex()];
    if (target && s.viewportEl) {
      if (s.currentIndex() === 0) {
        s.viewportEl.scrollTop = 0;
      } else {
        const vpRect = s.viewportEl.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        const centerOffset = s.isLongStrip() ? 0 : Math.max(0, (vpRect.height - targetRect.height) / 2);
        const targetTop = Math.max(
          0,
          s.viewportEl.scrollTop + (targetRect.top - vpRect.top) - centerOffset,
        );
        if (!smooth) {
          s.viewportEl.scrollTop = targetTop;
        } else {
          s.viewportEl.scrollTo({ top: targetTop, behavior: "smooth" });
        }
      }
    } else if (s.viewportEl && s.currentIndex() === 0) {
      s.viewportEl.scrollTop = 0;
    }
  }
}

export function applyLayoutMode(s: ReaderSession): void {
  // Drop refs to slot elements torn down by the layout rebuild so detached
  // DOM is not pinned across layout toggles (RD-H1).
  if (s.slotEls.length > s.pages().length) s.slotEls.length = s.pages().length;
  const spreadCount = s.isSpread() ? s.spreads().length : 0;
  if (s.spreadSlotEls.length > spreadCount) s.spreadSlotEls.length = spreadCount;

  if (!s.viewportEl || !s.stripEl) return;
  if (s.isHorizontal()) {
    s.viewportEl.classList.add("horizontal");
    s.viewportEl.classList.toggle("rtl", s.direction() === "rtl");
    s.viewportEl.classList.toggle("ltr", s.direction() === "ltr");
    s.stripEl.classList.toggle("rtl", s.direction() === "rtl");
    s.stripEl.classList.toggle("ltr", s.direction() === "ltr");

    const slideIndex = s.isSpread()
      ? spreadIndexOf(s.spreads(), s.currentIndex())
      : s.currentIndex();
    setStripInstant(s.stripEl, slideIndex, s.direction(), false);
    requestAnimationFrame(() => {
      if (s.stripEl) s.stripEl.style.transition = "";
    });
  } else {
    s.viewportEl.classList.remove("horizontal", "rtl", "ltr");
    s.stripEl.classList.remove("rtl", "ltr");
    s.stripEl.style.transform = "";
    const target = s.slotEls[s.currentIndex()];
    if (target) {
      target.scrollIntoView({ behavior: "auto", block: "center" });
    } else if (s.viewportEl && s.currentIndex() === 0) {
      s.viewportEl.scrollTop = 0;
    }
  }
}
