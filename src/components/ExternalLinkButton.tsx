/**
 * External "open in browser" icon button. Consolidated from seven inline
 * copies (FeedItemRow, LibraryItemRow, BrowseDirectory DirectoryRow,
 * BlacklistView, SeriesView topbar, SettingsModal, reader-actions).
 */

import type { JSX } from "solid-js";
import { openExternal } from "../api";
import { DsButton } from "./Button";
import { ExternalLinkIcon } from "./Icon";

export interface ExternalLinkButtonProps {
  url: string;
  title: string;
  /** Optional DOM id (preserved for any legacy element hooks). */
  id?: string;
  /** Extra classes appended to `win-button` (defaults to `ds-btn-compact`). */
  class?: string;
  cssText?: string;
  /** Optional trailing label after the icon. */
  children?: JSX.Element;
}

export function ExternalLinkButton(props: ExternalLinkButtonProps) {
  const defaultClass = () => (props.class ? props.class : props.children ? "ds-btn-compact" : "ds-btn-icon-sm");

  return (
    <DsButton
      id={props.id}
      className={defaultClass()}
      cssText={props.cssText}
      title={props.title}
      onClick={(ev) => {
        ev.stopPropagation();
        void openExternal(props.url);
      }}
    >
      <ExternalLinkIcon />
      {props.children}
    </DsButton>
  );
}