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
  isMobile,
} from "./stores";
import { Topbar } from "./components/Topbar";
import { BottomNav } from "./components/BottomNav";
import { UpdateDialog } from "./components/UpdateDialog";
import { GlobalShortcuts } from "./hotkeys";
import { BrowseView } from "./browse/BrowseView";
import { LibraryView } from "./library/LibraryView";
import type { ViewName, Route } from "./types/routes";

import { SeriesView } from "./series/SeriesView";
import { ReaderView } from "./reader/ReaderView";
import { CacheView } from "./cache/CacheView";
import { BlacklistView } from "./blacklist/BlacklistView";
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
    <div
      id="ds-root"
      data-mobile={isMobile() ? "1" : undefined}
      style={{ zoom: isMobile() ? "1" : String(uiScale()) }}
    >
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
              <div
                id="ds-pane-dynamic"
                style={{
                  padding: route().view === "reader" ? "0" : "8px",
                  overflow: route().view === "reader" ? "hidden" : "auto",
                }}
              >
                <Dynamic component={viewComponents[route().view]} route={route()} />
              </div>
            ) : null
          }
        </Show>
      </div>
      <BottomNav />
    </div>
  );
}