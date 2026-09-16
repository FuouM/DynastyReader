import { createMemo, Show } from "solid-js";
import { CheckIcon } from "../components/Icon";
import { navigate } from "../stores/router";
import { t } from "../i18n";
import { decodeEntities } from "../utils/html";
import type { ChapterMeta } from "./SeriesChapterList";
import type { Series } from "../types/api";
import type { SeriesProgressRow } from "../types/db";

export interface SeriesResumeBannerProps {
  series: Series;
  chapters: ChapterMeta[];
  progress: Map<string, SeriesProgressRow>;
  readHistorySet: Set<string>;
}
export function chronologicalChapters(chapters: ChapterMeta[]): ChapterMeta[] {
  return chapters
    .map((ch, idx) => {
      const ts = ch.released_on ? Date.parse(ch.released_on) : NaN;
      return { ch, idx, ts: Number.isNaN(ts) ? -Infinity : ts };
    })
    .sort((a, b) => (a.ts !== b.ts ? a.ts - b.ts : a.idx - b.idx))
    .map((x) => x.ch);
}

export function SeriesResumeBanner(props: SeriesResumeBannerProps) {
  const resumeInfo = createMemo(() => {
    const chapters = props.chapters;
    if (chapters.length === 0) return null;
    const sorted = chronologicalChapters(chapters);
    const unread = sorted.find(
      (c) =>
        !props.readHistorySet.has(c.permalink) &&
        props.progress.get(c.permalink)?.completed !== 1,
    );
    if (unread) {
      const hasAnyRead = sorted.some(
        (c) =>
          props.readHistorySet.has(c.permalink) ||
          props.progress.get(c.permalink)?.completed === 1,
      );
      return { chapter: unread, isStart: !hasAnyRead, isCompleted: false };
    }
    return { chapter: null, isStart: false, isCompleted: true };
  });

  return (
    <Show when={resumeInfo()}>
      {(info) => (
        <div class="ds-series-resume-banner">
          <Show when={info().chapter}>
            {(ch) => (
              <button
                type="button"
                class="win-button primary ds-series-resume-btn"
                onClick={() => {
                  const prog = props.progress.get(ch().permalink);
                  navigate({
                    view: "reader",
                    seriesPermalink: props.series.permalink,
                    chapterPermalink: ch().permalink,
                    chapterTitle: ch().title,
                    seriesName: props.series.name,
                    chapterList: props.chapters,
                    startPage: prog && prog.completed !== 1 ? prog.page_index : 0,
                  });
                }}
              >
                <span class="ds-resume-icon">▶</span>
                <span>
                  {info().isStart
                    ? t("series.startReading")
                    : t("series.continueReading", {
                        title: decodeEntities(ch().title),
                      })}
                </span>
              </button>
            )}
          </Show>
          <Show when={info().isCompleted}>
            <div class="ds-series-completed-banner ds-muted">
              <CheckIcon size={14} />
              <span>{t("series.allRead")}</span>
            </div>
          </Show>
        </div>
      )}
    </Show>
  );
}
