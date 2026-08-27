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
  getMobileLandscapeReaderMode,
  setMobileLandscapeReaderMode,
  getMobileLandscapePagedLayout,
  setMobileLandscapePagedLayout,
  getMobileLandscapeFitMode,
  setMobileLandscapeFitMode,
  isLongStripSpreadOverrideEnabled,
  setLongStripSpreadOverrideEnabled,
  isLongStripFitWidthEnabled,
  setLongStripFitWidthEnabled,
  getDefaultReadingDirection,
  setDefaultReadingDirection,
  isCoverOffsetDefaultEnabled,
  setCoverOffsetDefaultEnabled,
  isMobileGesturesOnDesktopEnabled,
  setMobileGesturesOnDesktopEnabled,
  getDefaultFitMode,
  setDefaultFitMode,
  getPrevChapterStartPage,
  setPrevChapterStartPage,
  getScrollLock,
  setScrollLock,
  type PrevChapterStartPage,
  type ReadingDirectionSetting,
  type MobileLandscapeReaderModeSetting,
  type MobileLandscapePagedLayoutSetting,
  type MobileLandscapeFitModeSetting,
} from "../../reader/settings";
import type { FitMode, ReaderMode, PagedLayout } from "../../types/reader";
import { t } from "../../i18n";
import { DoublePageIcon, Icon } from "../Icon";
import { DsSelect, IconText, IconButton, SegmentedSwitch, DsSwitch } from "../Button";
import { SettingsRow } from "../SettingsRow";

export function ReaderSettings() {
  const [autoCacheEnabled, setAutoCacheEnabled] = createSignal(isAutoCacheChapterEnabled());
  const [prefetchBuffer, setPrefetchBufferLocal] = createSignal(getPrefetchBuffer());
  const [navPosition, setNavPosition] = createSignal(getReaderNavPosition());
  const [readerModePref, setReaderModePref] = createSignal<ReaderMode>(getDefaultReaderMode());
  const [pagedLayoutPref, setPagedLayoutPref] = createSignal<PagedLayout>(getDefaultPagedLayout());
  const [mobileLandscapeModePref, setMobileLandscapeModePref] = createSignal<MobileLandscapeReaderModeSetting>(getMobileLandscapeReaderMode());
  const [mobileLandscapeLayoutPref, setMobileLandscapeLayoutPref] = createSignal<MobileLandscapePagedLayoutSetting>(getMobileLandscapePagedLayout());
  const [mobileLandscapeFitPref, setMobileLandscapeFitPref] = createSignal<MobileLandscapeFitModeSetting>(getMobileLandscapeFitMode());
  const [longStripOverride, setLongStripOverride] = createSignal<boolean>(isLongStripSpreadOverrideEnabled());
  const [longStripFitWidth, setLongStripFitWidth] = createSignal<boolean>(isLongStripFitWidthEnabled());
  const [directionPref, setDirectionPref] = createSignal<ReadingDirectionSetting>(getDefaultReadingDirection());
  const [coverOffsetPref, setCoverOffsetPref] = createSignal<boolean>(isCoverOffsetDefaultEnabled());
  const [mobileGesturesDesktopPref, setMobileGesturesDesktopPref] = createSignal<boolean>(isMobileGesturesOnDesktopEnabled());
  const [fitModePref, setFitModePref] = createSignal<FitMode>(getDefaultFitMode());
  const [prevChapterPagePref, setPrevChapterPagePref] = createSignal<PrevChapterStartPage>(getPrevChapterStartPage());
  const [scrollLockPref, setScrollLockPref] = createSignal<boolean>(getScrollLock());
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

        {/* Mobile Landscape Overrides — 3-column grid (mode / layout / fit) */}
        <fieldset class="group-box ds-landscape-override-group" style="margin-top:8px;">
          <legend class="group-box-title"><IconText icon={<Icon name="phone-landscape" />}>{t("settings.reader.mobileLandscapeGroupTitle")}</IconText></legend>
          <div class="ds-landscape-override-grid">
            <div class="ds-landscape-cell">
              <span class="ds-landscape-cell-label">{t("settings.reader.mobileLandscapeMode")}</span>
              <SegmentedSwitch
                id="ds-settings-mobile-landscape-mode-switch"
                value={mobileLandscapeModePref()}
                onChange={(val) => {
                  const next = val as MobileLandscapeReaderModeSetting;
                  setMobileLandscapeReaderMode(next);
                  setMobileLandscapeModePref(next);
                }}
                options={[
                  { id: "ds-settings-ml-mode-default", value: "default", icon: <Icon name="arrow-return-right" />, text: t("settings.reader.mobileLandscapeModeDefault"), title: t("settings.reader.mobileLandscapeModeDefaultTooltip") },
                  { id: "ds-settings-ml-mode-scroll", value: "scroll", icon: <Icon name="view-stacked" />, text: t("settings.reader.mobileLandscapeModeScroll"), title: t("settings.reader.mobileLandscapeModeScrollTooltip") },
                  { id: "ds-settings-ml-mode-paged", value: "paged", icon: <Icon name="book" />, text: t("settings.reader.mobileLandscapeModePaged"), title: t("settings.reader.mobileLandscapeModePagedTooltip") },
                ]}
              />
            </div>
            <div class="ds-landscape-cell">
              <span class="ds-landscape-cell-label">{t("settings.reader.mobileLandscapeLayout")}</span>
              <SegmentedSwitch
                id="ds-settings-mobile-landscape-layout-switch"
                value={mobileLandscapeLayoutPref()}
                onChange={(val) => {
                  const next = val as MobileLandscapePagedLayoutSetting;
                  setMobileLandscapePagedLayout(next);
                  setMobileLandscapeLayoutPref(next);
                }}
                options={[
                  { id: "ds-settings-ml-layout-default", value: "default", icon: <Icon name="arrow-return-right" />, text: t("settings.reader.mobileLandscapeLayoutDefault"), title: t("settings.reader.mobileLandscapeLayoutDefaultTooltip") },
                  { id: "ds-settings-ml-layout-single", value: "single", icon: <Icon name="file-earmark" />, text: t("settings.reader.mobileLandscapeLayoutSingle"), title: t("settings.reader.mobileLandscapeLayoutSingleTooltip") },
                  { id: "ds-settings-ml-layout-spread", value: "spread", icon: <Icon name="columns-gap" />, text: t("settings.reader.mobileLandscapeLayoutSpread"), title: t("settings.reader.mobileLandscapeLayoutSpreadTooltip") },
                ]}
              />
            </div>
            <div class="ds-landscape-cell">
              <span class="ds-landscape-cell-label">{t("settings.reader.mobileLandscapeFitMode")}</span>
              <SegmentedSwitch
                id="ds-settings-mobile-landscape-fit-switch"
                value={mobileLandscapeFitPref()}
                onChange={(val) => {
                  const next = val as MobileLandscapeFitModeSetting;
                  setMobileLandscapeFitMode(next);
                  setMobileLandscapeFitPref(next);
                }}
                options={[
                  { id: "ds-settings-ml-fit-default", value: "default", icon: <Icon name="arrow-return-right" />, text: t("settings.reader.mobileLandscapeFitDefault"), title: t("settings.reader.mobileLandscapeFitDefaultTooltip") },
                  { id: "ds-settings-ml-fit-height", value: "height", icon: <Icon name="arrows-expand" />, text: t("settings.reader.mobileLandscapeFitHeight"), title: t("settings.reader.mobileLandscapeFitHeightTooltip") },
                ]}
              />
            </div>
          </div>
        </fieldset>
        {/* Long Strip Spread Override */}
        <SettingsRow divider label={<>{t("settings.reader.longStripOverride")}:</>} desc={t("settings.reader.longStripOverrideDesc")}>
          <DsSwitch
            id="ds-settings-longstrip-toggle"
            checked={longStripOverride()}
            title={t("settings.reader.longStripOverrideTooltip")}
            onChange={(next) => { setLongStripSpreadOverrideEnabled(next); setLongStripOverride(next); }}
          />
        </SettingsRow>

        {/* Long Strip Auto Fit Width */}
        <SettingsRow divider label={<>{t("settings.reader.longStripFitWidth")}:</>} desc={t("settings.reader.longStripFitWidthDesc")}>
          <DsSwitch
            id="ds-settings-longstrip-fit-toggle"
            checked={longStripFitWidth()}
            title={t("settings.reader.longStripFitWidthTooltip")}
            onChange={(next) => { setLongStripFitWidthEnabled(next); setLongStripFitWidth(next); }}
          />
        </SettingsRow>

        {/* Spread Standalone Cover */}
        <SettingsRow divider label={<>{t("settings.reader.coverOffset")}:</>} desc={t("settings.reader.coverOffsetDesc")}>
          <DsSwitch
            id="ds-settings-cover-offset-toggle"
            checked={coverOffsetPref()}
            title={t("settings.reader.coverOffsetTooltip")}
            onChange={(next) => { setCoverOffsetDefaultEnabled(next); setCoverOffsetPref(next); }}
          />
        </SettingsRow>

        {/* Mobile Gestures on Desktop */}
        <SettingsRow divider label={<>{t("settings.reader.mobileGesturesDesktop")}:</>} desc={t("settings.reader.mobileGesturesDesktopDesc")}>
          <DsSwitch
            id="ds-settings-mobile-gestures-desktop-toggle"
            checked={mobileGesturesDesktopPref()}
            title={t("settings.reader.mobileGesturesDesktopTooltip")}
            onChange={(next) => { setMobileGesturesOnDesktopEnabled(next); setMobileGesturesDesktopPref(next); }}
          />
        </SettingsRow>

        {/* Paged Mode: Slide Animation */}
        <SettingsRow divider label={<>{t("settings.reader.slideAnimation")}:</>} desc={t("settings.reader.slideAnimationDesc")}>
          <SegmentedSwitch
            id="ds-settings-slide-anim-switch"
            value={scrollLockPref() ? "smooth" : "instant"}
            onChange={(val) => {
              const isSmooth = val === "smooth";
              setScrollLock(isSmooth);
              setScrollLockPref(isSmooth);
            }}
            options={[
              { id: "ds-settings-anim-smooth", value: "smooth", icon: <Icon name="arrow-left-right" />, text: t("settings.reader.scrollAnimationSmooth"), title: t("settings.reader.scrollAnimationSmoothTooltip") },
              { id: "ds-settings-anim-instant", value: "instant", icon: <Icon name="lightning" />, text: t("settings.reader.scrollAnimationInstant"), title: t("settings.reader.scrollAnimationInstantTooltip") },
            ]}
          />
        </SettingsRow>

        {/* Scroll Mode: Page Snap (Scroll Lock) */}
        <SettingsRow divider label={<>{t("settings.reader.scrollLock")}:</>} desc={t("settings.reader.scrollLockDesc")}>
          <SegmentedSwitch
            id="ds-settings-scroll-lock-switch"
            value={scrollLockPref() ? "locked" : "free"}
            onChange={(val) => {
              const isLocked = val === "locked";
              setScrollLock(isLocked);
              setScrollLockPref(isLocked);
            }}
            options={[
              { id: "ds-settings-lock-free", value: "free", icon: <Icon name="unlock" />, text: t("settings.reader.scrollLockFree"), title: t("settings.reader.scrollLockFreeTooltip") },
              { id: "ds-settings-lock-locked", value: "locked", icon: <Icon name="lock" />, text: t("settings.reader.scrollLockLocked"), title: t("settings.reader.scrollLockLockedTooltip") },
            ]}
          />
        </SettingsRow>
        {/* Previous Chapter Landing Page */}
        <SettingsRow divider label={<>{t("settings.reader.prevChapterPage")}:</>} desc={t("settings.reader.prevChapterPageDesc")}>
          <SegmentedSwitch
            id="ds-settings-prev-page-switch"
            value={prevChapterPagePref()}
            onChange={(val) => {
              setPrevChapterStartPage(val as PrevChapterStartPage);
              setPrevChapterPagePref(val as PrevChapterStartPage);
            }}
            options={[
              { id: "ds-settings-prev-first", value: "first", icon: <Icon name="file-earmark-arrow-up" />, text: t("settings.reader.prevChapterPageFirst"), title: t("settings.reader.prevChapterPageFirstTooltip") },
              { id: "ds-settings-prev-last", value: "last", icon: <Icon name="file-earmark-arrow-down" />, text: t("settings.reader.prevChapterPageLast"), title: t("settings.reader.prevChapterPageLastTooltip") },
            ]}
          />
        </SettingsRow>

        {/* Default Fit Mode */}
        <SettingsRow divider label={<>{t("settings.reader.fitMode")}:</>} desc={t("settings.reader.fitModeDesc")}>
          <DsSelect
            id="ds-settings-fit-select"
            className="ds-select--w130"
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
          <DsSwitch
            id="ds-settings-autocache-toggle"
            checked={autoCacheEnabled()}
            title={autoCacheEnabled() ? t("settings.reader.autoCacheTooltipOn") : t("settings.reader.autoCacheTooltipOff")}
            onChange={(next) => { setAutoCacheChapterEnabled(next); setAutoCacheEnabled(next); }}
          />
        </SettingsRow>

        {/* Page Prefetch Buffer */}
        <SettingsRow divider label={<>{t("settings.reader.prefetchBuffer")}:</>} desc={t("settings.reader.prefetchBufferDesc")}>
          <div class="ds-prefetch-row">
            <IconButton
              className="ds-btn-icon"
              id="ds-settings-prefetch-dec"
              icon={<Icon name="dash-lg" />}
              title="−"
              onClick={() => { const next = Math.max(0, prefetchBuffer() - 1); setPrefetchBuffer(next); setPrefetchBufferLocal(next); }}
            />
            <span id="ds-settings-prefetch-val" class="ds-prefetch-val">
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
