/**
 * Mobile slide-up controls sheet for reader view.
 * Extracted from `ReaderToolbar.tsx` for modularity and maintainability.
 */

import { createEffect, createSignal, onCleanup, Show } from "solid-js";
import { Portal } from "solid-js/web";
import { makeEventListener } from "@solid-primitives/event-listener";
import type { ReaderSession } from "./reader-session";
import { theme, setTheme } from "../stores/theme";
import { isMobile } from "../stores/platform";
import { navigate } from "../stores/router";
import { openExternal } from "../api/navigation";
import { canonicalUrl } from "../utils/formatting";
import { t } from "../i18n";
import {
  getPrevChapterStartPage,
  setPrevChapterStartPage,
  isHideStatusBarEnabled,
  setHideStatusBarEnabled,
  isHidePageBadgeWithToolbarEnabled,
  setHidePageBadgeWithToolbarEnabled,
} from "./settings";
import { isHapticsEnabled, setHapticsEnabled } from "../utils/haptics";
import { Button, IconText, SegmentedSwitch, DsSwitch } from "../components/Button";
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
  DashIcon,
  PlusIcon,
  Icon,
} from "../components/Icon";

export function ReaderMobileControlsSheet(props: { session: ReaderSession }) {
  const s = props.session;
  const [mounted, setMounted] = createSignal(false);
  const [closing, setClosing] = createSignal(false);
  const { copied, handleCopyLink } = useCopyLink({
    getUrl: () => canonicalUrl("chapters", s.permalink),
    namespace: "mobile-controls",
    showBanners: true,
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

  let backdropEl: HTMLDivElement | undefined;
  let windowEl: HTMLDivElement | undefined;
  let touchStartY = 0;
  let touchDiffY = 0;
  let touchStartTime = 0;
  let isDraggingSheet = false;
  let isDragEligible = false;

  const clearAnimationOnWindow = () => {
    if (windowEl && !closing()) {
      windowEl.style.animation = "none";
    }
  };

  const handleDragStart = (clientY: number, target: EventTarget | null) => {
    if (closing()) return;
    touchStartY = clientY;
    touchDiffY = 0;
    touchStartTime = Date.now();
    isDraggingSheet = false;

    clearAnimationOnWindow();

    const onHandleOrHeader = !!(target as HTMLElement)?.closest(".ds-sheet-drag-handle, .ds-reader-sheet-header");
    const isAtScrollTop = (windowEl?.scrollTop ?? 0) <= 0;
    isDragEligible = onHandleOrHeader || isAtScrollTop;
  };

  const handleDragMove = (clientY: number, cancelable: boolean, ev?: Event) => {
    if (closing() || !isDragEligible) return;
    const dy = clientY - touchStartY;
    touchDiffY = dy;

    if (!isDraggingSheet) {
      if (windowEl && windowEl.scrollTop > 0) return;
      if (dy > 4) {
        isDraggingSheet = true;
        clearAnimationOnWindow();
        if (windowEl) {
          windowEl.style.willChange = "transform";
          windowEl.style.transition = "none";
        }
        if (backdropEl) {
          backdropEl.style.willChange = "opacity";
          backdropEl.style.transition = "none";
        }
      }
    }

    if (isDraggingSheet) {
      if (cancelable && ev?.cancelable) ev.preventDefault();
      if (dy > 0) {
        const sheetH = windowEl?.offsetHeight || 400;
        if (windowEl) {
          windowEl.style.transform = `translate3d(0, ${dy}px, 0)`;
        }
        if (backdropEl) {
          backdropEl.style.opacity = String(Math.max(0, 1 - (dy / sheetH) * 0.8));
        }
      } else {
        if (windowEl) windowEl.style.transform = "translate3d(0, 0, 0)";
        if (backdropEl) backdropEl.style.opacity = "";
      }
    }
  };

  const handleDragEnd = () => {
    if (closing()) return;
    if (isDraggingSheet && windowEl) {
      const dt = Math.max(1, Date.now() - touchStartTime);
      const velocity = touchDiffY / dt;
      const sheetH = windowEl.offsetHeight || 400;
      const shouldDismiss = touchDiffY > 90 || (touchDiffY > 40 && velocity > 0.35);

      if (shouldDismiss) {
        windowEl.style.transition = "transform 0.18s cubic-bezier(0.4, 0, 1, 1)";
        windowEl.style.transform = `translate3d(0, ${sheetH}px, 0)`;
        if (backdropEl) {
          backdropEl.style.transition = "opacity 0.18s ease";
          backdropEl.style.opacity = "0";
        }
        window.setTimeout(() => {
          requestClose();
          if (windowEl) {
            windowEl.style.willChange = "auto";
            windowEl.style.transform = "";
            windowEl.style.transition = "";
          }
          if (backdropEl) {
            backdropEl.style.willChange = "auto";
            backdropEl.style.opacity = "";
            backdropEl.style.transition = "";
          }
        }, 180);
      } else {
        windowEl.style.transition = "transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)";
        windowEl.style.transform = "translate3d(0, 0, 0)";
        if (backdropEl) {
          backdropEl.style.transition = "opacity 0.2s ease";
          backdropEl.style.opacity = "";
        }
        window.setTimeout(() => {
          if (windowEl) {
            windowEl.style.willChange = "auto";
            windowEl.style.transition = "";
            windowEl.style.transform = "";
          }
          if (backdropEl) {
            backdropEl.style.willChange = "auto";
            backdropEl.style.transition = "";
            backdropEl.style.opacity = "";
          }
        }, 200);
      }
    }
    isDraggingSheet = false;
    isDragEligible = false;
    touchStartY = 0;
    touchDiffY = 0;
  };

  const onPointerDownHandle = (ev: PointerEvent) => {
    if (ev.pointerType === "mouse" && ev.button !== 0) return;
    handleDragStart(ev.clientY, ev.target);
    (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
  };
  const onPointerMoveHandle = (ev: PointerEvent) => {
    handleDragMove(ev.clientY, true, ev);
  };
  const onPointerUpHandle = () => {
    handleDragEnd();
  };

  createEffect(() => {
    if (!mounted() || !windowEl) return;
    const onTouchStart = (ev: TouchEvent) => {
      const t = ev.touches[0];
      if (t) handleDragStart(t.clientY, ev.target);
    };
    const onTouchMove = (ev: TouchEvent) => {
      const t = ev.touches[0];
      if (t) handleDragMove(t.clientY, true, ev);
    };
    makeEventListener(windowEl, "touchstart", onTouchStart, { passive: true });
    makeEventListener(windowEl, "touchmove", onTouchMove, { passive: false });
    makeEventListener(windowEl, "touchend", handleDragEnd, { passive: true });
    makeEventListener(windowEl, "touchcancel", handleDragEnd, { passive: true });
  });
  return (
    <Show when={mounted()}>
      <Portal mount={document.body}>
        <div
          ref={backdropEl}
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
            ref={windowEl}
            class="ds-reader-sheet-window"
            classList={{ "ds-sheet-closing": closing() }}
            onPointerDown={(ev) => ev.stopPropagation()}
            onClick={(ev) => ev.stopPropagation()}
            onAnimationEnd={(ev) => {
              if (ev.target === windowEl && !closing()) {
                clearAnimationOnWindow();
                if (windowEl) windowEl.style.transform = "translate3d(0, 0, 0)";
              }
            }}
            role="dialog"
            aria-modal="true"
          >
            <div
              class="ds-sheet-drag-handle"
              onPointerDown={onPointerDownHandle}
              onPointerMove={onPointerMoveHandle}
              onPointerUp={onPointerUpHandle}
              onPointerCancel={onPointerUpHandle}
            />
            <div
              class="ds-reader-sheet-header"
              onPointerDown={onPointerDownHandle}
              onPointerMove={onPointerMoveHandle}
              onPointerUp={onPointerUpHandle}
              onPointerCancel={onPointerUpHandle}
            >
              <div class="ds-modal-title">
                <IconText icon={<ToolIcon />}>{t("reader.toolbar.controlsSheetTitle")}</IconText>
              </div>
              <Button
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
                  onChange={s.setMode}
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
                    onChange={s.setDirection}
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
                    onChange={s.setPagedLayout}
                    options={[
                      { id: "ds-ctrl-layout-single", value: "single", icon: <DoublePageIcon />, text: t("settings.reader.layoutSingleLabel") },
                      { id: "ds-ctrl-layout-spread", value: "spread", icon: <ColumnsGapIcon />, text: t("settings.reader.layoutSpreadLabel") },
                    ]}
                  />
                </SettingsRow>
              </Show>

              {/* Fit Mode */}
              <SettingsRow label={t("settings.reader.fitMode")} divider stacked>
                <SegmentedSwitch
                  value={s.fitMode()}
                  onChange={s.setFitMode}
                  options={[
                    { id: "ds-ctrl-fit-width", value: "width", text: t("reader.toolbar.fitModes.widthShort") || "Width", title: t("reader.toolbar.fitModes.width") },
                    { id: "ds-ctrl-fit-height", value: "height", text: t("reader.toolbar.fitModes.heightShort") || "Height", title: t("reader.toolbar.fitModes.height") },
                    { id: "ds-ctrl-fit-orig", value: "original", text: t("reader.toolbar.fitModes.originalShort") || "Original", title: t("reader.toolbar.fitModes.original") },
                  ]}
                />
              </SettingsRow>

              {/* Zoom Controls (when Original Size) */}
              <Show when={s.fitMode() === "original"}>
                <SettingsRow label={t("reader.toolbar.zoom")} divider>
                  <div class="ds-prefetch-row ds-ctrl-zoom-row">
                    <Button
                      className="ds-btn-icon"
                      icon={<DashIcon />}
                      title={t("reader.toolbar.zoomOutTooltip")}
                      disabled={s.zoomScale() <= 0.25}
                      onClick={() => s.zoomOut()}
                    />
                    <button
                      type="button"
                      class="win-button ds-btn-sm"
                      style="min-width: 54px; font-variant-numeric: tabular-nums; text-align: center;"
                      title={t("reader.toolbar.zoomResetTooltip")}
                      onClick={() => s.resetZoom()}
                    >
                      {Math.round(s.zoomScale() * 100)}%
                    </button>
                    <Button
                      className="ds-btn-icon"
                      icon={<PlusIcon />}
                      title={t("reader.toolbar.zoomInTooltip")}
                      disabled={s.zoomScale() >= 3.0}
                      onClick={() => s.zoomIn()}
                    />
                  </div>
                </SettingsRow>
              </Show>

              {/* Image Filters */}
              <SettingsRow label={t("settings.reader.filterGroup")} divider stacked>
                <ReaderFilterControls />
              </SettingsRow>

              {/* Previous Chapter Landing Page */}
              <SettingsRow label={t("settings.reader.prevChapterPage")} divider>
                <SegmentedSwitch
                  value={getPrevChapterStartPage()}
                  onChange={setPrevChapterStartPage}
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
                  onChange={setTheme}
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
                  checked={isHideStatusBarEnabled()}
                  title={isHideStatusBarEnabled() ? t("settings.reader.hideStatusBarOn") : t("settings.reader.hideStatusBarOff")}
                  onChange={setHideStatusBarEnabled}
                />
              </SettingsRow>

              {/* Hide Page Number Badge with Toolbar */}
              <SettingsRow label={t("settings.reader.hidePageBadgeWithToolbar")} divider>
                <DsSwitch
                  id="ds-ctrl-hide-page-badge-toggle"
                  checked={isHidePageBadgeWithToolbarEnabled()}
                  title={isHidePageBadgeWithToolbarEnabled() ? t("settings.reader.hidePageBadgeWithToolbarOn") : t("settings.reader.hidePageBadgeWithToolbarOff")}
                  onChange={setHidePageBadgeWithToolbarEnabled}
                />
              </SettingsRow>

              {/* Haptic Feedback (H-01) */}
              <SettingsRow label={t("settings.reader.haptics")} divider>
                <DsSwitch
                  id="ds-ctrl-haptics-toggle"
                  checked={isHapticsEnabled()}
                  title={isHapticsEnabled() ? t("settings.reader.hapticsOn") : t("settings.reader.hapticsOff")}
                  onChange={setHapticsEnabled}
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
                  onClick={() => void openExternal(canonicalUrl("chapters", s.permalink))}
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
