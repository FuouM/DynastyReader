/**
 * Shared legend bar for downloaded chapters views.
 * Shows color-coded swatches for Downloaded, Read, and Bookmarked states.
 * Extracted from `BrowseDownloaded.tsx` / `CacheView.tsx` for modularity.
 */

import { CheckIcon } from "../../components/Icon";

export function DownloadedLegend() {
  return (
    <div class="ds-downloaded-legend">
      <span class="ds-legend-title">Legend:</span>
      <span class="ds-legend-item">
        <span class="ds-legend-swatch downloaded" />
        <span>Downloaded</span>
      </span>
      <span class="ds-legend-item">
        <span class="ds-legend-swatch read"><CheckIcon size={10} /></span>
        <span>Read</span>
      </span>
      <span class="ds-legend-item">
        <span class="ds-legend-swatch bookmarked" />
        <span>Bookmarked</span>
      </span>
    </div>
  );
}
