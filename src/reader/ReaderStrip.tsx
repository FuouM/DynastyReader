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

            const spreadStyle = () => {
              if (single || group.pageIndices.length !== 2) return undefined;
              const [p0, p1] = group.pageIndices;
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
                "--spread-orig-height": `${targetHeight}px`,
              };
            };

            return (
              <div
                class={`ds-spread-slot ${s.direction()}${single ? " ds-spread-single" : ""}`}
                data-spread-index={group.spreadIndex}
                style={spreadStyle()}
                ref={(el) => {
                  s.spreadSlotEls[group.spreadIndex] = el;
                }}
              >
                <div
                  class={`ds-spread-canvas ${s.direction()}${single ? " ds-spread-single" : ""}`}
                >
                  <For each={group.pageIndices}>
                    {(pageIndex, i) => (
                      <ReaderSlot
                        session={s}
                        index={pageIndex}
                        style={
                          single
                            ? { flex: "0 0 100%" }
                            : { "--spread-flex": `0 0 var(--spread-pct-${i()}, 50%)` }
                        }
                      />
                    )}
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
