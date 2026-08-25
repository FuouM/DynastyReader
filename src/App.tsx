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
import {
  route,
  routeTitle,
  setTitle,
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
import type { ViewName, Route } from "./types/routes";

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

  onMount(() => {
    // Handle Android hardware/system back button and popstate events
    const handlePopState = (ev: PopStateEvent) => {
      ev.preventDefault();
      if (canGoBack()) {
        goBack();
      }
    };

    const handleBackButton = (ev: Event) => {
      ev.preventDefault();
      if (canGoBack()) {
        goBack();
      }
    };

    window.addEventListener("popstate", handlePopState);
    window.addEventListener("t-back-button", handleBackButton);
    document.addEventListener("backbutton", handleBackButton);

    onCleanup(() => {
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("t-back-button", handleBackButton);
      document.removeEventListener("backbutton", handleBackButton);
    });
  });

  return (
    <div
      id="ds-root"
      data-mobile={isMobile() ? "1" : undefined}
      style={{ zoom: String(uiScale()) }}
    >
      <GlobalShortcuts />
      <Topbar />
      <div id="ds-view">
        <div
          id="ds-pane-browse"
          style={{ display: route().view === "browse" ? "flex" : "none" }}
        >
          <Dynamic component={viewComponents.browse} route={route()} />
        </div>
        <div
          id="ds-pane-library"
          style={{ display: route().view === "library" ? "flex" : "none" }}
        >
          <Dynamic component={viewComponents.library} route={route()} />
        </div>
        <Show when={!isPersistentView()} keyed>
          {(show) =>
            show ? (
              <div
                id="ds-pane-dynamic"
                style={{
                  padding: route().view === "reader" ? "0" : "8px",
                  overflow: route().view === "reader" ? "hidden" : "auto",
                }}
              >
                <Suspense fallback={<Loading />}>
                  <Dynamic component={viewComponents[route().view]} route={route()} />
                </Suspense>
              </div>
            ) : null
          }
        </Show>
      </div>
      <BottomNav />
    </div>
  );
}