/**
 * Centralized strip transform helpers — deduplicates 8×
 * `translateX(${sign * slideIndex * 100}%)` + `transition="none" + offsetWidth` dance.
 */

import type { ReadingDirection } from "../types/reader";

export function stripTranslateX(slideIndex: number, dir: ReadingDirection): string {
  const sign = dir === "rtl" ? 1 : -1;
  return `translate3d(${sign * slideIndex * 100}%, 0, 0)`;
}

export function stripTranslateXWithPull(
  slideIndex: number,
  dir: ReadingDirection,
  pullPx: number,
): string {
  const sign = dir === "rtl" ? 1 : -1;
  return `translate3d(calc(${sign * slideIndex * 100}% + ${pullPx}px), 0, 0)`;
}

/** Instant (no animation) strip placement — forces layout commit when `force` is true. */
export function setStripInstant(
  el: HTMLElement,
  slideIndex: number,
  dir: ReadingDirection,
  force = true,
): void {
  el.style.transition = "none";
  if (force) void el.offsetWidth;
  el.style.transform = stripTranslateX(slideIndex, dir);
  // Clear any leaked willChange from an interrupted animated turn.
  el.style.willChange = "auto";
}

/** Animated strip placement — scopes willChange to the transition window across all platforms. */
export function setStripAnimated(
  el: HTMLElement,
  slideIndex: number,
  dir: ReadingDirection,
  _isMobile?: () => boolean,
): void {
  el.style.willChange = "transform";
  // Fallback: transitionend may never fire if interrupted by instant jump.
  const fallback = window.setTimeout(() => {
    el.style.willChange = "auto";
  }, 400);
  el.addEventListener(
    "transitionend",
    () => {
      window.clearTimeout(fallback);
      el.style.willChange = "auto";
    },
    { once: true },
  );
  el.style.transition = "";
  el.style.transform = stripTranslateX(slideIndex, dir);
}

