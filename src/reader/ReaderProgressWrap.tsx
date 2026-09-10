import { createSignal, createEffect, onMount, onCleanup, Show } from "solid-js";
import { makeEventListener } from "@solid-primitives/event-listener";
import type { ReaderSession } from "./reader-session";
import { t } from "../i18n";
import { CheckIcon } from "../components/Icon";

export interface ReaderProgressWrapProps {
  session: ReaderSession;
  showPrefix?: boolean;
  showCachedNote?: boolean;
}

export function ReaderProgressWrap(props: ReaderProgressWrapProps) {
  const s = props.session;
  const [editing, setEditing] = createSignal(false);
  const [inputVal, setInputVal] = createSignal("");
  let inputRef: HTMLInputElement | undefined;
  let pillRef: HTMLDivElement | undefined;
  let trackRef: HTMLDivElement | undefined;
  const [isScrubbing, setIsScrubbing] = createSignal(false);

  const calculatePageFromPointer = (e: PointerEvent): number => {
    if (!trackRef) return s.currentIndex();
    const rect = trackRef.getBoundingClientRect();
    if (rect.width <= 0) return s.currentIndex();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const total = s.pages().length;
    if (total <= 1) return 0;
    const isRtl = s.isHorizontal() && s.direction() === "rtl";
    const targetRatio = isRtl ? 1 - ratio : ratio;
    return Math.round(targetRatio * (total - 1));
  };

  const handleTrackPointerDown = (e: PointerEvent) => {
    if (editing() || s.pages().length <= 1) return;
    e.preventDefault();
    setIsScrubbing(true);
    trackRef?.setPointerCapture(e.pointerId);
    const targetPage = calculatePageFromPointer(e);
    s.setPage(targetPage, false);
  };

  const handleTrackPointerMove = (e: PointerEvent) => {
    if (!isScrubbing()) return;
    e.preventDefault();
    s.setPage(calculatePageFromPointer(e), false);
  };

  const handleTrackPointerUp = (e: PointerEvent) => {
    if (!isScrubbing()) return;
    setIsScrubbing(false);
    if (trackRef?.hasPointerCapture(e.pointerId)) {
      trackRef.releasePointerCapture(e.pointerId);
    }
    s.setPage(calculatePageFromPointer(e), true);
  };

  const totalPages = () => s.pages().length;

  const openEditor = () => {
    if (totalPages() <= 1) return;
    setInputVal(`${s.currentIndex() + 1}`);
    setEditing(true);
  };

  const startEditing = (e: MouseEvent | KeyboardEvent) => {
    e.stopPropagation();
    openEditor();
  };

  // Expose keyboard-driven page-jump focus to the session (QoL-R2).
  onMount(() => {
    s.pageJumpFocusHook = openEditor;
  });
  onCleanup(() => {
    if (s.pageJumpFocusHook === openEditor) s.pageJumpFocusHook = null;
  });

  createEffect(() => {
    if (editing() && inputRef) {
      inputRef.focus();
      inputRef.select();
    }
  });

  const commitJump = () => {
    const raw = inputVal().trim();
    if (!raw) {
      setEditing(false);
      return;
    }
    const target = parseInt(raw, 10);
    const total = totalPages();
    if (!isNaN(target) && target >= 1 && total > 0) {
      const clamped = Math.max(1, Math.min(target, total));
      s.setPage(clamped - 1, true);
    }
    setEditing(false);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === "Enter") {
      e.preventDefault();
      commitJump();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setEditing(false);
    }
  };

  const handleClickOutside = (e: MouseEvent) => {
    if (editing() && pillRef && !pillRef.contains(e.target as Node)) {
      commitJump();
    }
  };

  // Bound only while the page-jump editor is open so the document-level
  // listener does not fire on every click app-wide (RD-M2). makeEventListener
  // auto-removes on effect re-run / disposal.
  createEffect(() => {
    if (!editing() || typeof document === "undefined") return;
    makeEventListener(document, "mousedown", handleClickOutside);
  });

  const tooltip = () => {
    if (editing()) return "";
    return `${s.progress().title} (${t("reader.toolbar.jumpToPage")})`;
  };

  return (
    <div class="ds-reader-progress-wrap">
      <div
        ref={pillRef}
        class="ds-reader-progress-pill"
        classList={{ "ds-reader-progress-pill--editing": editing() }}
        title={tooltip()}
        tabIndex={editing() ? -1 : 0}
        role={editing() ? undefined : "button"}
        aria-label={t("reader.toolbar.jumpToPage")}
        onClick={(e) => {
          if (!editing()) startEditing(e);
        }}
        onKeyDown={(e) => {
          if (!editing() && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            startEditing(e);
          }
        }}
      >
        <Show
          when={editing()}
          fallback={
            <span class="ds-reader-progress-label">
              <span class="ds-prog-page-slot">
                <Show when={props.showPrefix ?? true}>
                  <span class="ds-prog-prefix">{t("reader.toolbar.pagePrefix")}</span>
                </Show>
                <span class="ds-prog-current">{s.progress().currentNumStr}</span>
                <span class="ds-prog-sep">/</span>
                <span class="ds-prog-total">{s.progress().totalNumStr}</span>
              </span>
              <span class="ds-prog-pct">({s.progress().pct}%)</span>
              <Show when={(props.showCachedNote ?? true) && s.progress().cachedNote !== ""}>
                <span class="ds-prog-cached-dot">·</span>
                <span class="ds-prog-cached">{s.progress().cachedNote}</span>
              </Show>
            </span>
          }
        >
          <form
            class="ds-prog-jump-form"
            onSubmit={(e) => {
              e.preventDefault();
              commitJump();
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <input
              ref={inputRef}
              type="text"
              inputmode="numeric"
              pattern="[0-9]*"
              class="ds-prog-jump-input"
              value={inputVal()}
              onInput={(e) => setInputVal(e.currentTarget.value)}
              onKeyDown={handleKeyDown}
              aria-label={t("reader.toolbar.jumpInputPlaceholder")}
              placeholder={`${s.currentIndex() + 1}`}
            />
            <span class="ds-prog-jump-sep">/</span>
            <span class="ds-prog-jump-total">{s.progress().totalNumStr}</span>
            <button
              type="submit"
              class="ds-prog-jump-btn"
              title={t("reader.toolbar.jumpSubmit")}
              aria-label={t("reader.toolbar.jumpSubmit")}
            >
              <CheckIcon size={12} />
            </button>
          </form>
        </Show>
      </div>
      <div
        ref={trackRef}
        class="ds-reader-progress-track"
        classList={{ "is-scrubbing": isScrubbing() }}
        title={t("reader.toolbar.scrubberTooltip")}
        role="slider"
        aria-label={t("reader.toolbar.jumpToPage")}
        aria-valuemin={1}
        aria-valuemax={s.pages().length}
        aria-valuenow={s.currentIndex() + 1}
        tabIndex={0}
        onPointerDown={handleTrackPointerDown}
        onPointerMove={handleTrackPointerMove}
        onPointerUp={handleTrackPointerUp}
        onPointerCancel={handleTrackPointerUp}
      >
        <div
          class="ds-reader-progress-fill"
          style={{
            width: "100%",
            transform: `scaleX(${s.progress().width / 100})`,
          }}
        />
      </div>
    </div>
  );
}
