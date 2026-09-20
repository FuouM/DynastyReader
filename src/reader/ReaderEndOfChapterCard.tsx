/**
 * End-of-chapter transition card displayed at the bottom of the reader strip.
 * Offers intuitive next-chapter progression or return-to-series navigation.
 */

import { createSignal, createMemo, Show } from "solid-js";
import type { ReaderSession } from "./reader-session";
import { getAdjacentChapters } from "./reader-spread";
import { decodeEntities } from "../utils/formatting";
import { t } from "../i18n";
import { navigate } from "../stores/router";
import { triggerHaptic } from "../utils/haptics";
import { CheckIcon, ArrowRightIcon, ArrowLeftIcon, Icon } from "../components/Icon";
export function ReaderEndOfChapterCard(props: { session: ReaderSession }) {
  const s = props.session;
  const nextChapter = createMemo(() => {
    if (s.chapterNav().nextDisabled) return null;
    return getAdjacentChapters(s.chapterList(), s.permalink, s.chapterTitle()).nextCh;
  });
  const prevChapter = createMemo(() => {
    if (s.chapterNav().prevDisabled) return null;
    return getAdjacentChapters(s.chapterList(), s.permalink, s.chapterTitle()).prevCh;
  });
  const SWIPE_THRESHOLD_PX = 55;
  const SWIPE_RESET_THRESHOLD_PX = 45;
  const [swipeReady, setSwipeReady] = createSignal<"none" | "left" | "right">("none");
  let boundaryVibrated: "none" | "left" | "right" = "none";
  let cardRef: HTMLDivElement | undefined;
  let activeTouchId: number | null = null;
  let touchStartX = 0;
  let touchStartY = 0;
  let touchStartTime = 0;
  let isSwiping = false;
  let currentOffset = 0;
  let lastReady: "none" | "left" | "right" = "none";

  const resetCardPosition = (animated = true) => {
    if (!cardRef) return;
    if (animated) {
      cardRef.style.transition = "transform 0.22s cubic-bezier(0.16, 1, 0.3, 1)";
      cardRef.style.transform = "translate3d(0, 0, 0)";
    } else {
      cardRef.style.transition = "none";
      cardRef.style.transform = "translate3d(0, 0, 0)";
    }
  };

  let isMouseActive = false;

  const handleTouchStart = (ev: TouchEvent) => {
    if ((ev.target as HTMLElement)?.closest("button, a, input, select, textarea")) return;
    ev.stopPropagation();
    const t0 = ev.changedTouches[0];
    if (!t0) return;

    resetCardPosition(false);
    activeTouchId = t0.identifier;
    touchStartX = t0.clientX;
    touchStartY = t0.clientY;
    touchStartTime = Date.now();
    isSwiping = false;
    currentOffset = 0;
    lastReady = "none";
    boundaryVibrated = "none";
    setSwipeReady("none");
  };

  const handleMouseDown = (ev: MouseEvent) => {
    if (ev.button !== 0) return;
    if ((ev.target as HTMLElement)?.closest("button, a, input, select, textarea")) return;
    ev.stopPropagation();
    resetCardPosition(false);
    isMouseActive = true;
    touchStartX = ev.clientX;
    touchStartY = ev.clientY;
    touchStartTime = Date.now();
    isSwiping = false;
    currentOffset = 0;
    lastReady = "none";
    boundaryVibrated = "none";
    setSwipeReady("none");
  };

  const handleTouchMove = (ev: TouchEvent) => {
    if (activeTouchId === null) return;
    const t = Array.from(ev.touches).find((touch) => touch.identifier === activeTouchId);
    if (!t) return;

    const dx = t.clientX - touchStartX;
    const dy = t.clientY - touchStartY;
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

    if (isSwiping) {
      if (ev.cancelable) ev.preventDefault();
      ev.stopPropagation();

      let clamped = 0;
      let newReady: "none" | "left" | "right" = "none";

      if (dx > 0) {
        // Swipe right -> Previous chapter (if available) or Series / Browse
        const canPrev = Boolean(prevChapter() && !s.chapterNav().prevDisabled);
        clamped = canPrev ? Math.min(dx, 120) : Math.min(dx * 0.25, 40);
        if (canPrev && clamped >= SWIPE_THRESHOLD_PX) {
          newReady = "right";
        } else if (canPrev && lastReady === "right" && clamped >= SWIPE_RESET_THRESHOLD_PX) {
          newReady = "right";
        } else if (!canPrev && clamped >= 35) {
          newReady = "none";
          if (boundaryVibrated !== "right") {
            triggerHaptic("snap");
            boundaryVibrated = "right";
          }
        } else {
          newReady = "none";
          if (clamped < 20) boundaryVibrated = "none";
        }
      } else if (dx < 0) {
        // Swipe left -> Next chapter
        const canNext = Boolean(nextChapter() && !s.chapterNav().nextDisabled);
        clamped = canNext ? Math.max(dx, -120) : Math.max(dx * 0.25, -40);
        if (canNext && clamped <= -SWIPE_THRESHOLD_PX) {
          newReady = "left";
        } else if (canNext && lastReady === "left" && clamped <= -SWIPE_RESET_THRESHOLD_PX) {
          newReady = "left";
        } else if (!canNext && clamped <= -35) {
          newReady = "none";
          if (boundaryVibrated !== "left") {
            triggerHaptic("snap");
            boundaryVibrated = "left";
          }
        } else {
          newReady = "none";
          if (clamped > -20) boundaryVibrated = "none";
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
    }
  };

  const handleTouchEnd = (ev: TouchEvent) => {
    if (activeTouchId === null) return;
    const t = Array.from(ev.changedTouches).find((touch) => touch.identifier === activeTouchId);
    if (!t && ev.touches.length > 0) return;

    activeTouchId = null;
    const wasSwiping = isSwiping;
    isSwiping = false;
    const offset = currentOffset;
    const dt = Date.now() - touchStartTime;
    const ready = lastReady;
    currentOffset = 0;
    lastReady = "none";
    setSwipeReady("none");

    resetCardPosition(true);

    if (wasSwiping) {
      ev.stopPropagation();

      // Swipe left -> Next chapter
      if (ready === "left" || (offset <= -35 && dt < 300)) {
        if (nextChapter() && !s.chapterNav().nextDisabled) {
          triggerHaptic("confirm");
          s.gotoNextChapter();
          return;
        }
      }

      // Swipe right -> Previous chapter (if available) or Series / Browse
      if (ready === "right" || (offset >= 35 && dt < 300)) {
        if (prevChapter() && !s.chapterNav().prevDisabled) {
          triggerHaptic("confirm");
          s.gotoPrevChapter();
          return;
        }
        triggerHaptic("confirm");
        if (s.seriesPermalink()) {
          s.gotoSeries();
        } else {
          navigate({ view: "browse" });
        }
        return;
      }
    }
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
  const handleMouseMove = (ev: MouseEvent) => {
    if (!isMouseActive) return;
    const dx = ev.clientX - touchStartX;
    const dy = ev.clientY - touchStartY;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    if (!isSwiping) {
      if (absX > 8 && absX > absY * 1.1) {
        isSwiping = true;
        if (cardRef) cardRef.style.transition = "none";
      } else if (absY > 8 && absY >= absX) {
        return;
      }
    }

    if (isSwiping) {
      ev.preventDefault();
      ev.stopPropagation();

      let clamped = 0;
      let newReady: "none" | "left" | "right" = "none";

      if (dx > 0) {
        const canPrev = Boolean(prevChapter() && !s.chapterNav().prevDisabled);
        clamped = canPrev ? Math.min(dx, 120) : Math.min(dx * 0.25, 40);
        if (canPrev && clamped >= SWIPE_THRESHOLD_PX) {
          newReady = "right";
        } else if (canPrev && lastReady === "right" && clamped >= SWIPE_RESET_THRESHOLD_PX) {
          newReady = "right";
        } else if (!canPrev && clamped >= 35) {
          newReady = "none";
          if (boundaryVibrated !== "right") {
            triggerHaptic("snap");
            boundaryVibrated = "right";
          }
        } else {
          newReady = "none";
          if (clamped < 20) boundaryVibrated = "none";
        }
      } else if (dx < 0) {
        const canNext = Boolean(nextChapter() && !s.chapterNav().nextDisabled);
        clamped = canNext ? Math.max(dx, -120) : Math.max(dx * 0.25, -40);
        if (canNext && clamped <= -SWIPE_THRESHOLD_PX) {
          newReady = "left";
        } else if (canNext && lastReady === "left" && clamped <= -SWIPE_RESET_THRESHOLD_PX) {
          newReady = "left";
        } else if (!canNext && clamped <= -35) {
          newReady = "none";
          if (boundaryVibrated !== "left") {
            triggerHaptic("snap");
            boundaryVibrated = "left";
          }
        } else {
          newReady = "none";
          if (clamped > -20) boundaryVibrated = "none";
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
    }
  };

  const handleMouseUp = (ev: MouseEvent) => {
    if (!isMouseActive) return;
    isMouseActive = false;
    const wasSwiping = isSwiping;
    isSwiping = false;
    const offset = currentOffset;
    const dt = Date.now() - touchStartTime;
    const ready = lastReady;
    currentOffset = 0;
    lastReady = "none";
    setSwipeReady("none");

    resetCardPosition(true);

    if (wasSwiping) {
      ev.stopPropagation();

      if (ready === "left" || (offset <= -35 && dt < 300)) {
        if (nextChapter() && !s.chapterNav().nextDisabled) {
          triggerHaptic("confirm");
          s.gotoNextChapter();
          return;
        }
      }

      if (ready === "right" || (offset >= 35 && dt < 300)) {
        if (prevChapter() && !s.chapterNav().prevDisabled) {
          triggerHaptic("confirm");
          s.gotoPrevChapter();
          return;
        }
        triggerHaptic("confirm");
        if (s.seriesPermalink()) {
          s.gotoSeries();
        } else {
          navigate({ view: "browse" });
        }
        return;
      }
    }
  };

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
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
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
        <Show when={prevChapter() && !s.chapterNav().prevDisabled}>
          <button
            type="button"
            class="win-button ds-chapter-end-prev-btn"
            onClick={() => s.gotoPrevChapter()}
            title={t("reader.endOfChapterCard.swipeRightPrev")}
          >
            <ArrowLeftIcon />
            <span>{t("reader.endOfChapterCard.prevChapter")}</span>
          </button>
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
          class="win-button ds-chapter-end-browse-btn"
          onClick={() => navigate({ view: "browse" })}
          title={t("reader.endOfChapterCard.swipeRightBrowse")}
        >
          <Icon name="compass" />
          <span>Browse</span>
        </button>
      </div>
      <div class="ds-chapter-end-swipe-hint ds-muted">
        <Show
          when={prevChapter() && !s.chapterNav().prevDisabled}
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
        <Show when={nextChapter() && !s.chapterNav().nextDisabled}>
          <span>·</span>
          <span>
            <Icon name="arrow-left" /> {t("reader.endOfChapterCard.swipeLeftNext")}
          </span>
        </Show>
      </div>
    </div>
  );
}
