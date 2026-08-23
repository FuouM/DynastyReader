/**
 * "Add to collection" folder-plus button. Consolidated from three inline
 * copies (FeedItemRow, BrowseSearch SearchResultRow, SeriesView topbar).
 * The caller decides the collection item and opens the modal via
 * `useAddToCollection().open`.
 */

import type { JSX } from "solid-js";
import { t } from "../i18n";
import { DsButton } from "./Button";
import { FolderIcon } from "./Icon";

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
  const defaultClass = () => (props.class ? props.class : props.children ? "ds-btn-compact" : "ds-btn-icon-sm");

  return (
    <DsButton
      className={defaultClass()}
      cssText={props.cssText}
      title={props.title ?? t("browse.feed.addToFavoritesOrCustom")}
      onClick={(ev) => {
        ev.stopPropagation();
        props.onOpen(ev.currentTarget as HTMLElement);
      }}
    >
      <FolderIcon />
      {props.children}
    </DsButton>
  );
}