/**
 * External "open in browser" icon button. Consolidated from seven inline
 * copies (FeedItemRow, LibraryItemRow, BrowseDirectory DirectoryRow,
 * BlacklistView, SeriesView topbar, SettingsModal, reader-actions).
 */

import type { JSX } from "solid-js";
import { openExternal } from "../api";

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
  const cls = ["win-button", props.class ?? "ds-btn-compact"]
    .filter(Boolean)
    .join(" ");
  return (
    <button
      type="button"
      id={props.id}
      class={cls}
      style={props.cssText}
      title={props.title}
      onClick={(ev) => {
        ev.stopPropagation();
        void openExternal(props.url);
      }}
    >
      <i class="bi bi-box-arrow-up-right"></i>
      {props.children}
    </button>
  );
}