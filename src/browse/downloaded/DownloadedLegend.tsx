/**
 * Shared legend bar for downloaded chapters views.
 * Shows color-coded swatches for Downloaded, Read, and Bookmarked states.
 * Extracted from `BrowseDownloaded.tsx` / `CacheView.tsx` for modularity.
 */

import { CheckIcon } from "../../components/Icon";
import { t } from "../../i18n";

export function DownloadedLegend() {
  return (
    <div class="ds-downloaded-legend">
      <span class="ds-legend-title">{t("downloaded.legendTitle")}</span>
      <span class="ds-legend-item">
        <span class="ds-legend-swatch downloaded" />
        <span>{t("downloaded.legendDownloaded")}</span>
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
