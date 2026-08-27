import { For, Show } from "solid-js";
import type { SeriesTag } from "../types/api";
import { TagPill } from "./TagPill";

export interface TagRowProps {
  label: string;
  tags: SeriesTag[];
  /** Visual variant: `"browse"` (default) uses tag-row styles; `"meta"` uses meta-row styles for series headers. */
  variant?: "browse" | "meta";
}

export function TagRow(props: TagRowProps) {
  const isMeta = () => props.variant === "meta";
  return (
    <Show when={props.tags.length > 0}>
      <div class={isMeta() ? "ds-meta-row" : "ds-tag-row"}>
        <span class={isMeta() ? "ds-meta-label" : "ds-tag-row-label"}>
          {props.label}
        </span>
        <div class={isMeta() ? "ds-meta-pills" : "ds-tag-row-pills"}>
          <For each={props.tags}>
            {(t) => <TagPill type={t.type} name={t.name} permalink={t.permalink} compact={!isMeta()} />}
          </For>
        </div>
      </div>
    </Show>
  );
}