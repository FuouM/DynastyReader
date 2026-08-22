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

    // Compute exact available viewport height dynamically
    const ro = new ResizeObserver(() => s.updateViewportHeight());
    ro.observe(vpEl);
    s.onDispose(() => ro.disconnect());
    window.setTimeout(() => {
      s.updateViewportHeight();
      s.applyLayoutMode();
    }, 0);

    // Scroll-position tracking (continuous scroll mode)
    const computeCurrentPageFromScroll = (): void => {
      if (s.isHorizontal() || s.isProgrammaticScroll) return;
      const vpEl2 = s.viewportEl;
      if (!vpEl2) return;
      const vpRect = vpEl2.getBoundingClientRect();
      const focalY = vpRect.top + vpRect.height * 0.35;

      let bestIdx = s.currentIndex();
      for (let i = 0; i < s.slotEls.length; i++) {
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
