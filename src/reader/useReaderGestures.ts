/**
 * Unified pointer gesture engine for the reader viewport.
 * Consolidates touch, mouse, and multi-touch pinch-to-zoom into a single
 * Pointer Events pipeline with pointer capture, eliminating ~320 lines of duplication.
 */

import { createSignal, onMount } from "solid-js";
import type { ReaderSession } from "./reader-session";
import { isMobileGesturesOnDesktopEnabled } from "./settings";
import { setupScrollTracker } from "./scroll-tracker";
import { setupViewportResize } from "./viewport-resize";
import { getAdjacentChapters } from "./reader-spread";
import { triggerHaptic } from "../utils/haptics";
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
  resolveSwipe,
  resolveTapZone,
} from "./gesture-helpers";

export function useReaderGestures(s: ReaderSession) {
  const [tapZoneGuide, setTapZoneGuide] = createSignal<TapZoneGuideState | null>(null);
  const [overscrollGesture, setOverscrollGesture] = createSignal<OverscrollGestureState | null>(null);
  const [directionHintTick, setDirectionHintTick] = createSignal(0);

  const triggerDirectionHint = () => setDirectionHintTick((c) => c + 1);

  let pendingOverscrollState: OverscrollGestureState | null = null;
  let overscrollRaf: number | null = null;
  const dispatchOverscroll = (state: OverscrollGestureState | null) => {
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

    // ── Helper: Restore Canvas Strip Transform ──
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

    let activeOverscroll: OverscrollActive = null;

    setupViewportResize(s, vpEl, () => {
      if (activeOverscroll) {
        activeOverscroll = null;
        dispatchOverscroll(null);
        resetStripTransform(false);
      }
    });

    setupScrollTracker(s, vpEl);

    // ── Pointer Tracker State ──
    const activePointers = new Map<number, { x: number; y: number }>();
    let pinchActive = false;
    let pinchStartDist = 0;
    let pinchStartScale = 1;

    let primaryPointerId: number | null = null;
    let isPrimaryDown = false;
    let pointerType = "touch";
    let startX = 0;
    let startY = 0;
    let startTime = 0;
    let moved = false;
    let hasVibrated = false;
    let longPressTimer: number | null = null;
    let didLongPress = false;
    let activeSlot: HTMLElement | null = null;
    let slotScrollLeft = 0;
    let slotScrollTop = 0;
    let vpScrollLeft = 0;
    let vpScrollTop = 0;

    const pinchDistance = (): number => {
      const pts = [...activePointers.values()];
      if (pts.length < 2) return 0;
      return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    };

    const onPointerDown = (ev: PointerEvent): void => {
      // Ignore interactive controls
      if ((ev.target as HTMLElement)?.closest("button, a, input, select, textarea, .ds-chapter-end-card")) return;
      // If modal or overlay open, don't capture gestures
      if (document.querySelector(".ds-modal-backdrop, .ds-reader-sheet-backdrop, .ds-overlay")) return;

      activePointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });

      // Multi-touch pinch-to-zoom (2 pointers)
      if (activePointers.size === 2 && ev.pointerType === "touch") {
        if (longPressTimer !== null) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
        }
        if (activeOverscroll) {
          activeOverscroll = null;
          dispatchOverscroll(null);
          resetStripTransform(false);
        }
        pinchActive = true;
        pinchStartDist = pinchDistance();
        pinchStartScale = s.effectiveZoomScale();
        vpEl.style.touchAction = "none";
        return;
      }

      if (activePointers.size > 1) return;

      // Primary single pointer drag / tap / swipe
      primaryPointerId = ev.pointerId;
      if (longPressTimer !== null) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
      pointerType = ev.pointerType;
      startX = ev.clientX;
      startY = ev.clientY;
      startTime = Date.now();
      moved = false;
      didLongPress = false;
      hasVibrated = false;
      activeOverscroll = null;
      activeSlot = null;
      dispatchOverscroll(null);
      s.cancelScrollAnimation();

      // Check slot panning (zoomed / spread slot)
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
        if (pointerType === "touch" || isMobileGesturesOnDesktopEnabled() || s.fitMode() === "original") {
          vpEl.classList.add("ds-dragging");
        }
      }

      // Long press guide timer
      if (longPressTimer !== null) clearTimeout(longPressTimer);
      const isMobileOrEnabled = pointerType === "touch" || isMobileGesturesOnDesktopEnabled();
      if (isMobileOrEnabled && s.isHorizontal()) {
        longPressTimer = window.setTimeout(() => {
          if (!moved && s.isHorizontal()) {
            didLongPress = true;
            if (pointerType === "touch") triggerHaptic("tap");
            setTapZoneGuide({ activeZone: getTapZone(ev.clientX) });
          }
        }, LONG_PRESS_DELAY_MS);
      }
    };

    const onPointerMove = (ev: PointerEvent): void => {
      if (activePointers.has(ev.pointerId)) {
        activePointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      }

      // Handle 2-finger pinch
      if (pinchActive && activePointers.size >= 2 && pinchStartDist > 0) {
        const d = pinchDistance();
        if (d > 0) {
          s.applyPinchZoom(pinchStartScale * (d / pinchStartDist));
        }
        return;
      }

      if (!isPrimaryDown || ev.pointerId !== primaryPointerId) return;

      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);

      if (Math.hypot(dx, dy) > MOVEMENT_THRESHOLD_PX) {
        moved = true;
        if (longPressTimer !== null) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
        }
      }

      if (tapZoneGuide()) {
        setTapZoneGuide({ activeZone: getTapZone(ev.clientX) });
        return;
      }

      // Slot panning
      if (activeSlot) {
        activeSlot.scrollLeft = slotScrollLeft - dx;
        activeSlot.scrollTop = slotScrollTop - dy;
        return;
      }

      const isMobileOrEnabled = pointerType === "touch" || isMobileGesturesOnDesktopEnabled();

      // Active overscroll update
      if (activeOverscroll) {
        const updated = updateActiveOverscroll(s, activeOverscroll, ev.clientX, ev.clientY, hasVibrated);
        activeOverscroll = updated.state;
        if (updated.triggerHaptic) {
          triggerHaptic("snap");
          hasVibrated = true;
        } else if (!activeOverscroll.ready) {
          hasVibrated = false;
        }
        applyOverscrollTransform(s, {
          engaged: activeOverscroll,
          overscrollState: {
            fingerX: ev.clientX,
            fingerY: ev.clientY,
            targetX: activeOverscroll.targetX,
            targetY: activeOverscroll.targetY,
            direction: activeOverscroll.direction,
            chapter: activeOverscroll.chapter,
            ready: activeOverscroll.ready,
          },
          dampedPullPx: updated.dampedPullPx,
        });
        dispatchOverscroll({
          fingerX: ev.clientX,
          fingerY: ev.clientY,
          targetX: activeOverscroll.targetX,
          targetY: activeOverscroll.targetY,
          direction: activeOverscroll.direction,
          chapter: activeOverscroll.chapter,
          ready: activeOverscroll.ready,
        });
        return;
      }

      // Check overscroll boundary engagement
      const { prevCh, nextCh } = getAdjacentChapters(s.chapterList(), s.permalink, s.chapterTitle());
      if (s.isHorizontal()) {
        if (isMobileOrEnabled) {
          const result = tryEngageOverscroll({
            s, dx, dy, absX, absY,
            startX, startY,
            fingerX: ev.clientX, fingerY: ev.clientY,
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
          }
        }
      } else {
        // Vertical continuous scroll mode
        if (isMobileOrEnabled) {
          const result = tryEngageOverscroll({
            s, dx, dy, absX, absY,
            startX, startY,
            fingerX: ev.clientX, fingerY: ev.clientY,
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
        }
        // Pan continuous scroll container when mouse-dragging or original fit
        if (pointerType === "mouse" && (isMobileGesturesOnDesktopEnabled() || s.fitMode() === "original")) {
          vpEl.scrollTop = vpScrollTop - dy;
          vpEl.scrollLeft = vpScrollLeft - dx;
        }
      }
    };

    const onPointerUp = (ev: PointerEvent): void => {
      if (longPressTimer !== null) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }

      // End pinch if fewer than 2 pointers remain
      if (pinchActive && activePointers.size < 2) {
        pinchActive = false;
        vpEl.style.touchAction = "";
        activePointers.clear();
        return;
      }

      if (ev.pointerId !== primaryPointerId) return;
      isPrimaryDown = false;
      primaryPointerId = null;

      if (longPressTimer !== null) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }

      if (activeSlot) {
        activeSlot.classList.remove("ds-dragging");
        activeSlot = null;
      }
      vpEl.classList.remove("ds-dragging");

      if (tapZoneGuide()) {
        setTapZoneGuide(null);
        if (didLongPress) return;
      }

      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      const dt = Date.now() - startTime;
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);
      const isMobileOrEnabled = pointerType === "touch" || isMobileGesturesOnDesktopEnabled();

      // Release overscroll
      if (activeOverscroll) {
        const overscrollState = activeOverscroll;
        activeOverscroll = null;
        dispatchOverscroll(null);
        resolveOverscrollRelease(s, overscrollState);
        resetStripTransform(true);
        return;
      }

      // Tap detection
      if (!moved && dt < TAP_TIME_THRESHOLD_MS) {
        const zone = getTapZone(ev.clientX);
        if (zone === "center" || isMobileOrEnabled) {
          resolveTapZone(s, zone);
        }
        return;
      }
      // Swipe detection in horizontal paged mode
      if (s.isHorizontal() && isMobileOrEnabled && moved) {
        const isTouch = pointerType === "touch";
        const minDist = isTouch ? SWIPE_MIN_DIST_TOUCH_PX : SWIPE_MIN_DIST_MOUSE_PX;
        const fastThreshold = isTouch ? 60 : 65;
        const fastTime = isTouch ? 350 : 300;
        const handled = resolveSwipe(s, dx, dy, absX, absY, dt, minDist, fastThreshold, fastTime, triggerDirectionHint);
        if (handled) return;
      }

      resetStripTransform(true);
    };

    const onPointerCancel = (ev: PointerEvent): void => {
      activePointers.delete(ev.pointerId);
      if (pinchActive && activePointers.size < 2) {
        pinchActive = false;
        vpEl.style.touchAction = "";
        activePointers.clear();
      }
      if (ev.pointerId === primaryPointerId) {
        isPrimaryDown = false;
        primaryPointerId = null;
        if (longPressTimer !== null) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
        }
        if (activeSlot) {
          activeSlot.classList.remove("ds-dragging");
          activeSlot = null;
        }
        vpEl.classList.remove("ds-dragging");
        if (tapZoneGuide()) setTapZoneGuide(null);
        if (activeOverscroll) {
          activeOverscroll = null;
          dispatchOverscroll(null);
        }
        resetStripTransform(true);
      }
    };

    vpEl.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);

    s.onDispose(() => {
      if (resetTransformTimer !== null) {
        clearTimeout(resetTransformTimer);
        resetTransformTimer = null;
      }
      if (longPressTimer !== null) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
      s.toolbarAnimEndHook = null;
      vpEl.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
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
