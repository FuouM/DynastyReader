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
import { getPrefetchBuffer, isAutoCacheChapterEnabled } from "./settings";
import { decodeEntities } from "../utils/html";
import { createResizeObserver } from "@solid-primitives/resize-observer";
export function ReaderViewport(props: { session: ReaderSession; children?: JSX.Element }) {
  const s = props.session;
  const [overscrollHint, setOverscrollHint] = createSignal<{
    text: string;
    ready: boolean;
    direction: "prev" | "next";
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
      setOverscrollHint(null);
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

      // Check for overscroll chapter pull at boundaries with loose permalink resolution
      const list = s.chapterList();
      const curIdx = list.findIndex(
        (x) =>
          x.permalink === s.permalink ||
          x.permalink.toLowerCase().trim() === s.permalink.toLowerCase().trim() ||
          x.permalink.endsWith(`/${s.permalink}`) ||
          s.permalink.endsWith(`/${x.permalink}`),
      );
      const prevCh = curIdx > 0 ? list[curIdx - 1] : null;
      const nextCh = curIdx >= 0 && curIdx < list.length - 1 ? list[curIdx + 1] : null;

      if (s.isHorizontal()) {
        const isRtl = s.direction() === "rtl";
        const cur = s.isSpread() ? s.slideIndex() : s.currentIndex();
        const total = s.isSpread() ? s.spreads().length : s.pages().length;

        // In RTL: drag left (dx < -40) pulls previous; drag right (dx > 40) pulls next
        // In LTR: drag right (dx > 40) pulls previous; drag left (dx < -40) pulls next
        const isPullingPrev = cur === 0 && (isRtl ? dx < -40 : dx > 40) && absX > absY;
        const isPullingNext = cur >= total - 1 && (isRtl ? dx > 40 : dx < -40) && absX > absY;

        if (isPullingPrev) {
          const dist = absX;
          const ready = dist >= 120;
          activeOverscroll = { direction: "prev", chapter: prevCh, ready, dist };
          if (ready && !hasVibrated) {
            if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(25);
            hasVibrated = true;
          }
          setOverscrollHint({
            direction: "prev",
            ready,
            text: prevCh
              ? (ready
                  ? `Release for previous chapter: ${decodeEntities(prevCh.title)}`
                  : `Pull for previous chapter (${Math.min(100, Math.round((dist / 120) * 100))}%)`)
              : "First chapter (no previous chapter)",
          });
          if (s.stripEl) {
            const pullSign = isRtl ? -1 : 1;
            const damped = pullSign * Math.min(60, Math.pow(dist, 0.72));
            const sign = isRtl ? 1 : -1;
            s.stripEl.style.transform = `translateX(calc(${sign * cur * 100}% + ${damped}px))`;
          }
          return;
        }

        if (isPullingNext) {
          const dist = absX;
          const ready = dist >= 120;
          activeOverscroll = { direction: "next", chapter: nextCh, ready, dist };
          if (ready && !hasVibrated) {
            if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(25);
            hasVibrated = true;
          }
          setOverscrollHint({
            direction: "next",
            ready,
            text: nextCh
              ? (ready
                  ? `Release for next chapter: ${decodeEntities(nextCh.title)}`
                  : `Pull for next chapter (${Math.min(100, Math.round((dist / 120) * 100))}%)`)
              : "End of series (no next chapter)",
          });
          if (s.stripEl) {
            const pullSign = isRtl ? 1 : -1;
            const damped = pullSign * Math.min(60, Math.pow(dist, 0.72));
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

          if (isAtTop && dy > 40 && absY > absX) {
            const dist = dy;
            const ready = dist >= 120;
            activeOverscroll = { direction: "prev", chapter: prevCh, ready, dist };
            if (ready && !hasVibrated) {
              if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(25);
              hasVibrated = true;
            }
            setOverscrollHint({
              direction: "prev",
              ready,
              text: prevCh
                ? (ready
                    ? `Release for previous chapter: ${decodeEntities(prevCh.title)}`
                    : `Pull down for previous chapter (${Math.min(100, Math.round((dist / 120) * 100))}%)`)
                : "First chapter (no previous chapter)",
            });
            if (s.stripEl) {
              const damped = Math.min(60, Math.pow(dist, 0.72));
              s.stripEl.style.transform = `translateY(${damped}px)`;
            }
            return;
          }

          if (isAtBottom && dy < -40 && absY > absX) {
            const dist = -dy;
            const ready = dist >= 120;
            activeOverscroll = { direction: "next", chapter: nextCh, ready, dist };
            if (ready && !hasVibrated) {
              if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(25);
              hasVibrated = true;
            }
            setOverscrollHint({
              direction: "next",
              ready,
              text: nextCh
                ? (ready
                    ? `Release for next chapter: ${decodeEntities(nextCh.title)}`
                    : `Pull up for next chapter (${Math.min(100, Math.round((dist / 120) * 100))}%)`)
                : "End of series (no next chapter)",
            });
            if (s.stripEl) {
              const damped = -Math.min(60, Math.pow(dist, 0.72));
              s.stripEl.style.transform = `translateY(${damped}px)`;
            }
            return;
          }
        }
      }
      if (activeOverscroll) {
        activeOverscroll = null;
        setOverscrollHint(null);
        resetStripTransform(false);
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

      // Check if overscroll was released ready
      // Check if overscroll was released ready with intentional hold
      if (activeOverscroll) {
        const over = activeOverscroll;
        activeOverscroll = null;
        setOverscrollHint(null);
        resetStripTransform(true);
        const isIntentional = over.ready && (dt >= 200 || over.dist >= 150);
        if (isIntentional && over.chapter) {
          if (over.direction === "prev") {
            s.gotoPrevChapter();
          } else {
            s.gotoNextChapter();
          }
          return;
        }
        return;
      }

      // Always reset strip transform smoothly in case a drag slightly displaced it
      resetStripTransform(true);

      // 1. Horizontal Swipe gesture for in-chapter page flips
      if (touchMoved && absX > 25 && absX > absY * 1.1 && (absX > 45 || dt < 500)) {
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
    // ── Desktop Mouse Drag Engine (Panning when zoomed, Mouse swipe) ──
    let isMouseDown = false;
    let mouseStartX = 0;
    let mouseStartY = 0;
    let mouseMoved = false;
    let activeSlot: HTMLElement | null = null;
    let slotScrollLeft = 0;
    let slotScrollTop = 0;

    const onMouseDown = (ev: MouseEvent): void => {
      if (ev.button !== 0) return;
      if ((ev.target as HTMLElement)?.closest("button, a, input, select, textarea")) return;
      s.cancelScrollAnimation();
      ev.preventDefault();
      isMouseDown = true;
      mouseStartX = ev.clientX;
      mouseStartY = ev.clientY;
      mouseMoved = false;
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
      const absX = Math.abs(totalDx);
      const absY = Math.abs(totalDy);

      if (mouseMoved && absX > 40 && absX > absY * 1.1) {
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
      <Show when={overscrollHint()}>
        {(hint) => {
          const iconClass = () => {
            if (!s.isHorizontal()) {
              return hint().direction === "next" ? "bi-arrow-up-circle-fill" : "bi-arrow-down-circle-fill";
            }
            const isRtl = s.direction() === "rtl";
            if (hint().direction === "next") {
              return isRtl ? "bi-arrow-right-circle-fill" : "bi-arrow-left-circle-fill";
            }
            return isRtl ? "bi-arrow-left-circle-fill" : "bi-arrow-right-circle-fill";
          };

          return (
            <div
              class="ds-chapter-overscroll-badge"
              classList={{ "ds-ready": hint().ready }}
            >
              <i class={`bi ${iconClass()}`} />
              <span>{hint().text}</span>
            </div>
          );
        }}
      </Show>
    </div>
  );
}
