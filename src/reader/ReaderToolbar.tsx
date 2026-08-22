/**
 * Reader toolbar: the sticky top/bottom navigation bars — chapter/page nav
 * buttons, the progress track, and the mode/fit/theme/fullscreen/scroll-lock/
 * zoom controls. Port of `reader-toolbar.ts`: reads session-derived state and
 * writes back through session control methods.
 */

import { createEffect, createSignal, Show, type Accessor } from "solid-js";
import { makeEventListener } from "@solid-primitives/event-listener";
import type { ReaderSession } from "./reader-session";
import type { FitMode } from "../types/reader";
import { theme, isMobile } from "../stores";
import { t } from "../i18n";
import { getReaderNavPosition, type ReaderNavPosition } from "./settings";
import { ToolIcon } from "../components/Icon";

interface NavRowProps {
  session: ReaderSession;
  controlsOpen?: Accessor<boolean>;
  onToggleControls?: () => void;
}

export function ReaderMainRow(props: NavRowProps) {
  const s = props.session;
  const [isNarrow, setIsNarrow] = createSignal(
    typeof window !== "undefined" ? window.matchMedia("(max-width: 580px)").matches : false,
  );

  if (typeof window !== "undefined") {
    const mq = window.matchMedia("(max-width: 580px)");
    makeEventListener(mq, "change", (e) => setIsNarrow(e.matches));
  }

  return (
    <div class="ds-reader-nav-row nav-main">
      <button
        type="button"
        class="win-button ds-nav-btn-ch"
        title={t("reader.toolbar.prevChapter")}
        disabled={s.chapterNav().prevDisabled}
        onClick={() => {
          const list = s.chapterList();
          const curIdx = list.findIndex((x) => x.permalink === s.permalink);
          if (curIdx > 0) s.gotoChapter(list[curIdx - 1]);
        }}
      >
        <i class="bi bi-chevron-double-left"></i><span class="ds-ch-btn-text"> Ch</span>
      </button>
      <button
        type="button"
        class="win-button ds-nav-btn-jump"
        title={t("reader.toolbar.firstPage")}
        onClick={() => s.setPage(0, true)}
      >
        <i class="bi bi-chevron-bar-left"></i>
      </button>
      <button
        type="button"
        class="win-button ds-nav-btn-page"
        title={t("reader.toolbar.prevPage")}
        disabled={s.progress().prevDisabled}
        onClick={() => (s.isSpread() ? s.stepSpread(-1) : s.setPage(s.currentIndex() - 1))}
      >
        <i class="bi bi-chevron-left"></i>
      </button>
      <div class="ds-reader-progress-wrap">
        <div class="ds-reader-progress-pill">
          <span class="ds-reader-progress-label" title={s.progress().title}>
            <span class="ds-prog-page-slot">
              <Show when={!isNarrow()}>
                <span class="ds-prog-prefix">Page </span>
              </Show>
              <span
                class="ds-prog-current"
                style={{
                  "min-width": `${s.progress().maxCurrentChars}ch`,
                }}
              >
                {s.progress().currentNumStr}
              </span>
              <span class="ds-prog-sep"> / </span>
              <span
                class="ds-prog-total"
                style={{
                  "min-width": `${s.progress().totalNumStr.length}ch`,
                }}
              >
                {s.progress().totalNumStr}
              </span>
            </span>
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
        class="win-button ds-nav-btn-page"
        title={t("reader.toolbar.nextPage")}
        disabled={s.progress().nextDisabled}
        onClick={() => (s.isSpread() ? s.stepSpread(1) : s.setPage(s.currentIndex() + 1))}
      >
        <i class="bi bi-chevron-right"></i>
      </button>
      <button
        type="button"
        class="win-button ds-nav-btn-jump"
        title={t("reader.toolbar.lastPage", { total: s.pages().length })}
        onClick={() => s.setPage(s.pages().length - 1, true)}
      >
        <i class="bi bi-chevron-bar-right"></i>
      </button>
      <button
        type="button"
        class="win-button ds-nav-btn-ch"
        title={t("reader.toolbar.nextChapter")}
        disabled={s.chapterNav().nextDisabled}
        onClick={() => {
          const list = s.chapterList();
          const curIdx = list.findIndex((x) => x.permalink === s.permalink);
          if (curIdx >= 0 && curIdx < list.length - 1) {
            s.gotoChapter(list[curIdx + 1]);
          }
        }}
      >
        <span class="ds-ch-btn-text">Ch </span><i class="bi bi-chevron-double-right"></i>
      </button>
      <Show when={isMobile()}>
        <button
          type="button"
          class="win-button ds-nav-btn-page"
          classList={{ active: props.controlsOpen?.() }}
          style={{ "margin-left": "auto" }}
          title="Toggle Reader Controls (Zoom, Fit, Layout)"
          onClick={props.onToggleControls}
        >
          <ToolIcon />
        </button>
      </Show>
    </div>
  );
}

export function ReaderControlsRow(props: NavRowProps) {
  const s = props.session;
  return (
    <div class="ds-reader-nav-row nav-controls">
      <button
        type="button"
        class="win-button ds-ctrl-btn"
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
              <span class="ds-ctrl-text"> Scroll Lock</span>
            </>
          }
        >
          <i class="bi bi-arrow-left-right"></i>
          <span class="ds-ctrl-text"> Scroll Smooth</span>
        </Show>
      </button>
      <button
        type="button"
        class="win-button ds-ctrl-btn"
        title="Toggle Horizontal / Vertical reading mode"
        onClick={() => s.setMode(s.mode() === "paged" ? "scroll" : "paged")}
      >
        <Show
          when={s.isHorizontal()}
          fallback={<i class="bi bi-arrow-left-right"></i>}
        >
          <i class="bi bi-distribute-vertical"></i>
        </Show>
        <Show when={s.isHorizontal()} fallback={<span class="ds-ctrl-text"> Paged</span>}>
          <span class="ds-ctrl-text"> Scroll</span>
        </Show>
      </button>
      <Show when={s.mode() === "paged"}>
        <button
          type="button"
          class="win-button ds-ctrl-btn"
          classList={{ primary: s.pagedLayout() === "spread" }}
          title={
            s.isLongStrip() && s.layoutAutoDetected()
              ? "Spread mode soft-disabled for Long Strip / Webtoon (click to force spread; M cycles)"
              : `Dual-page spread: ${s.pagedLayout() === "spread" ? "ON" : "OFF"} (M cycles)`
          }
          onClick={() => s.setPagedLayout(s.pagedLayout() === "spread" ? "single" : "spread")}
        >
          <i class="bi bi-columns-gap"></i>
          <span class="ds-ctrl-text"> Spread: {s.pagedLayout() === "spread" ? "ON" : "OFF"}</span>
        </button>
        <button
          type="button"
          class="win-button ds-ctrl-btn"
          classList={{ primary: !s.directionAutoDetected() }}
          title={
            s.directionAutoDetected()
              ? `Reading direction ${s.direction().toUpperCase()} (auto-detected from tags; D overrides)`
              : `Reading direction ${s.direction().toUpperCase()} (manual; D toggles)`
          }
          onClick={() => s.setDirection(s.direction() === "rtl" ? "ltr" : "rtl")}
        >
          <i class={`bi ${s.direction() === "rtl" ? "bi-arrow-left" : "bi-arrow-right"}`}></i>
          <span class="ds-ctrl-text"> {s.direction().toUpperCase()}</span>
        </button>
        <button
          type="button"
          class="win-button ds-ctrl-btn"
          classList={{ primary: s.coverOffset() }}
          title="Show the cover alone before pairing pages (C)"
          style={s.isSpread() ? undefined : "display:none;"}
          onClick={() => s.toggleCoverOffset()}
        >
          <i class="bi bi-book-half"></i>
          <span class="ds-ctrl-text"> Cover 1st: {s.coverOffset() ? "ON" : "OFF"}</span>
        </button>
      </Show>
      <select
        class="win-input ds-ctrl-fit-select"
        value={s.fitMode()}
        onChange={(ev) => s.setFitMode(ev.currentTarget.value as FitMode)}
      >
        <option value="width">{t("reader.toolbar.fitModes.width")}</option>
        <option value="height">{t("reader.toolbar.fitModes.height")}</option>
        <option value="original">{t("reader.toolbar.fitModes.original")}</option>
      </select>
      <button
        type="button"
        class="win-button ds-ctrl-btn"
        title={t("reader.toolbar.themeToggle")}
        onClick={() => s.toggleTheme()}
      >
        <Show when={theme() === "dark"} fallback={<i class="bi bi-sun"></i>}>
          <i class="bi bi-moon-fill"></i>
        </Show>
      </button>
      <button
        type="button"
        class="win-button ds-ctrl-btn"
        classList={{ primary: s.isFullscreen() }}
        title={t("reader.toolbar.fullscreen")}
        onClick={() => s.setFullscreen(!s.isFullscreen())}
      >
        <Show
          when={s.isFullscreen()}
          fallback={<i class="bi bi-arrows-fullscreen"></i>}
        >
          <i class="bi bi-fullscreen-exit"></i>
        </Show>
        <Show when={s.isFullscreen()} fallback={<span class="ds-ctrl-text"> Fullscreen</span>}>
          <span class="ds-ctrl-text"> Exit</span>
        </Show>
      </button>
      <div class="ds-ctrl-zoom-group" classList={{ "ds-zoom-disabled": s.fitMode() !== "original" }}>
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
          style="min-width:38px;padding:2px 4px;"
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
    </div>
  );
}

export function ReaderToolbar(props: { session: ReaderSession }) {
  const s = props.session;
  const [navPos, setNavPos] = createSignal<ReaderNavPosition>(getReaderNavPosition());
  const [controlsOpen, setControlsOpen] = createSignal(false);
  createEffect(() => {
    const z = s.zoomScale();
    if (s.containerEl) {
      s.containerEl.style.setProperty("--ds-zoom-scale", String(z));
    }
  });

  const onNavPosChange = (ev: Event): void => {
    const customEv = ev as CustomEvent<ReaderNavPosition>;
    setNavPos(customEv.detail || getReaderNavPosition());
  };
  makeEventListener(window, "ds-reader-nav-pos-change", onNavPosChange);

  const onFullscreenChange = (): void => {
    if (!document.fullscreenElement && s.isFullscreen()) {
      s.setFullscreen(false);
    } else {
      s.resetToCurrentPage(false);
    }
  };
  makeEventListener(document, "fullscreenchange", onFullscreenChange);

  return (
    <>
      <nav class="ds-reader-nav ds-reader-nav-top">
        <Show when={navPos() === "top"}>
          <ReaderMainRow
            session={s}
            controlsOpen={controlsOpen}
            onToggleControls={() => setControlsOpen((o) => !o)}
          />
          <Show when={!isMobile() || controlsOpen()}>
            <ReaderControlsRow session={s} />
          </Show>
        </Show>
        <Show when={navPos() === "bottom"}>
          <Show when={!isMobile() || controlsOpen()}>
            <ReaderControlsRow session={s} />
          </Show>
        </Show>
      </nav>
    </>
  );
}

export function ReaderBottomNav(props: { session: ReaderSession }) {
  const s = props.session;
  const [navPos, setNavPos] = createSignal<ReaderNavPosition>(getReaderNavPosition());
  const [controlsOpen, setControlsOpen] = createSignal(false);

  const onNavPosChange = (ev: Event): void => {
    const customEv = ev as CustomEvent<ReaderNavPosition>;
    setNavPos(customEv.detail || getReaderNavPosition());
  };
  makeEventListener(window, "ds-reader-nav-pos-change", onNavPosChange);

  return (
    <Show when={navPos() === "bottom"}>
      <nav class="ds-reader-nav ds-reader-nav-bottom">
        <ReaderMainRow
          session={s}
          controlsOpen={controlsOpen}
          onToggleControls={() => setControlsOpen((o) => !o)}
        />
        <Show when={controlsOpen()}>
          <ReaderControlsRow session={s} />
        </Show>
      </nav>
    </Show>
  );
}
