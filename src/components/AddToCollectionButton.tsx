/**
 * "Add to collection" folder-plus button. Consolidated from three inline
 * copies (FeedItemRow, BrowseSearch SearchResultRow, SeriesView topbar).
 * The caller decides the collection item and opens the modal via
 * `useAddToCollection().open`.
 */

import { t } from "../i18n";
import { Button } from "./Button";
import { FolderIcon } from "./Icon";
import type { ButtonProps } from "./Button";

export interface AddToCollectionButtonProps extends Omit<ButtonProps, "onClick" | "icon"> {
  onOpen: (anchorEl: HTMLElement) => void;
}

export function AddToCollectionButton(props: AddToCollectionButtonProps) {
  return (
    <Button
      className={props.className}
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