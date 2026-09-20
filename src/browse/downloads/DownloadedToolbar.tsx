/**
 * Shared toolbar with filter input, sort select, and chapter count display
 * for downloaded chapters views.
 */

import { Show } from "solid-js";
import { formatBytes } from "../../utils/formatting";
import { t } from "../../i18n";
import { InputField } from "../../components/InputField";
import { DsSelect } from "../../components/Button";
import { StorageIcon, CheckIcon } from "../../components/Icon";
import type { DownloadedSortMode } from "./types";

export interface DownloadedToolbarProps {
  inputId: string;
  inputVal: string;
  onInput: (val: string) => void;
  onClear: () => void;
  inputPlaceholder: string;
  sortId: string;
  sortValue: DownloadedSortMode;
  onSortChange: (val: DownloadedSortMode) => void;
  sortOptions: { value: string; label: string }[];
  totalChapters: number;
  totalBytes: number;
  countLabel?: string;
  cssText?: string;
}

export function DownloadedToolbar(props: DownloadedToolbarProps) {
  return (
    <div id="ds-downloaded-header" class="ds-toolbar" style={props.cssText}>
      <div id="ds-downloaded-toolbar-left" class="ds-toolbar-row">
        <InputField
          id={props.inputId}
          value={props.inputVal}
          onInput={props.onInput}
          placeholder={props.inputPlaceholder}
          onClear={props.onClear}
        />
        <div class="ds-downloaded-sort-wrap">
          <span class="ds-item-meta ds-nowrap" style="font-size:11.5px;color:var(--sys-text-muted,#666);">
            {props.countLabel}
          </span>
          <DsSelect
            id={props.sortId}
            value={props.sortValue}
            onChange={(val) => props.onSortChange(val as DownloadedSortMode)}
            options={props.sortOptions}
          />
        </div>
      </div>

      <div id="ds-downloaded-toolbar-right" class="ds-toolbar-row">
        <span class="ds-muted" id="ds-downloaded-count">
          <StorageIcon />
          <span>
            {props.totalChapters} {t("downloaded.chaptersAbbrev")}
            <Show when={props.totalChapters > 0}>
              {" "}({formatBytes(props.totalBytes)})
            </Show>
          </span>
        </span>
      </div>
    </div>
  );
}

/**
 * Shared legend bar for downloaded chapters views.
 * Shows color-coded swatches for Downloaded, Read, and Bookmarked states.
 */
export function DownloadedLegend() {
  return (
    <div class="ds-downloaded-legend">
      <span class="ds-legend-title">{t("downloaded.legendTitle")}</span>
      <span class="ds-legend-item">
        <span class="ds-legend-swatch downloaded" />
        <span>{t("downloaded.legendDownloaded")}</span>
      </span>
      <span class="ds-legend-item">
        <span class="ds-legend-swatch partial" />
        <span>{t("downloaded.legendPartial")}</span>
      </span>
      <span class="ds-legend-item">
        <span class="ds-legend-swatch read"><CheckIcon size={10} /></span>
        <span>{t("downloaded.legendRead")}</span>
      </span>
      <span class="ds-legend-item">
        <span class="ds-legend-swatch bookmarked" />
        <span>{t("downloaded.legendBookmarked")}</span>
      </span>
    </div>
  );
}
