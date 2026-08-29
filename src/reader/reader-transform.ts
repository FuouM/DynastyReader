/**
 * Centralized strip transform helpers — deduplicates 8×
 * `translateX(${sign * slideIndex * 100}%)` + `transition="none" + offsetWidth` dance.
 */

import type { ReadingDirection } from "../types/reader";

export function stripTranslateX(slideIndex: number, dir: ReadingDirection): string {
  const sign = dir === "rtl" ? 1 : -1;
  return `translateX(${sign * slideIndex * 100}%)`;
}

export function stripTranslateXWithPull(
  slideIndex: number,
  dir: ReadingDirection,
  pullPx: number,
): string {
  const sign = dir === "rtl" ? 1 : -1;
  return `translateX(calc(${sign * slideIndex * 100}% + ${pullPx}px))`;
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

/** Animated strip placement — optionally scopes willChange to the transition window. */
export function setStripAnimated(
  el: HTMLElement,
  slideIndex: number,
  dir: ReadingDirection,
  isMobile: () => boolean,
): void {
  if (isMobile()) {
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
  }
  el.style.transition = "";
  el.style.transform = stripTranslateX(slideIndex, dir);
}

/** Resets strip to current slide, with `smooth` toggle. */
export function resetStripTo(
  el: HTMLElement,
  slideIndex: number,
  dir: ReadingDirection,
  smooth: boolean,
): void {
  const value = stripTranslateX(slideIndex, dir);
  if (!smooth) {
    el.style.transition = "none";
    void el.offsetWidth;
    el.style.transform = value;
    requestAnimationFrame(() => {
      if (el) el.style.transition = "";
    });
  } else {
    el.style.transform = value;
  }
}
