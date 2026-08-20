/**
 * "Available Offline (Fully Cached)" badge shown next to titles of fully
 * cached chapters. Consolidated from four inline copies (FeedItemRow,
 * LibraryItemRow, SeriesView ChapterRow, BrowseSearch SearchResultRow).
 */

import { Show } from "solid-js";

export interface OfflineBadgeProps {
  /** Renders nothing when false. */
  when?: boolean;
}

export function OfflineBadge(props: OfflineBadgeProps) {
  return (
    <Show when={props.when ?? true}>
      <i
        class="bi bi-cloud-check-fill ds-offline-icon"
        style="color:var(--sys-primary,#0078d4);font-size:11px;"
        title="Available Offline (Fully Cached)"
      ></i>
    </Show>
  );
}