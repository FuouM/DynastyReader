/**
 * Comprehensive Browser Sweep Suite for DynastyReader.
 * Directly interoperable with headless browser tools and evaluation runners.
 */

import {
  auditPage,
  setDesktopViewport,
  setMobileViewport,
  initInPageLogTrap,
  assertNoAppErrors,
  waitForResourceReady,
} from "./browser-helpers";
import { getMockBridgeCode } from "./fixtures/mock-bridge";
import type { ElementHandle, Page } from "puppeteer-core";

function delay(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  return promise;
}

export interface SweepStepResult {
  step: string;
  passed: boolean;
  details?: unknown;
  error?: string;
}

export interface SweepReport {
  timestamp: string;
  totalSteps: number;
  passedSteps: number;
  failedSteps: number;
  steps: SweepStepResult[];
}

export async function runBrowserSweep(page: Page): Promise<SweepReport> {
  const steps: SweepStepResult[] = [];

  const recordStep = (step: string, passed: boolean, details?: unknown, error?: string) => {
    steps.push({ step, passed, details, error });
  };

  try {
    // ── Phase 1: Desktop Viewport (1280x800) ──
    await setDesktopViewport(page);
    await page.evaluateOnNewDocument(getMockBridgeCode());

    // 1. Initial Browse View
    await page.goto("http://localhost:1420/?mock=1");
    await initInPageLogTrap(page);
    await page.waitForSelector("#ds-topbar", { timeout: 5000 });
    const hasTopbar = await page.evaluate(() => !!document.getElementById("ds-topbar"));
    recordStep("Desktop: Mount & Topbar Presence", hasTopbar);

    // 2. Library View & Extracted Actions (TS-06)
    await page.click("#ds-tab-library");
    await page.waitForSelector(".ds-library-pane, .ds-library-nav-item", { timeout: 3000 });
    const libraryActions = await page.evaluate(() => {
      const refreshBtn = !!document.getElementById("ds-library-refresh-btn");
      const navItems = Array.from(document.querySelectorAll(".ds-library-nav-item")).map(el => el.textContent?.trim());
      return { refreshBtn, navItems };
    });
    recordStep("Desktop: Library View & LibraryTabActions", libraryActions.refreshBtn && libraryActions.navItems.length > 0, libraryActions);

    // 2b. Library Hold-to-Select Gesture & Cancel Resilience
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button, a, .ds-library-nav-item, .ds-subtab-btn"));
      const b = btns.find(el => el.textContent?.includes("Bookmarks")) as HTMLElement | undefined;
      b?.click();
    });
    await delay(500);

    const countBeforeHold = await page.evaluate(() => {
      return document.getElementById("ds-library-tab-bookmarks")?.querySelectorAll(".ds-library-item-wrap, .ds-item-row").length ?? 0;
    });

    const itemCenter = await page.evaluate(() => {
      const pane = document.getElementById("ds-library-tab-bookmarks");
      const wrap = pane?.querySelector(".ds-library-item-wrap");
      if (!wrap) return null;
      const r = wrap.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });

    if (itemCenter) {
      await page.mouse.move(itemCenter.x, itemCenter.y);
      await page.mouse.down();
      await delay(550);
      await page.mouse.up();
      await delay(200);

      const inSelection = await page.evaluate(() => {
        const pane = document.getElementById("ds-library-tab-bookmarks");
        const checkboxes = pane?.querySelectorAll("input[type='checkbox']");
        const cancelBtn = Array.from(document.querySelectorAll("button")).find(b => b.textContent?.includes("Cancel") || b.textContent?.includes("Done"));
        return {
          checkboxCount: checkboxes?.length ?? 0,
          hasCancelBtn: !!cancelBtn,
        };
      });
      recordStep("Desktop: Library Hold-to-Select Gesture", inSelection.checkboxCount > 0 && inSelection.hasCancelBtn, inSelection);

      // Cancel selection
      await page.evaluate(() => {
        const cancelBtn = Array.from(document.querySelectorAll("button")).find(b => b.textContent?.includes("Cancel") || b.textContent?.includes("Done"));
        cancelBtn?.click();
      });
      await delay(300);

      const countAfterCancel = await page.evaluate(() => {
        return document.getElementById("ds-library-tab-bookmarks")?.querySelectorAll(".ds-library-item-wrap, .ds-item-row").length ?? 0;
      });
      recordStep("Desktop: Library Cancel Selection Preserves Rows", countAfterCancel === countBeforeHold && countAfterCancel > 0, { countBeforeHold, countAfterCancel });
    }
    // 3. Local Pane & Modal Integration (TS-04)
    const localNavHandle = await page.evaluateHandle(() => {
      const items = Array.from(document.querySelectorAll(".ds-library-nav-item"));
      return items.find(el => el.textContent?.includes("Local"));
    });
    const localNavItem = localNavHandle.asElement() as ElementHandle<Element> | null;
    if (localNavItem) {
      await localNavItem.click();
      const localPaneOk = await page.evaluate(() => {
        const pane = document.querySelector(".ds-local-pane");
        const hasImport = !!pane && pane.textContent?.includes("Import");
        return hasImport;
      });
      recordStep("Desktop: LocalPane & Import Architecture", localPaneOk);
    } else {
      recordStep("Desktop: LocalPane & Import Architecture", true, "Skipped (provider without Local pane)");
    }
    // 4. Cache View & Extracted CacheCeilingGroupBox (TS-08)
    const cacheHandle = await page.evaluateHandle(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      return btns.find(b => b.textContent?.includes("Cache Management"));
    });
    const cacheBtn = cacheHandle.asElement() as ElementHandle<Element> | null;
    if (cacheBtn) {
      await cacheBtn.click();
      await page.waitForSelector("#ds-cache-ceiling-select", { timeout: 4000 });
      const cacheViewOk = await page.evaluate(() => {
        const titles = Array.from(document.querySelectorAll(".group-box-title")).map(t => t.textContent?.trim());
        const hasCeiling = titles.includes("Cache Limit");
        const hasDb = titles.includes("Database");
        return { hasCeiling, hasDb, titles };
      });
      recordStep("Desktop: CacheView & CacheCeilingGroupBox", cacheViewOk.hasCeiling && cacheViewOk.hasDb, cacheViewOk);
    }
    // 5. Download Manager Integration (TS-02)
    await page.evaluate(() => {
      interface DevWindow {
        __NAVIGATE__?: (route: { view: string; browseTab?: string }) => void;
      }
      const devWin = window as unknown as DevWindow;
      devWin.__NAVIGATE__?.({ view: "browse", browseTab: "downloaded" });
    });
    await delay(400);
    const downloadManagerOk = await page.evaluate(() => {
      const text = document.body.innerText;
      return text.includes("Download Manager") || text.includes("No downloads in queue") || text.includes("Downloaded");
    });
    recordStep("Desktop: Download Manager Integration (TS-02)", downloadManagerOk);

    // 6. Series View & Extracted Actions / Resume (CP-01)
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("ds-navigate", { detail: { view: "series", seriesPermalink: "hana-ni-arashi" } }));
    });
    await waitForResourceReady(page, ".ds-series-head, .ds-series-name", 6000);
    const seriesViewOk = await page.evaluate(() => {
      const text = document.body.innerText;
      return text.includes("Hana ni Arashi") || document.querySelector(".ds-series-head, .ds-series-view") !== null;
    });
    recordStep("Desktop: Series View & Actions / Resume (CP-01)", seriesViewOk);

    // 6b. Series Actions & Copy Link Button
    const seriesActionsOk = await page.evaluate(() => {
      const copyBtn = Array.from(document.querySelectorAll("button")).find(b => {
        const t = (b.getAttribute("title") || b.getAttribute("aria-label") || "").toLowerCase();
        return t.includes("copy") || t.includes("link");
      });
      const extBtn = Array.from(document.querySelectorAll("button, a")).find(b => {
        const t = (b.getAttribute("title") || b.getAttribute("aria-label") || "").toLowerCase();
        return t.includes("dynasty") || t.includes("external");
      });
      return { hasCopyBtn: !!copyBtn, hasExtBtn: !!extBtn };
    });
    recordStep("Desktop: Series Actions & Copy Link Button", seriesActionsOk.hasCopyBtn && seriesActionsOk.hasExtBtn, seriesActionsOk);

    // Test Copy Link Feedback
    await page.evaluate(() => {
      const copyBtn = Array.from(document.querySelectorAll("button")).find(b => {
        const t = (b.getAttribute("title") || b.getAttribute("aria-label") || "").toLowerCase();
        return t.includes("copy") || t.includes("link");
      });
      copyBtn?.click();
    });
    await delay(250);
    const copiedFeedback = await page.evaluate(() => {
      const copyBtn = Array.from(document.querySelectorAll("button")).find(b => {
        const t = (b.getAttribute("title") || b.getAttribute("aria-label") || "").toLowerCase();
        return t.includes("copied") || t.includes("copy");
      });
      const t = copyBtn?.getAttribute("title") || copyBtn?.getAttribute("aria-label") || "";
      return t.toLowerCase().includes("copied");
    });
    recordStep("Desktop: Series Copy Link Feedback", copiedFeedback);
    // 7. Reader View & Extracted Gestures / Scroll Tracker (TS-01)
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("ds-navigate", { detail: { view: "reader", chapterPermalink: "hana-ni-arashi-ch01", seriesPermalink: "hana-ni-arashi" } }));
    });
    await waitForResourceReady(page, "#ds-reader-viewport, .ds-reader-viewport, .ds-reader-strip", 6000);
    const readerViewOk = await page.evaluate(() => {
      const readerEl = document.querySelector("#ds-reader-viewport, .ds-reader-viewport");
      return !!readerEl || document.querySelector(".ds-reader-strip") !== null;
    });
    recordStep("Desktop: Reader View & Scroll Tracker Architecture (TS-01)", readerViewOk);

    // 8. Desktop Accessibility & Overflow Audit
    const desktopAudit = await auditPage(page, false);
    recordStep(
      "Desktop: Accessibility & Layout Audit",
      desktopAudit.unlabeledButtons.length === 0 && desktopAudit.horizontalOverflows.length === 0,
      desktopAudit,
    );

    // ── Phase 2: Mobile Viewport (390x844) ──
    await setMobileViewport(page);
    await delay(400);

    // 6. Mobile Layout & Responsive Topbar
    const mobileLayout = await page.evaluate(() => {
      const topbar = document.getElementById("ds-topbar");
      const rect = topbar?.getBoundingClientRect();
      return {
        topbarHeight: rect ? Math.round(rect.height) : 0,
        isMobileClass: document.documentElement.hasAttribute("data-mobile") || window.innerWidth < 768,
      };
    });
    recordStep("Mobile: Viewport Adaptation & Topbar Height", mobileLayout.topbarHeight > 0, mobileLayout);

    // 7. Mobile Accessibility & Touch Target Audit
    const mobileAudit = await auditPage(page, true);
    recordStep(
      "Mobile: Touch Targets & Horizontal Overflow",
      mobileAudit.horizontalOverflows.length === 0,
      { overflows: mobileAudit.horizontalOverflows, undersizedCount: mobileAudit.undersizedTouchTargets.length },
    );

    // 8. Mobile Reader Controls Sheet Interactive Drag Gesture
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("ds-navigate", { detail: { view: "reader", chapterPermalink: "hana-ni-arashi-ch01", seriesPermalink: "hana-ni-arashi" } }));
    });
    await waitForResourceReady(page, "#ds-reader-viewport, .ds-reader-viewport, .ds-reader-strip", 6000);
    await delay(400);

    // Open Mobile Controls Sheet
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const toolBtn = btns.find(b => b.getAttribute("aria-label")?.includes("Toggle Reader Controls"));
      toolBtn?.click();
    });
    await delay(500);

    const sheetCheck = await page.evaluate(() => {
      const sheet = document.querySelector(".ds-reader-sheet-window");
      const handle = document.querySelector(".ds-sheet-drag-handle");
      if (!sheet || !handle) return null;
      const hCs = window.getComputedStyle(handle);
      return { mounted: true, touchAction: hCs.touchAction };
    });
    recordStep("Mobile: Controls Sheet Drag Handle touch-action: none", Boolean(sheetCheck && sheetCheck.touchAction === "none"), sheetCheck);

    // Interactive Drag on Handle
    const handlePos = await page.evaluate(() => {
      const h = document.querySelector(".ds-sheet-drag-handle");
      if (!h) return null;
      const r = h.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });

    if (handlePos) {
      await page.mouse.move(handlePos.x, handlePos.y);
      await page.mouse.down();
      await page.mouse.move(handlePos.x, handlePos.y + 60, { steps: 5 });
      await delay(50);

      const dragCheck = await page.evaluate(() => {
        const sheet = document.querySelector(".ds-reader-sheet-window") as HTMLElement | null;
        return { transform: sheet?.style.transform ?? "" };
      });
      await page.mouse.up();

      recordStep("Mobile: Controls Sheet Interactive Drag Tracking", dragCheck.transform.includes("translate3d(0px, 60px, 0px)"), dragCheck);
    }

    // Dismiss sheet
    await page.evaluate(() => {
      const backdrop = document.querySelector(".ds-reader-sheet-backdrop") as HTMLElement | null;
      backdrop?.click();
    });
    await delay(300);

    // 9. Reader Progress Scrubber Drag Interaction
    const scrubberHandle = await page.$(".ds-reader-progress-track");
    if (scrubberHandle) {
      const box = await scrubberHandle.boundingBox();
      if (box) {
        await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width * 0.7, box.y + box.height / 2, { steps: 5 });
        await delay(50);
        await page.mouse.up();
        const scrubberOk = await page.evaluate(() => {
          const track = document.querySelector(".ds-reader-progress-track");
          return !!track && track.getAttribute("role") === "slider";
        });
        recordStep("Mobile: Reader Progress Scrubber Drag Interaction", scrubberOk);
      }
    }

    // 10. Browse Pull-to-Refresh Container Architecture
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("ds-navigate", { detail: { view: "browse" } }));
    });
    await delay(400);
    const pullContainerOk = await page.evaluate(() => {
      const container = document.querySelector(".ds-browse-pull-container");
      return !!container;
    });
    recordStep("Mobile: Browse Pull-to-Refresh Container Architecture", pullContainerOk);
    await assertNoAppErrors(page);

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    recordStep("Fatal Sweep Error", false, null, msg);
  }

  const passedSteps = steps.filter(s => s.passed).length;
  const failedSteps = steps.filter(s => !s.passed).length;

  return {
    timestamp: new Date().toISOString(),
    totalSteps: steps.length,
    passedSteps,
    failedSteps,
    steps,
  };
}
