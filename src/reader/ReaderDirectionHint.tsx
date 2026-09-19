/**
 * Smart Direction Hint overlay for reader view.
 * Appears contextually when:
 * 1. Paged mode is active and reading direction changes from previous chapter (or initial session load).
 * 2. The user attempts to swipe in the reverse direction on Page 1 (dead-end gesture cue).
 * Fades out automatically after 2.2s or immediately upon any interaction.
 */

import { makeEventListener } from "@solid-primitives/event-listener";
import { createSignal, onMount, onCleanup, createEffect, Show } from "solid-js";
import type { ReadingDirection } from "../types/reader";
import { t } from "../i18n";
import { Icon } from "../components/Icon";

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
