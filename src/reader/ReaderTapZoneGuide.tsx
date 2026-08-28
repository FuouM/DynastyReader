/**
 * Tap-to-turn zone indicator HUD overlay for horizontal reader mode.
 * Shows left/center/right touch regions when the user long-presses.
 * Extracted from `ReaderViewport.tsx` for modularity.
 */

import type { ReadingDirection } from "../types/reader";
import { ChevronLeftIcon, ChevronRightIcon, Icon } from "../components/Icon";
import { t } from "../i18n";

export interface TapZoneGuideState {
  activeZone: "left" | "center" | "right";
}

export interface ReaderTapZoneGuideProps {
  guide: TapZoneGuideState;
  readingDirection: ReadingDirection;
}

export function ReaderTapZoneGuide(props: ReaderTapZoneGuideProps) {
  const isRtl = () => props.readingDirection === "rtl";
  const leftLabel = () => isRtl() ? t("reader.tapZones.nextPage") : t("reader.tapZones.prevPage");
  const rightLabel = () => isRtl() ? t("reader.tapZones.prevPage") : t("reader.tapZones.nextPage");
  const leftIcon = () => isRtl() ? <ChevronRightIcon /> : <ChevronLeftIcon />;
  const rightIcon = () => isRtl() ? <ChevronLeftIcon /> : <ChevronRightIcon />;

  return (
    <div class="ds-tap-zone-guide">
      <div class="ds-tap-zone ds-tap-zone-side" classList={{ "is-active": props.guide.activeZone === "left" }}>
        <div class="ds-tap-zone-pill">
          {leftIcon()}
          <span>{leftLabel()}</span>
        </div>
      </div>
      <div class="ds-tap-zone ds-tap-zone-center" classList={{ "is-active": props.guide.activeZone === "center" }}>
        <div class="ds-tap-zone-pill">
          <Icon name="layout-text-window" />
          <span>{t("reader.tapZones.toggleMenu")}</span>
        </div>
      </div>
      <div class="ds-tap-zone ds-tap-zone-side" classList={{ "is-active": props.guide.activeZone === "right" }}>
        <div class="ds-tap-zone-pill">
          <span>{rightLabel()}</span>
          {rightIcon()}
        </div>
      </div>
    </div>
  );
}
