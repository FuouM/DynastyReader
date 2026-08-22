/**
 * Reader viewport: the strip container + per-page slots (direct in scroll /
 * single-paged mode, wrapped into `.ds-spread-slot` slides in spread mode),
 * plus the imperative viewport wiring — dynamic height measurement, scroll
 * tracking, the IntersectionObserver preloader, drag panning, and the wheel
 * page-flip gesture. Port of `reader-viewport.ts`.
 */

import { createEffect, onCleanup, onMount, type JSX } from "solid-js";
import type { ReaderSession } from "./reader-session";
import { getPrefetchBuffer, isAutoCacheChapterEnabled } from "./settings";

export function ReaderViewport(props: { session: ReaderSession; children?: JSX.Element }) {
  const s = props.session;

  onMount(() => {
    const vpEl = s.viewportEl;
    if (!vpEl) return;

    // Compute exact available viewport height dynamically with RAF throttle
    let roRaf: number | null = null;
    const ro = new ResizeObserver(() => {
      if (roRaf !== null) cancelAnimationFrame(roRaf);
      roRaf = requestAnimationFrame(() => {
        roRaf = null;
        s.updateViewportHeight();
        slotTopCacheDirty = true;
      });
    });
    ro.observe(vpEl);
    s.onDispose(() => {
      ro.disconnect();
      if (roRaf !== null) cancelAnimationFrame(roRaf);
    });
    window.setTimeout(() => {
      s.updateViewportHeight();
      s.applyLayoutMode();
    }, 0);

    // Fast O(log N) scroll-position tracking with cached slot positions
    let slotTopCache: Float64Array | null = null;
    let slotTopCacheDirty = true;

    const rebuildSlotTopCache = (): void => {
      const count = s.slotEls.length;
      if (count === 0) {
        slotTopCache = null;
        return;
      }
      if (!slotTopCache || slotTopCache.length !== count) {
        slotTopCache = new Float64Array(count);
      }
      for (let i = 0; i < count; i++) {
        const el = s.slotEls[i];
        slotTopCache[i] = el ? el.offsetTop : 0;
      }
      slotTopCacheDirty = false;
    };

    const computeCurrentPageFromScroll = (): void => {
      if (s.isHorizontal() || s.isProgrammaticScroll) return;
      const vp = s.viewportEl;
      if (!vp) return;

      const totalSlots = s.slotEls.length;
      if (totalSlots === 0) return;

      if (slotTopCacheDirty || !slotTopCache || slotTopCache.length !== totalSlots) {
        rebuildSlotTopCache();
      }

      if (!slotTopCache || slotTopCache.length === 0) return;

      const focalY = vp.scrollTop + vp.clientHeight * 0.35;

      // Binary search for the active slot matching focalY
      let low = 0;
      let high = slotTopCache.length - 1;
      let bestIdx = 0;

      while (low <= high) {
        const mid = (low + high) >> 1;
        if (slotTopCache[mid] <= focalY) {
          bestIdx = mid;
          low = mid + 1;
        } else {
          high = mid - 1;
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

    // Drag panning (click-drag scrolls the active slide / viewport)
    let isDown = false;
    let startX = 0;
    let startY = 0;
    let scrollLeft = 0;
    let scrollTop = 0;
    let activeSlot: HTMLElement | null = null;
    let isViewportPan = false;

    const onMouseDown = (ev: MouseEvent): void => {
      if (ev.button !== 0) return;
      if ((ev.target as HTMLElement)?.closest("button, a, input, select, textarea")) return;

      const vpEl2 = s.viewportEl;
      if (!vpEl2) return;

      if (s.isHorizontal()) {
        let target: HTMLElement | null = null;
        if (s.isSpread()) {
          const curSlide = s.slideIndex();
          target =
            s.spreadSlotEls[curSlide] ??
            (ev.target as HTMLElement)?.closest<HTMLElement>(".ds-spread-slot");
        } else {
          target = s.slotEls[s.currentIndex()] ?? (ev.target as HTMLElement)?.closest<HTMLElement>(".ds-slot");
        }
        if (!target) return;
        if (target.scrollWidth <= target.clientWidth && target.scrollHeight <= target.clientHeight) {
          return;
        }

        isDown = true;
        isViewportPan = false;
        activeSlot = target;
        activeSlot.classList.add("ds-dragging");
        vpEl2.classList.add("ds-dragging");
        startX = ev.pageX;
        startY = ev.pageY;
        scrollLeft = activeSlot.scrollLeft;
        scrollTop = activeSlot.scrollTop;
        ev.preventDefault();
      } else {
        if (vpEl2.scrollWidth <= vpEl2.clientWidth && vpEl2.scrollHeight <= vpEl2.clientHeight) {
          return;
        }
        isDown = true;
        isViewportPan = true;
        vpEl2.classList.add("ds-dragging");
        startX = ev.pageX;
        startY = ev.pageY;
        scrollLeft = vpEl2.scrollLeft;
        scrollTop = vpEl2.scrollTop;
        ev.preventDefault();
      }
    };

    const onMouseMove = (ev: MouseEvent): void => {
      if (!isDown) return;
      ev.preventDefault();
      const dx = ev.pageX - startX;
      const dy = ev.pageY - startY;
      const vpEl2 = s.viewportEl;
      if (isViewportPan && vpEl2) {
        vpEl2.scrollLeft = scrollLeft - dx;
        vpEl2.scrollTop = scrollTop - dy;
      } else if (activeSlot) {
        activeSlot.scrollLeft = scrollLeft - dx;
        activeSlot.scrollTop = scrollTop - dy;
      }
    };

    const onMouseUp = (): void => {
      if (!isDown) return;
      isDown = false;
      if (activeSlot) {
        activeSlot.classList.remove("ds-dragging");
        activeSlot = null;
      }
      s.viewportEl?.classList.remove("ds-dragging");
      isViewportPan = false;
    };

    vpEl.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    s.onDispose(() => {
      vpEl.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    });
  });

  // Preloader: re-establish the IntersectionObserver whenever the slot set
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
    </div>
  );
}
