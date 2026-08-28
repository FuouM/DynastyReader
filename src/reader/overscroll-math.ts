/**
 * Geometry and collision math for adaptive overscroll lock positioning and gesture thresholds.
 * Extracted from `ReaderViewport.tsx` for testability and modularity.
 */

export const OVERSCROLL_ENGAGE_THRESHOLD_PX = 35;
export const OVERSCROLL_MAX_PULL_PX = 70;
export const SWIPE_MIN_DIST_TOUCH_PX = 35;
export const SWIPE_MIN_DIST_MOUSE_PX = 45;

export const OVERSCROLL_COLLISION_RADIUS_PX = 48;
export const OVERSCROLL_MIN_SEPARATION_PX = 140;
export const OVERSCROLL_CARD_AVOID_H_PX = 82; // 50px card half-height + 32px ring radius
export const OVERSCROLL_CARD_AVOID_W_PX = 167; // 135px card half-width + 32px ring radius

/**
 * Adaptive overscroll lock positioning:
 * - The info card is anchored at the exact viewport center (cx, cy).
 * - Target ring is placed along pull vector with guaranteed separation (>= 140px)
 *   from the engaged finger position (accounting for the 35px threshold already moved).
 * - When starting with sufficient runway across the screen, target is placed on the destination side.
 * - When starting near the destination boundary, an orthogonal corner offset is added to enforce
 *   >= 140px Euclidean distance so the lock never spawns adjacent to or within reach of an initial twitch.
 */
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

  if (isHorizontal) {
    const isPullingLeft = isRtl ? direction === "prev" : direction === "next";

    // Where is the finger when the overscroll gesture engages? (35px past startX)
    const engagedX = isPullingLeft
      ? startX - OVERSCROLL_ENGAGE_THRESHOLD_PX
      : startX + OVERSCROLL_ENGAGE_THRESHOLD_PX;

    // Destination target X along the pull direction:
    const destX = isPullingLeft
      ? Math.max(56, Math.min(cx - 65, winW * 0.20))
      : Math.min(winW - 56, Math.max(cx + 65, winW * 0.80));

    // Horizontal travel available from the engaged finger position to destination edge
    const runwayX = isPullingLeft
      ? engagedX - 56
      : (winW - 56) - engagedX;

    let targetX = destX;
    let targetY = startY;

    // Avoid center info card along Y
    if (Math.abs(targetY - cy) < OVERSCROLL_CARD_AVOID_H_PX) {
      targetY = startY < cy ? cy - OVERSCROLL_CARD_AVOID_H_PX : cy + OVERSCROLL_CARD_AVOID_H_PX;
    }

    if (runwayX >= OVERSCROLL_MIN_SEPARATION_PX) {
      // Normal full swipe across screen: target anchored on destination side
      targetX = destX;
    } else {
      // Starting on the destination half of screen (near destination edge).
      // Lock targetX to destination margin and add orthogonal Y travel to enforce Euclidean distance >= 140px.
      targetX = isPullingLeft ? 56 : winW - 56;
      const horizDist = Math.max(0, isPullingLeft ? engagedX - targetX : targetX - engagedX);
      const neededY = Math.sqrt(
        Math.max(0, OVERSCROLL_MIN_SEPARATION_PX * OVERSCROLL_MIN_SEPARATION_PX - horizDist * horizDist),
      );

      if (targetY < cy) {
        targetY = Math.max(56, targetY - neededY);
        if (targetY <= 60) {
          targetY = Math.min(winH - 56, cy + OVERSCROLL_CARD_AVOID_H_PX + neededY);
        }
      } else {
        targetY = Math.min(winH - 56, targetY + neededY);
        if (targetY >= winH - 60) {
          targetY = Math.max(56, cy - OVERSCROLL_CARD_AVOID_H_PX - neededY);
        }
      }
    }

    const clampedX = Math.max(48, Math.min(winW - 48, targetX));
    const clampedY = Math.max(48, Math.min(winH - 48, targetY));
    return { targetX: clampedX, targetY: clampedY };
  } else {
    // Vertical continuous scroll mode
    const isPullingUp = direction === "next";

    const engagedY = isPullingUp
      ? startY - OVERSCROLL_ENGAGE_THRESHOLD_PX
      : startY + OVERSCROLL_ENGAGE_THRESHOLD_PX;

    const destY = isPullingUp
      ? Math.max(56, Math.min(cy - 65, winH * 0.20))
      : Math.min(winH - 56, Math.max(cy + 65, winH * 0.80));

    const runwayY = isPullingUp
      ? engagedY - 56
      : (winH - 56) - engagedY;

    let targetY = destY;
    let targetX = startX;

    // Avoid center info card along X
    if (Math.abs(targetX - cx) < OVERSCROLL_CARD_AVOID_W_PX) {
      targetX = startX < cx ? cx - OVERSCROLL_CARD_AVOID_W_PX : cx + OVERSCROLL_CARD_AVOID_W_PX;
    }

    if (runwayY >= OVERSCROLL_MIN_SEPARATION_PX) {
      targetY = destY;
    } else {
      targetY = isPullingUp ? 56 : winH - 56;
      const vertDist = Math.max(0, isPullingUp ? engagedY - targetY : targetY - engagedY);
      const neededX = Math.sqrt(
        Math.max(0, OVERSCROLL_MIN_SEPARATION_PX * OVERSCROLL_MIN_SEPARATION_PX - vertDist * vertDist),
      );

      if (targetX < cx) {
        targetX = Math.max(56, targetX - neededX);
        if (targetX <= 60) {
          targetX = Math.min(winW - 56, cx + OVERSCROLL_CARD_AVOID_W_PX + neededX);
        }
      } else {
        targetX = Math.min(winW - 56, targetX + neededX);
        if (targetX >= winW - 60) {
          targetX = Math.max(56, cx - OVERSCROLL_CARD_AVOID_W_PX - neededX);
        }
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
