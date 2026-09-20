import { For, Show } from "solid-js";
import type { SeriesTag } from "../types/api";
import { navigate } from "../stores/router";
import { isArtistTag, isContainerKind, isScanlatorTag, tagClass } from "../taxonomy";
import { t } from "../i18n";

export interface TagPillProps {
  type: string;
  name: string;
  permalink?: string;
  compact?: boolean;
}

export function TagPill(props: TagPillProps) {
  const activate = (ev: Event) => {
    ev.stopPropagation();
    if (
      props.permalink &&
      (isContainerKind(props.type) || isArtistTag(props.type) || isScanlatorTag(props.type))
    ) {
      navigate({
        view: "series",
        seriesPermalink: props.permalink,
        seriesName: props.name,
      });
      return;
    }

    navigate({
      view: "browse",
      browseTab: "search",
      withTag: props.name,
    });
  };
  return (
    <span
      role="button"
      tabindex="0"
      class={`${tagClass(props.type, props.name)} ${(props.compact ?? true) ? "ds-tag-pill--compact" : "ds-tag-pill--normal"}`}
      title={t("series.clickToOpen", { type: props.type, name: props.name })}
      onClick={activate}
      onKeyDown={(ev) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          activate(ev);
        }
      }}
    >
      {props.name}
    </span>
  );
}

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
