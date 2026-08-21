/**
 * Reader toolbar: the sticky top/bottom navigation bars — chapter/page nav
 * buttons, the progress track, and the mode/fit/theme/fullscreen/scroll-lock/
 * zoom controls. Port of `reader-toolbar.ts`: reads session-derived state and
 * writes back through session control methods.
 */

import { createEffect, createSignal, onCleanup, onMount, Show } from "solid-js";
import type { ReaderSession } from "./reader-session";
import type { FitMode } from "../types/reader";
import { theme } from "../stores";
import { getReaderNavPosition, type ReaderNavPosition } from "./settings";

interface NavRowProps {
  session: ReaderSession;
}

export function ReaderMainRow(props: NavRowProps) {
  const s = props.session;
  return (
    <div class="ds-reader-nav-row nav-main">
      <button
        type="button"
        class="win-button"
        title="Previous Chapter"
        disabled={s.chapterNav().prevDisabled}
        onClick={() => {
          const list = s.chapterList();
          const curIdx = list.findIndex((x) => x.permalink === s.permalink);
          if (curIdx > 0) s.gotoChapter(list[curIdx - 1]);
        }}
      >
        <i class="bi bi-chevron-double-left"></i> Ch
      </button>
      <button type="button" class="win-button" title="Jump to First Page" onClick={() => s.setPage(0, true)}>
        <i class="bi bi-chevron-double-left"></i>
      </button>
      <button
        type="button"
        class="win-button"
        title="Previous Page (Left Arrow)"
        disabled={s.progress().prevDisabled}
        onClick={() => (s.isSpread() ? s.stepSpread(-1) : s.setPage(s.currentIndex() - 1))}
      >
        <i class="bi bi-chevron-left"></i>
      </button>
      <div class="ds-reader-progress-wrap">
        <div class="ds-reader-progress-pill">
          <span class="ds-reader-progress-label" title={s.progress().title}>
            <span class="ds-prog-full">{s.progress().full}</span>
            <span class="ds-prog-short">{s.progress().short}</span>
            <span class="ds-prog-pct">({s.progress().pct}%)</span>
            <Show when={s.progress().cachedNote !== ""}>
              <span class="ds-prog-cached-dot">·</span>
              <span class="ds-prog-cached">{s.progress().cachedNote}</span>
            </Show>
          </span>
        </div>
        <div class="ds-reader-progress-track">
          <div class="ds-reader-progress-fill" style={{ width: `${s.progress().width}%` }}></div>
        </div>
      </div>
      <button
        type="button"
        class="win-button"
        title="Next Page (Right Arrow / Space)"
        disabled={s.progress().nextDisabled}
        onClick={() => (s.isSpread() ? s.stepSpread(1) : s.setPage(s.currentIndex() + 1))}
      >
        <i class="bi bi-chevron-right"></i>
      </button>
      <button
        type="button"
        class="win-button"
        title="Jump to Last Page"
        onClick={() => s.setPage(s.pages().length - 1, true)}
      >
        <i class="bi bi-chevron-double-right"></i>
      </button>
      <button
        type="button"
        class="win-button"
        title="Next Chapter"
        disabled={s.chapterNav().nextDisabled}
        onClick={() => {
          const list = s.chapterList();
          const curIdx = list.findIndex((x) => x.permalink === s.permalink);
          if (curIdx >= 0 && curIdx < list.length - 1) {
            s.gotoChapter(list[curIdx + 1]);
          }
        }}
      >
        Ch <i class="bi bi-chevron-double-right"></i>
      </button>
    </div>
  );
}

export function ReaderControlsRow(props: NavRowProps) {
  const s = props.session;
  return (
    <div class="ds-reader-nav-row nav-controls">
      <button
        type="button"
        class="win-button"
        classList={{ primary: s.scrollLock() }}
        title={
          s.isHorizontal()
            ? s.scrollLock()
              ? "Scroll Animation: Instant slide (click for smooth)"
              : "Scroll Animation: Smooth slide (click for instant)"
            : "Scroll Lock: mouse wheel flips exactly one page at a time"
        }
        onClick={() => s.setScrollLock()}
      >
        <Show
          when={s.isHorizontal()}
          fallback={
            <>
              <i class={s.scrollLock() ? "bi bi-lock-fill" : "bi bi-unlock"}></i>
              <span> Scroll Lock</span>
            </>
          }
        >
          <i class="bi bi-arrow-left-right"></i>
          <span> Scroll Smooth</span>
        </Show>
      </button>
      <button
        type="button"
        class="win-button"
        title="Toggle Horizontal / Vertical reading mode"
        onClick={() => s.setMode(s.mode() === "paged" ? "scroll" : "paged")}
      >
        <Show
          when={s.isHorizontal()}
          fallback={<i class="bi bi-arrow-left-right"></i>}
        >
          <i class="bi bi-distribute-vertical"></i>
        </Show>
        <Show when={s.isHorizontal()} fallback={<span> Paged</span>}>
          <span> Scroll</span>
        </Show>
      </button>
      <Show when={s.mode() === "paged"}>
        <button
          type="button"
          class="win-button"
          classList={{ primary: s.pagedLayout() === "spread" }}
          title="Pair two pages per slide in Paged mode (M cycles)"
          onClick={() => s.setPagedLayout(s.pagedLayout() === "spread" ? "single" : "spread")}
        >
          <i class="bi bi-columns-gap"></i> Spread: {s.pagedLayout() === "spread" ? "ON" : "OFF"}
        </button>
        <button
          type="button"
          class="win-button"
          classList={{ primary: !s.directionAutoDetected() }}
          title={
            s.directionAutoDetected()
              ? `Reading direction ${s.direction().toUpperCase()} (auto-detected from tags; D overrides)`
              : `Reading direction ${s.direction().toUpperCase()} (manual; D toggles)`
          }
          onClick={() => s.setDirection(s.direction() === "rtl" ? "ltr" : "rtl")}
        >
          <i class={`bi ${s.direction() === "rtl" ? "bi-arrow-left" : "bi-arrow-right"}`}></i>{" "}
          {s.direction().toUpperCase()}
        </button>
        <button
          type="button"
          class="win-button"
          classList={{ primary: s.coverOffset() }}
          title="Show the cover alone before pairing pages (C)"
          style={s.isSpread() ? undefined : "display:none;"}
          onClick={() => s.toggleCoverOffset()}
        >
          <i class="bi bi-book-half"></i> Cover 1st: {s.coverOffset() ? "ON" : "OFF"}
        </button>
      </Show>
      <select
        class="win-input"
        value={s.fitMode()}
        onChange={(ev) => s.setFitMode(ev.currentTarget.value as FitMode)}
      >
        <option value="width">Fit Width</option>
        <option value="height">Fit Height</option>
        <option value="original">Original Size</option>
      </select>
      <button
        type="button"
        class="win-button"
        title="Toggle Light / Dark Theme (T)"
        onClick={() => s.toggleTheme()}
      >
        <Show when={theme() === "dark"} fallback={<i class="bi bi-sun"></i>}>
          <i class="bi bi-moon-fill"></i>
        </Show>
      </button>
      <button
        type="button"
        class="win-button"
        classList={{ primary: s.isFullscreen() }}
        title={s.isFullscreen() ? "Exit Fullscreen (Esc / F)" : "Toggle Fullscreen (F)"}
        onClick={() => s.setFullscreen(!s.isFullscreen())}
      >
        <Show
          when={s.isFullscreen()}
          fallback={<i class="bi bi-arrows-fullscreen"></i>}
        >
          <i class="bi bi-fullscreen-exit"></i>
        </Show>
        <Show when={s.isFullscreen()} fallback={<span> Fullscreen</span>}>
          <span> Exit</span>
        </Show>
      </button>
      <button
        type="button"
        class="win-button"
        title={
          s.fitMode() !== "original"
            ? "Zoom disabled when Fit mode is active (set to Original Size to zoom)"
            : "Zoom Out (Ctrl - / -)"
        }
        disabled={s.fitMode() !== "original" || s.zoomScale() <= 0.25}
        onClick={() => s.zoomOut()}
      >
        <i class="bi bi-dash-lg"></i>
      </button>
      <button
        type="button"
        class="win-button"
        style="min-width:44px;"
        title={s.fitMode() !== "original" ? "Zoom disabled when Fit mode is active" : "Reset Zoom (Ctrl 0)"}
        disabled={s.fitMode() !== "original"}
        onClick={() => s.resetZoom()}
      >
        {Math.round(s.zoomScale() * 100)}%
      </button>
      <button
        type="button"
        class="win-button"
        title={
          s.fitMode() !== "original"
            ? "Zoom disabled when Fit mode is active (set to Original Size to zoom)"
            : "Zoom In (Ctrl + / +)"
        }
        disabled={s.fitMode() !== "original" || s.zoomScale() >= 3.0}
        onClick={() => s.zoomIn()}
      >
        <i class="bi bi-plus-lg"></i>
      </button>
    </div>
  );
}

export function ReaderToolbar(props: { session: ReaderSession }) {
  const s = props.session;
  const [navPos, setNavPos] = createSignal<ReaderNavPosition>(getReaderNavPosition());

  // Zoom CSS variable follows the zoom scale.
  createEffect(() => {
    const z = s.zoomScale();
    if (s.containerEl) {
      s.containerEl.style.setProperty("--ds-zoom-scale", String(z));
    }
  });

  onMount(() => {
    const onNavPosChange = (ev: Event): void => {
      const customEv = ev as CustomEvent<ReaderNavPosition>;
      setNavPos(customEv.detail || getReaderNavPosition());
    };
    window.addEventListener("ds-reader-nav-pos-change", onNavPosChange);

    const onFullscreenChange = (): void => {
      if (!document.fullscreenElement && s.isFullscreen()) {
        s.setFullscreen(false);
      } else {
        s.resetToCurrentPage(false);
      }
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);

    onCleanup(() => {
      window.removeEventListener("ds-reader-nav-pos-change", onNavPosChange);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      if (document.fullscreenElement) {
        void document.exitFullscreen().catch(() => {});
      }
    });
  });

  return (
    <>
      <nav class="ds-reader-nav ds-reader-nav-top">
        <Show when={navPos() === "top"}>
          <ReaderMainRow session={s} />
          <ReaderControlsRow session={s} />
        </Show>
        <Show when={navPos() === "bottom"}>
          <ReaderControlsRow session={s} />
        </Show>
      </nav>
    </>
  );
}

export function ReaderBottomNav(props: { session: ReaderSession }) {
  const s = props.session;
  const [navPos, setNavPos] = createSignal<ReaderNavPosition>(getReaderNavPosition());

  onMount(() => {
    const onNavPosChange = (ev: Event): void => {
      const customEv = ev as CustomEvent<ReaderNavPosition>;
      setNavPos(customEv.detail || getReaderNavPosition());
    };
    window.addEventListener("ds-reader-nav-pos-change", onNavPosChange);
    onCleanup(() => window.removeEventListener("ds-reader-nav-pos-change", onNavPosChange));
  });

  return (
    <Show when={navPos() === "bottom"}>
      <nav class="ds-reader-nav ds-reader-nav-bottom">
        <ReaderMainRow session={s} />
      </nav>
    </Show>
  );
}
