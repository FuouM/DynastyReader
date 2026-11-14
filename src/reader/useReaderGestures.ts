/**
 * Touch, mouse drag, tap-to-turn, and overscroll gesture engine for the reader viewport.
 * Extracted from `ReaderViewport.tsx` for modularity and isolation.
 */

import { createSignal, onMount } from "solid-js";
import type { ReaderSession } from "./reader-session";
import { isMobileGesturesOnDesktopEnabled } from "./settings";
import { setupScrollTracker } from "./scroll-tracker";
import { setupViewportResize } from "./viewport-resize";
import { triggerHaptic } from "../utils/haptics";
import { isBlockingOverlayOpen } from "../hotkeys/hotkeys-store";
import { stripTranslateX } from "./reader-transform";
import type { OverscrollGestureState, TapZoneGuideState } from "./ReaderOverlays";
import {
  SWIPE_MIN_DIST_TOUCH_PX,
  SWIPE_MIN_DIST_MOUSE_PX,
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

  let pendingOverscrollState: OverscrollGestureState | null = null;
  let overscrollRaf: number | null = null;
  const dispatchOverscroll = (state: OverscrollGestureState | null) => {
    if (state === null) {
      pendingOverscrollState = null;
      if (overscrollRaf !== null) {
        cancelAnimationFrame(overscrollRaf);
        overscrollRaf = null;
      }
      setOverscrollGesture(null);
      return;
    }
    pendingOverscrollState = state;
    if (overscrollRaf === null) {
      overscrollRaf = requestAnimationFrame(() => {
        setOverscrollGesture(pendingOverscrollState);
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

    setupViewportResize(s, vpEl, () => {
      cancelTouchOverscroll(false);
      cancelMouseOverscroll(false);
    });

    setupScrollTracker(s, vpEl);
    // ── Helper: Restore Canvas Strip Transform (Never Jump to Void) ──
    let resetTransformTimer: number | null = null;
    const resetStripTransform = (smooth = true) => {
      const strip = s.stripEl;
      if (!strip) return;
      if (resetTransformTimer !== null) {
        clearTimeout(resetTransformTimer);
        resetTransformTimer = null;
      }
      const horizontal = s.isHorizontal();
      const slideIndex = s.isSpread() ? s.slideIndex() : s.currentIndex();
      if (smooth) {
        strip.style.willChange = "transform";
        strip.style.transition = `transform ${TRANSITION_DURATION_MS}ms ease-out`;
        strip.style.transform = horizontal ? stripTranslateX(slideIndex, s.direction()) : "translate3d(0, 0px, 0)";
        resetTransformTimer = window.setTimeout(() => {
          if (s.stripEl) {
            s.stripEl.style.transition = "";
            s.stripEl.style.willChange = "auto";
          }
          resetTransformTimer = null;
        }, TRANSITION_DURATION_MS);
      } else if (horizontal) {
        strip.style.transition = "none";
        strip.style.transform = stripTranslateX(slideIndex, s.direction());
        strip.style.willChange = "auto";
        requestAnimationFrame(() => {
          if (s.stripEl) s.stripEl.style.transition = "";
        });
      } else {
        strip.style.transform = "";
        strip.style.willChange = "auto";
      }
    };

    /** The current horizontal slide when its content overflows (zoomed or wide pages). */
    const pannableSlide = (): HTMLElement | null => {
      const curSlide = s.isSpread() ? s.slideIndex() : s.currentIndex();
      const target = s.isSpread() ? s.spreadSlotEls[curSlide] : s.slotEls[curSlide];
      return target && (target.scrollWidth > target.clientWidth || target.scrollHeight > target.clientHeight)
        ? target
        : null;
    };

    /** A press during an animated/programmatic or very recent scroll only stops that scroll. */
    const isScrollInMotion = (): boolean =>
      s.scrollAnimRaf !== null || s.isProgrammaticScroll || Date.now() - lastScrollTime < 150;

    let lastScrollTime = 0;
    let isTouchDown = false;
    let wasTouchStoppingScroll = false;
    let wasMouseStoppingScroll = false;

    const onScroll = (): void => {
      lastScrollTime = Date.now();
      if (isTouchDown) {
        wasTouchStoppingScroll = true;
      }
      if (isMouseDown) {
        wasMouseStoppingScroll = true;
      }
    };
    vpEl.addEventListener("scroll", onScroll, { passive: true });

    // ── Touch Gesture Engine (Mobile Swipe, Drag-and-Hold Chapter Overscroll, Tap) ──
    let lastTouchEndTime = 0;
    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;
    let touchMoved = false;
    let hasVibrated = false;
    let activeOverscroll: OverscrollActive = null;
    let touchLongPressTimer: number | null = null;
    let didTouchLongPress = false;
    let activeTouchSlot: HTMLElement | null = null;
    let touchSlotScrollLeft = 0;
    let touchSlotScrollTop = 0;
    let isTouchOnEndCard = false;

    const clearTouchLongPress = (): void => {
      if (touchLongPressTimer !== null) {
        clearTimeout(touchLongPressTimer);
        touchLongPressTimer = null;
      }
    };

    /** Drops an engaged touch overscroll and restores the strip. */
    const cancelTouchOverscroll = (smooth: boolean): void => {
      if (!activeOverscroll) return;
      activeOverscroll = null;
      dispatchOverscroll(null);
      resetStripTransform(smooth);
    };

    /** Follows the pointer with an engaged overscroll; returns its updated state. */
    const trackOverscroll = (
      engaged: NonNullable<OverscrollActive>,
      x: number,
      y: number,
    ): NonNullable<OverscrollActive> => {
      const updated = updateActiveOverscroll(s, engaged, x, y, hasVibrated);
      const next = updated.state;
      if (updated.triggerHaptic) {
        triggerHaptic("snap");
        hasVibrated = true;
      } else if (!next.ready) {
        hasVibrated = false;
      }
      const overscrollState: OverscrollGestureState = {
        fingerX: x,
        fingerY: y,
        targetX: next.targetX,
        targetY: next.targetY,
        direction: next.direction,
        chapter: next.chapter,
        ready: next.ready,
      };
      applyOverscrollTransform(s, { engaged: next, overscrollState, dampedPullPx: updated.dampedPullPx });
      dispatchOverscroll(overscrollState);
      return next;
    };

    const onTouchStart = (ev: TouchEvent): void => {
      if (ev.touches.length !== 1) return;
      if ((ev.target as HTMLElement)?.closest("button, a, input, select, textarea, .ds-chapter-end-card")) {
        isTouchOnEndCard = !!(ev.target as HTMLElement)?.closest(".ds-chapter-end-card");
        return;
      }
      isTouchOnEndCard = false;
      if (isBlockingOverlayOpen()) return;
      isTouchDown = true;
      wasTouchStoppingScroll = isScrollInMotion();
      s.cancelScrollAnimation();
      const t = ev.touches[0];
      if (!t) return;
      touchStartX = t.clientX;
      touchStartY = t.clientY;
      touchStartTime = Date.now();
      touchMoved = false;
      didTouchLongPress = false;
      hasVibrated = false;
      if (activeOverscroll) cancelTouchOverscroll(false);
      else dispatchOverscroll(null);
      activeTouchSlot = null;

      clearTouchLongPress();
      if (s.isHorizontal()) {
        const target = pannableSlide();
        if (target) {
          activeTouchSlot = target;
          touchSlotScrollLeft = target.scrollLeft;
          touchSlotScrollTop = target.scrollTop;
        }

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
      if (isTouchOnEndCard || (ev.target as HTMLElement)?.closest(".ds-chapter-end-card")) return;
      if (ev.touches.length !== 1) {
        cancelTouchOverscroll(true);
        return;
      }
      const t = ev.touches[0];
      if (!t) return;
      const dx = t.clientX - touchStartX;
      const dy = t.clientY - touchStartY;
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);

      if (Math.hypot(dx, dy) > MOVEMENT_THRESHOLD_PX) {
        touchMoved = true;
        clearTouchLongPress();
      }

      // Prevent native horizontal overscroll rubberband flash at chapter boundaries (M-10)
      if (activeOverscroll || (s.isHorizontal() && touchMoved && absX > absY)) {
        if (ev.cancelable) ev.preventDefault();
      }

      if (tapZoneGuide()) {
        setTapZoneGuide({ activeZone: getTapZone(t.clientX) });
        return;
      }

      if (activeTouchSlot) {
        activeTouchSlot.scrollLeft = touchSlotScrollLeft - dx;
        activeTouchSlot.scrollTop = touchSlotScrollTop - dy;
        return;
      }
      // If overscroll gesture is already engaged, update finger tracking and check center collision
      if (activeOverscroll) {
        activeOverscroll = trackOverscroll(activeOverscroll, t.clientX, t.clientY);
        return;
      }
      // Check for overscroll boundary engagement
      const { prevCh, nextCh } = s.adjacentChapters();
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

    const onTouchCancel = (): void => {
      isTouchDown = false;
      wasTouchStoppingScroll = false;
      lastTouchEndTime = Date.now();
      clearTouchLongPress();
      if (tapZoneGuide()) {
        setTapZoneGuide(null);
      }
      didTouchLongPress = false;
      if (activeOverscroll) {
        activeOverscroll = null;
        dispatchOverscroll(null);
      }
      resetStripTransform(false);
      activeTouchSlot = null;
      touchMoved = false;
      hasVibrated = false;
    };

    const onTouchEnd = (ev: TouchEvent): void => {
      isTouchDown = false;
      if (isTouchOnEndCard) {
        isTouchOnEndCard = false;
        return;
      }
      lastTouchEndTime = Date.now();
      clearTouchLongPress();

      if (tapZoneGuide()) {
        setTapZoneGuide(null);
        if (didTouchLongPress) {
          didTouchLongPress = false;
          return;
        }
      }

      const wasStoppingScroll = wasTouchStoppingScroll;
      wasTouchStoppingScroll = false;
      if (ev.changedTouches.length !== 1) {
        cancelTouchOverscroll(true);
        return;
      }
      const t = ev.changedTouches[0];
      if (!t) return;
      const totalDx = t.clientX - touchStartX;
      const totalDy = t.clientY - touchStartY;
      const dt = Date.now() - touchStartTime;
      const absX = Math.abs(totalDx);
      const absY = Math.abs(totalDy);

      let wasTouchSlotPanned = false;
      if (activeTouchSlot) {
        activeTouchSlot = null;
        if (touchMoved) {
          wasTouchSlotPanned = true;
        }
      }

      if (activeOverscroll) {
        const over = activeOverscroll;
        activeOverscroll = null;
        dispatchOverscroll(null);
        resetStripTransform(true);
        if (over.ready && over.chapter) triggerHaptic("confirm");
        resolveOverscrollRelease(s, over);
        return;
      }
      // Always reset strip transform smoothly in case a drag slightly displaced it
      resetStripTransform(true);

      // 1. Horizontal Swipe gesture for in-chapter page flips (horizontal mode only)
      if (s.isHorizontal() && touchMoved && !wasTouchSlotPanned) {
        const handled = resolveSwipe(s, totalDx, absX, absY, dt, SWIPE_MIN_DIST_TOUCH_PX, 60, 350, triggerDirectionHint);
        if (handled) return;
      }
      // 2. Tap gesture (without move)
      if (!touchMoved && !wasStoppingScroll && dt < TAP_TIME_THRESHOLD_MS) {
        if (!s.isHorizontal()) {
          s.toggleToolbarVisible();
          return;
        }
        resolveTapZone(s, getTapZone(t.clientX));
      }
    };

    // ── Two-Finger Pinch-to-Zoom (pointer events; QoL-R1) ──
    // touch-action stays `pan-y` (vertical) / `none` (horizontal) so the
    // browser never pinch-zooms the page itself; while two pointers are
    // active we force `touch-action: none` inline to suspend native panning.
    const activePointers = new Map<number, { x: number; y: number }>();
    let pinchActive = false;
    let pinchStartDist = 0;
    let pinchStartScale = 1;

    const pinchDistance = (): number => {
      const pts = [...activePointers.values()];
      const p0 = pts[0];
      const p1 = pts[1];
      if (!p0 || !p1) return 0;
      return Math.hypot(p0.x - p1.x, p0.y - p1.y);
    };
    const onPinchPointerDown = (ev: PointerEvent): void => {
      if (ev.pointerType !== "touch") return;
      if (s.fitMode() !== "original") return;
      activePointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (activePointers.size === 2) {
        cancelTouchOverscroll(true);
        pinchActive = true;
        pinchStartDist = pinchDistance();
        pinchStartScale = s.zoomScale();
        vpEl.style.touchAction = "none";
        s.cancelScrollAnimation();
      }
    };

    const onPinchPointerMove = (ev: PointerEvent): void => {
      if (ev.pointerType !== "touch" || !activePointers.has(ev.pointerId)) return;
      if (s.fitMode() !== "original") return;
      activePointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (pinchActive && activePointers.size >= 2 && pinchStartDist > 0) {
        const d = pinchDistance();
        if (d > 0) {
          s.applyPinchZoom(pinchStartScale * (d / pinchStartDist));
        }
      }
    };

    const onPinchPointerUp = (ev: PointerEvent): void => {
      if (!activePointers.delete(ev.pointerId)) return;
      if (pinchActive && activePointers.size < 2) {
        pinchActive = false;
        vpEl.style.touchAction = "";
        const remaining = [...activePointers.values()][0];
        if (remaining) {
          touchStartX = remaining.x;
          touchStartY = remaining.y;
          touchStartTime = Date.now();
          touchMoved = true;
          clearTouchLongPress();
        }
      } else if (activePointers.size === 0) {
        vpEl.style.touchAction = "";
      }
    };

    const onPinchPointerCancel = (ev: PointerEvent): void => {
      activePointers.delete(ev.pointerId);
      if (pinchActive && activePointers.size < 2) {
        pinchActive = false;
        vpEl.style.touchAction = "";
        activePointers.clear();
      } else if (activePointers.size === 0) {
        vpEl.style.touchAction = "";
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

    let isMouseOnEndCard = false;

    const clearMouseLongPress = (): void => {
      if (mouseLongPressTimer !== null) {
        clearTimeout(mouseLongPressTimer);
        mouseLongPressTimer = null;
      }
    };

    /** Drops an engaged mouse overscroll and restores the strip. */
    const cancelMouseOverscroll = (smooth: boolean): void => {
      if (!activeMouseOverscroll) return;
      activeMouseOverscroll = null;
      dispatchOverscroll(null);
      resetStripTransform(smooth);
    };

    const onMouseDown = (ev: MouseEvent): void => {
      if (ev.button !== 0) return;
      if (
        Date.now() - lastTouchEndTime < 650 ||
        (ev as MouseEvent & { sourceCapabilities?: { firesTouchEvents?: boolean } }).sourceCapabilities?.firesTouchEvents
      ) {
        return;
      }
      if ((ev.target as HTMLElement)?.closest("button, a, input, select, textarea, .ds-chapter-end-card")) {
        isMouseOnEndCard = !!(ev.target as HTMLElement)?.closest(".ds-chapter-end-card");
        return;
      }
      isMouseOnEndCard = false;
      wasMouseStoppingScroll = isScrollInMotion();
      s.cancelScrollAnimation();
      isMouseDown = true;
      mouseStartX = ev.clientX;
      mouseStartY = ev.clientY;
      mouseStartTime = Date.now();
      mouseMoved = false;
      didMouseLongPress = false;
      if (activeMouseOverscroll) cancelMouseOverscroll(false);
      else dispatchOverscroll(null);

      clearMouseLongPress();
      if (isMobileGesturesOnDesktopEnabled() && s.isHorizontal()) {
        mouseLongPressTimer = window.setTimeout(() => {
          if (!mouseMoved && isMobileGesturesOnDesktopEnabled() && s.isHorizontal()) {
            didMouseLongPress = true;
            setTapZoneGuide({ activeZone: getTapZone(ev.clientX) });
          }
        }, LONG_PRESS_DELAY_MS);
      }

      if (s.isHorizontal()) {
        const target = pannableSlide();
        if (target) {
          activeSlot = target;
          slotScrollLeft = target.scrollLeft;
          slotScrollTop = target.scrollTop;
          target.classList.add("ds-dragging");
          vpEl.classList.add("ds-dragging");
        }
      } else {
        vpScrollTop = vpEl.scrollTop;
        vpScrollLeft = vpEl.scrollLeft;
        if (isMobileGesturesOnDesktopEnabled() || s.fitMode() === "original") {
          vpEl.classList.add("ds-dragging");
        }
      }
    };

    /** Tries to engage a mouse overscroll at a chapter boundary; returns whether it engaged. */
    const engageMouseOverscroll = (dx: number, dy: number, ev: MouseEvent): boolean => {
      const { prevCh, nextCh } = s.adjacentChapters();
      const result = tryEngageOverscroll({
        s, dx, dy, absX: Math.abs(dx), absY: Math.abs(dy),
        startX: mouseStartX, startY: mouseStartY,
        fingerX: ev.clientX, fingerY: ev.clientY,
        prevCh, nextCh,
      });
      if (!result) return false;
      activeMouseOverscroll = result.engaged;
      dispatchOverscroll(result.overscrollState);
      applyOverscrollTransform(s, result);
      return true;
    };

    const onMouseMove = (ev: MouseEvent): void => {
      if (!isMouseDown) return;
      if (isMouseOnEndCard || (ev.target as HTMLElement)?.closest(".ds-chapter-end-card")) return;
      const dx = ev.clientX - mouseStartX;
      const dy = ev.clientY - mouseStartY;

      if (Math.hypot(dx, dy) > MOVEMENT_THRESHOLD_PX) {
        mouseMoved = true;
        clearMouseLongPress();
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
        activeMouseOverscroll = trackOverscroll(activeMouseOverscroll, ev.clientX, ev.clientY);
        return;
      }
      if (s.isHorizontal()) {
        if (isMobileGesturesOnDesktopEnabled()) engageMouseOverscroll(dx, dy, ev);
        return;
      }
      // Vertical Continuous Scroll Mode
      const vp = s.viewportEl;
      if (!vp) return;
      if (isMobileGesturesOnDesktopEnabled() && engageMouseOverscroll(dx, dy, ev)) return;
      if (isMobileGesturesOnDesktopEnabled() || s.fitMode() === "original") {
        vp.scrollTop = vpScrollTop - dy;
        vp.scrollLeft = vpScrollLeft - dx;
      }
    };

    const onMouseUp = (ev: MouseEvent): void => {
      isMouseOnEndCard = false;
      if (!isMouseDown) return;
      isMouseDown = false;
      clearMouseLongPress();

      if (tapZoneGuide()) {
        setTapZoneGuide(null);
        if (didMouseLongPress) {
          didMouseLongPress = false;
          return;
        }
      }

      const wasStoppingScroll = wasMouseStoppingScroll;
      wasMouseStoppingScroll = false;

      let wasSlotPanned = false;
      if (activeSlot) {
        activeSlot.classList.remove("ds-dragging");
        activeSlot = null;
        if (mouseMoved) {
          wasSlotPanned = true;
        }
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
        if (over.ready && over.chapter) triggerHaptic("confirm");
        resolveOverscrollRelease(s, over);
        return;
      }
      if (isMobileGesturesOnDesktopEnabled()) {
        resetStripTransform(true);
      }
      // Horizontal swipe for page flips in horizontal mode
      if (
        s.isHorizontal() &&
        mouseMoved &&
        !wasSlotPanned
      ) {
        const handled = resolveSwipe(s, totalDx, absX, absY, dt, SWIPE_MIN_DIST_MOUSE_PX, 65, 300, triggerDirectionHint);
        if (handled) return;
      }

      // Tap / Click gesture without drag
      if (!mouseMoved && !wasStoppingScroll && dt < TAP_TIME_THRESHOLD_MS) {
        if (!s.isHorizontal()) {
          s.toggleToolbarVisible();
          return;
        }
        const zone = getTapZone(ev.clientX);
        if (zone === "center" || isMobileGesturesOnDesktopEnabled()) {
          resolveTapZone(s, zone);
        }
      }
    };

    vpEl.addEventListener("touchstart", onTouchStart, { passive: true });
    vpEl.addEventListener("touchmove", onTouchMove, { passive: false });
    vpEl.addEventListener("touchend", onTouchEnd, { passive: true });
    vpEl.addEventListener("touchcancel", onTouchCancel, { passive: true });

    vpEl.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    const onBlur = (): void => {
      isMouseDown = false;
      isTouchDown = false;
      wasTouchStoppingScroll = false;
      wasMouseStoppingScroll = false;
      clearTouchLongPress();
      clearMouseLongPress();
      if (tapZoneGuide()) {
        setTapZoneGuide(null);
      }
      cancelTouchOverscroll(true);
      cancelMouseOverscroll(true);
      if (activeSlot) {
        activeSlot.classList.remove("ds-dragging");
        activeSlot = null;
      }
      vpEl.classList.remove("ds-dragging");
    };

    window.addEventListener("blur", onBlur);
    vpEl.addEventListener("pointerdown", onPinchPointerDown, { passive: true });
    vpEl.addEventListener("pointermove", onPinchPointerMove, { passive: true });
    vpEl.addEventListener("pointerup", onPinchPointerUp, { passive: true });
    vpEl.addEventListener("pointercancel", onPinchPointerCancel, { passive: true });

    s.onDispose(() => {
      if (resetTransformTimer !== null) {
        clearTimeout(resetTransformTimer);
        resetTransformTimer = null;
      }
      // Pending long-press timers must not fire into the disposed session (RD-M8).
      clearTouchLongPress();
      clearMouseLongPress();
      s.toolbarAnimEndHook = null;
      vpEl.removeEventListener("touchstart", onTouchStart);
      vpEl.removeEventListener("scroll", onScroll);
      vpEl.removeEventListener("touchmove", onTouchMove);
      vpEl.removeEventListener("touchend", onTouchEnd);
      vpEl.removeEventListener("touchcancel", onTouchCancel);

      vpEl.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("blur", onBlur);
      vpEl.removeEventListener("pointerdown", onPinchPointerDown);
      vpEl.removeEventListener("pointermove", onPinchPointerMove);
      vpEl.removeEventListener("pointerup", onPinchPointerUp);
      vpEl.removeEventListener("pointercancel", onPinchPointerCancel);
      activePointers.clear();
      if (pinchActive) {
        pinchActive = false;
        vpEl.style.touchAction = "";
      }
    });
  });

  return {
    tapZoneGuide,
    overscrollGesture,
    directionHintTick,
  };
}
