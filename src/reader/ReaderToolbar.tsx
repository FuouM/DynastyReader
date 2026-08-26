/**
 * Reader toolbar: the sticky top/bottom navigation bars — chapter/page nav
 * buttons, the progress track, and the mode/fit/theme/fullscreen/scroll-lock/
 * zoom controls. Port of `reader-toolbar.ts`: reads session-derived state and
 * writes back through session control methods.
 */

import { createEffect, createSignal, onCleanup, Show, type Accessor } from "solid-js";
import { Portal } from "solid-js/web";
import { makeEventListener } from "@solid-primitives/event-listener";
import { debounce } from "@solid-primitives/scheduled";
import type { ReaderSession } from "./reader-session";
import type { FitMode, ReaderMode, PagedLayout, ReadingDirection } from "../types/reader";
import { theme, setTheme, isMobile, goBack, closeSessionMangaTab, showBanner, SITE_ROOT } from "../stores";
import { decodeEntities } from "../utils/html";
import { addBookmark, removeBookmark } from "../db";
import { openExternal } from "../api";
import { errorMessage } from "../utils/errors";
import { t } from "../i18n";
import { getReaderNavPosition, getPrevChapterStartPage, setPrevChapterStartPage, type ReaderNavPosition, type PrevChapterStartPage } from "./settings";
import { DsButton, DsSelect, IconButton, Button, IconText, SegmentedSwitch } from "../components/Button";
import { SettingsRow } from "../components/SettingsRow";
import {
  ChevronDoubleLeftIcon,
  ChevronDoubleRightIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronBarLeftIcon,
  ChevronBarRightIcon,
  ToolIcon,
  LockIcon,
  UnlockIcon,
  ArrowLeftRightIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  DistributeVerticalIcon,
  ColumnsGapIcon,
  BookHalfIcon,
  SunIcon,
  MoonIcon,
  ArrowsFullscreenIcon,
  FullscreenExitIcon,
  DashIcon,
  PlusIcon,
  BookmarkIcon,
  CloseIcon,
  DoublePageIcon,
  StorageIcon,
  CloudDownloadIcon,
  CheckIcon,
  ExternalLinkIcon,
  SettingsIcon,
  Icon,
} from "../components/Icon";
interface NavRowProps {
  session: ReaderSession;
  controlsOpen?: Accessor<boolean>;
  onToggleControls?: () => void;
}

export function ReaderMainRow(props: NavRowProps) {
  const s = props.session;

  return (
    <div class="ds-reader-nav-row nav-main">
      <IconButton
        className="ds-nav-btn-ch"
        icon={<ChevronDoubleLeftIcon />}
        text={t("reader.toolbar.chapterShort")}
        title={t("reader.toolbar.prevChapter")}
        disabled={s.chapterNav().prevDisabled}
        onClick={() => s.gotoPrevChapter()}
      />
      <IconButton
        className="ds-nav-btn-jump ds-btn-icon"
        icon={<ChevronBarLeftIcon />}
        title={t("reader.toolbar.firstPage")}
        onClick={() => s.setPage(0, true)}
      />
      <IconButton
        className="ds-nav-btn-page ds-btn-icon"
        icon={<ChevronLeftIcon />}
        title={t("reader.toolbar.prevPage")}
        disabled={s.progress().prevDisabled}
        onClick={() => (s.isSpread() ? s.stepSpread(-1) : s.setPage(s.currentIndex() - 1))}
      />
      <div class="ds-reader-progress-wrap">
        <div class="ds-reader-progress-pill">
          <span class="ds-reader-progress-label" title={s.progress().title}>
            <span class="ds-prog-page-slot">
              <span class="ds-prog-prefix">{t("reader.toolbar.pagePrefix")}</span>
              <span class="ds-prog-current">{s.progress().currentNumStr}</span>
              <span class="ds-prog-sep">/</span>
              <span class="ds-prog-total">{s.progress().totalNumStr}</span>
            </span>
            <span class="ds-prog-pct">({s.progress().pct}%)</span>
            <Show when={s.progress().cachedNote !== ""}>
              <span class="ds-prog-cached-dot">·</span>
              <span class="ds-prog-cached">{s.progress().cachedNote}</span>
            </Show>
          </span>
        </div>
        <div class="ds-reader-progress-track">
          <div
            class="ds-reader-progress-fill"
            style={
              isMobile()
                ? { width: "100%", transform: `scaleX(${s.progress().width / 100})` }
                : { width: `${s.progress().width}%` }
            }
          ></div>
        </div>
      </div>
      <IconButton
        className="ds-nav-btn-page ds-btn-icon"
        icon={<ChevronRightIcon />}
        title={t("reader.toolbar.nextPage")}
        disabled={s.progress().nextDisabled}
        onClick={() => (s.isSpread() ? s.stepSpread(1) : s.setPage(s.currentIndex() + 1))}
      />
      <IconButton
        className="ds-nav-btn-jump ds-btn-icon"
        icon={<ChevronBarRightIcon />}
        title={t("reader.toolbar.lastPage", { total: s.pages().length })}
        onClick={() => s.setPage(s.pages().length - 1, true)}
      />
      <IconButton
        className="ds-nav-btn-ch"
        icon={<ChevronDoubleRightIcon />}
        text={t("reader.toolbar.chapterShort")}
        reverse
        title={t("reader.toolbar.nextChapter")}
        disabled={s.chapterNav().nextDisabled}
        onClick={() => s.gotoNextChapter()}
      />
      <IconButton
        className="ds-nav-btn-page ds-btn-icon"
        classList={{ active: !!props.controlsOpen?.() }}
        icon={<ToolIcon />}
        title={t("reader.toolbar.toggleControlsTooltip")}
        onClick={props.onToggleControls}
      />
    </div>
  );
}

export function ReaderControlsRow(props: NavRowProps) {
  const s = props.session;
  return (
    <div class="ds-reader-nav-row nav-controls">
      <IconButton
        className="ds-ctrl-btn"
        classList={{ primary: s.scrollLock() }}
        icon={s.isHorizontal() ? <ArrowLeftRightIcon /> : s.scrollLock() ? <LockIcon /> : <UnlockIcon />}
        text={s.isHorizontal() ? t("reader.toolbar.scrollSmooth") : t("reader.toolbar.scrollLock")}
        title={
          s.isHorizontal()
            ? s.scrollLock()
              ? t("reader.toolbar.scrollLockInstantTooltip")
              : t("reader.toolbar.scrollLockSmoothTooltip")
            : t("reader.toolbar.scrollLockWheelTooltip")
        }
        onClick={() => s.setScrollLock()}
      />
      <IconButton
        className="ds-ctrl-btn"
        icon={s.isHorizontal() ? <DistributeVerticalIcon /> : <ArrowLeftRightIcon />}
        text={s.isHorizontal() ? t("reader.toolbar.scroll") : t("reader.toolbar.paged")}
        title={t("reader.toolbar.toggleModeTooltip")}
        onClick={() => s.setMode(s.mode() === "paged" ? "scroll" : "paged")}
      />
      <Show when={s.mode() === "paged"}>
        <IconButton
          className="ds-ctrl-btn"
          classList={{ primary: s.pagedLayout() === "spread" }}
          icon={<ColumnsGapIcon />}
          text={t("reader.toolbar.spreadLabel", { state: s.pagedLayout() === "spread" ? "ON" : "OFF" })}
          title={
            s.isLongStrip() && s.layoutAutoDetected()
              ? t("reader.toolbar.spreadAutoDisabledTooltip")
              : t("reader.toolbar.spreadTooltip", { state: s.pagedLayout() === "spread" ? "ON" : "OFF" })
          }
          onClick={() => s.setPagedLayout(s.pagedLayout() === "spread" ? "single" : "spread")}
        />
        <IconButton
          className="ds-ctrl-btn"
          classList={{ primary: !s.directionAutoDetected() }}
          icon={s.direction() === "rtl" ? <ArrowLeftIcon /> : <ArrowRightIcon />}
          text={s.direction().toUpperCase()}
          title={
            s.directionAutoDetected()
              ? t("reader.toolbar.directionAutoTooltip", { dir: s.direction().toUpperCase() })
              : t("reader.toolbar.directionManualTooltip", { dir: s.direction().toUpperCase() })
          }
          onClick={() => s.setDirection(s.direction() === "rtl" ? "ltr" : "rtl")}
        />
        <IconButton
          className="ds-ctrl-btn"
          classList={{ primary: s.coverOffset() }}
          icon={<BookHalfIcon />}
          text={t("reader.toolbar.coverOffsetLabel", { state: s.coverOffset() ? "ON" : "OFF" })}
          title={t("reader.toolbar.coverOffsetTooltip")}
          style={s.isSpread() ? undefined : "display:none;"}
          onClick={() => s.toggleCoverOffset()}
        />
      </Show>
      <DsSelect
        className="ds-ctrl-fit-select"
        value={s.fitMode()}
        onChange={(val) => s.setFitMode(val as FitMode)}
        options={[
          { value: "width", label: t("reader.toolbar.fitModes.width") },
          { value: "height", label: t("reader.toolbar.fitModes.height") },
          { value: "original", label: t("reader.toolbar.fitModes.original") },
        ]}
      />
      <IconButton
        className="ds-ctrl-btn ds-btn-icon"
        icon={theme() === "dark" ? <MoonIcon /> : <SunIcon />}
        title={t("reader.toolbar.themeToggle")}
        onClick={() => s.toggleTheme()}
      />
      <Show when={!isMobile()}>
        <IconButton
          className="ds-ctrl-btn"
          classList={{ primary: s.isFullscreen() }}
          icon={s.isFullscreen() ? <FullscreenExitIcon /> : <ArrowsFullscreenIcon />}
          text={s.isFullscreen() ? t("reader.toolbar.exitFullscreenLabel") : t("reader.toolbar.fullscreenLabel")}
          title={t("reader.toolbar.fullscreen")}
          onClick={() => s.setFullscreen(!s.isFullscreen())}
        />
      </Show>
      <div class="ds-ctrl-zoom-group" classList={{ "ds-zoom-disabled": s.fitMode() !== "original" }}>
        <IconButton
          className="ds-btn-icon"
          icon={<DashIcon />}
          title={
            s.fitMode() !== "original"
              ? t("reader.toolbar.zoomDisabledTooltip")
              : t("reader.toolbar.zoomOutTooltip")
          }
          disabled={s.fitMode() !== "original" || s.zoomScale() <= 0.25}
          onClick={() => s.zoomOut()}
        />
        <DsButton
          className=""
          cssText="min-width:38px;padding:2px 4px;"
          title={s.fitMode() !== "original" ? t("reader.toolbar.zoomDisabledTooltip") : t("reader.toolbar.zoomResetTooltip")}
          disabled={s.fitMode() !== "original"}
          onClick={() => s.resetZoom()}
        >
          {Math.round(s.zoomScale() * 100)}%
        </DsButton>
        <IconButton
          className="ds-btn-icon"
          icon={<PlusIcon />}
          title={
            s.fitMode() !== "original"
              ? t("reader.toolbar.zoomDisabledTooltip")
              : t("reader.toolbar.zoomInTooltip")
          }
          disabled={s.fitMode() !== "original" || s.zoomScale() >= 3.0}
          onClick={() => s.zoomIn()}
        />
      </div>
    </div>
  );
}

export function ReaderMobileControlsSheet(props: { session: ReaderSession }) {
  const s = props.session;
  const [mounted, setMounted] = createSignal(false);
  const [closing, setClosing] = createSignal(false);
  const [prevChapterPage, setPrevChapterPage] = createSignal<PrevChapterStartPage>(getPrevChapterStartPage());
  const [copied, setCopied] = createSignal(false);
  const resetCopied = debounce(() => setCopied(false), 2000);
  let closeTimer: number | null = null;

  createEffect(() => {
    const open = s.controlsOpen();
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
          onClick={(ev) => {
            if (ev.target === ev.currentTarget) requestClose();
          }}
        >
          <div
            class="ds-reader-sheet-window"
            classList={{ "ds-sheet-closing": closing() }}
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

              {/* Chapter Actions */}
              <div class="ds-reader-toolbar-grid">
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
                  onClick={async () => {
                    try {
                      if (typeof navigator !== "undefined" && navigator.clipboard) {
                        await navigator.clipboard.writeText(`${SITE_ROOT}/chapters/${s.permalink}`);
                        setCopied(true);
                        resetCopied();
                      }
                    } catch (err) {
                      console.warn("[ReaderToolbar] clipboard writeText failed:", err);
                    }
                  }}
                />
                <Button
                  icon={<ExternalLinkIcon />}
                  text={t("reader.toolbar.openInBrowserShort")}
                  cssText="height:32px;font-size:11.5px;justify-content:center;"
                  onClick={() => void openExternal(`${SITE_ROOT}/chapters/${s.permalink}`)}
                />
              </div>
            </div>

            <div class="ds-reader-sheet-footer">
              <Button
                className="primary"
                cssText="min-width:70px;"
                text={t("settings.done")}
              />
            </div>
          </div>
        </div>
      </Portal>
    </Show>
  );
}

export function ReaderToolbar(props: { session: ReaderSession }) {
  const s = props.session;
  const [navPos, setNavPos] = createSignal<ReaderNavPosition>(getReaderNavPosition());
  const [copied, setCopied] = createSignal(false);
  const resetCopied = debounce(() => setCopied(false), 2000);

  const handleCopyLink = async () => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(`${SITE_ROOT}/chapters/${s.permalink}`);
        setCopied(true);
        showBanner(t("reader.toolbar.copiedLinkBanner"));
        resetCopied();
      }
    } catch (err) {
      console.warn("[ReaderToolbar] copy link failed:", err);
      const msg = errorMessage(err);
      showBanner(t("reader.toolbar.copyLinkErrorBanner", { msg }));
    }
  };
  createEffect(() => {
    const z = s.zoomScale();
    if (s.containerEl) {
      s.containerEl.style.setProperty("--ds-zoom-scale", String(z));
    }
  });

  const onNavPosChange = (ev: Event): void => {
    const customEv = ev as CustomEvent<ReaderNavPosition>;
    setNavPos(customEv.detail || getReaderNavPosition());
  };
  makeEventListener(window, "ds-reader-nav-pos-change", onNavPosChange);

  const onFullscreenChange = (): void => {
    if (!document.fullscreenElement && s.isFullscreen()) {
      s.setFullscreen(false);
    } else {
      s.resetToCurrentPage(false);
    }
  };
  makeEventListener(document, "fullscreenchange", onFullscreenChange);

  const handleBack = () => {
    goBack();
  };

  const handleOpenSeries = () => {
    s.gotoSeries();
  };
  const handleToggleBookmark = async () => {
    try {
      if (s.bookmarked()) {
        await removeBookmark(s.permalink);
        s.setBookmarked(false);
        showBanner(t("browse.feed.bookmarkRemovedBanner", { title: s.chapterTitle() }));
      } else {
        await addBookmark({
          chapterPermalink: s.permalink,
          seriesPermalink: s.seriesPermalink() ?? "",
          seriesName: s.seriesName() ?? "",
          chapterTitle: s.chapterTitle(),
          pageIndex: s.currentIndex(),
        });
        s.setBookmarked(true);
        showBanner(t("browse.feed.bookmarkSavedBanner", { title: s.chapterTitle() }));
      }
    } catch (err) {
      const msg = errorMessage(err);
      showBanner(t("browse.feed.bookmarkErrorBanner", { msg }));
    }
  };

  return (
    <>
      <nav
        class="ds-reader-nav ds-reader-nav-top"
        classList={{ "ds-toolbar-hidden": isMobile() && !s.toolbarVisible() }}
      >
        <Show when={isMobile()}>
          <div class="ds-reader-nav-row nav-main ds-reader-mobile-row--full">
            <IconButton
              className="ds-btn-icon"
              icon={<ArrowLeftIcon />}
              title={t("topbar.navBackTooltip")}
              onClick={handleBack}
            />
            <div class="ds-reader-mobile-title--flex" onClick={handleOpenSeries} title={s.seriesPermalink() ? t("reader.toolbar.viewSeries") : undefined}>
              <span class="ds-truncate ds-text-13-600">
                {decodeEntities(s.chapterTitle() || s.permalink)}
              </span>
              <Show when={s.seriesName() && s.seriesName() !== s.chapterTitle()}>
                <span class="ds-truncate ds-muted ds-text-11-inline">
                  {decodeEntities(s.seriesName())}
                </span>
              </Show>
            </div>
            <div class="ds-row ds-row-gap-2">
              <Show when={s.seriesPermalink()}>
                <IconButton
                  className="ds-btn-icon"
                  icon={<StorageIcon />}
                  title={t("reader.toolbar.viewSeries")}
                  onClick={handleOpenSeries}
                />
              </Show>
              <IconButton
                className="ds-btn-icon"
                icon={copied() ? <CheckIcon /> : <Icon name="link-45deg" />}
                title={copied() ? t("common.copied") : t("reader.toolbar.copyLink")}
                onClick={() => void handleCopyLink()}
              />
              <IconButton
                className="ds-btn-icon"
                classList={{ primary: s.bookmarked() }}
                icon={<BookmarkIcon filled={s.bookmarked()} />}
                title={s.bookmarked() ? t("browse.feed.removeFromReadLater") : t("browse.feed.saveForReadLater")}
                onClick={() => void handleToggleBookmark()}
              />
              <IconButton
                className="ds-btn-icon"
                icon={s.isFullyCached() ? <CheckIcon /> : <CloudDownloadIcon />}
                title={t("reader.toolbar.cacheChapter")}
                onClick={() => s.cacheFullChapter()}
              />
              <IconButton
                className="ds-btn-icon"
                classList={{ primary: s.controlsOpen() }}
                icon={<ToolIcon />}
                title={t("reader.toolbar.toggleControlsTooltip")}
                onClick={() => s.setControlsOpen(!s.controlsOpen())}
              />
              <IconButton
                className="ds-btn-icon"
                icon={<SettingsIcon />}
                title={t("topbar.settingsTooltip")}
                onClick={() => window.dispatchEvent(new CustomEvent("ds-open-settings"))}
              />
              <IconButton
                className="ds-btn-icon"
                icon={<CloseIcon />}
                title={t("topbar.closeTabTooltip")}
                onClick={() => closeSessionMangaTab()}
              />
            </div>
          </div>
        </Show>
        <Show when={!isMobile() && navPos() === "top"}>
          <ReaderMainRow
            session={s}
            controlsOpen={() => s.controlsOpen()}
            onToggleControls={() => s.setControlsOpen(!s.controlsOpen())}
          />
          <Show when={s.controlsOpen()}>
            <ReaderControlsRow session={s} />
          </Show>
        </Show>
        <Show when={!isMobile() && navPos() === "bottom"}>
          <Show when={s.controlsOpen()}>
            <ReaderControlsRow session={s} />
          </Show>
        </Show>
      </nav>

      <Show when={isMobile()}>
        <ReaderMobileControlsSheet session={s} />
      </Show>
    </>
  );
}

export function ReaderBottomNav(props: { session: ReaderSession }) {
  const s = props.session;
  const [navPos, setNavPos] = createSignal<ReaderNavPosition>(getReaderNavPosition());

  const onNavPosChange = (ev: Event): void => {
    const customEv = ev as CustomEvent<ReaderNavPosition>;
    setNavPos(customEv.detail || getReaderNavPosition());
  };
  makeEventListener(window, "ds-reader-nav-pos-change", onNavPosChange);
  return (
    <Show when={isMobile() || navPos() === "bottom"}>
      <nav
        class="ds-reader-nav ds-reader-nav-bottom"
        classList={{ "ds-toolbar-hidden": isMobile() && !s.toolbarVisible() }}
      >
        <Show when={isMobile()}>
          <div class="ds-reader-nav-row nav-main" style="width:100%;justify-content:space-between;">
            <IconButton
              className="ds-nav-btn-ch"
              icon={<ChevronDoubleLeftIcon />}
              title={t("reader.toolbar.prevChapter")}
              disabled={s.chapterNav().prevDisabled}
              onClick={() => s.gotoPrevChapter()}
            />
            <IconButton
              className="ds-nav-btn-jump ds-btn-icon"
              icon={<ChevronBarLeftIcon />}
              title={t("reader.toolbar.firstPage")}
              onClick={() => s.setPage(0, true)}
            />
            <IconButton
              className="ds-nav-btn-page ds-btn-icon"
              icon={<ChevronLeftIcon />}
              title={t("reader.toolbar.prevPage")}
              disabled={s.progress().prevDisabled}
              onClick={() => (s.isSpread() ? s.stepSpread(-1) : s.setPage(s.currentIndex() - 1))}
            />
            <div class="ds-reader-progress-wrap">
              <div class="ds-reader-progress-pill">
                <span class="ds-reader-progress-label">
                  <span class="ds-prog-current">{s.progress().currentNumStr}</span>
                  <span class="ds-prog-sep">/</span>
                  <span class="ds-prog-total">{s.progress().totalNumStr}</span>
                  <span class="ds-prog-pct">({s.progress().pct}%)</span>
                </span>
              </div>
              <div class="ds-reader-progress-track">
                <div
                  class="ds-reader-progress-fill"
                  style={{ width: "100%", transform: `scaleX(${s.progress().width / 100})` }}
                ></div>
              </div>
            </div>
            <IconButton
              className="ds-nav-btn-page ds-btn-icon"
              icon={<ChevronRightIcon />}
              title={t("reader.toolbar.nextPage")}
              disabled={s.progress().nextDisabled}
              onClick={() => (s.isSpread() ? s.stepSpread(1) : s.setPage(s.currentIndex() + 1))}
            />
            <IconButton
              className="ds-nav-btn-jump ds-btn-icon"
              icon={<ChevronBarRightIcon />}
              title={t("reader.toolbar.lastPage", { total: s.pages().length })}
              onClick={() => s.setPage(s.pages().length - 1, true)}
            />
            <IconButton
              className="ds-nav-btn-ch"
              icon={<ChevronDoubleRightIcon />}
              title={t("reader.toolbar.nextChapter")}
              disabled={s.chapterNav().nextDisabled}
              onClick={() => s.gotoNextChapter()}
            />
          </div>
        </Show>
        <Show when={!isMobile() && navPos() === "bottom"}>
          <ReaderMainRow
            session={s}
            controlsOpen={() => s.controlsOpen()}
            onToggleControls={() => s.setControlsOpen(!s.controlsOpen())}
          />
          <Show when={s.controlsOpen()}>
            <ReaderControlsRow session={s} />
          </Show>
        </Show>
      </nav>
    </Show>
  );
}
