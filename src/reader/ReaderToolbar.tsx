/**
 * Reader toolbar: the sticky top/bottom navigation bars — chapter/page nav
 * buttons, the progress track, and the mode/fit/theme/fullscreen/scroll-lock/
 * zoom controls. Port of `reader-toolbar.ts`: reads session-derived state and
 * writes back through session control methods.
 */

import { createEffect, createSignal, onCleanup, Show, on } from "solid-js";
import { makeEventListener } from "@solid-primitives/event-listener";
import { debounce } from "@solid-primitives/scheduled";
import type { ReaderSession } from "./reader-session";
import { isMobile, goBack, goForward, canGoBack, canGoForward, closeSessionMangaTab, showBanner, navigate } from "../stores";
import { HistoryDropdown } from "../components/HistoryDropdown";
import { decodeEntities } from "../utils/html";
import { addBookmark, removeBookmark } from "../db";
import { errorMessage } from "../utils/errors";
import { dynastyUrl } from "../utils/formatting";
import { t } from "../i18n";
import { getReaderNavPosition, type ReaderNavPosition } from "./settings";
import { IconButton } from "../components/Button";
import { ReaderMainRow, ReaderControlsRow } from "./ReaderNavRows";
import { ReaderMobileControlsSheet } from "./ReaderMobileControlsSheet";
import {
  ChevronDoubleLeftIcon,
  ChevronDoubleRightIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronBarLeftIcon,
  ChevronBarRightIcon,
  ToolIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  BookmarkIcon,
  CloseIcon,
  StorageIcon,
  CloudDownloadIcon,
  CheckIcon,
  SettingsIcon,
  Icon,
} from "../components/Icon";

export { ReaderMainRow, ReaderControlsRow } from "./ReaderNavRows";
export { ReaderMobileControlsSheet } from "./ReaderMobileControlsSheet";

export function ReaderToolbar(props: { session: ReaderSession }) {
  const s = props.session;
  const [navPos, setNavPos] = createSignal<ReaderNavPosition>(getReaderNavPosition());
  const [copied, setCopied] = createSignal(false);
  const resetCopied = debounce(() => setCopied(false), 2000);

  const handleCopyLink = async () => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(dynastyUrl("chapters", s.permalink));
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

  const [historyMenu, setHistoryMenu] = createSignal<{
    direction: "back" | "forward";
    anchorEl: HTMLElement;
  } | null>(null);
  let holdTimer: number | null = null;
  let didHold = false;

  const startHold = (direction: "back" | "forward", anchorEl: HTMLElement): void => {
    didHold = false;
    if (holdTimer !== null) window.clearTimeout(holdTimer);
    holdTimer = window.setTimeout(() => {
      didHold = true;
      setHistoryMenu({ direction, anchorEl });
    }, 450);
  };

  const cancelHold = (): void => {
    if (holdTimer !== null) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
    if (didHold) {
      window.setTimeout(() => {
        didHold = false;
      }, 200);
    }
  };

  onCleanup(() => cancelHold());

  // When resizing across mobile/desktop boundary, close controls so desktop row doesn't open mobile sheet
  createEffect(
    on(
      isMobile,
      () => {
        s.setControlsOpen(false);
      },
      { defer: true }
    )
  );
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
            <div class="ds-segmented-switch ds-nav-history-switch ds-reader-view-switch">
              <button
                type="button"
                class="ds-segmented-btn"
                id="ds-reader-nav-browse"
                title={t("topbar.browseRecent")}
                onClick={() => navigate({ view: "browse" })}
              >
                <span class="ds-btn-icon-wrap"><Icon name="compass" /></span>
              </button>
              <button
                type="button"
                class="ds-segmented-btn"
                id="ds-reader-nav-library"
                title={t("topbar.library")}
                onClick={() => navigate({ view: "library" })}
              >
                <span class="ds-btn-icon-wrap"><StorageIcon /></span>
              </button>
            </div>
            <div class="ds-segmented-switch ds-nav-history-switch" id="ds-nav-history">
              <button
                type="button"
                class="ds-segmented-btn ds-nav-history-btn"
                id="ds-nav-back"
                title={t("topbar.navBackTooltip")}
                disabled={!canGoBack()}
                onPointerDown={(ev) => {
                  if (ev.button === 0 && canGoBack()) {
                    startHold("back", ev.currentTarget);
                  }
                }}
                onPointerUp={(ev) => {
                  if (didHold) ev.preventDefault();
                  cancelHold();
                }}
                onPointerCancel={() => cancelHold()}
                onPointerLeave={() => cancelHold()}
                onContextMenu={(ev) => {
                  ev.preventDefault();
                  if (canGoBack()) {
                    setHistoryMenu({ direction: "back", anchorEl: ev.currentTarget });
                  }
                }}
                onClick={() => {
                  if (!didHold && canGoBack()) {
                    goBack();
                  }
                }}
              >
                <ArrowLeftIcon />
              </button>
              <button
                type="button"
                class="ds-segmented-btn ds-nav-history-btn"
                id="ds-nav-forward"
                title={t("topbar.navForwardTooltip")}
                disabled={!canGoForward()}
                onPointerDown={(ev) => {
                  if (ev.button === 0 && canGoForward()) {
                    startHold("forward", ev.currentTarget);
                  }
                }}
                onPointerUp={(ev) => {
                  if (didHold) ev.preventDefault();
                  cancelHold();
                }}
                onPointerCancel={() => cancelHold()}
                onPointerLeave={() => cancelHold()}
                onContextMenu={(ev) => {
                  ev.preventDefault();
                  if (canGoForward()) {
                    setHistoryMenu({ direction: "forward", anchorEl: ev.currentTarget });
                  }
                }}
                onClick={() => {
                  if (!didHold && canGoForward()) {
                    goForward();
                  }
                }}
              >
                <ArrowRightIcon />
              </button>
            </div>
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
      <Show when={historyMenu()}>
        {(menu) => (
          <HistoryDropdown
            direction={menu().direction}
            anchorEl={menu().anchorEl}
            onClose={() => setHistoryMenu(null)}
          />
        )}
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
