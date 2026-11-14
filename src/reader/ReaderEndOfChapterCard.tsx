/**
 * End-of-chapter transition card displayed at the bottom of the reader strip.
 * Offers intuitive next-chapter progression or return-to-series navigation.
 */

import { createSignal, createMemo, Show, onCleanup } from "solid-js";
import type { ReaderSession } from "./reader-session";
import { decodeEntities } from "../utils/formatting";
import { t } from "../i18n";
import { navigate } from "../stores/router";
import { triggerHaptic } from "../utils/haptics";
import { CheckIcon, ArrowRightIcon, ArrowLeftIcon, BookmarkIcon } from "../components/icons";
import { Icon } from "soulwindow/solid";
export function ReaderEndOfChapterCard(props: { session: ReaderSession }) {
  const s = props.session;
  const nextChapter = createMemo(() => {
    if (s.chapterNav().nextDisabled) return null;
    return s.adjacentChapters().nextCh;
  });
  const prevChapter = createMemo(() => {
    if (s.chapterNav().prevDisabled) return null;
    return s.adjacentChapters().prevCh;
  });
  const SWIPE_THRESHOLD_PX = 55;
  const SWIPE_RESET_THRESHOLD_PX = 45;
  type SwipeReady = "none" | "left" | "right";
  const [swipeReady, setSwipeReady] = createSignal<SwipeReady>("none");
  let boundaryVibrated: SwipeReady = "none";
  let cardRef: HTMLDivElement | undefined;
  let activeTouchId: number | null = null;
  let isMouseActive = false;
  let startX = 0;
  let startY = 0;
  let startTime = 0;
  let isSwiping = false;
  let currentOffset = 0;
  let lastReady: SwipeReady = "none";

  const resetCardPosition = (animated = true) => {
    if (!cardRef) return;
    cardRef.style.transition = animated ? "transform 0.22s cubic-bezier(0.16, 1, 0.3, 1)" : "none";
    cardRef.style.transform = "translate3d(0, 0, 0)";
  };

  const beginDrag = (x: number, y: number): void => {
    resetCardPosition(false);
    startX = x;
    startY = y;
    startTime = Date.now();
    isSwiping = false;
    currentOffset = 0;
    lastReady = "none";
    boundaryVibrated = "none";
    setSwipeReady("none");
  };

  const dragMove = (x: number, y: number, ev: Event): void => {
    const dx = x - startX;
    const dy = y - startY;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    if (!isSwiping) {
      if (absX > 8 && absX > absY * 1.1) {
        isSwiping = true;
        if (cardRef) cardRef.style.transition = "none";
      } else if (absY > 8 && absY >= absX) {
        // Vertical scroll dominant: allow native page scroll without horizontal card interference
        return;
      }
    }
    if (!isSwiping) return;

    if (ev.cancelable) ev.preventDefault();
    ev.stopPropagation();

    let clamped = 0;
    let newReady: SwipeReady = "none";
    if (dx > 0) {
      // Swipe right -> Previous chapter (if available) or Series / Browse
      clamped = Math.min(dx, 120);
      if (clamped >= SWIPE_THRESHOLD_PX || (lastReady === "right" && clamped >= SWIPE_RESET_THRESHOLD_PX)) {
        newReady = "right";
      }
    } else if (dx < 0) {
      // Swipe left -> Next chapter
      const canNext = nextChapter() !== null;
      clamped = canNext ? Math.max(dx, -120) : Math.max(dx * 0.25, -40);
      if (canNext && (clamped <= -SWIPE_THRESHOLD_PX || (lastReady === "left" && clamped <= -SWIPE_RESET_THRESHOLD_PX))) {
        newReady = "left";
      } else if (!canNext && clamped <= -35) {
        if (boundaryVibrated !== "left") {
          triggerHaptic("snap");
          boundaryVibrated = "left";
        }
      } else if (clamped > -20) {
        boundaryVibrated = "none";
      }
    }

    currentOffset = clamped;
    if (cardRef) {
      cardRef.style.transform = `translate3d(${clamped}px, 0, 0)`;
    }

    if (newReady !== lastReady) {
      lastReady = newReady;
      setSwipeReady(newReady);
      if (newReady !== "none") {
        triggerHaptic("snap");
      }
    }
  };

  const finishDrag = (ev: Event): void => {
    const wasSwiping = isSwiping;
    isSwiping = false;
    const offset = currentOffset;
    const dt = Date.now() - startTime;
    const ready = lastReady;
    currentOffset = 0;
    lastReady = "none";
    setSwipeReady("none");

    resetCardPosition(true);

    if (!wasSwiping) return;
    ev.stopPropagation();

    // Swipe left -> Next chapter
    if ((ready === "left" || (offset <= -35 && dt < 300)) && nextChapter()) {
      triggerHaptic("confirm");
      s.gotoNextChapter();
      return;
    }

    // Swipe right -> Previous chapter (if available) or Series / Browse
    if (ready === "right" || (offset >= 35 && dt < 300)) {
      triggerHaptic("confirm");
      if (prevChapter()) {
        s.gotoPrevChapter();
      } else if (s.seriesPermalink()) {
        s.gotoSeries();
      } else {
        navigate({ view: "browse" });
      }
    }
  };

  const handleTouchStart = (ev: TouchEvent) => {
    if ((ev.target as HTMLElement)?.closest("button, a, input, select, textarea")) return;
    ev.stopPropagation();
    const t0 = ev.changedTouches[0];
    if (!t0) return;
    beginDrag(t0.clientX, t0.clientY);
    activeTouchId = t0.identifier;
  };

  const handleTouchMove = (ev: TouchEvent) => {
    if (activeTouchId === null) return;
    const t = Array.from(ev.touches).find((touch) => touch.identifier === activeTouchId);
    if (t) dragMove(t.clientX, t.clientY, ev);
  };

  const handleTouchEnd = (ev: TouchEvent) => {
    if (activeTouchId === null) return;
    const t = Array.from(ev.changedTouches).find((touch) => touch.identifier === activeTouchId);
    if (!t && ev.touches.length > 0) return;
    activeTouchId = null;
    finishDrag(ev);
  };

  const handleTouchCancel = () => {
    activeTouchId = null;
    isSwiping = false;
    currentOffset = 0;
    lastReady = "none";
    boundaryVibrated = "none";
    setSwipeReady("none");
    resetCardPosition(true);
  };

  const handleMouseDown = (ev: MouseEvent) => {
    if (ev.button !== 0) return;
    if ((ev.target as HTMLElement)?.closest("button, a, input, select, textarea")) return;
    ev.stopPropagation();
    beginDrag(ev.clientX, ev.clientY);
    isMouseActive = true;
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  const handleMouseMove = (ev: MouseEvent) => {
    if (isMouseActive) dragMove(ev.clientX, ev.clientY, ev);
  };

  const handleMouseUp = (ev: MouseEvent) => {
    if (!isMouseActive) return;
    isMouseActive = false;
    window.removeEventListener("mousemove", handleMouseMove);
    window.removeEventListener("mouseup", handleMouseUp);
    finishDrag(ev);
  };

  onCleanup(() => {
    window.removeEventListener("mousemove", handleMouseMove);
    window.removeEventListener("mouseup", handleMouseUp);
  });

  return (
    <div
      ref={cardRef}
      class="ds-chapter-end-card"
      classList={{
        "ds-chapter-end-card--ready-left": swipeReady() === "left",
        "ds-chapter-end-card--ready-right": swipeReady() === "right",
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
      onMouseDown={handleMouseDown}

    >
      <div class="ds-chapter-end-badge">
        <span class="ds-chapter-end-icon">
          <CheckIcon size={16} />
        </span>
        <span class="ds-chapter-end-status">{t("reader.endOfChapterCard.title")}</span>
      </div>

      <div class="ds-chapter-end-current">
        {decodeEntities(s.chapterTitle() || s.permalink)}
      </div>

      <Show when={s.chapterList().length > 0 && !s.loading() && !s.chapterNavigating()}>
        <Show
          when={nextChapter()}
          fallback={
            <div class="ds-chapter-end-caughtup ds-muted">
              <Icon name="bookmark-check" />
              <span>{t("reader.endOfChapterCard.seriesCaughtUp")}</span>
            </div>
          }
        >
          {(next) => (
            <div class="ds-chapter-end-next-box">
              <div class="ds-chapter-end-next-label">
                {t("reader.endOfChapterCard.nextPrompt", {
                  title: decodeEntities(next().title || next().permalink),
                })}
              </div>
              <button
                type="button"
                class="win-button primary ds-chapter-end-primary-btn"
                onClick={() => s.gotoNextChapter()}
              >
                <span>{t("reader.endOfChapterCard.readNextButton")}</span>
                <ArrowRightIcon />
              </button>
            </div>
          )}
        </Show>
      </Show>
      <div class="ds-chapter-end-actions">
        <Show when={prevChapter()}>
          {(prev) => (
            <button
              type="button"
              class="win-button ds-chapter-end-prev-btn"
              onClick={() => s.gotoPrevChapter()}
              title={decodeEntities(prev().title || prev().permalink)}
            >
              <ArrowLeftIcon />
              <span class="ds-chapter-end-prev-label">{t("reader.endOfChapterCard.prevChapter")}:</span>
              <span class="ds-chapter-end-prev-title">{decodeEntities(prev().title || prev().permalink)}</span>
            </button>
          )}
        </Show>
        <Show when={s.seriesPermalink()}>
          <button
            type="button"
            class="win-button ds-chapter-end-series-btn"
            onClick={() => s.gotoSeries()}
          >
            <ArrowLeftIcon />
            <span>{t("reader.endOfChapterCard.backToSeries")}</span>
          </button>
        </Show>
        <button
          type="button"
          class={`win-button ds-chapter-end-bookmark-btn${s.bookmarked() ? " primary" : ""}`}
          onClick={() => void s.toggleBookmark()}
          title={s.bookmarked() ? t("reader.toolbar.removeBookmark") : t("reader.toolbar.bookmarkChapter")}
        >
          <BookmarkIcon filled={s.bookmarked()} />
          <span>{s.bookmarked() ? t("browse.feed.saved") : t("browse.feed.readLater")}</span>
        </button>
        <button
          type="button"
          class="win-button ds-chapter-end-browse-btn"
          onClick={() => navigate({ view: "browse" })}
          title={t("reader.endOfChapterCard.swipeRightBrowse")}
        >
          <Icon name="compass" />
          <span>{t("reader.endOfChapterCard.browseButton")}</span>
        </button>
      </div>
      <div class="ds-chapter-end-swipe-hint ds-muted">
        <Show
          when={prevChapter()}
          fallback={
            <span>
              {t("reader.endOfChapterCard.swipeRightBrowse")} <Icon name="arrow-right" />
            </span>
          }
        >
          <span>
            <Icon name="arrow-right" /> {t("reader.endOfChapterCard.swipeRightPrev")}
          </span>
        </Show>
        <Show when={nextChapter()}>
          <span>·</span>
          <span>
            <Icon name="arrow-left" /> {t("reader.endOfChapterCard.swipeLeftNext")}
          </span>
        </Show>
      </div>
    </div>
  );
}
