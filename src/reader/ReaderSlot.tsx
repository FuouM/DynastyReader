/**
 * Reader page-slot rendering for the strip: cached-page images, per-slot
 * states (spinner / offline / error / idle), and wide-image spread detection.
 * Port of `reader-slots.ts`' render helpers into a reactive JSX component.
 */

import { createSignal, Show, type JSX } from "solid-js";
import type { ReaderSession } from "./reader-session";
import type { SlotStateKind } from "./reader-queue";
import { convertFileSrc } from "../ipc";
import { DsButton } from "../components/Button";
import { Icon } from "../components/Icon";
import { t } from "../i18n";
import { WIDE_RATIO } from "./reader-spread";
import { log } from "../utils/log";
export interface ReaderSlotProps {
  session: ReaderSession;
  index: number;
  style?: string | JSX.CSSProperties;
}

/**
 * Renders one page slot. When the page is cached it shows the `<img>`; when the
 * queue/tooling has set a slot state it shows that state; otherwise it idles.
 */
export function ReaderSlot(props: ReaderSlotProps) {
  const s = props.session;
  const cachedPath = (): string | undefined => s.cachedPages[0][props.index];

  return (
    <div
      class="ds-slot"
      data-index={props.index}
      style={props.style}
      ref={(el) => {
        s.slotEls[props.index] = el;
      }}
    >
      <Show when={cachedPath() !== undefined} fallback={<SlotStateContent session={s} index={props.index} />}>
        <SlotImgContent session={s} index={props.index} path={cachedPath()!} />
      </Show>
    </div>
  );
}

/** Cached page: page badge + `<img>` with re-download + wide-spread detection. */
function SlotImgContent(props: { session: ReaderSession; index: number; path: string }) {
  const s = props.session;
  const [loaded, setLoaded] = createSignal(false);
  let handledDimension = false;

  const handleDimension = (naturalWidth: number, naturalHeight: number) => {
    if (handledDimension || naturalWidth <= 0 || naturalHeight <= 0) return;
    handledDimension = true;
    setLoaded(true);
    s.setPageDimension(props.index, naturalWidth, naturalHeight);
    if (props.index === 0) s.updateFirstSlotHeight();
    if (props.index === s.pages().length - 1) s.updateLastSlotHeight();
    const isWide = naturalWidth > naturalHeight * WIDE_RATIO;
    if (isWide !== s.widePages().has(props.index)) {
      const next = new Set(s.widePages());
      if (isWide) {
        next.add(props.index);
      } else {
        next.delete(props.index);
      }
      s.setWidePages(next);
      // Debounce rebuild so concurrent wide scans don't trigger multiple rapid jumps.
      s.scheduleWidePageLayoutReset();
    }
  };

  return (
    <div class="ds-page-wrap">
      <Show when={loaded()}>
        <div class="ds-slot-page-badge">
          {props.index + 1} / {s.pages().length}
        </div>
      </Show>
      <img
        class="ds-page-img"
        alt={t("reader.session.slot.pageAlt", { page: props.index + 1 })}
        src={convertFileSrc(props.path)}
        decoding="async"
        loading="eager"
        onError={(ev) => {
          log.error("reader-slot", "img onError for slot", props.index, "src:", (ev.currentTarget as HTMLImageElement).src?.slice(0, 100));
          s.onPageImgError(props.index);
        }}
        ref={(img) => {
          if (img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
            handleDimension(img.naturalWidth, img.naturalHeight);
          }
        }}
        onLoad={(ev) => {
          const img = ev.currentTarget as HTMLImageElement;
          handleDimension(img.naturalWidth, img.naturalHeight);
        }}
      />
    </div>
  );
}

/** Non-image slot state (download spinner, offline, error, idle). */
function SlotStateContent(props: { session: ReaderSession; index: number }) {
  const s = props.session;
  const state = (): { kind: SlotStateKind; message: string } | undefined => s.slotStates[0][props.index];
  const kind = (): SlotStateKind => state()?.kind ?? "idle";
  const pct = (): number =>
    s.pages().length > 0 ? Math.round((s.cachedCount() / s.pages().length) * 100) : 0;
  return (
    <div class={`ds-slot-state${kind() === "error" ? " ds-slot-error" : ""}`}>
        <Show when={kind() === "spinner"}>
          <Icon
            name="cloud-arrow-down"
            size="20px"
            color="var(--sys-primary,#0078d4)"
          />
          <div class="ds-slot-pulse-wrap">
            <div class="ds-slot-pulse-bar"></div>
          </div>
          <span>
            {t("reader.session.slot.downloadingProgress", {
              current: props.index + 1,
              total: s.pages().length,
              cached: s.cachedCount(),
              pct: pct(),
            })}
          </span>
        </Show>
        <Show when={kind() === "offline"}>
          <Icon name="wifi-off" size="20px" />
          <span>{state()?.message}</span>
        </Show>
        <Show when={kind() === "idle"}>
          <Icon name="book" size="20px" color="var(--sys-text-muted,#888)" />
          <span>
            {t("reader.session.slot.waitingToRead", {
              current: props.index + 1,
              total: s.pages().length,
            })}
          </span>
        </Show>
        <Show when={kind() === "error"}>
          <Icon name="exclamation-triangle" size="20px" />
          <span>{state()?.message}</span>
          <DsButton
            className="ds-btn-xs"
            onClick={() => s.retrySlot(props.index)}
          >
            {t("common.retry")}
          </DsButton>
        </Show>
    </div>
  );
}
