/**
 * Labeled tag row (72px fixed-width label + wrapping TagPills). Consolidated
 * from the three inline blocks in FeedItemRow. The SeriesView `MetaRow` uses
 * a different layout vocabulary (`ds-meta-*`) and is intentionally left alone.
 */

import { For, Show } from "solid-js";
import type { SeriesTag } from "../types/api";
import { TagPill } from "./TagPill";

export interface TagRowProps {
  label: string;
  tags: SeriesTag[];
}

export function TagRow(props: TagRowProps) {
  return (
    <Show when={props.tags.length > 0}>
      <div style="display:flex;align-items:flex-start;gap:6px;font-size:11px;">
        <span
          style="font-weight:600;color:var(--sys-text-secondary,#555);font-size:10px;width:72px;min-width:72px;flex-shrink:0;padding-top:1px;"
        >
          {props.label}
        </span>
        <div style="display:flex;flex-wrap:wrap;gap:3px;flex:1;">
          <For each={props.tags}>
            {(t) => <TagPill type={t.type} name={t.name} permalink={t.permalink} />}
          </For>
        </div>
      </div>
    </Show>
  );
}