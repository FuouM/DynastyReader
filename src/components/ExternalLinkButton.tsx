/**
 * External "open in browser" icon button. Consolidated from seven inline
 * copies (FeedItemRow, LibraryItemRow, BrowseDirectory DirectoryRow,
 * BlacklistView, SeriesView topbar, SettingsModal, reader-actions).
 */

import { openExternal } from "../api";
import { IconButton } from "./Button";
import { ExternalLinkIcon } from "./Icon";
import type { IconButtonProps } from "./Button";

export interface ExternalLinkButtonProps extends Omit<IconButtonProps, "onClick" | "icon"> {
  url: string;
}

export function ExternalLinkButton(props: ExternalLinkButtonProps) {
  return (
    <IconButton
      id={props.id}
      className={props.className ?? (props.text ? "ds-btn-compact" : "ds-btn-icon-sm")}
      cssText={props.cssText}
      title={props.title}
      icon={<ExternalLinkIcon />}
      text={props.text}
      textClass={props.textClass}
      classList={props.classList}
      disabled={props.disabled}
      onClick={(ev) => {
        ev.stopPropagation();
        void openExternal(props.url);
      }}
    />
  );
}