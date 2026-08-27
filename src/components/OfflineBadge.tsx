/**
 * "Available Offline (Fully Cached)" badge shown next to titles of fully
 * cached chapters. Consolidated from four inline copies (FeedItemRow,
 * LibraryItemRow, SeriesView ChapterRow, BrowseSearch SearchResultRow).
 */

import { Show } from "solid-js";
import { t } from "../i18n";
import { Icon } from "./Icon";

export interface OfflineBadgeProps {
  /** Renders nothing when false. */
  when?: boolean;
}

export function OfflineBadge(props: OfflineBadgeProps) {
  return (
    <Show when={props.when ?? true}>
      <Icon
        name="cloud-check-fill"
        class="ds-offline-icon"
        title={t("dialogs.offlineBadge.tooltip")}
      />
    </Show>
  );
}