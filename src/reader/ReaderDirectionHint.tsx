/**
 * Smart Direction Hint overlay for reader view.
 * Appears contextually when:
 * 1. Paged mode is active and reading direction changes from previous chapter (or initial session load).
 * 2. The user attempts to swipe in the reverse direction on Page 1 (dead-end gesture cue).
 * Fades out automatically after 2.2s or immediately upon any interaction.
 */

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
  let hideTimer: number | null = null;
  let lastDirection: ReadingDirection | null = null;
  let lastPermalink: string | null = null;
  let lastTriggerTick = 0;

  const showHint = (durationMs = 2200) => {
    if (!props.isHorizontal) return;
    setVisible(true);
    if (hideTimer !== null) clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => {
      setVisible(false);
      hideTimer = null;
    }, durationMs);
  };

  const dismiss = () => {
    if (hideTimer !== null) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
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
      // Check if direction changed from previous chapter or if it's first load of session
      const isFirstLoad = lastPermalink === null;
      const isDirChanged = lastDirection !== null && lastDirection !== dir;
      lastPermalink = permalink;
      lastDirection = dir;

      if ((isFirstLoad || isDirChanged) && props.pageIndex === 0) {
        showHint(2400);
      }
    }
  });

  onMount(() => {
    const onUserAction = () => dismiss();
    window.addEventListener("pointerdown", onUserAction, { passive: true, capture: true });
    window.addEventListener("keydown", onUserAction, { passive: true, capture: true });
    onCleanup(() => {
      if (hideTimer !== null) clearTimeout(hideTimer);
      window.removeEventListener("pointerdown", onUserAction, { capture: true });
      window.removeEventListener("keydown", onUserAction, { capture: true });
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
                <span>{t("reader.directionHint.nextPageLtr")}</span>
                <Icon name="chevron-right" />
                <span class="ds-hint-tag">{t("reader.directionHint.ltrTag")}</span>
              </>
            }
          >
            <Icon name="chevron-left" />
            <span>{t("reader.directionHint.nextPageRtl")}</span>
            <span class="ds-hint-tag">{t("reader.directionHint.rtlTag")}</span>
          </Show>
        </div>
      </div>
    </Show>
  );
}
