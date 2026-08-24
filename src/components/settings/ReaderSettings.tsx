import { createSignal } from "solid-js";
import {
  isAutoCacheChapterEnabled,
  setAutoCacheChapterEnabled,
  getPrefetchBuffer,
  setPrefetchBuffer,
  getReaderNavPosition,
  setReaderNavPosition,
  getDefaultReaderMode,
  setDefaultReaderMode,
  getDefaultPagedLayout,
  setDefaultPagedLayout,
  isLongStripSpreadOverrideEnabled,
  setLongStripSpreadOverrideEnabled,
  isLongStripFitWidthEnabled,
  setLongStripFitWidthEnabled,
  getDefaultReadingDirection,
  setDefaultReadingDirection,
  isCoverOffsetDefaultEnabled,
  setCoverOffsetDefaultEnabled,
  getDefaultFitMode,
  setDefaultFitMode,
  type ReadingDirectionSetting,
} from "../../reader/settings";
import type { FitMode, ReaderMode, PagedLayout } from "../../types/reader";
import { t } from "../../i18n";
import { DoublePageIcon, CloudDownloadIcon, Icon } from "../Icon";
import { DsSelect, IconText, IconButton, SegmentedSwitch, ToggleButton } from "../Button";
import { SettingsRow } from "../SettingsRow";

export function ReaderSettings() {
  const [autoCacheEnabled, setAutoCacheEnabled] = createSignal(isAutoCacheChapterEnabled());
  const [prefetchBuffer, setPrefetchBufferLocal] = createSignal(getPrefetchBuffer());
  const [navPosition, setNavPosition] = createSignal(getReaderNavPosition());
  const [readerModePref, setReaderModePref] = createSignal<ReaderMode>(getDefaultReaderMode());
  const [pagedLayoutPref, setPagedLayoutPref] = createSignal<PagedLayout>(getDefaultPagedLayout());
  const [longStripOverride, setLongStripOverride] = createSignal<boolean>(isLongStripSpreadOverrideEnabled());
  const [longStripFitWidth, setLongStripFitWidth] = createSignal<boolean>(isLongStripFitWidthEnabled());
  const [directionPref, setDirectionPref] = createSignal<ReadingDirectionSetting>(getDefaultReadingDirection());
  const [coverOffsetPref, setCoverOffsetPref] = createSignal<boolean>(isCoverOffsetDefaultEnabled());
  const [fitModePref, setFitModePref] = createSignal<FitMode>(getDefaultFitMode());

  return (
    <div class="group-box" id="ds-settings-sec-reading">
      <div class="group-box-title">
        <IconText icon={<DoublePageIcon />}>{t("settings.reader.title")}</IconText>
      </div>
      <div class="ds-col">
        {/* Reading Direction */}
        <SettingsRow label={<>{t("settings.reader.readingDirection")}:</>} desc={t("settings.reader.readingDirectionDesc")}>
          <SegmentedSwitch
            id="ds-settings-direction-switch"
            value={directionPref()}
            onChange={(val) => { setDefaultReadingDirection(val as ReadingDirectionSetting); setDirectionPref(val as ReadingDirectionSetting); }}
            options={[
              { id: "ds-settings-dir-auto", value: "auto", icon: <Icon name="magic" />, text: t("settings.reader.dirAutoLabel"), title: t("settings.reader.dirAutoTooltip") },
              { id: "ds-settings-dir-rtl", value: "rtl", icon: <Icon name="arrow-left" />, text: t("settings.reader.dirRtlLabel"), title: t("settings.reader.dirRtlTooltip") },
              { id: "ds-settings-dir-ltr", value: "ltr", icon: <Icon name="arrow-right" />, text: t("settings.reader.dirLtrLabel"), title: t("settings.reader.dirLtrTooltip") },
            ]}
          />
        </SettingsRow>

        {/* Default Reading Mode */}
        <SettingsRow divider label={<>{t("settings.reader.defaultMode")}:</>} desc={t("settings.reader.defaultModeDesc")}>
          <SegmentedSwitch
            id="ds-settings-mode-switch"
            value={readerModePref()}
            onChange={(val) => { setDefaultReaderMode(val as ReaderMode); setReaderModePref(val as ReaderMode); }}
            options={[
              { id: "ds-settings-mode-scroll", value: "scroll", icon: <Icon name="view-stacked" />, text: t("settings.reader.modeScrollLabel"), title: t("settings.reader.modeScrollTooltip") },
              { id: "ds-settings-mode-paged", value: "paged", icon: <Icon name="book" />, text: t("settings.reader.modePagedLabel"), title: t("settings.reader.modePagedTooltip") },
            ]}
          />
        </SettingsRow>

        {/* Default Paged Layout */}
        <SettingsRow divider label={<>{t("settings.reader.pagedLayout")}:</>} desc={t("settings.reader.pagedLayoutDesc")}>
          <SegmentedSwitch
            id="ds-settings-layout-switch"
            value={pagedLayoutPref()}
            onChange={(val) => { setDefaultPagedLayout(val as PagedLayout); setPagedLayoutPref(val as PagedLayout); }}
            options={[
              { id: "ds-settings-layout-single", value: "single", icon: <Icon name="file-earmark" />, text: t("settings.reader.layoutSingleLabel"), title: t("settings.reader.layoutSingleTooltip") },
              { id: "ds-settings-layout-spread", value: "spread", icon: <Icon name="columns-gap" />, text: t("settings.reader.layoutSpreadLabel"), title: t("settings.reader.layoutSpreadTooltip") },
            ]}
          />
        </SettingsRow>

        {/* Long Strip Spread Override */}
        <SettingsRow divider label={<>{t("settings.reader.longStripOverride")}:</>} desc={t("settings.reader.longStripOverrideDesc")}>
          <ToggleButton
            id="ds-settings-longstrip-toggle"
            style="font-size:11px;padding:2px 10px;min-width:105px;"
            value={longStripOverride()}
            icon={<Icon name="slash-circle" />}
            activeIcon={<Icon name="check-circle" />}
            text={t("settings.reader.longStripOverrideDisabled")}
            activeText={t("settings.reader.longStripOverrideEnabled")}
            title={t("settings.reader.longStripOverrideTooltip")}
            onToggle={(next) => { setLongStripSpreadOverrideEnabled(next); setLongStripOverride(next); }}
          />
        </SettingsRow>

        {/* Long Strip Auto Fit Width */}
        <SettingsRow divider label={<>{t("settings.reader.longStripFitWidth")}:</>} desc={t("settings.reader.longStripFitWidthDesc")}>
          <ToggleButton
            id="ds-settings-longstrip-fit-toggle"
            style="font-size:11px;padding:2px 10px;min-width:105px;"
            value={longStripFitWidth()}
            icon={<Icon name="slash-circle" />}
            activeIcon={<Icon name="check-circle" />}
            text={t("settings.reader.longStripFitWidthDisabled")}
            activeText={t("settings.reader.longStripFitWidthEnabled")}
            title={t("settings.reader.longStripFitWidthTooltip")}
            onToggle={(next) => { setLongStripFitWidthEnabled(next); setLongStripFitWidth(next); }}
          />
        </SettingsRow>

        {/* Spread Standalone Cover */}
        <SettingsRow divider label={<>{t("settings.reader.coverOffset")}:</>} desc={t("settings.reader.coverOffsetDesc")}>
          <ToggleButton
            id="ds-settings-cover-offset-toggle"
            style="font-size:11px;padding:2px 10px;min-width:95px;"
            value={coverOffsetPref()}
            icon={<Icon name="dash-circle" />}
            activeIcon={<Icon name="book-half" />}
            text={t("settings.reader.coverOffsetOff")}
            activeText={t("settings.reader.coverOffsetOn")}
            title={t("settings.reader.coverOffsetTooltip")}
            onToggle={(next) => { setCoverOffsetDefaultEnabled(next); setCoverOffsetPref(next); }}
          />
        </SettingsRow>

        {/* Default Fit Mode */}
        <SettingsRow divider label={<>{t("settings.reader.fitMode")}:</>} desc={t("settings.reader.fitModeDesc")}>
          <DsSelect
            id="ds-settings-fit-select"
            style="width:130px;"
            value={fitModePref()}
            onChange={(val) => {
              setDefaultFitMode(val as FitMode);
              setFitModePref(val as FitMode);
            }}
            options={[
              { value: "width", label: t("settings.reader.fitModes.width") },
              { value: "height", label: t("settings.reader.fitModes.height") },
              { value: "original", label: t("settings.reader.fitModes.original") },
            ]}
          />
        </SettingsRow>

        {/* Auto Cache Entire Chapter */}
        <SettingsRow divider label={<>{t("settings.reader.autoCache")}:</>} desc={t("settings.reader.autoCacheDesc")}>
          <ToggleButton
            id="ds-settings-autocache-toggle"
            style="font-size:11px;padding:2px 10px;min-width:70px;"
            value={autoCacheEnabled()}
            icon={<Icon name="cloud-slash" />}
            activeIcon={<CloudDownloadIcon />}
            text={t("settings.reader.autoCacheOff")}
            activeText={t("settings.reader.autoCacheOn")}
            title={autoCacheEnabled() ? t("settings.reader.autoCacheTooltipOn") : t("settings.reader.autoCacheTooltipOff")}
            onToggle={(next) => { setAutoCacheChapterEnabled(next); setAutoCacheEnabled(next); }}
          />
        </SettingsRow>

        {/* Page Prefetch Buffer */}
        <SettingsRow divider label={<>{t("settings.reader.prefetchBuffer")}:</>} desc={t("settings.reader.prefetchBufferDesc")}>
          <div style="display:flex;align-items:center;gap:4px;">
            <IconButton
              className="ds-btn-icon"
              id="ds-settings-prefetch-dec"
              icon={<Icon name="dash-lg" />}
              title="−"
              onClick={() => { const next = Math.max(0, prefetchBuffer() - 1); setPrefetchBuffer(next); setPrefetchBufferLocal(next); }}
            />
            <span id="ds-settings-prefetch-val" style="font-size:11px;font-weight:600;min-width:54px;text-align:center;">
              {prefetchBuffer() === 0 ? t("settings.reader.prefetchBufferOff") : prefetchBuffer() === 1 ? t("settings.reader.prefetchBufferPage", { count: prefetchBuffer() }) : t("settings.reader.prefetchBufferPages", { count: prefetchBuffer() })}
            </span>
            <IconButton
              className="ds-btn-icon"
              id="ds-settings-prefetch-inc"
              icon={<Icon name="plus-lg" />}
              title="+"
              onClick={() => { const next = Math.min(10, prefetchBuffer() + 1); setPrefetchBuffer(next); setPrefetchBufferLocal(next); }}
            />
          </div>
        </SettingsRow>

        {/* Navigation Bar Position */}
        <SettingsRow divider label={<>{t("settings.reader.navPosition")}:</>} desc={t("settings.reader.navPositionDesc")}>
          <SegmentedSwitch
            id="ds-settings-nav-pos-switch"
            value={navPosition()}
            onChange={(val) => { setReaderNavPosition(val as "top" | "bottom"); setNavPosition(val as "top" | "bottom"); }}
            options={[
              { id: "ds-settings-nav-pos-top", value: "top", icon: <Icon name="align-top" />, text: t("settings.reader.navPosTopLabel"), title: t("settings.reader.navPosTopTooltip") },
              { id: "ds-settings-nav-pos-bottom", value: "bottom", icon: <Icon name="align-bottom" />, text: t("settings.reader.navPosBottomLabel"), title: t("settings.reader.navPosBottomTooltip") },
            ]}
          />
        </SettingsRow>
      </div>
    </div>
  );
}
