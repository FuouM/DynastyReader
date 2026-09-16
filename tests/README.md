# DynastyReader UI Testing & Browser Sweep Harness

Lightweight browser testing suite designed for headless Chromium via the OMP `browser` tool. Exercises frontend views, reactive components, responsive layouts, and accessibility without external runner dependencies.

---

## Quickstart

Run these steps within an evaluation cell:

### 1. Start Vite Server (Windows Win32)
Always spawn via `cmd /c` to prevent PE shim error 193:
```js
await hub({
  op: "start",
  name: "vite",
  application: "cmd",
  args: ["/c", "npm run dev"],
  ready: { log: "Local:", timeout: 30 }
});
```

### 2. Execute 10-Step Browser Sweep
```js
const tab = await browser.open({ name: "sweep", url: "http://localhost:1420/" });

const report = await tab.run(async ({ page }) => {
  const { runBrowserSweep } = await import("./tests/suite");
  return await runBrowserSweep(page);
});

display(report);
```

### 3. Teardown
```js
await browser.close({ all: true });
await hub({ op: "stop", name: "vite" });
```

---

## Architecture & Directory Structure

```
tests/
├── README.md               # This document
├── index.ts                # Barrel export
├── suite.ts                # 10-step browser sweep implementation
├── browser-helpers.ts      # Viewport drivers & accessibility/overflow auditors
└── fixtures/
    ├── mock-data.ts        # Mock series, chapters, progress, bookmarks, queue
    └── mock-bridge.ts      # Mock IPC bridge definition
public/
└── mock-bridge.js          # Synchronous stub injected in index.html for standard browser runs
```

### Mock IPC Bridge (`public/mock-bridge.js`)
Outside the native Tauri WebView, `window.__TAURI_INTERNALS__` is absent. `public/mock-bridge.js` stubs:
- `dbExecute` / `dbExecuteBatch`: Returns `{ rows_affected: 1, last_insert_rowid: 1 }`.
- `dbQuery`: Returns mock rows or aggregate `COUNT(*)` objects for cache calculations.
- `httpGet`: Returns mock Dynasty Scans JSON objects for `/series/` and `/chapters/`.
- `getDownloadQueue`: Returns mock download items with active and queued progress.

**Safety Guard:**
```js
if (typeof window === "undefined" || (window.__TAURI_INTERNALS__ && !window.__TAURI_IS_MOCK__)) return;
```
Desktop Tauri and Android WebView builds inject `__TAURI_INTERNALS__` before HTML execution, ensuring native builds remain completely unaffected.

---

## Available Driver & Audit Helpers (`tests/browser-helpers.ts`)

- `setDesktopViewport(page)`: Sets viewport to 1280×800.
- `setMobileViewport(page)`: Sets viewport to 390×844 with `isMobile: true, hasTouch: true`.
- `auditPage(page, isMobile)`: Returns a structured report checking:
  - **Unlabeled Buttons:** Buttons lacking visible text, `title`, and `aria-label`.
  - **Unlabeled Inputs:** Form controls without associated `<label>` or `aria-label`.
  - **Horizontal Overflows:** Elements where `scrollWidth > clientWidth + 2`.
  - **Touch Targets:** (Mobile only) Interactive elements with bounds `< 28px`.

---

## Verification Commands

When modifying UI components or tests, always run the project verification trifecta:
1. TypeScript: `npx.cmd tsc --noEmit --skipLibCheck`
2. Production Bundler: `npx.cmd vite build`
3. Rust Backend: Local Cargo tests via `.rust/.cargo/bin/cargo.exe`
