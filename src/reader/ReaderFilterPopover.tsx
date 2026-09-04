/**
 * Desktop popover card for reader image filters (brightness, contrast, grayscale, sepia).
 * Anchored to the Filter button in ReaderControlsRow.
 */

import { createEffect, createSignal, onCleanup, Show } from "solid-js";
import { Portal } from "solid-js/web";
import { uiScale } from "../stores";
import { t } from "../i18n";
import { IconButton } from "../components/Button";
import { SlidersIcon, RefreshIcon, CloseIcon } from "../components/Icon";
import { ReaderFilterControls, isReaderFilterDefault } from "./ReaderFilterControls";
import { resetReaderFilters } from "./settings";

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
      setPositionStyle(`${baseStyle}top:68px;right:16px;`);
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

    // Default: open below anchor. If near bottom of viewport, open above anchor.
    let y = screenBottom + 4;
    if (screenBottom + 190 > maxH && screenTop > 190) {
      y = screenTop - 190 - 4;
    }

    setPositionStyle(`${baseStyle}top:${Math.round(y)}px;left:${Math.round(x)}px;`);
  });

  // Handle escape key to close
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape" && props.open) {
      e.stopPropagation();
      props.onClose();
    }
  };
  window.addEventListener("keydown", onKeyDown);
  onCleanup(() => window.removeEventListener("keydown", onKeyDown));

  return (
    <Show when={props.open}>
      <Portal mount={document.getElementById("ds-root") ?? document.body}>
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
