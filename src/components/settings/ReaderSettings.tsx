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
              Auto checks <code>read_left_to_right</code> tags; defaults to Japanese Manga (Right-to-Left).
            </div>
          </div>
          <div class="ds-segmented-switch" id="ds-settings-direction-switch" style="flex-shrink:0;">
            <button
              type="button"
              class={`ds-segmented-btn${directionPref() === "auto" ? " active" : ""}`}
              id="ds-settings-dir-auto"
              title="Auto-detect from chapter & series tags (default)"
              onClick={() => {
                setDefaultReadingDirection("auto");
                setDirectionPref("auto");
              }}
            >
              <Icon name="magic" /> Auto (Tags)
            </button>
            <button
              type="button"
              class={`ds-segmented-btn${directionPref() === "rtl" ? " active" : ""}`}
              id="ds-settings-dir-rtl"
              title="Force Right-to-Left (Japanese Manga standard)"
              onClick={() => {
                setDefaultReadingDirection("rtl");
                setDirectionPref("rtl");
              }}
            >
              <Icon name="arrow-left" /> RTL
            </button>
            <button
              type="button"
              class={`ds-segmented-btn${directionPref() === "ltr" ? " active" : ""}`}
              id="ds-settings-dir-ltr"
              title="Force Left-to-Right (Western / Manhwa standard)"
              onClick={() => {
                setDefaultReadingDirection("ltr");
                setDirectionPref("ltr");
              }}
            >
              <Icon name="arrow-right" /> LTR
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
              title="Continuous vertical scroll (default)"
              onClick={() => {
                setDefaultReaderMode("scroll");
                setReaderModePref("scroll");
              }}
            >
              <Icon name="view-stacked" /> Scroll
            </button>
            <button
              type="button"
              class={`ds-segmented-btn${readerModePref() === "paged" ? " active" : ""}`}
              id="ds-settings-mode-paged"
              title="Paged slides"
              onClick={() => {
                setDefaultReaderMode("paged");
                setReaderModePref("paged");
              }}
            >
              <Icon name="book" /> Paged
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
              title="Single page per slide"
              onClick={() => {
                setDefaultPagedLayout("single");
                setPagedLayoutPref("single");
              }}
            >
              <Icon name="file-earmark" /> Single
            </button>
            <button
              type="button"
              class={`ds-segmented-btn${pagedLayoutPref() === "spread" ? " active" : ""}`}
              id="ds-settings-layout-spread"
              title="Dual-page spread per slide"
              onClick={() => {
                setDefaultPagedLayout("spread");
                setPagedLayoutPref("spread");
              }}
            >
              <Icon name="columns-gap" /> Dual Spread
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
              Soft-disable Spread mode on <code>Long Strip</code> / <code>Webtoon</code> tags to display continuous vertical art.
            </div>
          </div>
          <button
            type="button"
            class={`win-button${longStripOverride() ? " primary" : ""}`}
            id="ds-settings-longstrip-toggle"
            style="font-size:11px;padding:2px 10px;min-width:105px;flex-shrink:0;"
            title="When ON, automatically soft-disables spread mode for Long Strip / Webtoon chapters"
            onClick={() => {
              const next = !longStripOverride();
              setLongStripSpreadOverrideEnabled(next);
              setLongStripOverride(next);
            }}
          >
            <Show when={longStripOverride()} fallback={<><Icon name="slash-circle" /> Disabled</>}>
              <Icon name="check-circle" /> Auto-Disable: ON
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
              Automatically default to Fit Width when opening <code>Long Strip</code> / <code>Webtoon</code> chapters.
            </div>
          </div>
          <button
            type="button"
            class={`win-button${longStripFitWidth() ? " primary" : ""}`}
            id="ds-settings-longstrip-fit-toggle"
            style="font-size:11px;padding:2px 10px;min-width:105px;flex-shrink:0;"
            title="When ON, automatically sets Fit Width for Long Strip / Webtoon chapters"
            onClick={() => {
              const next = !longStripFitWidth();
              setLongStripFitWidthEnabled(next);
              setLongStripFitWidth(next);
            }}
          >
            <Show when={longStripFitWidth()} fallback={<><Icon name="slash-circle" /> Disabled</>}>
              <Icon name="check-circle" /> Fit Width: ON
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
            title="When ON, first page in dual spread is rendered alone"
            onClick={() => {
              const next = !coverOffsetPref();
              setCoverOffsetDefaultEnabled(next);
              setCoverOffsetPref(next);
            }}
          >
            <Show when={coverOffsetPref()} fallback={<><Icon name="dash-circle" /> Cover 1st: OFF</>}>
              <Icon name="book-half" /> Cover 1st: ON
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
            <option value="width">Fit Width (Default)</option>
            <option value="height">Fit Height</option>
            <option value="original">Original Size</option>
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
                ? "Pre-downloads full chapters in background (click to cache only as you read)"
                : "Only caches pages as you read (click to auto-download full chapters)"
            }
            onClick={() => {
              const next = !autoCacheEnabled();
              setAutoCacheChapterEnabled(next);
              setAutoCacheEnabled(next);
            }}
          >
            <Show when={autoCacheEnabled()} fallback={<><Icon name="cloud-slash" /> OFF</>}>
              <CloudDownloadIcon /> ON
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
              class="win-button ds-btn-sm"
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
              {prefetchBuffer() === 0 ? "0 (off)" : `${prefetchBuffer()} page${prefetchBuffer() === 1 ? "" : "s"}`}
            </span>
            <button
              type="button"
              class="win-button ds-btn-sm"
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
              title="Top (default)"
              onClick={() => {
                setReaderNavPosition("top");
                setNavPosition("top");
              }}
            >
              <Icon name="align-top" /> Top
            </button>
            <button
              type="button"
              class={`ds-segmented-btn${navPosition() === "bottom" ? " active" : ""}`}
              id="ds-settings-nav-pos-bottom"
              title="Bottom (mobile / thumb friendly)"
              onClick={() => {
                setReaderNavPosition("bottom");
                setNavPosition("bottom");
              }}
            >
              <Icon name="align-bottom" /> Bottom
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
