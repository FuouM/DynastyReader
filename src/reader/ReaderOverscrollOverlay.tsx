/**
 * Overscroll HUD overlay for reader view: center information card,
 * real-time finger tracking circle, and adaptive lock target ring.
 * Extracted from `ReaderViewport.tsx` for modularity.
 */

import { Show } from "solid-js";
import type { ChapterRef } from "../types/routes";
import type { ReadingDirection } from "../types/reader";
import { decodeEntities } from "../utils/html";
import { t } from "../i18n";

export interface OverscrollGestureState {
  fingerX: number;
  fingerY: number;
  targetX: number;
  targetY: number;
  direction: "prev" | "next";
  chapter: ChapterRef | null;
  ready: boolean;
}

export interface ReaderOverscrollOverlayProps {
  gesture: OverscrollGestureState;
  isHorizontal: boolean;
  readingDirection: ReadingDirection;
  currentPermalink: string;
}

export function ReaderOverscrollOverlay(props: ReaderOverscrollOverlayProps) {
  const g = () => props.gesture;
  const isNext = () => g().direction === "next";
  const chapter = () => g().chapter;

  return (
    <div class="ds-overscroll-gesture-overlay">
      <Show
        when={chapter()}
        fallback={
          /* Clean informational notice when at start or end of series without lock/drag mechanics */
          <div class="ds-overscroll-target-card">
            <span class="ds-overscroll-target-badge">
              {isNext()
                ? t("reader.overscrollLock.endOfSeriesTitle")
                : t("reader.overscrollLock.firstChapterTitle")}
            </span>
            <div class="ds-overscroll-target-hint ds-mt-2">
              {isNext()
                ? t("reader.overscrollLock.endOfSeriesDesc")
                : t("reader.overscrollLock.firstChapterDesc")}
            </div>
          </div>
        }
      >
        <div class="ds-overscroll-target-card">
          <span class="ds-overscroll-target-badge">
            {isNext() ? t("reader.overscrollLock.nextChapterBadge") : t("reader.overscrollLock.prevChapterBadge")}
          </span>
          <div class="ds-overscroll-target-title">
            {decodeEntities(chapter()!.title || props.currentPermalink)}
          </div>
          <div class="ds-overscroll-target-hint">
            {g().ready
              ? t("reader.overscrollLock.unlocked")
              : (isNext() ? t("reader.overscrollLock.slideToUnlockNext") : t("reader.overscrollLock.slideToUnlockPrev"))}
          </div>
        </div>

        {/* Real-time Finger Tracking Circle */}
        <div
          class="ds-overscroll-finger-circle"
          classList={{ "ds-snap-ready": g().ready }}
          style={{
            left: `${g().fingerX}px`,
            top: `${g().fingerY}px`,
          }}
        >
          <i
            class={
              g().ready
                ? "bi bi-check-lg"
                : props.isHorizontal
                  ? (props.readingDirection === "rtl" ? g().direction === "prev" : g().direction === "next")
                    ? "bi bi-chevron-left"
                    : "bi bi-chevron-right"
                  : isNext()
                    ? "bi bi-chevron-up"
                    : "bi bi-chevron-down"
            }
          />
        </div>

        {/* Adaptive Lock Target Circle */}
        <div
          class="ds-overscroll-target-ring"
          classList={{ "ds-snap-ready": g().ready }}
          style={{
            left: `${g().targetX}px`,
            top: `${g().targetY}px`,
          }}
        >
          <i class={g().ready ? "bi bi-unlock-fill" : "bi bi-lock-fill"} />
        </div>
      </Show>
    </div>
  );
}
