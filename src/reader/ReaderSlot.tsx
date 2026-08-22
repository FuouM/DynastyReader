/**
 * Reader page-slot rendering for the strip: cached-page images, per-slot
 * states (spinner / offline / error / idle), and wide-image spread detection.
 * Port of `reader-slots.ts`' render helpers into a reactive JSX component.
 */

import { Show, type JSX } from "solid-js";
import type { ReaderSession } from "./reader-session";
import type { SlotStateKind } from "./reader-queue-solid";
import { convertFileSrc } from "../ipc";
import { WIDE_RATIO } from "./reader-spread";

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
  return (
    <>
      <div class="ds-slot-page-badge">
        {props.index + 1} / {s.pages().length}
      </div>
      <img
        class="ds-page-img"
        alt={`Page ${props.index + 1}`}
        src={convertFileSrc(props.path)}
        decoding="async"
        onError={() => s.onPageImgError(props.index)}
        ref={(img) => {
          if (img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
            s.setPageDimension(props.index, img.naturalWidth, img.naturalHeight);
          }
        }}
        onLoad={(ev) => {
          const img = ev.currentTarget as HTMLImageElement;
          s.setPageDimension(props.index, img.naturalWidth, img.naturalHeight);
          const isWide = img.naturalWidth > img.naturalHeight * WIDE_RATIO;
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
        }}
      />
    </>
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
    <>
      <div class="ds-slot-page-badge">
        {props.index + 1} / {s.pages().length}
      </div>
      <div class={`ds-slot-state${kind() === "error" ? " ds-slot-error" : ""}`}>
        <Show when={kind() === "spinner"}>
          <i
            class="bi bi-cloud-arrow-down"
            style="font-size:20px;color:var(--sys-primary,#0078d4);"
          ></i>
          <div class="ds-slot-pulse-wrap">
            <div class="ds-slot-pulse-bar"></div>
          </div>
          <span>
            Downloading page {props.index + 1} of {s.pages().length} ({s.cachedCount()}/{s.pages().length} cached · {pct()}%)
          </span>
        </Show>
        <Show when={kind() === "offline"}>
          <i class="bi bi-wifi-off" style="font-size:20px;"></i>
          <span>{state()?.message}</span>
        </Show>
        <Show when={kind() === "idle"}>
          <i class="bi bi-book" style="font-size:20px;color:var(--sys-text-muted,#888);"></i>
          <span>
            Page {props.index + 1} of {s.pages().length} · Waiting to read…
          </span>
        </Show>
        <Show when={kind() === "error"}>
          <i class="bi bi-exclamation-triangle" style="font-size:20px;"></i>
          <span>{state()?.message}</span>
          <button
            type="button"
            class="win-button"
            style="font-size:10px;padding:1px 8px;"
            onClick={() => s.retrySlot(props.index)}
          >
            Retry
          </button>
        </Show>
      </div>
    </>
  );
}
