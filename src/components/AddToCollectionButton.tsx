/**
 * "Add to collection" folder-plus button. Consolidated from three inline
 * copies (FeedItemRow, BrowseSearch SearchResultRow, SeriesView topbar).
 * The caller decides the collection item and opens the modal via
 * `useAddToCollection().open`.
 */

import { t } from "../i18n";
import { IconButton } from "./Button";
import { FolderIcon } from "./Icon";
import type { IconButtonProps } from "./Button";

export interface AddToCollectionButtonProps extends Omit<IconButtonProps, "onClick" | "icon"> {
  onOpen: (anchorEl: HTMLElement) => void;
}

export function AddToCollectionButton(props: AddToCollectionButtonProps) {
  return (
    <IconButton
      className={props.className ?? "ds-btn-icon-sm"}
      cssText={props.cssText}
      title={props.title ?? t("browse.feed.addToFavoritesOrCustom")}
      icon={<FolderIcon />}
      text={props.text}
      textClass={props.textClass}
      classList={props.classList}
      disabled={props.disabled}
      onClick={(ev) => {
        ev.stopPropagation();
        props.onOpen(ev.currentTarget as HTMLElement);
      }}
    />
  );
}