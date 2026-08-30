/**
 * Desktop navigation and controls rows for ReaderToolbar / ReaderBottomNav.
 * Extracted from `ReaderToolbar.tsx` for modularity and maintainability.
 */

import { Show, type Accessor } from "solid-js";
import type { ReaderSession } from "./reader-session";
import type { FitMode } from "../types/reader";
import { theme, isMobile } from "../stores";
import { t } from "../i18n";
import { DsButton, DsSelect, IconButton } from "../components/Button";
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
  OledIcon,
  ArrowsFullscreenIcon,
  FullscreenExitIcon,
  DashIcon,
  PlusIcon,
} from "../components/Icon";

export interface NavRowProps {
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
            style={{
              width: "100%",
              transform: `scaleX(${s.progress().width / 100})`,
            }}
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
        text={
          s.isHorizontal()
            ? (s.scrollLock() ? t("reader.toolbar.smoothOn") : t("reader.toolbar.smoothOff"))
            : (s.scrollLock() ? t("reader.toolbar.lockOn") : t("reader.toolbar.lockOff"))
        }
        title={
          s.isHorizontal()
            ? (s.scrollLock()
                ? t("reader.toolbar.scrollLockInstantTooltip")
                : t("reader.toolbar.scrollLockSmoothTooltip"))
            : (s.scrollLock()
                ? t("reader.toolbar.scrollLockOnTooltip")
                : t("reader.toolbar.scrollLockOffTooltip"))
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
        icon={theme() === "dark" ? <MoonIcon /> : theme() === "high-contrast" ? <OledIcon /> : <SunIcon />}
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
