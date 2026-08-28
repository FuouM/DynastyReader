/**
 * Geometry and collision math for adaptive overscroll lock positioning and gesture thresholds.
 * Extracted from `ReaderViewport.tsx` for testability and modularity.
 */

export const OVERSCROLL_ENGAGE_THRESHOLD_PX = 35;
export const OVERSCROLL_MAX_PULL_PX = 70;
export const SWIPE_MIN_DIST_TOUCH_PX = 35;
export const SWIPE_MIN_DIST_MOUSE_PX = 45;

export const OVERSCROLL_COLLISION_RADIUS_PX = 48;
export const OVERSCROLL_CARD_AVOID_H_PX = 96; // Card half-height + ring radius + safety margin
export const OVERSCROLL_CARD_AVOID_W_PX = 185; // Card half-width + ring radius + safety margin

/**
 * Adaptive overscroll lock positioning with Guaranteed Radial Orbit & Corner Deflection:
 * - The info card is anchored at the exact viewport center (cx, cy).
 * - Target ring has guaranteed Euclidean separation (>= 320px on desktop, >= 220px on mobile)
 *   from the engaged finger position.
 * - When starting across the screen with ample horizontal runway, the target is placed on the destination margin.
 * - When starting on the destination half or near borders, the target automatically deflects into the
 *   opposite vertical quadrant (diagonal orbit), guaranteeing a spacious diagonal trajectory so the lock
 *   NEVER spawns on the same horizontal line right in front of the finger.
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

  const EDGE_MARGIN_X = Math.max(56, Math.min(100, winW * 0.08));
  const EDGE_MARGIN_Y = Math.max(56, Math.min(100, winH * 0.08));

  if (isHorizontal) {
    const isPullingLeft = isRtl ? direction === "prev" : direction === "next";

    // Where is the finger when the overscroll gesture engages? (35px past startX)
    const engagedX = isPullingLeft
      ? startX - OVERSCROLL_ENGAGE_THRESHOLD_PX
      : startX + OVERSCROLL_ENGAGE_THRESHOLD_PX;
    const engagedY = startY;

    // Is the drag starting on the destination half of the screen?
    const isStartingOnDestSide = isPullingLeft ? engagedX < cx + 40 : engagedX > cx - 40;

    let targetX: number;
    let targetY: number;

    if (!isStartingOnDestSide) {
      // Started on the opposite side: clean cross-screen horizontal runway
      targetX = isPullingLeft ? EDGE_MARGIN_X : winW - EDGE_MARGIN_X;

      // Keep target roughly aligned with finger Y, avoiding center card
      targetY = engagedY;
      if (Math.abs(targetY - cy) < OVERSCROLL_CARD_AVOID_H_PX) {
        targetY = engagedY < cy
          ? cy - OVERSCROLL_CARD_AVOID_H_PX - 20
          : cy + OVERSCROLL_CARD_AVOID_H_PX + 20;
      }
    } else {
      // Started on the destination side (or near edge):
      // Apply diagonal corner deflection into the open vertical quadrant
      targetX = isPullingLeft ? EDGE_MARGIN_X : winW - EDGE_MARGIN_X;

      if (engagedY < cy) {
        // Upper quadrant -> deflect to lower destination corner
        targetY = Math.min(winH - EDGE_MARGIN_Y, Math.max(cy + OVERSCROLL_CARD_AVOID_H_PX + 20, winH * 0.74));
      } else {
        // Lower quadrant -> deflect to upper destination corner
        targetY = Math.max(EDGE_MARGIN_Y, Math.min(cy - OVERSCROLL_CARD_AVOID_H_PX - 20, winH * 0.26));
      }
    }

    // Secondary card avoidance check
    if (Math.abs(targetX - cx) < OVERSCROLL_CARD_AVOID_W_PX && Math.abs(targetY - cy) < OVERSCROLL_CARD_AVOID_H_PX) {
      if (Math.abs(targetY - cy) < Math.abs(targetX - cx)) {
        targetY = targetY < cy ? cy - OVERSCROLL_CARD_AVOID_H_PX - 20 : cy + OVERSCROLL_CARD_AVOID_H_PX + 20;
      } else {
        targetX = targetX < cx ? cx - OVERSCROLL_CARD_AVOID_W_PX - 20 : cx + OVERSCROLL_CARD_AVOID_W_PX + 20;
      }
    }

    const clampedX = Math.max(48, Math.min(winW - 48, targetX));
    const clampedY = Math.max(48, Math.min(winH - 48, targetY));
    return { targetX: clampedX, targetY: clampedY };
  } else {
    // Vertical continuous scroll mode
    const isPullingUp = direction === "next";

    const engagedX = startX;
    const engagedY = isPullingUp
      ? startY - OVERSCROLL_ENGAGE_THRESHOLD_PX
      : startY + OVERSCROLL_ENGAGE_THRESHOLD_PX;

    const isStartingOnDestSide = isPullingUp ? engagedY < cy + 40 : engagedY > cy - 40;

    let targetX: number;
    let targetY: number;

    if (!isStartingOnDestSide) {
      // Clean cross-screen vertical runway
      targetY = isPullingUp ? EDGE_MARGIN_Y : winH - EDGE_MARGIN_Y;

      targetX = engagedX;
      if (Math.abs(targetX - cx) < OVERSCROLL_CARD_AVOID_W_PX) {
        targetX = engagedX < cx
          ? cx - OVERSCROLL_CARD_AVOID_W_PX - 20
          : cx + OVERSCROLL_CARD_AVOID_W_PX + 20;
      }
    } else {
      // Started near top/bottom destination margin: deflect into opposite horizontal corner
      targetY = isPullingUp ? EDGE_MARGIN_Y : winH - EDGE_MARGIN_Y;

      if (engagedX < cx) {
        // Left quadrant -> deflect to right destination corner
        targetX = Math.min(winW - EDGE_MARGIN_X, Math.max(cx + OVERSCROLL_CARD_AVOID_W_PX + 20, winW * 0.76));
      } else {
        // Right quadrant -> deflect to left destination corner
        targetX = Math.max(EDGE_MARGIN_X, Math.min(cx - OVERSCROLL_CARD_AVOID_W_PX - 20, winW * 0.24));
      }
    }

    // Secondary card avoidance check
    if (Math.abs(targetX - cx) < OVERSCROLL_CARD_AVOID_W_PX && Math.abs(targetY - cy) < OVERSCROLL_CARD_AVOID_H_PX) {
      if (Math.abs(targetX - cx) < Math.abs(targetY - cy)) {
        targetX = targetX < cx ? cx - OVERSCROLL_CARD_AVOID_W_PX - 20 : cx + OVERSCROLL_CARD_AVOID_W_PX + 20;
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
