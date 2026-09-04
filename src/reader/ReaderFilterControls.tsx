/**
 * Reader image filter sliders (brightness / contrast / grayscale / sepia).
 * Shared between the desktop reader controls row and the mobile controls
 * sheet. Values persist via persistedSignal and apply through the
 * `--ds-reader-filter` CSS variable on `.ds-page-img` (QoL-R5).
 */

import { t } from "../i18n";
import {
  getReaderFilterBrightness,
  setReaderFilterBrightness,
  getReaderFilterContrast,
  setReaderFilterContrast,
  getReaderFilterGrayscale,
  setReaderFilterGrayscale,
  getReaderFilterSepia,
  setReaderFilterSepia,
  resetReaderFilters,
} from "./settings";
import { IconButton } from "../components/Button";
import { RefreshIcon } from "../components/Icon";

interface FilterSliderProps {
  label: string;
  value: () => number;
  onChange: (v: number) => void;
  min: number;
  max: number;
}

function FilterSlider(props: FilterSliderProps) {
  return (
    <label class="ds-filter-slider" title={props.label}>
      <span class="ds-filter-slider-label">{props.label}</span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={1}
        value={props.value()}
        aria-label={props.label}
        onInput={(e) => props.onChange(parseInt(e.currentTarget.value, 10))}
      />
      <span class="ds-filter-slider-val">{props.value()}%</span>
    </label>
  );
}

export function ReaderFilterControls() {
  const isDefault = () =>
    getReaderFilterBrightness() === 100 &&
    getReaderFilterContrast() === 100 &&
    getReaderFilterGrayscale() === 0 &&
    getReaderFilterSepia() === 0;

  return (
    <div class="ds-reader-filter-controls">
      <FilterSlider
        label={t("settings.reader.filterBrightness")}
        value={getReaderFilterBrightness}
        onChange={setReaderFilterBrightness}
        min={10}
        max={200}
      />
      <FilterSlider
        label={t("settings.reader.filterContrast")}
        value={getReaderFilterContrast}
        onChange={setReaderFilterContrast}
        min={10}
        max={200}
      />
      <FilterSlider
        label={t("settings.reader.filterGrayscale")}
        value={getReaderFilterGrayscale}
        onChange={setReaderFilterGrayscale}
        min={0}
        max={100}
      />
      <FilterSlider
        label={t("settings.reader.filterSepia")}
        value={getReaderFilterSepia}
        onChange={setReaderFilterSepia}
        min={0}
        max={100}
      />
      <IconButton
        className="ds-btn-icon ds-filter-reset"
        icon={<RefreshIcon />}
        title={t("settings.reader.filterResetTooltip")}
        disabled={isDefault()}
        onClick={() => resetReaderFilters()}
      />
    </div>
  );
}
