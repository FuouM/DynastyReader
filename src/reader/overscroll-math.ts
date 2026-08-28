/**
 * Geometry and collision math for adaptive overscroll lock positioning and gesture thresholds.
 * Extracted from `ReaderViewport.tsx` for testability and modularity.
 */

export const OVERSCROLL_ENGAGE_THRESHOLD_PX = 35;
export const OVERSCROLL_MAX_PULL_PX = 70;
export const SWIPE_MIN_DIST_TOUCH_PX = 35;
export const SWIPE_MIN_DIST_MOUSE_PX = 45;

export const OVERSCROLL_COLLISION_RADIUS_PX = 46;
export const OVERSCROLL_MIN_SEPARATION_PX = 220;
export const OVERSCROLL_CARD_AVOID_H_PX = 92; // Card half-height + ring radius + safety margin
export const OVERSCROLL_CARD_AVOID_W_PX = 180; // Card half-width + ring radius + safety margin

/**
 * Adaptive overscroll lock positioning with Radial Orbit & Edge Deflection:
 * - The info card is anchored at the exact viewport center (cx, cy).
 * - Target ring is placed along pull vector with guaranteed Euclidean separation (>= 220px)
 *   from the engaged finger position (accounting for the 35px threshold already moved).
 * - When starting with generous runway across the screen, target is placed on the destination side.
 * - When starting near or on the destination boundary, an inward angular orbit deflection is applied
 *   (deflecting into the open vertical or horizontal quadrant) to guarantee >= 220px travel distance
 *   so the lock NEVER spawns adjacent to or within reach of an initial drag.
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

  // Adaptive separation scaled by screen size (220px to 320px)
  const minSep = Math.max(
    OVERSCROLL_MIN_SEPARATION_PX,
    Math.min(320, (isHorizontal ? winW : winH) * 0.28),
  );

  const EDGE_MARGIN = 56;

  if (isHorizontal) {
    const isPullingLeft = isRtl ? direction === "prev" : direction === "next";

    // Where is the finger when the overscroll gesture engages? (35px past startX)
    const engagedX = isPullingLeft
      ? startX - OVERSCROLL_ENGAGE_THRESHOLD_PX
      : startX + OVERSCROLL_ENGAGE_THRESHOLD_PX;

    // Available horizontal runway in the drag direction
    const runwayX = isPullingLeft
      ? engagedX - EDGE_MARGIN
      : (winW - EDGE_MARGIN) - engagedX;

    let targetX: number;
    let targetY: number;

    if (runwayX >= minSep + 60) {
      // Clean runway across screen: place target on destination side
      targetX = isPullingLeft
        ? Math.max(EDGE_MARGIN, Math.min(cx - 75, winW * 0.18))
        : Math.min(winW - EDGE_MARGIN, Math.max(cx + 75, winW * 0.82));

      // Keep targetY roughly aligned with finger, avoiding center card
      targetY = startY;
      if (Math.abs(targetY - cy) < OVERSCROLL_CARD_AVOID_H_PX) {
        targetY = startY < cy
          ? cy - OVERSCROLL_CARD_AVOID_H_PX
          : cy + OVERSCROLL_CARD_AVOID_H_PX;
      }
    } else {
      // Starting on the destination side or near edge:
      // Apply orbital deflection into the open vertical quadrant.
      const availableX = Math.max(30, runwayX);
      targetX = isPullingLeft
        ? Math.max(EDGE_MARGIN, engagedX - availableX)
        : Math.min(winW - EDGE_MARGIN, engagedX + availableX);

      const horizDist = Math.abs(targetX - engagedX);
      const neededY = Math.sqrt(Math.max(0, minSep * minSep - horizDist * horizDist));

      // Orbit towards the open vertical half of the screen
      if (startY < cy) {
        // Upper half -> project downward towards lower quadrant
        targetY = cy + OVERSCROLL_CARD_AVOID_H_PX + (neededY * 0.5);
        if (targetY > winH - EDGE_MARGIN) {
          targetY = Math.max(EDGE_MARGIN, cy - OVERSCROLL_CARD_AVOID_H_PX - neededY);
        }
      } else {
        // Lower half -> project upward towards upper quadrant
        targetY = cy - OVERSCROLL_CARD_AVOID_H_PX - (neededY * 0.5);
        if (targetY < EDGE_MARGIN) {
          targetY = Math.min(winH - EDGE_MARGIN, cy + OVERSCROLL_CARD_AVOID_H_PX + neededY);
        }
      }
    }

    // Final safety card avoidance check
    if (Math.abs(targetX - cx) < OVERSCROLL_CARD_AVOID_W_PX && Math.abs(targetY - cy) < OVERSCROLL_CARD_AVOID_H_PX) {
      if (Math.abs(targetY - cy) < Math.abs(targetX - cx)) {
        targetY = targetY < cy ? cy - OVERSCROLL_CARD_AVOID_H_PX : cy + OVERSCROLL_CARD_AVOID_H_PX;
      } else {
        targetX = targetX < cx ? cx - OVERSCROLL_CARD_AVOID_W_PX : cx + OVERSCROLL_CARD_AVOID_W_PX;
      }
    }

    const clampedX = Math.max(EDGE_MARGIN, Math.min(winW - EDGE_MARGIN, targetX));
    const clampedY = Math.max(EDGE_MARGIN, Math.min(winH - EDGE_MARGIN, targetY));
    return { targetX: clampedX, targetY: clampedY };
  } else {
    // Vertical continuous scroll mode
    const isPullingUp = direction === "next";

    const engagedY = isPullingUp
      ? startY - OVERSCROLL_ENGAGE_THRESHOLD_PX
      : startY + OVERSCROLL_ENGAGE_THRESHOLD_PX;

    const runwayY = isPullingUp
      ? engagedY - EDGE_MARGIN
      : (winH - EDGE_MARGIN) - engagedY;

    let targetX: number;
    let targetY: number;

    if (runwayY >= minSep + 60) {
      targetY = isPullingUp
        ? Math.max(EDGE_MARGIN, Math.min(cy - 75, winH * 0.18))
        : Math.min(winH - EDGE_MARGIN, Math.max(cy + 75, winH * 0.82));

      targetX = startX;
      if (Math.abs(targetX - cx) < OVERSCROLL_CARD_AVOID_W_PX) {
        targetX = startX < cx
          ? cx - OVERSCROLL_CARD_AVOID_W_PX
          : cx + OVERSCROLL_CARD_AVOID_W_PX;
      }
    } else {
      // Starting near top/bottom edge: apply orbital deflection into horizontal quadrant
      const availableY = Math.max(30, runwayY);
      targetY = isPullingUp
        ? Math.max(EDGE_MARGIN, engagedY - availableY)
        : Math.min(winH - EDGE_MARGIN, engagedY + availableY);

      const vertDist = Math.abs(targetY - engagedY);
      const neededX = Math.sqrt(Math.max(0, minSep * minSep - vertDist * vertDist));

      if (startX < cx) {
        targetX = cx + OVERSCROLL_CARD_AVOID_W_PX + (neededX * 0.5);
        if (targetX > winW - EDGE_MARGIN) {
          targetX = Math.max(EDGE_MARGIN, cx - OVERSCROLL_CARD_AVOID_W_PX - neededX);
        }
      } else {
        targetX = cx - OVERSCROLL_CARD_AVOID_W_PX - (neededX * 0.5);
        if (targetX < EDGE_MARGIN) {
          targetX = Math.min(winW - EDGE_MARGIN, cx + OVERSCROLL_CARD_AVOID_W_PX + neededX);
        }
      }
    }

    // Safety card avoidance check
    if (Math.abs(targetX - cx) < OVERSCROLL_CARD_AVOID_W_PX && Math.abs(targetY - cy) < OVERSCROLL_CARD_AVOID_H_PX) {
      if (Math.abs(targetX - cx) < Math.abs(targetY - cy)) {
        targetX = targetX < cx ? cx - OVERSCROLL_CARD_AVOID_W_PX : cx + OVERSCROLL_CARD_AVOID_W_PX;
      } else {
        targetY = targetY < cy ? cy - OVERSCROLL_CARD_AVOID_H_PX : cy + OVERSCROLL_CARD_AVOID_H_PX;
      }
    }

    const clampedX = Math.max(EDGE_MARGIN, Math.min(winW - EDGE_MARGIN, targetX));
    const clampedY = Math.max(EDGE_MARGIN, Math.min(winH - EDGE_MARGIN, targetY));
    return { targetX: clampedX, targetY: clampedY };
  }
};

export const isOverscrollReady = (fingerX: number, fingerY: number, targetX: number, targetY: number): boolean => {
  return Math.hypot(fingerX - targetX, fingerY - targetY) <= OVERSCROLL_COLLISION_RADIUS_PX;
};
