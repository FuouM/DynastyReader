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
  type ReaderModeSetting,
  type PagedLayoutSetting,
  type ReadingDirectionSetting,
  type FitModeSetting,
} from "../../reader/settings";
import { t } from "../../i18n";
import { DoublePageIcon, CloudDownloadIcon, Icon } from "../Icon";
export function ReaderSettings() {
  const [autoCacheEnabled, setAutoCacheEnabled] = createSignal(isAutoCacheChapterEnabled());
  const [prefetchBuffer, setPrefetchBufferLocal] = createSignal(getPrefetchBuffer());
  const [navPosition, setNavPosition] = createSignal(getReaderNavPosition());
  const [readerModePref, setReaderModePref] = createSignal<ReaderModeSetting>(getDefaultReaderMode());
  const [pagedLayoutPref, setPagedLayoutPref] = createSignal<PagedLayoutSetting>(getDefaultPagedLayout());
  const [longStripOverride, setLongStripOverride] = createSignal<boolean>(isLongStripSpreadOverrideEnabled());
  const [longStripFitWidth, setLongStripFitWidth] = createSignal<boolean>(isLongStripFitWidthEnabled());
  const [directionPref, setDirectionPref] = createSignal<ReadingDirectionSetting>(getDefaultReadingDirection());
  const [coverOffsetPref, setCoverOffsetPref] = createSignal<boolean>(isCoverOffsetDefaultEnabled());
  const [fitModePref, setFitModePref] = createSignal<FitModeSetting>(getDefaultFitMode());

  return (
    <div class="group-box" id="ds-settings-sec-reading">
      <div class="group-box-title">
        <DoublePageIcon /> {t("settings.reader.title")}
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        {/* Reading Direction */}
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
          <div style="flex:1;min-width:180px;">
            <div style="font-size:12px;color:var(--sys-window-text,#222);font-weight:600;">
              {t("settings.reader.readingDirection")}:
            </div>
            <div class="ds-muted" style="font-size:11px;color:var(--sys-text-muted,#666);">
              {t("settings.reader.readingDirectionDesc")}
            </div>
          </div>
          <div class="ds-segmented-switch" id="ds-settings-direction-switch" style="flex-shrink:0;">
            <button
              type="button"
              class={`ds-segmented-btn${directionPref() === "auto" ? " active" : ""}`}
              id="ds-settings-dir-auto"
              title={t("settings.reader.dirAutoTooltip")}
              onClick={() => {
                setDefaultReadingDirection("auto");
                setDirectionPref("auto");
              }}
            >
              <Icon name="magic" /> {t("settings.reader.dirAutoLabel")}
            </button>
            <button
              type="button"
              class={`ds-segmented-btn${directionPref() === "rtl" ? " active" : ""}`}
              id="ds-settings-dir-rtl"
              title={t("settings.reader.dirRtlTooltip")}
              onClick={() => {
                setDefaultReadingDirection("rtl");
                setDirectionPref("rtl");
              }}
            >
              <Icon name="arrow-left" /> {t("settings.reader.dirRtlLabel")}
            </button>
            <button
              type="button"
              class={`ds-segmented-btn${directionPref() === "ltr" ? " active" : ""}`}
              id="ds-settings-dir-ltr"
              title={t("settings.reader.dirLtrTooltip")}
              onClick={() => {
                setDefaultReadingDirection("ltr");
                setDirectionPref("ltr");
              }}
            >
              <Icon name="arrow-right" /> {t("settings.reader.dirLtrLabel")}
            </button>
          </div>
        </div>

        {/* Default Reading Mode */}
        <div style="display:flex;align-items:center;justify-content:space-between;padding-top:6px;border-top:1px solid var(--sys-border-light,#eaeaea);gap:8px;flex-wrap:wrap;">
          <div style="flex:1;min-width:180px;">
            <div style="font-size:12px;color:var(--sys-window-text,#222);font-weight:600;">
              {t("settings.reader.defaultMode")}:
            </div>
            <div class="ds-muted" style="font-size:11px;color:var(--sys-text-muted,#666);">
              {t("settings.reader.defaultModeDesc")}
            </div>
          </div>
          <div class="ds-segmented-switch" id="ds-settings-mode-switch" style="flex-shrink:0;">
            <button
              type="button"
              class={`ds-segmented-btn${readerModePref() === "scroll" ? " active" : ""}`}
              id="ds-settings-mode-scroll"
              title={t("settings.reader.modeScrollTooltip")}
              onClick={() => {
                setDefaultReaderMode("scroll");
                setReaderModePref("scroll");
              }}
            >
              <Icon name="view-stacked" /> {t("settings.reader.modeScrollLabel")}
            </button>
            <button
              type="button"
              class={`ds-segmented-btn${readerModePref() === "paged" ? " active" : ""}`}
              id="ds-settings-mode-paged"
              title={t("settings.reader.modePagedTooltip")}
              onClick={() => {
                setDefaultReaderMode("paged");
                setReaderModePref("paged");
              }}
            >
              <Icon name="book" /> {t("settings.reader.modePagedLabel")}
            </button>
          </div>
        </div>

        {/* Default Paged Layout */}
        <div style="display:flex;align-items:center;justify-content:space-between;padding-top:6px;border-top:1px solid var(--sys-border-light,#eaeaea);gap:8px;flex-wrap:wrap;">
          <div style="flex:1;min-width:180px;">
            <div style="font-size:12px;color:var(--sys-window-text,#222);font-weight:600;">
              {t("settings.reader.pagedLayout")}:
            </div>
            <div class="ds-muted" style="font-size:11px;color:var(--sys-text-muted,#666);">
              {t("settings.reader.pagedLayoutDesc")}
            </div>
          </div>
          <div class="ds-segmented-switch" id="ds-settings-layout-switch" style="flex-shrink:0;">
            <button
              type="button"
              class={`ds-segmented-btn${pagedLayoutPref() === "single" ? " active" : ""}`}
              id="ds-settings-layout-single"
              title={t("settings.reader.layoutSingleTooltip")}
              onClick={() => {
                setDefaultPagedLayout("single");
                setPagedLayoutPref("single");
              }}
            >
              <Icon name="file-earmark" /> {t("settings.reader.layoutSingleLabel")}
            </button>
            <button
              type="button"
              class={`ds-segmented-btn${pagedLayoutPref() === "spread" ? " active" : ""}`}
              id="ds-settings-layout-spread"
              title={t("settings.reader.layoutSpreadTooltip")}
              onClick={() => {
                setDefaultPagedLayout("spread");
                setPagedLayoutPref("spread");
              }}
            >
              <Icon name="columns-gap" /> {t("settings.reader.layoutSpreadLabel")}
            </button>
          </div>
        </div>

        {/* Long Strip Spread Override */}
        <div style="display:flex;align-items:center;justify-content:space-between;padding-top:6px;border-top:1px solid var(--sys-border-light,#eaeaea);gap:8px;flex-wrap:wrap;">
          <div style="flex:1;min-width:180px;">
            <div style="font-size:12px;color:var(--sys-window-text,#222);font-weight:600;">
              {t("settings.reader.longStripOverride")}:
            </div>
            <div class="ds-muted" style="font-size:11px;color:var(--sys-text-muted,#666);">
              {t("settings.reader.longStripOverrideDesc")}
            </div>
          </div>
          <button
            type="button"
            class={`win-button${longStripOverride() ? " primary" : ""}`}
            id="ds-settings-longstrip-toggle"
            style="font-size:11px;padding:2px 10px;min-width:105px;flex-shrink:0;"
            title={t("settings.reader.longStripOverrideTooltip")}
            onClick={() => {
              const next = !longStripOverride();
              setLongStripSpreadOverrideEnabled(next);
              setLongStripOverride(next);
            }}
          >
            <Show when={longStripOverride()} fallback={<><Icon name="slash-circle" /> {t("settings.reader.longStripOverrideDisabled")}</>}>
              <Icon name="check-circle" /> {t("settings.reader.longStripOverrideEnabled")}
            </Show>
          </button>
        </div>

        {/* Long Strip Auto Fit Width */}
        <div style="display:flex;align-items:center;justify-content:space-between;padding-top:6px;border-top:1px solid var(--sys-border-light,#eaeaea);gap:8px;flex-wrap:wrap;">
          <div style="flex:1;min-width:180px;">
            <div style="font-size:12px;color:var(--sys-window-text,#222);font-weight:600;">
              {t("settings.reader.longStripFitWidth")}:
            </div>
            <div class="ds-muted" style="font-size:11px;color:var(--sys-text-muted,#666);">
              {t("settings.reader.longStripFitWidthDesc")}
            </div>
          </div>
          <button
            type="button"
            class={`win-button${longStripFitWidth() ? " primary" : ""}`}
            id="ds-settings-longstrip-fit-toggle"
            style="font-size:11px;padding:2px 10px;min-width:105px;flex-shrink:0;"
            title={t("settings.reader.longStripFitWidthTooltip")}
            onClick={() => {
              const next = !longStripFitWidth();
              setLongStripFitWidthEnabled(next);
              setLongStripFitWidth(next);
            }}
          >
            <Show when={longStripFitWidth()} fallback={<><Icon name="slash-circle" /> {t("settings.reader.longStripFitWidthDisabled")}</>}>
              <Icon name="check-circle" /> {t("settings.reader.longStripFitWidthEnabled")}
            </Show>
          </button>
        </div>

        {/* Spread Standalone Cover */}
        <div style="display:flex;align-items:center;justify-content:space-between;padding-top:6px;border-top:1px solid var(--sys-border-light,#eaeaea);gap:8px;flex-wrap:wrap;">
          <div style="flex:1;min-width:180px;">
            <div style="font-size:12px;color:var(--sys-window-text,#222);font-weight:600;">
              {t("settings.reader.coverOffset")}:
            </div>
            <div class="ds-muted" style="font-size:11px;color:var(--sys-text-muted,#666);">
              {t("settings.reader.coverOffsetDesc")}
            </div>
          </div>
          <button
            type="button"
            class={`win-button${coverOffsetPref() ? " primary" : ""}`}
            id="ds-settings-cover-offset-toggle"
            style="font-size:11px;padding:2px 10px;min-width:95px;flex-shrink:0;"
            title={t("settings.reader.coverOffsetTooltip")}
            onClick={() => {
              const next = !coverOffsetPref();
              setCoverOffsetDefaultEnabled(next);
              setCoverOffsetPref(next);
            }}
          >
            <Show when={coverOffsetPref()} fallback={<><Icon name="dash-circle" /> {t("settings.reader.coverOffsetOff")}</>}>
              <Icon name="book-half" /> {t("settings.reader.coverOffsetOn")}
            </Show>
          </button>
        </div>

        {/* Default Fit Mode */}
        <div style="display:flex;align-items:center;justify-content:space-between;padding-top:6px;border-top:1px solid var(--sys-border-light,#eaeaea);gap:8px;flex-wrap:wrap;">
          <div style="flex:1;min-width:180px;">
            <div style="font-size:12px;color:var(--sys-window-text,#222);font-weight:600;">
              {t("settings.reader.fitMode")}:
            </div>
            <div class="ds-muted" style="font-size:11px;color:var(--sys-text-muted,#666);">
              {t("settings.reader.fitModeDesc")}
            </div>
          </div>
          <select
            id="ds-settings-fit-select"
            class="input-field"
            style="width:130px;height:24px;font-size:11px;flex-shrink:0;"
            value={fitModePref()}
            onChange={(ev) => {
              const val = (ev.target as HTMLSelectElement).value as FitModeSetting;
              setDefaultFitMode(val);
              setFitModePref(val);
            }}
          >
            <option value="width">{t("settings.reader.fitModes.width")}</option>
            <option value="height">{t("settings.reader.fitModes.height")}</option>
            <option value="original">{t("settings.reader.fitModes.original")}</option>
          </select>
        </div>

        {/* Auto Cache Entire Chapter */}
        <div style="display:flex;align-items:center;justify-content:space-between;padding-top:6px;border-top:1px solid var(--sys-border-light,#eaeaea);gap:8px;flex-wrap:wrap;">
          <div style="flex:1;min-width:180px;">
            <div style="font-size:12px;color:var(--sys-window-text,#222);font-weight:600;">
              {t("settings.reader.autoCache")}:
            </div>
            <div class="ds-muted" style="font-size:11px;color:var(--sys-text-muted,#666);">
              {t("settings.reader.autoCacheDesc")}
            </div>
          </div>
          <button
            type="button"
            class={`win-button${autoCacheEnabled() ? " primary" : ""}`}
            id="ds-settings-autocache-toggle"
            style="font-size:11px;padding:2px 10px;min-width:70px;flex-shrink:0;"
            title={
              autoCacheEnabled()
                ? t("settings.reader.autoCacheTooltipOn")
                : t("settings.reader.autoCacheTooltipOff")
            }
            onClick={() => {
              const next = !autoCacheEnabled();
              setAutoCacheChapterEnabled(next);
              setAutoCacheEnabled(next);
            }}
          >
            <Show when={autoCacheEnabled()} fallback={<><Icon name="cloud-slash" /> {t("settings.reader.autoCacheOff")}</>}>
              <CloudDownloadIcon /> {t("settings.reader.autoCacheOn")}
            </Show>
          </button>
        </div>

        {/* Page Prefetch Buffer */}
        <div style="display:flex;align-items:center;justify-content:space-between;padding-top:6px;border-top:1px solid var(--sys-border-light,#eaeaea);gap:8px;flex-wrap:wrap;">
          <div style="flex:1;min-width:180px;">
            <div style="font-size:12px;color:var(--sys-window-text,#222);font-weight:600;">
              {t("settings.reader.prefetchBuffer")}:
            </div>
            <div class="ds-muted" style="font-size:11px;color:var(--sys-text-muted,#666);">
              {t("settings.reader.prefetchBufferDesc")}
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:4px;flex-shrink:0;">
            <button
              type="button"
              class="win-button ds-btn-icon-sm"
              id="ds-settings-prefetch-dec"
              onClick={() => {
                const next = Math.max(0, prefetchBuffer() - 1);
                setPrefetchBuffer(next);
                setPrefetchBufferLocal(next);
              }}
            >
              −
            </button>
            <span
              id="ds-settings-prefetch-val"
              style="font-size:11px;font-weight:600;min-width:54px;text-align:center;"
            >
              {prefetchBuffer() === 0 ? t("settings.reader.prefetchBufferOff") : prefetchBuffer() === 1 ? t("settings.reader.prefetchBufferPage", { count: prefetchBuffer() }) : t("settings.reader.prefetchBufferPages", { count: prefetchBuffer() })}
            </span>
            <button
              type="button"
              class="win-button ds-btn-icon-sm"
              id="ds-settings-prefetch-inc"
              onClick={() => {
                const next = Math.min(10, prefetchBuffer() + 1);
                setPrefetchBuffer(next);
                setPrefetchBufferLocal(next);
              }}
            >
              +
            </button>
          </div>
        </div>

        {/* Navigation Bar Position */}
        <div style="display:flex;align-items:center;justify-content:space-between;padding-top:6px;border-top:1px solid var(--sys-border-light,#eaeaea);gap:8px;flex-wrap:wrap;">
          <div style="flex:1;min-width:180px;">
            <div style="font-size:12px;color:var(--sys-window-text,#222);font-weight:600;">
              {t("settings.reader.navPosition")}:
            </div>
            <div class="ds-muted" style="font-size:11px;color:var(--sys-text-muted,#666);">
              {t("settings.reader.navPositionDesc")}
            </div>
          </div>
          <div class="ds-segmented-switch" id="ds-settings-nav-pos-switch" style="flex-shrink:0;">
            <button
              type="button"
              class={`ds-segmented-btn${navPosition() === "top" ? " active" : ""}`}
              id="ds-settings-nav-pos-top"
              title={t("settings.reader.navPosTopTooltip")}
              onClick={() => {
                setReaderNavPosition("top");
                setNavPosition("top");
              }}
            >
              <Icon name="align-top" /> {t("settings.reader.navPosTopLabel")}
            </button>
            <button
              type="button"
              class={`ds-segmented-btn${navPosition() === "bottom" ? " active" : ""}`}
              id="ds-settings-nav-pos-bottom"
              title={t("settings.reader.navPosBottomTooltip")}
              onClick={() => {
                setReaderNavPosition("bottom");
                setNavPosition("bottom");
              }}
            >
              <Icon name="align-bottom" /> {t("settings.reader.navPosBottomLabel")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
