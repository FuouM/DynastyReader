/**
 * Reader strip: renders the container `#ds-reader-strip` and its children.
 * In scroll/single mode, renders direct `<ReaderSlot>` children.
 * In spread mode, renders spread wrapper divs with `.ds-spread-slot` and `.ds-spread-canvas`.
 */

import { createMemo, For, onCleanup, Show } from "solid-js";
import type { SpreadGroup } from "../types/reader";
import type { ReaderSession } from "./reader-session";
import { ReaderSlot } from "./ReaderSlot";
export interface ReaderStripProps {
  session: ReaderSession;
}

export function ReaderStrip(props: ReaderStripProps) {
  const s = props.session;

  return (
    <div
      id="ds-reader-strip"
      ref={(el) => {
        s.stripEl = el;
      }}
      classList={{
        rtl: s.isHorizontal() && s.direction() === "rtl",
        ltr: s.isHorizontal() && s.direction() === "ltr",
      }}
    >
      <Show
        when={s.isSpread()}
        fallback={
          <For each={s.pages()}>
            {(_, i) => <ReaderSlot session={s} index={i()} />}
          </For>
        }
      >
        <For each={s.spreads()}>
          {(group) => <SpreadSlot session={s} group={group} />}
        </For>
      </Show>
    </div>
  );
}

/**
 * One spread slide (single page or dual-page pair). Extracted from the `<For>`
 * render callback so its memo lives on the component owner — stable across
 * spread reconciliations that reuse the group's identity (RD-M1/RD-H3).
 */
function SpreadSlot(props: { session: ReaderSession; group: SpreadGroup }) {
  const s = props.session;
  const single = props.group.pageIndices.length === 1;
  let elRef: HTMLElement | undefined;

  onCleanup(() => {
    // Release the session's spread-slot ref so disposed elements are not pinned (RD-H1).
    if (elRef && s.spreadSlotEls[props.group.spreadIndex] === elRef) {
      s.spreadSlotEls[props.group.spreadIndex] = null;
    }
  });

  const spreadStyle = createMemo(() => {
    if (single || props.group.pageIndices.length !== 2) return undefined;
    const [p0, p1] = props.group.pageIndices;
    const d0 = s.pageDimensions[0][p0];
    const d1 = s.pageDimensions[0][p1];
    if (!d0 || !d1 || d0.height <= 0 || d1.height <= 0) return undefined;

    // Scaled widths when normalized to equal height H:
    // w0' = d0.width * (H / d0.height), w1' = d1.width * (H / d1.height)
    const w0 = d0.width / d0.height;
    const w1 = d1.width / d1.height;
    const total = w0 + w1;
    if (total <= 0) return undefined;

    const pct0 = (w0 / total) * 100;
    const pct1 = (w1 / total) * 100;
    const targetHeight = Math.max(d0.height, d1.height);

    return {
      "--spread-pct-0": `${pct0}%`,
      "--spread-pct-1": `${pct1}%`,
      "--spread-ratio": `${total}`,
      "--spread-orig-height": `${targetHeight}px`,
    };
  });

  return (
    <div
      class="ds-spread-slot"
      classList={{
        rtl: s.direction() === "rtl",
        ltr: s.direction() === "ltr",
        "ds-spread-single": single,
      }}
      data-spread-index={props.group.spreadIndex}
      style={spreadStyle()}
      ref={(el) => {
        elRef = el;
        s.spreadSlotEls[props.group.spreadIndex] = el;
      }}
    >
      <div
        class="ds-spread-canvas"
        classList={{
          rtl: s.direction() === "rtl",
          ltr: s.direction() === "ltr",
          "ds-spread-single": single,
        }}
      >
        <For each={props.group.pageIndices}>
          {(pageIndex, i) => (
            <ReaderSlot
              session={s}
              index={pageIndex}
              style={
                single
                  ? { flex: "0 0 100%" }
                  : { flex: `0 0 var(--spread-pct-${i()}, 50%)`, "--spread-flex": `0 0 var(--spread-pct-${i()}, 50%)` }
              }
            />
          )}
        </For>
      </div>
    </div>
  );
}
