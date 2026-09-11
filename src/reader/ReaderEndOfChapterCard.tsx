/**
 * End-of-chapter transition card displayed at the bottom of the reader strip.
 * Offers intuitive next-chapter progression or return-to-series navigation.
 */

import { Show } from "solid-js";
import type { ReaderSession } from "./reader-session";
import { getAdjacentChapters } from "./reader-spread";
import { decodeEntities } from "../utils/html";
import { t } from "../i18n";
import { CheckIcon, ArrowRightIcon, ArrowLeftIcon, Icon } from "../components/Icon";

export function ReaderEndOfChapterCard(props: { session: ReaderSession }) {
  const s = props.session;
  const nextChapter = () => {
    if (s.chapterNav().nextDisabled) return null;
    return getAdjacentChapters(s.chapterList(), s.permalink, s.chapterTitle()).nextCh;
  };

  return (
    <div class="ds-chapter-end-card">
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
      </div>
    </div>
  );
}
