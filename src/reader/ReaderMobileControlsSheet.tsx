/**
 * Mobile slide-up controls sheet for reader view.
 * Extracted from `ReaderToolbar.tsx` for modularity and maintainability.
 */

import { createEffect, createSignal, onCleanup, Show } from "solid-js";
import { Portal } from "solid-js/web";
import type { ReaderSession } from "./reader-session";
import type { FitMode, ReaderMode, PagedLayout, ReadingDirection } from "../types/reader";
import { theme, setTheme, isMobile, navigate } from "../stores";
import { openExternal } from "../api";
import { dynastyUrl } from "../utils/formatting";
import { t } from "../i18n";
import {
  getPrevChapterStartPage,
  setPrevChapterStartPage,
  isHideStatusBarEnabled,
  setHideStatusBarEnabled,
  type PrevChapterStartPage,
} from "./settings";
import { Button, IconButton, IconText, SegmentedSwitch, DsSwitch } from "../components/Button";
import { SettingsRow } from "../components/SettingsRow";
import { useCopyLink } from "../hooks/useCopyLink";
import { ReaderFilterControls } from "./ReaderFilterControls";
import {
  ToolIcon,
  LockIcon,
  UnlockIcon,
  ArrowLeftRightIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  DistributeVerticalIcon,
  ColumnsGapIcon,
  SunIcon,
  MoonIcon,
  CloseIcon,
  DoublePageIcon,
  StorageIcon,
  CloudDownloadIcon,
  CheckIcon,
  ExternalLinkIcon,
  Icon,
} from "../components/Icon";

export function ReaderMobileControlsSheet(props: { session: ReaderSession }) {
  const s = props.session;
  const [mounted, setMounted] = createSignal(false);
  const [closing, setClosing] = createSignal(false);
  const [prevChapterPage, setPrevChapterPage] = createSignal<PrevChapterStartPage>(getPrevChapterStartPage());
  const [hideStatusBar, setHideStatusBar] = createSignal(isHideStatusBarEnabled());
  const { copied, handleCopyLink } = useCopyLink({
    getUrl: () => dynastyUrl("chapters", s.permalink),
    namespace: "mobile-controls",
    showBanners: false,
  });
  let closeTimer: number | null = null;
  createEffect(() => {
    const open = s.controlsOpen() && isMobile();
    if (open) {
      if (closeTimer !== null) {
        clearTimeout(closeTimer);
        closeTimer = null;
      }
      setMounted(true);
      setClosing(false);
    } else if (mounted() && !closing()) {
      setClosing(true);
      closeTimer = window.setTimeout(() => {
        setMounted(false);
        setClosing(false);
        closeTimer = null;
      }, 180);
    }
  });

  onCleanup(() => {
    if (closeTimer !== null) clearTimeout(closeTimer);
  });

  const requestClose = () => {
    s.setControlsOpen(false);
  };

  return (
    <Show when={mounted()}>
      <Portal mount={document.getElementById("ds-root") ?? document.body}>
        <div
          class="ds-reader-sheet-backdrop"
          classList={{ "ds-sheet-closing": closing() }}
          onPointerDown={(ev) => {
            if (ev.target === ev.currentTarget) requestClose();
          }}
          onClick={(ev) => {
            if (ev.target === ev.currentTarget) requestClose();
          }}
        >
          <div
            class="ds-reader-sheet-window"
            classList={{ "ds-sheet-closing": closing() }}
            onPointerDown={(ev) => ev.stopPropagation()}
            onClick={(ev) => ev.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div class="ds-reader-sheet-header">
              <div class="ds-modal-title">
                <IconText icon={<ToolIcon />}>{t("settings.reader.title")}</IconText>
              </div>
              <IconButton
                className="ds-modal-close"
                icon={<CloseIcon />}
                title={t("common.close")}
                onClick={requestClose}
              />
            </div>

            <div class="ds-reader-sheet-body">
              {/* Reading Mode */}
              <SettingsRow label={t("settings.reader.defaultMode")}>
                <SegmentedSwitch
                  value={s.mode()}
                  onChange={(val) => s.setMode(val as ReaderMode)}
                  options={[
                    { id: "ds-ctrl-mode-scroll", value: "scroll", icon: <DistributeVerticalIcon />, text: t("reader.toolbar.scroll") },
                    { id: "ds-ctrl-mode-paged", value: "paged", icon: <ArrowLeftRightIcon />, text: t("reader.toolbar.paged") },
                  ]}
                />
              </SettingsRow>

              {/* Paged Mode: Smooth Slide Animation */}
              <Show when={s.mode() === "paged"}>
                <SettingsRow label={t("settings.reader.slideAnimation")} divider>
                  <SegmentedSwitch
                    value={s.scrollLock() ? "smooth" : "instant"}
                    onChange={(val) => {
                      const isSmooth = val === "smooth";
                      if (s.scrollLock() !== isSmooth) {
                        s.setScrollLock();
                      }
                    }}
                    options={[
                      { id: "ds-ctrl-anim-smooth", value: "smooth", icon: <ArrowLeftRightIcon />, text: t("settings.reader.scrollAnimationSmooth"), title: t("settings.reader.scrollAnimationSmoothTooltip") },
                      { id: "ds-ctrl-anim-instant", value: "instant", icon: <Icon name="lightning" />, text: t("settings.reader.scrollAnimationInstant"), title: t("settings.reader.scrollAnimationInstantTooltip") },
                    ]}
                  />
                </SettingsRow>
              </Show>

              {/* Scroll Mode: Scroll Lock (Page Snap vs Free Scroll) */}
              <Show when={s.mode() === "scroll"}>
                <SettingsRow label={t("settings.reader.scrollLock")} divider desc={t("settings.reader.scrollLockDesc")}>
                  <SegmentedSwitch
                    value={s.scrollLock() ? "locked" : "free"}
                    onChange={(val) => {
                      const isLocked = val === "locked";
                      if (s.scrollLock() !== isLocked) {
                        s.setScrollLock();
                      }
                    }}
                    options={[
                      { id: "ds-ctrl-lock-free", value: "free", icon: <UnlockIcon />, text: t("settings.reader.scrollLockFree"), title: t("settings.reader.scrollLockFreeTooltip") },
                      { id: "ds-ctrl-lock-locked", value: "locked", icon: <LockIcon />, text: t("settings.reader.scrollLockLocked"), title: t("settings.reader.scrollLockLockedTooltip") },
                    ]}
                  />
                </SettingsRow>
              </Show>

              {/* Reading Direction (when paged) */}
              <Show when={s.mode() === "paged"}>
                <SettingsRow label={t("settings.reader.readingDirection")} divider>
                  <SegmentedSwitch
                    value={s.direction()}
                    onChange={(val) => s.setDirection(val as ReadingDirection)}
                    options={[
                      { id: "ds-ctrl-dir-rtl", value: "rtl", icon: <ArrowLeftIcon />, text: "RTL" },
                      { id: "ds-ctrl-dir-ltr", value: "ltr", icon: <ArrowRightIcon />, text: "LTR" },
                    ]}
                  />
                </SettingsRow>

                {/* Paged Layout */}
                <SettingsRow label={t("settings.reader.pagedLayout")} divider>
                  <SegmentedSwitch
                    value={s.pagedLayout()}
                    onChange={(val) => s.setPagedLayout(val as PagedLayout)}
                    options={[
                      { id: "ds-ctrl-layout-single", value: "single", icon: <DoublePageIcon />, text: t("settings.reader.layoutSingleLabel") },
                      { id: "ds-ctrl-layout-spread", value: "spread", icon: <ColumnsGapIcon />, text: t("settings.reader.layoutSpreadLabel") },
                    ]}
                  />
                </SettingsRow>
              </Show>

              {/* Fit Mode */}
              <SettingsRow label={t("settings.reader.fitMode")} divider>
                <SegmentedSwitch
                  value={s.fitMode()}
                  onChange={(val) => s.setFitMode(val as FitMode)}
                  options={[
                    { id: "ds-ctrl-fit-width", value: "width", text: t("reader.toolbar.fitModes.width") },
                    { id: "ds-ctrl-fit-height", value: "height", text: t("reader.toolbar.fitModes.height") },
                    { id: "ds-ctrl-fit-orig", value: "original", text: t("reader.toolbar.fitModes.original") },
                  ]}
                />
              </SettingsRow>

              {/* Image Filters */}
              <SettingsRow label={t("settings.reader.filterGroup")} divider stacked>
                <ReaderFilterControls />
              </SettingsRow>

              {/* Previous Chapter Landing Page */}
              <SettingsRow label={t("settings.reader.prevChapterPage")} divider>
                <SegmentedSwitch
                  value={prevChapterPage()}
                  onChange={(val) => {
                    setPrevChapterStartPage(val as PrevChapterStartPage);
                    setPrevChapterPage(val as PrevChapterStartPage);
                  }}
                  options={[
                    { id: "ds-ctrl-prev-first", value: "first", text: t("settings.reader.prevChapterPageFirst") },
                    { id: "ds-ctrl-prev-last", value: "last", text: t("settings.reader.prevChapterPageLast") },
                  ]}
                />
              </SettingsRow>

              {/* Theme */}
              <SettingsRow label={t("settings.display.theme")} divider>
                <SegmentedSwitch
                  value={theme()}
                  onChange={(val) => setTheme(val as "light" | "dark")}
                  options={[
                    { id: "ds-ctrl-theme-light", value: "light", icon: <SunIcon />, text: t("settings.display.themeLight").split(" ")[0] },
                    { id: "ds-ctrl-theme-dark", value: "dark", icon: <MoonIcon />, text: t("settings.display.themeDark").split(" ")[0] },
                  ]}
                />
              </SettingsRow>

              {/* Hide Status Bar (Android) */}
              <SettingsRow label={t("settings.reader.hideStatusBar")} divider>
                <DsSwitch
                  id="ds-ctrl-hide-statusbar-toggle"
                  checked={hideStatusBar()}
                  title={hideStatusBar() ? t("settings.reader.hideStatusBarOn") : t("settings.reader.hideStatusBarOff")}
                  onChange={(next) => {
                    setHideStatusBarEnabled(next);
                    setHideStatusBar(next);
                  }}
                />
              </SettingsRow>
              {/* Chapter Actions */}
              <div class="ds-reader-toolbar-grid">
                <Button
                  icon={<Icon name="compass" />}
                  text={t("bottomNav.browse")}
                  cssText="height:32px;font-size:11.5px;justify-content:center;"
                  onClick={() => {
                    requestClose();
                    navigate({ view: "browse" });
                  }}
                />
                <Button
                  icon={<StorageIcon />}
                  text={t("bottomNav.library")}
                  cssText="height:32px;font-size:11.5px;justify-content:center;"
                  onClick={() => {
                    requestClose();
                    navigate({ view: "library" });
                  }}
                />
                <Show when={s.seriesPermalink()}>
                  <Button
                    icon={<StorageIcon />}
                    text={t("reader.toolbar.seriesButton")}
                    cssText="height:32px;font-size:11.5px;justify-content:center;"
                    onClick={() => {
                      requestClose();
                      s.gotoSeries();
                    }}
                  />
                </Show>
                <Button
                  icon={s.isFullyCached() ? <CheckIcon /> : <CloudDownloadIcon />}
                  text={s.isFullyCached() ? t("reader.toolbar.cachedShort") : t("reader.toolbar.cacheShort")}
                  cssText="height:32px;font-size:11.5px;justify-content:center;"
                  onClick={() => s.cacheFullChapter()}
                />
                <Button
                  icon={copied() ? <CheckIcon /> : <Icon name="link-45deg" />}
                  text={copied() ? t("common.copied") : t("reader.toolbar.copyLinkShort")}
                  cssText="height:32px;font-size:11.5px;justify-content:center;"
                  onClick={handleCopyLink}
                />
                <Button
                  icon={<ExternalLinkIcon />}
                  text={t("reader.toolbar.openInBrowserShort")}
                  cssText="height:32px;font-size:11.5px;justify-content:center;"
                  onClick={() => void openExternal(dynastyUrl("chapters", s.permalink))}
                />
              </div>
            </div>

            <div class="ds-reader-sheet-footer">
              <Button
                className="primary"
                cssText="min-width:70px;"
                text={t("settings.done")}
                onClick={requestClose}
              />
            </div>
          </div>
        </div>
      </Portal>
    </Show>
  );
}
