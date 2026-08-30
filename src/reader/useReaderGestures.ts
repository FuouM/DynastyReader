/**
 * Touch, mouse drag, tap-to-turn, and overscroll gesture engine for the reader viewport.
 * Extracted from `ReaderViewport.tsx` for modularity and isolation.
 */

import { createSignal, onMount } from "solid-js";
import { createResizeObserver } from "@solid-primitives/resize-observer";
import type { ReaderSession } from "./reader-session";
import type { ChapterRef } from "../types/routes";
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
  OVERSCROLL_ENGAGE_THRESHOLD_PX,
  OVERSCROLL_MAX_PULL_PX,
  SWIPE_MIN_DIST_TOUCH_PX,
  SWIPE_MIN_DIST_MOUSE_PX,
  getOverscrollTarget,
  isOverscrollReady,
} from "./overscroll-math";
import { stripTranslateX, stripTranslateXWithPull } from "./reader-transform";
import type { OverscrollGestureState } from "./ReaderOverscrollOverlay";
import type { TapZoneGuideState } from "./ReaderTapZoneGuide";

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

      const targetY = vp.scrollTop + vp.clientHeight * 0.4;

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
        const top = el.offsetTop;
        const bottom = top + el.offsetHeight;

        if (targetY >= top && targetY < bottom) {
          bestIdx = mid;
          break;
        } else if (targetY < top) {
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
          s.stripEl.style.transition = "transform 0.2s ease-out";
          s.stripEl.style.transform = stripTranslateX(slideIndex, dir);
          resetTransformTimer = window.setTimeout(() => {
            if (s.stripEl) s.stripEl.style.transition = "";
            resetTransformTimer = null;
          }, 200);
        } else {
          s.stripEl.style.transition = "none";
          s.stripEl.style.transform = stripTranslateX(slideIndex, dir);
          requestAnimationFrame(() => {
            if (s.stripEl) s.stripEl.style.transition = "";
          });
        }
      } else {
        if (smooth) {
          s.stripEl.style.transition = "transform 0.2s ease-out";
          s.stripEl.style.transform = "translateY(0px)";
          resetTransformTimer = window.setTimeout(() => {
            if (s.stripEl) s.stripEl.style.transition = "";
            resetTransformTimer = null;
          }, 200);
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
    let activeOverscroll: {
      direction: "prev" | "next";
      chapter: ChapterRef | null;
      targetX: number;
      targetY: number;
      ready: boolean;
      dist: number;
    } | null = null;

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
        }, 350);
      }
    };

    const onTouchMove = (ev: TouchEvent): void => {
      if (ev.touches.length !== 1) return;
      const t = ev.touches[0];
      const dx = t.clientX - touchStartX;
      const dy = t.clientY - touchStartY;
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);

      if (Math.hypot(dx, dy) > 8) {
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
        const ready = isOverscrollReady(t.clientX, t.clientY, activeOverscroll.targetX, activeOverscroll.targetY);
        activeOverscroll.ready = ready;
        if (ready && !hasVibrated) {
          triggerHaptic("snap");
          hasVibrated = true;
        } else if (!ready) {
          hasVibrated = false;
        }
        dispatchOverscroll({
          fingerX: t.clientX,
          fingerY: t.clientY,
          targetX: activeOverscroll.targetX,
          targetY: activeOverscroll.targetY,
          direction: activeOverscroll.direction,
          chapter: activeOverscroll.chapter,
          ready,
        });
        return;
      }
      // Check for overscroll boundary engagement
      const { prevCh, nextCh } = getAdjacentChapters(s.chapterList(), s.permalink, s.chapterTitle());
      if (s.isHorizontal()) {
        const isRtl = s.direction() === "rtl";
        const cur = s.isSpread() ? s.slideIndex() : s.currentIndex();
        const total = s.isSpread() ? s.spreads().length : s.pages().length;

        const isPullingPrev =
          cur === 0 &&
          (isRtl ? dx < -OVERSCROLL_ENGAGE_THRESHOLD_PX : dx > OVERSCROLL_ENGAGE_THRESHOLD_PX) &&
          absX > absY * 1.1;

        const isPullingNext =
          cur >= total - 1 &&
          (isRtl ? dx > OVERSCROLL_ENGAGE_THRESHOLD_PX : dx < -OVERSCROLL_ENGAGE_THRESHOLD_PX) &&
          absX > absY * 1.1;

        if (isPullingPrev) {
          const { targetX, targetY } = getOverscrollTarget(touchStartX, touchStartY, "prev", true, isRtl);
          const ready = isOverscrollReady(t.clientX, t.clientY, targetX, targetY);
          if (ready && !hasVibrated) {
            triggerHaptic("snap");
            hasVibrated = true;
          }
          activeOverscroll = { direction: "prev", chapter: prevCh, targetX, targetY, ready, dist: absX };
          dispatchOverscroll({
            fingerX: t.clientX,
            fingerY: t.clientY,
            targetX,
            targetY,
            direction: "prev",
            chapter: prevCh,
            ready,
          });
          if (s.stripEl) {
            const pullSign = isRtl ? -1 : 1;
            const damped = pullSign * Math.min(OVERSCROLL_MAX_PULL_PX, Math.pow(absX, 0.72));
            s.stripEl.style.transform = stripTranslateXWithPull(cur, s.direction(), damped);
          }
          return;
        }

        if (isPullingNext) {
          const { targetX, targetY } = getOverscrollTarget(touchStartX, touchStartY, "next", true, isRtl);
          const ready = isOverscrollReady(t.clientX, t.clientY, targetX, targetY);
          if (ready && !hasVibrated) {
            triggerHaptic("snap");
            hasVibrated = true;
          }
          activeOverscroll = { direction: "next", chapter: nextCh, targetX, targetY, ready, dist: absX };
          dispatchOverscroll({
            fingerX: t.clientX,
            fingerY: t.clientY,
            targetX,
            targetY,
            direction: "next",
            chapter: nextCh,
            ready,
          });
          if (s.stripEl) {
            const pullSign = isRtl ? 1 : -1;
            const damped = pullSign * Math.min(OVERSCROLL_MAX_PULL_PX, Math.pow(absX, 0.72));
            s.stripEl.style.transform = stripTranslateXWithPull(cur, s.direction(), damped);
          }
          return;
        }
      } else {
        // Vertical Continuous Scroll Mode
        const vp = s.viewportEl;
        if (vp) {
          const isAtTop = vp.scrollTop <= 5;
          const isAtBottom = vp.scrollTop + vp.clientHeight >= vp.scrollHeight - 5;

          if (isAtTop && dy > OVERSCROLL_ENGAGE_THRESHOLD_PX && absY > absX * 1.1) {
            const { targetX, targetY } = getOverscrollTarget(touchStartX, touchStartY, "prev", false);
            const ready = isOverscrollReady(t.clientX, t.clientY, targetX, targetY);
            if (ready && !hasVibrated) {
              triggerHaptic("snap");
              hasVibrated = true;
            }
            activeOverscroll = { direction: "prev", chapter: prevCh, targetX, targetY, ready, dist: dy };
            dispatchOverscroll({
              fingerX: t.clientX,
              fingerY: t.clientY,
              targetX,
              targetY,
              direction: "prev",
              chapter: prevCh,
              ready,
            });
            if (s.stripEl) {
              const damped = Math.min(OVERSCROLL_MAX_PULL_PX, Math.pow(dy, 0.72));
              s.stripEl.style.transform = `translateY(${damped}px)`;
            }
            return;
          }

          if (isAtBottom && dy < -OVERSCROLL_ENGAGE_THRESHOLD_PX && absY > absX * 1.1) {
            const { targetX, targetY } = getOverscrollTarget(touchStartX, touchStartY, "next", false);
            const ready = isOverscrollReady(t.clientX, t.clientY, targetX, targetY);
            if (ready && !hasVibrated) {
              triggerHaptic("snap");
              hasVibrated = true;
            }
            activeOverscroll = { direction: "next", chapter: nextCh, targetX, targetY, ready, dist: -dy };
            dispatchOverscroll({
              fingerX: t.clientX,
              fingerY: t.clientY,
              targetX,
              targetY,
              direction: "next",
              chapter: nextCh,
              ready,
            });
            if (s.stripEl) {
              const damped = -Math.min(OVERSCROLL_MAX_PULL_PX, Math.pow(-dy, 0.72));
              s.stripEl.style.transform = `translateY(${damped}px)`;
            }
            return;
          }
        }
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
          if (over.direction === "prev") {
            s.gotoPrevChapter();
          } else {
            s.gotoNextChapter();
          }
        }
        return;
      }
      // Always reset strip transform smoothly in case a drag slightly displaced it
      resetStripTransform(true);

      // 1. Horizontal Swipe gesture for in-chapter page flips
      if (
        touchMoved &&
        absX > SWIPE_MIN_DIST_TOUCH_PX &&
        absX > absY * 1.25 &&
        (absX > 60 || (absX > SWIPE_MIN_DIST_TOUCH_PX && dt < 350))
      ) {
        const isRtl = s.direction() === "rtl";
        const step = isRtl ? (totalDx > 0 ? 1 : -1) : (totalDx < 0 ? 1 : -1);
        const cur = s.currentIndex();
        const total = s.pages().length;
        const targetPage = cur + step;
        if (targetPage >= 0 && targetPage < total) {
          if (s.isHorizontal() && s.isSpread()) {
            s.stepSpread(step as 1 | -1);
          } else {
            s.setPage(targetPage, false);
          }
        } else if (cur === 0 && step === -1) {
          triggerDirectionHint();
        }
        return;
      }

      // 2. Tap gesture (without move)
      if (!touchMoved && dt < 450) {
        if (!s.isHorizontal()) {
          s.toggleToolbarVisible();
          return;
        }

        const zone = getTapZone(t.clientX);
        const isRtl = s.direction() === "rtl";
        if (zone === "left") {
          const step = isRtl ? 1 : -1;
          const targetPage = s.currentIndex() + step;
          if (targetPage >= 0 && targetPage < s.pages().length) {
            if (s.isSpread()) s.stepSpread(step as 1 | -1);
            else s.setPage(targetPage);
          }
        } else if (zone === "right") {
          const step = isRtl ? -1 : 1;
          const targetPage = s.currentIndex() + step;
          if (targetPage >= 0 && targetPage < s.pages().length) {
            if (s.isSpread()) s.stepSpread(step as 1 | -1);
            else s.setPage(targetPage);
          }
        } else {
          s.toggleToolbarVisible();
        }
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
    let activeMouseOverscroll: {
      direction: "prev" | "next";
      chapter: ChapterRef | null;
      targetX: number;
      targetY: number;
      ready: boolean;
      dist: number;
    } | null = null;

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
        }, 350);
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

      if (Math.hypot(dx, dy) > 8) {
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
        const ready = isOverscrollReady(ev.clientX, ev.clientY, activeMouseOverscroll.targetX, activeMouseOverscroll.targetY);
        activeMouseOverscroll.ready = ready;
        if (ready && !hasVibrated) {
          triggerHaptic("snap");
          hasVibrated = true;
        } else if (!ready) {
          hasVibrated = false;
        }
        dispatchOverscroll({
          fingerX: ev.clientX,
          fingerY: ev.clientY,
          targetX: activeMouseOverscroll.targetX,
          targetY: activeMouseOverscroll.targetY,
          direction: activeMouseOverscroll.direction,
          chapter: activeMouseOverscroll.chapter,
          ready,
        });
        return;
      }
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);
      const { prevCh, nextCh } = getAdjacentChapters(s.chapterList(), s.permalink, s.chapterTitle());
      if (s.isHorizontal()) {
        if (isMobileGesturesOnDesktopEnabled()) {
          const isRtl = s.direction() === "rtl";
          const cur = s.isSpread() ? s.slideIndex() : s.currentIndex();
          const total = s.isSpread() ? s.spreads().length : s.pages().length;

          const isPullingPrev =
            cur === 0 &&
            (isRtl ? dx < -OVERSCROLL_ENGAGE_THRESHOLD_PX : dx > OVERSCROLL_ENGAGE_THRESHOLD_PX) &&
            absX > absY * 1.1;

          const isPullingNext =
            cur >= total - 1 &&
            (isRtl ? dx > OVERSCROLL_ENGAGE_THRESHOLD_PX : dx < -OVERSCROLL_ENGAGE_THRESHOLD_PX) &&
            absX > absY * 1.1;

          if (isPullingPrev) {
            const { targetX, targetY } = getOverscrollTarget(mouseStartX, mouseStartY, "prev", true, isRtl);
            const ready = isOverscrollReady(ev.clientX, ev.clientY, targetX, targetY);
            activeMouseOverscroll = { direction: "prev", chapter: prevCh, targetX, targetY, ready, dist: absX };
            dispatchOverscroll({
              fingerX: ev.clientX,
              fingerY: ev.clientY,
              targetX,
              targetY,
              direction: "prev",
              chapter: prevCh,
              ready,
            });
            if (s.stripEl) {
              const pullSign = isRtl ? -1 : 1;
              const damped = pullSign * Math.min(OVERSCROLL_MAX_PULL_PX, Math.pow(absX, 0.72));
              s.stripEl.style.transform = stripTranslateXWithPull(cur, s.direction(), damped);
            }
            return;
          }

          if (isPullingNext) {
            const { targetX, targetY } = getOverscrollTarget(mouseStartX, mouseStartY, "next", true, isRtl);
            const ready = isOverscrollReady(ev.clientX, ev.clientY, targetX, targetY);
            activeMouseOverscroll = { direction: "next", chapter: nextCh, targetX, targetY, ready, dist: absX };
            dispatchOverscroll({
              fingerX: ev.clientX,
              fingerY: ev.clientY,
              targetX,
              targetY,
              direction: "next",
              chapter: nextCh,
              ready,
            });
            if (s.stripEl) {
              const pullSign = isRtl ? 1 : -1;
              const damped = pullSign * Math.min(OVERSCROLL_MAX_PULL_PX, Math.pow(absX, 0.72));
              s.stripEl.style.transform = stripTranslateXWithPull(cur, s.direction(), damped);
            }
            return;
          }
        }
      } else {
        // Vertical Continuous Scroll Mode
        const vp = s.viewportEl;
        if (vp) {
          const isAtTop = vp.scrollTop <= 5;
          const isAtBottom = vp.scrollTop + vp.clientHeight >= vp.scrollHeight - 5;

          if (isAtTop && dy > OVERSCROLL_ENGAGE_THRESHOLD_PX && absY > absX * 1.1) {
            const { targetX, targetY } = getOverscrollTarget(mouseStartX, mouseStartY, "prev", false);
            const ready = isOverscrollReady(ev.clientX, ev.clientY, targetX, targetY);
            activeMouseOverscroll = { direction: "prev", chapter: prevCh, targetX, targetY, ready, dist: dy };
            dispatchOverscroll({
              fingerX: ev.clientX,
              fingerY: ev.clientY,
              targetX,
              targetY,
              direction: "prev",
              chapter: prevCh,
              ready,
            });
            if (s.stripEl) {
              const damped = Math.min(OVERSCROLL_MAX_PULL_PX, Math.pow(dy, 0.72));
              s.stripEl.style.transform = `translateY(${damped}px)`;
            }
            return;
          }

          if (isAtBottom && dy < -OVERSCROLL_ENGAGE_THRESHOLD_PX && absY > absX * 1.1) {
            const { targetX, targetY } = getOverscrollTarget(mouseStartX, mouseStartY, "next", false);
            const ready = isOverscrollReady(ev.clientX, ev.clientY, targetX, targetY);
            activeMouseOverscroll = { direction: "next", chapter: nextCh, targetX, targetY, ready, dist: -dy };
            dispatchOverscroll({
              fingerX: ev.clientX,
              fingerY: ev.clientY,
              targetX,
              targetY,
              direction: "next",
              chapter: nextCh,
              ready,
            });
            if (s.stripEl) {
              const damped = -Math.min(OVERSCROLL_MAX_PULL_PX, Math.pow(-dy, 0.72));
              s.stripEl.style.transform = `translateY(${damped}px)`;
            }
            return;
          }
          if (isMobileGesturesOnDesktopEnabled()) {
            vp.scrollTop = vpScrollTop - dy;
            vp.scrollLeft = vpScrollLeft - dx;
          }
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
        if (over.ready && over.chapter) {
          if (over.direction === "prev") {
            s.gotoPrevChapter();
          } else {
            s.gotoNextChapter();
          }
        }
        return;
      }
      if (isMobileGesturesOnDesktopEnabled()) {
        resetStripTransform(true);
      }
      // Horizontal swipe for page flips in horizontal mode
      if (
        s.isHorizontal() &&
        mouseMoved &&
        absX > SWIPE_MIN_DIST_MOUSE_PX &&
        absX > absY * 1.25 &&
        (absX > 65 || (absX > SWIPE_MIN_DIST_MOUSE_PX && dt < 300))
      ) {
        const isRtl = s.direction() === "rtl";
        const step = isRtl ? (totalDx > 0 ? 1 : -1) : (totalDx < 0 ? 1 : -1);
        const cur = s.currentIndex();
        const total = s.pages().length;
        const targetPage = cur + step;
        if (targetPage >= 0 && targetPage < total) {
          if (s.isHorizontal() && s.isSpread()) {
            s.stepSpread(step as 1 | -1);
          } else {
            s.setPage(targetPage, false);
          }
        } else if (cur === 0 && step === -1) {
          triggerDirectionHint();
        }
        return;
      }

      // Tap / Click gesture without drag when mobile gestures on desktop is enabled
      if (isMobileGesturesOnDesktopEnabled() && !mouseMoved && dt < 450) {
        if (!s.isHorizontal()) {
          s.toggleToolbarVisible();
          return;
        }

        const zone = getTapZone(ev.clientX);
        const isRtl = s.direction() === "rtl";
        if (zone === "left") {
          const step = isRtl ? 1 : -1;
          const targetPage = s.currentIndex() + step;
          if (targetPage >= 0 && targetPage < s.pages().length) {
            if (s.isSpread()) s.stepSpread(step as 1 | -1);
            else s.setPage(targetPage);
          }
        } else if (zone === "right") {
          const step = isRtl ? -1 : 1;
          const targetPage = s.currentIndex() + step;
          if (targetPage >= 0 && targetPage < s.pages().length) {
            if (s.isSpread()) s.stepSpread(step as 1 | -1);
            else s.setPage(targetPage);
          }
        } else {
          s.toggleToolbarVisible();
        }
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
