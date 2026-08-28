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
import { getPrefetchBuffer, isAutoCacheChapterEnabled } from "./settings";
import { useReaderGestures } from "./useReaderGestures";
import { ReaderOverscrollOverlay } from "./ReaderOverscrollOverlay";
import { ReaderTapZoneGuide } from "./ReaderTapZoneGuide";

export function ReaderViewport(props: { session: ReaderSession; children?: JSX.Element }) {
  const s = props.session;
  const { tapZoneGuide, overscrollGesture } = useReaderGestures(s);

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
    </div>
  );
}
