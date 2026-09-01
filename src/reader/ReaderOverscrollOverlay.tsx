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

function TargetCard(props: { badge: string; title?: string; hint: string; hintClass?: string }) {
  return (
    <div class="ds-overscroll-target-card">
      <span class="ds-overscroll-target-badge">{props.badge}</span>
      <Show when={props.title}>
        <div class="ds-overscroll-target-title">{props.title}</div>
      </Show>
      <div class={`ds-overscroll-target-hint ${props.hintClass ?? ""}`}>
        {props.hint}
      </div>
    </div>
  );
}

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
          <TargetCard
            badge={isNext() ? t("reader.overscrollLock.endOfSeriesTitle") : t("reader.overscrollLock.firstChapterTitle")}
            hint={isNext() ? t("reader.overscrollLock.endOfSeriesDesc") : t("reader.overscrollLock.firstChapterDesc")}
            hintClass="ds-mt-2"
          />
        }
      >
        <TargetCard
          badge={isNext() ? t("reader.overscrollLock.nextChapterBadge") : t("reader.overscrollLock.prevChapterBadge")}
          title={decodeEntities(chapter()!.title || props.currentPermalink)}
          hint={g().ready ? t("reader.overscrollLock.unlocked") : (isNext() ? t("reader.overscrollLock.slideToUnlockNext") : t("reader.overscrollLock.slideToUnlockPrev"))}
        />

        {/* Real-time Finger Tracking Circle */}
        <div
          class="ds-overscroll-finger-circle"
          classList={{ "ds-snap-ready": g().ready }}
          style={{
            transform: `translate3d(calc(${g().fingerX}px - 50%), calc(${g().fingerY}px - 50%), 0)`,
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
            transform: `translate3d(calc(${g().targetX}px - 50%), calc(${g().targetY}px - 50%), 0)`,
          }}
        >
          <i class={g().ready ? "bi bi-unlock-fill" : "bi bi-lock-fill"} />
        </div>
      </Show>
    </div>
  );
}
