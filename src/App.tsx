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
 * remounts per route. Until a view is ported, `viewComponents` maps every view
 * to the `<LegacyView>` strangler adapter.
 */

import { createEffect, lazy, Show, Suspense, type Component } from "solid-js";
import { Dynamic } from "solid-js/web";
import {
  route,
  routeTitle,
  setTitle,
  uiScale,
  isPersistentView,
} from "./stores";
import { Topbar } from "./components/Topbar";
import { UpdateDialog } from "./components/UpdateDialog";
import { GlobalShortcuts } from "./hotkeys";
import { BrowseView } from "./browse/BrowseView";
import { LibraryView } from "./library/LibraryView";
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

  return (
    <div id="ds-root" style={{ zoom: String(uiScale()) }}>
      <GlobalShortcuts />
      <Topbar />
      <UpdateDialog />
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
              <div id="ds-pane-dynamic">
                <Suspense fallback={<div class="ds-pane-loading" style="padding:20px;text-align:center;"><span class="ds-muted" style="font-size:11px;">Loading...</span></div>}>
                  <Dynamic component={viewComponents[route().view]} route={route()} />
                </Suspense>
              </div>
            ) : null
          }
        </Show>
      </div>
    </div>
  );
}