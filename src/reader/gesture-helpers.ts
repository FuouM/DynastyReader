/**
 * Shared gesture helper functions for the reader viewport.
 * Extracted from `useReaderGestures.ts` to eliminate duplication between
 * touch and mouse gesture engines (~300 lines saved).
 */

import type { ChapterRef } from "../types/routes";
import type { ReaderSession } from "./reader-session";
import {
  OVERSCROLL_ENGAGE_THRESHOLD_PX,
  OVERSCROLL_MAX_PULL_PX,
  getOverscrollTarget,
  isOverscrollReady,
} from "./overscroll-math";
import { stripTranslateXWithPull } from "./reader-transform";
import type { OverscrollGestureState } from "./ReaderOverscrollOverlay";

export const DAMPING_EXPONENT = 0.72;
export const DIRECTION_ANGLE_RATIO = 1.1;
export const LONG_PRESS_DELAY_MS = 350;
export const MOVEMENT_THRESHOLD_PX = 8;
export const TAP_TIME_THRESHOLD_MS = 450;
export const TRANSITION_DURATION_MS = 200;
export const EDGE_BOUNDARY_PX = 5;
export const VERTICAL_ENGAGE_BOUNDARY_PX = 5;

export type OverscrollActive = {
  direction: "prev" | "next";
  chapter: ChapterRef | null;
  targetX: number;
  targetY: number;
  ready: boolean;
  dist: number;
} | null;

export interface TryEngageOverscrollResult {
  engaged: NonNullable<OverscrollActive>;
  overscrollState: OverscrollGestureState;
  dampedPullPx: number;
}

/**
 * Attempts to engage an overscroll gesture at a page boundary.
 * Returns `null` if no boundary condition is met; otherwise returns the
 * overscroll state, the damped pull distance, and a dispatch state.
 */
export function tryEngageOverscroll(opts: {
  s: ReaderSession;
  dx: number;
  dy: number;
  absX: number;
  absY: number;
  startX: number;
  startY: number;
  fingerX: number;
  fingerY: number;
  prevCh: ChapterRef | null;
  nextCh: ChapterRef | null;
}): TryEngageOverscrollResult | null {
  const { s, dx, dy, absX, absY, startX, startY, fingerX, fingerY, prevCh, nextCh } = opts;

  if (s.isHorizontal()) {
    const isRtl = s.direction() === "rtl";
    const cur = s.isSpread() ? s.slideIndex() : s.currentIndex();
    const total = s.isSpread() ? s.spreads().length : s.pages().length;

    const isPullingPrev =
      cur === 0 &&
      (isRtl ? dx < -OVERSCROLL_ENGAGE_THRESHOLD_PX : dx > OVERSCROLL_ENGAGE_THRESHOLD_PX) &&
      absX > absY * DIRECTION_ANGLE_RATIO;

    const isPullingNext =
      cur >= total - 1 &&
      (isRtl ? dx > OVERSCROLL_ENGAGE_THRESHOLD_PX : dx < -OVERSCROLL_ENGAGE_THRESHOLD_PX) &&
      absX > absY * DIRECTION_ANGLE_RATIO;

    if (isPullingPrev) {
      return buildHorizontalOverscroll(s, "prev", prevCh, startX, startY, fingerX, fingerY, absX, isRtl);
    }
    if (isPullingNext) {
      return buildHorizontalOverscroll(s, "next", nextCh, startX, startY, fingerX, fingerY, absX, isRtl);
    }
  } else {
    const vp = s.viewportEl;
    if (vp) {
      const isAtTop = vp.scrollTop <= VERTICAL_ENGAGE_BOUNDARY_PX;
      const isAtBottom = vp.scrollTop + vp.clientHeight >= vp.scrollHeight - VERTICAL_ENGAGE_BOUNDARY_PX;

      if (isAtTop && dy > OVERSCROLL_ENGAGE_THRESHOLD_PX && absY > absX * DIRECTION_ANGLE_RATIO) {
        return buildVerticalOverscroll(s, "prev", prevCh, startX, startY, fingerX, fingerY, dy);
      }
      if (isAtBottom && dy < -OVERSCROLL_ENGAGE_THRESHOLD_PX && absY > absX * DIRECTION_ANGLE_RATIO) {
        return buildVerticalOverscroll(s, "next", nextCh, startX, startY, fingerX, fingerY, -dy);
      }
    }
  }
  return null;
}

function buildHorizontalOverscroll(
  _s: ReaderSession,
  direction: "prev" | "next",
  chapter: ChapterRef | null,
  startX: number,
  startY: number,
  fingerX: number,
  fingerY: number,
  dist: number,
  isRtl: boolean,
): TryEngageOverscrollResult {
  const { targetX, targetY } = getOverscrollTarget(startX, startY, direction, true, isRtl);
  const ready = isOverscrollReady(fingerX, fingerY, targetX, targetY);
  const pullSign = direction === "prev" ? (isRtl ? -1 : 1) : (isRtl ? 1 : -1);
  const damped = pullSign * Math.min(OVERSCROLL_MAX_PULL_PX, Math.pow(dist, DAMPING_EXPONENT));

  return {
    engaged: { direction, chapter, targetX, targetY, ready, dist },
    overscrollState: { fingerX, fingerY, targetX, targetY, direction, chapter, ready },
    dampedPullPx: damped,
  };
}

function buildVerticalOverscroll(
  _s: ReaderSession,
  direction: "prev" | "next",
  chapter: ChapterRef | null,
  startX: number,
  startY: number,
  fingerX: number,
  fingerY: number,
  dist: number,
): TryEngageOverscrollResult {
  const { targetX, targetY } = getOverscrollTarget(startX, startY, direction, false);
  const ready = isOverscrollReady(fingerX, fingerY, targetX, targetY);
  const damped = direction === "prev"
    ? Math.min(OVERSCROLL_MAX_PULL_PX, Math.pow(dist, DAMPING_EXPONENT))
    : -Math.min(OVERSCROLL_MAX_PULL_PX, Math.pow(dist, DAMPING_EXPONENT));

  return {
    engaged: { direction, chapter, targetX, targetY, ready, dist },
    overscrollState: { fingerX, fingerY, targetX, targetY, direction, chapter, ready },
    dampedPullPx: damped,
  };
}

/**
 * Applies the overscroll visual transform to the strip element.
 * Handles both horizontal (translateX) and vertical (translateY) modes.
 */
export function applyOverscrollTransform(
  s: ReaderSession,
  result: TryEngageOverscrollResult,
): void {
  if (!s.stripEl) return;
  if (s.isHorizontal()) {
    const cur = s.isSpread() ? s.slideIndex() : s.currentIndex();
    s.stripEl.style.transform = stripTranslateXWithPull(cur, s.direction(), result.dampedPullPx);
  } else {
    s.stripEl.style.transform = `translateY(${result.dampedPullPx}px)`;
  }
}

/**
 * Updates an active overscroll gesture with current finger/mouse position.
 * Returns haptic trigger info and the new overscroll state.
 */
export function updateActiveOverscroll(
  active: NonNullable<OverscrollActive>,
  fingerX: number,
  fingerY: number,
  hasVibrated: boolean,
): { state: NonNullable<OverscrollActive>; triggerHaptic: boolean } {
  const ready = isOverscrollReady(fingerX, fingerY, active.targetX, active.targetY);
  const shouldHaptic = ready && !hasVibrated;
  return {
    state: { ...active, ready },
    triggerHaptic: shouldHaptic,
  };
}

/**
 * Resolves an overscroll gesture release: triggers chapter navigation if ready.
 */
export function resolveOverscrollRelease(
  s: ReaderSession,
  active: NonNullable<OverscrollActive>,
): void {
  if (active.ready && active.chapter) {
    if (active.direction === "prev") {
      s.gotoPrevChapter();
    } else {
      s.gotoNextChapter();
    }
  }
}

/**
 * Resolves a tap gesture in horizontal mode by stepping to the tapped zone's page.
 */
export function resolveTapZone(
  s: ReaderSession,
  zone: "left" | "center" | "right",
): void {
  const isRtl = s.direction() === "rtl";
  if (zone === "left") {
    const step = isRtl ? 1 : -1;
    const targetPage = s.currentIndex() + step;
    if (targetPage >= 0 && targetPage < s.pages().length) {
      if (s.isSpread()) s.stepSpread(step as 1 | -1);
      else s.setPage(targetPage);
    }
  } else if (zone === "right") {
    const step = isRtl ? -1 : 1;
    const targetPage = s.currentIndex() + step;
    if (targetPage >= 0 && targetPage < s.pages().length) {
      if (s.isSpread()) s.stepSpread(step as 1 | -1);
      else s.setPage(targetPage);
    }
  } else {
    s.toggleToolbarVisible();
  }
}

/**
 * Resolves a horizontal swipe gesture for page turns.
 * Returns true if the swipe was handled (page turn occurred).
 */
export function resolveSwipe(
  s: ReaderSession,
  totalDx: number,
  _totalDy: number,
  absX: number,
  absY: number,
  dt: number,
  minDistPx: number,
  fastThresholdPx: number,
  fastTimeMs: number,
  triggerDirectionHint: () => void,
): boolean {
  if (!s.isHorizontal()) return false;
  if (
    absX > minDistPx &&
    absX > absY * 1.25 &&
    (absX > fastThresholdPx || (absX > minDistPx && dt < fastTimeMs))
  ) {
    const isRtl = s.direction() === "rtl";
    const step = isRtl ? (totalDx > 0 ? 1 : -1) : (totalDx < 0 ? 1 : -1);
    const cur = s.currentIndex();
    const total = s.pages().length;
    const targetPage = cur + step;
    if (targetPage >= 0 && targetPage < total) {
      if (s.isHorizontal() && s.isSpread()) {
        s.stepSpread(step as 1 | -1);
      } else {
        s.setPage(targetPage, false);
      }
    } else if (cur === 0 && step === -1) {
      triggerDirectionHint();
    }
    return true;
  }
  return false;
}
