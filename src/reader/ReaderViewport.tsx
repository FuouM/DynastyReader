/**
 * Reader viewport: the strip container + per-page slots (direct in scroll /
 * single-paged mode, wrapped into `.ds-spread-slot` slides in spread mode),
 * plus the IntersectionObserver preloader and HUD overlays.
 *
 * Touch & mouse gestures are delegated to `useReaderGestures.ts`.
 * Overscroll and Tap-zone HUDs are delegated to their dedicated components.
 */

import { createEffect, onCleanup, Show, type JSX } from "solid-js";
import type { ReaderSession } from "./reader-session";
import { convertFileSrc } from "../ipc";
import { spreadIndexOf } from "./reader-spread";
import { getPrefetchBuffer, isAutoCacheChapterEnabled } from "./settings";
import { useReaderGestures } from "./useReaderGestures";
import { ReaderOverscrollOverlay } from "./ReaderOverscrollOverlay";
import { ReaderTapZoneGuide } from "./ReaderTapZoneGuide";
import { ReaderDirectionHint } from "./ReaderDirectionHint";
export function ReaderViewport(props: { session: ReaderSession; children?: JSX.Element }) {
  const s = props.session;
  const { tapZoneGuide, overscrollGesture, directionHintTick } = useReaderGestures(s);

  // Pre-fetch pages as they near the viewport boundary across strip changes
  // (initial mount, layout toggles that rebuild the strip).
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
      { root: s.viewportEl ?? undefined, rootMargin: "800px 0px", threshold: 0.01 },
    );
    for (const el of s.slotEls) {
      if (el) observer.observe(el);
    }
    onCleanup(() => observer.disconnect());
    void stripKey;
  });

  // Warm next spreads' image cache on page turn (cached chapters only)
  createEffect(() => {
    const cur = s.currentIndex();
    const isSpread = s.isSpread();
    const spreads = s.spreads();
    const cached = s.cachedPages[0];
    // Track deps
    void cur; void isSpread; void spreads.length;
    const toWarm = new Set<number>();
    if (isSpread && spreads.length > 0) {
      const curSpread = spreadIndexOf(spreads, cur);
      for (const p of spreads[curSpread + 1]?.pageIndices ?? []) toWarm.add(p);
      for (const p of spreads[curSpread + 2]?.pageIndices ?? []) toWarm.add(p);
    } else {
      for (let i = cur + 1; i <= Math.min(s.pages().length - 1, cur + 4); i++) if (cached[i]) toWarm.add(i);
    }
    for (const idx of toWarm) {
      const p = cached[idx];
      if (!p || s.pageDimensions[0][idx]) continue;
      const img = new Image();
      img.src = convertFileSrc(p);
      if (img.complete && img.naturalWidth > 0) s.setPageDimension(idx, img.naturalWidth, img.naturalHeight);
      else img.onload = () => { if (!s.disposedFlag) s.setPageDimension(idx, img.naturalWidth, img.naturalHeight); };
    }
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
        {(g) => (
          <ReaderOverscrollOverlay
            gesture={g()}
            isHorizontal={s.isHorizontal()}
            readingDirection={s.direction()}
            currentPermalink={s.permalink}
          />
        )}
      </Show>

      <Show when={tapZoneGuide()}>
        {(guide) => (
          <ReaderTapZoneGuide
            guide={guide()}
            readingDirection={s.direction()}
          />
        )}
      </Show>

      <ReaderDirectionHint
        isHorizontal={s.isHorizontal()}
        readingDirection={s.direction()}
        pageIndex={s.currentIndex()}
        permalink={s.permalink}
        triggerTick={directionHintTick()}
      />
    </div>
  );
}
