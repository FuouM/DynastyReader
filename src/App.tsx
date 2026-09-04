/**
 * Solid app shell for the dynasty-scans plugin. Port of `src/index.ts` +
 * `src/router.ts` persistent-pane routing:
 *
 *   #app
 *     └─ #ds-root (zoom bound to uiScale)
 *          ├─ <Topbar/>
 *          └─ #ds-view
 *               ├─ #ds-pane-browse   (persistent)
 *               ├─ #ds-pane-library  (persistent)
 *               └─ #ds-pane-dynamic  (reader / series / cache / blacklist)
 *
 * Persistent panes keep their DOM alive across tab switches; the dynamic pane
 * remounts per route.
 */

import { createEffect, lazy, onCleanup, onMount, Show, Suspense, type Component } from "solid-js";
import { Dynamic } from "solid-js/web";
import { makeEventListener } from "@solid-primitives/event-listener";
import {
  route,
  routeTitle,
  setTitle,
  navigate,
  uiScale,
  isPersistentView,
  isMobile,
  canGoBack,
  goBack,
} from "./stores";
import { Topbar } from "./components/Topbar";
import { BottomNav } from "./components/BottomNav";
import { GlobalShortcuts } from "./hotkeys";
import { BrowseView } from "./browse/BrowseView";
import { LibraryView } from "./library/LibraryView";
import { Loading } from "./components/Loading";
import { t } from "./i18n";
import type { ViewName, Route } from "./types/routes";
import { isHideStatusBarEnabled } from "./reader/settings";
import { syncReaderStatusBar } from "./utils/status-bar";

const SeriesView = lazy(() => import("./series/SeriesView").then((m) => ({ default: m.SeriesView })));
const ReaderView = lazy(() => import("./reader/ReaderView").then((m) => ({ default: m.ReaderView })));
const CacheView = lazy(() => import("./cache/CacheView").then((m) => ({ default: m.CacheView })));
const BlacklistView = lazy(() => import("./blacklist/BlacklistView").then((m) => ({ default: m.BlacklistView })));
export const viewComponents: Record<ViewName, Component<{ route: Route }>> = {
  browse: () => <BrowseView />,
  library: () => <LibraryView />,
  series: () => <SeriesView />,
  reader: (p) => <ReaderView route={p.route} />,
  cache: () => <CacheView />,
  blacklist: () => <BlacklistView />,
};

export function App() {
  createEffect(() => {
    const r = route();
    setTitle(routeTitle(r));
  });

  createEffect(() => {
    const mob = isMobile();
    if (mob) {
      document.documentElement.dataset.mobile = "1";
      document.body.dataset.mobile = "1";
    } else {
      delete document.documentElement.dataset.mobile;
      delete document.body.dataset.mobile;
    }
  });

  createEffect(() => {
    const inReader = route().view === "reader";
    const hidePref = isHideStatusBarEnabled();
    syncReaderStatusBar(inReader, hidePref);
  });

  onCleanup(() => {
    syncReaderStatusBar(false, false);
  });

  onMount(() => {
    makeEventListener(window, "popstate", (ev: PopStateEvent) => {
      ev.preventDefault();
      if (canGoBack()) goBack();
    });
    makeEventListener(window, "t-back-button", (ev: Event) => {
      ev.preventDefault();
      if (canGoBack()) goBack();
    });
    makeEventListener(document, "backbutton", (ev: Event) => {
      ev.preventDefault();
      if (canGoBack()) goBack();
    });
    makeEventListener(window, "ds-navigate", (ev: Event) => {
      const customEv = ev as CustomEvent<Route>;
      if (customEv.detail) {
        navigate(customEv.detail);
      }
    });
  });
  return (
    <div
      id="ds-root"
      data-mobile={isMobile() ? "1" : undefined}
      style={{
        ...(uiScale() !== 1.0 ? { zoom: String(uiScale()) } : {}),
        "--ds-ui-scale": String(uiScale()),
      }}
    >
      <GlobalShortcuts />
      <a href="#ds-main-content" class="ds-skip-link">{t("common.skipToContent")}</a>
      <Topbar />
      <main id="ds-main-content" tabIndex={-1}>
      <div id="ds-view">
        <div id="ds-pane-browse" classList={{ "ds-pane-hidden": route().view !== "browse" }}>
          <Dynamic component={viewComponents.browse} route={route()} />
        </div>
        <div id="ds-pane-library" classList={{ "ds-pane-hidden": route().view !== "library" }}>
          <Dynamic component={viewComponents.library} route={route()} />
        </div>
        <Show when={!isPersistentView()} keyed>
          {(show) =>
            show ? (
              <div id="ds-pane-dynamic" classList={{ "ds-pane-dynamic--reader": route().view === "reader" }}>
                <Suspense fallback={<Loading />}>
                  <Dynamic component={viewComponents[route().view]} route={route()} />
                </Suspense>
              </div>
            ) : null
          }
        </Show>
      </div>
      </main>
      <BottomNav />
    </div>
  );
}