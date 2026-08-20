/**
 * Tag pill component: categorized, styled, clickable tag chips with
 * type→URL routing. Port of `tag-pill.ts`.
 */

import { navigate, tagClass } from "../stores";

export interface TagPillProps {
  type: string;
  name: string;
  permalink?: string;
  compact?: boolean;
}

export function TagPill(props: TagPillProps) {
  const isCompact = props.compact ?? true;

  return (
    <span
      class={tagClass(props.type, props.name)}
      style={
        isCompact
          ? "font-size:10px;padding:1px 6px;border-radius:2px;"
          : "font-size:10px;padding:2px 6px;border-radius:2px;"
      }
      title={`${props.type}: ${props.name} (click to open)`}
      onClick={(ev) => {
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
      }}
    >
      {props.name}
    </span>
  );
}