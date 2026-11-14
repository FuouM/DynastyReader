/**
 * Shared gesture helper functions for the reader viewport.
 * Extracted from `useReaderGestures.ts` to eliminate duplication between
 * touch and mouse gesture engines (~300 lines saved).
 */

import type { ChapterRef } from "../types/routes";
import type { ReaderSession } from "./reader-session";
import { isMobile } from "../stores/platform";
import { triggerHaptic } from "../utils/haptics";
import { stripTranslateXWithPull } from "./reader-transform";
import type { OverscrollGestureState } from "./ReaderOverlays";
const OVERSCROLL_ENGAGE_THRESHOLD_PX = 35;
const OVERSCROLL_MAX_PULL_PX = 70;
export const SWIPE_MIN_DIST_TOUCH_PX = 35;
export const SWIPE_MIN_DIST_MOUSE_PX = 45;

export const OVERSCROLL_COLLISION_RADIUS_PX = 48;
const OVERSCROLL_CARD_AVOID_H_PX = 96;

function getOverscrollCardAvoidW(winW: number): number {
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

const DAMPING_EXPONENT = 0.72;
const DIRECTION_ANGLE_RATIO = 1.1;
export const LONG_PRESS_DELAY_MS = 350;
export const MOVEMENT_THRESHOLD_PX = 8;
export const TAP_TIME_THRESHOLD_MS = 450;
export const TRANSITION_DURATION_MS = 200;
const VERTICAL_ENGAGE_BOUNDARY_PX = 5;

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

interface TryEngageOverscrollResult {
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

  // Dragging the end-of-chapter card must never trigger chapter overscroll
  if (typeof document !== "undefined") {
    const elAtStart = document.elementFromPoint(startX, startY);
    if (elAtStart?.closest(".ds-chapter-end-card")) return null;
    const elAtFinger = document.elementFromPoint(fingerX, fingerY);
    if (elAtFinger?.closest(".ds-chapter-end-card")) return null;
  }
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
      return buildOverscroll("prev", prevCh, startX, startY, fingerX, fingerY, absX, true, isRtl);
    }
    if (isPullingNext) {
      return buildOverscroll("next", nextCh, startX, startY, fingerX, fingerY, absX, true, isRtl);
    }
  } else {
    const vp = s.viewportEl;
    if (vp) {
      const isAtTop = vp.scrollTop <= VERTICAL_ENGAGE_BOUNDARY_PX;
      const isAtBottom = Math.ceil(vp.scrollTop + vp.clientHeight) >= vp.scrollHeight - VERTICAL_ENGAGE_BOUNDARY_PX;

      if (isAtTop && dy > OVERSCROLL_ENGAGE_THRESHOLD_PX && absY > absX * DIRECTION_ANGLE_RATIO) {
        return buildOverscroll("prev", prevCh, startX, startY, fingerX, fingerY, dy, false, false);
      }
      if (isAtBottom && dy < -OVERSCROLL_ENGAGE_THRESHOLD_PX && absY > absX * DIRECTION_ANGLE_RATIO) {
        return buildOverscroll("next", nextCh, startX, startY, fingerX, fingerY, -dy, false, false);
      }
    }
  }
  return null;
}

/** Damped strip displacement for a pull of `dist` px, signed toward the pull direction. */
function dampedPullPx(
  dist: number,
  direction: "prev" | "next",
  isHorizontal: boolean,
  isRtl: boolean,
): number {
  const sign = (direction === "prev" ? 1 : -1) * (isHorizontal && isRtl ? -1 : 1);
  return sign * Math.min(OVERSCROLL_MAX_PULL_PX, Math.pow(dist, DAMPING_EXPONENT));
}

function buildOverscroll(
  direction: "prev" | "next",
  chapter: ChapterRef | null,
  startX: number,
  startY: number,
  fingerX: number,
  fingerY: number,
  dist: number,
  isHorizontal: boolean,
  isRtl: boolean,
): TryEngageOverscrollResult {
  const { targetX, targetY } = getOverscrollTarget(startX, startY, direction, isHorizontal, isRtl);
  const ready = isOverscrollReady(fingerX, fingerY, targetX, targetY);
  return {
    engaged: { direction, chapter, targetX, targetY, ready, dist, startX, startY },
    overscrollState: { fingerX, fingerY, targetX, targetY, direction, chapter, ready },
    dampedPullPx: dampedPullPx(dist, direction, isHorizontal, isRtl),
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
  s.stripEl.style.willChange = "transform";
  if (s.isHorizontal()) {
    const cur = s.isSpread() ? s.slideIndex() : s.currentIndex();
    s.stripEl.style.transform = stripTranslateXWithPull(cur, s.direction(), result.dampedPullPx);
  } else {
    s.stripEl.style.transform = `translate3d(0, ${result.dampedPullPx}px, 0)`;
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
  const isHorizontal = s.isHorizontal();
  const rawDist = isHorizontal ? Math.abs(fingerX - active.startX) : Math.abs(fingerY - active.startY);
  const damped = dampedPullPx(rawDist, active.direction, isHorizontal, isHorizontal && s.direction() === "rtl");

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
  const step: 1 | -1 = (zone === "left") === isRtl ? 1 : -1;
  turnPageWithHaptic(s, step);
}

/** Turns one page/spread if the target page exists; returns whether it did. */
function turnPageWithHaptic(s: ReaderSession, step: 1 | -1): boolean {
  const targetPage = s.currentIndex() + step;
  if (targetPage < 0 || targetPage >= s.pages().length) return false;
  const willActuallyTurn = !s.isSpread() || s.canStepSpread(step);
  if (isMobile() && willActuallyTurn) triggerHaptic("page-turn");
  s.turnPage(step);
  return true;
}

/**
 * Resolves a horizontal swipe gesture for page turns.
 * Returns true if the swipe was handled (page turn occurred).
 */
export function resolveSwipe(
  s: ReaderSession,
  totalDx: number,
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
    (absX > fastThresholdPx || dt < fastTimeMs)
  ) {
    const isRtl = s.direction() === "rtl";
    const step: 1 | -1 = isRtl ? (totalDx > 0 ? 1 : -1) : (totalDx < 0 ? 1 : -1);
    if (!turnPageWithHaptic(s, step) && s.currentIndex() === 0 && step === -1) {
      triggerDirectionHint();
    }
    return true;
  }
  return false;
}
