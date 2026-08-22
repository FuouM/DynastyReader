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
      <div class="ds-tag-row">
        <span class="ds-tag-row-label">
          {props.label}
        </span>
        <div class="ds-tag-row-pills">
          <For each={props.tags}>
            {(t) => <TagPill type={t.type} name={t.name} permalink={t.permalink} />}
          </For>
        </div>
      </div>
    </Show>
  );
}