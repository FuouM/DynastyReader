/**
 * Tag pill component: categorized, styled, clickable tag chips with
 * type→URL routing. Port of `tag-pill.ts`.
 */

import { navigate } from "../stores";
import { tagClass } from "../taxonomy";
import { t } from "../i18n";

export interface TagPillProps {
  type: string;
  name: string;
  permalink?: string;
  compact?: boolean;
}

export function TagPill(props: TagPillProps) {
  const isCompact = props.compact ?? true;

  const activate = (ev: Event) => {
    ev.stopPropagation();
    if (props.permalink) {
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
      searchQuery: props.name,
    });
  };

  return (
    <span
      role="button"
      tabindex="0"
      class={`${tagClass(props.type, props.name)} ${isCompact ? "ds-tag-pill--compact" : "ds-tag-pill--normal"}`}
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