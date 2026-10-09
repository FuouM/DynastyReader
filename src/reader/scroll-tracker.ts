import type { ReaderSession } from "./reader-session";

export function setupScrollTracker(s: ReaderSession, vpEl: HTMLElement): () => void {
  let lastPrefetchedLeadingIdx = -1;
  const computeCurrentPageFromScroll = (force = false): void => {
    if (s.isHorizontal() || s.isProgrammaticScroll || s.restoring() || (!force && s.isToolbarAnimating)) return;
    const vp = s.viewportEl;
    if (!vp || !vp.isConnected) return;

    const totalSlots = s.slotEls.length;
    if (totalSlots === 0) return;

    const vpRect = vp.getBoundingClientRect();
    if (vpRect.height <= 0) return;
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

      bestIdx = mid;
      if (targetY >= rect.top && targetY < rect.bottom) {
        break;
      } else if (targetY < rect.top) {
        high = mid - 1;
      } else {
        low = mid + 1;
      }
    }
    if (vp.scrollHeight > vp.clientHeight && vp.scrollTop + vp.clientHeight >= vp.scrollHeight - 32) {
      bestIdx = totalSlots - 1;
    }

    // Proactively prefetch upcoming pages from the leading visible edge of the viewport
    let leadingIdx = bestIdx;
    for (let i = bestIdx + 1; i < totalSlots; i++) {
      const el = s.slotEls[i];
      if (!el) break;
      const rect = el.getBoundingClientRect();
      if (rect.top <= vpRect.bottom + 1200) {
        leadingIdx = i;
      } else {
        break;
      }
    }

    if (leadingIdx !== lastPrefetchedLeadingIdx) {
      lastPrefetchedLeadingIdx = leadingIdx;
      s.prioritizeReadingWindow(leadingIdx);
    }

    if (bestIdx !== s.currentIndex()) {
      s.setPageFromScroll(bestIdx);
    }
  };

  const onViewportScroll = (): void => {
    if (s.isHorizontal() || s.isProgrammaticScroll || s.isToolbarAnimating) return;
    if (s.scrollRaf !== null) cancelAnimationFrame(s.scrollRaf);
    s.scrollRaf = requestAnimationFrame(() => {
      computeCurrentPageFromScroll();
      s.scrollRaf = null;
    });
  };

  s.toolbarAnimEndHook = () => computeCurrentPageFromScroll();
  s.computeScrollProgress = () => computeCurrentPageFromScroll(true);

  vpEl.addEventListener("scroll", onViewportScroll, { passive: true });
  const cleanup = () => {
    vpEl.removeEventListener("scroll", onViewportScroll);
    if (s.scrollRaf !== null) {
      cancelAnimationFrame(s.scrollRaf);
      s.scrollRaf = null;
    }
    s.computeScrollProgress = null;
    s.toolbarAnimEndHook = null;
  };
  s.onDispose(cleanup);
  return cleanup;
}
