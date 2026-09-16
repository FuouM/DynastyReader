import { createResizeObserver } from "@solid-primitives/resize-observer";
import { isMobile } from "../stores/platform";
import type { ReaderSession } from "./reader-session";
import {
  getDefaultFitMode,
  getDefaultPagedLayout,
  getDefaultReaderMode,
  getEffectiveDefaultPagedLayout,
  getEffectiveDefaultReaderMode,
  getEffectiveFitMode,
} from "./settings";

export function setupViewportResize(
  s: ReaderSession,
  vpEl: HTMLElement,
  onResetOverscroll: () => void,
): () => void {
  const isLandscapeNow = (): boolean => {
    if (typeof screen !== "undefined" && screen.orientation?.type) {
      return screen.orientation.type.startsWith("landscape");
    }
    return typeof window !== "undefined" ? window.innerWidth > window.innerHeight : false;
  };

  let lastIsLandscape = isMobile() && isLandscapeNow();
  let resizeRaf: number | null = null;

  createResizeObserver(
    () => vpEl,
    () => {
      if (resizeRaf !== null) cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(() => {
        resizeRaf = null;
        onResetOverscroll();

        if (!s.isHorizontal()) {
          const vp = s.viewportEl;
          const curIdx = s.currentIndex();
          const anchorEl = s.slotEls[curIdx] || s.slotEls[0];
          const wasAtTop = !!vp && vp.scrollTop <= 2 && curIdx === 0;
          let offsetFromVpTop = 0;

          if (vp && anchorEl) {
            const vpRect = vp.getBoundingClientRect();
            const anchorRect = anchorEl.getBoundingClientRect();
            offsetFromVpTop = anchorRect.top - vpRect.top;
          }

          s.updateViewportHeight();

          if (vp && anchorEl && !wasAtTop) {
            const newVpRect = vp.getBoundingClientRect();
            const newAnchorRect = anchorEl.getBoundingClientRect();
            const currentOffset = newAnchorRect.top - newVpRect.top;
            const delta = currentOffset - offsetFromVpTop;
            if (Math.abs(delta) > 0.5) {
              vp.scrollTop += delta;
            }
          }
        } else {
          s.updateViewportHeight();
        }

        if (isMobile() && typeof window !== "undefined") {
          const currentIsLandscape = isLandscapeNow();
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

  const cleanup = () => {
    if (resizeRaf !== null) cancelAnimationFrame(resizeRaf);
  };
  s.onDispose(cleanup);

  window.setTimeout(() => {
    s.updateViewportHeight();
    s.applyLayoutMode();
  }, 0);

  return cleanup;
}
