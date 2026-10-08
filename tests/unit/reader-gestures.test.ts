import { describe, expect, it } from "vitest";
import {
  getOverscrollTarget,
  isOverscrollReady,
  updateActiveOverscroll,
  OVERSCROLL_COLLISION_RADIUS_PX,
  type OverscrollActive,
} from "../../src/reader/gesture-helpers";
import type { ReaderSession } from "../../src/reader/reader-session";

describe("reader/gesture-helpers - overscroll math & boundary targeting", () => {
  it("computes horizontal overscroll targets that clear the screen center card", () => {
    // 400x600 screen: center is (200, 300)
    const targetPrev = getOverscrollTarget(100, 300, "prev", true, false);
    expect(targetPrev.targetX).toBeGreaterThanOrEqual(48);
    // Target Y must avoid the center card (cy=300)
    expect(Math.abs(targetPrev.targetY - 300)).toBeGreaterThanOrEqual(96);

    const targetNext = getOverscrollTarget(300, 300, "next", true, false);
    expect(targetNext.targetX).toBeGreaterThanOrEqual(48);
    expect(Math.abs(targetNext.targetY - 300)).toBeGreaterThanOrEqual(96);
  });

  it("computes vertical overscroll targets for prev (pull down) and next (pull up)", () => {
    const targetPrev = getOverscrollTarget(200, 50, "prev", false);
    // Pulling down places target at bottom margin
    expect(targetPrev.targetY).toBeGreaterThan(200);

    const targetNext = getOverscrollTarget(200, 550, "next", false);
    // Pulling up places target at top margin
    expect(targetNext.targetY).toBeLessThan(300);
  });

  it("evaluates isOverscrollReady correctly based on collision radius", () => {
    const targetX = 100;
    const targetY = 100;

    // Directly on target
    expect(isOverscrollReady(100, 100, targetX, targetY)).toBe(true);

    // Within collision radius
    const within = OVERSCROLL_COLLISION_RADIUS_PX - 2;
    expect(isOverscrollReady(100 + within, 100, targetX, targetY)).toBe(true);

    // Outside collision radius
    const outside = OVERSCROLL_COLLISION_RADIUS_PX + 5;
    expect(isOverscrollReady(100 + outside, 100, targetX, targetY)).toBe(false);
  });

  it("updates active overscroll distance, damping, and ready state", () => {
    const mockSession = {
      isHorizontal: () => false,
      direction: () => "ltr" as const,
    } as unknown as ReaderSession;

    const active: NonNullable<OverscrollActive> = {
      direction: "next",
      chapter: { permalink: "ch-2", title: "Chapter 2" },
      targetX: 200,
      targetY: 80,
      ready: false,
      dist: 0,
      startX: 200,
      startY: 500,
    };

    // Finger moves towards target (from 500 to 100, dist = 400)
    const updated = updateActiveOverscroll(mockSession, active, 200, 100, false);
    expect(updated.state.dist).toBe(400);
    expect(updated.triggerHaptic).toBe(true);
    expect(updated.state.ready).toBe(true);
    expect(updated.dampedPullPx).toBeLessThan(0); // next pulls up (negative)
  });
});
