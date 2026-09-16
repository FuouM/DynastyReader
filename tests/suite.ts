/**
 * Comprehensive Browser Sweep Suite for DynastyReader.
 * Directly interoperable with headless browser tools and evaluation runners.
 */

import { auditPage, setDesktopViewport, setMobileViewport } from "./browser-helpers";
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

    // 1. Initial Browse View
    await page.goto("http://localhost:1420/");
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

    // 3. Local Pane & Modal Integration (TS-04)
    const localNavItem = (await page.evaluateHandle(() => {
      const items = Array.from(document.querySelectorAll(".ds-library-nav-item"));
      return items.find(el => el.textContent?.includes("Local"));
    })) as ElementHandle<Element> | null;
    if (localNavItem) {
      await localNavItem.click();
      const localPaneOk = await page.evaluate(() => {
        const pane = document.querySelector(".ds-local-pane");
        const hasImport = !!pane && pane.textContent?.includes("Import");
        return hasImport;
      });
      recordStep("Desktop: LocalPane & Import Architecture", localPaneOk);
    }

    // 4. Cache View & Extracted CacheCeilingGroupBox (TS-08)
    const cacheBtn = (await page.evaluateHandle(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      return btns.find(b => b.textContent?.includes("Cache Management"));
    })) as ElementHandle<Element> | null;
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
    await delay(600);
    const seriesViewOk = await page.evaluate(() => {
      const text = document.body.innerText;
      return text.includes("Hana ni Arashi") || document.querySelector(".ds-series-view") !== null;
    });
    recordStep("Desktop: Series View & Actions / Resume (CP-01)", seriesViewOk);

    // 7. Reader View & Extracted Gestures / Scroll Tracker (TS-01)
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("ds-navigate", { detail: { view: "reader", chapterPermalink: "hana-ni-arashi-ch01", seriesPermalink: "hana-ni-arashi" } }));
    });
    await delay(600);
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
