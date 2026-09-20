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
import { createEffect, createSignal, Show } from "solid-js";
import { Portal } from "solid-js/web";
import { makeEventListener } from "@solid-primitives/event-listener";
import { uiScale } from "../stores/ui-scale";
import { IconButton } from "../components/Button";
import { RefreshIcon, SlidersIcon, CloseIcon } from "../components/Icon";
interface FilterSliderProps {
  label: string;
  value: () => number;
  defaultValue: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
}
function FilterSlider(props: FilterSliderProps) {
  return (
    <label
      class="ds-filter-slider"
      title={`${props.label} (${props.value()}%) — Double-click to reset`}
      onDblClick={(e) => {
        e.preventDefault();
        props.onChange(props.defaultValue);
      }}
    >
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

export function isReaderFilterDefault(): boolean {
  return (
    getReaderFilterBrightness() === 100 &&
    getReaderFilterContrast() === 100 &&
    getReaderFilterGrayscale() === 0 &&
    getReaderFilterSepia() === 0
  );
}
export function ReaderFilterControls(props?: { showReset?: boolean }) {
  const isDefault = isReaderFilterDefault;

  return (
    <div class="ds-reader-filter-controls">
      <FilterSlider
        label={t("settings.reader.filterBrightness")}
        value={getReaderFilterBrightness}
        defaultValue={100}
        onChange={setReaderFilterBrightness}
        min={10}
        max={200}
      />
      <FilterSlider
        label={t("settings.reader.filterContrast")}
        value={getReaderFilterContrast}
        defaultValue={100}
        onChange={setReaderFilterContrast}
        min={10}
        max={200}
      />
      <FilterSlider
        label={t("settings.reader.filterGrayscale")}
        value={getReaderFilterGrayscale}
        defaultValue={0}
        onChange={setReaderFilterGrayscale}
        min={0}
        max={100}
      />
      <FilterSlider
        label={t("settings.reader.filterSepia")}
        value={getReaderFilterSepia}
        defaultValue={0}
        onChange={setReaderFilterSepia}
        min={0}
        max={100}
      />
      <Show when={props?.showReset !== false}>
        <div class="ds-filter-reset-row">
          <IconButton
            className="ds-btn-compact ds-filter-reset-btn"
            icon={<RefreshIcon />}
            text={t("settings.reader.filterResetTooltip")}
            disabled={isDefault()}
            onClick={() => resetReaderFilters()}
          />
        </div>
      </Show>
    </div>
  );
}

export interface ReaderFilterPopoverProps {
  open: boolean;
  anchorEl: HTMLElement | null;
  onClose: () => void;
}

export function ReaderFilterPopover(props: ReaderFilterPopoverProps) {
  const [positionStyle, setPositionStyle] = createSignal("");
  const mountTime = Date.now();

  createEffect(() => {
    if (!props.open) return;
    const scale = uiScale() || 1;
    const anchor = props.anchorEl;
    const width = 250;
    const baseStyle = `width:${width}px;`;

    if (!anchor) {
      setPositionStyle(`${baseStyle}top:40px;right:8px;`);
      return;
    }

    const rect = anchor.getBoundingClientRect();
    const screenBottom = rect.bottom / scale;
    const screenTop = rect.top / scale;
    const screenRight = rect.right / scale;
    const maxW = window.innerWidth / scale;
    const maxH = window.innerHeight / scale;

    let x = screenRight - width;
    if (x + width > maxW - 8) {
      x = maxW - width - 8;
    }
    if (x < 8) x = 8;

    let y = screenBottom + 4;
    if (screenBottom + 190 > maxH && screenTop > 190) {
      y = screenTop - 190 - 4;
    }

    setPositionStyle(`${baseStyle}top:${Math.round(y)}px;left:${Math.round(x)}px;`);
  });

  createEffect(() => {
    if (!props.open) return;
    const handleKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        ev.stopPropagation();
        props.onClose();
      }
    };
    return makeEventListener(window, "keydown", handleKeyDown);
  });

  return (
    <Show when={props.open}>
      <Portal mount={document.body}>
        <div
          class="ds-overlay ds-overlay--transparent"
          onClick={(ev) => {
            if (ev.target === ev.currentTarget) {
              if (Date.now() - mountTime < 150) return;
              props.onClose();
            }
          }}
        >
          <div
            class="ds-popup-card ds-reader-filter-popover"
            style={positionStyle()}
            onClick={(ev) => ev.stopPropagation()}
          >
            <div class="ds-filter-popover-header">
              <span class="ds-filter-popover-title">
                <SlidersIcon />
                <span>{t("settings.reader.filterGroup")}</span>
              </span>
              <div class="ds-filter-popover-actions">
                <IconButton
                  className="ds-btn-icon"
                  style={{ width: "20px", height: "20px" }}
                  icon={<RefreshIcon />}
                  title={t("settings.reader.filterResetTooltip")}
                  disabled={isReaderFilterDefault()}
                  onClick={() => resetReaderFilters()}
                />
                <IconButton
                  className="ds-btn-icon"
                  style={{ width: "20px", height: "20px" }}
                  icon={<CloseIcon />}
                  title={t("common.close")}
                  onClick={() => props.onClose()}
                />
              </div>
            </div>
            <div class="ds-filter-popover-body">
              <ReaderFilterControls showReset={false} />
            </div>
          </div>
        </div>
      </Portal>
    </Show>
  );
}
