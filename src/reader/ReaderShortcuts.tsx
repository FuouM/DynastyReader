/**
 * Reader keyboard shortcuts: Navigation and view control bindings.
 * Unified with the centralized hotkeys store.
 */
import { onCleanup, onMount } from "solid-js";
import type { ReaderSession } from "./reader-session";
import { isTextInputTarget, matchesHotkey } from "../hotkeys";

export function ReaderShortcuts(props: { session: ReaderSession }) {
  const c = props.session;

  const onKeyDown = (ev: KeyboardEvent): void => {
    // Ignore if user is currently typing in an input or textarea
      if (isTextInputTarget(ev.target)) return;

      if (matchesHotkey(ev, "reader.nextPage")) {
        ev.preventDefault();
        if (c.isSpread()) {
          c.stepSpread(1);
        } else {
          c.setPage(c.currentIndex() + 1);
        }
      } else if (matchesHotkey(ev, "reader.prevPage")) {
        ev.preventDefault();
        if (c.isSpread()) {
          c.stepSpread(-1);
        } else {
          c.setPage(c.currentIndex() - 1);
        }
      } else if (matchesHotkey(ev, "reader.firstPage")) {
        ev.preventDefault();
        c.setPage(0, true);
      } else if (matchesHotkey(ev, "reader.lastPage")) {
        ev.preventDefault();
        c.setPage(c.pages().length - 1, true);
      } else if (matchesHotkey(ev, "reader.nextChapter")) {
        const list = c.chapterList();
        const curIdx = list.findIndex((x) => x.permalink === c.permalink);
        if (curIdx >= 0 && curIdx < list.length - 1) {
          ev.preventDefault();
          c.gotoChapter(list[curIdx + 1]);
        }
      } else if (matchesHotkey(ev, "reader.prevChapter")) {
        const list = c.chapterList();
        const curIdx = list.findIndex((x) => x.permalink === c.permalink);
        if (curIdx > 0) {
          ev.preventDefault();
          c.gotoChapter(list[curIdx - 1]);
        }
      } else if (matchesHotkey(ev, "reader.toggleMode")) {
        ev.preventDefault();
        if (c.mode() === "scroll") {
          c.setPagedLayout("single");
          c.setMode("paged");
        } else if (c.pagedLayout() === "single") {
          c.setPagedLayout("spread");
        } else {
          c.setMode("scroll");
        }
      } else if (matchesHotkey(ev, "reader.toggleSpread")) {
        ev.preventDefault();
        if (c.mode() === "paged") {
          c.setPagedLayout(c.pagedLayout() === "spread" ? "single" : "spread");
        }
      } else if (matchesHotkey(ev, "reader.toggleDirection")) {
        ev.preventDefault();
        c.setDirection(c.direction() === "rtl" ? "ltr" : "rtl");
      } else if (matchesHotkey(ev, "reader.toggleCoverOffset")) {
        ev.preventDefault();
        if (c.mode() === "paged") c.toggleCoverOffset();
      } else if (matchesHotkey(ev, "reader.toggleScrollLock")) {
        ev.preventDefault();
        c.setScrollLock();
      } else if (matchesHotkey(ev, "reader.toggleFullscreen")) {
        ev.preventDefault();
        c.setFullscreen(!c.isFullscreen());
      } else if (matchesHotkey(ev, "reader.zoomIn")) {
        if (c.fitMode() === "original") {
          ev.preventDefault();
          c.zoomIn();
        }
      } else if (matchesHotkey(ev, "reader.zoomOut")) {
        if (c.fitMode() === "original") {
          ev.preventDefault();
          c.zoomOut();
        }
      } else if (matchesHotkey(ev, "reader.resetZoom")) {
        if (c.fitMode() === "original") {
          ev.preventDefault();
          c.resetZoom();
        }
      } else if (ev.key === "Escape" && c.isFullscreen()) {
        ev.preventDefault();
        c.setFullscreen(false);
      }
    };

  onMount(() => {
    window.addEventListener("keydown", onKeyDown);
    onCleanup(() => window.removeEventListener("keydown", onKeyDown));
  });

  return null;
}
