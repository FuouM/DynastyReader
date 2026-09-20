/**
 * Shared gesture helper functions for the reader viewport.
 * Extracted from `useReaderGestures.ts` to eliminate duplication between
 * touch and mouse gesture engines (~300 lines saved).
 */

import type { ChapterRef } from "../types/routes";
import type { ReaderSession } from "./reader-session";
import { isMobile } from "../stores/platform";
import { triggerHaptic } from "../utils/haptics";
export const OVERSCROLL_ENGAGE_THRESHOLD_PX = 35;
export const OVERSCROLL_MAX_PULL_PX = 70;
export const SWIPE_MIN_DIST_TOUCH_PX = 35;
export const SWIPE_MIN_DIST_MOUSE_PX = 45;

export const OVERSCROLL_COLLISION_RADIUS_PX = 48;
export const OVERSCROLL_CARD_AVOID_H_PX = 96;
export const OVERSCROLL_CARD_AVOID_W_PX = 185;

export function getOverscrollCardAvoidW(winW: number): number {
  const cardW = Math.min(260, Math.max(160, winW - 48));
  return Math.round(cardW / 2 + 32 + 16);
}

export const getOverscrollTarget = (
  startX: number,
  startY: number,
  direction: "prev" | "next",
  isHorizontal: boolean,
  isRtl = false,
): { targetX: number; targetY: number } => {
  const winW = typeof window !== "undefined" ? window.innerWidth : 400;
  const winH = typeof window !== "undefined" ? window.innerHeight : 600;
  const cx = winW / 2;
  const cy = winH / 2;
  const cardAvoidW = getOverscrollCardAvoidW(winW);
  const EDGE_MARGIN_X = Math.max(56, Math.min(100, winW * 0.08));
  const EDGE_MARGIN_Y = Math.max(56, Math.min(100, winH * 0.08));

  if (isHorizontal) {
    const isPullingLeft = isRtl ? direction === "prev" : direction === "next";
    const engagedX = isPullingLeft
      ? startX - OVERSCROLL_ENGAGE_THRESHOLD_PX
      : startX + OVERSCROLL_ENGAGE_THRESHOLD_PX;
    const engagedY = startY;
    const isStartingOnDestSide = isPullingLeft ? engagedX < cx + 40 : engagedX > cx - 40;

    let targetX = isPullingLeft ? EDGE_MARGIN_X : winW - EDGE_MARGIN_X;
    let targetY: number;

    if (!isStartingOnDestSide) {
      targetY = engagedY;
      if (Math.abs(targetY - cy) < OVERSCROLL_CARD_AVOID_H_PX) {
        targetY = engagedY < cy
          ? cy - OVERSCROLL_CARD_AVOID_H_PX - 20
          : cy + OVERSCROLL_CARD_AVOID_H_PX + 20;
      }
    } else {
      if (engagedY < cy) {
        targetY = Math.min(winH - EDGE_MARGIN_Y, Math.max(cy + OVERSCROLL_CARD_AVOID_H_PX + 20, winH * 0.74));
      } else {
        targetY = Math.max(EDGE_MARGIN_Y, Math.min(cy - OVERSCROLL_CARD_AVOID_H_PX - 20, winH * 0.26));
      }
    }

    if (Math.abs(targetX - cx) < cardAvoidW && Math.abs(targetY - cy) < OVERSCROLL_CARD_AVOID_H_PX) {
      if (Math.abs(targetY - cy) < Math.abs(targetX - cx)) {
        targetY = targetY < cy ? cy - OVERSCROLL_CARD_AVOID_H_PX - 20 : cy + OVERSCROLL_CARD_AVOID_H_PX + 20;
      } else {
        targetX = targetX < cx ? cx - cardAvoidW - 20 : cx + cardAvoidW + 20;
      }
    }

    const clampedX = Math.max(48, Math.min(winW - 48, targetX));
    const clampedY = Math.max(48, Math.min(winH - 48, targetY));
    return { targetX: clampedX, targetY: clampedY };
  } else {
    const isPullingUp = direction === "next";
    const engagedX = startX;
    const engagedY = isPullingUp
      ? startY - OVERSCROLL_ENGAGE_THRESHOLD_PX
      : startY + OVERSCROLL_ENGAGE_THRESHOLD_PX;

    const isStartingOnDestSide = isPullingUp ? engagedY < cy + 40 : engagedY > cy - 40;

    let targetY = isPullingUp ? EDGE_MARGIN_Y : winH - EDGE_MARGIN_Y;
    let targetX: number;

    if (!isStartingOnDestSide) {
      targetX = engagedX;
      if (Math.abs(targetX - cx) < cardAvoidW) {
        targetX = engagedX < cx
          ? cx - cardAvoidW - 20
          : cx + cardAvoidW + 20;
      }
    } else {
      if (engagedX < cx) {
        targetX = Math.min(winW - EDGE_MARGIN_X, Math.max(cx + cardAvoidW + 20, winW * 0.76));
      } else {
        targetX = Math.max(EDGE_MARGIN_X, Math.min(cx - cardAvoidW - 20, winW * 0.24));
      }
    }

    if (Math.abs(targetX - cx) < cardAvoidW && Math.abs(targetY - cy) < OVERSCROLL_CARD_AVOID_H_PX) {
      if (Math.abs(targetX - cx) < Math.abs(targetY - cy)) {
        targetX = targetX < cx ? cx - cardAvoidW - 20 : cx + cardAvoidW + 20;
      } else {
        targetY = targetY < cy ? cy - OVERSCROLL_CARD_AVOID_H_PX - 20 : cy + OVERSCROLL_CARD_AVOID_H_PX + 20;
      }
    }

    const clampedX = Math.max(48, Math.min(winW - 48, targetX));
    const clampedY = Math.max(48, Math.min(winH - 48, targetY));
    return { targetX: clampedX, targetY: clampedY };
  }
};

export const isOverscrollReady = (fingerX: number, fingerY: number, targetX: number, targetY: number): boolean => {
  return Math.hypot(fingerX - targetX, fingerY - targetY) <= OVERSCROLL_COLLISION_RADIUS_PX;
};
import { stripTranslateXWithPull } from "./reader-transform";
import type { OverscrollGestureState } from "./ReaderOverlays";

export const DAMPING_EXPONENT = 0.72;
export const DIRECTION_ANGLE_RATIO = 1.1;
export const LONG_PRESS_DELAY_MS = 350;
export const MOVEMENT_THRESHOLD_PX = 8;
export const TAP_TIME_THRESHOLD_MS = 450;
export const TRANSITION_DURATION_MS = 200;
export const VERTICAL_ENGAGE_BOUNDARY_PX = 5;

export type OverscrollActive = {
  direction: "prev" | "next";
  chapter: ChapterRef | null;
  targetX: number;
  targetY: number;
  ready: boolean;
  dist: number;
  startX: number;
  startY: number;
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
      const isAtBottom = Math.ceil(vp.scrollTop + vp.clientHeight) >= vp.scrollHeight - VERTICAL_ENGAGE_BOUNDARY_PX;

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
    engaged: { direction, chapter, targetX, targetY, ready, dist, startX, startY },
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
    engaged: { direction, chapter, targetX, targetY, ready, dist, startX, startY },
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
  s: ReaderSession,
  active: NonNullable<OverscrollActive>,
  fingerX: number,
  fingerY: number,
  hasVibrated: boolean,
): { state: NonNullable<OverscrollActive>; triggerHaptic: boolean; dampedPullPx: number } {
  const ready = isOverscrollReady(fingerX, fingerY, active.targetX, active.targetY);
  const shouldHaptic = ready && !hasVibrated;
  let rawDist: number;
  let damped: number;

  if (s.isHorizontal()) {
    const isRtl = s.direction() === "rtl";
    rawDist = Math.abs(fingerX - active.startX);
    const pullSign = active.direction === "prev" ? (isRtl ? -1 : 1) : (isRtl ? 1 : -1);
    damped = pullSign * Math.min(OVERSCROLL_MAX_PULL_PX, Math.pow(rawDist, DAMPING_EXPONENT));
  } else {
    rawDist = Math.abs(fingerY - active.startY);
    damped = active.direction === "prev"
      ? Math.min(OVERSCROLL_MAX_PULL_PX, Math.pow(rawDist, DAMPING_EXPONENT))
      : -Math.min(OVERSCROLL_MAX_PULL_PX, Math.pow(rawDist, DAMPING_EXPONENT));
  }

  return {
    state: { ...active, dist: rawDist, ready },
    triggerHaptic: shouldHaptic,
    dampedPullPx: damped,
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
  if (zone === "center" || !s.isHorizontal()) {
    s.toggleToolbarVisible();
    return;
  }
  const isRtl = s.direction() === "rtl";
  const step = ((zone === "left" ? 1 : -1) * (isRtl ? 1 : -1)) as 1 | -1;
  const targetPage = s.currentIndex() + step;
  if (targetPage >= 0 && targetPage < s.pages().length) {
    const willActuallyTurn = !s.isSpread() || s.canStepSpread(step);
    if (isMobile() && willActuallyTurn) triggerHaptic("page-turn");
    if (s.isSpread()) s.stepSpread(step);
    else s.setPage(targetPage);
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
      const willActuallyTurn = !(s.isHorizontal() && s.isSpread()) || s.canStepSpread(step as 1 | -1);
      if (isMobile() && willActuallyTurn) triggerHaptic("page-turn");
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
