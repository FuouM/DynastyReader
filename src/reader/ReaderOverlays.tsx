/**
 * Consolidated reader HUD overlays: Overscroll target/finger HUD,
 * Tap-to-turn zone guide, and Reading direction change hint.
 */

import { makeEventListener } from "@solid-primitives/event-listener";
import { createEffect, createSignal, onCleanup, onMount, Show } from "solid-js";
import type { ChapterRef } from "../types/routes";
import type { ReadingDirection } from "../types/reader";
import { decodeEntities } from "../utils/formatting";
import { ChevronLeftIcon, ChevronRightIcon, Icon } from "../components/Icon";
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


export interface TapZoneGuideState {
  activeZone: "left" | "center" | "right";
}

export interface ReaderTapZoneGuideProps {
  guide: TapZoneGuideState;
  readingDirection: ReadingDirection;
}

export function ReaderTapZoneGuide(props: ReaderTapZoneGuideProps) {
  const isRtl = () => props.readingDirection === "rtl";
  const leftLabel = () => isRtl() ? t("reader.tapZones.nextPage") : t("reader.tapZones.prevPage");
  const rightLabel = () => isRtl() ? t("reader.tapZones.prevPage") : t("reader.tapZones.nextPage");
  const leftIcon = () => isRtl() ? <ChevronRightIcon /> : <ChevronLeftIcon />;
  const rightIcon = () => isRtl() ? <ChevronLeftIcon /> : <ChevronRightIcon />;

  return (
    <div class="ds-tap-zone-guide">
      <div class="ds-tap-zone ds-tap-zone-side" classList={{ "is-active": props.guide.activeZone === "left" }}>
        <div class="ds-tap-zone-pill">
          {leftIcon()}
          <span>{leftLabel()}</span>
        </div>
      </div>
      <div class="ds-tap-zone ds-tap-zone-center" classList={{ "is-active": props.guide.activeZone === "center" }}>
        <div class="ds-tap-zone-pill">
          <Icon name="layout-text-window" />
          <span>{t("reader.tapZones.toggleMenu")}</span>
        </div>
      </div>
      <div class="ds-tap-zone ds-tap-zone-side" classList={{ "is-active": props.guide.activeZone === "right" }}>
        <div class="ds-tap-zone-pill">
          <span>{rightLabel()}</span>
          {rightIcon()}
        </div>
      </div>
    </div>
  );
}


export interface ReaderDirectionHintProps {
  isHorizontal: boolean;
  readingDirection: ReadingDirection;
  pageIndex: number;
  permalink: string;
  triggerTick?: number;
}

export function ReaderDirectionHint(props: ReaderDirectionHintProps) {
  const [visible, setVisible] = createSignal(false);
  let hideTimer: number | undefined;
  let lastDirection: ReadingDirection | null = null;
  let lastPermalink: string | null = null;
  let lastTriggerTick = 0;

  const showHint = (durationMs = 2200) => {
    if (!props.isHorizontal) return;
    setVisible(true);
    clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => {
      setVisible(false);
      hideTimer = undefined;
    }, durationMs);
  };

  const dismiss = () => {
    clearTimeout(hideTimer);
    hideTimer = undefined;
    setVisible(false);
  };

  createEffect(() => {
    const permalink = props.permalink;
    const dir = props.readingDirection;
    const isHoriz = props.isHorizontal;
    const tick = props.triggerTick ?? 0;

    if (!isHoriz) {
      dismiss();
      return;
    }

    // Explicit manual trigger (e.g. reverse swipe on page 1)
    if (tick > lastTriggerTick) {
      lastTriggerTick = tick;
      showHint(2000);
      return;
    }

    if (permalink && permalink !== lastPermalink) {
      const isFirstLoad = lastPermalink === null;
      const isDirChanged = lastDirection !== null && lastDirection !== dir;
      lastPermalink = permalink;
      lastDirection = dir;
      if ((isFirstLoad || isDirChanged) && props.pageIndex === 0) {
        showHint(2400);
      }
    } else if (permalink && dir !== lastDirection) {
      // Direction toggled mid-session within the same chapter.
      lastDirection = dir;
      showHint(2400);
    }
  });

  onMount(() => {
    const onUserAction = () => dismiss();
    makeEventListener(window, "pointerdown", onUserAction, { passive: true, capture: true });
    makeEventListener(window, "keydown", onUserAction, { passive: true, capture: true });
    onCleanup(() => {
      clearTimeout(hideTimer);
    });
  });

  const isRtl = () => props.readingDirection === "rtl";

  return (
    <Show when={visible()}>
      <div class="ds-reader-direction-hint-wrap" onClick={dismiss}>
        <div class="ds-reader-direction-hint-pill">
          <Show
            when={isRtl()}
            fallback={
              <>
                <span class="ds-hint-tag">{t("reader.directionHint.ltrTag")}</span>
                <span>{t("reader.directionHint.nextPageLtr")}</span>
                <Icon name="arrow-left" />
              </>
            }
          >
            <span class="ds-hint-tag">{t("reader.directionHint.rtlTag")}</span>
            <span>{t("reader.directionHint.nextPageRtl")}</span>
            <Icon name="arrow-right" />
          </Show>
        </div>
      </div>
    </Show>
  );
}

