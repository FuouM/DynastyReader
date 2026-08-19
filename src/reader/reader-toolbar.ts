import type { ReaderController } from "./reader-controller";
import type { FitMode } from "../types/reader";
import type { ChapterRef } from "../types/routes";
import { getAppTheme, onThemeChange, toggleAppTheme } from "../theme";

/**
 * Builds the reader's sticky top navigation bar: chapter/page navigation
 * buttons, the progress track, and the mode/fit/theme/fullscreen/scroll-lock
 * toggles. Reads controller-owned state; writes back on user interaction.
 */
export class ReaderToolbar {
  constructor(private readonly c: ReaderController) {
    this.build();
  }

  /** Finishes wiring after the slot strip exists (applies saved mode + labels). */
  wireAfterSlots(): void {
    const c = this.c;
    c.updateChapterNav();
    c.viewportImpl.applyLayoutMode();
    this.updateLayoutBtns();
    this.applyTheme();
    c.onDispose(onThemeChange(() => this.applyTheme()));
  }

  private build(): void {
    const c = this.c;
    const nav = document.createElement("div");
    nav.className = "ds-reader-nav";

    const prevChapterBtn = document.createElement("button");
    prevChapterBtn.type = "button";
    prevChapterBtn.className = "win-button";
    prevChapterBtn.style.cssText = "font-size:11px;padding:2px 8px;";
    prevChapterBtn.title = "Previous Chapter";
    prevChapterBtn.innerHTML = '<i class="bi bi-chevron-double-left"></i> Ch';

    const nextChapterBtn = document.createElement("button");
    nextChapterBtn.type = "button";
    nextChapterBtn.className = "win-button";
    nextChapterBtn.style.cssText = "font-size:11px;padding:2px 8px;";
    nextChapterBtn.title = "Next Chapter";
    nextChapterBtn.innerHTML = 'Ch <i class="bi bi-chevron-double-right"></i>';

    const prevPageBtn = document.createElement("button");
    prevPageBtn.type = "button";
    prevPageBtn.className = "win-button";
    prevPageBtn.style.cssText = "font-size:11px;padding:2px 8px;";
    prevPageBtn.title = "Previous Page (Left Arrow)";
    prevPageBtn.innerHTML = '<i class="bi bi-chevron-left"></i>';

    const nextPageBtn = document.createElement("button");
    nextPageBtn.type = "button";
    nextPageBtn.className = "win-button";
    nextPageBtn.style.cssText = "font-size:11px;padding:2px 8px;";
    nextPageBtn.title = "Next Page (Right Arrow / Space)";
    nextPageBtn.innerHTML = '<i class="bi bi-chevron-right"></i>';

    const firstPageBtn = document.createElement("button");
    firstPageBtn.type = "button";
    firstPageBtn.className = "win-button";
    firstPageBtn.style.cssText = "font-size:11px;padding:2px 8px;";
    firstPageBtn.title = "Jump to First Page";
    firstPageBtn.innerHTML = '<i class="bi bi-chevron-double-left"></i>';

    const lastPageBtn = document.createElement("button");
    lastPageBtn.type = "button";
    lastPageBtn.className = "win-button";
    lastPageBtn.style.cssText = "font-size:11px;padding:2px 8px;";
    lastPageBtn.title = "Jump to Last Page";
    lastPageBtn.innerHTML = '<i class="bi bi-chevron-double-right"></i>';

    const progressWrap = document.createElement("div");
    progressWrap.className = "ds-reader-progress-wrap";

    const progressPill = document.createElement("div");
    progressPill.className = "ds-reader-progress-pill";

    const positionLabel = document.createElement("span");
    positionLabel.className = "ds-reader-progress-label";
    progressPill.appendChild(positionLabel);
    progressWrap.appendChild(progressPill);

    const progressTrack = document.createElement("div");
    progressTrack.className = "ds-reader-progress-track";

    const progressFill = document.createElement("div");
    progressFill.className = "ds-reader-progress-fill";
    progressTrack.appendChild(progressFill);
    progressWrap.appendChild(progressTrack);

    // Scroll Lock toggle button (Wheel advances discrete page instead of free scroll)
    const scrollLockBtn = document.createElement("button");
    scrollLockBtn.type = "button";
    scrollLockBtn.className = `win-button${c.scrollLock ? " primary" : ""}`;
    scrollLockBtn.style.cssText = "font-size:11px;padding:2px 8px;";
    scrollLockBtn.title = "Scroll Lock: mouse wheel flips exactly one page at a time";
    scrollLockBtn.innerHTML = c.scrollLock
      ? '<i class="bi bi-lock-fill"></i> Scroll Lock'
      : '<i class="bi bi-unlock"></i> Scroll Lock';

    // Layout mode toggle (Vertical Scroll vs Single Page Paged)
    const modeBtn = document.createElement("button");
    modeBtn.type = "button";
    modeBtn.className = "win-button";
    modeBtn.style.cssText = "font-size:11px;padding:2px 8px;";
    modeBtn.title = "Toggle Horizontal / Vertical reading mode";
    modeBtn.innerHTML = c.isHorizontal
      ? '<i class="bi bi-distribute-vertical"></i> Scroll'
      : '<i class="bi bi-arrow-left-right"></i> Paged';

    // Spread layout toggle (two pages per slide, Paged mode only)
    const spreadBtn = document.createElement("button");
    spreadBtn.type = "button";
    spreadBtn.className = "win-button";
    spreadBtn.style.cssText = "font-size:11px;padding:2px 8px;";
    spreadBtn.innerHTML = '<i class="bi bi-columns-gap"></i> Spread';

    // Reading direction toggle (RTL default / LTR via tag or manual)
    const dirBtn = document.createElement("button");
    dirBtn.type = "button";
    dirBtn.className = "win-button";
    dirBtn.style.cssText = "font-size:11px;padding:2px 8px;";
    dirBtn.innerHTML = '<i class="bi bi-arrow-left-right"></i> RTL';

    // Cover offset toggle (standalone cover page, Paged+Spread only)
    const coverBtn = document.createElement("button");
    coverBtn.type = "button";
    coverBtn.className = "win-button";
    coverBtn.style.cssText = "font-size:11px;padding:2px 8px;";
    coverBtn.innerHTML = '<i class="bi bi-book-half"></i> Cover 1st';

    // Fit mode selector
    const fitSelect = document.createElement("select");
    fitSelect.className = "win-input";
    fitSelect.style.cssText = "font-size:11px;padding:2px 4px;";
    fitSelect.innerHTML =
      '<option value="width">Fit Width</option>' +
      '<option value="height">Fit Height</option>' +
      '<option value="original">Original Size</option>';
    fitSelect.value = c.fitMode;

    // Fullscreen toggle button (mimics app's image viewer)
    const fullscreenBtn = document.createElement("button");
    fullscreenBtn.type = "button";
    fullscreenBtn.className = "win-button";
    fullscreenBtn.style.cssText = "font-size:11px;padding:2px 8px;";
    fullscreenBtn.title = "Toggle Fullscreen (F)";
    fullscreenBtn.innerHTML = '<i class="bi bi-arrows-fullscreen"></i> Fullscreen';

    // Reader theme mode (Light default vs Dark)
    const themeBtn = document.createElement("button");
    themeBtn.type = "button";
    themeBtn.className = "win-button";
    themeBtn.style.cssText = "font-size:11px;padding:2px 8px;";
    themeBtn.title = "Toggle Light / Dark Theme (T)";

    // Zoom In / Out buttons (rightmost)
    const zoomOutBtn = document.createElement("button");
    zoomOutBtn.type = "button";
    zoomOutBtn.className = "win-button";
    zoomOutBtn.style.cssText = "font-size:11px;padding:2px 7px;";
    zoomOutBtn.title = "Zoom Out (Ctrl - / -)";
    zoomOutBtn.innerHTML = '<i class="bi bi-dash-lg"></i>';

    const zoomResetBtn = document.createElement("button");
    zoomResetBtn.type = "button";
    zoomResetBtn.className = "win-button";
    zoomResetBtn.style.cssText = "font-size:11px;padding:2px 6px;min-width:44px;";
    zoomResetBtn.title = "Reset Zoom (Ctrl 0)";
    zoomResetBtn.textContent = "100%";

    const zoomInBtn = document.createElement("button");
    zoomInBtn.type = "button";
    zoomInBtn.className = "win-button";
    zoomInBtn.style.cssText = "font-size:11px;padding:2px 7px;";
    zoomInBtn.title = "Zoom In (Ctrl + / +)";
    zoomInBtn.innerHTML = '<i class="bi bi-plus-lg"></i>';

    const updateZoomUI = (): void => {
      const isFitActive = c.fitMode !== "original";
      zoomResetBtn.textContent = `${Math.round(c.zoomScale * 100)}%`;
      c.readerContainer.style.setProperty("--ds-zoom-scale", String(c.zoomScale));
      zoomOutBtn.disabled = isFitActive || c.zoomScale <= 0.25;
      zoomResetBtn.disabled = isFitActive;
      zoomInBtn.disabled = isFitActive || c.zoomScale >= 3.0;

      if (isFitActive) {
        zoomOutBtn.title = "Zoom disabled when Fit mode is active (set to Original Size to zoom)";
        zoomResetBtn.title = "Zoom disabled when Fit mode is active";
        zoomInBtn.title = "Zoom disabled when Fit mode is active (set to Original Size to zoom)";
      } else {
        zoomOutBtn.title = "Zoom Out (Ctrl - / -)";
        zoomResetBtn.title = "Reset Zoom (Ctrl 0)";
        zoomInBtn.title = "Zoom In (Ctrl + / +)";
      }
    };

    zoomOutBtn.addEventListener("click", () => {
      if (c.fitMode !== "original") return;
      c.zoomScale = Math.max(0.25, Math.round((c.zoomScale - 0.1) * 10) / 10);
      updateZoomUI();
    });
    zoomResetBtn.addEventListener("click", () => {
      if (c.fitMode !== "original") return;
      c.zoomScale = 1.0;
      updateZoomUI();
    });
    zoomInBtn.addEventListener("click", () => {
      if (c.fitMode !== "original") return;
      c.zoomScale = Math.min(3.0, Math.round((c.zoomScale + 0.1) * 10) / 10);
      updateZoomUI();
    });

    // Store DOM refs on the controller so progress/shortcut code can reach them
    c.prevChapterBtn = prevChapterBtn;
    c.nextChapterBtn = nextChapterBtn;
    c.prevPageBtn = prevPageBtn;
    c.nextPageBtn = nextPageBtn;
    c.firstPageBtn = firstPageBtn;
    c.lastPageBtn = lastPageBtn;
    c.positionLabel = positionLabel;
    c.progressFill = progressFill;
    c.scrollLockBtn = scrollLockBtn;
    c.modeBtn = modeBtn;
    c.spreadBtn = spreadBtn;
    c.dirBtn = dirBtn;
    c.coverBtn = coverBtn;
    c.fitSelect = fitSelect;
    c.fullscreenBtn = fullscreenBtn;
    c.themeBtn = themeBtn;

    nav.appendChild(prevChapterBtn);
    nav.appendChild(firstPageBtn);
    nav.appendChild(prevPageBtn);
    nav.appendChild(progressWrap);
    nav.appendChild(nextPageBtn);
    nav.appendChild(lastPageBtn);
    nav.appendChild(nextChapterBtn);
    nav.appendChild(scrollLockBtn);
    nav.appendChild(modeBtn);
    nav.appendChild(coverBtn);
    nav.appendChild(spreadBtn);
    nav.appendChild(dirBtn);
    nav.appendChild(fitSelect);
    nav.appendChild(themeBtn);
    nav.appendChild(fullscreenBtn);
    nav.appendChild(zoomOutBtn);
    nav.appendChild(zoomResetBtn);
    nav.appendChild(zoomInBtn);
    c.readerContainer.appendChild(nav);

    updateZoomUI();

    const gotoChapter = (ch: ChapterRef): void => c.gotoChapter(ch);

    prevChapterBtn.addEventListener("click", () => {
      const curIdx = c.chapterList.findIndex((x) => x.permalink === c.permalink);
      if (curIdx > 0) gotoChapter(c.chapterList[curIdx - 1]);
    });
    nextChapterBtn.addEventListener("click", () => {
      const curIdx = c.chapterList.findIndex((x) => x.permalink === c.permalink);
      if (curIdx >= 0 && curIdx < c.chapterList.length - 1) gotoChapter(c.chapterList[curIdx + 1]);
    });

    prevPageBtn.addEventListener("click", () => {
      if (c.isSpread) c.stepSpread(-1);
      else c.setPage(c.currentIndex - 1);
    });
    nextPageBtn.addEventListener("click", () => {
      if (c.isSpread) c.stepSpread(1);
      else c.setPage(c.currentIndex + 1);
    });

    firstPageBtn.addEventListener("click", () => c.setPage(0, true));
    lastPageBtn.addEventListener("click", () => c.setPage(c.pages.length - 1, true));

    scrollLockBtn.addEventListener("click", () => {
      c.scrollLock = !c.scrollLock;
      localStorage.setItem("ds-reader-scroll-lock", c.scrollLock ? "1" : "0");
      this.updateScrollLockBtn();
    });

    modeBtn.addEventListener("click", () => {
      c.setMode(c.mode === "paged" ? "scroll" : "paged");
    });

    spreadBtn.addEventListener("click", () => {
      c.setPagedLayout(c.pagedLayout === "spread" ? "single" : "spread");
    });

    dirBtn.addEventListener("click", () => {
      c.setDirection(c.direction === "rtl" ? "ltr" : "rtl");
    });

    coverBtn.addEventListener("click", () => {
      c.toggleCoverOffset();
    });

    fitSelect.addEventListener("change", () => {
      c.readerContainer.classList.remove("fit-width", "fit-height", "fit-original");
      c.fitMode = fitSelect.value as FitMode;
      localStorage.setItem("ds-reader-fit", c.fitMode);
      c.readerContainer.classList.add(`fit-${c.fitMode}`);
      if (c.fitMode !== "original") {
        c.zoomScale = 1.0;
      }
      updateZoomUI();
    });

    themeBtn.addEventListener("click", () => this.toggleTheme());
    fullscreenBtn.addEventListener("click", () => this.setFullscreen(!c.isFullscreen));

    this.applyTheme();

    // Fullscreenchange synchronization (Esc exits fullscreen natively)
    const onFullscreenChange = (): void => {
      if (!document.fullscreenElement && c.isFullscreen) {
        this.setFullscreen(false);
      } else {
        c.viewportImpl.resetToCurrentPage(false);
      }
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    c.onDispose(() => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      if (document.fullscreenElement) {
        void document.exitFullscreen().catch(() => {});
      }
    });
  }

  setFullscreen(active: boolean): void {
    const c = this.c;
    c.isFullscreen = active;
    if (c.isFullscreen) {
      c.readerContainer.classList.add("ds-fullscreen");
      c.fullscreenBtn.className = "win-button primary";
      c.fullscreenBtn.innerHTML = '<i class="bi bi-fullscreen-exit"></i> Exit';
      c.fullscreenBtn.title = "Exit Fullscreen (Esc / F)";
      try {
        if (!document.fullscreenElement && document.fullscreenEnabled) {
          void c.readerContainer.requestFullscreen().catch(() => {});
        }
      } catch {}
    } else {
      c.readerContainer.classList.remove("ds-fullscreen");
      c.fullscreenBtn.className = "win-button";
      c.fullscreenBtn.innerHTML = '<i class="bi bi-arrows-fullscreen"></i> Fullscreen';
      c.fullscreenBtn.title = "Toggle Fullscreen (F)";
      try {
        if (document.fullscreenElement) {
          void document.exitFullscreen().catch(() => {});
        }
      } catch {}
    }

    c.viewportImpl.resetToCurrentPage(false);
    setTimeout(() => c.viewportImpl.resetToCurrentPage(false), 60);
    setTimeout(() => c.viewportImpl.resetToCurrentPage(false), 180);
  }

  toggleTheme(): void {
    toggleAppTheme();
  }

  applyTheme(): void {
    const c = this.c;
    if (getAppTheme() === "dark") {
      c.readerContainer.classList.add("ds-dark");
      c.themeBtn.innerHTML = '<i class="bi bi-moon-fill"></i>';
    } else {
      c.readerContainer.classList.remove("ds-dark");
      c.themeBtn.innerHTML = '<i class="bi bi-sun"></i>';
    }
  }

  /** Refreshes the mode / spread / direction / cover toggle button labels + visibility. */
  updateLayoutBtns(): void {
    const c = this.c;
    if (c.isHorizontal) {
      c.modeBtn.innerHTML = '<i class="bi bi-distribute-vertical"></i> Scroll';
      c.modeBtn.title = "Switch to Continuous Scroll (M)";
    } else {
      c.modeBtn.innerHTML = '<i class="bi bi-arrow-left-right"></i> Paged';
      c.modeBtn.title = "Switch to Paged (M)";
    }

    const inPaged = c.mode === "paged";
    c.spreadBtn.style.display = inPaged ? "" : "none";
    c.dirBtn.style.display = inPaged ? "" : "none";
    c.coverBtn.style.display = c.isSpread ? "" : "none";

    c.spreadBtn.className = `win-button${c.pagedLayout === "spread" ? " primary" : ""}`;
    c.spreadBtn.innerHTML = `<i class="bi bi-columns-gap"></i> Spread: ${c.pagedLayout === "spread" ? "ON" : "OFF"}`;
    c.spreadBtn.title = "Pair two pages per slide in Paged mode (M cycles)";

    c.dirBtn.className = `win-button${c.directionAutoDetected ? "" : " primary"}`;
    const dirIcon = c.direction === "rtl" ? "bi-arrow-left" : "bi-arrow-right";
    c.dirBtn.innerHTML = `<i class="bi ${dirIcon}"></i> ${c.direction.toUpperCase()}`;
    c.dirBtn.title = c.directionAutoDetected
      ? `Reading direction ${c.direction.toUpperCase()} (auto-detected from tags; D overrides)`
      : `Reading direction ${c.direction.toUpperCase()} (manual; D toggles)`;

    c.coverBtn.className = `win-button${c.coverOffset ? " primary" : ""}`;
    c.coverBtn.innerHTML = `<i class="bi bi-book-half"></i> Cover 1st: ${c.coverOffset ? "ON" : "OFF"}`;
    c.coverBtn.title = "Show the cover alone before pairing pages (C)";

    this.updateScrollLockBtn();
  }

  updateScrollLockBtn(): void {
    const c = this.c;
    if (c.isHorizontal) {
      c.scrollLockBtn.className = `win-button${c.scrollLock ? " primary" : ""}`;
      c.scrollLockBtn.innerHTML = '<i class="bi bi-arrow-left-right"></i> Scroll Smooth';
    } else {
      c.scrollLockBtn.className = `win-button${c.scrollLock ? " primary" : ""}`;
      c.scrollLockBtn.innerHTML = c.scrollLock
        ? '<i class="bi bi-lock-fill"></i> Scroll Lock'
        : '<i class="bi bi-unlock"></i> Scroll Lock';
    }
  }
}
