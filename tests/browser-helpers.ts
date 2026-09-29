/**
 * Driver utilities and audit inspectors for browser sweeps and UI testing.
 */

import type { Page } from "puppeteer-core";
import { getMockBridgeCode } from "./fixtures/mock-bridge";

export interface ViewportAuditResult {
  unlabeledButtons: Array<{ text: string; className: string; id: string }>;
  unlabeledInputs: Array<{ id: string; className: string; placeholder: string }>;
  horizontalOverflows: Array<{ selector: string; scrollWidth: number; clientWidth: number }>;
  undersizedTouchTargets: Array<{ text: string; className: string; width: number; height: number }>;
}

export async function setDesktopViewport(page: Page): Promise<void> {
  await page.setViewport({ width: 1280, height: 800 });
}

export async function setMobileViewport(page: Page): Promise<void> {
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
}

export async function injectMockBridge(page: Page): Promise<void> {
  const code = getMockBridgeCode();
  await page.evaluate(code);
}

/**
 * Scans page for common UI/UX, responsive, and accessibility defects.
 */
export async function auditPage(page: Page, isMobile = false): Promise<ViewportAuditResult> {
  return await page.evaluate((mobileCheck: boolean) => {
    const unlabeledButtons: Array<{ text: string; className: string; id: string }> = [];
    const unlabeledInputs: Array<{ id: string; className: string; placeholder: string }> = [];
    const horizontalOverflows: Array<{ selector: string; scrollWidth: number; clientWidth: number }> = [];
    const undersizedTouchTargets: Array<{ text: string; className: string; width: number; height: number }> = [];

    // 1. Unlabeled buttons
    const buttons = Array.from(document.querySelectorAll("button")).filter(b => b.offsetParent !== null);
    for (const b of buttons) {
      const text = b.innerText?.trim() || "";
      const ariaLabel = b.getAttribute("aria-label")?.trim() || "";
      const title = b.getAttribute("title")?.trim() || "";
      if (!text && !ariaLabel && !title) {
        unlabeledButtons.push({ text: "(empty)", className: b.className, id: b.id });
      }

      // Touch target size check on mobile
      if (mobileCheck) {
        const rect = b.getBoundingClientRect();
        // Allow tiny close/tag chips or inline icons to be smaller if explicitly styled,
        // but flag main action buttons < 30px
        if (rect.width > 0 && rect.height > 0 && (rect.width < 28 || rect.height < 28)) {
          undersizedTouchTargets.push({
            text: text || ariaLabel || title || b.className,
            className: b.className,
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          });
        }
      }
    }

    // 2. Unlabeled inputs
    const inputs = Array.from(document.querySelectorAll<HTMLElement>("input, select, textarea")).filter(i => i.offsetParent !== null);
    for (const input of inputs) {
      const ariaLabel = input.getAttribute("aria-label")?.trim() || "";
      const ariaLabelledBy = input.getAttribute("aria-labelledby")?.trim() || "";
      const title = input.getAttribute("title")?.trim() || "";
      const id = input.id;
      const hasLabel = id ? !!document.querySelector(`label[for="${id}"]`) : false;
      const hasParentLabel = !!input.closest("label");

      if (!ariaLabel && !ariaLabelledBy && !title && !hasLabel && !hasParentLabel) {
        unlabeledInputs.push({
          id: input.id,
          className: input.className,
          placeholder: input.getAttribute("placeholder") || "",
        });
      }
    }

    // 3. Horizontal overflows
    const scrollContainers = Array.from(document.querySelectorAll("body, #app, .ds-subtabs, .ds-topbar, main, .ds-reader-strip"));
    for (const el of scrollContainers) {
      if (el.scrollWidth > el.clientWidth + 2) {
        // Strip reader in horizontal mode is expected to scroll horizontally
        if (el.classList.contains("ds-reader-strip")) continue;
        horizontalOverflows.push({
          selector: el.id ? `#${el.id}` : el.className,
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
        });
      }
    }

    return {
      unlabeledButtons,
      unlabeledInputs,
      horizontalOverflows,
      undersizedTouchTargets,
    };
  }, isMobile);
}

export interface CapturedLogEntry {
  type: "error" | "warn" | "uncaught" | "unhandled";
  text: string;
  time: number;
}

/**
 * Injects an in-page trap capturing console.error, console.warn, uncaught exceptions,
 * and unhandled promise rejections directly in the window context.
 */
export async function initInPageLogTrap(page: Page): Promise<void> {
  await page.evaluate(() => {
    interface LogWindow extends Window {
      __CAPTURED_LOGS__?: CapturedLogEntry[];
    }
    const win = window as LogWindow;
    win.__CAPTURED_LOGS__ = [];
    const origErr = console.error;
    const origWarn = console.warn;
    console.error = (...args: unknown[]) => {
      win.__CAPTURED_LOGS__?.push({ type: "error", text: args.map(String).join(" "), time: Date.now() });
      origErr(...args);
    };
    console.warn = (...args: unknown[]) => {
      win.__CAPTURED_LOGS__?.push({ type: "warn", text: args.map(String).join(" "), time: Date.now() });
      origWarn(...args);
    };
    window.addEventListener("error", (e) => {
      win.__CAPTURED_LOGS__?.push({ type: "uncaught", text: e.message || String(e), time: Date.now() });
    });
    window.addEventListener("unhandledrejection", (e) => {
      win.__CAPTURED_LOGS__?.push({ type: "unhandled", text: String(e.reason), time: Date.now() });
    });
  });
}

/** Retrieves all fatal or unexpected app errors captured by the in-page trap. */
export async function getCapturedAppErrors(page: Page): Promise<CapturedLogEntry[]> {
  return await page.evaluate(() => {
    interface LogWindow extends Window {
      __CAPTURED_LOGS__?: CapturedLogEntry[];
    }
    const win = window as LogWindow;
    const logs = win.__CAPTURED_LOGS__ ?? [];
    return logs.filter((l) => l.type === "error" || l.type === "uncaught" || l.type === "unhandled");
  });
}

/** Asserts that zero fatal console errors or unhandled rejections occurred during execution. */
export async function assertNoAppErrors(page: Page): Promise<void> {
  const errors = await getCapturedAppErrors(page);
  if (errors.length > 0) {
    const details = errors.map((e) => `[${e.type.toUpperCase()}] ${e.text}`).join("\n");
    throw new Error(`Application emitted unexpected errors during test:\n${details}`);
  }
}

/**
 * Semantically waits for SolidJS resource loading spinners to complete
 * and the target selector to become visible in the DOM.
 */
export async function waitForResourceReady(page: Page, targetSelector: string, timeoutMs = 8000): Promise<void> {
  await page.waitForFunction(
    (sel: string) => {
      const hasSpinner = !!document.querySelector(".ds-loading, .ds-spinner");
      const target = document.querySelector(sel);
      return !hasSpinner && target instanceof HTMLElement && target.offsetParent !== null;
    },
    { timeout: timeoutMs },
    targetSelector,
  );
}
