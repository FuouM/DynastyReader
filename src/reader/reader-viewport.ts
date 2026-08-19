import type { ReaderController } from "./reader-controller";
import { isAutoCacheChapterEnabled, getPrefetchBuffer } from "./settings";
import { spreadIndexOf } from "./reader-spread";
import { attachReaderWheel } from "./reader-wheel";

/**
 * Owns the reader's strip/paged layout engines: viewport + strip DOM, dynamic
 * height measurement, mode-switch transitions, scroll-position tracking, and
 * the IntersectionObserver preloader. The wheel page-flip gesture lives in
 * `reader-wheel.ts`.
 */
export class ReaderViewport {
  constructor(private readonly c: ReaderController) {
    this.build();
  }

  private build(): void {
    const c = this.c;

    const viewport = document.createElement("div");
    viewport.id = "ds-reader-viewport";
    c.readerContainer.appendChild(viewport);
    c.viewport = viewport;

    const strip = document.createElement("div");
    strip.id = "ds-reader-strip";
    viewport.appendChild(strip);
    c.strip = strip;

    // Compute exact available viewport height dynamically
    const updateViewportHeight = (): void => {
      const h = viewport.clientHeight;
      if (h > 50) {
        c.readerContainer.style.setProperty("--ds-viewport-full", `${h}px`);
        c.readerContainer.style.setProperty("--ds-viewport-height", `${h - 20}px`);
      }
    };
    const ro = new ResizeObserver(updateViewportHeight);
    ro.observe(viewport);
    c.onDispose(() => ro.disconnect());
    window.setTimeout(updateViewportHeight, 0);
  }

  /** Jumps to a page: paged mode slides the strip; scroll mode scrolls into view.
   *  `instant` disables the smooth animation (used for the initial resume restore
   *  so the first page never flashes while scrolling from the top). */
  slideTo(index: number, instant = false, scrollToBottom = false): void {
    const c = this.c;
    if (c.isHorizontal) {
      const slideIndex = c.isSpread ? spreadIndexOf(c.spreads, index) : index;
      const targetSlide = c.isSpread ? c.spreadSlots[slideIndex] : c.slots[index];
      if (targetSlide) {
        if (scrollToBottom) {
          // Jump to bottom of previous page/spread so upward scrolling continues seamlessly
          targetSlide.scrollTop = Math.max(0, targetSlide.scrollHeight - targetSlide.clientHeight);
        } else {
          targetSlide.scrollTop = 0;
        }
        if (c.isSpread && c.direction === "rtl" && targetSlide.scrollWidth > targetSlide.clientWidth) {
          targetSlide.scrollLeft = targetSlide.scrollWidth - targetSlide.clientWidth;
        } else {
          targetSlide.scrollLeft = 0;
        }
      }
      const sign = c.direction === "rtl" ? 1 : -1;
      const transformValue = `translateX(${sign * slideIndex * 100}%)`;
      if (!c.scrollLock || instant) {
        // Force layout commit so transition:none takes effect before transform
        c.strip.style.transition = "none";
        void c.strip.offsetWidth; // trigger reflow
        c.strip.style.transform = transformValue;
      } else {
        // Ensure transition is active then slide
        c.strip.style.transition = "";
        c.strip.style.transform = transformValue;
      }
    } else {
      c.isProgrammaticScroll = true;
      if (c.programmaticScrollTimer !== null) clearTimeout(c.programmaticScrollTimer);
      c.programmaticScrollTimer = window.setTimeout(() => {
        c.isProgrammaticScroll = false;
      }, 350);

      const target = c.slots[index];
      if (target) {
        target.scrollIntoView({ behavior: instant ? "auto" : "smooth", block: "start" });
      }
    }
  }

  /** Restores the reader to the current page (used on resize / mode / fullscreen changes). */
  resetToCurrentPage(smooth = false): void {
    const c = this.c;
    const updateViewportHeight = (): void => {
      const h = c.viewport.clientHeight;
      if (h > 50) {
        c.readerContainer.style.setProperty("--ds-viewport-full", `${h}px`);
        c.readerContainer.style.setProperty("--ds-viewport-height", `${h - 20}px`);
      }
    };
    updateViewportHeight();
    if (c.isHorizontal) {
      const slideIndex = c.isSpread ? spreadIndexOf(c.spreads, c.currentIndex) : c.currentIndex;
      const sign = c.direction === "rtl" ? 1 : -1;
      const transformValue = `translateX(${sign * slideIndex * 100}%)`;
      if (!smooth) {
        c.strip.style.transition = "none";
        void c.strip.offsetWidth;
        c.strip.style.transform = transformValue;
        requestAnimationFrame(() => {
          c.strip.style.transition = "";
        });
      } else {
        c.strip.style.transform = transformValue;
      }
    } else {
      c.isProgrammaticScroll = true;
      if (c.programmaticScrollTimer !== null) clearTimeout(c.programmaticScrollTimer);
      c.programmaticScrollTimer = window.setTimeout(() => {
        c.isProgrammaticScroll = false;
      }, 350);

      const target = c.slots[c.currentIndex];
      if (target) {
        target.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
      }
    }
    c.updateProgressText();
  }

  /** Applies the current mode/layout to the viewport and strip. */
  applyLayoutMode(): void {
    const c = this.c;
    c.rebuildSpreadSlots();
    if (c.isHorizontal) {
      c.viewport.classList.add("horizontal");
      c.viewport.classList.toggle("rtl", c.direction === "rtl");
      c.viewport.classList.toggle("ltr", c.direction === "ltr");
      c.strip.classList.toggle("rtl", c.direction === "rtl");
      c.strip.classList.toggle("ltr", c.direction === "ltr");

      // Jump to current slide instantly (no animation on mode switch)
      c.strip.style.transition = "none";
      const slideIndex = c.isSpread ? spreadIndexOf(c.spreads, c.currentIndex) : c.currentIndex;
      const sign = c.direction === "rtl" ? 1 : -1;
      c.strip.style.transform = `translateX(${sign * slideIndex * 100}%)`;
      // Re-enable transition after the paint
      requestAnimationFrame(() => {
        c.strip.style.transition = "";
      });
    } else {
      c.viewport.classList.remove("horizontal", "rtl", "ltr");
      c.strip.classList.remove("rtl", "ltr");
      c.strip.style.transform = "";
      c.strip.style.transition = "";
      const target = c.slots[c.currentIndex];
      if (target) target.scrollIntoView({ block: "start" });
    }
  }

  private attachScrollTracking(): void {
    const c = this.c;

    const computeCurrentPageFromScroll = (): void => {
      if (c.isHorizontal || c.isProgrammaticScroll) return;
      const vpRect = c.viewport.getBoundingClientRect();
      const focalY = vpRect.top + vpRect.height * 0.35;

      let bestIdx = c.currentIndex;
      for (let i = 0; i < c.slots.length; i++) {
        const r = c.slots[i].getBoundingClientRect();
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

      if (bestIdx !== c.currentIndex) {
        c.currentIndex = bestIdx;
        c.atEnd = c.currentIndex >= c.pages.length - 1;
        c.updateProgressText();
        c.schedulePersist();
        if (c.atEnd) void c.persistNow();
      }
    };

    const onViewportScroll = (): void => {
      if (c.isHorizontal || c.isProgrammaticScroll) return;
      if (c.scrollRaf !== null) cancelAnimationFrame(c.scrollRaf);
      c.scrollRaf = requestAnimationFrame(() => {
        computeCurrentPageFromScroll();
        c.scrollRaf = null;
      });
    };
    c.viewport.addEventListener("scroll", onViewportScroll, { passive: true });
    c.onDispose(() => {
      c.viewport.removeEventListener("scroll", onViewportScroll);
      if (c.scrollRaf !== null) cancelAnimationFrame(c.scrollRaf);
    });
  }

  private attachPreloader(): void {
    const c = this.c;
    const observer = new IntersectionObserver(
      (entries) => {
        // In horizontal (paged) mode, slot loading is driven explicitly by setPage()
        if (c.isHorizontal) return;

        const autoCache = isAutoCacheChapterEnabled();
        const prefetchCount = getPrefetchBuffer();

        for (const entry of entries) {
          if (entry.isIntersecting) {
            const idx = Number((entry.target as HTMLElement).dataset.index);
            c.enqueue(idx);
            if (autoCache) {
              c.enqueue(idx + 1);
              c.enqueue(idx + 2);
            } else {
              for (let offset = 1; offset <= prefetchCount; offset++) {
                if (idx + offset < c.pages.length) {
                  c.enqueue(idx + offset);
                }
              }
            }
          }
        }
      },
      { root: c.viewport, rootMargin: "0px 0px", threshold: 0.05 },
    );
    c.slots.forEach((s) => observer.observe(s));
    c.onDispose(() => observer.disconnect());
  }

  /** Called once slots exist. Attaches scroll tracking, preloading, wheel, and drag panning. */
  wireAfterSlots(): void {
    this.attachScrollTracking();
    this.attachPreloader();
    attachReaderWheel(this.c);
    this.attachDragPanning();
  }

  private attachDragPanning(): void {
    const c = this.c;
    let isDown = false;
    let startX = 0;
    let startY = 0;
    let scrollLeft = 0;
    let scrollTop = 0;
    let activeSlot: HTMLElement | null = null;
    let isViewportPan = false;

    const onMouseDown = (ev: MouseEvent): void => {
      // Primary mouse button only
      if (ev.button !== 0) return;
      
      // Do not initiate drag pan if clicking buttons, links, or inputs
      if ((ev.target as HTMLElement)?.closest("button, a, input, select, textarea")) return;

      if (c.isHorizontal) {
        let target: HTMLElement | null = null;
        if (c.isSpread) {
          const curSlide = spreadIndexOf(c.spreads, c.currentIndex);
          target = c.spreadSlots[curSlide] ?? (ev.target as HTMLElement)?.closest<HTMLElement>(".ds-spread-slot");
        } else {
          target = c.slots[c.currentIndex] ?? (ev.target as HTMLElement)?.closest<HTMLElement>(".ds-slot");
        }
        if (!target) return;
        if (target.scrollWidth <= target.clientWidth && target.scrollHeight <= target.clientHeight) {
          return;
        }

        isDown = true;
        isViewportPan = false;
        activeSlot = target;
        activeSlot.classList.add("ds-dragging");
        c.viewport.classList.add("ds-dragging");
        startX = ev.pageX;
        startY = ev.pageY;
        scrollLeft = activeSlot.scrollLeft;
        scrollTop = activeSlot.scrollTop;
        ev.preventDefault();
      } else {
        // Vertical scroll mode
        const vp = c.viewport;
        if (!vp) return;
        if (vp.scrollWidth <= vp.clientWidth && vp.scrollHeight <= vp.clientHeight) {
          return;
        }

        isDown = true;
        isViewportPan = true;
        c.viewport.classList.add("ds-dragging");
        startX = ev.pageX;
        startY = ev.pageY;
        scrollLeft = vp.scrollLeft;
        scrollTop = vp.scrollTop;
        ev.preventDefault();
      }
    };

    const onMouseMove = (ev: MouseEvent): void => {
      if (!isDown) return;
      ev.preventDefault();
      const dx = ev.pageX - startX;
      const dy = ev.pageY - startY;

      if (isViewportPan && c.viewport) {
        c.viewport.scrollLeft = scrollLeft - dx;
        c.viewport.scrollTop = scrollTop - dy;
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
      c.viewport.classList.remove("ds-dragging");
      isViewportPan = false;
    };

    c.viewport.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    c.onDispose(() => {
      c.viewport.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    });
  }
}
