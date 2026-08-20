import type { ReaderController } from "./reader-controller";
import type { FitMode } from "../types/reader";
import type { ChapterRef } from "../types/routes";
import { getAppTheme, onThemeChange, toggleAppTheme } from "../stores/theme";
import { getReaderNavPosition, type ReaderNavPosition } from "./settings";
import { iconHtml } from "../components/Icon";

/**
 * Builds the reader's sticky navigation bars: chapter/page navigation
 * buttons, the progress track, and the mode/fit/theme/fullscreen/scroll-lock
 * toggles. Reads controller-owned state; writes back on user interaction.
 */
export class ReaderToolbar {
  private zoomOutBtn!: HTMLButtonElement;
  private zoomResetBtn!: HTMLButtonElement;
  private zoomInBtn!: HTMLButtonElement;

  topNav!: HTMLElement;
  bottomNav!: HTMLElement;
  rowMain!: HTMLElement;
  rowControls!: HTMLElement;

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

    if (!this.bottomNav.parentElement) {
      c.readerContainer.appendChild(this.bottomNav);
    }
    this.applyNavPosition(getReaderNavPosition());
    const onNavPosChange = (ev: Event) => {
      const customEv = ev as CustomEvent<ReaderNavPosition>;
      this.applyNavPosition(customEv.detail || getReaderNavPosition());
    };
    window.addEventListener("ds-reader-nav-pos-change", onNavPosChange);
    c.onDispose(() => window.removeEventListener("ds-reader-nav-pos-change", onNavPosChange));
  }

  applyNavPosition(pos: ReaderNavPosition): void {
    if (pos === "bottom") {
      this.topNav.innerHTML = "";
      this.topNav.appendChild(this.rowControls);
      this.topNav.style.display = "";

      this.bottomNav.innerHTML = "";
      this.bottomNav.appendChild(this.rowMain);
      this.bottomNav.style.display = "";
    } else {
      this.bottomNav.innerHTML = "";
      this.bottomNav.style.display = "none";

      this.topNav.innerHTML = "";
      this.topNav.appendChild(this.rowMain);
      this.topNav.appendChild(this.rowControls);
      this.topNav.style.display = "";
    }
  }

  private build(): void {
    const c = this.c;
    const topNav = document.createElement("div");
    topNav.className = "ds-reader-nav ds-reader-nav-top";
    this.topNav = topNav;

    const bottomNav = document.createElement("div");
    bottomNav.className = "ds-reader-nav ds-reader-nav-bottom";
    bottomNav.style.display = "none";
    this.bottomNav = bottomNav;

    const prevChapterBtn = document.createElement("button");
    prevChapterBtn.type = "button";
    prevChapterBtn.className = "win-button";
    prevChapterBtn.title = "Previous Chapter";
    prevChapterBtn.innerHTML = `${iconHtml("chevron-double-left")} Ch`;

    const nextChapterBtn = document.createElement("button");
    nextChapterBtn.type = "button";
    nextChapterBtn.className = "win-button";
    nextChapterBtn.title = "Next Chapter";
    nextChapterBtn.innerHTML = `Ch ${iconHtml("chevron-double-right")}`;

    const prevPageBtn = document.createElement("button");
    prevPageBtn.type = "button";
    prevPageBtn.className = "win-button";
    prevPageBtn.title = "Previous Page (Left Arrow)";
    prevPageBtn.innerHTML = iconHtml("chevron-left");

    const nextPageBtn = document.createElement("button");
    nextPageBtn.type = "button";
    nextPageBtn.className = "win-button";
    nextPageBtn.title = "Next Page (Right Arrow / Space)";
    nextPageBtn.innerHTML = iconHtml("chevron-right");

    const firstPageBtn = document.createElement("button");
    firstPageBtn.type = "button";
    firstPageBtn.className = "win-button";
    firstPageBtn.title = "Jump to First Page";
    firstPageBtn.innerHTML = iconHtml("chevron-double-left");

    const lastPageBtn = document.createElement("button");
    lastPageBtn.type = "button";
    lastPageBtn.className = "win-button";
    lastPageBtn.title = "Jump to Last Page";
    lastPageBtn.innerHTML = iconHtml("chevron-double-right");

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
    scrollLockBtn.title = "Scroll Lock: mouse wheel flips exactly one page at a time";
    scrollLockBtn.innerHTML = c.scrollLock
      ? `${iconHtml("lock-fill")} Scroll Lock`
      : `${iconHtml("unlock")} Scroll Lock`;

    // Layout mode toggle (Vertical Scroll vs Single Page Paged)
    const modeBtn = document.createElement("button");
    modeBtn.type = "button";
    modeBtn.className = "win-button";
    modeBtn.title = "Toggle Horizontal / Vertical reading mode";
    modeBtn.innerHTML = c.isHorizontal
      ? `${iconHtml("distribute-vertical")} Scroll`
      : `${iconHtml("arrow-left-right")} Paged`;

    // Spread layout toggle (two pages per slide, Paged mode only)
    const spreadBtn = document.createElement("button");
    spreadBtn.type = "button";
    spreadBtn.className = "win-button";
    spreadBtn.innerHTML = `${iconHtml("columns-gap")} Spread`;

    // Reading direction toggle (RTL default / LTR via tag or manual)
    const dirBtn = document.createElement("button");
    dirBtn.type = "button";
    dirBtn.className = "win-button";
    dirBtn.innerHTML = `${iconHtml("arrow-left-right")} RTL`;

    // Cover offset toggle (standalone cover page, Paged+Spread only)
    const coverBtn = document.createElement("button");
    coverBtn.type = "button";
    coverBtn.className = "win-button";
    coverBtn.innerHTML = `${iconHtml("book-half")} Cover 1st`;

    // Fit mode selector
    const fitSelect = document.createElement("select");
    fitSelect.className = "win-input";
    fitSelect.innerHTML =
      '<option value="width">Fit Width</option>' +
      '<option value="height">Fit Height</option>' +
      '<option value="original">Original Size</option>';
    fitSelect.value = c.fitMode;

    // Fullscreen toggle button (mimics app's image viewer)
    const fullscreenBtn = document.createElement("button");
    fullscreenBtn.type = "button";
    fullscreenBtn.className = "win-button";
    fullscreenBtn.title = "Toggle Fullscreen (F)";
    fullscreenBtn.innerHTML = `${iconHtml("arrows-fullscreen")} Fullscreen`;

    // Reader theme mode (Light default vs Dark)
    const themeBtn = document.createElement("button");
    themeBtn.type = "button";
    themeBtn.className = "win-button";
    themeBtn.title = "Toggle Light / Dark Theme (T)";

    // Zoom In / Out buttons (rightmost)
    const zoomOutBtn = document.createElement("button");
    zoomOutBtn.type = "button";
    zoomOutBtn.className = "win-button";
    zoomOutBtn.title = "Zoom Out (Ctrl - / -)";
    zoomOutBtn.innerHTML = iconHtml("dash-lg");

    const zoomResetBtn = document.createElement("button");
    zoomResetBtn.type = "button";
    zoomResetBtn.className = "win-button";
    zoomResetBtn.style.minWidth = "44px";
    zoomResetBtn.title = "Reset Zoom (Ctrl 0)";
    zoomResetBtn.textContent = "100%";

    const zoomInBtn = document.createElement("button");
    zoomInBtn.type = "button";
    zoomInBtn.className = "win-button";
    zoomInBtn.title = "Zoom In (Ctrl + / +)";
    zoomInBtn.innerHTML = iconHtml("plus-lg");

    this.zoomOutBtn = zoomOutBtn;
    this.zoomResetBtn = zoomResetBtn;
    this.zoomInBtn = zoomInBtn;

    zoomOutBtn.addEventListener("click", () => this.zoomOut());
    zoomResetBtn.addEventListener("click", () => this.resetZoom());
    zoomInBtn.addEventListener("click", () => this.zoomIn());

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

    const rowMain = document.createElement("div");
    rowMain.className = "ds-reader-nav-row nav-main";
    rowMain.appendChild(prevChapterBtn);
    rowMain.appendChild(firstPageBtn);
    rowMain.appendChild(prevPageBtn);
    rowMain.appendChild(progressWrap);
    rowMain.appendChild(nextPageBtn);
    rowMain.appendChild(lastPageBtn);
    rowMain.appendChild(nextChapterBtn);

    const rowControls = document.createElement("div");
    rowControls.className = "ds-reader-nav-row nav-controls";
    rowControls.appendChild(scrollLockBtn);
    rowControls.appendChild(modeBtn);
    rowControls.appendChild(coverBtn);
    rowControls.appendChild(spreadBtn);
    rowControls.appendChild(dirBtn);
    rowControls.appendChild(fitSelect);
    rowControls.appendChild(themeBtn);
    rowControls.appendChild(fullscreenBtn);
    rowControls.appendChild(zoomOutBtn);
    rowControls.appendChild(zoomResetBtn);
    rowControls.appendChild(zoomInBtn);

    this.rowMain = rowMain;
    this.rowControls = rowControls;

    c.readerContainer.appendChild(topNav);

    this.updateZoomUI();

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
      this.updateZoomUI();
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
      c.fullscreenBtn.innerHTML = `${iconHtml("fullscreen-exit")} Exit`;
      c.fullscreenBtn.title = "Exit Fullscreen (Esc / F)";
      try {
        if (!document.fullscreenElement && document.fullscreenEnabled) {
          void c.readerContainer.requestFullscreen().catch(() => {});
        }
      } catch {}
    } else {
      c.readerContainer.classList.remove("ds-fullscreen");
      c.fullscreenBtn.className = "win-button";
      c.fullscreenBtn.innerHTML = `${iconHtml("arrows-fullscreen")} Fullscreen`;
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
      c.themeBtn.innerHTML = iconHtml("moon-fill");
    } else {
      c.readerContainer.classList.remove("ds-dark");
      c.themeBtn.innerHTML = iconHtml("sun");
    }
  }

  /** Refreshes the mode / spread / direction / cover toggle button labels + visibility. */
  updateLayoutBtns(): void {
    const c = this.c;
    if (c.isHorizontal) {
      c.modeBtn.innerHTML = `${iconHtml("distribute-vertical")} Scroll`;
      c.modeBtn.title = "Switch to Continuous Scroll (M)";
    } else {
      c.modeBtn.innerHTML = `${iconHtml("arrow-left-right")} Paged`;
      c.modeBtn.title = "Switch to Paged (M)";
    }

    const inPaged = c.mode === "paged";
    c.spreadBtn.style.display = inPaged ? "" : "none";
    c.dirBtn.style.display = inPaged ? "" : "none";
    c.coverBtn.style.display = c.isSpread ? "" : "none";

    c.spreadBtn.className = `win-button${c.pagedLayout === "spread" ? " primary" : ""}`;
    c.spreadBtn.innerHTML = `${iconHtml("columns-gap")} Spread: ${c.pagedLayout === "spread" ? "ON" : "OFF"}`;
    c.spreadBtn.title = "Pair two pages per slide in Paged mode (M cycles)";

    c.dirBtn.className = `win-button${c.directionAutoDetected ? "" : " primary"}`;
    const dirIcon = c.direction === "rtl" ? "arrow-left" : "arrow-right";
    c.dirBtn.innerHTML = `${iconHtml(dirIcon)} ${c.direction.toUpperCase()}`;
    c.dirBtn.title = c.directionAutoDetected
      ? `Reading direction ${c.direction.toUpperCase()} (auto-detected from tags; D overrides)`
      : `Reading direction ${c.direction.toUpperCase()} (manual; D toggles)`;

    c.coverBtn.className = `win-button${c.coverOffset ? " primary" : ""}`;
    c.coverBtn.innerHTML = `${iconHtml("book-half")} Cover 1st: ${c.coverOffset ? "ON" : "OFF"}`;
    c.coverBtn.title = "Show the cover alone before pairing pages (C)";

    this.updateScrollLockBtn();
  }

  updateZoomUI(): void {
    const c = this.c;
    const isFitActive = c.fitMode !== "original";
    if (this.zoomResetBtn) {
      this.zoomResetBtn.textContent = `${Math.round(c.zoomScale * 100)}%`;
      this.zoomResetBtn.disabled = isFitActive;
      this.zoomResetBtn.title = isFitActive ? "Zoom disabled when Fit mode is active" : "Reset Zoom (Ctrl 0)";
    }
    c.readerContainer.style.setProperty("--ds-zoom-scale", String(c.zoomScale));
    if (this.zoomOutBtn) {
      this.zoomOutBtn.disabled = isFitActive || c.zoomScale <= 0.25;
      this.zoomOutBtn.title = isFitActive
        ? "Zoom disabled when Fit mode is active (set to Original Size to zoom)"
        : "Zoom Out (Ctrl - / -)";
    }
    if (this.zoomInBtn) {
      this.zoomInBtn.disabled = isFitActive || c.zoomScale >= 3.0;
      this.zoomInBtn.title = isFitActive
        ? "Zoom disabled when Fit mode is active (set to Original Size to zoom)"
        : "Zoom In (Ctrl + / +)";
    }
  }

  zoomIn(): void {
    const c = this.c;
    if (c.fitMode !== "original") return;
    c.zoomScale = Math.min(3.0, Math.round((c.zoomScale + 0.1) * 10) / 10);
    this.updateZoomUI();
  }

  zoomOut(): void {
    const c = this.c;
    if (c.fitMode !== "original") return;
    c.zoomScale = Math.max(0.25, Math.round((c.zoomScale - 0.1) * 10) / 10);
    this.updateZoomUI();
  }

  resetZoom(): void {
    const c = this.c;
    if (c.fitMode !== "original") return;
    c.zoomScale = 1.0;
    this.updateZoomUI();
  }

  updateScrollLockBtn(): void {
    const c = this.c;
    if (c.isHorizontal) {
      c.scrollLockBtn.className = `win-button${c.scrollLock ? " primary" : ""}`;
      c.scrollLockBtn.innerHTML = `${iconHtml("arrow-left-right")} Scroll Smooth`;
    } else {
      c.scrollLockBtn.className = `win-button${c.scrollLock ? " primary" : ""}`;
      c.scrollLockBtn.innerHTML = c.scrollLock
        ? `${iconHtml("lock-fill")} Scroll Lock`
        : `${iconHtml("unlock")} Scroll Lock`;
    }
  }
}
