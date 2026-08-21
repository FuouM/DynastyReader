/**
 * Reader keyboard bindings: Navigation keys are ignored while the user is
 * typing in an input/select. Effect-only component registering key bindings.
 */

import { onCleanup, onMount } from "solid-js";
import type { ReaderSession } from "./reader-session";

export function ReaderShortcuts(props: { session: ReaderSession }) {
  const c = props.session;

  onMount(() => {
    const onKeyDown = (ev: KeyboardEvent): void => {
      // Ignore if user is typing in an input or textarea
      const tag = (ev.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (ev.key === "ArrowLeft" || ev.key === "ArrowRight" || ev.key === " ") {
        ev.preventDefault();
        const rightOrSpace = ev.key === "ArrowRight" || ev.key === " ";
        if (c.isSpread()) {
          // Direction-aware: LTR → Right/Space next, Left prev; RTL → Left/Space next.
          const forward = c.direction() === "rtl" ? !rightOrSpace : rightOrSpace;
          c.stepSpread(forward ? 1 : -1);
        } else {
          c.setPage(c.currentIndex() + (rightOrSpace ? 1 : -1));
        }
      } else if (ev.key === "m" || ev.key === "M") {
        ev.preventDefault();
        if (c.mode() === "scroll") {
          c.setPagedLayout("single");
          c.setMode("paged");
        } else if (c.pagedLayout() === "single") {
          c.setPagedLayout("spread");
        } else {
          c.setMode("scroll");
        }
      } else if (ev.key === "d" || ev.key === "D") {
        ev.preventDefault();
        c.setDirection(c.direction() === "rtl" ? "ltr" : "rtl");
      } else if (ev.key === "c" || ev.key === "C") {
        ev.preventDefault();
        if (c.mode() === "paged") c.toggleCoverOffset();
      } else if (ev.key === "f" || ev.key === "F") {
        ev.preventDefault();
        c.setFullscreen(!c.isFullscreen());
      } else if (ev.key === "t" || ev.key === "T") {
        ev.preventDefault();
        c.toggleTheme();
      } else if (ev.key === "Escape" && c.isFullscreen()) {
        ev.preventDefault();
        c.setFullscreen(false);
      } else if (
        ((ev.ctrlKey || ev.metaKey) && (ev.key === "=" || ev.key === "+")) ||
        (!ev.ctrlKey && !ev.metaKey && !ev.altKey && (ev.key === "+" || ev.key === "="))
      ) {
        if (c.fitMode() === "original") {
          ev.preventDefault();
          c.zoomIn();
        }
      } else if (
        ((ev.ctrlKey || ev.metaKey) && (ev.key === "-" || ev.key === "_")) ||
        (!ev.ctrlKey && !ev.metaKey && !ev.altKey && (ev.key === "-" || ev.key === "_"))
      ) {
        if (c.fitMode() === "original") {
          ev.preventDefault();
          c.zoomOut();
        }
      } else if (
        ((ev.ctrlKey || ev.metaKey) && ev.key === "0") ||
        (!ev.ctrlKey && !ev.metaKey && !ev.altKey && ev.key === "0")
      ) {
        if (c.fitMode() === "original") {
          ev.preventDefault();
          c.resetZoom();
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    onCleanup(() => window.removeEventListener("keydown", onKeyDown));
  });

  return null;
}
