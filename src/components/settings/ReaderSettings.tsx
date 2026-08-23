import { createSignal, Show } from "solid-js";
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
        <DoublePageIcon /> {t("settings.reader.title")}
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        {/* Reading Direction */}
        <SettingsRow label={<>{t("settings.reader.readingDirection")}:</>} desc={t("settings.reader.readingDirectionDesc")}>
          <div class="ds-segmented-switch" id="ds-settings-direction-switch">
            <button type="button" class={`ds-segmented-btn${directionPref() === "auto" ? " active" : ""}`} id="ds-settings-dir-auto" title={t("settings.reader.dirAutoTooltip")} onClick={() => { setDefaultReadingDirection("auto"); setDirectionPref("auto"); }}>
              <Icon name="magic" /> {t("settings.reader.dirAutoLabel")}
            </button>
            <button type="button" class={`ds-segmented-btn${directionPref() === "rtl" ? " active" : ""}`} id="ds-settings-dir-rtl" title={t("settings.reader.dirRtlTooltip")} onClick={() => { setDefaultReadingDirection("rtl"); setDirectionPref("rtl"); }}>
              <Icon name="arrow-left" /> {t("settings.reader.dirRtlLabel")}
            </button>
            <button type="button" class={`ds-segmented-btn${directionPref() === "ltr" ? " active" : ""}`} id="ds-settings-dir-ltr" title={t("settings.reader.dirLtrTooltip")} onClick={() => { setDefaultReadingDirection("ltr"); setDirectionPref("ltr"); }}>
              <Icon name="arrow-right" /> {t("settings.reader.dirLtrLabel")}
            </button>
          </div>
        </SettingsRow>

        {/* Default Reading Mode */}
        <SettingsRow divider label={<>{t("settings.reader.defaultMode")}:</>} desc={t("settings.reader.defaultModeDesc")}>
          <div class="ds-segmented-switch" id="ds-settings-mode-switch">
            <button type="button" class={`ds-segmented-btn${readerModePref() === "scroll" ? " active" : ""}`} id="ds-settings-mode-scroll" title={t("settings.reader.modeScrollTooltip")} onClick={() => { setDefaultReaderMode("scroll"); setReaderModePref("scroll"); }}>
              <Icon name="view-stacked" /> {t("settings.reader.modeScrollLabel")}
            </button>
            <button type="button" class={`ds-segmented-btn${readerModePref() === "paged" ? " active" : ""}`} id="ds-settings-mode-paged" title={t("settings.reader.modePagedTooltip")} onClick={() => { setDefaultReaderMode("paged"); setReaderModePref("paged"); }}>
              <Icon name="book" /> {t("settings.reader.modePagedLabel")}
            </button>
          </div>
        </SettingsRow>

        {/* Default Paged Layout */}
        <SettingsRow divider label={<>{t("settings.reader.pagedLayout")}:</>} desc={t("settings.reader.pagedLayoutDesc")}>
          <div class="ds-segmented-switch" id="ds-settings-layout-switch">
            <button type="button" class={`ds-segmented-btn${pagedLayoutPref() === "single" ? " active" : ""}`} id="ds-settings-layout-single" title={t("settings.reader.layoutSingleTooltip")} onClick={() => { setDefaultPagedLayout("single"); setPagedLayoutPref("single"); }}>
              <Icon name="file-earmark" /> {t("settings.reader.layoutSingleLabel")}
            </button>
            <button type="button" class={`ds-segmented-btn${pagedLayoutPref() === "spread" ? " active" : ""}`} id="ds-settings-layout-spread" title={t("settings.reader.layoutSpreadTooltip")} onClick={() => { setDefaultPagedLayout("spread"); setPagedLayoutPref("spread"); }}>
              <Icon name="columns-gap" /> {t("settings.reader.layoutSpreadLabel")}
            </button>
          </div>
        </SettingsRow>

        {/* Long Strip Spread Override */}
        <SettingsRow divider label={<>{t("settings.reader.longStripOverride")}:</>} desc={t("settings.reader.longStripOverrideDesc")}>
          <button type="button" class={`win-button${longStripOverride() ? " primary" : ""}`} id="ds-settings-longstrip-toggle" style="font-size:11px;padding:2px 10px;min-width:105px;" title={t("settings.reader.longStripOverrideTooltip")} onClick={() => { const next = !longStripOverride(); setLongStripSpreadOverrideEnabled(next); setLongStripOverride(next); }}>
            <Show when={longStripOverride()} fallback={<><Icon name="slash-circle" /> {t("settings.reader.longStripOverrideDisabled")}</>}>
              <Icon name="check-circle" /> {t("settings.reader.longStripOverrideEnabled")}
            </Show>
          </button>
        </SettingsRow>

        {/* Long Strip Auto Fit Width */}
        <SettingsRow divider label={<>{t("settings.reader.longStripFitWidth")}:</>} desc={t("settings.reader.longStripFitWidthDesc")}>
          <button type="button" class={`win-button${longStripFitWidth() ? " primary" : ""}`} id="ds-settings-longstrip-fit-toggle" style="font-size:11px;padding:2px 10px;min-width:105px;" title={t("settings.reader.longStripFitWidthTooltip")} onClick={() => { const next = !longStripFitWidth(); setLongStripFitWidthEnabled(next); setLongStripFitWidth(next); }}>
            <Show when={longStripFitWidth()} fallback={<><Icon name="slash-circle" /> {t("settings.reader.longStripFitWidthDisabled")}</>}>
              <Icon name="check-circle" /> {t("settings.reader.longStripFitWidthEnabled")}
            </Show>
          </button>
        </SettingsRow>

        {/* Spread Standalone Cover */}
        <SettingsRow divider label={<>{t("settings.reader.coverOffset")}:</>} desc={t("settings.reader.coverOffsetDesc")}>
          <button type="button" class={`win-button${coverOffsetPref() ? " primary" : ""}`} id="ds-settings-cover-offset-toggle" style="font-size:11px;padding:2px 10px;min-width:95px;" title={t("settings.reader.coverOffsetTooltip")} onClick={() => { const next = !coverOffsetPref(); setCoverOffsetDefaultEnabled(next); setCoverOffsetPref(next); }}>
            <Show when={coverOffsetPref()} fallback={<><Icon name="dash-circle" /> {t("settings.reader.coverOffsetOff")}</>}>
              <Icon name="book-half" /> {t("settings.reader.coverOffsetOn")}
            </Show>
          </button>
        </SettingsRow>

        {/* Default Fit Mode */}
        <SettingsRow divider label={<>{t("settings.reader.fitMode")}:</>} desc={t("settings.reader.fitModeDesc")}>
          <select id="ds-settings-fit-select" class="input-field" style="width:130px;height:24px;font-size:11px;" value={fitModePref()} onChange={(ev) => { const val = (ev.target as HTMLSelectElement).value as FitMode; setDefaultFitMode(val); setFitModePref(val); }}>
            <option value="width">{t("settings.reader.fitModes.width")}</option>
            <option value="height">{t("settings.reader.fitModes.height")}</option>
            <option value="original">{t("settings.reader.fitModes.original")}</option>
          </select>
        </SettingsRow>

        {/* Auto Cache Entire Chapter */}
        <SettingsRow divider label={<>{t("settings.reader.autoCache")}:</>} desc={t("settings.reader.autoCacheDesc")}>
          <button type="button" class={`win-button${autoCacheEnabled() ? " primary" : ""}`} id="ds-settings-autocache-toggle" style="font-size:11px;padding:2px 10px;min-width:70px;" title={autoCacheEnabled() ? t("settings.reader.autoCacheTooltipOn") : t("settings.reader.autoCacheTooltipOff")} onClick={() => { const next = !autoCacheEnabled(); setAutoCacheChapterEnabled(next); setAutoCacheEnabled(next); }}>
            <Show when={autoCacheEnabled()} fallback={<><Icon name="cloud-slash" /> {t("settings.reader.autoCacheOff")}</>}>
              <CloudDownloadIcon /> {t("settings.reader.autoCacheOn")}
            </Show>
          </button>
        </SettingsRow>

        {/* Page Prefetch Buffer */}
        <SettingsRow divider label={<>{t("settings.reader.prefetchBuffer")}:</>} desc={t("settings.reader.prefetchBufferDesc")}>
          <div style="display:flex;align-items:center;gap:4px;">
            <button type="button" class="win-button ds-btn-icon-sm" id="ds-settings-prefetch-dec" onClick={() => { const next = Math.max(0, prefetchBuffer() - 1); setPrefetchBuffer(next); setPrefetchBufferLocal(next); }}>
              −
            </button>
            <span id="ds-settings-prefetch-val" style="font-size:11px;font-weight:600;min-width:54px;text-align:center;">
              {prefetchBuffer() === 0 ? t("settings.reader.prefetchBufferOff") : prefetchBuffer() === 1 ? t("settings.reader.prefetchBufferPage", { count: prefetchBuffer() }) : t("settings.reader.prefetchBufferPages", { count: prefetchBuffer() })}
            </span>
            <button type="button" class="win-button ds-btn-icon-sm" id="ds-settings-prefetch-inc" onClick={() => { const next = Math.min(10, prefetchBuffer() + 1); setPrefetchBuffer(next); setPrefetchBufferLocal(next); }}>
              +
            </button>
          </div>
        </SettingsRow>

        {/* Navigation Bar Position */}
        <SettingsRow divider label={<>{t("settings.reader.navPosition")}:</>} desc={t("settings.reader.navPositionDesc")}>
          <div class="ds-segmented-switch" id="ds-settings-nav-pos-switch">
            <button type="button" class={`ds-segmented-btn${navPosition() === "top" ? " active" : ""}`} id="ds-settings-nav-pos-top" title={t("settings.reader.navPosTopTooltip")} onClick={() => { setReaderNavPosition("top"); setNavPosition("top"); }}>
              <Icon name="align-top" /> {t("settings.reader.navPosTopLabel")}
            </button>
            <button type="button" class={`ds-segmented-btn${navPosition() === "bottom" ? " active" : ""}`} id="ds-settings-nav-pos-bottom" title={t("settings.reader.navPosBottomTooltip")} onClick={() => { setReaderNavPosition("bottom"); setNavPosition("bottom"); }}>
              <Icon name="align-bottom" /> {t("settings.reader.navPosBottomLabel")}
            </button>
          </div>
        </SettingsRow>
      </div>
    </div>
  );
}
