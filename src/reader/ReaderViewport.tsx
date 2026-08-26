/**
 * Reader viewport: the strip container + per-page slots (direct in scroll /
 * single-paged mode, wrapped into `.ds-spread-slot` slides in spread mode),
 * plus the imperative viewport wiring — dynamic height measurement, scroll
 * tracking, the IntersectionObserver preloader, drag panning, and the wheel
 * page-flip gesture. Port of `reader-viewport.ts`.
 */

import { createEffect, createSignal, onCleanup, onMount, Show, type JSX } from "solid-js";
import type { ReaderSession } from "./reader-session";
import type { ChapterRef } from "../types/routes";
import { getPrefetchBuffer, isAutoCacheChapterEnabled, isMobileGesturesOnDesktopEnabled } from "./settings";
import { decodeEntities } from "../utils/html";
import { createResizeObserver } from "@solid-primitives/resize-observer";
import { getAdjacentChapters } from "./reader-spread";
import { t } from "../i18n";

const OVERSCROLL_ENGAGE_THRESHOLD_PX = 35;
const OVERSCROLL_MAX_PULL_PX = 70;
const OVERSCROLL_COLLISION_RADIUS_PX = 56;
const SWIPE_MIN_DIST_TOUCH_PX = 35;
const SWIPE_MIN_DIST_MOUSE_PX = 45;

const isOverscrollReady = (clientX: number, clientY: number): boolean => {
  const distToCenter = Math.hypot(clientX - window.innerWidth / 2, clientY - window.innerHeight / 2);
  return distToCenter <= OVERSCROLL_COLLISION_RADIUS_PX;
};
export function ReaderViewport(props: { session: ReaderSession; children?: JSX.Element }) {
  const s = props.session;
  const [overscrollGesture, setOverscrollGesture] = createSignal<{
    fingerX: number;
    fingerY: number;
    direction: "prev" | "next";
    chapter: ChapterRef | null;
    ready: boolean;
  } | null>(null);
  onMount(() => {
    const vpEl = s.viewportEl;
    if (!vpEl) return;

    // Compute exact available viewport height dynamically via reactive primitive
    createResizeObserver(() => vpEl, () => {
      s.updateViewportHeight();
    });
    window.setTimeout(() => {
      s.updateViewportHeight();
      s.applyLayoutMode();
    }, 0);

    // Dynamic scroll-position tracking (continuous scroll mode)
    const computeCurrentPageFromScroll = (): void => {
      if (s.isHorizontal() || s.isProgrammaticScroll) return;
      const vp = s.viewportEl;
      if (!vp) return;

      const totalSlots = s.slotEls.length;
      if (totalSlots === 0) return;

      const vpRect = vp.getBoundingClientRect();
      const focalY = vpRect.top + vpRect.height * 0.4;

      let bestIdx = s.currentIndex();
      for (let i = 0; i < totalSlots; i++) {
        const el = s.slotEls[i];
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (r.top <= focalY && r.bottom > focalY) {
          bestIdx = i;
          break;
        }
        if (r.top > focalY) {
          bestIdx = i > 0 ? i - 1 : 0;
          break;
        }
        bestIdx = i;
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
        const sign = s.direction() === "rtl" ? 1 : -1;
        if (smooth) {
          s.stripEl.style.transition = "transform 0.2s ease-out";
          s.stripEl.style.transform = `translateX(${sign * slideIndex * 100}%)`;
          resetTransformTimer = window.setTimeout(() => {
            if (s.stripEl) s.stripEl.style.transition = "";
            resetTransformTimer = null;
          }, 200);
        } else {
          s.stripEl.style.transition = "none";
          s.stripEl.style.transform = `translateX(${sign * slideIndex * 100}%)`;
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
      ready: boolean;
      dist: number;
    } | null = null;

    const onTouchStart = (ev: TouchEvent): void => {
      if (ev.touches.length !== 1) return;
      s.cancelScrollAnimation();
      const t = ev.touches[0];
      touchStartX = t.clientX;
      touchStartY = t.clientY;
      touchStartTime = Date.now();
      touchMoved = false;
      hasVibrated = false;
      activeOverscroll = null;
      setOverscrollGesture(null);
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
      }

      // If overscroll gesture is already engaged, update finger tracking and check center collision
      if (activeOverscroll) {
        const ready = isOverscrollReady(t.clientX, t.clientY);
        activeOverscroll.ready = ready;
        if (ready && !hasVibrated) {
          if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(35);
          hasVibrated = true;
        } else if (!ready) {
          hasVibrated = false;
        }
        setOverscrollGesture({
          fingerX: t.clientX,
          fingerY: t.clientY,
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
          const ready = isOverscrollReady(t.clientX, t.clientY);
          activeOverscroll = { direction: "prev", chapter: prevCh, ready, dist: absX };
          setOverscrollGesture({
            fingerX: t.clientX,
            fingerY: t.clientY,
            direction: "prev",
            chapter: prevCh,
            ready,
          });
          if (s.stripEl) {
            const pullSign = isRtl ? -1 : 1;
            const damped = pullSign * Math.min(OVERSCROLL_MAX_PULL_PX, Math.pow(absX, 0.72));
            const sign = isRtl ? 1 : -1;
            s.stripEl.style.transform = `translateX(calc(${sign * cur * 100}% + ${damped}px))`;
          }
          return;
        }

        if (isPullingNext) {
          const ready = isOverscrollReady(t.clientX, t.clientY);
          activeOverscroll = { direction: "next", chapter: nextCh, ready, dist: absX };
          setOverscrollGesture({
            fingerX: t.clientX,
            fingerY: t.clientY,
            direction: "next",
            chapter: nextCh,
            ready,
          });
          if (s.stripEl) {
            const pullSign = isRtl ? 1 : -1;
            const damped = pullSign * Math.min(OVERSCROLL_MAX_PULL_PX, Math.pow(absX, 0.72));
            const sign = isRtl ? 1 : -1;
            s.stripEl.style.transform = `translateX(calc(${sign * cur * 100}% + ${damped}px))`;
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
            const ready = isOverscrollReady(t.clientX, t.clientY);
            activeOverscroll = { direction: "prev", chapter: prevCh, ready, dist: dy };
            setOverscrollGesture({
              fingerX: t.clientX,
              fingerY: t.clientY,
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
            const ready = isOverscrollReady(t.clientX, t.clientY);
            activeOverscroll = { direction: "next", chapter: nextCh, ready, dist: -dy };
            setOverscrollGesture({
              fingerX: t.clientX,
              fingerY: t.clientY,
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
        setOverscrollGesture(null);
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
        }
        return;
      }

      // 2. Tap gesture (without move)
      if (!touchMoved && dt < 450) {
        if (!s.isHorizontal()) {
          s.toggleToolbarVisible();
          return;
        }

        let activeEl: HTMLElement | null = null;
        if (s.isSpread()) {
          const curSlide = s.slideIndex();
          const spreadSlot = s.spreadSlotEls[curSlide];
          activeEl = spreadSlot?.querySelector<HTMLElement>(".ds-spread-canvas") ?? spreadSlot ?? null;
        } else {
          const curSlot = s.slotEls[s.currentIndex()];
          activeEl = curSlot?.querySelector<HTMLElement>(".ds-page-img, .ds-slot-state") ?? curSlot ?? null;
        }

        const rect = activeEl ? activeEl.getBoundingClientRect() : vpEl.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;

        const isInsidePage =
          t.clientX >= rect.left &&
          t.clientX <= rect.right &&
          t.clientY >= rect.top &&
          t.clientY <= rect.bottom;

        if (!isInsidePage) {
          s.toggleToolbarVisible();
          return;
        }

        const relX = (t.clientX - rect.left) / rect.width;
        const isRtl = s.direction() === "rtl";
        if (relX < 0.28) {
          // Left Tap
          const step = isRtl ? 1 : -1;
          const cur = s.currentIndex();
          const total = s.pages().length;
          const targetPage = cur + step;
          if (targetPage >= 0 && targetPage < total) {
            if (s.isSpread()) s.stepSpread(step as 1 | -1);
            else s.setPage(targetPage);
          }
        } else if (relX > 0.72) {
          // Right Tap
          const step = isRtl ? -1 : 1;
          const cur = s.currentIndex();
          const total = s.pages().length;
          const targetPage = cur + step;
          if (targetPage >= 0 && targetPage < total) {
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
    let activeSlot: HTMLElement | null = null;
    let slotScrollLeft = 0;
    let slotScrollTop = 0;
    let vpScrollTop = 0;
    let vpScrollLeft = 0;
    let activeMouseOverscroll: {
      direction: "prev" | "next";
      chapter: ChapterRef | null;
      ready: boolean;
      dist: number;
    } | null = null;

    const onMouseDown = (ev: MouseEvent): void => {
      if (ev.button !== 0) return;
      if ((ev.target as HTMLElement)?.closest("button, a, input, select, textarea")) return;
      s.cancelScrollAnimation();
      ev.preventDefault();
      isMouseDown = true;
      mouseStartX = ev.clientX;
      mouseStartY = ev.clientY;
      mouseStartTime = Date.now();
      mouseMoved = false;
      activeMouseOverscroll = null;
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
      if (Math.hypot(dx, dy) > 6) mouseMoved = true;

      if (activeSlot) {
        activeSlot.scrollLeft = slotScrollLeft - dx;
        activeSlot.scrollTop = slotScrollTop - dy;
        return;
      }

      // If mouse overscroll gesture is already engaged, update finger tracking and check center collision
      if (activeMouseOverscroll) {
        const ready = isOverscrollReady(ev.clientX, ev.clientY);
        activeMouseOverscroll.ready = ready;
        if (ready && !hasVibrated) {
          if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(35);
          hasVibrated = true;
        } else if (!ready) {
          hasVibrated = false;
        }
        setOverscrollGesture({
          fingerX: ev.clientX,
          fingerY: ev.clientY,
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
            const ready = isOverscrollReady(ev.clientX, ev.clientY);
            activeMouseOverscroll = { direction: "prev", chapter: prevCh, ready, dist: absX };
            setOverscrollGesture({
              fingerX: ev.clientX,
              fingerY: ev.clientY,
              direction: "prev",
              chapter: prevCh,
              ready,
            });
            if (s.stripEl) {
              const pullSign = isRtl ? -1 : 1;
              const damped = pullSign * Math.min(OVERSCROLL_MAX_PULL_PX, Math.pow(absX, 0.72));
              const sign = isRtl ? 1 : -1;
              s.stripEl.style.transform = `translateX(calc(${sign * cur * 100}% + ${damped}px))`;
            }
            return;
          }

          if (isPullingNext) {
            const ready = isOverscrollReady(ev.clientX, ev.clientY);
            activeMouseOverscroll = { direction: "next", chapter: nextCh, ready, dist: absX };
            setOverscrollGesture({
              fingerX: ev.clientX,
              fingerY: ev.clientY,
              direction: "next",
              chapter: nextCh,
              ready,
            });
            if (s.stripEl) {
              const pullSign = isRtl ? 1 : -1;
              const damped = pullSign * Math.min(OVERSCROLL_MAX_PULL_PX, Math.pow(absX, 0.72));
              const sign = isRtl ? 1 : -1;
              s.stripEl.style.transform = `translateX(calc(${sign * cur * 100}% + ${damped}px))`;
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
            const ready = isOverscrollReady(ev.clientX, ev.clientY);
            activeMouseOverscroll = { direction: "prev", chapter: prevCh, ready, dist: dy };
            setOverscrollGesture({
              fingerX: ev.clientX,
              fingerY: ev.clientY,
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
            const ready = isOverscrollReady(ev.clientX, ev.clientY);
            activeMouseOverscroll = { direction: "next", chapter: nextCh, ready, dist: -dy };
            setOverscrollGesture({
              fingerX: ev.clientX,
              fingerY: ev.clientY,
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
        setOverscrollGesture(null);
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
        }
        return;
      }

      // Tap / Click gesture without drag when mobile gestures on desktop is enabled
      if (isMobileGesturesOnDesktopEnabled() && !mouseMoved && dt < 450) {
        if (!s.isHorizontal()) {
          s.toggleToolbarVisible();
          return;
        }

        let activeEl: HTMLElement | null = null;
        if (s.isSpread()) {
          const curSlide = s.slideIndex();
          const spreadSlot = s.spreadSlotEls[curSlide];
          activeEl = spreadSlot?.querySelector<HTMLElement>(".ds-spread-canvas") ?? spreadSlot ?? null;
        } else {
          const curSlot = s.slotEls[s.currentIndex()];
          activeEl = curSlot?.querySelector<HTMLElement>(".ds-page-img, .ds-slot-state") ?? curSlot ?? null;
        }

        const rect = activeEl ? activeEl.getBoundingClientRect() : vpEl.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;

        const isInsidePage =
          ev.clientX >= rect.left &&
          ev.clientX <= rect.right &&
          ev.clientY >= rect.top &&
          ev.clientY <= rect.bottom;

        if (!isInsidePage) {
          s.toggleToolbarVisible();
          return;
        }

        const relX = (ev.clientX - rect.left) / rect.width;
        const isRtl = s.direction() === "rtl";
        if (relX < 0.28) {
          // Left Tap
          const step = isRtl ? 1 : -1;
          const cur = s.currentIndex();
          const total = s.pages().length;
          const targetPage = cur + step;
          if (targetPage >= 0 && targetPage < total) {
            if (s.isSpread()) s.stepSpread(step as 1 | -1);
            else s.setPage(targetPage);
          }
        } else if (relX > 0.72) {
          // Right Tap
          const step = isRtl ? -1 : 1;
          const cur = s.currentIndex();
          const total = s.pages().length;
          const targetPage = cur + step;
          if (targetPage >= 0 && targetPage < total) {
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
  // changes (initial mount, layout toggles that rebuild the strip).
  createEffect(() => {
    const stripKey = `${s.pages().length}:${s.isSpread()}:${s.spreads().length}`;

    const observer = new IntersectionObserver(
      (entries) => {
        if (s.isHorizontal()) return;
        const autoCache = isAutoCacheChapterEnabled();
        const prefetchCount = getPrefetchBuffer();
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const idx = Number((entry.target as HTMLElement).dataset.index);
            s.enqueue(idx);
            if (autoCache) {
              s.enqueue(idx + 1);
              s.enqueue(idx + 2);
            } else {
              for (let offset = 1; offset <= prefetchCount; offset++) {
                if (idx + offset < s.pages().length) {
                  s.enqueue(idx + offset);
                }
              }
            }
          }
        }
      },
      { root: s.viewportEl ?? undefined, rootMargin: "0px 0px", threshold: 0.05 },
    );
    for (const el of s.slotEls) {
      if (el) observer.observe(el);
    }
    onCleanup(() => observer.disconnect());
    void stripKey;
  });

  return (
    <div
      id="ds-reader-viewport"
      ref={(el) => {
        s.viewportEl = el;
      }}
      classList={{
        horizontal: s.isHorizontal(),
        rtl: s.isHorizontal() && s.direction() === "rtl",
        ltr: s.isHorizontal() && s.direction() === "ltr",
      }}
    >
      {props.children}
      <Show when={overscrollGesture()}>
        {(g) => {
          const isNext = () => g().direction === "next";
          const chapter = () => g().chapter;

          return (
            <div class="ds-overscroll-gesture-overlay">
              <Show
                when={chapter()}
                fallback={
                  /* Clean informational notice when at start or end of series without lock/drag mechanics */
                  <div class="ds-overscroll-target-card" style={{ bottom: "calc(50% - 20px)" }}>
                    <span class="ds-overscroll-target-badge">
                      {isNext()
                        ? t("reader.overscrollLock.endOfSeriesTitle")
                        : t("reader.overscrollLock.firstChapterTitle")}
                    </span>
                    <div class="ds-overscroll-target-hint" style={{ "margin-top": "2px" }}>
                      {isNext()
                        ? t("reader.overscrollLock.endOfSeriesDesc")
                        : t("reader.overscrollLock.firstChapterDesc")}
                    </div>
                  </div>
                }
              >
                {/* Floating Info Card (Above Lock Ring) */}
                <div class="ds-overscroll-target-card">
                  <span class="ds-overscroll-target-badge">
                    {isNext() ? t("reader.overscrollLock.nextChapterBadge") : t("reader.overscrollLock.prevChapterBadge")}
                  </span>
                  <div class="ds-overscroll-target-title">
                    {decodeEntities(chapter()!.title || s.permalink)}
                  </div>
                  <div class="ds-overscroll-target-hint">
                    {g().ready
                      ? t("reader.overscrollLock.unlocked")
                      : (isNext() ? t("reader.overscrollLock.slideToUnlockNext") : t("reader.overscrollLock.slideToUnlockPrev"))}
                  </div>
                </div>

                {/* Real-time Finger Tracking Circle */}
                <div
                  class="ds-overscroll-finger-circle"
                  classList={{ "ds-snap-ready": g().ready }}
                  style={{
                    left: `${g().fingerX}px`,
                    top: `${g().fingerY}px`,
                  }}
                >
                  <i class={g().ready ? "bi bi-check-lg" : isNext() ? "bi bi-chevron-up" : "bi bi-chevron-down"} />
                </div>

                {/* Center Lock Target Circle (Exact Center) */}
                <div
                  class="ds-overscroll-target-ring"
                  classList={{ "ds-snap-ready": g().ready }}
                >
                  <i class={g().ready ? "bi bi-unlock-fill" : "bi bi-lock-fill"} />
                </div>
              </Show>
            </div>
          );
        }}
      </Show>
      </div>
    );
  }
