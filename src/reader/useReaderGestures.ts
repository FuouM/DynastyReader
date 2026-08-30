/**
 * Touch, mouse drag, tap-to-turn, and overscroll gesture engine for the reader viewport.
 * Extracted from `ReaderViewport.tsx` for modularity and isolation.
 */

import { createSignal, onMount } from "solid-js";
import { createResizeObserver } from "@solid-primitives/resize-observer";
import type { ReaderSession } from "./reader-session";
import { isMobile } from "../stores";
import {
  isMobileGesturesOnDesktopEnabled,
  getDefaultReaderMode,
  getDefaultPagedLayout,
  getEffectiveDefaultReaderMode,
  getEffectiveDefaultPagedLayout,
  getDefaultFitMode,
  getEffectiveFitMode,
} from "./settings";
import { getAdjacentChapters } from "./reader-spread";
import { triggerHaptic } from "../utils/haptics";
import {
  SWIPE_MIN_DIST_TOUCH_PX,
  SWIPE_MIN_DIST_MOUSE_PX,
} from "./overscroll-math";
import { stripTranslateX } from "./reader-transform";
import type { OverscrollGestureState } from "./ReaderOverscrollOverlay";
import type { TapZoneGuideState } from "./ReaderTapZoneGuide";
import {
  LONG_PRESS_DELAY_MS,
  MOVEMENT_THRESHOLD_PX,
  TAP_TIME_THRESHOLD_MS,
  TRANSITION_DURATION_MS,
  type OverscrollActive,
  tryEngageOverscroll,
  applyOverscrollTransform,
  updateActiveOverscroll,
  resolveOverscrollRelease,
  resolveTapZone,
  resolveSwipe,
} from "./gesture-helpers";

export function useReaderGestures(s: ReaderSession) {
  const [tapZoneGuide, setTapZoneGuide] = createSignal<TapZoneGuideState | null>(null);
  const [overscrollGesture, setOverscrollGesture] = createSignal<OverscrollGestureState | null>(null);
  const [directionHintTick, setDirectionHintTick] = createSignal(0);
  const triggerDirectionHint = () => setDirectionHintTick((c) => c + 1);

  let overscrollRaf: number | null = null;
  const dispatchOverscroll = (state: OverscrollGestureState | null) => {
    if (state === null) {
      if (overscrollRaf !== null) {
        cancelAnimationFrame(overscrollRaf);
        overscrollRaf = null;
      }
      setOverscrollGesture(null);
      return;
    }
    if (overscrollRaf === null) {
      overscrollRaf = requestAnimationFrame(() => {
        setOverscrollGesture(state);
        overscrollRaf = null;
      });
    }
  };
  const getTapZone = (clientX: number): "left" | "center" | "right" => {
    const vpEl = s.viewportEl;
    if (!vpEl) return "center";
    const vpRect = vpEl.getBoundingClientRect();
    if (vpRect.width <= 0) return "center";
    const relX = (clientX - vpRect.left) / vpRect.width;
    if (relX < 0.22) return "left";
    if (relX > 0.78) return "right";
    return "center";
  };

  onMount(() => {
    const vpEl = s.viewportEl;
    if (!vpEl) return;

    // Compute exact available viewport height dynamically via reactive primitive
    let lastIsLandscape = isMobile() && typeof window !== "undefined" && window.innerWidth > window.innerHeight;
    let resizeRaf: number | null = null;
    createResizeObserver(
      () => vpEl,
      () => {
        if (resizeRaf !== null) cancelAnimationFrame(resizeRaf);
        resizeRaf = requestAnimationFrame(() => {
          resizeRaf = null;
          s.updateViewportHeight();
          if (isMobile() && typeof window !== "undefined") {
            const currentIsLandscape = window.innerWidth > window.innerHeight;
            if (currentIsLandscape !== lastIsLandscape) {
              lastIsLandscape = currentIsLandscape;
              if (!s.isLongStrip()) {
                const targetMode = currentIsLandscape
                  ? getEffectiveDefaultReaderMode(s.mode())
                  : getDefaultReaderMode();
                const targetLayout = currentIsLandscape
                  ? getEffectiveDefaultPagedLayout(s.pagedLayout())
                  : getDefaultPagedLayout();
                const targetFit = currentIsLandscape
                  ? getEffectiveFitMode(s.fitMode())
                  : getDefaultFitMode();
                let changed = false;
                if (targetMode !== s.mode()) {
                  s.setModeSignal(targetMode);
                  changed = true;
                }
                if (targetLayout !== s.pagedLayout()) {
                  s.setPagedLayoutSignal(targetLayout);
                  changed = true;
                }
                if (targetFit !== s.fitMode()) {
                  s.setFitModeSignal(targetFit);
                  changed = true;
                }
                if (changed) {
                  s.applyLayoutMode();
                  s.resetToCurrentPage(false);
                }
              }
            }
          }
        });
      },
    );
    s.onDispose(() => {
      if (resizeRaf !== null) cancelAnimationFrame(resizeRaf);
    });
    window.setTimeout(() => {
      s.updateViewportHeight();
      s.applyLayoutMode();
    }, 0);

    // Dynamic scroll-position tracking (continuous scroll mode) — O(log N) binary search
    const computeCurrentPageFromScroll = (): void => {
      if (s.isHorizontal() || s.isProgrammaticScroll) return;
      const vp = s.viewportEl;
      if (!vp) return;

      const totalSlots = s.slotEls.length;
      if (totalSlots === 0) return;

      const vpRect = vp.getBoundingClientRect();
      const targetY = vpRect.top + vpRect.height * 0.4;

      let low = 0;
      let high = totalSlots - 1;
      let bestIdx = 0;

      while (low <= high) {
        const mid = (low + high) >> 1;
        const el = s.slotEls[mid];
        if (!el) {
          low = mid + 1;
          continue;
        }
        const rect = el.getBoundingClientRect();

        if (targetY >= rect.top && targetY < rect.bottom) {
          bestIdx = mid;
          break;
        } else if (targetY < rect.top) {
          high = mid - 1;
          bestIdx = mid;
        } else {
          low = mid + 1;
          bestIdx = mid;
        }
      }

      if (bestIdx !== s.currentIndex()) {
        s.setPageFromScroll(bestIdx);
      }
    };

    const onViewportScroll = (): void => {
      if (s.isHorizontal() || s.isProgrammaticScroll) return;
      if (s.scrollRaf !== null) cancelAnimationFrame(s.scrollRaf);
      s.scrollRaf = requestAnimationFrame(() => {
        computeCurrentPageFromScroll();
        s.scrollRaf = null;
      });
    };
    vpEl.addEventListener("scroll", onViewportScroll, { passive: true });
    s.onDispose(() => {
      vpEl.removeEventListener("scroll", onViewportScroll);
      if (s.scrollRaf !== null) cancelAnimationFrame(s.scrollRaf);
    });

    // ── Helper: Restore Canvas Strip Transform (Never Jump to Void) ──
    let resetTransformTimer: number | null = null;
    const resetStripTransform = (smooth = true) => {
      if (!s.stripEl) return;
      if (resetTransformTimer !== null) {
        clearTimeout(resetTransformTimer);
        resetTransformTimer = null;
      }
      if (s.isHorizontal()) {
        const slideIndex = s.isSpread() ? s.slideIndex() : s.currentIndex();
        const dir = s.direction();
        if (smooth) {
          s.stripEl.style.transition = `transform ${TRANSITION_DURATION_MS}ms ease-out`;
          s.stripEl.style.transform = stripTranslateX(slideIndex, dir);
          resetTransformTimer = window.setTimeout(() => {
            if (s.stripEl) s.stripEl.style.transition = "";
            resetTransformTimer = null;
          }, TRANSITION_DURATION_MS);
        } else {
          s.stripEl.style.transition = "none";
          s.stripEl.style.transform = stripTranslateX(slideIndex, dir);
          requestAnimationFrame(() => {
            if (s.stripEl) s.stripEl.style.transition = "";
          });
        }
      } else {
        if (smooth) {
          s.stripEl.style.transition = `transform ${TRANSITION_DURATION_MS}ms ease-out`;
          s.stripEl.style.transform = "translateY(0px)";
          resetTransformTimer = window.setTimeout(() => {
            if (s.stripEl) s.stripEl.style.transition = "";
            resetTransformTimer = null;
          }, TRANSITION_DURATION_MS);
        } else {
          s.stripEl.style.transform = "";
        }
      }
    };

    // ── Touch Gesture Engine (Mobile Swipe, Drag-and-Hold Chapter Overscroll, Tap) ──
    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;
    let touchMoved = false;
    let hasVibrated = false;
    let activeOverscroll: OverscrollActive = null;

    let touchLongPressTimer: number | null = null;
    let didTouchLongPress = false;

    const onTouchStart = (ev: TouchEvent): void => {
      if (ev.touches.length !== 1) return;
      // If any modal/sheet is open, don't capture touch for reader gestures
      if (document.querySelector(".ds-modal-backdrop, .ds-reader-sheet-backdrop, .ds-overlay")) return;
      s.cancelScrollAnimation();
      const t = ev.touches[0];
      touchStartX = t.clientX;
      touchStartY = t.clientY;
      touchStartTime = Date.now();
      touchMoved = false;
      didTouchLongPress = false;
      hasVibrated = false;
      activeOverscroll = null;
      dispatchOverscroll(null);

      if (touchLongPressTimer !== null) clearTimeout(touchLongPressTimer);
      if (s.isHorizontal()) {
        touchLongPressTimer = window.setTimeout(() => {
          if (!touchMoved && s.isHorizontal()) {
            didTouchLongPress = true;
            triggerHaptic("tap");
            setTapZoneGuide({ activeZone: getTapZone(t.clientX) });
          }
        }, LONG_PRESS_DELAY_MS);
      }
    };

    const onTouchMove = (ev: TouchEvent): void => {
      if (ev.touches.length !== 1) return;
      const t = ev.touches[0];
      const dx = t.clientX - touchStartX;
      const dy = t.clientY - touchStartY;
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);

      if (Math.hypot(dx, dy) > MOVEMENT_THRESHOLD_PX) {
        touchMoved = true;
        if (touchLongPressTimer !== null) {
          clearTimeout(touchLongPressTimer);
          touchLongPressTimer = null;
        }
      }

      if (tapZoneGuide()) {
        setTapZoneGuide({ activeZone: getTapZone(t.clientX) });
        return;
      }
      // If overscroll gesture is already engaged, update finger tracking and check center collision
      if (activeOverscroll) {
        const updated = updateActiveOverscroll(activeOverscroll, t.clientX, t.clientY, hasVibrated);
        activeOverscroll = updated.state;
        if (updated.triggerHaptic) {
          triggerHaptic("snap");
          hasVibrated = true;
        } else if (!activeOverscroll.ready) {
          hasVibrated = false;
        }
        dispatchOverscroll({
          fingerX: t.clientX,
          fingerY: t.clientY,
          targetX: activeOverscroll.targetX,
          targetY: activeOverscroll.targetY,
          direction: activeOverscroll.direction,
          chapter: activeOverscroll.chapter,
          ready: activeOverscroll.ready,
        });
        return;
      }
      // Check for overscroll boundary engagement
      const { prevCh, nextCh } = getAdjacentChapters(s.chapterList(), s.permalink, s.chapterTitle());
      const result = tryEngageOverscroll({
        s, dx, dy, absX, absY,
        startX: touchStartX, startY: touchStartY,
        fingerX: t.clientX, fingerY: t.clientY,
        prevCh, nextCh,
      });
      if (result) {
        activeOverscroll = result.engaged;
        if (result.engaged.ready && !hasVibrated) {
          triggerHaptic("snap");
          hasVibrated = true;
        }
        dispatchOverscroll(result.overscrollState);
        applyOverscrollTransform(s, result);
        return;
      }
    };

    const onTouchEnd = (ev: TouchEvent): void => {
      if (touchLongPressTimer !== null) {
        clearTimeout(touchLongPressTimer);
        touchLongPressTimer = null;
      }

      if (tapZoneGuide()) {
        setTapZoneGuide(null);
        if (didTouchLongPress) {
          didTouchLongPress = false;
          return;
        }
      }

      if (ev.changedTouches.length !== 1) return;
      const t = ev.changedTouches[0];
      const totalDx = t.clientX - touchStartX;
      const totalDy = t.clientY - touchStartY;
      const dt = Date.now() - touchStartTime;
      const absX = Math.abs(totalDx);
      const absY = Math.abs(totalDy);
      if (activeOverscroll) {
        const over = activeOverscroll;
        activeOverscroll = null;
        dispatchOverscroll(null);
        resetStripTransform(true);
        if (over.ready && over.chapter) {
          triggerHaptic("confirm");
          resolveOverscrollRelease(s, over);
        }
        return;
      }
      // Always reset strip transform smoothly in case a drag slightly displaced it
      resetStripTransform(true);

      // 1. Horizontal Swipe gesture for in-chapter page flips
      if (touchMoved) {
        const handled = resolveSwipe(s, totalDx, totalDy, absX, absY, dt, SWIPE_MIN_DIST_TOUCH_PX, 60, 350, triggerDirectionHint);
        if (handled) return;
      }

      // 2. Tap gesture (without move)
      if (!touchMoved && dt < TAP_TIME_THRESHOLD_MS) {
        if (!s.isHorizontal()) {
          s.toggleToolbarVisible();
          return;
        }
        resolveTapZone(s, getTapZone(t.clientX));
      }
    };

    // ── Desktop Mouse Drag Engine (Panning when zoomed, Mouse swipe, Tap & Overscroll when enabled) ──
    let isMouseDown = false;
    let mouseStartX = 0;
    let mouseStartY = 0;
    let mouseStartTime = 0;
    let mouseMoved = false;
    let mouseLongPressTimer: number | null = null;
    let didMouseLongPress = false;
    let activeSlot: HTMLElement | null = null;
    let slotScrollLeft = 0;
    let slotScrollTop = 0;
    let vpScrollTop = 0;
    let vpScrollLeft = 0;
    let activeMouseOverscroll: OverscrollActive = null;

    const onMouseDown = (ev: MouseEvent): void => {
      if (ev.button !== 0) return;
      if ((ev.target as HTMLElement)?.closest("button, a, input, select, textarea")) return;
      s.cancelScrollAnimation();
      isMouseDown = true;
      mouseStartX = ev.clientX;
      mouseStartY = ev.clientY;
      mouseStartTime = Date.now();
      mouseMoved = false;
      didMouseLongPress = false;
      activeMouseOverscroll = null;
      dispatchOverscroll(null);

      if (mouseLongPressTimer !== null) clearTimeout(mouseLongPressTimer);
      if (isMobileGesturesOnDesktopEnabled() && s.isHorizontal()) {
        mouseLongPressTimer = window.setTimeout(() => {
          if (!mouseMoved && isMobileGesturesOnDesktopEnabled() && s.isHorizontal()) {
            didMouseLongPress = true;
            setTapZoneGuide({ activeZone: getTapZone(ev.clientX) });
          }
        }, LONG_PRESS_DELAY_MS);
      }

      if (s.isHorizontal()) {
        const curSlide = s.isSpread() ? s.slideIndex() : s.currentIndex();
        const target = s.isSpread() ? s.spreadSlotEls[curSlide] : s.slotEls[curSlide];
        if (target && (target.scrollWidth > target.clientWidth || target.scrollHeight > target.clientHeight)) {
          activeSlot = target;
          slotScrollLeft = target.scrollLeft;
          slotScrollTop = target.scrollTop;
          target.classList.add("ds-dragging");
          vpEl.classList.add("ds-dragging");
        }
      } else {
        vpScrollTop = vpEl.scrollTop;
        vpScrollLeft = vpEl.scrollLeft;
        if (isMobileGesturesOnDesktopEnabled()) {
          vpEl.classList.add("ds-dragging");
        }
      }
    };

    const onMouseMove = (ev: MouseEvent): void => {
      if (!isMouseDown) return;
      const dx = ev.clientX - mouseStartX;
      const dy = ev.clientY - mouseStartY;

      if (Math.hypot(dx, dy) > MOVEMENT_THRESHOLD_PX) {
        mouseMoved = true;
        if (mouseLongPressTimer !== null) {
          clearTimeout(mouseLongPressTimer);
          mouseLongPressTimer = null;
        }
      }
      if (tapZoneGuide()) {
        setTapZoneGuide({ activeZone: getTapZone(ev.clientX) });
        return;
      }

      if (activeSlot) {
        activeSlot.scrollLeft = slotScrollLeft - dx;
        activeSlot.scrollTop = slotScrollTop - dy;
        return;
      }
      // If mouse overscroll gesture is already engaged, update finger tracking and check center collision
      if (activeMouseOverscroll) {
        const updated = updateActiveOverscroll(activeMouseOverscroll, ev.clientX, ev.clientY, hasVibrated);
        activeMouseOverscroll = updated.state;
        if (updated.triggerHaptic) {
          triggerHaptic("snap");
          hasVibrated = true;
        } else if (!activeMouseOverscroll.ready) {
          hasVibrated = false;
        }
        dispatchOverscroll({
          fingerX: ev.clientX,
          fingerY: ev.clientY,
          targetX: activeMouseOverscroll.targetX,
          targetY: activeMouseOverscroll.targetY,
          direction: activeMouseOverscroll.direction,
          chapter: activeMouseOverscroll.chapter,
          ready: activeMouseOverscroll.ready,
        });
        return;
      }
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);
      const { prevCh, nextCh } = getAdjacentChapters(s.chapterList(), s.permalink, s.chapterTitle());
      if (s.isHorizontal() && isMobileGesturesOnDesktopEnabled()) {
        const result = tryEngageOverscroll({
          s, dx, dy, absX, absY,
          startX: mouseStartX, startY: mouseStartY,
          fingerX: ev.clientX, fingerY: ev.clientY,
          prevCh, nextCh,
        });
        if (result) {
          activeMouseOverscroll = result.engaged;
          dispatchOverscroll(result.overscrollState);
          applyOverscrollTransform(s, result);
          return;
        }
      } else if (!s.isHorizontal()) {
        // Vertical Continuous Scroll Mode
        const vp = s.viewportEl;
        if (vp && isMobileGesturesOnDesktopEnabled()) {
          const result = tryEngageOverscroll({
            s, dx, dy, absX, absY,
            startX: mouseStartX, startY: mouseStartY,
            fingerX: ev.clientX, fingerY: ev.clientY,
            prevCh, nextCh,
          });
          if (result) {
            activeMouseOverscroll = result.engaged;
            dispatchOverscroll(result.overscrollState);
            applyOverscrollTransform(s, result);
            return;
          }
          vp.scrollTop = vpScrollTop - dy;
          vp.scrollLeft = vpScrollLeft - dx;
        }
      }
    };

    const onMouseUp = (ev: MouseEvent): void => {
      if (!isMouseDown) return;
      isMouseDown = false;
      if (mouseLongPressTimer !== null) {
        clearTimeout(mouseLongPressTimer);
        mouseLongPressTimer = null;
      }

      if (tapZoneGuide()) {
        setTapZoneGuide(null);
        if (didMouseLongPress) {
          didMouseLongPress = false;
          return;
        }
      }

      if (activeSlot) {
        activeSlot.classList.remove("ds-dragging");
        activeSlot = null;
      }
      vpEl.classList.remove("ds-dragging");

      const totalDx = ev.clientX - mouseStartX;
      const totalDy = ev.clientY - mouseStartY;
      const dt = Date.now() - mouseStartTime;
      const absX = Math.abs(totalDx);
      const absY = Math.abs(totalDy);
      if (activeMouseOverscroll) {
        const over = activeMouseOverscroll;
        activeMouseOverscroll = null;
        dispatchOverscroll(null);
        resetStripTransform(true);
        resolveOverscrollRelease(s, over);
        return;
      }
      if (isMobileGesturesOnDesktopEnabled()) {
        resetStripTransform(true);
      }
      // Horizontal swipe for page flips in horizontal mode
      if (
        s.isHorizontal() &&
        mouseMoved
      ) {
        const handled = resolveSwipe(s, totalDx, totalDy, absX, absY, dt, SWIPE_MIN_DIST_MOUSE_PX, 65, 300, triggerDirectionHint);
        if (handled) return;
      }

      // Tap / Click gesture without drag when mobile gestures on desktop is enabled
      if (isMobileGesturesOnDesktopEnabled() && !mouseMoved && dt < TAP_TIME_THRESHOLD_MS) {
        if (!s.isHorizontal()) {
          s.toggleToolbarVisible();
          return;
        }
        resolveTapZone(s, getTapZone(ev.clientX));
      }
    };

    vpEl.addEventListener("touchstart", onTouchStart, { passive: true });
    vpEl.addEventListener("touchmove", onTouchMove, { passive: true });
    vpEl.addEventListener("touchend", onTouchEnd, { passive: true });
    vpEl.addEventListener("touchcancel", onTouchEnd, { passive: true });

    vpEl.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    s.onDispose(() => {
      if (resetTransformTimer !== null) {
        clearTimeout(resetTransformTimer);
        resetTransformTimer = null;
      }
      vpEl.removeEventListener("touchstart", onTouchStart);
      vpEl.removeEventListener("touchmove", onTouchMove);
      vpEl.removeEventListener("touchend", onTouchEnd);
      vpEl.removeEventListener("touchcancel", onTouchEnd);

      vpEl.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    });
  });

  return {
    tapZoneGuide,
    overscrollGesture,
    directionHintTick,
  };
}
