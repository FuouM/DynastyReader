/**
 * End-of-chapter transition card displayed at the bottom of the reader strip.
 * Offers intuitive next-chapter progression or return-to-series navigation.
 */

import { createSignal, createMemo, Show } from "solid-js";
import type { ReaderSession } from "./reader-session";
import { getAdjacentChapters } from "./reader-spread";
import { decodeEntities } from "../utils/html";
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
  const SWIPE_THRESHOLD_PX = 55;
  const SWIPE_RESET_THRESHOLD_PX = 45;
  const [swipeReady, setSwipeReady] = createSignal<"none" | "left" | "right">("none");
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

  const handleTouchStart = (ev: TouchEvent) => {
    if ((ev.target as HTMLElement)?.closest("button, a, input, select, textarea")) return;
    const t0 = ev.changedTouches[0];
    if (!t0) return;

    // If card was displaced or in transition from rapid prior drag, snap to neutral immediately
    resetCardPosition(false);

    activeTouchId = t0.identifier;
    touchStartX = t0.clientX;
    touchStartY = t0.clientY;
    touchStartTime = Date.now();
    isSwiping = false;
    currentOffset = 0;
    lastReady = "none";
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
        // Swipe right -> Browse / Series
        clamped = Math.min(dx, 120);
        if (clamped >= SWIPE_THRESHOLD_PX) {
          newReady = "right";
        } else if (lastReady === "right" && clamped >= SWIPE_RESET_THRESHOLD_PX) {
          newReady = "right";
        } else {
          newReady = "none";
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
          if (lastReady !== "left") {
            triggerHaptic("snap");
            lastReady = "left";
          }
        } else {
          newReady = "none";
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

      // Swipe right -> Browse
      if (ready === "right" || (offset >= 35 && dt < 300)) {
        triggerHaptic("confirm");
        navigate({ view: "browse" });
        return;
      }
    }
  };

  const handleTouchCancel = () => {
    activeTouchId = null;
    isSwiping = false;
    currentOffset = 0;
    lastReady = "none";
    setSwipeReady("none");
    resetCardPosition(true);
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
          when={nextChapter() && !s.chapterNav().nextDisabled}
          fallback={
            <>
              <Icon name="arrow-right" />
              <span>{t("reader.endOfChapterCard.swipeRightBrowse")}</span>
            </>
          }
        >
          <span>
            <Icon name="arrow-left" /> {t("reader.endOfChapterCard.swipeLeftNext")}
          </span>
          <span>·</span>
          <span>
            {t("reader.endOfChapterCard.swipeRightBrowse")} <Icon name="arrow-right" />
          </span>
        </Show>
      </div>
    </div>
  );
}
