/**
 * Reader strip: renders the container `#ds-reader-strip` and its children.
 * In scroll/single mode, renders direct `<ReaderSlot>` children.
 * In spread mode, renders spread wrapper divs with `.ds-spread-slot` and `.ds-spread-canvas`.
 */

import { For, Show } from "solid-js";
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
          {(group) => {
            const single = group.pageIndices.length === 1;
            return (
              <div
                class={`ds-spread-slot ${s.direction()}${single ? " ds-spread-single" : ""}`}
                data-spread-index={group.spreadIndex}
                ref={(el) => {
                  s.spreadSlotEls[group.spreadIndex] = el;
                }}
              >
                <div
                  class={`ds-spread-canvas ${s.direction()}${single ? " ds-spread-single" : ""}`}
                >
                  <For each={group.pageIndices}>
                    {(pageIndex) => <ReaderSlot session={s} index={pageIndex} />}
                  </For>
                </div>
              </div>
            );
          }}
        </For>
      </Show>
    </div>
  );
}
