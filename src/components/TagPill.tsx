/**
 * Tag pill component: categorized, styled, clickable tag chips with
 * type→URL routing. Port of `tag-pill.ts`.
 */

import { navigate } from "../stores";
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