/**
 * Reader toolbar: the sticky top/bottom navigation bars — chapter/page nav
 * buttons, the progress track, and the mode/fit/theme/fullscreen/scroll-lock/
 * zoom controls. Port of `reader-toolbar.ts`: reads session-derived state and
 * writes back through session control methods.
 */

import { createEffect, Show, on } from "solid-js";
import { makeEventListener } from "@solid-primitives/event-listener";
import type { ReaderSession } from "./reader-session";
import { useReader } from "./reader-context";
import { isMobile } from "../stores/platform";
import { closeSessionMangaTab } from "../stores/router";
import { showBanner } from "../stores/topbar";
import { HistoryNavButtons } from "../components/HistoryDropdown";
import { decodeEntities, errorMessage } from "../utils/formatting";
import { addBookmark, removeBookmark } from "../db/library.repo";
import { addMdxBookmark, removeMdxBookmark } from "../providers/mangadex/db/bookmarks.repo";
import { extractMangaDexId } from "../api/navigation";
import { t } from "../i18n";
import { getReaderNavPosition, getReaderFilterCss } from "./settings";
import { IconButton } from "../components/Button";
import { ReaderMainRow, ReaderControlsRow, ReaderMobileBottomBar } from "./ReaderNavRows";
import { ReaderMobileControlsSheet } from "./ReaderMobileControlsSheet";
import {
  ToolIcon,
  BookmarkIcon,
  CloseIcon,
} from "../components/Icon";


export function ReaderToolbar(props: { session?: ReaderSession }) {
  const s = useReader(props.session);
  const navPos = getReaderNavPosition;
  createEffect(() => {
    const z = s.zoomScale();
    if (s.containerEl) {
      s.containerEl.style.setProperty("--ds-zoom-scale", String(z));
    }
  });
  createEffect(() => {
    const f = getReaderFilterCss();
    if (s.containerEl) {
      s.containerEl.style.setProperty("--ds-reader-filter", f === "" ? "none" : f);
    }
  });


  const onFullscreenChange = (): void => {
    if (!document.fullscreenElement && s.isFullscreen()) {
      s.setFullscreen(false);
    } else {
      s.resetToCurrentPage(false);
    }
  };
  makeEventListener(document, "fullscreenchange", onFullscreenChange);


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
      const isMdx = s.permalink.startsWith("mdx:");
      const chId = isMdx ? extractMangaDexId(s.permalink) : "";
      if (s.bookmarked()) {
        if (isMdx) {
          await removeMdxBookmark(chId);
        } else {
          await removeBookmark(s.permalink);
        }
        s.setBookmarked(false);
        showBanner(t("browse.feed.bookmarkRemovedBanner", { title: s.chapterTitle() }));
      } else {
        if (isMdx) {
          await addMdxBookmark({
            chapterId: chId,
            mangaId: s.seriesPermalink() ? extractMangaDexId(s.seriesPermalink()!) : "",
            mangaTitle: s.seriesName() ?? "",
            chapterTitle: s.chapterTitle(),
            pageIndex: s.currentIndex(),
          });
        } else {
          await addBookmark({
            chapterPermalink: s.permalink,
            seriesPermalink: s.seriesPermalink() ?? "",
            seriesName: s.seriesName() ?? "",
            chapterTitle: s.chapterTitle(),
            pageIndex: s.currentIndex(),
          });
        }
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
        classList={{ "ds-toolbar-hidden": !s.toolbarVisible() }}
      >
        <Show when={isMobile()}>
          <div class="ds-reader-nav-row nav-main ds-reader-mobile-row--full">
            <HistoryNavButtons />
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
            <div class="ds-reader-mobile-actions">
              <IconButton
                className="ds-btn-icon"
                classList={{ primary: s.bookmarked() }}
                icon={<BookmarkIcon filled={s.bookmarked()} />}
                title={s.bookmarked() ? t("browse.feed.removeFromReadLater") : t("browse.feed.saveForReadLater")}
                onClick={() => void handleToggleBookmark()}
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

export function ReaderBottomNav(props: { session?: ReaderSession }) {
  const s = useReader(props.session);
  const navPos = getReaderNavPosition;
  return (
    <Show when={isMobile() || navPos() === "bottom"}>
      <nav
        class="ds-reader-nav ds-reader-nav-bottom"
        classList={{ "ds-toolbar-hidden": !s.toolbarVisible() }}
      >
        <Show when={isMobile()}>
          <ReaderMobileBottomBar session={s} />
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
