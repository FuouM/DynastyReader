/**
 * Shared item-row primitive. Every list in the app is a row of
 * *leading visual → title line → meta/tag rows → action cluster*, and six
 * renderers (FeedItemRow, LibraryItemRow, SearchResultRow, DirectoryRow,
 * CollectionItemCard, DownloadedRow) previously hand-rolled that skeleton.
 *
 * `ListItem` provides the `ds-item` root (flex layout, read/blacklisted
 * modifiers, click handler) and the `.ds-fill` content column; each row
 * supplies its distinctive `leading` / `title` / `body` / `actions` as JSX
 * slots so no view is forced to lose content or class names.
 */

import { Show, type JSX } from "solid-js";

export interface ListItemProps {
  /** Extra classes on the root row (e.g. `ds-feed-item`, `ds-flex-row`). */
  class?: string;
  /** Extra inline styles on the root row (after the base flex layout). */
  cssText?: string;
  /** Extra inline styles on the `.ds-fill` content column. */
  fillCssText?: string;
  /** Leading visual slot: cover wrap, kind icon, or nothing. */
  leading?: JSX.Element;
  /** Row click handler. */
  onClick?: () => void;
  /** Marks the row read (`ds-item-read`). */
  read?: boolean;
  /** Blacklist dimming (opacity + background). */
  blacklisted?: boolean;
  /** Title line slot (the full row of title + inline badges). */
  title?: JSX.Element;
  /** Content below the title line (subtitle, links, tag rows). */
  body?: JSX.Element;
  /** Right-side action cluster (rendered inside .ds-item-actions). */
  actions?: JSX.Element;
}

export function ListItem(props: ListItemProps) {
  return (
    <div
      class={`ds-item${props.read ? " ds-item-read" : ""}${props.class ? ` ${props.class}` : ""}`}
      style={`display:flex;${props.blacklisted ? "opacity:0.8;background:var(--sys-bg-active,#fcf8f8);" : ""}${props.cssText ?? ""}`}
      onClick={props.onClick}
    >
      {props.leading}
      <div class="ds-fill" style={`min-width:0;${props.fillCssText ?? ""}`}>
        {props.title}
        {props.body}
      </div>
      <Show when={props.actions}>
        <div class="ds-item-actions">
          {props.actions}
        </div>
      </Show>
    </div>
  );
}