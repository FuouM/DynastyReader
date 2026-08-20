/**
 * "Add to collection" folder-plus button. Consolidated from three inline
 * copies (FeedItemRow, BrowseSearch SearchResultRow, SeriesView topbar).
 * The caller decides the collection item and opens the modal via
 * `useAddToCollection().open`.
 */

import type { JSX } from "solid-js";

export interface AddToCollectionButtonProps {
  onOpen: (anchorEl: HTMLElement) => void;
  title?: string;
  /** Extra classes appended to `win-button` (defaults to `ds-btn-compact`). */
  class?: string;
  cssText?: string;
  /** Optional trailing label after the icon (e.g. "Add to..."). */
  children?: JSX.Element;
}

export function AddToCollectionButton(props: AddToCollectionButtonProps) {
  const cls = ["win-button", props.class ?? "ds-btn-compact"]
    .filter(Boolean)
    .join(" ");
  return (
    <button
      type="button"
      class={cls}
      style={props.cssText}
      title={props.title ?? "Add to Favorites or custom collections"}
      onClick={(ev) => {
        ev.stopPropagation();
        props.onOpen(ev.currentTarget as HTMLElement);
      }}
    >
      <i class="bi bi-folder-plus"></i>
      {props.children}
    </button>
  );
}