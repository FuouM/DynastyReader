/**
 * End-of-chapter transition card displayed at the bottom of the reader strip.
 * Offers intuitive next-chapter progression or return-to-series navigation.
 */

import { createSignal, Show } from "solid-js";
import type { ReaderSession } from "./reader-session";
import { getAdjacentChapters } from "./reader-spread";
import { decodeEntities } from "../utils/html";
import { t } from "../i18n";
import { navigate } from "../stores/router";
import { triggerHaptic } from "../utils/haptics";
import { CheckIcon, ArrowRightIcon, ArrowLeftIcon, Icon } from "../components/Icon";
export function ReaderEndOfChapterCard(props: { session: ReaderSession }) {
  const s = props.session;
  const nextChapter = () => {
    if (s.chapterNav().nextDisabled) return null;
    return getAdjacentChapters(s.chapterList(), s.permalink, s.chapterTitle()).nextCh;
  };

  const [swipeOffset, setSwipeOffset] = createSignal(0);
  const [isSwiping, setIsSwiping] = createSignal(false);
  let touchStartX = 0;
  let touchStartY = 0;
  let touchStartTime = 0;

  const handleTouchStart = (ev: TouchEvent) => {
    if (ev.touches.length !== 1) return;
    if ((ev.target as HTMLElement)?.closest("button, a, input, select, textarea")) return;
    const t0 = ev.touches[0];
    touchStartX = t0.clientX;
    touchStartY = t0.clientY;
    touchStartTime = Date.now();
    setIsSwiping(false);
  };

  const handleTouchMove = (ev: TouchEvent) => {
    if (ev.touches.length !== 1) return;
    const t0 = ev.touches[0];
    const dx = t0.clientX - touchStartX;
    const dy = t0.clientY - touchStartY;
    if (dx > 0 && Math.abs(dx) > Math.abs(dy) * 1.1) {
      setIsSwiping(true);
      setSwipeOffset(Math.min(dx, 120));
      if (ev.cancelable && dx > 8) ev.preventDefault();
    }
  };

  const handleTouchEnd = () => {
    if (isSwiping()) {
      const offset = swipeOffset();
      const dt = Date.now() - touchStartTime;
      setIsSwiping(false);
      setSwipeOffset(0);
      if (offset >= 55 || (offset >= 35 && dt < 300)) {
        triggerHaptic("confirm");
        navigate({ view: "browse" });
      }
    }
  };

  const handleTouchCancel = () => {
    setIsSwiping(false);
    setSwipeOffset(0);
  };

  return (
    <div
      class="ds-chapter-end-card"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
      style={{
        transform: swipeOffset() > 0 ? `translateX(${swipeOffset()}px)` : undefined,
        transition: isSwiping() ? "none" : "transform 0.22s cubic-bezier(0.16, 1, 0.3, 1)",
      }}
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
        <Icon name="arrow-right" />
        <span>{t("reader.endOfChapterCard.swipeRightBrowse")}</span>
      </div>
    </div>
  );
}
