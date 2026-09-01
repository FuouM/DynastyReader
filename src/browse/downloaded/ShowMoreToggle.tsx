/**
 * Show more/fewer toggle button for expandable lists.
 * Extracted from `SeriesDownloadedCard.tsx` / `OrphanDownloadedCard.tsx`
 * for modularity.
 */

import { Show } from "solid-js";
import { t } from "../../i18n";

interface ShowMoreToggleProps {
  total: number;
  threshold: number;
  listLimit: number;
  onToggle: () => void;
}

export function ShowMoreToggle(props: ShowMoreToggleProps) {
  return (
    <Show when={props.total > props.threshold}>
      <div style="display:flex;justify-content:center;padding:4px 0;margin-top:2px;">
        <button
          type="button"
          class="win-button ds-btn-sm"
          onClick={props.onToggle}
          style="font-size:11px;padding:1px 10px;"
        >
          {props.listLimit === -1
            ? t("downloaded.showFewer")
            : t("downloaded.showAllChapters", { count: props.total })}
        </button>
      </div>
    </Show>
  );
}
