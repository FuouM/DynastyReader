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

import { createEffect, Show, type Component } from "solid-js";
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
import { BrowseView } from "./browse/BrowseView";
import { LibraryView } from "./library/LibraryView";
import { SeriesView } from "./series/SeriesView";
import { ReaderView } from "./reader/ReaderView";
import { CacheView } from "./cache/CacheView";
import { BlacklistView } from "./blacklist/BlacklistView";
import type { ViewName, Route } from "./types/routes";

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
                <Dynamic component={viewComponents[route().view]} route={route()} />
              </div>
            ) : null
          }
        </Show>
      </div>
    </div>
  );
}